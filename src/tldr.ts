import Anthropic from '@anthropic-ai/sdk';
import type { Cluster } from './cluster.js';

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You write the "What You Need to Adopt" TL;DR for a daily digest aimed at a senior engineer who lives in Claude Code. The reader has no time for hype.

Pick 3-5 items ONLY if they represent:
- A new model or model version worth trying today (name it: GPT-5.5, Claude Opus X, Gemini, Llama, etc.)
- A new tool, feature, MCP server, or CLI update they can install or enable
- A pricing / usage-limit change that affects their daily workflow
- A concrete technique or pattern backed by a release or repo they can clone

Never include market, business, policy, or opinion stories in the TL;DR.
Each bullet: one tight line (<= 130 chars), starts with the concrete thing, then what action or fact matters.

If fewer than 3 items are genuinely adopt-worthy, output fewer bullets — do not pad.
Output strict JSON only.`;

export type Tldr = { bullets: string[] };

export async function buildTldr(clusters: Cluster[]): Promise<Tldr | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const lines = clusters
    .slice(0, 15)
    .map((c, i) => {
      const h = c.primary.llmHeadline || c.primary.title;
      const s = c.primary.llmSummary || c.primary.summary || '';
      const why = c.primary.llmWhy || '';
      const sources = Array.from(new Set(c.items.map(it => it.source))).join('/');
      return `${i + 1}. [${sources}] ${h}\n   ${s.slice(0, 200)}\n   WHY: ${why.slice(0, 160)}`;
    })
    .join('\n');
  const client = new Anthropic();
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: `Candidates for today. Pick ONLY adopt-worthy items (new models, tools, features, releases, techniques). Skip anything whose WHY starts with "Skip". Return strict JSON: {"bullets": ["...", "..."]}. No markdown outside bullet text.\n\n${lines}`,
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
