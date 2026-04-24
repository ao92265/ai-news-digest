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
      // rss-parser maps fields inconsistently across RSS/Atom. Try every likely
      // body field, then strip HTML. Atom feeds (e.g. Simon Willison) put body
      // in `summary`; RSS in `contentSnippet`/`content`/`description`.
      const anyIt = it as Record<string, unknown>;
      const rawBody =
        it.contentSnippet ||
        it.content ||
        (typeof anyIt.summary === 'string' ? (anyIt.summary as string) : '') ||
        (typeof anyIt['content:encoded'] === 'string' ? (anyIt['content:encoded'] as string) : '') ||
        (typeof anyIt.description === 'string' ? (anyIt.description as string) : '') ||
        '';
      return {
        id: sha256(link),
        title,
        url: link,
        source: name,
        category,
        publishedAt: it.isoDate || it.pubDate || new Date().toISOString(),
        summary: stripHtml(rawBody),
        weight,
      };
    })
    .filter((i): i is Item => i !== null);
}
