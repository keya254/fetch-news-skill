---
name: fetch-news
description: >-
  Fetch, dedupe, and optionally enrich news from curated RSS feeds. Use when
  building or debugging news ingestion, RSS parsers, newsroom agents, article
  pipelines, feed sources, source-URL canonicalization, og:image covers, or
  scheduled news fetch jobs in any project.
---

# Fetch News

Reusable pattern for pulling news into a product: curated RSS → sanitize →
dedupe → optional LLM enrich → store. Prefer this over scraping HTML when a
feed exists.

## When to apply

- User asks to fetch / ingest / poll news, headlines, or RSS
- Designing a news agent, cron ingest job, or backfill
- Wiring source URLs, trust filters, or cover-image fallbacks

## Default stack

| Piece | Choice |
|-------|--------|
| Fetch | `rss-parser` (Node) or `feedparser` (Python) |
| Dedupe key | Canonical `sourceUrl` (unique in DB) |
| Enrichment | Optional LLM JSON draft (OpenRouter / OpenAI / etc.) |
| Images | RSS media → page `og:image` → generated / stock |
| Schedule | Cron / worker every 30–60m; fail per-feed, not whole run |

## Workflow checklist

```
News ingest:
- [ ] 1. Define FeedSource[] (name + url)
- [ ] 2. Parse each feed; skip fail, continue
- [ ] 3. Canonicalize + trust-check sourceUrl
- [ ] 4. Skip if sourceUrl already stored
- [ ] 5. Cap new items per feed/run (cost control)
- [ ] 6. Draft / store (raw snippet or LLM article)
- [ ] 7. Resolve cover image waterfall
- [ ] 8. Insert; treat unique conflicts as already-seen
```

## 1. Curated sources

Keep feeds in one editable list. Dead feeds must not abort the run.

```ts
export interface FeedSource { name: string; url: string }

export const FEED_SOURCES: FeedSource[] = [
  { name: "Example Blog", url: "https://example.com/feed.xml" },
];
```

Pick feeds that match the product vertical. AI/ML starter list lives in
[reference.md](reference.md#starter-ai-feeds).

## 2. Parse with isolation

```ts
import Parser from "rss-parser";

const parser = new Parser({
  customFields: { item: ["content:encoded", "media:content", "media:thumbnail"] },
});

for (const source of FEED_SOURCES) {
  let feed;
  try {
    feed = await parser.parseURL(source.url);
  } catch (err) {
    console.warn(`Skipping feed "${source.name}": ${(err as Error).message}`);
    continue;
  }
  // process feed.items
}
```

## 3. Canonicalize + trust

Before dedupe or insert:

- Strip hash, lowercase host, drop trailing `/`, remove UTM / click IDs
- Reject empty, non-http(s), `example.com`, `localhost`, seed placeholders

```ts
canonicalizeSourceUrl(raw)  // → stable string
isPublishableSource({ sourceUrl, sourceName })  // → boolean
```

Full helpers: [reference.md](reference.md#url-helpers).

## 4. Dedupe

- Unique index on `sourceUrl`
- `findUnique` / skip before spending LLM tokens
- On insert race, catch unique violation and continue

Also store original RSS description/snippet as `rawDescription` if you ever plan
LLM backfills — do not overwrite the only source text with a short dek.

## 5. Cost caps

Every new item may cost an LLM call. Per run:

- Sort by `isoDate` desc
- Process at most **N new items per feed** (default 3) and **M total** (default 20)
- On a warm DB, skip items older than a freshness window (default 168h); disabled on cold start
- Sleep `NEWS_LLM_DELAY_MS` (default 750) between draft calls

Env: `NEWS_MAX_NEW_PER_FEED`, `NEWS_MAX_NEW_PER_RUN`, `NEWS_FRESHNESS_HOURS`, `NEWS_LLM_DELAY_MS`.

## 6. Optional LLM draft

When rewriting into long-form:

1. Ask for **JSON only** (`dek`, `body`, `whyItMatters`, taxonomies)
2. Keep **category** (story shape) orthogonal to **topic** (subject)
3. Coerce model output onto fixed enums (never trust free-text tags)
4. Quality gate: min word count + cliché regexes → one retry, then keep best
5. Missing API key → no-op the enrich path; do not crash the worker

Prompt / cliché patterns: [reference.md](reference.md#llm-quality).

## 7. Cover image waterfall

Never leave articles imageless if a fallback exists:

1. RSS `media:content` / `media:thumbnail` / image enclosure / first `<img>`
2. Fetch article HTML → `og:image` / `twitter:image` (8s timeout, bot UA)
3. Optional image model
4. Deterministic stock / procedural cover keyed by slug

`extractOgImage`: [scripts/extract-og-image.ts](scripts/extract-og-image.ts)

## 8. Persistence shape (minimal)

```ts
{
  slug: string;          // unique, from title
  title: string;
  summary: string;       // dek / card preview
  body?: string;         // optional long form
  sourceUrl: string;     // unique, canonical
  sourceName: string;
  imageUrl?: string;
  category?: string;
  topic?: string;
  publishedAt: Date;
  rawDescription?: string; // keep RSS snippet for re-drafts
}
```

## 9. Scheduling

- Interval env var (e.g. `NEWS_INGEST_INTERVAL_MINUTES=60`)
- Run once on worker boot, then on cron
- Log `{ fetched, inserted }` every run
- Config errors (missing key) → warn and return zeros

## Quick fetch (no DB)

For ad-hoc “what’s new” without a project schema, run:

```bash
npx --yes tsx ~/.cursor/skills/fetch-news/scripts/fetch-feeds.ts
# or with a custom sources file:
npx --yes tsx ~/.cursor/skills/fetch-news/scripts/fetch-feeds.ts ./sources.json
```

Prints JSON: `{ source, title, link, publishedAt, snippet }[]`.

## Project adaptation

When implementing inside a repo:

1. Add `rss-parser` (or Python equivalent)
2. Copy URL helpers + og-image script patterns
3. Wire `FEED_SOURCES` to the vertical
4. Hook store layer (Prisma / SQL / CMS)
5. Gate LLM behind env key; add per-run caps
6. Expose `npm run agent:ingest-news` (or equivalent)

## Anti-patterns

- Failing the whole job when one feed 404s
- Deduping on title alone (collisions across outlets)
- Storing tracking-query URLs as the unique key
- Re-drafting every historical item on each cron tick
- Inventing benchmark numbers in LLM copy
- Using the same stock photo for every article

## More detail

- [reference.md](reference.md) — URL helpers, AI feed list, LLM gates, schema notes
- [scripts/fetch-feeds.ts](scripts/fetch-feeds.ts) — standalone RSS fetch
- [scripts/extract-og-image.ts](scripts/extract-og-image.ts) — og:image helper
