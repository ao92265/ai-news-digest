import Anthropic from '@anthropic-ai/sdk';
import type { Cluster } from './cluster.js';

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You write the TL;DR section of a daily AI/engineering digest for a senior engineer using Claude Code as their daily dev tool. Pick 3–5 most actionable or important items from the day. Prioritize: Claude Code/Anthropic releases, LLM coding tools changes, agent engineering breakthroughs, MCP ecosystem moves. Skip generic AI business news unless genuinely large. Each bullet: one tight line (<= 120 chars), concrete, action-oriented. Output strict JSON only.`;

export type Tldr = { bullets: string[] };

export async function buildTldr(clusters: Cluster[]): Promise<Tldr | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const lines = clusters
    .slice(0, 15)
    .map((c, i) => {
      const h = c.primary.llmHeadline || c.primary.title;
      const s = c.primary.llmSummary || c.primary.summary || '';
      const sources = Array.from(new Set(c.items.map(it => it.source))).join('/');
      return `${i + 1}. [${sources}] ${h} — ${s.slice(0, 160)}`;
    })
    .join('\n');
  const client = new Anthropic();
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: `Pick the top 3–5 items from today's candidates below and write each as one tight bullet. Return strict JSON: {"bullets": ["...", "..."]}. No markdown, no prose outside JSON.\n\n${lines}`,
      },
    ],
  });
  const block = resp.content[0];
  const text = block?.type === 'text' ? block.text : '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Partial<Tldr>;
    const bullets = Array.isArray(parsed.bullets) ? parsed.bullets.map(String).filter(Boolean) : [];
    return bullets.length ? { bullets } : null;
  } catch {
    return null;
  }
}
