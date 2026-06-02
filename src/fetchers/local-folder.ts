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
//
// Forwarded mail is messy: corp "[EXTERNAL]" subject prefixes, "Fwd:" noise, and
// accidental social shares (TikTok/Instagram). We strip the prefixes, drop the
// junk, then de-paywall survivors with bounded concurrency (one-at-a-time over
// 40+ mails would crawl).

const LINK_RX = /https?:\/\/[^\s"'<>)\]]+/gi;
const SUMMARY_CAP = 500; // match stripHtml's cap so the digest doesn't bloat
const DEGATE_CONCURRENCY = 4;

// Links that are never article content — tracking, unsubscribe, assets, and
// social shares (TikTok/Instagram/YouTube/X/FB/LinkedIn).
const SKIP_LINK_RX =
  /(unsubscribe|list-manage|mailchi\.mp|sendgrid|mailgun|\/track|\/click\?|\/c\/|utm_source=email|beacon|pixel|accounts\.google|\/login|\/sign-?in|\/sso\b|googleusercontent|\.(png|jpe?g|gif|svg|css|js|ico)(\?|$)|tiktok\.com|instagram\.com|youtu\.?be|fb\.watch|(twitter|x)\.com\/intent|facebook\.com\/sharer|linkedin\.com\/share)/i;

// Subjects that mark an email as social rather than a research article.
const SOCIAL_SUBJECT_RX =
  /\b(tiktok|instagram|take a look at this|liked your|started following|sent you a|new follower|watch .* reel|story from .* on (snapchat|facebook))\b/i;

// Extraction that hit a login/bot/cloudflare wall — not real article content.
const WALL_RX =
  /\b(just a moment|attention required|sign in|log ?in|enable javascript|access denied|you have been blocked|verify you are human|are you a robot|please verify|captcha)\b/i;

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

// Remove corp external-sender warning banners so they never become a title/summary.
function stripBanners(s: string): string {
  return s
    .replace(/CAUTION:\s*This email originated from outside[^]*?(?:content is safe\.?|safe\.)/i, ' ')
    .replace(/\bThis (?:e-?mail|message) (?:originated|came) from outside[^]*?safe\.?/i, ' ')
    .replace(/\[EXTERNAL\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Strip corp gateway + forward/reply prefixes: "[EXTERNAL]Fwd: Re: X" -> "X".
function cleanSubject(s: string): string {
  let t = (s || '').trim();
  let prev = '';
  while (t !== prev) {
    prev = t;
    t = t.replace(/^\[external\]\s*/i, '').replace(/^(fwd|fw|re):\s*/i, '').trim();
  }
  return t;
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

// Run an async fn over items with a fixed concurrency cap.
async function mapPool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

type Parsed = { file: string; title: string; rawSubject: string; fullText: string; dateIso: string; links: string[]; kind: 'article' | 'social' };

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

  // Phase 1 — parse + classify (fast, no network). Keep EVERYTHING; nothing is
  // silently dropped. Social/non-article mail is tagged 'social', not discarded,
  // so the digest faithfully accounts for every email in the folder.
  const parsed: Parsed[] = [];
  for (const file of files) {
    try {
      const raw = await fs.readFile(file);
      let rawSubject = path.basename(file).replace(/\.(eml|txt|html?)$/i, '');
      let fullText = '';
      let dateIso = new Date().toISOString();

      if (/\.eml$/i.test(file)) {
        const m = await simpleParser(raw);
        if (m.subject) rawSubject = m.subject;
        fullText = (m.text || (m.html ? detag(m.html) : '')).trim();
        if (m.date) dateIso = m.date.toISOString();
      } else if (/\.html?$/i.test(file)) {
        fullText = detag(raw.toString('utf8'));
      } else {
        fullText = raw.toString('utf8').replace(/\s+/g, ' ').trim();
      }

      fullText = stripBanners(fullText);
      const title = cleanSubject(rawSubject);
      const links = pickLinks(fullText);
      const kind: 'article' | 'social' =
        SOCIAL_SUBJECT_RX.test(rawSubject) || (!links.length && title.length < 4) ? 'social' : 'article';

      parsed.push({ file, title, rawSubject, fullText, dateIso, links, kind });
    } catch (err) {
      console.error(`  ${name}: unreadable ${path.basename(file)} — ${err instanceof Error ? err.message : err}`);
    }
  }
  const nSocial = parsed.filter(p => p.kind === 'social').length;
  console.log(`  ${name}: ${parsed.length} item(s) kept — ${parsed.length - nSocial} article(s), ${nSocial} social (none dropped)`);

  // Phase 2 — de-paywall ARTICLES with bounded concurrency; social kept as-is at
  // low weight so it ranks last but still appears.
  const items = await mapPool(parsed, degate ? DEGATE_CONCURRENCY : parsed.length, async (p): Promise<Item> => {
    const primary = p.links[0];
    const url = primary || `research://${encodeURIComponent(path.basename(p.file))}`;
    let title = p.title;
    let summary = p.fullText.slice(0, SUMMARY_CAP);

    if (degate && p.kind === 'article' && primary) {
      const art = await extractArticle(primary);
      // Ignore extractions that hit a login/bot wall — keep the email's own text
      // so the title stays meaningful instead of "Sign in" / "Just a moment".
      const head = `${art?.title || ''} ${(art?.text || '').slice(0, 120)}`;
      if (art?.text && !WALL_RX.test(head)) {
        summary = art.text.slice(0, SUMMARY_CAP);
        if (art.title && !WALL_RX.test(art.title)) title = cleanSubject(art.title);
      }
    }

    if (!title || title.length < 3) {
      title = p.kind === 'social' ? 'Shared post' : (p.fullText.slice(0, 60).trim() || 'Research item');
    }

    return {
      id: sha256(url),
      title: title.replace(/\s+/g, ' ').trim().slice(0, 240),
      url,
      source: name,
      category: p.kind === 'social' ? 'community' : category,
      publishedAt: p.dateIso,
      summary: summary.replace(/\s+/g, ' ').trim(),
      weight: p.kind === 'social' ? weight * 0.3 : weight,
    };
  });

  return items;
}
