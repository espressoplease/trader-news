# Company article coverage

The home page puts markets on the left and news on the right at desktop widths.
Selecting a company requests `/articles.json?symbol=DDOG&limit=100` and shows
curated links associated with that exact market symbol. Selecting an index or
using **All news** restores the general feed. Smaller screens stack the two
panes.

## Article data

`scripts/backlog-import.mjs` accepts the existing title, URL and source fields,
plus optional `symbols` and `tags` arrays:

```json
[
  {
    "title": "Example company announcement",
    "url": "https://example.com/announcement",
    "source": "Company newsroom",
    "symbols": ["DDOG"],
    "tags": ["earnings", "cloud-software"]
  }
]
```

Symbols use the exact market-data ticker, including exchange suffixes such as
`.L` or `.PA`. Topic tags describe the article's subject. The importer
normalizes symbol case and topic tag case. Re-importing an existing canonical
URL can add symbols and tags without adding another story. Tag associations
are stored under the server's `arc/news/article-tags` runtime data file, and
newly published stories also carry those fields. Articles with a company symbol
appear on that company's news page as soon as they are imported, without
entering the general feed queue. General articles without a company symbol
continue through the queue at one story every 40 minutes.

The public, read-only endpoint `/articles.json` accepts `symbol`, `q`, and
`limit` (maximum 100). It returns `articles`, `count`, `total`, `symbolcounts`,
and `tagcounts`. Counts include posted company articles and queued or published
general links. Articles include their status so a research agent can avoid
finding the same URL again.
The endpoint does not add articles. The existing controlled importer remains
the write path.

## Daily research

Run `node scripts/article-research-brief.mjs https://tradernews.fyi/` to get a
compact JSON brief from public quotes and article coverage. It ranks 12
companies by absolute daily percentage change and samples six quieter names
from the lower half of the remaining valid moves. The daily sample is
deterministic so a rerun investigates the same companies. It reports quote
timestamps, prior article counts and a few existing titles for each company.
The brief also ranks the 12 largest absolute one-month and six-month moves
using complete chart coverage and recent quotes. It selects five additional,
distinct companies from the leading 30 in those rankings: three from one month
and two from six months. This focus rotates by day. Each focus entry includes
its time window, percentage change, quote timestamp and existing article
coverage.

Give cheap research subagents small batches of these companies with ticker,
company name, move and existing coverage. They should search recent primary
company disclosures and reputable reporting for potentially relevant events,
and return a small list of freely readable links. A large price move alone
does not prove a cause; link an event to the move only when the reporting and
timing support it. Import one consolidated JSON batch so the live service is
stopped and restarted only once. Keep the broad economics and market editorial
queue alongside company research.

For the five longer-window companies, search for substantive reporting on the
business and sector trends behind the move, including competitors, demand,
pricing, regulation or capital spending where relevant. A trend article can
carry a company symbol when it materially covers that company; broader pieces
without a meaningful company connection belong in the general queue. Avoid
repeating a price-move roundup that adds no explanation.
