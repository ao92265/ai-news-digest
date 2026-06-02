import fs from 'node:fs/promises';
import { sources as rawSources } from './sources.js';
import { fetchRss } from './fetchers/rss.js';
import { fetchHn } from './fetchers/hn.js';
import { fetchArxiv } from './fetchers/arxiv.js';
import { fetchGithubTrending } from './fetchers/github.js';
import { fetchReddit } from './fetchers/reddit.js';
import { fetchLocalFolder } from './fetchers/local-folder.js';
import { loadSeen, saveSeen } from './dedupe.js';
import { cluster, type Cluster } from './cluster.js';
import { render } from './render.js';
import { sendDigest } from './send.js';
import { writeSite } from './site.js';
import { applySourceTuning, updateTrends, getTrendingTopics, trendingBoost, crossCategoryBoost } from './learn.js';
import type { Item } from './types.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlySource = args.find(a => a.startsWith('--source='))?.split('=')[1];
const maxItems = Number(args.find(a => a.startsWith('--max='))?.split('=')[1] || 35);
const recencyHours = Number(args.find(a => a.startsWith('--hours='))?.split('=')[1] || 36);

function recencyBoost(iso: string): number {
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  return Math.max(0.3, 1 - h / 72);
}

async function fetchAll(sources: typeof rawSources): Promise<Item[]> {
  const jobs = sources.map(async src => {
    if (onlySource && src.name !== onlySource && src.kind !== onlySource) return [];
    switch (src.kind) {
      case 'rss': return fetchRss(src.name, src.url, src.category, src.weight);
      case 'hn': return fetchHn(src.weight);
      case 'arxiv': return fetchArxiv(src.weight);
      case 'github-trending': return fetchGithubTrending(src.topics, src.weight);
      case 'reddit': return fetchReddit(src.subs, src.minScore, src.weight);
      case 'local-folder': return fetchLocalFolder(src.name, src.dir, src.category, src.weight, { degate: src.degate });
    }
  });
  const results = await Promise.allSettled(jobs);
  const items: Item[] = [];
  results.forEach((r, i) => {
    const src = sources[i];
    if (r.status === 'fulfilled' && r.value) {
      items.push(...r.value);
      console.log(`  ${src.name}: ${r.value.length} items`);
    } else if (r.status === 'rejected') {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      console.error(`  ${src.name}: FAILED — ${msg}`);
    }
  });
  return items;
}

function isRecent(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < recencyHours * 3600000;
}

async function main(): Promise<void> {
  console.log(`ai-news-digest starting${dryRun ? ' [dry-run]' : ''}${onlySource ? ` [source=${onlySource}]` : ''}`);
  const seen = await loadSeen();
  console.log(`Seen store: ${seen.size} ids`);

  const tunedSources = await applySourceTuning(rawSources);

  console.log('Fetching sources...');
  const all = await fetchAll(tunedSources);
  console.log(`Total fetched: ${all.length}`);

  const trends = await updateTrends(all);
  const trending = getTrendingTopics(trends);
  if (trending.size) console.log(`Trending topics (${trending.size}): ${Array.from(trending).slice(0, 8).join(', ')}`);

  const fresh = all.filter(i => !seen.has(i.id) && isRecent(i.publishedAt));
  console.log(`Fresh in last ${recencyHours}h: ${fresh.length}`);

  // Research Inbox holds distinct saved articles, not many outlets covering one
  // story — keep each as its own item (no title-clustering collapse) so every
  // saved email survives into the digest.
  const isResearch = (i: Item) => i.source === 'Research Inbox';
  const researchSingletons: Cluster[] = fresh.filter(isResearch).map(i => ({ primary: i, items: [i] }));
  const clusters = [...cluster(fresh.filter(i => !isResearch(i))), ...researchSingletons];
  console.log(`Clusters: ${clusters.length} (${researchSingletons.length} research, kept distinct)`);

  // Score = source weight × recency × source-count cap × trending-topic boost × cross-category boost.
  // Cap source-count at 2 so single-source Claude Code releases can beat multi-outlet market stories.
  // Cross-category boost rewards true corroboration (community + blog + repo) over press-echo (3 news outlets).
  const preRanked = clusters
    .map(c => {
      const boost = recencyBoost(c.primary.publishedAt);
      const sourceCount = new Set(c.items.map(i => i.source)).size;
      const trend = trendingBoost(c.primary.title, trending);
      const xcat = crossCategoryBoost(c.items);
      c.score = c.primary.weight * boost * Math.min(sourceCount, 2) * trend * xcat;
      if (trend > 1.0) c.primary.trending = true;
      return c;
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, Math.min(clusters.length, maxItems * 2));

  // Collapse aggressively by company/product family so duplicate releases
  // across outlets become one entry.
  const KEY_RX: Array<[RegExp, string]> = [
    [/\bclaude code\b/i, 'claudecode'],
    [/\b(mcp|model context protocol)\b/i, 'mcp'],
    [/\bcursor(?: ai)?\b/i, 'cursor'],
    [/\bgithub copilot\b|\bcopilot\b/i, 'copilot'],
    [/\bcline\b/i, 'cline'],
    [/\baider\b/i, 'aider'],
    [/\b(gpt[- ]?\d|chatgpt|openai|\bcodex\b)\b/i, 'openai'],
    [/\b(claude|anthropic)\b/i, 'anthropic'],
    [/\bdeepseek\b/i, 'deepseek'],
    [/\b(gemini|bard|google deepmind)\b/i, 'google'],
    [/\b(llama|meta ai)\b/i, 'meta'],
    [/\bmistral\b/i, 'mistral'],
    [/\bqwen\b/i, 'qwen'],
    [/\b(grok|xai)\b/i, 'xai'],
    [/\bperplexity\b/i, 'perplexity'],
    [/\b(huggingface|hugging face)\b/i, 'huggingface'],
  ];
  function matchKey(text: string): string | null {
    for (const [rx, key] of KEY_RX) if (rx.test(text)) return key;
    return null;
  }
  function modelKey(c: typeof preRanked[number]): string | null {
    return matchKey(c.primary.title || '') ?? matchKey(c.primary.summary || '');
  }
  const byKey = new Map<string, typeof preRanked>();
  const unkeyed: typeof preRanked = [];
  for (const c of preRanked) {
    // Research Inbox holds DISTINCT saved articles, not many outlets covering one
    // event — exempt it from company-family merging so each article survives.
    const k = c.primary.source === 'Research Inbox' ? null : modelKey(c);
    if (k) {
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(c);
    } else {
      unkeyed.push(c);
    }
  }
  const merged = [
    ...Array.from(byKey.values()).map(arr => {
      if (arr.length === 1) return arr[0];
      arr.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      const head = arr[0];
      const allItems = Array.from(new Map(arr.flatMap(c => c.items).map(it => [it.id, it])).values());
      return { primary: head.primary, items: allItems, score: head.score };
    }),
    ...unkeyed,
  ];

  // Diversity cap: no single source dominates the final list. dev.to / Medium /
  // HN can flood top-N otherwise — cap each at PER_SOURCE_CAP and let lower-
  // ranked items from underrepresented sources bubble up.
  const PER_SOURCE_CAP = 5;
  const ranked = merged.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const perSource = new Map<string, number>();
  const final: typeof merged = [];
  const overflow: typeof merged = [];
  for (const c of ranked) {
    const src = c.primary.source;
    const used = perSource.get(src) ?? 0;
    // Research Inbox is a single source but holds many distinct articles you
    // saved on purpose — don't cap it like a flooding feed.
    if (src === 'Research Inbox' || used < PER_SOURCE_CAP) {
      final.push(c);
      perSource.set(src, used + 1);
    } else {
      overflow.push(c);
    }
    if (final.length >= maxItems) break;
  }
  // If diversity cap leaves room (rare), refill from overflow keeping rank order.
  for (const c of overflow) {
    if (final.length >= maxItems) break;
    final.push(c);
  }
  // Never truncate the research inbox — append any saved articles the maxItems
  // cap left out, so the folder is represented in full ("show me all of them").
  const inFinal = new Set(final.map(c => c.primary.id));
  for (const c of ranked) {
    if (c.primary.source === 'Research Inbox' && !inFinal.has(c.primary.id)) {
      final.push(c);
      inFinal.add(c.primary.id);
    }
  }
  console.log(`Merged duplicates: ${preRanked.length} -> ${merged.length}; final: ${final.length}`);
  const { html, text, subject } = render(final);

  // Always write the static site (powers GitHub Pages)
  await writeSite(final);

  if (dryRun) {
    await fs.mkdir('./out', { recursive: true });
    await fs.writeFile('./out/digest.html', html);
    await fs.writeFile('./out/digest.txt', text);
    await fs.writeFile('./out/debug.json', JSON.stringify({ clusters: final }, null, 2));
    console.log(`\nDry-run output: ./out/digest.html (${final.length} stories)`);
    console.log(`Subject would be: "${subject}"`);
  } else {
    const r = await sendDigest(html, text, subject);
    console.log(`Sent: ${JSON.stringify(r)}`);
    await saveSeen(fresh.map(i => i.id));
    console.log(`Seen store updated (+${fresh.length} ids)`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
