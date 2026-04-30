import Parser from 'rss-parser';
import { sha256, stripHtml } from '../hash.js';
import type { Item } from '../types.js';

// RSSHub public instance — proxies Reddit RSS without IP-blocked datacenter
// requests hitting Reddit directly. Returns standard RSS XML.
const RSSHUB_BASE = process.env.RSSHUB_BASE || 'https://rsshub.app';

const parser = new Parser({
  timeout: 20000,
  headers: { 'User-Agent': 'ai-news-digest/0.1 (+github.com/aoreilly)' },
});

const SCORE_RX = /(\d+)\s*(?:points?|↑|score)/i;

async function fetchSub(sub: string, minScore: number, attempt = 1): Promise<Item[]> {
  const url = `${RSSHUB_BASE}/reddit/subreddit/${sub}/hot`;
  try {
    const feed = await parser.parseURL(url);
    return (feed.items || [])
      .map((it): Item | null => {
        const link = (it.link || it.guid || '').trim();
        const title = (it.title || '').trim();
        if (!link || !title) return null;
        const anyIt = it as Record<string, unknown>;
        const rawBody =
          it.contentSnippet ||
          it.content ||
          (typeof anyIt.description === 'string' ? (anyIt.description as string) : '') ||
          '';
        const body = stripHtml(rawBody);
        // RSSHub embeds score in description; if absent keep item (best effort).
        const m = body.match(SCORE_RX);
        const score = m ? parseInt(m[1], 10) : Infinity;
        if (score < minScore) return null;
        return {
          id: sha256(link),
          title,
          url: link,
          source: `r/${sub}`,
          category: 'community',
          publishedAt: it.isoDate || it.pubDate || new Date().toISOString(),
          summary: body.slice(0, 400),
          weight: 1.0,
        };
      })
      .filter((i): i is Item => i !== null);
  } catch (err) {
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 1000 * attempt));
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
    for (const it of r.value) items.push({ ...it, weight });
  });
  return items;
}
