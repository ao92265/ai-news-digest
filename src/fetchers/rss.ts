import Parser from 'rss-parser';
import { sha256, stripHtml } from '../hash.js';
import type { Category, Item } from '../types.js';

const parser = new Parser({ timeout: 15000, headers: { 'User-Agent': 'ai-news-digest/0.1 (+github.com/aoreilly)' } });

export async function fetchRss(name: string, url: string, category: Category, weight: number): Promise<Item[]> {
  const feed = await parser.parseURL(url);
  return (feed.items || [])
    .map((it): Item | null => {
      const link = (it.link || it.guid || '').trim();
      const title = (it.title || '').trim();
      if (!link || !title) return null;
      return {
        id: sha256(link),
        title,
        url: link,
        source: name,
        category,
        publishedAt: it.isoDate || it.pubDate || new Date().toISOString(),
        summary: stripHtml(it.contentSnippet || it.content || ''),
        weight,
      };
    })
    .filter((i): i is Item => i !== null);
}
