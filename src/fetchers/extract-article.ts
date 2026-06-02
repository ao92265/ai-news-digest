// De-paywall / full-text extraction for links found in research-folder emails.
//
// Newsletters are mostly short blurbs that link out to the real (often paywalled
// or reader-mode) article. This pulls the actual article text so the digest
// ranks on real content, not the teaser.
//
// Primary:  r.jina.ai reader — returns clean text/markdown, no API key, handles
//           reader-mode and many soft paywalls.
// Fallback: archive.ph newest snapshot.
// Best-effort: returns null on failure so the caller falls back to the email body.

const READER = 'https://r.jina.ai/';
const ARCHIVE = 'https://archive.ph/newest/';
const TIMEOUT_MS = 20000;

function detag(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function extractArticle(url: string): Promise<{ title?: string; text: string } | null> {
  // 1) r.jina.ai reader
  try {
    // Default (markdown) format gives a clean "Title:" header + "Markdown
    // Content:" body with nav/boilerplate stripped — better than raw text.
    const res = await fetch(READER + url, {
      headers: { 'User-Agent': 'ai-news-digest/0.1 (+github.com/ao92265)' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) {
      const body = (await res.text()).trim();
      if (body.length > 200) {
        const title =
          body.match(/^Title:\s*(.+)$/m)?.[1]?.trim() ||
          body.match(/^#\s+(.+)$/m)?.[1]?.trim();
        const idx = body.indexOf('Markdown Content:');
        const text = (idx >= 0 ? body.slice(idx + 'Markdown Content:'.length) : body).trim();
        if (text.length > 100) return { title, text };
      }
    }
  } catch {
    /* fall through to archive */
  }

  // 2) archive.ph fallback
  try {
    const res = await fetch(ARCHIVE + url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) {
      const text = detag(await res.text());
      if (text.length > 200) return { text };
    }
  } catch {
    /* give up */
  }

  return null;
}
