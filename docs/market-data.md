# Native market data

Trader News serves the same server cache to every visitor. The native range
buttons select both the chart window and the company performance column.
Performance is a price return using the daily close preceding the range,
without dividend reinvestment. Incomplete range history is explicitly marked.
Company membership is curated and may be incomplete; it is not a live index
composition service. Market cap, trailing P/E and dividend yield are stored separately from prices,
using daily snapshots from Stock Analysis statistics pages where available.

## Processes and data

`trader-news.service` runs the Arc application on port 8080. Its three market
routes proxy the loopback-only Python service on port 8766. The separately
supervised `trader-news-market.service` owns all upstream requests and the
SQLite database at `arc/news/market/market.sqlite3`. Python uses its standard
library and the system curl binary. A file lock prevents duplicate collectors
using the same data directory.

The collector spaces provider requests by at least two seconds. Browser requests
read the cache and can prioritize a selected chart; they never wait for an
upstream download. Yahoo supplies prices/history and Stock Analysis supplies
daily fundamentals. Failed requests
preserve the last successful data. There is no unverified automatic fallback.

Prices retain their provider currency, including GBp for British pence. A
provider price timestamp and our successful fetch timestamp are separate:
checking a closed market does not make its last trade recent. The UI exposes
both in freshness details.

Bars are upserted by symbol, interval and timestamp, so repeated downloads
replace overlapping observations instead of appending duplicate histories.
Two-minute bars are kept for 11 days, 30-minute bars for 23 days, and daily
bars for five years plus a small boundary overlap. Daily history is bootstrapped
once, updated with overlapping recent bars, and reloaded monthly or after a
new split. Shared quote responses are cached for five seconds. Older Arc JSON cache files are preserved for rollback.

## Deployment

Use the production runbook's clean checkout check, commit and push to
`trader-news main`, then fetch/reset the production checkout on SSH host `r5c`.
Never replace or clean the runtime `arc/` directory.

Install the collector unit from the checked-out code:

```sh
sudo tee /etc/systemd/system/trader-news-market.service < deploy/trader-news-market.service > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now trader-news-market.service
sudo systemctl restart trader-news.service
```

After subsequent collector changes, restart both services. Inspect
`/market-feed-health`, sample charts and quotes, both systemd journals and
SQLite row counts. A running service alone does not establish data freshness.
The initial universe takes time to fill; unavailable rows remain explicit.

For local development, run `python3 scripts/market_service.py` alongside the
Arc server. Set `MARKET_DATA_DIR` to a temporary directory to isolate data.
`MARKET_DATA_PORT` configures the Arc proxy, and `--port` configures Python.

## Rollback

After inspecting the production working tree, deploy the previous known-good
code commit and stop/disable `trader-news-market.service` before restarting the
old Arc application. The old version has its own collector, so do not run both
collectors. Keep SQLite and old cache files intact. Restore the new unit when
returning to the native implementation.

## Public response compression

Production includes `/etc/nginx/snippets/trader-news-market.conf` inside the
HTTPS server block for tradernews.fyi. Its source is
`deploy/trader-news-market.nginx.conf`. It compresses public market JSON and
sets `Vary: Accept-Encoding`; private application routes retain their existing
configuration. Update the snippet with the repository version, run
`sudo nginx -t`, and reload Nginx after changes. The pre-compression site config
is backed up at `/tmp/trader-news-nginx.pre-market-gzip.conf` on the server.


## Shared polling cache

Install `deploy/trader-news-market-cache.nginx.conf` at
`/etc/nginx/conf.d/trader-news-market-cache.conf` (HTTP context), and install
`deploy/trader-news-market.nginx.conf` as the existing HTTPS server snippet.
Create `/var/cache/nginx/trader-news-market` owned by `www-data` first. Test with
`sudo nginx -t` before reloading. Roll back both configuration files together.

The two public data routes go directly to loopback port 8766. Nginx caches
successful responses for two minutes, coalesces concurrent cache misses and
refreshes expired entries in the background. Health and errors are never cached.
Cookies and authorization headers are not forwarded on these public routes.
News, accounts, votes and other application routes retain their existing behavior.

The frontend requests one reusable company snapshot per index/range, polls at
random 2-3 minute intervals while visible, and staggers tab-return refreshes.
ETags allow unchanged responses to return 304 without another response body.
`X-Market-Cache` exposes HIT, MISS, STALE, UPDATING or REVALIDATED for verification;
health always reports BYPASS. The provider still has one global two-second gate.

Production Nginx worker_connections is raised from 768 to 16384 per worker;
its existing systemd file-descriptor limit is 524288. The Trader News HTTPS
server uses a 15-second idle keepalive timeout to free idle polling sockets.
These changes provide connection headroom, not a claim of tested 20k capacity.
A separate representative load test is still needed before that guarantee.


## Daily fundamentals

`market_fundamentals.py` parses the public statistics table's precise numeric
values, including its own market-cap currency. A UK share price in pence does
not change the market cap's reported GBP units. P/E is trailing, and missing or
nonpositive P/E remains unavailable. Yield is the provider-reported dividend
yield in percentage points; missing yield is not inferred to mean zero.

Fundamentals share the price collector's global two-second request gate. While
fundamentals are due, one in three collector turns checks a company; after a
successful check it is not due again for 24 hours. Selecting a company chart
prioritizes its missing/due fundamentals. Initial population takes roughly
1.5 hours for the full universe under normal responses, alongside continued
price collection. Failed checks preserve saved values and timestamps. A source
rate limit or outage backs off fundamentals independently of Yahoo prices.

SQLite keeps one fundamentals snapshot per company, its successful fetch time,
last attempt, retry schedule and error. The API exposes those fields separately
from quote freshness; cells have source/date tooltips, and the company panel
links to the source page. The source's update date is page metadata, not a
financial-statement reporting period. Source coverage and refresh errors appear
in `/market-feed-health`. Unsupported listings/metrics remain n/a. All existing
Nginx caching, ETags and slower browser polling apply to these fields too.
