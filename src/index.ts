import fs from 'node:fs/promises';
import { sources } from './sources.js';
import { fetchRss } from './fetchers/rss.js';
import { fetchHn } from './fetchers/hn.js';
import { fetchArxiv } from './fetchers/arxiv.js';
import { fetchGithubTrending } from './fetchers/github.js';
import { loadSeen, saveSeen } from './dedupe.js';
import { cluster } from './cluster.js';
import { summarizeAll } from './summarize.js';
import { buildTldr } from './tldr.js';
import { render } from './render.js';
import { sendDigest } from './send.js';
import type { Item } from './types.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlySource = args.find(a => a.startsWith('--source='))?.split('=')[1];
const maxItems = Number(args.find(a => a.startsWith('--max='))?.split('=')[1] || 25);
const recencyHours = Number(args.find(a => a.startsWith('--hours='))?.split('=')[1] || 36);

function recencyBoost(iso: string): number {
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  return Math.max(0.3, 1 - h / 72);
}

async function fetchAll(): Promise<Item[]> {
  const jobs = sources.map(async src => {
    if (onlySource && src.name !== onlySource && src.kind !== onlySource) return [];
    switch (src.kind) {
      case 'rss': return fetchRss(src.name, src.url, src.category, src.weight);
      case 'hn': return fetchHn(src.weight);
      case 'arxiv': return fetchArxiv(src.weight);
      case 'github-trending': return fetchGithubTrending(src.topics, src.weight);
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

  console.log('Fetching sources...');
  const all = await fetchAll();
  console.log(`Total fetched: ${all.length}`);

  const fresh = all.filter(i => !seen.has(i.id) && isRecent(i.publishedAt));
  console.log(`Fresh in last ${recencyHours}h: ${fresh.length}`);

  const clusters = cluster(fresh);
  console.log(`Clusters: ${clusters.length}`);

  const ranked = clusters
    .map(c => {
      const boost = recencyBoost(c.primary.publishedAt);
      const sourceCount = new Set(c.items.map(i => i.source)).size;
      c.score = c.primary.weight * boost * Math.min(sourceCount, 4);
      return c;
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, maxItems);

  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  if (!hasKey) console.warn('ANTHROPIC_API_KEY not set — skipping LLM summaries + TL;DR');
  const final = hasKey ? await summarizeAll(ranked) : ranked;
  const tldr = hasKey ? await buildTldr(final).catch(err => { console.error('tldr error:', err?.message); return null; }) : null;

  const { html, text, subject } = render(final, tldr);

  if (dryRun) {
    await fs.mkdir('./out', { recursive: true });
    await fs.writeFile('./out/digest.html', html);
    await fs.writeFile('./out/digest.txt', text);
    await fs.writeFile('./out/debug.json', JSON.stringify({ tldr, clusters: final }, null, 2));
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
