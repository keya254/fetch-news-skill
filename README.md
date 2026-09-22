# fetch-news

Cursor Agent Skill for fetching, deduping, and optionally enriching news from curated RSS feeds.

Works in **any project** — install as a personal skill, then ask the agent to ingest or wire news pipelines.

## Install (Cursor)

```bash
mkdir -p ~/.cursor/skills
git clone https://github.com/keya254/fetch-news-skill.git ~/.cursor/skills/fetch-news
```

Or copy this folder into `~/.cursor/skills/fetch-news/`.

After install, the agent can use it whenever you mention news ingest, RSS, or feed pipelines.

## Quick fetch (no DB)

```bash
npx --yes tsx ~/.cursor/skills/fetch-news/scripts/fetch-feeds.ts --limit 5
```

Custom sources file (`[{ "name": "...", "url": "https://..." }]`):

```bash
npx --yes tsx ~/.cursor/skills/fetch-news/scripts/fetch-feeds.ts ./sources.json --limit 5
```

## Contents

| Path | Purpose |
|------|---------|
| `SKILL.md` | Agent instructions (workflow, caps, image waterfall) |
| `reference.md` | URL helpers, starter AI feeds, LLM quality gates |
| `scripts/fetch-feeds.ts` | Standalone RSS → JSON |
| `scripts/extract-og-image.ts` | Best-effort `og:image` scrape |

## License

MIT — use freely in personal or commercial projects.
