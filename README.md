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

  ## Extras

- **CSV export** (`output/books.csv`) — same 9 fields as `books.json`. The `description`
  field often contains commas and quotes, so a proper CSV writer (`csv-stringify`) is
  used rather than hand-joining strings, to handle quoting/escaping correctly.


This scraper only touches a site explicitly built for practicing scraping, at a small,
fixed scope (3 pages, 60 books). Going forward: prefer an official API when one exists,
never bypass a login, paywall, or explicit block, and only collect the data actually
needed for the task — not everything a page happens to expose.

# AI vs. Me

What the AI did better:

Split the code into separate files by responsibility (config.ts, fetcher.ts, scraper.ts, types.ts, index.ts) instead of one large file. A real improvement worth adopting as the project grows.
Used z.string().datetime() for fetched_at instead of a plain z.string(), catching a malformed timestamp mine would silently accept.
Kept raw and parsed values (raw_price/price, raw_rating/rating) together in the stored schema itself, not just in a pre-validation step.

What it got wrong or silently skipped:

source_page is wrong for every record. It hardcodes the starting catalogue URL (page-1.html) and passes that same value to every book, regardless of which page it was actually discovered on. My version has the same underlying gap (flagged honestly as a known limitation above), but the AI's version presents it with no flag at all — confidently wrong data is worse than data known to be imprecise, since source_page is the field meant to answer "where did this value come from" when something looks wrong later.
run-report.json is missing two required fields — pages fetched and cache hits — even though the original assignment spec names both explicitly. The AI logs a discovered-URL count to the console but never writes it to the report file.
Fetch failures never reach errors.json. A 404 or timeout increments a counter for the report but the URL and reason are only console.error'd, not persisted — that information is lost once the terminal closes. My version writes both fetch and validation failures to the same errors file.
The deliberately-broken test URL is permanent, pushed into every run with no flag or comment marking it as a one-time proof, unlike the checkpoint test in this project, which was added, confirmed, and removed.

What my prompt forgot to say:

I didn't specify that source_page must be tracked accurately per-URL through a flattened, deduped list — leaving the mechanism to guesswork, which is exactly where both the AI's version and my own implementation fell short.
I listed only "start time, duration, valid/invalid record counts, failed page count" for the report, dropping "pages fetched" and "cache hits" from the original assignment's spec. The AI built precisely what was asked — the gap was in the request, not the execution.
I said failures "go to a separate errors file with a reason" without explicitly requiring both fetch and validation failures to land there, so the AI treated fetch failures as count-only.

Takeaway: the AI didn't misunderstand the task — it executed the prompt faithfully. The real gaps were gaps in what the prompt specified, not in the AI's reasoning. Writing a precise prompt is as much a part of this skill as writing the scraper itself.

# Ethics note

This scraper only touches a site explicitly built for practicing scraping, at a small, fixed scope (3 pages, 60 books). Going forward: prefer an official API when one exists, never bypass a login, paywall, or explicit block, and only collect the data actually needed for the task — not everything a page happens to expose.