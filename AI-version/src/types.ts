import { z } from 'zod';

export const BookSchema = z.object({
  title: z.string().min(1),
  raw_price: z.string(),
  price: z.number().positive(),
  raw_availability: z.string(),
  raw_rating: z.string(),
  rating: z.number().int().min(1).max(5),
  description: z.string().nullable(),
  source_page: z.string().url(),
  fetched_at: z.string().datetime(),
});

export type BookRecord = z.infer<typeof BookSchema>;

export interface ScrapeReport {
  start_time: string;
  duration_ms: number;
  valid_records: number;
  invalid_records: number;
  failed_pages: number;
}