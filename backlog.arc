; Curated market-link backlog and low-volume publishing loop.
;
; The seed lives in source control so a new Trader News instance has a useful
; first queue. Runtime state lives under arc/news/: `backlog` is the editable
; queue, `backlog-published` maps canonical URLs to story ids, and
; `backlog-last-published` keeps the drip rate stable through restarts.

(= market-backlog-seed*
   '(("AI and the global economy: implications for central banks"
      "https://www.bis.org/publ/bisbull130.htm" "BIS Bulletin")
     ("The future of AI is an AI futures market"
      "https://www.semafor.com/article/05/26/2026/the-future-of-ai-is-an-ai-futures-market" "Semafor")
     ("Oil markets strain to plug the gap left by Middle East supply shortfall"
      "https://www.iea.org/commentaries/oil-markets-strain-to-plug-the-gap-left-by-middle-east-supply-shortfall" "IEA")
     ("Why the drivers of inflation matter for monetary policy"
      "https://www.ecb.europa.eu/press/blog/date/2026/html/ecb.blog20260901~8d48e51f14.ga.html" "ECB Blog")
     ("Blind Extrapolation as a Powerful Force in Finance"
      "https://www.thediff.co/archive/blind-extrapolation-as-a-powerful-force-in-finance/" "The Diff")
     ("America’s Largest Electricity Market Lurches Towards Reform"
      "https://heatmap.news/energy/pjm-interconnection-reforms" "Heatmap")
     ("The Chinese EV standard winning globally is banned in the U.S."
      "https://restofworld.org/2026/us-china-ev-tech-ban-isolation/" "Rest of World")
     ("Economic Size and Economic Power"
      "https://paulkrugman.substack.com/p/economic-size-and-economic-power" "Paul Krugman")
     ("USMCA 2026 and Economic Security"
      "https://www.csis.org/analysis/usmca-2026-and-economic-security-convergence-technology-trade-and-national-security" "CSIS")
     ("The Case for Higher U.S. Rates"
      "https://theovershoot.co/p/the-case-for-higher-us-rates" "The Overshoot")
     ("High public debt in the Americas: non-linear implications for risk premia and inflation expectations"
      "https://www.bis.org/publ/bisbull133.htm" "BIS Bulletin")
     ("Energy shocks and inflation: challenges for monetary policy"
      "https://www.bis.org/publ/bisbull131.htm" "BIS Bulletin")
     ("Monetary policy transmission to exchange rates: the role of currency carry trades"
      "https://www.bis.org/publ/bisbull124.htm" "BIS Bulletin")
     ("Investment funds’ de facto currency risk exposure"
      "https://www.bis.org/publ/bisbull123.htm" "BIS Bulletin")
     ("War in the Middle East Challenges Global Financial Stability"
      "https://www.imf.org/en/blogs/articles/2026/04/14/war-in-the-middle-east-challenges-global-financial-stability" "IMF Blog")
     ("Global Imbalances: Old Questions, New Answers?"
      "https://www.imf.org/en/blogs/articles/2026/04/06/global-imbalances-old-questions-new-answers" "IMF Blog")
     ("OECD Economic Outlook, Interim Report March 2026"
      "https://www.oecd.org/en/publications/oecd-economic-outlook-interim-report-march-2026_d4623013-en/full-report.html" "OECD")
     ("Global Economic Prospects, January 2026"
      "https://www.worldbank.org/en/news/press-release/2026/01/13/global-economic-prospects-january-2026-press-release" "World Bank")
     ("Macroeconomics of tariffs with global production and finance networks"
      "https://cepr.org/voxeu/columns/macroeconomics-tariffs-global-production-and-finance-networks" "VoxEU/CEPR")
     ("Financial Entrepreneurship in the Indexing Era"
      "https://www.thediff.co/archive/financial-entrepreneurship-in-the-indexing-era/" "The Diff")
     ("What’s the Background Assumption?"
      "https://capitalgains.thediff.co/p/market-regimes" "Capital Gains / The Diff")
     ("The Economics and Politics of Pacing the Frontier"
      "https://www.thediff.co/archive/the-economics-and-politics-of-pacing-the-frontier/" "The Diff")
     ("Key Questions on Energy and AI"
      "https://www.iea.org/reports/key-questions-on-energy-and-ai/executive-summary" "IEA")
     ("Electricity Mid-Year Update 2026"
      "https://www.iea.org/reports/electricity-mid-year-update-2026/executive-summary" "IEA")
     ("How much computing power is in a data center?"
      "https://www.construction-physics.com/p/how-much-computing-power-is-in-a" "Construction Physics")
     ("Construction Costs Rarely Fall"
      "https://www.construction-physics.com/p/construction-costs-rarely-fall" "Construction Physics")
     ("How Long Does It Take to Plan a Bridge?"
      "https://www.construction-physics.com/p/how-long-does-it-take-to-plan-a-bridge" "Construction Physics")
     ("US Subways Build Too Many Cross Passages"
      "https://www.construction-physics.com/p/us-subways-build-too-many-cross-passages" "Construction Physics")
     ("Global Disruptions Are Testing How the World Moves Goods and People"
      "https://www.imf.org/en/blogs/articles/2026/04/29/global-disruptions-are-testing-how-the-world-moves-goods-and-people" "IMF Blog")
     ("Why the US’s Financial Efforts to Keep the Hormuz Strait Open Failed"
      "https://www.rusi.org/explore-our-research/publications/commentary/why-uss-financial-efforts-keep-hormuz-strait-open-failed" "RUSI")
     ("The Visibility Gap: How AI Can Stop Chinese Transshipment Under USMCA"
      "https://www.csis.org/analysis/visibility-gap-how-ai-can-stop-chinese-transshipment-under-usmca" "CSIS")
     ("The Limits of Control"
      "https://www.csis.org/analysis/limits-control" "CSIS")
     ("From rules to discretion: How Trump reconfigured US tariff policy"
      "https://www.brookings.edu/articles/from-rules-to-discretion-how-trump-reconfigured-us-tariff-policy/" "Brookings")
     ("Why haven’t tariffs significantly damaged the economy?"
      "https://www.brookings.edu/articles/why-havent-tariffs-significantly-damaged-the-economy/" "Brookings")
     ("Making America great again? Evaluating Trump’s China strategy at the one-year mark"
      "https://www.brookings.edu/articles/making-america-great-again-evaluating-trumps-china-strategy-at-the-one-year-mark/" "Brookings")
     ("What Next for Global Trade?"
      "https://www.project-syndicate.org/magazine/what-next-for-global-trade-by-pinelopi-koujianou-goldberg-2026-06" "Project Syndicate")
     ("World Rethinks Geoeconomic Calculus in a More Contested Era"
      "https://www.imf.org/en/blogs/articles/2026/06/03/the-geoeconomic-calculus" "IMF Blog")
     ("Updated thoughts on industrial policy"
      "https://www.noahpinion.blog/p/updated-thoughts-on-industrial-policy" "Noahpinion")
     ("The West’s Ukraine Sanctions Strategy has Lost its Way"
      "https://www.rusi.org/explore-our-research/publications/commentary/wests-ukraine-sanctions-strategy-has-lost-its-way" "RUSI")
     ("The Shadow Crypto Economy Feeding Russia’s War Machine"
      "https://www.rusi.org/explore-our-research/publications/commentary/shadow-crypto-economy-feeding-russias-war-machine" "RUSI")
     ("Decoding Sanctions: How Governments can get the Best out of Banks"
      "https://www.rusi.org/explore-our-research/publications/commentary/decoding-sanctions-how-governments-can-get-best-out-banks" "RUSI")
     ("China’s AI boom is creating a different kind of entrepreneur"
      "https://restofworld.org/2026/china-ai-worker-innovation/" "Rest of World")
     ("Why the global push to break free from Big Tech keeps falling short"
      "https://restofworld.org/2026/google-amazon-cloud-china-india/" "Rest of World")
     ("China leads the humanoid robot race, but the U.S. still has a shot"
      "https://restofworld.org/2026/china-tesla-robot-race/" "Rest of World")
     ("The Key Forces Now Shaping Markets and Geopolitics"
      "https://www1.project-syndicate.org/commentary/key-forces-shaping-markets-geopolitics-ai-unreliable-america-global-tail-risks-by-ian-bremmer-2026-06" "Project Syndicate")
     ("European vs. U.S. Economic Performance: An Update"
      "https://paulkrugman.substack.com/p/european-vs-us-economic-performance" "Paul Krugman")
     ("AI meets trade"
      "https://www.oecd.org/en/publications/ai-meets-trade_13081644-en.html" "OECD")
     ("AI investment increasingly shapes global economy"
      "https://www.semafor.com/article/06/30/2026/ai-spending-is-increasingly-shaping-global-economy" "Semafor")
     ("Sovereign wealth funds pivot to private markets and infrastructure"
      "https://www.semafor.com/article/06/29/2026/sovereign-wealth-funds-pivot-to-private-markets-and-infrastructure" "Semafor")
     ("The Chokepoint Economy"
      "https://www.semafor.com/article/05/06/2026/the-chokepoint-economy-ceos-say-the-us-is-resilient-but-markets-are-underpricing-risks" "Semafor Intelligence")))

(= market-backlog-file* (+ newsdir* "backlog")
   market-backlog-published-file* (+ newsdir* "backlog-published")
   market-backlog-last-file* (+ newsdir* "backlog-last-published")
   market-backlog-author* "marketbot"
   market-backlog-initial-count* 20
   market-backlog-drip-secs* (* 40 min*)
   frontpage-new-story-grace-secs* (* 20 min*)
   frontpage-new-story-slots* 2)

(or= market-backlog-lock* (make-lock 9 "market-backlog"))

(diskvar market-backlog* market-backlog-file* market-backlog-seed*)
(disktable market-backlog-published* market-backlog-published-file*)
(diskvar market-backlog-last-published* market-backlog-last-file* 0)

(def backlog-title (entry) (car entry))
(def backlog-url (entry) (cadr entry))
(def backlog-source (entry) (or (caddr entry) ""))
(def backlog-key (entry) (canonical-url:backlog-url entry))

(def ensure-market-backlog ()
  (unless (file-exists market-backlog-file*)
    (todisk market-backlog*))
  (unless (acct-exists market-backlog-author*)
    (create-acct market-backlog-author* (rand-string 64)))
  (unless (profile market-backlog-author*)
    (init-user market-backlog-author*))
  market-backlog*)

(def backlog-known-url (url)
  (let key (canonical-url url)
    (or (market-backlog-published* key)
        (some (fn (entry) (is (backlog-key entry) key)) market-backlog*))))

; This is the intended automation entrypoint for a future agent or a REPL.
; It writes immediately, and a duplicate URL is ignored rather than queued twice.
(def backlog-add (title url (o source ""))
  (unless (and (~blank title) (valid-url url))
    (err "Backlog entries need a title and a valid URL."))
  (w/lock market-backlog-lock*
    (unless (backlog-known-url url)
      (push (list title url source) market-backlog*)
      (todisk market-backlog*))
    market-backlog*))

(def backlog-pending ()
  (rem (fn (entry) (market-backlog-published* (backlog-key entry)))
       market-backlog*))

(def random-backlog-entries (n entries)
  (if (or (<= n 0) (no entries))
      nil
      (let entry (entries (rand (len entries)))
        (cons entry
              (random-backlog-entries (- n 1)
                                      (rem [ex _ entry] entries))))))

(def create-backlog-story (entry)
  (lets s (inst 'item 'type 'story 'id (new-item-id)
                      'url (backlog-url entry)
                      'title (process-title (backlog-title entry))
                      'by (user-id market-backlog-author*)
                      'ip "market-backlog"
                      'keys (list 'backlog))
    (= (items* s!id) s)
    (save-item s)
    (register-story s)
    (add-item s stories*)
    (adjust-rank s)
    s))

; Publish without a synthetic vote. Homepage fallback logic decides whether a
; fresh zero-vote backlog story needs visibility, while real votes still drive
; the normal ranked list.
(def backlog-publish-entry (entry)
  (w/lock market-backlog-lock*
    (let key (backlog-key entry)
      (or (market-backlog-published* key)
          (whenlet existing (live-story-w/url (backlog-url entry))
            (= (market-backlog-published* key) existing!id)
            (todisk market-backlog-published*)
            existing!id)
          (let story (create-backlog-story entry)
            (= (market-backlog-published* key) story!id)
            (todisk market-backlog-published*)
            story!id)))))

(def backlog-publish-random ((o n 1))
  (let published nil
    (each entry (random-backlog-entries n (backlog-pending))
      (whenlet id (backlog-publish-entry entry)
        (push id published)))
    (when published
      (= market-backlog-last-published* (seconds))
      (todisk market-backlog-last-published*))
    (rev published)))

(def prime-market-backlog ()
  (let missing (- market-backlog-initial-count* (len:keys market-backlog-published*))
    (when (> missing 0)
      (backlog-publish-random missing))))

(def backlog-ready-to-drip ()
  (>= (since market-backlog-last-published*) market-backlog-drip-secs*))

(defbg market-backlog-drip (* 1 min*)
  (when (and (backlog-ready-to-drip) (backlog-pending))
    (backlog-publish-random 1)))

(def backlog-story (item) (mem 'backlog item!keys))

(def latest-backlog-stories (n)
  (firstn n (sort (compare > !id) (keep shown&backlog-story stories*))))

(def frontpage-new-stories (n)
  ; Give a couple of genuine community posts a short discovery window. This
  ; only catches fresh 0/1-point stories, leaves curated backlog stories to
  ; their existing fallback, and never changes the stored score.
  (firstn n
         (sort (compare > !time)
               (keep (fn (item)
                       (and (metastory item)
                            (shown item)
                            (~backlog-story item)
                            (>= (realscore item) 0)
                            (<= (realscore item) 1)
                            (< (item-age item)
                               (/ frontpage-new-story-grace-secs* min*))))
                     stories*))))

; The normal score threshold remains honest. When the community has not yet
; produced enough voted stories, recent curated stories fill the remaining
; front-page slots without changing their score or pretending they have votes.
(def home-stories ((o n maxend*))
  (let want (or n perpage*)
    (let ranked (topstories want)
      (let ranked-ids (memtable (map !id ranked))
        (let fresh (rem (fn (item) (ranked-ids item!id))
                        (frontpage-new-stories frontpage-new-story-slots*))
          (let base (firstn (max 0 (- want (len fresh))) ranked)
            (let ids (memtable (map !id (+ base fresh)))
              (+ base fresh
                 (firstn (max 0 (- want (+ (len base) (len fresh))))
                         (rem (fn (item) (ids item!id))
                              (latest-backlog-stories want)))))))))))

(def latest-home-stories ()
  (firstn 5 (newstories)))

(def latest-home-stories-section ()
  (whenlet items (latest-home-stories)
    ; display-items closes its feed table before this footer runs.  Keep these
    ; rows in a separate, full-width table so browsers do not repair them into
    ; a narrow, stray column.
    (tag (table border 0 cellpadding 0 cellspacing 0 width "100%"
                class "latest-market-table")
      (spacerow 12 "latest-market-spacer")
      (tr
        (tag (td colspan 3 class "latest-market-heading")
          (prbold "Latest new articles")
          (tag (span class "latest-market-note")
            (pr " shown even before they receive votes"))))
      (each story items
        (display-item nil story "news" t)
        (spacerow 5 "spacer")))))

(def backlog-page ((o msg nil))
  (pagemessage msg)
  (para "Queue: @(len:backlog-pending) pending, "
        "@(len:keys market-backlog-published*) published. "
        "One queued story is published every 40 minutes.")
  (urform
    (if (and (~blank arg!title) (valid-url arg!url))
        (do (backlog-add arg!title arg!url arg!source)
            "backlog")
        (flink {backlog-page "Enter a title and a valid URL."}))
    (tab
      (row "title" (input "title" "" 60))
      (row "url" (input "url" "" 60))
      (row "source" (input "source" "" 30))
      (row "" (submit "add to backlog"))))
  (br)
  (ulink "publish one at random now"
    (backlog-publish-random 1)
    "backlog")
  (br2)
  (whenlet pending (firstn 25 (backlog-pending))
    (tag (table class "backlog-table")
      (each entry pending
        (row (link (backlog-title entry) (backlog-url entry))
             (backlog-source entry))))))

(defopa backlog
  (backlog-page))
