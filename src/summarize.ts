import Anthropic from '@anthropic-ai/sdk';
import type { Cluster } from './cluster.js';

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You curate a daily "what did I miss that I need to adopt" digest for a senior software engineer who uses Claude Code as their primary dev tool.

SUMMARIZE IN DETAIL when the story is about ANY of these (be generous — the reader values practical content over polished press releases):
- A new LLM model, version, or capability the reader should try (GPT-5.5, Claude Opus/Sonnet, Gemini, Llama, DeepSeek, etc.)
- A new or updated coding agent / IDE tool (Claude Code, Cursor, Copilot, Cline, Aider, Codex) — features, pricing changes, usage limits, plugins, statuslines, subagents
- A new MCP server, agent framework, connector, or dev-time LLM library
- A research result that changes how to build agents / prompt / fine-tune (new benchmark, eval, technique)
- A GitHub repo or SDK release worth installing/trying — including curated lists ("awesome-X", "10 repos to master Y", subagent collections)
- Practical workflow, prompt pattern, config trick, or hard-won lesson from a real user (esp. Reddit/HN/Medium posts about Claude Code, Cursor, agents) — anything actionable a dev could copy
- Tutorials and how-to guides: "How to build X with Claude", "I built an AI employee", spec-driven dev, agent harnesses
- Comparison/review posts: "I tested every X plugin", "I tried DeepSeek v4 on Claude Code", "Claude vs Cursor for Y" — concrete try-it reports
- Production runbooks, security frameworks (OWASP Agentic Top 10), reliability patterns for LLM apps
- Long-form essays with technique payload (Karpathy-style, LLM wikis, research brain setups) — keep if there's a takeaway, not just opinion
- Usage limit / pricing / quota gotchas being discussed in community

DEMOTE (start why_it_matters with the literal word "Skip") when the story is about:
- Business/fundraising news, stock movements, earnings, deals, acquisitions, partnerships, IPOs
- Policy, regulation, geopolitics, lawsuits, industrial-scale AI theft
- Consumer AI products unrelated to dev work (image filters, chatbots for grandma)
- Pure hype with zero takeaway: "AI will change X", "the future of Y", vague predictions
- Celebrity or human-interest AI stories

When in doubt between SUMMARIZE and DEMOTE, prefer SUMMARIZE if a working dev could learn or try something concrete from it.

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

async function summarizeOne(client: Anthropic, c: Cluster, attempt = 1): Promise<Summary | null> {
  const ctx = c.items
    .slice(0, 3)
    .map(i => `[${i.source}] ${i.title}\n${i.summary || ''}`)
    .join('\n\n');
  try {
    return await callOnce(client, ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/429|rate_limit/i.test(msg) && attempt < 4) {
      const wait = 2000 * attempt + Math.random() * 500;
      await new Promise(r => setTimeout(r, wait));
      return summarizeOne(client, c, attempt + 1);
    }
    throw err;
  }
}

async function callOnce(client: Anthropic, ctx: string): Promise<Summary | null> {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 250,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: `Summarize this story as a one-line scannable digest entry. Return strict JSON with keys:
- headline (short, specific, <= 80 chars, name the concrete thing: model, tool, repo)
- summary (ONE short sentence, <= 140 chars, just what it is / what changed — no fluff, no "this is significant", no "users should know")
- why_it_matters (one short sentence OR the literal word "Skip" followed by a short reason if not adopt-worthy)

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
  // Anthropic default free tier = 50 req/min. Batch of 4 per 5s ≈ 48/min.
  const batchSize = 4;
  const batchDelayMs = 5000;
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
    if (i + batchSize < clusters.length) await new Promise(r => setTimeout(r, batchDelayMs));
  }
  return clusters;
}
