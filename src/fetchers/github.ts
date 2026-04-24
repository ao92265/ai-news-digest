import { sha256 } from '../hash.js';
import type { Item } from '../types.js';

type Repo = {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  pushed_at: string;
  created_at: string;
};

async function searchTopic(topic: string): Promise<Repo[]> {
  const sinceDate = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const q = `topic:${topic} pushed:>${sinceDate} stars:>100`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=10`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ai-news-digest',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { items: Repo[] };
  return data.items || [];
}

export async function fetchGithubTrending(topics: string[], weight: number): Promise<Item[]> {
  const results = await Promise.allSettled(topics.map(t => searchTopic(t)));
  const byUrl = new Map<string, Repo>();
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      for (const repo of r.value) byUrl.set(repo.html_url, repo);
    } else {
      console.error(`  GitHub topic "${topics[i]}" failed: ${r.reason?.message}`);
    }
  });

  const youngCutoff = Date.now() - 365 * 86400000;
  const repos = Array.from(byUrl.values())
    .filter(r => new Date(r.created_at).getTime() > youngCutoff)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 15);

  return repos.map((r): Item => ({
    id: sha256(r.html_url),
    title: `${r.full_name} — ⭐ ${r.stargazers_count.toLocaleString()}`,
    url: r.html_url,
    source: 'GitHub Trending',
    category: 'code',
    publishedAt: r.pushed_at,
    summary: r.description || '',
    weight,
  }));
}
