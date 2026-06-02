import fs from 'node:fs/promises';
import path from 'node:path';
import { simpleParser } from 'mailparser';
import { sha256 } from '../hash.js';
import type { Category, Item } from '../types.js';
import { extractArticle } from './extract-article.js';

// Reads a local folder of exported emails (e.g. an Outlook "research" folder
// dragged to ~/Desktop/ai-research-inbox as .eml files), pulls the article each
// newsletter links to, de-paywalls it, and emits Items for the existing
// dedup/cluster/rank/render pipeline. No IMAP, no Graph, no admin consent —
// just files on disk.

const LINK_RX = /https?:\/\/[^\s"'<>)\]]+/gi;
const SUMMARY_CAP = 500; // match stripHtml's cap so the digest doesn't bloat

// Drop tracking/unsubscribe/asset/share links — keep article-ish ones.
const SKIP_LINK_RX =
  /(unsubscribe|list-manage|mailchi\.mp|sendgrid|mailgun|\/track|\/click\?|\/c\/|utm_source=email|beacon|pixel|\.(png|jpe?g|gif|svg|css|js|ico)(\?|$)|(twitter|x)\.com\/intent|facebook\.com\/sharer|linkedin\.com\/share)/i;

function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(process.env.HOME || '', p.slice(1)) : p;
}

function detag(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickLinks(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of body.match(LINK_RX) || []) {
    const url = m.replace(/[.,);]+$/, '');
    if (SKIP_LINK_RX.test(url) || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

export async function fetchLocalFolder(
  name: string,
  dir: string,
  category: Category,
  weight: number,
  opts?: { degate?: boolean },
): Promise<Item[]> {
  const degate = opts?.degate ?? true;
  const root = expandHome(dir);

  let files: string[];
  try {
    files = (await fs.readdir(root))
      .filter(f => /\.(eml|txt|html?)$/i.test(f))
      .map(f => path.join(root, f));
  } catch {
    return []; // folder doesn't exist yet — safe no-op
  }

  const items: Item[] = [];
  for (const file of files) {
    try {
      const raw = await fs.readFile(file);
      let title = path.basename(file).replace(/\.(eml|txt|html?)$/i, '');
      let fullText = '';
      let dateIso = new Date().toISOString();

      if (/\.eml$/i.test(file)) {
        const parsed = await simpleParser(raw);
        if (parsed.subject) title = parsed.subject;
        fullText = (parsed.text || (parsed.html ? detag(parsed.html) : '')).trim();
        if (parsed.date) dateIso = parsed.date.toISOString();
      } else if (/\.html?$/i.test(file)) {
        fullText = detag(raw.toString('utf8'));
      } else {
        fullText = raw.toString('utf8').replace(/\s+/g, ' ').trim();
      }

      // Scan links from the FULL body (before truncation), then de-paywall the
      // primary one for real content.
      const links = pickLinks(fullText);
      const primary = links[0];
      let url = primary || `research://${encodeURIComponent(path.basename(file))}`;
      let summary = fullText.slice(0, SUMMARY_CAP);

      if (degate && primary) {
        const art = await extractArticle(primary);
        if (art?.text) {
          summary = art.text.slice(0, SUMMARY_CAP);
          if (art.title) title = art.title;
        }
      }

      items.push({
        id: sha256(url),
        title: title.replace(/\s+/g, ' ').trim().slice(0, 240),
        url,
        source: name,
        category,
        publishedAt: dateIso,
        summary: summary.replace(/\s+/g, ' ').trim(),
        weight,
      });
    } catch (err) {
      console.error(`  ${name}: skipped ${path.basename(file)} — ${err instanceof Error ? err.message : err}`);
    }
  }
  return items;
}
