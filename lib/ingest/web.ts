import * as cheerio from "cheerio";
import { chunkText, type RawChunk } from "@/lib/rag/chunk";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function absolute(href: string, base: string) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

export async function extractWebsite(url: string): Promise<{
  title: string;
  text: string;
  chunks: RawChunk[];
}> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Failed to fetch site (${res.status})`);
  const html = await res.text();
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe, svg, nav, footer, form").remove();
  const title =
    $("meta[property='og:title']").attr("content") ||
    $("title").first().text().trim() ||
    new URL(url).hostname;
  const article = $("article").text() || $("main").text() || $("body").text();
  const text = article.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  if (text.length < 40) throw new Error("Could not extract readable text from this page.");
  return {
    title: title.slice(0, 180),
    text,
    chunks: chunkText(text, { url: absolute(url, url) }),
  };
}
