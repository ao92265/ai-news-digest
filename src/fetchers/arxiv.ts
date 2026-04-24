import { fetchRss } from './rss.js';
import type { Item } from '../types.js';

export async function fetchArxiv(weight: number): Promise<Item[]> {
  const items = await fetchRss('arXiv cs.AI', 'http://export.arxiv.org/rss/cs.AI', 'research', weight);
  return items.slice(0, 20);
}
