import { existsSync, readFileSync, writeFileSync } from "fs";
import * as cheerio from "cheerio";

const MAX_PAGES = 3;
const DELAY_MS = 600;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "FlyRankInternshipA9/1.0 (+https://github.com/majorleaf/polite-scraper)",
    },
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (response.status !== 200) {
    throw new Error(`Fetch failed: ${response.status} for ${url}`);
  }

  return await response.text();
}

async function fetchCatalougePage(pageNum: number): Promise<string> {
  const cachePath = `cache/catalogue-page-${pageNum}.html`;

  if (existsSync(cachePath)) {
    console.log(`CACHE HIT: ${cachePath}`);
    return readFileSync(cachePath, "utf-8");
  }

  const url = `https://books.toscrape.com/catalogue/page-${pageNum}.html`;
  console.log(`FETCH: ${url}`);
  await sleep(DELAY_MS);
  const html = await fetchPage(url);
  writeFileSync(cachePath, html, "utf-8");
  return html;
}

function extractBookLinksAndNext(
  html: string,
  pageUrl: string
): { bookLinks: string[]; nextPageUrl: string | null } {
  const $ = cheerio.load(html);
  const bookLinks: string[] = [];

  $("article.product_pod h3 a").each((_, el) => {
    const href = $(el).attr("href");
    if (href) {
      bookLinks.push(new URL(href, pageUrl).toString());
    }
  });

  const nextHref = $("li.next a").attr("href");
  const nextPageUrl = nextHref ? new URL(nextHref, pageUrl).toString() : null;

  return { bookLinks, nextPageUrl };
}

async function discoverAllBookLinks(): Promise<{ links: string[]; pagesVisited: number }> {
  const links: string[] = [];
  let pageNum = 1;
  let currentUrl: string | null = "https://books.toscrape.com/catalogue/page-1.html";

  while (currentUrl && pageNum <= MAX_PAGES) {
    const html = await fetchCatalougePage(pageNum);
    const result = extractBookLinksAndNext(html, currentUrl);

    links.push(...result.bookLinks);
    currentUrl = result.nextPageUrl;
    pageNum++;
  }

  return { links, pagesVisited: pageNum - 1 };
}

discoverAllBookLinks().then(({ links, pagesVisited }) => {
  const unique = [...new Set(links)];
  console.log(`catalogue_pages=${pagesVisited}`);
  console.log(`discovered=${links.length}`);
  console.log(`unique_urls=${unique.length}`);
});
