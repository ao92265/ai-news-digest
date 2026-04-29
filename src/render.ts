import type { Cluster } from './cluster.js';
import type { Category } from './types.js';
import type { Tldr } from './tldr.js';

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

function isAdopt(c: Cluster): boolean {
  if (typeof c.primary.adopt === 'boolean') return c.primary.adopt;
  const why = (c.primary.llmWhy || '').trim();
  if (/^skip\b/i.test(why)) return false;
  return !!c.primary.llmWhy;
}

function tldrHtml(bullets: string[]): string {
  if (!bullets.length) return '';
  const items = bullets.map(b => `
    <tr><td style="padding:0 0 8px 0;vertical-align:top;width:18px;color:${C.accent};font-weight:700;font-size:13.5px;line-height:1.5">→</td>
    <td style="padding:0 0 8px 0;vertical-align:top;font-size:13.5px;line-height:1.5;color:${C.ink}">${esc(b)}</td></tr>`).join('');
  return `
  <div style="background:${C.card};border:1px solid ${C.rule};border-radius:10px;padding:18px 20px 14px 20px;margin:0 0 28px 0;position:relative;border-left:3px solid ${C.accent}">
    <div style="font-size:10.5px;letter-spacing:0.14em;text-transform:uppercase;color:${C.accent};font-weight:700;margin-bottom:12px">TL;DR <span style="color:${C.muted};font-weight:500;letter-spacing:0.08em">· ${bullets.length} bullets</span></div>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse">${items}</table>
  </div>`;
}

function itemHtml(c: Cluster, sectionLabel: string): string {
  const headline = c.primary.llmHeadline || c.primary.title;
  const summary = (c.primary.llmSummary || c.primary.summary || '').trim();
  const sources = uniq(c.items.map(i => i.source));
  const adopt = isAdopt(c);
  const borderColour = adopt ? `color-mix(in srgb, ${C.accent} 45%, ${C.rule})` : C.rule;
  const accentBar = adopt
    ? `<div style="position:absolute;left:0;top:14px;bottom:14px;width:3px;background:${C.accent};border-radius:0 3px 3px 0"></div>`
    : '';
  const badge = adopt
    ? `<span style="display:inline-block;font-size:9.5px;font-weight:700;letter-spacing:0.1em;padding:2px 7px;border-radius:3px;background:${C.accent};color:#ffffff;text-transform:uppercase;margin-right:8px;vertical-align:middle">Adopt</span>`
    : '';
  const trendBadge = c.primary.trending
    ? `<span style="display:inline-block;font-size:9.5px;font-weight:700;letter-spacing:0.1em;padding:2px 7px;border-radius:3px;background:${C.ink};color:#ffffff;text-transform:uppercase;margin-right:8px;vertical-align:middle">Trending</span>`
    : '';
  const sourceChips = sources.map(s =>
    `<span style="display:inline-block;padding:1px 7px;background:${C.soft};border-radius:3px;margin-right:4px;color:${C.muted};font-size:10.5px">${esc(s)}</span>`
  ).join('');

  return `
  <tr><td style="padding:0 0 8px 0">
    <div style="background:${C.card};border:1px solid ${borderColour};border-radius:8px;padding:14px 16px;position:relative">
      ${accentBar}
      <div style="margin-bottom:6px">
        ${badge}${trendBadge}<a href="${esc(c.primary.url)}" style="color:${C.ink};text-decoration:none;font-weight:600;font-size:14.5px;line-height:1.35;letter-spacing:-0.005em">${esc(headline)}</a>
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

export function render(clusters: Cluster[], tldr: Tldr | null): { html: string; text: string; subject: string } {
  const date = new Date().toISOString().slice(0, 10);
  const dateShort = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const year = date.slice(0, 4);
  const adoptCount = clusters.filter(isAdopt).length;

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
          <b style="color:${C.ink};font-weight:600">${adoptCount}</b> adopt-worthy · <b style="color:${C.ink};font-weight:600">${total}</b> total · curated for Claude Code users
        </div>
        ${tldr && tldr.bullets.length ? tldrHtml(tldr.bullets) : ''}
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

  const tldrText = tldr && tldr.bullets.length
    ? `TL;DR\n${tldr.bullets.map(b => `  → ${b}`).join('\n')}\n\n`
    : '';
  const text = `AI Digest — ${dateShort}/${year}\n${adoptCount} adopt-worthy · ${total} total\n\n` + tldrText + SECTION_ORDER
    .filter(k => bySection.has(k))
    .map(k => {
      const body = bySection.get(k)!
        .map(c => {
          const h = c.primary.llmHeadline || c.primary.title;
          const s = (c.primary.llmSummary || c.primary.summary || '').trim();
          const tag = isAdopt(c) ? '[ADOPT] ' : '';
          return `- ${tag}${h}${s ? ' — ' + s : ''}\n  ${c.primary.url}`;
        })
        .join('\n');
      return `## ${SECTION_LABELS[k]}\n${body}`;
    })
    .join('\n\n') + `\n\nRead on the web: https://ao92265.github.io/ai-news-digest/`;

  const subject = `AI Digest ${dateShort} — ${adoptCount} adopt-worthy`;
  return { html, text, subject };
}
