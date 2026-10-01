import fs from 'fs/promises';
import { CONFIG } from './config.js';
import { discoverBookUrls, extractBookData } from './scraper.js';
import type { ScrapeReport } from './types.js';
import { z } from 'zod';

async function main() {
  const startTime = Date.now();
  const startUrl = `${CONFIG.BASE_URL}/catalogue/page-1.html`;
  const bookUrls = await discoverBookUrls(startUrl, CONFIG.MAX_CATALOGUE_PAGES);
  console.log(`Discovered ${bookUrls.length} unique book URLs.`);

  // Deliberately broken URL to prove Stage 5 requirements
  bookUrls.push(`${CONFIG.BASE_URL}/catalogue/this-page-does-not-exist-404.html`);
  const validRecords = [];
  const errors = [];
  let failedPages = 0;

  for (const url of bookUrls) {
    try {
      const record = await extractBookData(url, startUrl);
      validRecords.push(record);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error(`[VALIDATION ERROR] ${url}`);
       errors.push({ url, reason: error.issues });
      } else {
        console.error(`[FETCH/PARSE ERROR] Failed to process ${url}: ${(error as Error).message}`);
        failedPages++;
      }
    }
  }

  // Idempotent write (overwrite, no append)
  await fs.writeFile(CONFIG.RECORDS_FILE, JSON.stringify(validRecords, null, 2));
  if (errors.length > 0) {
    await fs.writeFile(CONFIG.ERRORS_FILE, JSON.stringify(errors, null, 2));
  }

  const report: ScrapeReport = {
    start_time: new Date(startTime).toISOString(),
    duration_ms: Date.now() - startTime,
    valid_records: validRecords.length,
    invalid_records: errors.length,
    failed_pages: failedPages,
  };

  await fs.writeFile(CONFIG.REPORT_FILE, JSON.stringify(report, null, 2));
  console.log('\n--- STAGE 6: Run Report ---');
  console.log(report);
}

main().catch(console.error);