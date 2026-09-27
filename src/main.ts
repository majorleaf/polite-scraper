import { existsSync, readFileSync, writeFileSync } from "fs";
import * as cheerio from "cheerio";


async function fetchPage(url : string): Promise<string> { 
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
   const response = await fetch(url , {
    headers: {
        "User-Agent": "FlyRankInternshipA9/1.0 (+https://github.com/majorleaf/polite-scraper)", 
    },
    signal: controller.signal
   });
   clearTimeout(timeoutId);

   if (response.status !== 200 ) {
    throw new Error(`Fetch failed: ${response.status}  for ${url}`)
   }
   const html = await response.text();
   return html;
}

function extractBooksLinksAndNext(html: string, pageUrl: string): { bookLinks: string[]; nextPageUrl: string | null } {
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

fetchCatalougePage(1) .then(html => {
    const $ = cheerio.load(html);
  const pageUrl = "https://books.toscrape.com/catalogue/page-1.html";
    const links: string[] = [];

    $("article.product_pod h3 a").each((_, el) => {
        const href = $(el).attr("href");
        if (href) {
            const absoluteUrl = new URL(href, pageUrl).toString();
            links.push(absoluteUrl);
        }
    });

    const nextHref = $("li.next a").attr("href");
    const nextPageUrl = nextHref ? new URL(nextHref, pageUrl).toString() : null;

    console.log(links.length);
    console.log(links[0]);
    console.log("next page:", nextPageUrl);
    console.log("result.bookLinks.length");
    console.log("result.nextPageUrl");
});


async function fetchCatalougePage(pageNum: number): Promise<string> {
  const cachePath = `cache/catalogue-page-${pageNum}.html`;

  if (existsSync(cachePath)) {
    console.log(`CACHE HIT: ${cachePath}`);
    const html = readFileSync(cachePath, "utf-8");
    return html;
  }

  const url = `https://books.toscrape.com/catalogue/page-${pageNum}.html`;
  console.log(`FETCH: ${url}`);
  const html = await fetchPage(url);
  writeFileSync(cachePath, html, "utf-8");
  return html;
}
