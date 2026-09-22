; Server-side community referrals and daily page-view analytics.
; The append-only ledger survives restarts. It contains keyed IP hashes only
; for referral deduplication and self-referral checks, never raw addresses.
(attribute img alt opstring)

(= referral-ledger* (string newsdir* "referral-events"))
(diskvar referral-secret* (string newsdir* "referral-secret"))
(or= referral-lock* (make-lock 24 "referrals")
     referral-counts* (table)
     referral-last* (table)
     referral-view-last* (table)
     referral-owners* (table)
     referral-days* (table))

(def referral-day ((o at (seconds)))
  (trunc (/ at 86400)))

(def referral-level (visits)
  (with (level 0 threshold 1000)
    (while (>= visits threshold)
      (++ level)
      (= threshold (* threshold 10)))
    level))

(def referral-tier (user)
  (referral-level (referral-counts* user 0)))

(def referral-stars (user)
  (apply string (n-of (referral-tier user) "*")))

(def referral-apply-bonus (item user)
  (when (and (metastory item) (no item!referral-bonus))
    (= item!referral-bonus (referral-tier user))
    (++ item!score item!referral-bonus)))

(def referral-apply (event)
  (let (at day fingerprint ref owner) event
    ; Count analytics visits at most once per hour per keyed visitor. The old
    ; implementation counted every HTML request, so background refreshes
    ; could look like thousands of human views.
    (when (or (no fingerprint)
              (no (referral-view-last* fingerprint))
              (>= (- at (referral-view-last* fingerprint 0)) 3600))
      (when fingerprint (= (referral-view-last* fingerprint) at))
      (++ (referral-days* day 0)))
    (when fingerprint
      (when ref
        (= (referral-last* fingerprint) at)
        (++ (referral-counts* ref 0)))
      (when owner
        (= (referral-owners* (list owner fingerprint)) t)))))

; Replay one record at a time, so loading does not duplicate the ledger in RAM.
(unless (bound 'referral-loaded*)
  (when (file-exists referral-ledger*)
    (w/infile stream referral-ledger*
      (whilet event (errsafe (read stream))
        (referral-apply event))))
  (= referral-loaded* t))

(def referral-fingerprint (address)
  (unless referral-secret*
    (= referral-secret* (rand-string 64))
    (todisk referral-secret*))
  (sha1::hmac-sha1-hex referral-secret* (string "referral/" address)))

(def referral-credit? (at fingerprint ref user)
  (and ref (lookup-uid ref)
       (isnt ref user)
       (no (referral-owners* (list ref fingerprint)))
       (>= (- at (referral-last* fingerprint 0)) 3600)))

(def referral-record (at address ref user)
  (w/lock referral-lock*
    (let fingerprint (and address (referral-fingerprint address))
      (let credited (and fingerprint (referral-credit? at fingerprint ref user) ref)
        (let event (list at (referral-day at)
                          fingerprint credited user)
          ; Persist first. A write failure must not grant unpersisted rewards.
          (w/appendfile stream referral-ledger* (write event stream) (disp #\newline stream))
          (referral-apply event)
          credited)))))

(def referral-track-page ()
  (when (and (is (the request-method) 'get)
             (no (the referral-tracked)))
    (= (the referral-tracked) t)
    ; Analytics failure must not prevent reading or posting.
    (on-err (fn (error) (srvlog 'referrals "record failed" (string error)))
      (fn () (referral-record (seconds) (or (the visitor-ip) (ip)) arg!ref (me))))))

(def referral-banner ()
  (let user (me)
    (when user
      (withs (visits (referral-counts* user 0)
              tier (referral-tier user)
              next (* 1000 (expt 10 tier))
              url (string site-url* "/?ref=" (urlencode user)))
        (tag (section class "referral-banner")
          (tag (strong) (pr "Share Trader News"))
          (tag (p)
            (pr "Build the community by sharing Trader News. In return, earn extra starting points to help the stories and polls you post in future. Send your personal link to people who would enjoy the site. When someone opens Trader News through your link, their visit can count toward your sharing milestones."))
          (tag (a class "referral-url" href url) (presc url))
          (tag (p)
            (pr "At 1,000 credited visits, every new story or poll you post gets 1 extra starting point automatically, and a * appears beside your username. That means a post that normally starts with 1 point starts with 2. The star recognises your contribution to growing the community. You keep this benefit for future stories and polls; existing posts and comments do not receive the bonus."))
          (tag (p)
            (pr "At 10,000 visits, the bonus becomes 2 extra points per new story or poll and your username gets **. At 100,000, it becomes 3 extra points and ***. Each further tenfold milestone adds another point and star."))
          (tag (p class "referral-rules")
            (pr "To discourage repeated refreshing, only one visit from the same IP address counts per hour. Returning visitors can count again after an hour; your own visits do not count."))
          (tag (p class "referral-progress")
            (pr (num visits) " credited visits · "
                (if (> tier 0) (string "+" tier " points on new posts · " (referral-stars user))
                    "First reward at 1,000 visits")
                " · Next milestone: " (num next))))))))


(def referral-chart-svg ()
  (w/lock referral-lock*
    (withs (today (referral-day)
            days (range (- today 29) today)
            values (map [referral-days* _ 0] days)
            peak (max 1 (apply max values))
            total (apply + values))
      (tostring
        (pr "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 720 160\" role=\"img\" aria-labelledby=\"title desc\"><title id=\"title\">Trader News daily page views</title><desc id=\"desc\">"
            total " unique visits in the last 30 days. Peak daily visits: " peak
            ".</desc><rect width=\"720\" height=\"160\" fill=\"#f6f6ef\"/><g fill=\"#82735f\" font-family=\"Verdana,sans-serif\" font-size=\"11\"><text x=\"10\" y=\"16\">"
            total " unique visits over 30 days</text><text x=\"10\" y=\"151\">29 days ago</text><text x=\"675\" y=\"151\">Today</text></g>")
        (for i 0 29
          (withs (value (values i) h (* 100.0 (/ value peak)) x (+ 10 (* i 23)))
            (pr "<rect x=\"" x "\" y=\"" (- 130 h) "\" width=\"18\" height=\"" h "\" fill=\"#718d73\"><title>"
                (- 29 i) " days ago: " value " visits</title></rect>")))
        (pr "</svg>")))))

(defcache referral-cached-chart 300 (referral-chart-svg))

(defopr community-analytics.svg
  (responding (gen-type-header "image/svg+xml")
    (prn "Cache-Control: public, max-age=300")
    (prn "X-Content-Type-Options: nosniff")
    (prn)
    (pr (referral-cached-chart))))

(def referral-analytics ()
  (tag (section class "community-analytics")
    (tag (h3) (pr "Community activity"))
    (gentag img src "/community-analytics.svg" width "720" height "160"
            alt "Daily Trader News unique visits over the last 30 days")
    (tag (p) (pr "Daily unique visits, with returning visitors counted once per hour. Updated every 5 minutes. Collection starts with this feature."))))
