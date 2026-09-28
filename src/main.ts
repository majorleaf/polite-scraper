import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import * as cheerio from "cheerio";

const DEBUG = process.env.DEBUG === "1";
const debug = (label: string, value: unknown): void => {
  if (DEBUG) console.log(`[debug] ${label}:`, JSON.stringify(value));
};

const MAX_PAGES = 3;
const DELAY_MS = 600;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

type CoreFields = {
  title: string;
  price_text: string;
  availability_text: string;
  rating_text: string;
};

type RawBook = {
  title: string;
  product_url: string;
  price_text: string;
  availability_text: string;
  rating_text: string;
  description: string | null;
  source_page: string;
  fetched_at: string;
};

function extractCoreFields(html: string): CoreFields {
  const $ = cheerio.load(html);
  const product = $("div.product_main");

  const title = product.find("h1").text().trim();
  const price_text = product.find("p.price_color").text().trim();
  const availability_text = product.find("p.availability").text().trim();

  const ratingClass = product.find("p.star-rating").attr("class") ?? "";
  const rating_text = ratingClass.replace("star-rating", "").trim();

  return { title, price_text, availability_text, rating_text };
}

function extractDescription(html: string): string | null {
  const $ = cheerio.load(html);
  const match = $("article.product_page #product_description + p");
  debug("description matches", match.length);

  if (match.length === 0) return null;

  const text = match.text().trim();
  return text === "" ? null : text;
}

function extractRawBook(html: string, productUrl: string, sourcePage: string): RawBook {
  const core = extractCoreFields(html);
  const description = extractDescription(html);

  return {
    title: core.title,
    product_url: productUrl,
    price_text: core.price_text,
    availability_text: core.availability_text,
    rating_text: core.rating_text,
    description,
    source_page: sourcePage,
    fetched_at: new Date().toISOString(),
  };
}

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

async function fetchBookPage(url: string): Promise<string> {
  const slug = new URL(url).pathname.split("/").at(-2);
  const cachePath = `cache/books/${slug}.html`;

  if (existsSync(cachePath)) {
    console.log(`CACHE HIT: ${cachePath}`);
    return readFileSync(cachePath, "utf-8");
  }

  console.log(`FETCH: ${url}`);
  await sleep(DELAY_MS);
  const html = await fetchPage(url);
  mkdirSync("cache/books", { recursive: true });
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

async function extractAllRawBooks(): Promise<RawBook[]> {
  const { links, pagesVisited } = await discoverAllBookLinks();
  const unique = [...new Set(links)];
  console.log(`catalogue_pages=${pagesVisited}`);
  console.log(`discovered=${links.length}`);
  console.log(`unique_urls=${unique.length}`);

  const books: RawBook[] = [];

  for (const url of unique) {
    const html = await fetchBookPage(url);
    const sourcePage = url; // placeholder — fixed in the next stage
    books.push(extractRawBook(html, url, sourcePage));
  }

  return books;
}

extractAllRawBooks().then((books) => {
  console.log(`detail_pages=${books.length}`);
  console.log(books[0]);
});
