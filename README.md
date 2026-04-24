# ai-news-digest

Daily AI news digest, emailed at 07:00 UTC via GitHub Actions.

## Sources

RSS (TechCrunch, Verge, Ars, MIT Tech Review, Medium, YouTube) + arXiv cs.AI + Hacker News (keyword + points filter) + Google News (AI + LLM queries) + GitHub Trending (topic search, pushed in last 14 days, >50 stars).

Edit `src/sources.ts` to add/remove feeds or retune weights.

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
