# Privacy-friendly cohort analytics

Trader News records weekly cohort activity separately from referral analytics.
The browser stores the ISO week of its first visit in local storage under
`trader_news_cohort`. A full HTML page load sends that week, the current ISO
week, and one coarse page type to `/cohort-visit`.

The append-only ledger is `arc/news/cohort-events`. Each record contains only:

- the event timestamp;
- the first-visit week, or an empty value when storage is unavailable or the
  visitor has opted out;
- the current visit week; and
- a coarse page type such as `listing`, `item`, or `chat`.

The ledger does not contain an IP address, account name, cookie ID, UUID,
fingerprint, user-agent, or referrer. Market polling, chat polling, static
assets, and JSON endpoints do not load the client tracker. One person opening
several pages therefore produces several page-load visits. The cohort table is
retention activity, not a unique-user report.

The main footer links to a dedicated `/analytics` page rather than placing
analytics in every page's footer. That page contains the community activity
chart and one normal, visible `Audience cohorts` section. Rows are first-visit
weeks, columns are visit weeks, and the diagonal is the cohort's birth-week
activity. The full retained history is available, with a separate unattributed
row covering private browsing, blocked storage, and opted-out visits.

The table wrapper follows SmallDocs' bounded horizontal-scroll pattern. It
keeps a readable intrinsic table width as weeks accumulate, enables touch
scrolling on narrow screens, and shows a subtle right-edge cue while more
columns are available. It uses Trader News's existing market accent, tint, and
border variables rather than importing SmallDocs CSS.

To opt out, expand the table and select `opt out`. The browser stores the
sentinel value `opt-out`, and later page loads are counted as unattributed.

The file is append-only and is replayed on startup. Events update the in-memory
table immediately, then batch in memory and flush to the ledger every 15
minutes. A normal server stop or restart flushes the pending batch first. If a
write fails, the batch stays queued for the next attempt. Back it up with the
other files under `arc/news/` if cohort history needs to survive a server
migration.
