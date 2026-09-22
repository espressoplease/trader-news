#!./sharc

; Focused offline tests for the referral ledger.  They use a temporary ledger
; and a small account lookup stub so no application data is read or changed.
(load "arc.arc")

(= referral-test-dir* (string "/tmp/sharc-referrals-" (seconds) "-" (rand 1000000) "/"))
(ensure-dir referral-test-dir*)
(= newsdir* referral-test-dir*
   referral-test-users* (table))
(= (referral-test-users* 'alice) 1
   (referral-test-users* 'bob) 2)
(def lookup-uid (u) (referral-test-users* u))
; Preload an append-only ledger before the module loads so its actual startup
; replay path, including EOF, runs in this fresh process.
(w/outfile stream (string newsdir* "referral-events")
  (write '(111 0 "fixture-a" alice nil) stream)
  (disp #\newline stream)
  (write '(112 0 "fixture-b" alice nil) stream)
  (disp #\newline stream))
(load "referrals.arc")

(= referral-test-passed* 0 referral-test-failed* 0)
(mac referral-test (name form)
  `(if ,form
       (++ referral-test-passed*)
       (do (++ referral-test-failed*)
           (prn "FAIL " ',name))))

(def reset-referrals ()
  (= referral-counts* (table)
     referral-last* (table)
     referral-view-last* (table)
     referral-owners* (table)
     referral-days* (table))
  (when (file-exists referral-ledger*) (rmfile referral-ledger*)))

(referral-test startup-replay-count (is (referral-counts* 'alice) 2))
(referral-test startup-replay-days (is (referral-days* 0) 2))

; Milestones are exact powers of ten and remain uncapped.
(referral-test milestone-none (is (referral-level 999) 0))
(referral-test milestone-one (is (referral-level 1000) 1))
(referral-test milestone-two (is (referral-level 10000) 2))
(referral-test milestone-three (is (referral-level 100000) 3))
(referral-test milestone-unbounded (is (referral-level 1000000) 4))

; One IP can credit one referral per rolling hour. Repeat visits still become
; ledger/pageview events, but cannot inflate the referral count.
(reset-referrals)
(referral-test hourly-first (is (referral-record 10000 "198.51.100.1" 'alice nil) 'alice))
(referral-test hourly-repeat (no (referral-record 13599 "198.51.100.1" 'alice nil)))
(referral-test hourly-count-once (is (referral-counts* 'alice) 1))
(referral-test hourly-after-window (is (referral-record 13600 "198.51.100.1" 'alice nil) 'alice))
(referral-test hourly-count-twice (is (referral-counts* 'alice) 2))

; Different IPs are independent. Invalid and self referrals never credit.
(reset-referrals)
(referral-test different-ip-one (is (referral-record 20000 "198.51.100.2" 'alice nil) 'alice))
(referral-test different-ip-two (is (referral-record 20001 "198.51.100.3" 'alice nil) 'alice))
(referral-test different-ip-count (is (referral-counts* 'alice) 2))
(referral-test invalid-account (no (referral-record 20002 "198.51.100.4" 'nobody nil)))
(referral-test invalid-account-no-count (no (referral-counts* 'nobody)))
(referral-test self-referral (no (referral-record 20003 "198.51.100.5" 'alice 'alice)))
(referral-test self-referral-no-count (is (referral-counts* 'alice) 2))

; Analytics does not count a repeated background request as a new visit.
(reset-referrals)
(referral-record 25000 "198.51.100.9" nil nil)
(referral-record 25001 "198.51.100.9" nil nil)
(referral-test hourly-pageview-once
               (is (referral-days* (referral-day 25000)) 1))

; Replay derives exactly the same state from the append-only ledger.
(reset-referrals)
(referral-record 30000 "198.51.100.6" 'alice nil)
(referral-record 30001 "198.51.100.7" 'alice nil)
(= referral-counts* (table) referral-last* (table) referral-view-last* (table)
   referral-owners* (table) referral-days* (table))
(w/infile stream referral-ledger*
  (whilet event (errsafe (read stream))
    (referral-apply event)))
(referral-test replay-count (is (referral-counts* 'alice) 2))
(referral-test replay-daily-views (is (referral-days* (referral-day 30000)) 2))

; The real story-only helper stores its marker, including zero, so repeats
; cannot apply the bonus twice.
(= referral-test-story* (obj type 'story score 0)
   referral-test-comment* (obj type 'comment score 0))
(def metastory (i) (and i (in i!type 'story 'poll)))
(= (referral-counts* 'alice) 10000)
(referral-apply-bonus referral-test-story* 'alice)
(referral-test story-bonus (is referral-test-story*!score 2))
(referral-test story-marker (is referral-test-story*!referral-bonus 2))
(referral-apply-bonus referral-test-story* 'alice)
(referral-test story-idempotent (is referral-test-story*!score 2))
(referral-apply-bonus referral-test-comment* 'alice)
(referral-test comment-excluded (is referral-test-comment*!score 0))
(referral-test comment-no-marker (no referral-test-comment*!referral-bonus))

; Only a loopback peer may supply X-Real-IP. XFF is never used.
(referral-test header-loopback (is (visitor-address "127.0.0.1" '("GET / HTTP/1.0" "X-Real-IP: 203.0.113.9")) "203.0.113.9"))
(referral-test header-ipv6-loopback (is (visitor-address "::1" '("GET / HTTP/1.0" "x-real-ip: 2001:db8::1")) "2001:db8::1"))
(referral-test header-direct-ignored (is (visitor-address "198.51.100.8" '("GET / HTTP/1.0" "X-Real-IP: 203.0.113.9")) "198.51.100.8"))
(referral-test forwarded-ignored (is (visitor-address "127.0.0.1" '("GET / HTTP/1.0" "X-Forwarded-For: 203.0.113.10")) "127.0.0.1"))

(prn referral-test-passed* " passed, " referral-test-failed* " failed")
(when (> referral-test-failed* 0) (err "Referral tests failed"))
