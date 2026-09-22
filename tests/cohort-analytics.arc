#!./sharc

; Focused tests for the privacy-friendly weekly cohort ledger.
(load "arc.arc")

(= cohort-test-dir* (string "/tmp/sharc-cohorts-" (seconds) "-" (rand 1000000) "/"))
(ensure-dir cohort-test-dir*)
(= newsdir* cohort-test-dir*)

; Exercise startup replay before the module is loaded.
(w/outfile stream (string newsdir* "cohort-events")
  (write '(111 "2026-W15" "2026-W15" "listing") stream)
  (disp #\newline stream)
  (write '(112 "" "2026-W16" "item") stream)
  (disp #\newline stream))
(load "cohort-analytics.arc")

(= cohort-test-passed* 0 cohort-test-failed* 0)
(mac cohort-test (name form)
  `(if ,form
       (++ cohort-test-passed*)
       (do (++ cohort-test-failed*)
           (prn "FAIL " ',name))))

(cohort-test valid-week (cohort-week? "2026-W15"))
(cohort-test invalid-week (no (cohort-week? "2026-W00")))
(cohort-test invalid-shape (no (cohort-week? "2026-15")))
(cohort-test replay-cohort-cell (is (cohort-cell "2026-W15" "2026-W15") 1))
(cohort-test replay-unattributed-cell (is (cohort-cell "" "2026-W16") 1))

(cohort-record "2026-W15" "2026-W16" "item")
(cohort-test return-cell (is (cohort-cell "2026-W15" "2026-W16") 1))
(cohort-test current-week-recorded (mem "2026-W16" (keys cohort-weeks*)))
(cohort-test event-buffered (is (cohort-buffer-size) 1))
(cohort-test invalid-event-ignored (no (cohort-record "2026-W15" "bad" "item")))

(cohort-flush)
(cohort-test event-flushed (is (cohort-buffer-size) 0))

; Rebuild the in-memory state from disk and compare the key cells.
(= cohort-counts* (table) cohort-weeks* (table) cohort-cohorts* (table))
(w/infile stream cohort-ledger*
  (whilet event (errsafe (read stream))
    (cohort-apply event)))
(cohort-test replay-return-cell (is (cohort-cell "2026-W15" "2026-W16") 1))
(cohort-test replay-size-cell (is (cohort-cell "2026-W15" "2026-W15") 1))

(prn cohort-test-passed* " passed, " cohort-test-failed* " failed")
(when (> cohort-test-failed* 0) (err "Cohort tests failed"))
