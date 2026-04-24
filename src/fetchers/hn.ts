import { sha256 } from '../hash.js';
import type { Item } from '../types.js';

type HnHit = {
  objectID: string;
  title?: string;
  url?: string;
  points?: number;
  num_comments?: number;
  created_at_i: number;
};

const AI_RX = /\b(ai|llm|gpt|claude|gemini|openai|anthropic|agent|agents|neural|model|models|rag|prompt|transformer|diffusion|multimodal|chatgpt|deepseek|mistral|llama|embedding|inference|fine-?tune|alignment)\b/i;

async function search(query: string, sinceSec: number, minPoints: number): Promise<HnHit[]> {
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story&numericFilters=created_at_i>${sinceSec},points>${minPoints}&hitsPerPage=50`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HN ${res.status}`);
  const data = (await res.json()) as { hits: HnHit[] };
  return data.hits || [];
}

export async function fetchHn(weight: number): Promise<Item[]> {
  const since = Math.floor((Date.now() - 48 * 3600000) / 1000);
  const [a, b] = await Promise.all([search('AI', since, 20), search('LLM', since, 15)]);
  const byId = new Map<string, HnHit>();
  for (const h of [...a, ...b]) byId.set(h.objectID, h);

  return Array.from(byId.values())
    .filter(h => h.title && AI_RX.test(h.title))
    .map((h): Item => {
      const link = h.url || `https://news.ycombinator.com/item?id=${h.objectID}`;
      return {
        id: sha256(link),
        title: (h.title || '').trim(),
        url: link,
        source: 'Hacker News',
        category: 'community',
        publishedAt: new Date(h.created_at_i * 1000).toISOString(),
        summary: `${h.points ?? 0} points, ${h.num_comments ?? 0} comments`,
        weight,
      };
    });
}
