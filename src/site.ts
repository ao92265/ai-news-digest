import fs from 'node:fs/promises';
import path from 'node:path';
import type { Cluster } from './cluster.js';
import type { Tldr } from './tldr.js';

const SITE_DIR = './site';
const DIGESTS_DIR = './site/digests';
const INDEX_JSON = './site/digests/index.json';

type ArchiveEntry = { date: string; title: string; count: number };

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

const CSS = `
:root {
  --bg: #fafaf7;
  --ink: #1a1a1a;
  --muted: #6b6b6b;
  --rule: #e9e6df;
  --accent: #d97757;
  --link: #0b66c3;
  --tldr-bg: #fff6e0;
  --tldr-border: #d97757;
  --card: #fff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #141311;
    --ink: #e9e6df;
    --muted: #9a9589;
    --rule: #2a2723;
    --tldr-bg: #302618;
    --tldr-border: #d97757;
    --card: #1d1b18;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
body { font-size: 15px; line-height: 1.55; }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
.container { max-width: 780px; margin: 0 auto; padding: 0 24px; }
header { border-bottom: 1px solid var(--rule); padding: 18px 0; background: var(--bg); position: sticky; top: 0; z-index: 10; backdrop-filter: blur(8px); }
header .container { display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
.brand { font-family: "Iowan Old Style", "Palatino", Georgia, serif; font-size: 22px; font-weight: 700; color: var(--ink); letter-spacing: -0.01em; }
.brand:hover { text-decoration: none; color: var(--accent); }
nav { display: flex; gap: 20px; font-size: 14px; }
nav a { color: var(--muted); }
nav a.active, nav a:hover { color: var(--ink); text-decoration: none; }
main { padding: 32px 0 64px; }
h1.page-title { font-family: "Iowan Old Style", "Palatino", Georgia, serif; font-size: 34px; letter-spacing: -0.02em; margin: 0 0 4px; }
.page-meta { color: var(--muted); font-size: 13px; margin: 0 0 24px; }
.tldr { background: var(--tldr-bg); border-left: 4px solid var(--tldr-border); padding: 16px 20px; margin: 0 0 32px; border-radius: 4px; }
.tldr-label { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--accent); font-weight: 700; margin-bottom: 10px; }
.tldr ul { margin: 0; padding-left: 18px; }
.tldr li { margin-bottom: 8px; }
h2.section { font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--rule); padding-bottom: 6px; margin: 32px 0 14px; }
ul.items { list-style: none; padding: 0; margin: 0; }
ul.items li { padding: 12px 0; border-bottom: 1px solid var(--rule); }
ul.items li:last-child { border-bottom: none; }
.item-title { font-weight: 600; font-size: 16px; color: var(--link); }
.item-summary { color: var(--ink); margin-top: 4px; }
.item-meta { color: var(--muted); font-size: 12px; margin-top: 4px; }
footer { border-top: 1px solid var(--rule); padding: 24px 0 48px; font-size: 12px; color: var(--muted); }
.archive-list { list-style: none; padding: 0; margin: 0; }
.archive-list li { padding: 10px 0; border-bottom: 1px solid var(--rule); display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
.archive-date { font-variant-numeric: tabular-nums; color: var(--muted); font-size: 13px; }
.archive-title { flex: 1; }
.subscribe-cta { background: var(--card); border: 1px solid var(--rule); border-radius: 8px; padding: 20px 24px; margin: 32px 0; }
.subscribe-cta h3 { margin: 0 0 6px; font-size: 15px; }
.subscribe-cta p { margin: 0; color: var(--muted); font-size: 14px; }
.btn { display: inline-block; margin-top: 12px; background: var(--accent); color: #fff; padding: 8px 14px; border-radius: 6px; font-size: 14px; font-weight: 500; }
.btn:hover { text-decoration: none; background: #c65f3f; color: #fff; }
@media (max-width: 520px) {
  .container { padding: 0 16px; }
  h1.page-title { font-size: 26px; }
  header .container { flex-direction: column; align-items: flex-start; gap: 12px; }
}
`;

function shell(opts: { title: string; active: 'today' | 'archive' | 'about'; body: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="description" content="Daily AI news digest for engineers using Claude Code. Adopt-worthy releases and tools, delivered by email.">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="Daily AI news digest for engineers using Claude Code.">
<meta property="og:type" content="website">
<link rel="stylesheet" href="./styles.css">
</head>
<body>
<header>
  <div class="container">
    <a class="brand" href="./">AI Digest</a>
    <nav>
      <a href="./" class="${opts.active === 'today' ? 'active' : ''}">Today</a>
      <a href="./archive.html" class="${opts.active === 'archive' ? 'active' : ''}">Archive</a>
      <a href="./about.html" class="${opts.active === 'about' ? 'active' : ''}">About</a>
    </nav>
  </div>
</header>
<main>
  <div class="container">
    ${opts.body}
  </div>
</main>
<footer>
  <div class="container">
    Daily AI news for Claude Code users · <a href="https://github.com/ao92265/ai-news-digest">source</a>
  </div>
</footer>
</body>
</html>`;
}

const SECTION_ORDER = ['code', 'community', 'blog', 'news', 'research', 'video'] as const;
const SECTION_LABELS: Record<string, string> = {
  code: 'Releases & Repos',
  community: 'Hacker News',
  blog: 'Blogs & Newsletters',
  news: 'News',
  research: 'Research',
  video: 'Video',
};

function digestBodyHtml(clusters: Cluster[], tldr: Tldr | null, date: string): string {
  const bySection = new Map<string, Cluster[]>();
  for (const c of clusters) {
    const cat = c.primary.category;
    if (!bySection.has(cat)) bySection.set(cat, []);
    bySection.get(cat)!.push(c);
  }
  const tldrHtml = tldr && tldr.bullets.length
    ? `<div class="tldr">
        <div class="tldr-label">TL;DR</div>
        <ul>${tldr.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
       </div>`
    : '';
  const sections = SECTION_ORDER
    .filter(k => bySection.has(k))
    .map(k => {
      const items = bySection.get(k)!
        .map(c => {
          const h = c.primary.llmHeadline || c.primary.title;
          const s = (c.primary.llmSummary || c.primary.summary || '').trim();
          const sources = uniq(c.items.map(i => i.source)).join(', ');
          return `<li>
            <a class="item-title" href="${esc(c.primary.url)}">${esc(h)}</a>
            ${s ? `<div class="item-summary">${esc(s)}</div>` : ''}
            <div class="item-meta">${esc(sources)}</div>
          </li>`;
        }).join('');
      return `<h2 class="section">${SECTION_LABELS[k] || k}</h2><ul class="items">${items}</ul>`;
    })
    .join('');
  return `
    <h1 class="page-title">AI Digest — ${date}</h1>
    <p class="page-meta">${clusters.length} adopt-worthy items · curated for Claude Code users</p>
    ${tldrHtml}
    ${sections}
    <div class="subscribe-cta">
      <h3>Get this by email</h3>
      <p>Delivered daily at 07:00 UTC. Reply to the first one to unsubscribe.</p>
      <a class="btn" href="mailto:aoreilly@harriscomputer.com?subject=AI%20Digest%20subscribe&body=Please%20add%20me%20to%20the%20AI%20Digest%20list.">Request access</a>
    </div>`;
}

function archiveBodyHtml(entries: ArchiveEntry[]): string {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const items = sorted.map(e => `<li>
    <a class="archive-title" href="./digests/${encodeURIComponent(e.date)}.html">${esc(e.title)}</a>
    <span class="archive-date">${esc(e.date)} · ${e.count} items</span>
  </li>`).join('');
  return `
    <h1 class="page-title">Archive</h1>
    <p class="page-meta">${entries.length} past digests</p>
    <ul class="archive-list">${items || '<li><span class="archive-date">No archived digests yet.</span></li>'}</ul>`;
}

const ABOUT_BODY = `
  <h1 class="page-title">About</h1>
  <p>AI Digest is an automated daily brief of AI news, releases and research — curated for engineers who use Claude Code as their primary dev tool.</p>
  <h2 class="section">How it works</h2>
  <ul>
    <li>A GitHub Action runs every morning at 07:00 UTC.</li>
    <li>It pulls ~24 sources: Claude Code releases, OpenAI / DeepMind / Hugging Face blogs, Simon Willison, Latent Space, Import AI, Hacker News, arXiv, targeted Google News queries, GitHub trending repos, and more.</li>
    <li>Claude Haiku 4.5 summarises each story in one line, flags adopt-worthy items, and writes the TL;DR.</li>
    <li>Duplicates across outlets are merged into one entry per model/product.</li>
    <li>The digest is published here and emailed to subscribers.</li>
  </ul>
  <h2 class="section">Source</h2>
  <p>Open source on <a href="https://github.com/ao92265/ai-news-digest">GitHub</a>. Contributions and source suggestions welcome.</p>`;

async function loadArchive(): Promise<ArchiveEntry[]> {
  try {
    const raw = await fs.readFile(INDEX_JSON, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveArchive(entries: ArchiveEntry[]): Promise<void> {
  await fs.mkdir(DIGESTS_DIR, { recursive: true });
  await fs.writeFile(INDEX_JSON, JSON.stringify(entries, null, 2) + '\n');
}

export async function writeSite(clusters: Cluster[], tldr: Tldr | null): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const pageTitle = `AI Digest — ${date}`;
  const digestBody = digestBodyHtml(clusters, tldr, date);

  await fs.mkdir(DIGESTS_DIR, { recursive: true });

  const indexHtml = shell({ title: pageTitle, active: 'today', body: digestBody });
  const digestPageHtml = shell({ title: pageTitle, active: 'archive', body: digestBody });
  await fs.writeFile(path.join(SITE_DIR, 'index.html'), indexHtml);
  await fs.writeFile(path.join(DIGESTS_DIR, `${date}.html`), digestPageHtml);
  await fs.writeFile(path.join(SITE_DIR, 'styles.css'), CSS.trim() + '\n');
  await fs.writeFile(path.join(SITE_DIR, 'about.html'), shell({ title: 'About · AI Digest', active: 'about', body: ABOUT_BODY }));

  const archive = await loadArchive();
  const existing = archive.findIndex(e => e.date === date);
  const entry: ArchiveEntry = { date, title: pageTitle, count: clusters.length };
  if (existing >= 0) archive[existing] = entry;
  else archive.push(entry);
  await saveArchive(archive);

  const archiveHtml = shell({ title: 'Archive · AI Digest', active: 'archive', body: archiveBodyHtml(archive) });
  await fs.writeFile(path.join(SITE_DIR, 'archive.html'), archiveHtml);

  console.log(`Site written: ${SITE_DIR}/ (${archive.length} archive entries)`);
}
