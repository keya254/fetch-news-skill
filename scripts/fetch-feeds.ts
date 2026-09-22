#!/usr/bin/env npx tsx
/**
 * Standalone RSS fetch — no DB, no LLM.
 * Usage:
 *   npx --yes tsx fetch-feeds.ts
 *   npx --yes tsx fetch-feeds.ts ./sources.json
 *   npx --yes tsx fetch-feeds.ts --limit 5
 *
 * sources.json: [{ "name": "...", "url": "https://..." }, ...]
 */
import Parser from "rss-parser";
import fs from "node:fs";
import path from "node:path";

type FeedSource = { name: string; url: string };

const DEFAULT_SOURCES: FeedSource[] = [
  { name: "OpenAI News", url: "https://openai.com/news/rss.xml" },
  { name: "Anthropic News", url: "https://www.anthropic.com/rss.xml" },
  { name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml" },
  { name: "TechCrunch - AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
];

const TRACKING_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "fbclid", "gclid", "mc_cid", "mc_eid",
];

function canonicalizeSourceUrl(url: string): string {
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

function loadSources(argv: string[]): FeedSource[] {
  const fileArg = argv.find((a) => !a.startsWith("-") && a.endsWith(".json"));
  if (!fileArg) return DEFAULT_SOURCES;
  const abs = path.resolve(fileArg);
  const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
  if (!Array.isArray(raw)) throw new Error("sources file must be an array");
  return raw as FeedSource[];
}

function limitFromArgv(argv: string[]): number {
  const i = argv.indexOf("--limit");
  if (i >= 0 && argv[i + 1]) return Math.max(1, Number(argv[i + 1]) || 10);
  return 10;
}

async function main() {
  const argv = process.argv.slice(2);
  const sources = loadSources(argv);
  const perFeed = limitFromArgv(argv);
  const parser = new Parser();
  const out: {
    source: string;
    title: string;
    link: string;
    publishedAt: string | null;
    snippet: string;
  }[] = [];

  for (const source of sources) {
    let feed;
    try {
      feed = await parser.parseURL(source.url);
    } catch (err) {
      console.error(`# skip ${source.name}: ${(err as Error).message}`);
      continue;
    }
    const items = (feed.items ?? []).slice(0, perFeed);
    for (const item of items) {
      if (!item.link) continue;
      out.push({
        source: source.name,
        title: item.title || "Untitled",
        link: canonicalizeSourceUrl(item.link),
        publishedAt: item.isoDate ?? item.pubDate ?? null,
        snippet: (item.contentSnippet || item.content || "").slice(0, 280),
      });
    }
  }

  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
