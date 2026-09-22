# Privacy-friendly cohort analytics

Trader News records weekly cohort activity separately from referral analytics.
The community activity chart uses a keyed hash of the source address only to
deduplicate repeat requests within its five-minute window; raw IP addresses are
not stored. The opt-out control described below applies to cohort attribution.
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

The page includes an explicit privacy explanation and a SmallDocs-style
opt-out toggle. Opting out stores only the local sentinel value `opt-out` in
the browser, stops cohort attribution, and leaves later page loads in the
unattributed bucket. It does not identify the visitor. The same control can
opt back in later by starting a new cohort week.

The file is append-only and is replayed on startup. Events update the in-memory
table immediately, then batch in memory and flush to the ledger every 15
minutes. A normal server stop or restart flushes the pending batch first. If a
write fails, the batch stays queued for the next attempt. Back it up with the
other files under `arc/news/` if cohort history needs to survive a server
migration.
