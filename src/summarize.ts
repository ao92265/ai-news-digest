import Anthropic from '@anthropic-ai/sdk';
import type { Cluster } from './cluster.js';

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You curate a daily "what did I miss that I need to adopt" digest for a senior software engineer who uses Claude Code as their primary dev tool.

SUMMARIZE IN DETAIL only when the story is about:
- A new LLM model, version, or capability the reader should try (GPT-5.5, Claude Opus/Sonnet, Gemini, Llama, DeepSeek, etc.)
- A new or updated coding agent / IDE tool (Claude Code, Cursor, Copilot, Cline, Aider, Codex) — features, pricing changes, usage limits
- A new MCP server, agent framework, or dev-time LLM library
- A research result that changes how to build agents / prompt / fine-tune (new benchmark, eval, technique)
- A GitHub repo or SDK release worth installing/trying

DEMOTE (start why_it_matters with the literal word "Skip") when the story is about:
- Business/fundraising news, stock movements, earnings, deals, acquisitions
- Policy, regulation, geopolitics, lawsuits, industrial-scale AI theft
- Consumer AI products unrelated to dev work
- Opinion pieces, think-pieces, hype, "AI will change X" commentary
- Celebrity or human-interest AI stories

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
        content: `Summarize this story. Return strict JSON with keys:
- headline (short, specific, name the model/tool/capability)
- summary (two sentences, concrete — what is the thing, what changed, any number / capability / price)
- why_it_matters (one sentence — if adopt-worthy, what the reader should try or check; if not, start with the literal word "Skip" and briefly say why)

No markdown.

${ctx}`,
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
