import * as cheerio from 'cheerio';
import { URL } from 'url';
import { fetchPolitely } from './fetcher.js';
import { CONFIG } from './config.js';
import { BookSchema, type BookRecord } from './types.js';

export const discoverBookUrls = async (startUrl: string, maxPages: number): Promise<string[]> => {
  const discoveredUrls = new Set<string>();
  let currentUrl: string | null = startUrl;
  let pagesProcessed = 0;

  while (currentUrl && pagesProcessed < maxPages) {
    const html = await fetchPolitely(currentUrl);
    const $ = cheerio.load(html);

    // Extract book links
    $('.product_pod h3 a').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        discoveredUrls.add(new URL(href, currentUrl!).href);
      }
    });

    // Find next page
    const nextHref = $('.next a').attr('href');
    currentUrl = nextHref ? new URL(nextHref, currentUrl).href : null;
    pagesProcessed++;
  }

  return Array.from(discoveredUrls);
};


const parseRating = (classNames: string): number => {
  const map: Record<string, number> = { One: 1, Two: 2, Three: 3, Four: 4, Five: 5 };
  const ratingClass = classNames.split(' ').find(cls => cls in map);
  
  // Guarantee a number return type to satisfy the compiler
  return ratingClass ? (map[ratingClass] ?? 0) : 0; 
};
export const extractBookData = async (url: string, sourcePage: string): Promise<BookRecord> => {
  const html = await fetchPolitely(url);
  const $ = cheerio.load(html);
  
  const main = $('.product_main');
  
  const title = main.find('h1').text().trim();
  const raw_price = main.find('.price_color').text().trim();
  const raw_availability = main.find('.instock.availability').text().trim();
  const raw_rating = main.find('.star-rating').attr('class') || '';
  const description = $('#product_description').length 
    ? $('#product_description').next('p').text().trim() 
    : null;

  const rawData = {
    title,
    raw_price,
    price: parseFloat(raw_price.replace(/[^\d.]/g, '')),
    raw_availability,
    raw_rating,
    rating: parseRating(raw_rating),
    description,
    source_page: sourcePage,
    fetched_at: new Date().toISOString(),
  };

  return BookSchema.parse(rawData);
};