# Fetch News — Reference

## URL helpers

```ts
const TRACKING_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "fbclid", "gclid", "mc_cid", "mc_eid",
];

export function canonicalizeSourceUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    for (const key of TRACKING_PARAMS) u.searchParams.delete(key);
    return u.toString();
  } catch {
    return url.trim();
  }
}

export function isPublishableSource(opts: {
  sourceUrl: string;
  sourceName?: string | null;
}): boolean {
  const { sourceUrl, sourceName } = opts;
  if (!sourceUrl?.trim()) return false;
  if (sourceName && /illustrative\s+seed/i.test(sourceName)) return false;
  try {
    const u = new URL(sourceUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "example.com" || host.endsWith(".example.com") || host === "localhost") {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
```

## Starter AI feeds

```ts
export const FEED_SOURCES = [
  { name: "OpenAI News", url: "https://openai.com/news/rss.xml" },
  { name: "Anthropic News", url: "https://www.anthropic.com/rss.xml" },
  { name: "Google DeepMind Blog", url: "https://deepmind.google/blog/rss.xml" },
  { name: "Google AI Blog", url: "https://blog.google/technology/ai/rss/" },
  { name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml" },
  { name: "Meta AI Blog", url: "https://ai.meta.com/blog/rss/" },
  { name: "Microsoft AI Blog", url: "https://blogs.microsoft.com/ai/feed/" },
  { name: "MIT Technology Review - AI", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed" },
  { name: "The Verge - AI", url: "https://www.theverge.com/ai-artificial-intelligence/rss/index.xml" },
  { name: "Ars Technica - AI", url: "https://arstechnica.com/ai/feed/" },
  { name: "VentureBeat - AI", url: "https://venturebeat.com/category/ai/feed/" },
  { name: "TechCrunch - AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { name: "The Batch (DeepLearning.AI)", url: "https://www.deeplearning.ai/the-batch/feed/" },
];
```

Replace freely for other verticals (crypto, climate, local news, etc.).

## Taxonomy pattern

Keep two orthogonal axes:

| Axis | Role | Example values |
|------|------|----------------|
| Category | Story shape / newsroom tag | BREAKING, DEVELOPING, ANALYSIS, NEW_RELEASE, UPDATE, RUMOR |
| Topic | Subject matter | Models, Research, Open Source, Business & Policy, Products |

Always `coerce*` LLM output onto the written enum lists. Prefer a safe default
(e.g. ANALYSIS / Business & Policy) over inventing tags.

## LLM quality

### Cliché blocklist (retry if matched)

```ts
const CLICHE_PATTERNS: RegExp[] = [
  /^#\s/m,
  /\bin (a|this) (significant|rapidly evolving|fast-moving|dynamic) development\b/i,
  /\bas .{0,40} continues to evolve\b/i,
  /\bunderscores the (urgent )?need for\b/i,
  /\bhighlights the (importance|need|urgent)\b/i,
  /\bin (today's|the ever-evolving|the rapidly changing)\b/i,
  /\bit(?:'s| is) worth noting\b/i,
  /\bin conclusion\b/i,
  /\bdelve\b/i,
  /\btestament to\b/i,
  /\bnavigat(?:e|ing) (the|this)\b/i,
  /\bfoster(?:ing)? (innovation|dialogue|collaboration)\b/i,
];
```

### Retry policy

1. Draft once with `response_format: json_object` (or equivalent)
2. If too short **or** cliched → one retry with an explicit complaint
3. Keep retry only if clearly better; otherwise keep first draft
4. Never fail the whole ingest over one bad article

### Prompt shape (adapt voice to brand)

Ask for JSON: `dek`, `body`, `whyItMatters`, `category`, `topic`, optional
`relatedEntity`. Require concrete openings, no leading `# Title`, structured
sections only when facts support them. Ban invented numeric scores.

## RSS image extraction

```ts
function extractImageUrl(item: {
  enclosure?: { url?: string; type?: string };
  content?: string;
  "content:encoded"?: string;
  "media:content"?: { $?: { url?: string } } | { $?: { url?: string } }[];
  "media:thumbnail"?: { $?: { url?: string } };
}): string | null {
  const media = item["media:content"];
  const mediaUrl = Array.isArray(media) ? media[0]?.$?.url : media?.$?.url;
  if (mediaUrl) return mediaUrl;
  if (item["media:thumbnail"]?.$?.url) return item["media:thumbnail"].$!.url!;
  if (item.enclosure?.url && item.enclosure.type?.startsWith("image")) {
    return item.enclosure.url;
  }
  const html = item["content:encoded"] || item.content || "";
  const match = html.match(/<img[^>]+src="([^"]+)"/i);
  return match ? match[1] : null;
}
```

## Backfill rules

When schema gains fields (`body`, `topic`, `imageUrl`):

- Target only rows missing the new field (idempotent)
- Topic-only classification = cheap tokens; full redraft = opt-in `--force`
- Prefer stored `rawDescription` over the short `summary` as LLM input

## Env vars (suggested)

| Var | Purpose |
|-----|---------|
| `OPENROUTER_API_KEY` / `OPENAI_API_KEY` | LLM enrich (optional) |
| `*_WRITER_MODEL` | Override draft model |
| `*_IMAGE_MODEL` | Optional cover generation |
| `NEWS_INGEST_INTERVAL_MINUTES` | Cron interval (default 60) |
| `NEWS_MAX_NEW_PER_FEED` | Cap new LLM drafts per feed per run (default 3) |
| `NEWS_MAX_NEW_PER_RUN` | Global cap per run (default 20) |
| `NEWS_FRESHNESS_HOURS` | Skip older items when DB is warm (default 168; 0 = off) |
| `NEWS_LLM_DELAY_MS` | Pause between draft calls (default 750) |
