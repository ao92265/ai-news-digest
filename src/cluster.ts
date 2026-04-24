import type { Item } from './types.js';

export type Cluster = { primary: Item; items: Item[]; score?: number };

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'into', 'about', 'after', 'over', 'says', 'will', 'have', 'more', 'than']);

function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOPWORDS.has(w))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export function cluster(items: Item[], threshold = 0.45): Cluster[] {
  const clusters: { tokens: Set<string>; cluster: Cluster }[] = [];
  for (const item of items) {
    const t = tokens(item.title);
    let match: Cluster | undefined;
    for (const c of clusters) {
      if (jaccard(c.tokens, t) >= threshold) {
        match = c.cluster;
        break;
      }
    }
    if (match) {
      match.items.push(item);
      if (item.weight > match.primary.weight) match.primary = item;
    } else {
      clusters.push({ tokens: t, cluster: { primary: item, items: [item] } });
    }
  }
  return clusters.map(c => c.cluster);
}
