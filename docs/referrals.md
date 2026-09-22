# Community referrals and analytics

Logged-in readers see a share banner below the footer activity chart with a highlighted `/?ref=USERNAME` link, copy and share controls, their credited
visits, earned bonus and next milestone. The share control uses the device's native share sheet where available and falls back to copying the link. Valid account usernames are resolved
on the server. One IP can credit one referral in a rolling 3,600-second window,
even across different referral links. Returning visitors may credit again after
that hour. Signed-in self-visits and IPs previously seen signed in as the
referrer do not earn credit. Shared networks therefore share an hourly slot.
This is basic anti-refresh protection, not proof of a unique human.

At 1,000 visits a user earns one star and +1 starting point on new stories and
polls, at 10,000 two, at 100,000 three, and each tenfold milestone adds one.
The bonus is in addition to the normal submitter vote. It is stored on the
item once, does not change comments or existing posts, and is not awarded
again for a duplicate-link vote. Display stars apply to usernames and chat.

`referrals.arc` records server-rendered GET page views, including repeat visits,
and excludes market polling, chat polling, static assets and the chart itself.
The single footer SVG displays the last 30 UTC days. Both its server-rendered
body and its HTTP response cache for five minutes. It has no client analytics
script or polling loop. Personalized pages and referral links are not shared
cached. Collection begins at deployment; no historic traffic is invented.

The ledger `arc/news/referral-events` is append-only and replayed at startup.
Back it up together with `arc/news/referral-secret`, the secret used to HMAC IP
addresses. Raw IPs are not saved by this feature. Existing site logs are separate.
Successful referral counts and last-credit times survive restarts. Recording is
serialized and written before counts change. Logging failure is reported to the
server log without preventing page rendering.

The local Nginx proxy must overwrite `X-Real-IP` with `$remote_addr`. Only requests
whose socket peer is loopback may use that header for referral tracking; all
other requests use their actual socket peer. Arbitrary forwarded IP chains are
ignored. This change deliberately leaves the older application's voting and
login IP behavior unchanged.

Validation: `./sharc tests/referrals.arc`, `./sharc test.arc`, and browser checks
of the banner, chart cache headers, mobile layout and anonymous visibility.
