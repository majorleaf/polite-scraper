import path from 'path';
import { fileURLToPath } from 'url';

// Recreate __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CONFIG = {
  BASE_URL: 'https://books.toscrape.com',
  USER_AGENT: 'PoliteScraper/1.0 (Educational Sandbox; +https://github.com/majorleaf/polite-scraper)',
  DELAY_MS: 500,
  CACHE_DIR: path.join(__dirname, '../.cache'),
  MAX_CATALOGUE_PAGES: 3,
  RECORDS_FILE: path.join(__dirname, '../records.json'),
  ERRORS_FILE: path.join(__dirname, '../errors.json'),
  REPORT_FILE: path.join(__dirname, '../run-report.json'),
};