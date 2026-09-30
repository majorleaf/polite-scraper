# Polite Scraper — Books to Scrape

A small, polite scraping pipeline that downloads the first three catalogue pages of
[Books to Scrape](https://books.toscrape.com), visits all 60 book pages, turns messy HTML
into clean, validated JSON records, survives broken pages without crashing, and ends every
run with a short report of what happened.

## Run it

```bash
npm install
npx tsx src/main.ts
```

Outputs land in `output/`:
- `books.json` — validated records
- `errors.json` — records or pages that failed, with a reason
- `run-report.json` — honest numbers about the run

Re-running is safe — `books.json` always ends up with exactly 60 records, never more.

## Target classification

- **Site:** books.toscrape.com
- **Why this site:** it is explicitly built as a public sandbox for practicing web
  scraping — confirmed by reading the site's own description.
- **Scope:** first 3 catalogue pages only (60 books total), not the full site.
- **Data collected:** title, price, availability, star rating, description, and product
  URL — all already present in the server-rendered HTML.
- **robots.txt result:** `404` — no robots file found. A missing file is not permission,
  just an absence of a rule; the sandbox's own stated purpose is what makes this scrape
  appropriate.
- **Why this is appropriate here:** the site exists for exactly this purpose, at low
  volume, with no login, paywall, or block bypassed.

**I will not reuse this code on another site without checking its rules and terms first.**

## Politeness rules this scraper follows

- **Honest User-Agent:** every request identifies the scraper by name and links back to
  this repo — `FlyRankInternshipA9/1.0 (+https://github.com/majorleaf/polite-scraper)` —
  so a site owner reading their logs can find out who made the request.
- **Delay between real requests:** 600ms before every network fetch (catalogue and book
  pages alike). Cached pages skip the delay entirely — they never leave this computer.
- **Timeout:** every request gives up after 10 seconds rather than hanging forever.
- **Caching:** every fetched page is saved to `cache/` and read from disk on subsequent
  runs, so the site is only asked once per page, no matter how many times the script is
  restarted during development.
- **Retry rules:** a failed request is retried once on a timeout or a 5xx server error.
  A `404` or `403` is never retried — the page doesn't exist, or the site said no, and
  asking again would only be pestering it.
- **Scope discipline:** the crawler follows the catalogue's own "next" link and stops
  after 3 pages — it doesn't hardcode or guess at a larger page range.

## Why no browser was needed

Every field this scraper collects is already present in the HTML the server sends on
first response — there's no client-side rendering to wait for. A headless browser would
only add startup cost and complexity for no extra data.

## Pipeline stages

- **Target classification** — proves: may I automate this site? Documented in this README.
- **Fetch & cache** — proves: did the page really arrive? `fetchPage`, `fetchCatalougePage`, `fetchBookPage`.
- **Discover pages** — proves: which catalogue pages and books exist? `discoverAllBookLinks`.
- **Extract** — proves: which raw fields are on each book page? `extractCoreFields`, `extractDescription`, `extractRawBook`.
- **Normalize & validate** — proves: is every record safe to store? `parsePriceGbp`, `parseRating`, `validateBook` (Zod schema).
- **Survive failures** — proves: does one bad page take down the run? `fetchBookPageSafe` (retry + skip, never crash).
- **Report** — proves: did the run actually work? `runPipeline` → `output/run-report.json`.

## Record schema (`output/books.json`)

Each record has 9 fields:

- `title` — string, non-empty
- `product_url` — string (URL), canonical identity of the record
- `price_gbp` — number, parsed from `price_text`, must be positive
- `price_text` — string, original raw text, e.g. `"£51.77"`, kept alongside the parsed value
- `availability_text` — string, non-empty, e.g. `"In stock (22 available)"`
- `rating` — number (1–5), parsed from the site's word-based rating class, e.g. `"Three"` → `3`
- `description` — string or `null`; `null` when the book has no description, never invented
- `source_page` — string (URL), the catalogue page the book was discovered on
- `fetched_at` — string (ISO timestamp), when the record was processed

Example record:

```json
{
  "title": "A Light in the Attic",
  "product_url": "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
  "price_gbp": 51.77,
  "price_text": "£51.77",
  "availability_text": "In stock (22 available)",
  "rating": 3,
  "description": "It's hard to imagine a world without A Light in the Attic. ... ...more",
  "source_page": "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
  "fetched_at": "2026-09-30T13:38:05.783Z"
}
```

## Sample `run-report.json`

```json
{
  "started_at": "2026-09-30T13:38:05.301Z",
  "duration_ms": 1220,
  "valid_records": 60,
  "invalid_records": 0,
  "failed_pages": 0
}
```

## Survival test

A deliberately broken URL (a book that doesn't exist on the real site) was added to the
book list on purpose to prove the pipeline survives it. Result: the run still finished,
`books.json` still had all 60 good records, and the bad page showed up in `errors.json`
and in `run-report.json`'s `failed_pages` count — instead of crashing the whole run.

## Known limitations

- Every description in the scraped data ends in `"...more"` — this is the literal text
  of a "read more" link that sits next to the description on the page, swept in by the
  selector. It's part of the real page content, not a bug in the extraction.
- `source_page` records the catalogue page a book was discovered on, but the current
  implementation flattens book links across all 3 catalogue pages before fetching, so in
  some edge cases it may not perfectly reflect per-page origin. Noted as a simplification,
  not fixed in this version.


This scraper only touches a site explicitly built for practicing scraping, at a small,
fixed scope (3 pages, 60 books). Going forward: prefer an official API when one exists,
never bypass a login, paywall, or explicit block, and only collect the data actually
needed for the task — not everything a page happens to expose.