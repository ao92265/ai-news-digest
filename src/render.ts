import type { Cluster } from './cluster.js';
import type { Category } from './types.js';

/*
 * Email renderer — matches the Card Stack website visual language while staying
 * email-safe: all styles inline on every element (Outlook, Gmail-clipping safe),
 * no JS, no flex/grid where avoidable, no custom fonts. Monospace stack falls
 * back to system ui-monospace / Menlo / Consolas if JetBrains Mono isn't present.
 */

const SECTION_ORDER: Category[] = ['code', 'community', 'blog', 'news', 'research', 'video'];
const SECTION_LABELS: Record<Category, string> = {
  code: 'Releases & Repos',
  community: 'Hacker News',
  blog: 'Blogs & Newsletters',
  news: 'News',
  research: 'Research',
  video: 'Video',
};

const C = {
  bg: '#fafaf7',
  ink: '#0a0a0a',
  muted: '#6a6a6a',
  rule: '#eae7df',
  accent: '#ff4500',
  soft: '#f3f1ea',
  card: '#ffffff',
};

const FONT = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

// Scraped excerpts often end mid-word ("...each tool returns i"). Trim to the
// last sentence boundary inside the budget, else the last whole word, so the
// summary reads as a finished thought instead of a cut-off scrape.
function cleanSummary(raw: string, max = 240): string {
  const t = (raw || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, max);
  const sent = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  if (sent > max * 0.5) return slice.slice(0, sent + 1);
  const sp = slice.lastIndexOf(' ');
  return (sp > 0 ? slice.slice(0, sp) : slice).replace(/[,;:.\-\s]+$/, '') + '…';
}

function titleCaseTopic(t: string): string {
  return t.replace(/\b\w/g, m => m.toUpperCase());
}

// Heuristic TL;DR — no LLM. Built from data we already have: the top-ranked
// clusters (the array arrives in rank order), surging trend topics, and the
// per-section counts. A scannable "what matters today" without a model call.
function tldrHtml(clusters: Cluster[], trending: Set<string>, bySection: Map<Category, Cluster[]>): string {
  const top = clusters.filter(c => c.primary.source !== 'Research Inbox').slice(0, 5);
  if (top.length === 0) return '';
  const topItems = top.map(c => {
    const src = uniq(c.items.map(i => i.source))[0] || c.primary.source;
    return `<tr><td style="padding:3px 0;font-size:12.5px;line-height:1.45;color:${C.ink}">
      <span style="color:${C.accent};font-weight:700;margin-right:7px">›</span><a href="${esc(c.primary.url)}" style="color:${C.ink};text-decoration:none;font-weight:600">${esc(c.primary.title)}</a>
      <span style="color:${C.muted};font-weight:500"> · ${esc(src)}</span>
    </td></tr>`;
  }).join('');
  const trend = Array.from(trending).slice(0, 5).map(titleCaseTopic);
  const trendLine = trend.length
    ? `<div style="font-size:11.5px;color:${C.muted};margin-top:12px;line-height:1.5">Trending: ${trend.map(t => `<span style="color:${C.ink};font-weight:600">${esc(t)}</span>`).join(' · ')}</div>`
    : '';
  const counts = SECTION_ORDER
    .filter(k => bySection.has(k))
    .map(k => `${esc(SECTION_LABELS[k])} <b style="color:${C.ink}">${bySection.get(k)!.length}</b>`)
    .join('  ·  ');
  return `
  <div style="background:${C.card};border:1px solid ${C.rule};border-radius:10px;padding:18px 20px;margin:0 0 28px 0">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${C.accent};margin-bottom:10px">TL;DR — Top ${top.length}</div>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse">${topItems}</table>
    ${trendLine}
    <div style="font-size:11px;color:${C.muted};margin-top:10px;padding-top:10px;border-top:1px solid ${C.rule}">${counts}</div>
  </div>`;
}

function itemHtml(c: Cluster, sectionLabel: string): string {
  const headline = c.primary.title;
  const summary = cleanSummary(c.primary.summary || '');
  const sources = uniq(c.items.map(i => i.source));
  const trendBadge = c.primary.trending
    ? `<span style="display:inline-block;font-size:9.5px;font-weight:700;letter-spacing:0.1em;padding:2px 7px;border-radius:3px;background:${C.ink};color:#ffffff;text-transform:uppercase;margin-right:8px;vertical-align:middle">Trending</span>`
    : '';
  const sourceChips = sources.map(s =>
    `<span style="display:inline-block;padding:1px 7px;background:${C.soft};border-radius:3px;margin-right:4px;color:${C.muted};font-size:10.5px">${esc(s)}</span>`
  ).join('');

  return `
  <tr><td style="padding:0 0 8px 0">
    <div style="background:${C.card};border:1px solid ${C.rule};border-radius:8px;padding:14px 16px;position:relative">
      <div style="margin-bottom:6px">
        ${trendBadge}<a href="${esc(c.primary.url)}" style="color:${C.ink};text-decoration:none;font-weight:600;font-size:14.5px;line-height:1.35;letter-spacing:-0.005em">${esc(headline)}</a>
      </div>
      ${summary ? `<div style="font-size:12.5px;color:${C.muted};line-height:1.5;margin-top:4px">${esc(summary)}</div>` : ''}
      <div style="margin-top:10px;font-size:10.5px;color:${C.muted}">${sourceChips}</div>
    </div>
  </td></tr>`;
}

function sectionHtml(label: string, clusters: Cluster[]): string {
  const count = clusters.length;
  const items = clusters.map(c => itemHtml(c, label)).join('');
  return `
  <div style="margin:32px 0 0 0">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;margin-bottom:10px">
      <tr>
        <td style="font-size:13px;font-weight:700;color:${C.ink};letter-spacing:-0.005em;padding:0 10px 0 0;white-space:nowrap">${esc(label)}</td>
        <td style="padding:0 8px 0 0;white-space:nowrap">
          <span style="display:inline-block;font-size:11px;color:${C.muted};font-weight:500;padding:1px 7px;border-radius:999px;background:${C.soft}">${count}</span>
        </td>
        <td style="width:100%;border-top:1px solid ${C.rule}"></td>
      </tr>
    </table>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse">${items}</table>
  </div>`;
}

export function render(clusters: Cluster[], trending: Set<string> = new Set()): { html: string; text: string; subject: string } {
  const date = new Date().toISOString().slice(0, 10);
  const dateShort = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const year = date.slice(0, 4);

  const bySection = new Map<Category, Cluster[]>();
  for (const c of clusters) {
    const cat = c.primary.category;
    if (!bySection.has(cat)) bySection.set(cat, []);
    bySection.get(cat)!.push(c);
  }
  const sectionsHtml = SECTION_ORDER
    .filter(k => bySection.has(k))
    .map(k => sectionHtml(SECTION_LABELS[k], bySection.get(k)!))
    .join('');

  const total = clusters.length;

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Digest — ${date}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};color:${C.ink};font-family:${FONT};-webkit-font-smoothing:antialiased">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${C.bg}">
  <tr><td align="center" style="padding:24px 16px 48px 16px">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="680" style="max-width:680px;width:100%;background:${C.bg}">
      <tr><td style="padding:0 0 18px 0;border-bottom:1px solid ${C.rule}">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr>
          <td style="font-family:${FONT};font-size:13.5px;font-weight:700;color:${C.ink};letter-spacing:-0.01em">
            <span style="display:inline-block;width:20px;height:20px;border-radius:5px;background:${C.ink};color:${C.bg};text-align:center;font-size:12px;font-weight:800;line-height:20px;vertical-align:middle;margin-right:6px">A</span>ai-digest
          </td>
          <td align="right" style="font-family:${FONT};font-size:11.5px;color:${C.muted}">
            daily · 07:00 UTC
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:28px 0 0 0">
        <div style="font-family:${FONT};font-size:30px;font-weight:600;letter-spacing:-0.025em;line-height:1.1;color:${C.ink}">
          ${esc(dateShort)}<span style="color:${C.accent};margin:0 2px">/</span><span style="color:${C.muted};font-weight:500">${esc(year)}</span>
        </div>
        <div style="font-family:${FONT};font-size:13px;color:${C.muted};margin:6px 0 20px 0">
          <b style="color:${C.ink};font-weight:600">${total}</b> stories · curated for Claude Code users
        </div>
        ${tldrHtml(clusters, trending, bySection)}
        ${sectionsHtml}
        <div style="background:${C.card};border:1px solid ${C.rule};border-radius:10px;padding:20px 22px;margin:40px 0 0 0">
          <div style="font-family:${FONT};font-size:14.5px;font-weight:600;letter-spacing:-0.005em;color:${C.ink};margin-bottom:6px">Read on the web</div>
          <div style="font-family:${FONT};font-size:12.5px;color:${C.muted};line-height:1.5">Archive, per-date history, and interactive filters: <a href="https://ao92265.github.io/ai-news-digest/" style="color:${C.accent};text-decoration:none;font-weight:600">ao92265.github.io/ai-news-digest</a></div>
        </div>
      </td></tr>
      <tr><td style="padding:28px 0 0 0;border-top:1px solid ${C.rule};margin-top:28px">
        <div style="font-family:${FONT};font-size:11px;color:${C.muted};padding-top:20px">
          generated 07:00 UTC daily · <a href="https://github.com/ao92265/ai-news-digest" style="color:${C.muted};text-decoration:underline">source</a>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const tldrTop = clusters.filter(c => c.primary.source !== 'Research Inbox').slice(0, 5);
  const tldrText = tldrTop.length
    ? `TL;DR — Top ${tldrTop.length}\n` + tldrTop.map(c => {
        const src = uniq(c.items.map(i => i.source))[0] || c.primary.source;
        return `  > ${c.primary.title} · ${src}`;
      }).join('\n')
      + (trending.size ? `\nTrending: ${Array.from(trending).slice(0, 5).map(titleCaseTopic).join(' · ')}` : '')
      + '\n\n'
    : '';

  const text = `AI Digest — ${dateShort}/${year}\n${total} stories\n\n` + tldrText + SECTION_ORDER
    .filter(k => bySection.has(k))
    .map(k => {
      const body = bySection.get(k)!
        .map(c => {
          const h = c.primary.title;
          const s = cleanSummary(c.primary.summary || '');
          return `- ${h}${s ? ' — ' + s : ''}\n  ${c.primary.url}`;
        })
        .join('\n');
      return `## ${SECTION_LABELS[k]}\n${body}`;
    })
    .join('\n\n') + `\n\nRead on the web: https://ao92265.github.io/ai-news-digest/`;

  const subject = `AI Digest ${dateShort} — ${total} stories`;
  return { html, text, subject };
}
