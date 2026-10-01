import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { stringify } from "csv-stringify/sync";
import * as cheerio from "cheerio";
import { z } from "zod";

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

type FetchOutcome =
  | { ok: true; url: string; html: string }
  | { ok: false; url: string; reason: string };

const ValidatedBookSchema = z.object({
  title: z.string().min(1),
  product_url: z.string().url(),
  price_gbp: z.number().positive(),
  price_text: z.string(),
  availability_text: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  description: z.string().nullable(),
  source_page: z.string().url(),
  fetched_at: z.string(),
});

type ValidatedBook = z.infer<typeof ValidatedBookSchema>;

const RATING_WORDS: Record<string, number> = {
  One: 1,
  Two: 2,
  Three: 3,
  Four: 4,
  Five: 5,
};
function parseRating(ratingText: string): number | null {
  return RATING_WORDS[ratingText] ?? null;
}


console.log(parseRating("Three"));
console.log(parseRating("Bogus"));

type ValidationResult = 
  | { ok: true; book: ValidatedBook }
  | { ok: false; url: string; reason: string };



function validateBook( raw: RawBook): ValidationResult  {
  const price_gbp = parsePriceGbp(raw.price_text);
  const rating = parseRating(raw.rating_text);

  const candidate = {
    title: raw.title,
    product_url: raw.product_url,
    price_gbp,
    price_text: raw.price_text,
    availability_text: raw.availability_text,
    rating,
    description: raw.description,
    source_page: raw.source_page,
    fetched_at: raw.fetched_at,
  };

  const result = ValidatedBookSchema.safeParse(candidate);

  if (result.success) {
    return { ok: true, book: result.data };
  }

  const reason = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return { ok: false, url: raw.product_url, reason };
}


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

class FetchStatusError extends Error {
  constructor(public status: number, url: string) {
    super(`Fetch failed: ${status} for ${url}`);
  }
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
    throw new FetchStatusError(response.status, url);
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

async function fetchBookPageSafe(url: string): Promise<FetchOutcome> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const html = await fetchBookPage(url);
      return { ok: true, url, html };
    } catch (err) {
      const isLastAttempt = attempt === 2;

      if (err instanceof FetchStatusError) {
        if (err.status === 404 || err.status === 403) {
          return { ok: false, url, reason: err.message };
        }
        if (isLastAttempt) {
          return { ok: false, url, reason: err.message };
        }
        console.log(`RETRY (${err.status}): ${url}`);
        continue;
      }

      const reason = err instanceof Error ? err.message : String(err);
      if (isLastAttempt) {
        return { ok: false, url, reason };
      }
      console.log(`RETRY (timeout/network): ${url}`);
    }
  }
  return { ok: false, url, reason: "unreachable" };
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

function parsePriceGbp(priceText: string): number | null {
  const match = priceText.match(/[\d.]+/);
  if (!match) return null;

  const value = parseFloat(match[0]);
  return  isNaN(value) ? null : value;
}


function writeBooksCsv(books: ValidatedBook[]): void {
  const csv = stringify(books, {
    header: true,
    columns: [
      "title",
      "product_url",
      "price_gbp",
      "price_text",
      "availability_text",
      "rating",
      "description",
      "source_page",
      "fetched_at",
    ],
  });

  writeFileSync("output/books.csv", csv, "utf-8");
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

async function extractAllRawBooks(): Promise<{ books: RawBook[]; fetchFailures: { url: string; reason: string }[] }> {
  const { links, pagesVisited } = await discoverAllBookLinks();
  const unique = [...new Set(links)];
  console.log(`catalogue_pages=${pagesVisited}`);
  console.log(`discovered=${links.length}`);
  console.log(`unique_urls=${unique.length}`);

  const books: RawBook[] = [];
  const fetchFailures: { url: string; reason: string }[] = [];

  for (const url of unique) {
    const outcome = await fetchBookPageSafe(url);
    if (!outcome.ok) {
      console.log(`SKIP (fetch failed): ${outcome.url} — ${outcome.reason}`);
      fetchFailures.push({ url: outcome.url, reason: outcome.reason });
      continue;
    }
    books.push(extractRawBook(outcome.html, url, url));
  }

  return { books, fetchFailures };
}


async function runPipeline(): Promise<void> {
  const startTime = Date.now();
  const startedAt = new Date(startTime).toISOString();
  const { books: rawBooks, fetchFailures } = await extractAllRawBooks();

  const validBooks: ValidatedBook[] = [];
  const validationErrors: { url: string; reason: string }[] = [];

  for (const raw of rawBooks) {
    const result = validateBook(raw);
    if (result.ok) {
      validBooks.push(result.book);
    } else {
      validationErrors.push({ url: result.url, reason: result.reason });
    }
  }

  const allErrors = [...fetchFailures, ...validationErrors];
  const durationMs = Date.now() - startTime;

  mkdirSync("output", { recursive: true });
  writeFileSync("output/books.json", JSON.stringify(validBooks, null, 2), "utf-8");
  writeFileSync("output/books.json", JSON.stringify(validBooks, null, 2), "utf-8");
  writeBooksCsv(validBooks);
  writeFileSync("output/errors.json", JSON.stringify(allErrors, null, 2), "utf-8");
  
  const report = {
    started_at: startedAt,
    duration_ms: durationMs,
    valid_records: validBooks.length,
    invalid_records: allErrors.length,
    failed_pages: fetchFailures.length,
  };

 writeFileSync("output/run-report.json", JSON.stringify(report, null, 2), "utf-8");

  console.log(report);
}

runPipeline();