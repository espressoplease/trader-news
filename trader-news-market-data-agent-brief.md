# Trader News market-data challenge brief

Prepared 2026-09-21 for a stronger engineering and research agent.

## Mission

Take ownership of the market-data problem in Trader News and push it as far as is realistically possible with a maximum recurring budget of approximately **$4 per month**.

The product goal is:

> Provide free, useful, honest, as-close-to-up-to-the-minute-as-possible prices and charts for every company in every supported index, without hammering our server, without regularly triggering provider rate limits, and without pretending delayed or estimated data is live.

The target is not merely a nicer chart. We need a durable market-data subsystem that can:

- cover all supported index constituents, not only the index headline symbols;
- show current or very recent prices where a provider makes that possible;
- build and retain our own normalized historical bar series where legally permitted;
- derive 1D, 5D, 1M, 3M, 6M, YTD, 1Y, and 5Y charts without refetching unchanged history;
- use multiple providers or source types with controlled fallbacks;
- survive 429s, provider downtime, schema changes, missing symbols, exchange closures, and stale data;
- expose freshness and source quality clearly in the existing compact Trader News UI;
- remain inexpensive enough to operate on the current server.

Do not assume that “free” means “licensed for indefinite server-side storage” or “real-time”. Verify provider terms, limits, coverage, and attribution requirements before relying on a source.

## What I want from you

Act as a senior market-data architect, backend engineer, reliability engineer, and product analyst. First audit the repository and live deployment. Then research current free and very-low-cost data options. Then make an evidence-based recommendation.

Do not paper over an impossible requirement. If genuinely up-to-the-minute coverage for all companies cannot be achieved under $4 per month, say so clearly and design the strongest useful delayed-data product that can be achieved instead.

You may modify the code and deploy improvements if you can verify them safely. Preserve existing news functionality and UI styling. Do not use proxies, residential proxy networks, credential abuse, endpoint evasion, or high-concurrency scraping to bypass provider controls.

## Repository and project identity

- Local project: **/Users/mac/code/sharc**
- Public GitHub repository: **https://github.com/espressoplease/trader-news**
- Git remotes:
  - trader-news: the public Trader News repository
  - origin: upstream Sharc repository, **https://github.com/shawwn/sharc.git**
- Current branch: **main**
- Current deployed commit at the time of this brief: **9251a3b**
- Local app URL: **http://localhost:8080**
- Production URL: **https://tradernews.fyi**
- The application is an Arc/Lisp Hacker News clone, now styled and branded as Trader News.
- The finance explorer is rendered above the HN-style news feed.
- The application uses server-rendered Arc HTML plus browser JavaScript and CSS. It is not a React or Node application.

Important files:

| File | Role |
|---|---|
| news.arc | Main Trader News application, page rendering, app startup, background setup |
| market-feed.arc | Market provider requests, queue, cache, polling, public feed endpoints, health endpoint |
| static/hn.js | Finance explorer UI, chart rendering, range selection, company selection, client cache |
| static/news.css | Trader News and finance explorer styling, responsive behavior |
| static/market-data.js | Curated supported index membership, symbols, names, fallback series |
| static/trader-chart.svg | Current chart/logo-related static asset |
| deploy/trader-news.service | Production systemd service definition |
| deploy/tradernews.fyi | Nginx site configuration checked into the project |
| docs/deploy.md | Existing deployment and server operations notes |
| docs/server-setup.md | Server setup notes |

Run existing tests before and after changes:

~~~sh
cd /Users/mac/code/sharc
./sharc test.arc
node --check static/hn.js
git diff --check
~~~

The last known test result was **1039 passed, 0 failed**.

## Supported market universe

The current frontend has 13 supported index sets and 980 listed constituent rows, representing 858 unique ticker strings after deduplication.

| Index | Provider symbol | Listed constituent rows |
|---|---:|---:|
| S&P 500 | ^GSPC | 503 |
| Nasdaq-100 | ^NDX | 100 |
| Dow Jones 30 | ^DJI | 30 |
| Russell 2000 | ^RUT | 20 |
| FTSE 100 | ^FTSE | 85 |
| DAX 40 | ^GDAXI | 22 |
| CAC 40 | ^FCHI | 23 |
| EURO STOXX 50 | ^STOXX50E | 48 |
| Nikkei 225 | ^N225 | 30 |
| Hang Seng | ^HSI | 25 |
| Nifty 50 | ^NSEI | 50 |
| ASX 200 | ^AXJO | 24 |
| KOSPI | ^KS11 | 20 |
| **Total listed rows** |  | **980** |
| **Unique ticker strings** |  | **858** |

The membership data is curated static metadata. It is not currently refreshed automatically from official index constituent sources. Some lists are proxies, abbreviated lists, or approximate membership sets. In particular, Russell 2000 is represented by a small 20-company proxy list rather than the full index.

The same company can appear in several indexes. A production solution should deduplicate provider requests by normalized instrument identity, while preserving index membership relationships and snapshots over time.

Ticker normalization is a real problem. Examples include:

- BRK.B versus Yahoo-style BRK-B;
- BF.B versus BF-B;
- exchange suffixes such as .L, .PA, .F, .AS, .MC, .HK, .NS, .AX, and .KS;
- numeric tickers such as Japanese symbols;
- tickers that have changed, been renamed, merged, delisted, or become invalid.

Do not assume a static ticker string is a stable security identifier. Design an instrument mapping layer.

## Current Yahoo implementation

The only implemented market provider is the Yahoo public chart endpoint:

~~~text
https://query1.finance.yahoo.com/v8/finance/chart/<SYMBOL>?range=<RANGE>&interval=<INTERVAL>
~~~

The server sends a descriptive User-Agent and accepts JSON. Current HTTP timeout settings are approximately 15 seconds for request timeout and 20 seconds for the overall operation.

The endpoint is used as a practical, unofficial source. It is not an authenticated commercial data contract in this application. There is no guaranteed quota, uptime SLA, schema stability, or real-time entitlement that we can rely on. Treat 429 responses, bot controls, response changes, missing data, and provider policy changes as normal failure modes.

Yahoo data can be delayed, and the delay can vary by exchange and instrument. This system must never label it simply as “live” unless the source and freshness semantics justify that label.

## Current server-side polling behavior

market-feed.arc starts an in-process background job:

~~~arc
(defbg market-feed 15
  (market-feed-poll!))
~~~

The background tick runs every 15 seconds, but the actual provider request gate permits only one upstream request every 30 seconds:

~~~arc
market-feed-min-request-secs* 30
~~~

The queue is a single shared queue. Each job is a pair of provider symbol and requested range. Jobs are deduplicated if already queued or if the corresponding cache entry is fresh. The current queue uses push and pop, so it behaves like a LIFO queue. Investigate whether that creates starvation or unfairness as on-demand company requests are added.

The initial background prime currently queues:

- ^GSPC at 1mo;
- all 13 supported index symbols at 1d.

It does **not** automatically queue every constituent company.

At one request per 30 seconds:

- the default 13-index pass takes approximately 6.5 minutes;
- one request per 858 unique constituent symbols would take approximately 7.15 hours for a single full pass;
- a true one-minute refresh for every constituent would require a bulk provider, a radically higher request budget, or a licensed streaming/batch source.

The production health endpoint is:

~~~text
https://tradernews.fyi/market-feed-health
~~~

The market response endpoints are:

~~~text
https://tradernews.fyi/market-feed?all=1
https://tradernews.fyi/market-feed?symbol=%5EGSPC&range=1mo
~~~

The public response includes status, timestamps, point arrays, pending state, source, and error information. ok: true on the health endpoint means the poller has ticked recently and at least one provider request has succeeded recently. It does **not** mean every supported instrument is fresh.

## Current provider ranges and cache freshness

| UI range | Provider range | Provider interval | Server freshness window |
|---|---|---|---:|
| 1D | 1d | 5m | 5 minutes |
| 5D | 5d | 15m | 15 minutes |
| 1M | normally sourced from 1y in browser | 1d | 1 hour for direct entry |
| 3M | normally sourced from 1y in browser | 1d | 24 hours for direct entry |
| 6M | normally sourced from 1y in browser | 1d | 24 hours for direct entry |
| YTD | normally sliced from 1y in browser | 1d | 24 hours for direct entry |
| 1Y | 1y | 1d | 24 hours |
| 5Y | 5y | 1mo | 24 hours |

The recent client fix deliberately uses one daily 1y source series for 1M, 3M, 6M, YTD, and 1Y, then slices it locally. This makes selected ranges genuinely different without five upstream requests for the same symbol. YTD is trimmed to January 1 based on the latest point.

The server also supports direct range requests. The normal UI path should be evaluated separately from direct endpoint behavior so the next implementation does not accidentally reintroduce redundant requests.

## What is cached and what is not

### Server cache

On production, the working application directory is:

~~~text
/home/deploy/apps/trader-news
~~~

Market data is stored outside Git repository state under:

~~~text
/home/deploy/apps/trader-news/arc/news/market/market-cache.json
/home/deploy/apps/trader-news/arc/news/market/market-feed-state.json
~~~

The arc/ directory is application data and is gitignored. Never overwrite it by copying a developer checkout onto the server.

market-cache.json stores the latest successful full response per symbol and range, including points, fetched timestamp, attempted timestamp, interval, status, source, and errors. At the time this brief was prepared it was approximately 76 KB and contained 28 symbol/range entries. It included 13 index 1D entries plus selected ranges and a few on-demand company entries. The exact cache is live and will change.

This is a **latest-window cache**, not an append-only historical database. When a new response arrives, it replaces the old response for that symbol and range. It therefore retains the current provider window, but it does not build a permanent local archive of every bar ever observed.

market-feed-state.json stores small operational state such as poll ticks, last attempt, last success, last symbol, provider status, failure count, backoff, and next request time.

### Browser cache

static/hn.js also has:

- in-memory request deduplication for the current page;
- sessionStorage keys prefixed with trader-news-market-v2:;
- short browser TTLs, roughly 30 seconds for 1D, 2 minutes for 5D, and 5 minutes for longer ranges;
- local slicing of the shared 1Y source for 1M, 3M, 6M, YTD, and 1Y.

### Constituent rows

The company table is currently not live market data. companyStats() in static/hn.js derives deterministic-looking snapshot values from local metadata and a ticker hash. These fields are not provider quotes:

- displayed price;
- day move;
- selected-period move;
- market cap;
- P/E;
- dividend yield;
- volume;
- EPS;
- 52-week range;
- sector and exchange defaults.

The UI labels these as estimates or snapshots in relevant places. This is a major gap to solve if the product promise becomes current data for every company.

Clicking a company requests its chart on demand through the same server endpoint and queue. A company chart can therefore be provider-backed after its request has completed, but its accompanying fundamentals and table row are still local estimates.

## Production server

Production is on a personal Hetzner server.

- Public IPv4: 178.156.150.201
- SSH user: deploy
- Working directory: /home/deploy/apps/trader-news
- Service: trader-news.service
- Working directory from systemd: /home/deploy/apps/trader-news
- ExecStart uses /usr/bin/sbcl, running boot.lisp news.arc
- Service environment:
  - PORT=8080
  - SITE_URL=https://tradernews.fyi
  - SHARC_DAEMON=1
- Service restart policy: Restart=on-failure, 5-second restart delay
- Nginx proxies the public domain to 127.0.0.1:8080
- Public domain: https://tradernews.fyi
- Existing SSH access is configured on the development machine. Do not put private keys, passwords, or tokens into this brief or the repository.

Useful inspection commands, assuming existing SSH authorization:

~~~sh
ssh deploy@178.156.150.201
cd /home/deploy/apps/trader-news
systemctl status trader-news.service
journalctl -u trader-news.service -n 100 --no-pager
curl -sS http://127.0.0.1:8080/market-feed-health
curl -sS http://127.0.0.1:8080/market-feed?all=1
~~~

The Git deployment flow pushes to the trader-news GitHub remote and updates the server checkout, then restarts the systemd service. Preserve server-owned arc/ data.

The repository has existing server and deployment notes in docs/deploy.md, but those notes contain historical Sharc deployment details as well as the Trader News setup. Verify them against the active trader-news.service before changing deployment behavior.

## Current deployment snapshot

At the time of this brief:

- production service status: active;
- production commit: 9251a3b;
- provider: Yahoo public chart endpoint only;
- last observed provider failure count: 0;
- last observed queue depth: 0, although this can change immediately;
- last observed cache entries: 28;
- last observed live-delayed entries from market-feed?all=1: 9;
- production cache contains 13 index 1D entries plus selected historical ranges and a few company entries.

These are observations, not permanent guarantees. Recheck them before making decisions.

## The central technical question

Can we provide free, up-to-the-minute coverage for all 858 unique listed ticker strings across all 13 index sets with less than $4 per month?

Answer this with numbers, not optimism.

For each candidate provider, research and record:

- official or unofficial status;
- instruments and exchanges covered;
- real-time versus delayed versus end-of-day semantics;
- quote and historical endpoints;
- per-minute, per-day, and per-month limits;
- whether batch or bulk quote requests exist;
- whether historical bars and current quotes can be stored server-side;
- attribution, redistribution, and commercial-use terms;
- symbol format and mapping requirements;
- likely 429 or IP-block behavior;
- whether a free tier is sustainable for a public website;
- whether the source is suitable as a fallback rather than a primary feed.

Do not infer a provider’s free limits from an old blog post. Prefer current official documentation and terms. If documentation is unclear, mark the source as uncertain.

## Recommended architecture to investigate

Design, and if justified implement, a provider-neutral pipeline with these concepts:

1. **Instrument registry**
   - Canonical internal instrument ID.
   - Ticker aliases per provider.
   - Exchange, currency, timezone, asset type, active or delisted state.
   - Index membership snapshots with effective dates.

2. **Provider adapters**
   - A common interface such as quote, bars, bulk-quotes, and health.
   - Provider response normalization into timestamped OHLCV bars and quote records.
   - Source, delay class, fetched time, exchange time, and quality flags on every result.

3. **Scheduler and priority queue**
   - Separate jobs for index headline quotes, constituent quotes, historical backfill, and user-triggered requests.
   - Fairness instead of the current LIFO behavior.
   - Per-provider rate limits, jitter, exponential backoff, circuit breakers, and cooldowns.
   - High-priority current quotes during market hours.
   - Lower-priority daily history refreshes outside market hours.
   - Dedupe one company appearing in several indexes.
   - Bulk requests whenever any provider supports them.

4. **Persistent normalized storage**
   - SQLite is likely sufficient on this server unless the agent proves otherwise.
   - Suggested logical tables:
     - instruments;
     - provider_symbols;
     - index_membership_snapshots;
     - bars;
     - latest_quotes;
     - fetch_attempts;
     - provider_health;
     - data_quality_events.
   - Use idempotent upserts and unique keys.
   - Keep raw provider payloads only if terms permit it. Otherwise store normalized data and provenance only.
   - Preserve corrections and corporate-action adjustments rather than blindly overwriting all history.

5. **Incremental history strategy**
   - Download a full baseline once where allowed.
   - Store daily bars locally.
   - On subsequent runs fetch only a small overlap around the latest stored timestamp, for example the last few trading days, because vendors can revise recent bars.
   - Derive 1M, 3M, 6M, YTD, and 1Y charts from stored daily bars.
   - Derive 5Y from stored daily bars or provider monthly bars, depending on storage and accuracy needs.
   - Keep a small intraday window for 1D and 5D charts. Intraday bars need more frequent updates and are more likely to be delayed or restricted.

6. **Public API to the browser**
   - The browser must never call providers directly.
   - Serve one compact batch response for the visible index rail and selected company data.
   - Return source, asOf, marketTime, delayClass, status, staleReason, and nextExpectedRefresh.
   - Support conditional requests or revision IDs so unchanged data is not transferred repeatedly.
   - Use server response compression if practical.

7. **Honest UI semantics**
   - Distinguish real-time, delayed, end-of-day, cached, stale, warming, and estimated.
   - Never color a synthetic estimate as if it were a provider quote.
   - Keep the existing compact Trader News aesthetic.
   - Preserve loading states and graceful stale-data behavior.

## Important feasibility calculations

The agent should calculate several operating scenarios.

### Current Yahoo-like one-symbol polling

- 858 unique symbols.
- One request every 30 seconds.
- Full pass: approximately 429 minutes, or 7.15 hours.
- This cannot provide one-minute freshness for all symbols.

### One request per second

- Approximately 14.3 minutes for one pass across 858 symbols.
- This may already be unsafe for an unofficial provider, and it still is not one-minute freshness for every symbol.

### Bulk quote provider

- Compute how many API calls per minute are needed if a batch endpoint supports 50, 100, 500, or 1,000 symbols.
- Verify whether the free tier allows it and whether storing the output is permitted.

### Historical bars

- 858 symbols times roughly 252 daily bars for one year is about 216,216 daily bars before metadata and indexes.
- This is trivial for SQLite storage, but provider request and redistribution terms are the real constraints.
- Five years of daily bars is still manageable in storage, but it is not automatically permissible to archive from a free web endpoint.

## Failure and freshness behavior required

The finished system should handle:

- HTTP 429;
- HTTP 401, 403, 404, and 5xx;
- malformed JSON;
- missing timestamps or closes;
- provider returning an empty result;
- stale but usable prior data;
- exchange closed or holiday periods;
- market data timestamp lagging server time;
- symbol aliases and delisted instruments;
- a provider succeeding for indexes but failing for individual companies;
- a provider succeeding for quotes but not fundamentals;
- process restarts while jobs are queued;
- a partially written cache or database;
- a full disk;
- a provider response changing interval density;
- a company being in multiple supported indexes.

The health endpoint should report more than “provider healthy”. At minimum it should expose:

- provider status per provider;
- queue depth by job class;
- oldest queued job;
- oldest stale instrument;
- number of instruments fresh within 1 minute, 5 minutes, 15 minutes, 1 hour, and 1 day;
- last 429 and last non-429 failure;
- request counts and success rates per provider;
- estimated completion time for the queue;
- storage size and oldest retained bar.

## Existing limitations that must not be hidden

1. Current automatic polling is for 13 index symbols, not all constituents.
2. Current constituent prices and fundamentals are synthetic or local estimates.
3. Current provider support is Yahoo only.
4. Current persistent cache stores the latest provider window, not an append-only archive.
5. Current Yahoo access is unofficial and may be blocked or changed.
6. Current free data may be delayed and is not suitable to describe as trading-grade real-time data.
7. Current static membership is curated and not an official, automatically refreshed index membership feed.
8. Current market-feed-health ok is a poller and provider liveness signal, not an all-instruments freshness guarantee.
9. The UI can show all constituent rows, but showing all rows does not mean their quote fields are live.
10. Any plan to store and redistribute free provider data needs a terms and licensing review.

## Deliverables expected from the next agent

### A. Evidence-backed provider comparison

A concise table of realistic free or near-free sources, with current documentation links, coverage, limits, latency, batch support, storage rights, and confidence level.

### B. Cost and capacity model

Show the request math for:

- 13 indexes only;
- all 858 unique constituents;
- 1-minute, 5-minute, 15-minute, hourly, and daily targets;
- current cache-only page loads;
- user-triggered company charts;
- historical backfill and incremental updates.

### C. Architecture decision

Choose one recommended architecture for the $0 to $4 budget, plus a fallback architecture if a small paid plan becomes available. Explain what each can and cannot promise.

### D. Implementation plan or implementation

If the recommended design is implementable now, modify the project. Prefer the smallest safe system that can later grow into the full design. Keep the provider adapter boundary clear.

### E. Data model and migration plan

Explain how existing market-cache.json data maps into the proposed storage. Do not destroy current market cache or arc/ application data. Include backups and rollback steps.

### F. Observability

Add or specify health metrics, stale-data metrics, provider provenance, and an operator view that makes it obvious whether the product is fresh or degraded.

### G. Product and UI behavior

Specify the exact labels a user should see for:

- current quote;
- delayed quote;
- cached quote;
- stale quote;
- estimated constituent metric;
- historical chart;
- provider unavailable;
- market closed.

### H. Verification

Run tests, endpoint checks, production health checks, and a controlled failure test. Verify that one page load does not trigger one upstream request per visitor. Verify that a company appearing in multiple indexes is fetched only once per relevant timeframe.

## Suggested initial questions for your own investigation

1. Is there any legally usable free provider with bulk delayed quotes for at least 858 global symbols?
2. Does any free source permit server-side caching and public redistribution for this use case?
3. Can we combine a free delayed bulk quote source with free or open index membership files?
4. Can Yahoo remain only a historical backfill source while another source supplies current delayed quotes?
5. Can an exchange or public source provide delayed data in bulk without an API key?
6. What is the cheapest legitimate provider that gets us from delayed snapshots to one-minute updates?
7. Is the target “up to the minute” actually satisfied by five-minute or fifteen-minute delayed data if the UI states the delay clearly?
8. Which data is worth refreshing: every constituent, only visible indexes, only movers, or only user-watched symbols?
9. Can we offer a market snapshot mode that refreshes all symbols periodically and a focus mode that refreshes the selected index or company more aggressively?
10. What storage and redistribution constraints make an append-only local history unsafe with the current Yahoo approach?

## Definition of success

Success is not “we made many requests until Yahoo stopped returning 429.” Success is:

- a provider and storage plan that is legal enough to operate and honest enough to explain;
- measurable freshness for every instrument class;
- resilient fallbacks;
- minimal upstream requests;
- no per-user provider hammering;
- durable historical chart data where permitted;
- accurate instrument and index membership handling;
- a clear answer about what is impossible under $4 per month;
- a production deployment that can be rolled back safely.

Start by inspecting the current repository and production state described above. Do not assume the existing cache contains all companies. Do not assume the provider’s free endpoint is real-time. Do not assume that a successful health check means every symbol is current.

