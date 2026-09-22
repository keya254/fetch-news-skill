/**
 * Best-effort og:image / twitter:image from an article URL.
 * Returns absolute URL or null. Never throws.
 */
export async function extractOgImage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; news-bot/1.0)",
        },
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("html")) return null;

    const html = await res.text();
    const metaTags = html.match(/<meta\s+[^>]*>/gi) ?? [];
    for (const tag of metaTags) {
      const isImageMeta =
        /property=["'](?:og:image|og:image:secure_url)["']/i.test(tag) ||
        /name=["']twitter:image["']/i.test(tag);
      if (!isImageMeta) continue;

      const content = tag.match(/content=["']([^"']+)["']/i)?.[1];
      if (!content) continue;

      try {
        return new URL(content, url).toString();
      } catch {
        return content;
      }
    }
    return null;
  } catch {
    return null;
  }
}

if (typeof require !== "undefined" && require.main === module) {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: npx tsx extract-og-image.ts <article-url>");
    process.exit(1);
  }
  extractOgImage(url).then((img) => {
    console.log(img ?? "");
    process.exit(img ? 0 : 2);
  });
}
