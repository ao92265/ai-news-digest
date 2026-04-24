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

const AI_RX = /\b(ai|llm|gpt|claude|gemini|openai|anthropic|agent|agents|neural|model|models|rag|prompt|transformer|diffusion|multimodal|chatgpt|deepseek|mistral|llama|embedding|inference|fine-?tune|alignment|mcp|copilot|cursor|aider|cline|codex)\b/i;

async function search(query: string, sinceSec: number, minPoints: number, attempt = 1): Promise<HnHit[]> {
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story&numericFilters=created_at_i>${sinceSec},points>${minPoints}&hitsPerPage=50`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HN ${res.status}`);
    const data = (await res.json()) as { hits: HnHit[] };
    return data.hits || [];
  } catch (err) {
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 500 * attempt));
      return search(query, sinceSec, minPoints, attempt + 1);
    }
    throw err;
  }
}

export async function fetchHn(weight: number): Promise<Item[]> {
  const since = Math.floor((Date.now() - 48 * 3600000) / 1000);
  // Split into general AI + Claude Code/tooling queries. Tooling gets lower points floor
  // because niche dev posts rarely hit HN's front-page threshold.
  // allSettled so one flaky call doesn't kill the whole source.
  const results = await Promise.allSettled([
    search('AI', since, 30),
    search('claude code OR cursor OR copilot OR agent OR MCP', since, 5),
    search('claude OR anthropic', since, 5),
  ]);
  const hits: HnHit[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') hits.push(...r.value);
    else console.error(`  HN sub-query failed: ${r.reason?.message || r.reason}`);
  }
  const byId = new Map<string, HnHit>();
  for (const h of hits) byId.set(h.objectID, h);

  return Array.from(byId.values())
    .filter(h => h.title && AI_RX.test(h.title))
    .map((h): Item => {
      const link = h.url || `https://news.ycombinator.com/item?id=${h.objectID}`;
      // Boost items matching dev-tool keywords
      const title = (h.title || '').trim();
      const isDev = /\b(claude|anthropic|cursor|copilot|cline|aider|codex|agent|mcp)\b/i.test(title);
      return {
        id: sha256(link),
        title,
        url: link,
        source: 'Hacker News',
        category: 'community',
        publishedAt: new Date(h.created_at_i * 1000).toISOString(),
        summary: `${h.points ?? 0} points, ${h.num_comments ?? 0} comments`,
        weight: isDev ? weight * 1.4 : weight,
      };
    });
}
