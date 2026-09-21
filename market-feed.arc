; Trader News market-feed cache.
;
; The browser reads this server-side cache instead of calling a provider
; directly. A single conservative queue refreshes one provider request at a
; time, persists the last good result, and serves stale data with a compact
; freshness state when the provider is unavailable.

(= market-feed-dir* (string newsdir* "market/")
   market-feed-cache-file* (string newsdir* "market/market-cache.json")
   market-feed-state-file* (string newsdir* "market/market-feed-state.json")
   market-feed-lock* (make-lock 30 "market-feed")
   market-feed-cache* (table)
   market-feed-queue* nil
   market-feed-started* nil
   market-feed-next-request-at* 0
   market-feed-failures* 0
   market-feed-backoff-until* 0
   market-feed-last-tick-at* 0
   market-feed-last-attempt-at* 0
   market-feed-last-success-at* 0
   market-feed-last-error* nil
   market-feed-last-symbol* nil
   market-feed-last-provider-status* "not-attempted"
   market-feed-poll-runs* 0
   ; One upstream request every 30 seconds keeps the shared collector gentle.
   ; A full 13-index pass therefore takes about 6.5 minutes.
   market-feed-min-request-secs* 30
   market-feed-provider* "Yahoo public chart endpoint")

(= market-feed-ranges*
   '(("1d" "5m" 300)
    ("5d" "15m" 900)
    ("1mo" "1d" 3600)
    ("3mo" "1d" 86400)
    ("6mo" "1d" 86400)
    ("ytd" "1d" 86400)
    ("1y" "1wk" 86400)
    ("5y" "1mo" 86400)))

; The complete market-data.js file remains the source of constituent metadata.
; This list is deliberately only the small set of index symbols that power the
; always-visible rail and the default background refresh queue.
(= market-feed-index-symbols*
   '(("spx" "S&P 500" "^GSPC")
    ("nasdaq100" "Nasdaq-100" "^NDX")
    ("dow30" "Dow Jones" "^DJI")
    ("russell2000" "Russell 2000" "^RUT")
    ("ftse100" "FTSE 100" "^FTSE")
    ("dax" "DAX 40" "^GDAXI")
    ("cac40" "CAC 40" "^FCHI")
    ("eurostoxx50" "EURO STOXX 50" "^STOXX50E")
    ("nikkei225" "Nikkei 225" "^N225")
    ("hangseng" "Hang Seng" "^HSI")
    ("nifty50" "Nifty 50" "^NSEI")
    ("asx200" "ASX 200" "^AXJO")
    ("kospi" "KOSPI" "^KS11")))

(def market-feed-config (range)
  (or (find [is (car _) range] market-feed-ranges*)
      (car market-feed-ranges*)))

(def market-feed-entry-key (symbol range)
  (string symbol "|" range))

(def market-feed-entry (symbol range)
  (market-feed-cache* (market-feed-entry-key symbol range)))

(def market-feed-age (entry)
  (and entry entry!fetchedAt (- (seconds) entry!fetchedAt)))

(def market-feed-fresh (entry range)
  (and entry entry!points (acons entry!points) (> (len entry!points) 1)
       (let cfg (market-feed-config range)
         (and entry!fetchedAt (< (market-feed-age entry) (caddr cfg))))))

(def market-feed-yahoo-url (symbol range)
  (let cfg (market-feed-config range)
    (string "https://query1.finance.yahoo.com/v8/finance/chart/"
            (urlencode symbol)
            "?range=" (urlencode (car cfg))
            "&interval=" (urlencode (cadr cfg)))))

(def market-feed-number (value)
  ; This JSON decoder can represent long decimal tokens as symbols. Convert
  ; both those tokens and ordinary JSON numbers through Arc's numeric reader.
  (and value (errsafe:asnum (string value))))

(def market-feed-http (url)
  (http-response url
    (obj headers
         (list (list "User-Agent" "Trader-News-market-cache/1.0 (+https://tradernews.fyi)")
               (list "Accept" "application/json"))
         timeout 15
         maxtime 20)))

(def market-feed-points (payload)
  (when payload
    (let mfp-chart (payload 'chart)
      (when mfp-chart
        (let mfp-results (mfp-chart 'result)
          (let mfp-result (car mfp-results)
            (let mfp-indicators (mfp-result 'indicators)
              (let mfp-quotes (mfp-indicators 'quote)
                (let mfp-quote-data (car mfp-quotes)
                  (let mfp-ts (mfp-result 'timestamp)
                    (let mfp-closes (mfp-quote-data 'close)
                      (map (fn (mfp-t mfp-c)
                             (let mfp-close (market-feed-number mfp-c)
                               (and mfp-t mfp-close
                                    (obj ts (* mfp-t 1000)
                                         close mfp-close))))
                           mfp-ts mfp-closes))))))))))))

(def market-feed-persist! ()
  (ensure-dir market-feed-dir*)
  (save-json (obj version 1
                 updatedAt (seconds)
                 entries (vals market-feed-cache*))
             market-feed-cache-file*))

(def market-feed-persist-state! ()
  (ensure-dir market-feed-dir*)
  (save-json (obj version 1
                 updatedAt (seconds)
                 lastTickAt market-feed-last-tick-at*
                 lastAttemptAt market-feed-last-attempt-at*
                 lastSuccessAt market-feed-last-success-at*
                 lastError market-feed-last-error*
                 lastSymbol market-feed-last-symbol*
                 lastProviderStatus market-feed-last-provider-status*
                 pollRuns market-feed-poll-runs*
                 failures market-feed-failures*
                 backoffUntil market-feed-backoff-until*
                 nextRequestAt market-feed-next-request-at*)
             market-feed-state-file*))

(def market-feed-load! ()
  (ensure-dir market-feed-dir*)
  (whenlet snapshot (and (file-exists market-feed-cache-file*)
                         (errsafe:load-json market-feed-cache-file*))
    (each entry (or snapshot!entries nil)
      (when (and entry entry!symbol entry!range entry!points)
        (= (market-feed-cache* (market-feed-entry-key entry!symbol entry!range)) entry)))))
  (whenlet state (and (file-exists market-feed-state-file*)
                      (errsafe:load-json market-feed-state-file*))
    (= market-feed-last-tick-at* (or state!lastTickAt 0)
       market-feed-last-attempt-at* (or state!lastAttemptAt 0)
       market-feed-last-success-at* (or state!lastSuccessAt 0)
       market-feed-last-error* state!lastError
       market-feed-last-symbol* state!lastSymbol
       market-feed-last-provider-status* (or state!lastProviderStatus "not-attempted")
       market-feed-poll-runs* (or state!pollRuns 0)
       market-feed-failures* (or state!failures 0)
       market-feed-backoff-until* (or state!backoffUntil 0)
       market-feed-next-request-at* (or state!nextRequestAt 0)))

(def market-feed-queued? (symbol range)
  (some [and (is (car _) symbol) (is (cadr _) range)] market-feed-queue*))

(def market-feed-enqueue! (symbol range)
  (when (and symbol range)
    (w/lock market-feed-lock*
      (unless (or (market-feed-queued? symbol range)
                  (market-feed-fresh (market-feed-entry symbol range) range))
        (push (list symbol range) market-feed-queue*)))))

(def market-feed-error! (symbol range message)
  (= market-feed-last-error* message
     market-feed-last-provider-status* message)
  (w/lock market-feed-lock*
    (let old (market-feed-entry symbol range)
      (= (market-feed-cache* (market-feed-entry-key symbol range))
         (obj symbol symbol range range
              points (or (and old old!points) 'empty)
              fetchedAt (and old old!fetchedAt)
              attemptedAt (seconds)
              status (if (and old old!points) "stale" "unavailable")
              source market-feed-provider*
              error message)))
    (market-feed-persist!))
  (market-feed-persist-state!))

(def market-feed-refresh! (symbol range)
  (= market-feed-last-attempt-at* (seconds)
     market-feed-last-symbol* symbol)
  (market-feed-persist-state!)
  (let response (errsafe:market-feed-http (market-feed-yahoo-url symbol range))
    (if (and response (= response!status 200))
        (let payload (errsafe:from-json response!body)
          (let points (and payload (market-feed-points payload))
            (if (> (len points) 1)
                (do
                  (w/lock market-feed-lock*
                    (= (market-feed-cache* (market-feed-entry-key symbol range))
                       (obj symbol symbol range points points
                            fetchedAt (seconds) attemptedAt (seconds)
                            status "live-delayed" source market-feed-provider*
                            error nil))
                    (market-feed-persist!))
                  (= market-feed-failures* 0
                     market-feed-backoff-until* 0
                     market-feed-last-success-at* (seconds)
                     market-feed-last-error* nil
                     market-feed-last-provider-status* "ok")
                  (market-feed-persist-state!)
                  t)
                (do
                  (market-feed-error! symbol range "provider returned no usable points")
                  nil))))
        (do
          (++ market-feed-failures*)
          (= market-feed-backoff-until*
             (+ (seconds) (min 3600 (* 60 (expt 2 (min 5 market-feed-failures*))))))
          (market-feed-error! symbol range
                              (if response
                                  (string "provider HTTP " response!status)
                                  "provider request failed"))
          nil))))

(def market-feed-poll! ()
  (let now (seconds)
    (++ market-feed-poll-runs*)
    (= market-feed-last-tick-at* now)
    ; Persisting this small state record makes the scheduler observable after
    ; restarts. The cache itself is still written only on fetches/errors.
    (market-feed-persist-state!)
    (when (and (>= now market-feed-backoff-until*)
               (>= now market-feed-next-request-at*))
      (let job nil
        (w/lock market-feed-lock*
          (when market-feed-queue*
            (= job (pop market-feed-queue*))))
        (when job
          (= market-feed-next-request-at* (+ now market-feed-min-request-secs*))
          (market-feed-persist-state!)
          (market-feed-refresh! (car job) (cadr job)))))))

(def market-feed-prime! ()
  (market-feed-enqueue! "^GSPC" "1mo")
  (each entry market-feed-index-symbols*
    (market-feed-enqueue! (car (cddr entry)) "1d")))

(def market-feed-start! ()
  (unless market-feed-started*
    (= market-feed-started* t)
    (market-feed-load!)
    (market-feed-prime!)))

(def market-feed-age-label (age)
  (if (no age) "warming"
      (< age 60) "just now"
      (< age 3600) (string (trunc (/ age 60)) "m ago")
      (< age 86400) (string (trunc (/ age 3600)) "h ago")
                         (string (trunc (/ age 86400)) "d ago")))

(def market-feed-public-entry (entry range)
  (let age (market-feed-age entry)
    (obj symbol (and entry entry!symbol)
         range range
         points (if (and entry (acons entry!points)) entry!points 'empty)
         fetchedAt (and entry entry!fetchedAt)
         ageSecs age
         ageLabel (market-feed-age-label age)
         status (if (and entry (market-feed-fresh entry range))
                    "live-delayed"
                    (if (and entry (acons entry!points)) "stale" "unavailable"))
         pending (and entry (market-feed-queued? entry!symbol range))
         source market-feed-provider*
         error (and entry entry!error))))

(def market-feed-all-response ()
  (obj ok t serverTime (seconds) source market-feed-provider*
       interval "mixed cached ranges"
       entries (map [market-feed-public-entry _ _!range]
                    (keep [and _!symbol _!range] (vals market-feed-cache*)))))

(def market-feed-health-response ()
  (let now (seconds)
    (let poller-healthy (and market-feed-started*
                             market-feed-last-tick-at*
                             (< (- now market-feed-last-tick-at*) 45))
      (let provider-healthy (and market-feed-last-success-at*
                                 (< (- now market-feed-last-success-at*) 7200))
        (obj ok (and poller-healthy provider-healthy)
             pollerHealthy poller-healthy
             providerHealthy provider-healthy
             poller "in-process background thread"
             serverTime now
             lastTickAt market-feed-last-tick-at*
             lastAttemptAt market-feed-last-attempt-at*
             lastSuccessAt market-feed-last-success-at*
             lastError market-feed-last-error*
             lastSymbol market-feed-last-symbol*
             providerStatus market-feed-last-provider-status*
             queueDepth (len market-feed-queue*)
             failureCount market-feed-failures*
             backoffUntil market-feed-backoff-until*
             backoffSecs (max 0 (- market-feed-backoff-until* now))
             nextRequestAt market-feed-next-request-at*
             pollRuns market-feed-poll-runs*
             requestSpacingSecs market-feed-min-request-secs*
             provider market-feed-provider*
             cacheEntries (len (vals market-feed-cache*))
             indexSymbols (len market-feed-index-symbols*)
             note "Index charts are cached by the poller. Constituent quote and fundamental rows require a working provider feed.")))))

(def market-feed-response ()
  (market-feed-start!)
  (if arg!all
      (market-feed-all-response)
      (let symbol (or arg!symbol "^GSPC")
        (let range (or arg!range "1mo")
          (let entry (market-feed-entry symbol range)
            (unless (market-feed-fresh entry range)
              (market-feed-enqueue! symbol range))
            (market-feed-public-entry entry range))))))

(defopr market-feed
  (responding type-header*!json
    (prheader "Cache-Control" "no-store")
    (prn)
    (to-json (market-feed-response))))

(defopr market-feed-health
  (responding type-header*!json
    (prheader "Cache-Control: no-store")
    (prn)
    (market-feed-start!)
    (to-json (market-feed-health-response))))

(defbg market-feed 15
  (market-feed-poll!))
