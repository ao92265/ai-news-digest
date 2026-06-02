# ai-news-digest

Daily AI news digest, emailed at 07:00 UTC via GitHub Actions.

## Sources

RSS (TechCrunch, Verge, Ars, MIT Tech Review, Medium, YouTube) + arXiv cs.AI + Hacker News (keyword + points filter) + Google News (AI + LLM queries) + GitHub Trending (topic search, pushed in last 14 days, >50 stars).

Edit `src/sources.ts` to add/remove feeds or retune weights.

### Research Inbox (your Outlook "research" folder)

The `local-folder` source reads exported emails from `~/Desktop/ai-research-inbox`
and folds them into the digest, **de-paywalling the article each newsletter links
to** (free `r.jina.ai` reader, `archive.ph` fallback). No IMAP, no Microsoft Graph,
no admin consent — just `.eml`/`.txt`/`.html` files on disk. Tracking, unsubscribe,
and asset links are filtered out; the first real article link is fetched in full.

Getting your research-folder mail into that folder:

- **Manual drag (reliable, works on new Outlook 16):** select messages in the
  research folder and drag them to `~/Desktop/ai-research-inbox` in Finder — macOS
  Outlook writes each as a `.eml`.
- **Hands-off:** the *new* Outlook for Mac can't save-to-disk from a rule and has no
  usable AppleScript, so true automation would need the IMAP or Graph path this
  pipeline deliberately avoids. If you want it later, add an IMAP fetcher (himalaya
  or `imapflow`) alongside this source.

The source is a no-op until the folder has files, so it's safe to leave enabled.
Tune the `Research Inbox` entry in `src/sources.ts`: `degate: false` skips article
extraction; change `dir`/`weight` as needed.

## Pipeline

`fetch → dedupe (30-day URL store) → cluster (title Jaccard ≥ 0.45) → rank (source weight × recency × source-count) → top 25 → Claude Haiku summarize → render HTML → Resend`.

## Run locally

```sh
npm install
npm run dry-run           # builds ./out/digest.html, no email sent
npm run dry-run -- --source="Hacker News AI"   # single-source smoke test
npm run dry-run -- --hours=72                  # widen recency window
npm run digest            # sends email (requires env vars)
```

Env vars required to send:

- `ANTHROPIC_API_KEY` — Claude Haiku for summaries (optional; dry-run works without it)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — SMTP server creds
- `DIGEST_TO_EMAIL`, `DIGEST_FROM_EMAIL` — recipient + sender
- `GITHUB_TOKEN` (optional) — raises GitHub search API rate limit

## GitHub Actions

Workflow: `.github/workflows/digest.yml`. Add the four secrets to the repo (Settings → Secrets → Actions). `GITHUB_TOKEN` is auto-provided.

Manual run with preview: Actions → digest → Run workflow → `dry_run: true` → download `digest-preview` artifact.

## Cost

~$0.30/month in Claude Haiku tokens. Resend + GitHub Actions are free-tier.

## Tuning

- Drop noisy feeds from `src/sources.ts`.
- Raise HN points filter in `src/fetchers/hn.ts` if community section is spammy.
- Adjust cluster threshold in `src/index.ts` call to `cluster()` (higher = stricter grouping).
