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

const SECTION_ORDER = ['code', 'community', 'blog', 'news', 'research', 'video'] as const;
const SECTION_LABELS: Record<string, string> = {
  code: 'Releases & Repos',
  community: 'Hacker News',
  blog: 'Blogs & Newsletters',
  news: 'News',
  research: 'Research',
  video: 'Video',
};

function formatDateShort(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatDateLong(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

function shell(opts: {
  title: string;
  active: 'today' | 'archive' | 'about';
  body: string;
  description?: string;
  basePath?: string;
}): string {
  const b = opts.basePath ?? './';
  const desc = opts.description ??
    'Daily AI news digest for engineers using Claude Code. Adopt-worthy releases, delivered every morning.';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${b}styles.css">
</head>
<body>
<div class="site-root">
<header>
  <div class="container nav-row">
    <a class="brand" href="${b}"><span class="brand-mark">A</span>ai-digest</a>
    <nav aria-label="Primary">
      <a href="${b}" class="${opts.active === 'today' ? 'active' : ''}">Today</a>
      <a href="${b}archive.html" class="${opts.active === 'archive' ? 'active' : ''}">Archive</a>
      <a href="${b}about.html" class="${opts.active === 'about' ? 'active' : ''}">About</a>
    </nav>
  </div>
</header>
<main>
  <div class="container">
    ${opts.body}
  </div>
</main>
<footer>
  <div class="container footer-row">
    <span>generated 07:00 UTC daily · static build</span>
    <span><a href="${b}about.html">email</a> · <a href="https://github.com/ao92265/ai-news-digest">source</a></span>
  </div>
</footer>
</div>
<script src="${b}digest.js" defer></script>
</body>
</html>`;
}

function statusStripHtml(generatedAtIso: string, sourceCount: number, itemCount: number): string {
  return `<div class="status-strip" data-generated="${esc(generatedAtIso)}">
    <span class="live"><span class="led"></span>LIVE</span>
    <span class="cell">generated <b data-ago>just now</b></span>
    <span class="sep">·</span>
    <span class="cell countdown" data-next>next in 24h</span>
    <span class="sep">·</span>
    <span class="cell">${sourceCount} sources · ${itemCount} items</span>
    <div class="progress"><span style="width:0%"></span></div>
  </div>`;
}

function tldrHtml(bullets: string[]): string {
  if (!bullets.length) return '';
  return `<div class="tldr">
    <div class="tldr-head">TL;DR <span class="count">· ${bullets.length} bullets</span></div>
    <ul>${bullets.map(b => `<li><span>${esc(b)}</span></li>`).join('')}</ul>
  </div>`;
}

function digestBodyHtml(
  clusters: Cluster[],
  tldr: Tldr | null,
  date: string,
  generatedAt: string,
  sourceCount: number,
  isToday: boolean
): string {
  const bySection = new Map<string, Cluster[]>();
  for (const c of clusters) {
    const cat = c.primary.category;
    if (!bySection.has(cat)) bySection.set(cat, []);
    bySection.get(cat)!.push(c);
  }

  const allSources = uniq(clusters.flatMap(c => c.items.map(i => i.source))).sort();
  const adoptCount = clusters.filter(c => isAdopt(c)).length;

  const sectionsHtml = SECTION_ORDER
    .filter(k => bySection.has(k))
    .map(k => {
      const items = bySection.get(k)!
        .map(c => {
          const headline = c.primary.llmHeadline || c.primary.title;
          const summary = (c.primary.llmSummary || c.primary.summary || '').trim();
          const sources = uniq(c.items.map(i => i.source));
          const adopt = isAdopt(c);
          const id = c.primary.id || encodeURIComponent(c.primary.url);
          return `<li class="item ${adopt ? 'adopt' : ''}" data-id="${esc(id)}" data-sources="${esc(sources.join('|'))}">
            <div class="item-head">
              ${adopt ? '<span class="badge">Adopt</span>' : ''}
              ${c.primary.trending ? '<span class="badge trending">Trending</span>' : ''}
              <span class="item-title"><a href="${esc(c.primary.url)}" target="_blank" rel="noopener">${esc(headline)}</a></span>
            </div>
            ${summary ? `<div class="item-summary">${esc(summary)}</div>` : ''}
            <div class="item-meta">
              <div class="sources">${sources.map(s => `<span class="src-tag">${esc(s)}</span>`).join('')}</div>
              <button class="toggle-read" type="button">mark read</button>
            </div>
            <div class="expand" hidden>
              <dl>
                <dt>Summary</dt><dd>${esc(summary)}</dd>
                <dt>Link</dt><dd><a href="${esc(c.primary.url)}" target="_blank" rel="noopener">${esc(c.primary.url)} ↗</a></dd>
                <dt>Sources</dt><dd>${esc(sources.join(' · '))}</dd>
                <dt>Section</dt><dd>${esc(SECTION_LABELS[k] || k)}</dd>
                ${adopt ? '<dt>Flag</dt><dd style="color:var(--accent);font-weight:600">Adopt-worthy</dd>' : ''}
              </dl>
            </div>
          </li>`;
        }).join('');
      const cnt = bySection.get(k)!.length;
      return `<section class="digest-section" data-section="${k}" aria-label="${esc(SECTION_LABELS[k] || k)}">
        <h2 class="section">
          <span class="name">${esc(SECTION_LABELS[k] || k)}</span>
          <span class="count">${cnt}</span>
          <span class="rule"></span>
        </h2>
        <ul class="items">${items}</ul>
      </section>`;
    })
    .join('');

  const chips = SECTION_ORDER
    .filter(k => bySection.has(k))
    .map(k => `<button class="chip on" type="button" data-section="${k}">${esc(SECTION_LABELS[k] || k)}<span class="num">${bySection.get(k)!.length}</span></button>`)
    .join('');

  const sourceChips = allSources
    .map(s => `<button class="src" type="button" data-source="${esc(s)}">${esc(s)}</button>`)
    .join('');

  const dateShort = formatDateShort(date);
  const year = date.slice(0, 4);
  const ctaHtml = isToday ? `<div class="subscribe-cta">
    <h3>Get this by email</h3>
    <p>Delivered daily at 07:00 UTC. Reply to the first one to unsubscribe.</p>
    <a class="cta" href="mailto:aoreilly@harriscomputer.com?subject=AI%20Digest%20subscribe&body=Please%20add%20me%20to%20the%20AI%20Digest%20list.">Request access →</a>
  </div>` : '';
  const crumb = isToday ? '' : `<div class="crumb"><a href="../archive.html">← Archive</a></div>`;

  return `<div data-digest-date="${esc(date)}">
    ${crumb}
    ${statusStripHtml(generatedAt, sourceCount, clusters.length)}
    <h1 class="page-title">${esc(dateShort)}<span class="slash">/</span><span class="year">${esc(year)}</span></h1>
    <p class="page-meta"><b>${adoptCount}</b> adopt-worthy · <b>${clusters.length}</b> total · curated for Claude Code users</p>
    ${tldr && tldr.bullets.length ? tldrHtml(tldr.bullets) : ''}
    <div class="controls">
      ${chips}
      <div class="actions">
        <button class="btn" type="button" data-reset-read hidden>Reset · 0</button>
        <button class="btn" type="button" data-copy-md>Copy as Markdown</button>
      </div>
    </div>
    <details class="srcbar">
      <summary>${allSources.length} of ${allSources.length} outlets shown</summary>
      <div class="srcs">${sourceChips}</div>
    </details>
    <div class="empty" hidden>No items match the current filters.</div>
    ${sectionsHtml}
    ${ctaHtml}
  </div>`;
}

function isAdopt(c: Cluster): boolean {
  // Either an explicit adopt flag or the inverse of the LLM's "Skip" marker.
  // Adopt-worthy items survived the filter in index.ts; "Skip" items were dropped.
  // If adopt is explicitly set, prefer that.
  if (typeof c.primary.adopt === 'boolean') return c.primary.adopt;
  const why = (c.primary.llmWhy || '').trim();
  if (/^skip\b/i.test(why)) return false;
  return !!c.primary.llmWhy; // LLM wrote a real why → adopt-worthy
}

function archiveBodyHtml(entries: ArchiveEntry[]): string {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const byMonth = new Map<string, ArchiveEntry[]>();
  for (const e of sorted) {
    const m = e.date.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(e);
  }

  const months = Array.from(byMonth.keys()).sort().reverse();
  const monthsHtml = months.map(m => {
    const d = new Date(m + '-15T12:00:00Z');
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const rows = byMonth.get(m)!.map(e => `<li class="archive-row">
      <a class="archive-link" href="./digests/${encodeURIComponent(e.date)}.html">
        <div class="archive-title-block">
          <div class="archive-date">${esc(formatDateLong(e.date))}</div>
          <div class="archive-sub">${e.count} items</div>
        </div>
        <span class="archive-arrow" aria-hidden="true">→</span>
      </a>
    </li>`).join('');
    return `<section class="archive-month">
      <h2 class="section"><span class="name">${esc(label)}</span><span class="count">${byMonth.get(m)!.length}</span><span class="rule"></span></h2>
      <ul class="archive-list">${rows}</ul>
    </section>`;
  }).join('');

  return `<h1 class="page-title">Archive</h1>
    <p class="page-meta">${entries.length} past digests · newest first</p>
    ${entries.length === 0 ? '<div class="empty">No archived digests yet.</div>' : monthsHtml}`;
}

const ABOUT_BODY = `<h1 class="page-title">About</h1>
<p class="page-meta">An automated daily brief for engineers who use Claude Code.</p>
<div class="prose">
  <p>AI Digest pulls from about two dozen sources every morning, flags what's actually worth trying today, and delivers it in one scannable page. Built for readers who open it once at breakfast and close the tab.</p>
</div>
<section class="digest-section">
  <h2 class="section"><span class="name">How it works</span><span class="rule"></span></h2>
  <ol class="howitworks">
    <li><span><b>07:00 UTC</b> — a GitHub Action kicks off the daily build.</span></li>
    <li><span><b>Fetch</b> ~24 sources across releases, Hacker News, blogs, newsletters, research, and video.</span></li>
    <li><span><b>Summarize</b> — Claude Haiku writes a one-line summary for each story, flags adopt-worthy items, and drafts the TL;DR.</span></li>
    <li><span><b>Merge</b> — duplicates across outlets collapse into a single entry with combined sources.</span></li>
    <li><span><b>Publish</b> — static site rebuilds and deploys to GitHub Pages. Email goes out to the list.</span></li>
  </ol>
</section>
<section class="digest-section">
  <h2 class="section"><span class="name">Sources</span><span class="count">24</span><span class="rule"></span></h2>
  <div class="source-grid">
    <div class="source-col"><div class="source-col-head">Code</div><ul><li>Claude Code releases</li><li>GitHub trending</li><li>Hugging Face</li></ul></div>
    <div class="source-col"><div class="source-col-head">Blogs</div><ul><li>Simon Willison</li><li>Latent Space</li><li>Import AI</li><li>OpenAI news</li><li>DeepMind blog</li><li>The Gradient</li><li>GitHub Engineering</li><li>Joe Njenga</li></ul></div>
    <div class="source-col"><div class="source-col-head">News</div><ul><li>MIT Tech Review</li><li>Ars Technica</li><li>TechCrunch AI</li><li>The Verge AI</li><li>Google News (curated)</li></ul></div>
    <div class="source-col"><div class="source-col-head">Community</div><ul><li>Hacker News (AI+LLM+tools)</li></ul></div>
    <div class="source-col"><div class="source-col-head">Research</div><ul><li>arXiv cs.AI</li></ul></div>
    <div class="source-col"><div class="source-col-head">Video</div><ul><li>AI Explained</li><li>Two Minute Papers</li></ul></div>
  </div>
</section>
<div class="subscribe-cta">
  <h3>Get it by email</h3>
  <p>Delivered daily at 07:00 UTC. Or <a href="https://github.com/ao92265/ai-news-digest">read the source</a> and self-host.</p>
  <a class="cta" href="mailto:aoreilly@harriscomputer.com?subject=AI%20Digest%20subscribe">Request access →</a>
</div>`;

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
  const generatedAt = new Date().toISOString();
  const sourceCount = uniq(clusters.flatMap(c => c.items.map(i => i.source))).length;
  const pageTitle = `AI Digest — ${date}`;

  await fs.mkdir(DIGESTS_DIR, { recursive: true });

  const todayBody = digestBodyHtml(clusters, tldr, date, generatedAt, sourceCount, true);
  const dateBody = digestBodyHtml(clusters, tldr, date, generatedAt, sourceCount, false);

  await fs.writeFile(
    path.join(SITE_DIR, 'index.html'),
    shell({ title: pageTitle, active: 'today', body: todayBody, basePath: './' })
  );
  await fs.writeFile(
    path.join(DIGESTS_DIR, `${date}.html`),
    shell({ title: pageTitle, active: 'archive', body: dateBody, basePath: '../' })
  );
  await fs.writeFile(
    path.join(SITE_DIR, 'about.html'),
    shell({ title: 'About · AI Digest', active: 'about', body: ABOUT_BODY, basePath: './' })
  );

  // Copy static assets from build/
  for (const f of ['styles.css', 'digest.js']) {
    try {
      await fs.copyFile(path.join('./build', f), path.join(SITE_DIR, f));
    } catch {
      console.warn(`could not copy build/${f} — make sure it exists`);
    }
  }

  const archive = await loadArchive();
  const existing = archive.findIndex(e => e.date === date);
  const entry: ArchiveEntry = { date, title: pageTitle, count: clusters.length };
  if (existing >= 0) archive[existing] = entry;
  else archive.push(entry);
  await saveArchive(archive);

  const archiveHtml = shell({
    title: 'Archive · AI Digest',
    active: 'archive',
    body: archiveBodyHtml(archive),
    basePath: './',
  });
  await fs.writeFile(path.join(SITE_DIR, 'archive.html'), archiveHtml);

  console.log(`Site written: ${SITE_DIR}/ (${archive.length} archive entries)`);
}
