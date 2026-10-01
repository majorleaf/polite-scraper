import axios, { AxiosError } from 'axios';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { CONFIG } from './config.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getCachePath = (url: string) => {
  const hash = crypto.createHash('md5').update(url).digest('hex');
  return path.join(CONFIG.CACHE_DIR, `${hash}.html`);
};

export const fetchPolitely = async (url: string, retryCount = 0): Promise<string> => {
  await fs.mkdir(CONFIG.CACHE_DIR, { recursive: true });
  const cachePath = getCachePath(url);

  try {
    const cachedContent = await fs.readFile(cachePath, 'utf-8');
    console.log(`[CACHE HIT] ${url}`);
    return cachedContent;
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }

  console.log(`[FETCH] ${url}`);
  await sleep(CONFIG.DELAY_MS);

  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': CONFIG.USER_AGENT },
      timeout: 10000,
    });
    
    const html = response.data;
    await fs.writeFile(cachePath, html, 'utf-8');
    return html;
  } catch (error) {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const isRetryable = error.code === 'ECONNABORTED' || (status && status >= 500);
      
      if (isRetryable && retryCount < 1) {
        console.warn(`[RETRY] Retrying ${url} after error: ${error.message}`);
        await sleep(CONFIG.DELAY_MS * 2);
        return fetchPolitely(url, retryCount + 1);
      }
    }
    throw error; // Will be caught by the page-level error handler
  }
};