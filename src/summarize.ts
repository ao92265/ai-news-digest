import Anthropic from '@anthropic-ai/sdk';
import type { Cluster } from './cluster.js';

const MODEL = 'claude-haiku-4-5-20251001';
const SYSTEM_PROMPT =
  'You summarize AI/tech news for a daily digest aimed at an AI practitioner and tech leader. Be concise and concrete. Never invent facts. Output strict JSON only.';

type Summary = { headline: string; summary: string; why_it_matters: string };

function parseSummary(text: string): Summary | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Partial<Summary>;
    if (!parsed.headline || !parsed.summary) return null;
    return {
      headline: String(parsed.headline),
      summary: String(parsed.summary),
      why_it_matters: String(parsed.why_it_matters ?? ''),
    };
  } catch {
    return null;
  }
}

async function summarizeOne(client: Anthropic, c: Cluster): Promise<Summary | null> {
  const ctx = c.items
    .slice(0, 3)
    .map(i => `[${i.source}] ${i.title}\n${i.summary || ''}`)
    .join('\n\n');
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: `Summarize this story for an AI practitioner. Return strict JSON with keys: headline (short, punchy, no clickbait), summary (two sentences), why_it_matters (one sentence). Do not wrap in markdown.\n\n${ctx}`,
      },
    ],
  });
  const block = resp.content[0];
  const text = block?.type === 'text' ? block.text : '';
  return parseSummary(text);
}

export async function summarizeAll(clusters: Cluster[]): Promise<Cluster[]> {
  const client = new Anthropic();
  const batchSize = 5;
  for (let i = 0; i < clusters.length; i += batchSize) {
    const batch = clusters.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(c => summarizeOne(client, c).catch(err => { console.error('summarize error:', err?.message); return null; }))
    );
    results.forEach((s, j) => {
      if (!s) return;
      const p = batch[j].primary;
      p.llmHeadline = s.headline;
      p.llmSummary = s.summary;
      p.llmWhy = s.why_it_matters;
    });
  }
  return clusters;
}
