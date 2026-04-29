import { sha256, stripHtml } from '../hash.js';
import type { Item } from '../types.js';

type RedditPost = {
  data: {
    id: string;
    title: string;
    selftext?: string;
    url?: string;
    permalink: string;
    score: number;
    num_comments: number;
    created_utc: number;
    over_18?: boolean;
    stickied?: boolean;
    is_self?: boolean;
  };
};

type RedditListing = {
  data: { children: RedditPost[] };
};

async function fetchSub(sub: string, minScore: number, attempt = 1): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${sub}/top.json?t=day&limit=30`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ai-news-digest/0.1 (by /u/aoreilly)' },
    });
    if (!res.ok) throw new Error(`Reddit r/${sub} ${res.status}`);
    const data = (await res.json()) as RedditListing;
    return (data.data?.children || []).filter(
      p => !p.data.stickied && !p.data.over_18 && p.data.score >= minScore,
    );
  } catch (err) {
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 800 * attempt));
      return fetchSub(sub, minScore, attempt + 1);
    }
    throw err;
  }
}

export async function fetchReddit(subs: string[], minScore: number, weight: number): Promise<Item[]> {
  const results = await Promise.allSettled(subs.map(s => fetchSub(s, minScore)));
  const items: Item[] = [];
  results.forEach((r, i) => {
    const sub = subs[i];
    if (r.status === 'rejected') {
      console.error(`  Reddit r/${sub} failed: ${r.reason?.message || r.reason}`);
      return;
    }
    for (const post of r.value) {
      const d = post.data;
      const link = d.is_self || !d.url ? `https://www.reddit.com${d.permalink}` : d.url;
      const title = d.title.trim();
      if (!link || !title) continue;
      const body = stripHtml(d.selftext || '').slice(0, 400);
      items.push({
        id: sha256(link),
        title,
        url: link,
        source: `r/${sub}`,
        category: 'community',
        publishedAt: new Date(d.created_utc * 1000).toISOString(),
        summary: body ? `${d.score}↑ ${d.num_comments}💬 — ${body}` : `${d.score}↑ ${d.num_comments}💬`,
        weight,
      });
    }
  });
  return items;
}
