import Anthropic from '@anthropic-ai/sdk';
import type { Cluster } from './cluster.js';

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You curate a daily AI/engineering news digest for a senior software engineer who uses Claude Code as a primary daily development tool.

Priority signal (surface + summarize with detail):
- Claude Code, Anthropic releases, MCP, tool-use, agent SDKs
- LLM coding tools (Cursor, Copilot, Cline, Aider, Codex) and their capability changes
- Code-generation research, agent engineering, evals
- Developer infrastructure, IDE plugins, dev-time LLM tooling

Lower priority (summarize briefly or deprioritize):
- General AI business news, fundraising, corporate deals
- Consumer AI products unrelated to dev work
- Policy/regulation unless directly engineering-impactful
- Generic "AI will change X" think-pieces

Be concise and concrete. Never invent facts. Output strict JSON only — no markdown, no prose outside JSON.`;

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
        content: `Summarize this story for the engineer described in the system prompt. Return strict JSON with keys: headline (short, specific, no clickbait), summary (two sentences focused on what changed and the concrete capability/fact), why_it_matters (one sentence — what a Claude Code user should do or note, e.g. "new MCP server worth trying", "paper relevant to agent design", or "skip unless you care about X"). Do not wrap in markdown.\n\n${ctx}`,
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
