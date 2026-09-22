; Privacy-friendly weekly cohort analytics.
;
; The browser stores a shared first-visit week, not a visitor ID. Each full
; HTML page load sends that week and the current week to this ledger. No IP,
; cookie, fingerprint, account name, user-agent, or referrer is recorded here.
; Market polling and other same-origin API requests never execute the client
; script, so they do not become visits.

(= cohort-ledger* (string newsdir* "cohort-events")
   cohort-lock* (make-lock 25 "cohort-analytics")
   cohort-buffer* nil
   cohort-counts* (table)
   cohort-weeks* (table)
   cohort-cohorts* (table)
   cohort-loaded* nil)

(def cohort-week? (s)
  (and (isa s 'string)
       (is (len s) 8)
       (is (cut s 4 6) "-W")
       (all digit (cut s 0 4))
       (all digit (cut s 6 8))
       (let n (errsafe (int (cut s 6 8)))
         (and n (<= 1 n 53)))))

(def cohort-type (s)
  (if (in s "home" "listing" "item" "chat" "profile" "other")
      s
      "other"))

(def cohort-key (cohort week)
  (list (or cohort "") week))

(def cohort-apply (event)
  (let (at cohort week typ) event
    (when (and (cohort-week? week)
               (or (blank cohort) (cohort-week? cohort)))
      (++ (cohort-counts* (cohort-key cohort week) 0))
      (= (cohort-weeks* week) t)
      (when (~blank cohort)
        (= (cohort-cohorts* cohort) t)))))

; Replay the append-only ledger at startup. Invalid or truncated trailing
; records are ignored so a process interruption cannot prevent boot.
(unless cohort-loaded*
  (when (file-exists cohort-ledger*)
    (w/infile stream cohort-ledger*
      (whilet event (errsafe (read stream))
        (cohort-apply event))))
  (= cohort-loaded* t))

(def cohort-record (cohort week typ)
  (when (cohort-week? week)
    (let event (list (seconds)
                     (if (cohort-week? cohort) cohort "")
                     week
                     (cohort-type typ))
      (w/lock cohort-lock*
        ; Update the in-memory table immediately, then queue the compact event
        ; for the scheduled append-only flush. This keeps page requests cheap
        ; while retaining the same replayable storage format.
        (cohort-apply event)
        (push event cohort-buffer*)))))

(def cohort-buffer-size ()
  (w/lock cohort-lock*
    (len cohort-buffer*)))

(def cohort-flush ()
  (w/lock cohort-lock*
    (when cohort-buffer*
      ; Keep the buffer intact until the append succeeds. If storage is
      ; temporarily unavailable, the next timer pass can retry it.
      (w/appendfile stream cohort-ledger*
        (each event (rev cohort-buffer*)
          (write event stream)
          (disp #\newline stream)))
      (= cohort-buffer* nil))))

; The server registers this hook when the feature is loaded. Keeping the hook
; generic means stop/restart can flush any buffered analytics without knowing
; about this module.
(when (bound 'register-bgstop-hook)
  (register-bgstop-hook 'cohort-analytics cohort-flush))

(def cohort-table-weeks ()
  (let weeks (sort < (keys cohort-weeks*))
    (if (> (len weeks) 8)
        (nthcdr (- (len weeks) 8) weeks)
        weeks)))

(def cohort-table-cohorts ()
  (let cohorts (sort < (keys cohort-cohorts*))
    (if (> (len cohorts) 12)
        (nthcdr (- (len cohorts) 12) cohorts)
        cohorts)))

(def cohort-short-week (week)
  (string (cut week 2 4) "W" (cut week 6 8)))

(def cohort-cell (cohort week)
  (cohort-counts* (cohort-key cohort week) 0))

(def cohort-table ()
  (let (weeks cohorts) (list (cohort-table-weeks) (cohort-table-cohorts))
    (if (empty weeks)
        (tag (p class "cohort-empty")
          (pr "Cohort data will appear after the first page loads."))
        (do
          (tag (p class "cohort-note")
            (pr "Each row groups visitors by the week they first arrived. "
                "Cells are page-load visits from that cohort in the selected week. "
                "This is not a unique-user count."))
          (tag (div class "cohort-table-scroll")
            (tag (table class "cohort-table")
              (tag (thead)
                (tag (tr)
                  (tag (th class "cohort-label") (pr "first seen"))
                  (tag (th class "cohort-size") (pr "size"))
                  (each week weeks
                    (tag (th) (pr (cohort-short-week week))))))
              (tag (tbody)
                (each cohort cohorts
                  (tag (tr)
                    (tag (th class "cohort-label") (pr (cohort-short-week cohort)))
                    (tag (td class "cohort-size") (pr (cohort-cell cohort cohort)))
                    (each week weeks
                      (let n (cohort-cell cohort week)
                        (tag (td class (if (> n 0) "cohort-hit" "cohort-zero"))
                          (pr (if (> n 0) n "·")))))))
                (tag (tr class "cohort-unattributed")
                  (tag (th class "cohort-label") (pr "unattributed"))
                  (tag (td class "cohort-size") (pr "·"))
                  (each week weeks
                    (tag (td)
                      (pr (cohort-cell "" week))))))))))))

(def cohort-analytics ()
  (w/lock cohort-lock*
    (tag (details class "cohort-analytics")
      (tag (summary) (pr "Audience cohorts"))
      (cohort-table)
      (tag (p class "cohort-privacy")
        (pr "Weekly grouping only. No visitor IDs are stored. "
            "Market and background API requests are excluded. ")
        (tag (button type "button" class "cohort-optout") (pr "opt out"))))))

(defopr cohort-visit
  (cohort-record arg!cohort arg!week arg!type)
  (responding type-header*!json
    (prheader "Cache-Control" "no-store")
    (prn)
    (prjson (obj ok t))))
