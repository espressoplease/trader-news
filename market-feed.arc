; The supervised Python collector owns provider requests and SQLite history.
; These same-origin routes only read its loopback API. Existing Arc cache files
; remain untouched, and browser traffic never performs a provider request.

(def market-service-body (endpoint)
  (let url (string "http://127.0.0.1:" (readenv "MARKET_DATA_PORT" 8766)
                   "/" endpoint "?symbol=" (urlencode (or arg!symbol "^GSPC"))
                   "&range=" (urlencode (or arg!range "1d"))
                   "&market=" (urlencode (or arg!market ""))
                   "&symbols=" (urlencode (or arg!symbols ""))
                   "&all=" (urlencode (or arg!all "")))
    (aif (errsafe (http-response url (obj timeout 3 maxtime 5)))
         it!body
         (tostring
           (to-json (obj ok nil status "unavailable" points 'empty entries 'empty
                         error "Market data service is temporarily unavailable."))))))

(def market-service-output (endpoint)
  (responding type-header*!json
    (prheader "Cache-Control" "no-store")
    (prn)
    (pr (market-service-body endpoint))))

(defopr market-feed (market-service-output "market-feed"))
(defopr market-quotes (market-service-output "market-quotes"))
(defopr market-feed-health (market-service-output "market-feed-health"))

; UTM parameters attribute visits at the destination. This small first-party
; ledger also records outbound research clicks when a destination strips them.
(= market-click-ledger* (string newsdir* "market-clicks"))

(def market-click-kind? (kind)
  (in kind "company_quote" "investor_relations"))

(def market-click-symbol? (symbol)
  (and symbol (~blank symbol) (< (len symbol) 32)
       (all [or (alphadig _) (in _ #\^ #\. #\-)] symbol)))

(def market-click-record (symbol kind)
  (when (and (market-click-symbol? symbol) (market-click-kind? kind))
    (w/appendfile stream market-click-ledger*
      (write (list (seconds) symbol kind) stream)
      (disp #\newline stream))))

(defopr market-click
  (market-click-record arg!symbol arg!kind)
  (responding type-header*!json
    (prn)
    (prjson (obj ok t))))
