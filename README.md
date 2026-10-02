<p align="center">
  <img src="docs/assets/banner.png" alt="CS2 Index — independent price analytics for Counter-Strike 2 items" width="100%">
</p>

<div align="center">

# CS2 Index

**Independent price analytics for Counter-Strike 2 items.** A catalogue of 34 029 items, offer comparison across marketplaces, weekly price history, a marketplace directory and a payout calculator — built on open snapshots with provenance for every number.

[![Next.js 16](https://img.shields.io/badge/Next.js-16.2-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript 5.9](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.45-C5F74F?logo=drizzle&logoColor=black)](https://orm.drizzle.team)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Embedded PGlite](https://img.shields.io/badge/embedded-PGlite-4B5563)](https://pglite.dev)
[![Tests](https://img.shields.io/badge/tests-16_passing-3FB950)](tests)
[![Dataset licence MIT](https://img.shields.io/badge/dataset-MIT-2EA44F)](data/bootstrap/manifest.json)

**English** · [Русский](README.ru.md) · [中文](README.zh.md) · [Español](README.es.md)

</div>

---

## What this is — and what it is not

CS2 Index answers a narrow question well: *what is this item worth right now, how did that change, and where does the number come from?*

- **Real snapshot data, not demo quotes.** The repository ships a reproducible open dataset (`data/bootstrap`, 3.1 MB, checksums in the manifest) that the app loads on first start.
- **No trading, no custody, no accounts.** The service only displays data. It is not affiliated with Valve Corporation.
- **No invented values.** If there is no quote, the interface shows `—`, never `0` or an estimate.

## Screenshots

| Market overview (dark) | Market overview (light) |
| --- | --- |
| ![Overview](docs/assets/screens/overview.png) | ![Overview, light theme](docs/assets/screens/overview-light.png) |

| Catalogue with filters | Item card |
| --- | --- |
| ![Catalogue](docs/assets/screens/catalog.png) | ![Item card](docs/assets/screens/item.png) |

| Marketplace directory | Data sources and provenance |
| --- | --- |
| ![Markets](docs/assets/screens/markets.png) | ![Data sources](docs/assets/screens/data.png) |

## The data behind the interface

| Metric | Value |
| --- | --- |
| Catalogue items | 34 029 — skins, stickers, cases, agents, graffiti, charms, music kits, patches, collectibles, keys |
| Offers (quotes) | 27 717 on the snapshot date |
| History | 25 850 items × 25 weekly dates (2026-02-08 … 2026-08-08), 631 840 points |
| Price semantics | lowest price of an active Steam Community Market listing, USD |
| Sources | [ByMykel/CSGO-API](https://github.com/ByMykel/CSGO-API) (MIT) — metadata; [ByMykel/counter-strike-price-tracker](https://github.com/ByMykel/counter-strike-price-tracker) (MIT) — weekly Steam price snapshots |

Principles the code actually enforces:

- **Every price keeps its provenance** — source, price kind, currency, capture time, link to the original (`cs2_price_quotes.source_url`, table `cs2_source_health`, dataset manifest).
- **Missing data stays explicit** — no quote, no row; the UI shows `—` instead of a zero or a guess.
- **Unverified fees are never stated as fact** — marketplaces carry a `reported` / `conflicting` fee status with a source link and a verification date; when the status is `conflicting`, the percentages are not shown at all.
- **Unreliable series are flagged, not smoothed into fiction** — if adjacent weekly observations differ by more than 5×, changes are not calculated (`change_7d = null`, flag `changeSuppressed`).
- **Changes are smoothed, dates are explicit** — the current value and 7/30/90-day comparison points are medians of three observations; the comparison date is returned separately (`change7dFrom`), because the dataset is weekly and "exactly a week ago" may not exist.

The snapshot is not a real-time stream. Freshness is visible in the UI (data age badge) and via `GET /api/health`. Updated data arrives through synchronisation (`npm run sync`, `POST /api/sync`) from supported sources.

## Architecture

<img src="docs/assets/architecture.png" alt="Data flow: open sources → ingest → storage → API and UI" width="100%">

Adapters for marketplaces share one contract (`src/lib/ingest/providers`), the runner keeps a per-source circuit breaker and a run journal, and materialised item statistics (`refreshItemStats`) are rebuilt in one pass after import and after every sync — so the catalogue and the overview never run window functions over the whole history per request.

## Features

- **Catalogue** — search by name, filters (category, weapon, rarity, collection, wear, StatTrak™, Souvenir, price range, priced-only), 8 sort orders, pagination.
- **Item card** — best/average/worst price, spread across marketplaces, 7/30/90-day changes with comparison dates, history chart, offer table with provenance and staleness, list of marketplaces that returned no quote.
- **Market overview** — data freshness, index (median ratio of basket prices to the base date), market breadth (advancing / declining / flat), top gainers and losers, most liquid items.
- **Marketplace directory** — integration status, fee status with verification date, KYC, rate limits, circuit-breaker state, quote counts.
- **Data sources page** — source and run tables, bootstrap dataset composition, licences and attribution, disclaimer.
- **Payout calculator** — computes the payout from a real quote and an explicitly chosen fee.
- **Interface** — light and dark theme with no flash on load, locally hosted Inter (latin + cyrillic), `/` focuses search, responsive layout, Russian localisation, watchlist in `localStorage`.
- **API** — unified error envelope, rate limiting, caching and Prometheus metrics.

## Quick start

```bash
git clone https://github.com/e6six/cs2-price-analytics-platform.git
cd cs2-price-analytics-platform
npm install
npm run dev          # http://localhost:3000
```

Without `DATABASE_URL` the app starts an embedded PostgreSQL (PGlite) in `.cache/pglite`, applies migrations and imports the dataset from `data/bootstrap`. The first start takes about a minute or two; later starts reuse the database on disk.

Production mode:

```bash
export DATABASE_URL=postgresql://cs2:cs2@127.0.0.1:5432/cs2_index
npm run db:migrate && npm run db:seed -- --refresh
npm run build && npm run start
```

Full list of environment variables — [`.env.example`](.env.example). Secrets (marketplace tokens, `SYNC_TOKEN`) live only in the environment.

### Configuration highlights

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL`, `DATABASE_DRIVER`, `PGLITE_DATA_DIR` | Managed PostgreSQL or embedded PGlite |
| `AUTO_MIGRATE`, `AUTO_BOOTSTRAP`, `BOOTSTRAP_DIR` | Migrations and dataset import on start |
| `SYNC_TOKEN`, `ALLOW_ANONYMOUS_SYNC`, `SYNC_MAX_ITEMS` | Synchronisation endpoint and its limits |
| `STEAM_MARKET_COOKIE`, `CSFLOAT_API_KEY`, `BUFF_COOKIE`, `GITHUB_TOKEN` | Per-source credentials (all optional) |
| `API_RATE_LIMIT_PER_MINUTE`, `API_CACHE_TTL_SECONDS` | Public API protection |
| `QUOTE_RETENTION_DAYS`, `LOG_LEVEL` | Retention and logging |

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Development, build, production server |
| `npm run lint` / `typecheck` / `test` / `verify` | ESLint, TypeScript, tests (node:test), all together |
| `npm run db:migrate` | Apply Drizzle migrations |
| `npm run db:seed` | Import the dataset into an empty database (idempotent) |
| `npm run db:seed -- --refresh` | Force re-import of `data/bootstrap` (quotes, history, metadata, stats) |
| `npm run db:seed -- --stats` | Rebuild materialised item statistics |
| `npm run db:seed -- --sources` | Refresh the source directory |
| `npm run data:fetch` | Clone/update the open datasets into `.cache/sources` |
| `npm run data:bootstrap` | Rebuild `data/bootstrap/*` and the checksum manifest |
| `npm run sync -- --source=steam-community --limit=50` | One-off synchronisation run |
| `npm run db:studio` | Drizzle Studio |

## API

All responses are JSON; errors use `{ "error": { "code", "message", "details" }, "requestId" }` with `x-request-id` and `cache-control` headers.

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | Database and data state: `200` ready, `503` empty/unavailable, snapshot freshness |
| `GET /api/items` | Catalogue: `q`, `category`, `kind`, `weapon`, `rarity`, `collection`, `wear`, `stattrak`, `souvenir`, `minPrice`, `maxPrice`, `requirePrice`, `slugs` (up to 60), `sort` (8 values), `page`, `limit` (≤100) |
| `GET /api/items/{id\|slug}?range=7d\|30d\|90d\|365d` | Item card: offers, history, statistics |
| `GET /api/items/{id}/history?range=…&market=…` | Time series (the window counts back from the item's latest observation) |
| `GET /api/markets` | Marketplace and fee directory |
| `GET /api/analytics/summary` | Market summary: freshness, coverage, index, breadth, leaders |
| `GET /api/facets` | Filter values with item counts |
| `GET /api/sources` | Source states and recent runs |
| `GET /api/metrics` | Prometheus metrics (`cs2_db_up`, `cs2_items_total`, `cs2_data_age_hours`, `cs2_market_index`, …) |
| `GET /api/sync` / `POST /api/sync` | Sync status / run (`Authorization: Bearer $SYNC_TOKEN`) |

## Data model

`src/db/schema.ts`:

- `cs2_markets` — marketplace and dataset directory: integration status, whether a key is required, price semantics, fees with verification status, KYC, limits.
- `cs2_items` — canonical items (`market_hash_name`, metadata, image, `popularity` = share of dates with a price).
- `cs2_price_quotes` — offer snapshots: `price_kind`, price, currency, `price_usd`, `captured_at`, `source_url`, `is_live`.
- `cs2_price_history_daily` — daily/weekly series (unique on `item + market + date + price_kind`).
- `cs2_item_stats` — materialised item metrics: best/average price, leading marketplace, smoothed 7/30/90-day changes with comparison dates, history coverage, `series_noisy` flag.
- `cs2_ingest_runs`, `cs2_source_health` — run journal and source state (circuit breaker, errors, counters).
- `cs2_fx_rates` — ECB rates for currency normalisation (fallback: static values marked `static`).

## Sources, limits and compliance

- **Steam Community Market** — public `market/priceoverview` endpoint; the adapter keeps ≤12 requests/min, honours `Retry-After`, uses backoff and a circuit breaker. Full history (`market/pricehistory`) requires the cookie of the account owner — set via `STEAM_MARKET_COOKIE`.
- **Skinport** — public `/v1/items` API (USD, `tradable`), 5-minute cache, recommended ≤8 requests per 5 minutes.
- **CSFloat** — public `listings/price-list`; with a key the limits are higher.
- **BUFF163** — authorised session only (`BUFF_COOKIE`), CNY, ≤10 requests/min.
- **Open datasets** (GitHub, MIT) — bulk price and metadata refresh through the Contents API.
- **Planned marketplaces** (DMarket, SkinBaron, Tradeit, LIS-SKINS, SkinsMonkey) exist only in the directory: adapters are not connected until API terms are confirmed.

Project rules: no bypassing CAPTCHA, Cloudflare, authorisation or anti-bot protection; no proxies to dodge rate limits; unverified fees, payouts and KYC are never stated as fact; missing data is never replaced with an estimate; marketplace data is not republished without permission from its terms.

## Operations

- **Freshness**: `GET /api/health` and the `cs2_data_age_hours` metric (`isStale` — older than 14 days). The UI marks data as stale.
- **Synchronisation**: `npm run sync` or `POST /api/sync` with `SYNC_TOKEN`; for scheduled refreshes use cron or a worker (`AUTO_BOOTSTRAP=true` is only needed for the first start).
- **Observability**: structured JSON logs, `GET /api/metrics` (Prometheus).
- **Rate limiting**: currently in-process — with several replicas you need Redis or a gateway with rate limiting in front.
- **Backups**: for PGlite an archive of the `.cache/pglite` directory is enough; for PostgreSQL use the usual backup procedures.
- **Retention**: `QUOTE_RETENTION_DAYS` bounds how long old offer snapshots are kept.

## Limitations

- The bundled dataset contains weekly snapshots; "7-day change" means the closest available observation, and the date is always returned by the API.
- Souvenir items in open datasets more often contain outliers — such series are flagged as unstable rather than "fixed" by eye.
- No trading operations, no custody of funds, no Steam authentication and no notifications: the service only displays data. Not affiliated with Valve Corporation.
- Valve localisations are not connected: item names stay in their canonical English form.
- `steam-community` in the current dataset is marked `isLive: false` — it is a dataset snapshot, not a request to Steam at render time.
- Item images are loaded from Valve's CDN and are not bundled; when the CDN is unreachable, cards fall back to a rarity-coloured monogram.

## Design and documentation assets

- The design system lives in [`src/app/globals.css`](src/app/globals.css) — tokens for both themes, surfaces, typography and states; interface icons are inline SVG in [`src/components/icons.tsx`](src/components/icons.tsx).
- All images used by the README (`docs/assets`) are generated from real application markup and dataset values; screenshots are taken from a running instance.

## Licence and attribution

The project code is distributed within this repository. Data:

- [ByMykel/CSGO-API](https://github.com/ByMykel/CSGO-API) — MIT, Copyright (c) 2023 ByMykel.
- [ByMykel/counter-strike-price-tracker](https://github.com/ByMykel/counter-strike-price-tracker) — MIT, Copyright (c) 2026 ByMykel.
- Inter typeface — SIL Open Font License 1.1 (`src/fonts/inter/LICENSE.txt`).

The commits used to build the dataset are pinned in `data/bootstrap/manifest.json` together with artifact checksums. Item names and images belong to Valve Corporation; the project claims no rights to them.

<div align="center">

**English** · [Русский](README.ru.md) · [中文](README.zh.md) · [Español](README.es.md)

</div>
