; Server-side community referrals and daily page-view analytics.
; The append-only ledger survives restarts. It contains keyed IP hashes only
; for referral deduplication and self-referral checks, never raw addresses.
(attribute img alt opstring)

(= referral-ledger* (string newsdir* "referral-events"))
(diskvar referral-secret* (string newsdir* "referral-secret"))
(or= referral-lock* (make-lock 24 "referrals")
     referral-counts* (table)
     referral-last* (table)
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
    (++ (referral-days* day 0))
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
                          (and (or credited user) fingerprint) credited user)
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
          (tag (p) (pr "Build the community by sharing Trader News."))
          (tag (a class "referral-url" href url) (presc url))
          (tag (p class "referral-progress")
            (pr (num visits) " credited visits · "
                (if (> tier 0) (string "+" tier " points on new posts · " (referral-stars user))
                    "First reward at 1,000 visits")
                " · Next milestone: " (num next)))
          (tag (p class "referral-rules")
            (pr "1,000 visits: +1 point and *. 10,000: +2 points and **. 100,000: +3 points and ***, and so on. Bonuses apply to new posts, in addition to the normal starting point. One visit per IP per hour counts; your own visits do not.")))))))

(def referral-chart-svg ()
  (w/lock referral-lock*
    (withs (today (referral-day)
            days (range (- today 29) today)
            values (map [referral-days* _ 0] days)
            peak (max 1 (apply max values))
            total (apply + values))
      (tostring
        (pr "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 720 160\" role=\"img\" aria-labelledby=\"title desc\"><title id=\"title\">Trader News daily page views</title><desc id=\"desc\">"
            total " page views in the last 30 days, including repeat visits. Peak daily views: " peak
            ".</desc><rect width=\"720\" height=\"160\" fill=\"#f6f6ef\"/><g fill=\"#82735f\" font-family=\"Verdana,sans-serif\" font-size=\"11\"><text x=\"10\" y=\"16\">"
            total " page views over 30 days</text><text x=\"10\" y=\"151\">29 days ago</text><text x=\"675\" y=\"151\">Today</text></g>")
        (for i 0 29
          (withs (value (values i) h (* 100.0 (/ value peak)) x (+ 10 (* i 23)))
            (pr "<rect x=\"" x "\" y=\"" (- 130 h) "\" width=\"18\" height=\"" h "\" fill=\"#718d73\"><title>"
                (- 29 i) " days ago: " value " views</title></rect>")))
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
            alt "Daily Trader News page views over the last 30 days, including repeat visits")
    (tag (p) (pr "Daily page views, including returning visitors. Updated every 5 minutes. Collection starts with this feature."))))
