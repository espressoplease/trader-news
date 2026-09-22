; Trader News community chat.
;
; Chat is intentionally small and server-rendered. Messages and moderation
; state live beside the existing news account data so a browser refresh or
; a second server process does not create a second source of truth.

(= chat-message-file* (string chatdir* "messages")
   chat-blocked-file* (string chatdir* "blocked-users")
   chat-lock* (make-lock 20 "trader-chat"))

(or= chat-messages* (safe-load-table chat-message-file*)
     chat-blocked*  (safe-load-table chat-blocked-file*))

; This is deliberately conservative. The filter checks whole words after
; punctuation is tokenised away, so ordinary words containing a substring do
; not get rejected accidentally. Moderators can still remove anything missed.
(= chat-banned-words*
   '("ass" "bastard" "bitch" "bullshit" "crap" "cunt" "dick"
     "fag" "fuck" "motherfucker" "nazi" "prick" "pussy" "rape"
     "retard" "shit" "slut" "whore"))

(def chat-key (user)
  (downcase (string user)))

(def chat-blocked? (user)
  (chat-blocked* (chat-key user)))

(def chat-message (id)
  (chat-messages* id))

(def chat-filtered? (text)
  (some [mem (downcase _) chat-banned-words*]
        (tokens (or text "") (fn (c) (~alphadig c)))))

(def chat-clean-text (text)
  (let text (trim (or text ""))
    (if (blank text) nil (cut text 0 (min 500 (len text))))))

(def chat-next-id ()
  (if (empty chat-messages*) 1 (+ 1 (apply max (keys chat-messages*)))))

(def chat-last-id ()
  (if (empty chat-messages*) 0 (apply max (keys chat-messages*))))

(def chat-save! ()
  (save-table chat-messages* chat-message-file*)
  (save-table chat-blocked* chat-blocked-file*)
  t)

(def chat-add! (user text)
  (let text (chat-clean-text text)
    (unless text (err "Please enter a message."))
    (when (chat-filtered? text)
      (err "That message contains language that is not allowed in chat."))
    (when (chat-blocked? user)
      (err "Your chat access is currently blocked."))
    (w/lock chat-lock*
      (let id (chat-next-id)
        (= (chat-messages* id)
           (obj id id user user text text created (seconds)
                flags nil deleted nil))
        (chat-save!)
        id))))

(def chat-flag! (id reporter)
  (let id (safe-posint id)
    (whenlet msg (chat-message id)
      (unless (is msg!user reporter)
        (w/lock chat-lock*
          (= msg!flags (pushnew (chat-key reporter) msg!flags))
          (= (chat-blocked* (chat-key msg!user))
             (obj user msg!user flagged-by msg!flags flagged-at (seconds)))
          (chat-save!))))
  "chat"))

(def chat-reinstate! (user)
  (w/lock chat-lock*
    (wipe (chat-blocked* (chat-key user)))
    (chat-save!))
  (chat-admin-page))

(def chat-delete-user! (user)
  ; Existing accounts are referenced by votes and submissions, so account
  ; removal is implemented as a reversible moderation disable plus removal of
  ; the user's chat messages. This preserves the rest of the site's history.
  (disable-acct user)
  (w/lock chat-lock*
    (each msg (vals chat-messages*)
      (when (is msg!user user)
        (= msg!deleted t)))
    (chat-save!))
  (chat-admin-page))

(def chat-age (at)
  (let secs (max 0 (since at))
    (if (< secs 60) "just now"
        (< secs hour*) (string (trunc:/ secs min*) "m ago")
        (< secs day*) (string (trunc:/ secs hour*) "h ago")
        (string (trunc:/ secs day*) "d ago"))))

(def chat-message-row (msg (o admin-view nil))
  (unless msg!deleted
    (tag (div class "trader-chat-message")
      (tag (div class "trader-chat-meta")
        (userlink msg!user nil nil)
        (pr " · " (chat-age msg!created))
        (when (and admin-view msg!flags)
          (spanclass trader-chat-flagged
            (pr " · flagged by " (len msg!flags)))))
      (tag (div class "trader-chat-body")
        (presc msg!text))
      (unless admin-view
        (unless (or (no (me)) (is msg!user (me)))
          (urform (chat-flag! arg!id (me))
            (hidden-input 'id msg!id)
            (tag (button class "trader-chat-flag" type "submit")
              (pr "flag"))))))))

(def chat-recent-messages ()
  (let ids (sort > (keys chat-messages*))
    (map chat-message (firstn 100 ids))))

(def chat-json-messages (since-id before-id)
  ; Incremental polling must not use the recent-100 window. A quiet tab can
  ; be away long enough for more than 100 messages to arrive, and all of them
  ; should be recoverable from the persisted table.
  (let messages
       (keep (fn (msg)
               (and (no msg!deleted)
                    (if before-id
                        (< msg!id before-id)
                        (> msg!id since-id))))
             (vals chat-messages*))
    (let sorted (sort (compare (if before-id < >) !id) messages)
      (if before-id (firstn 100 sorted) sorted))))

(def chat-json-message (msg)
  (obj id msg!id user msg!user text msg!text created msg!created
       deleted msg!deleted flags (len msg!flags) referralStars (referral-stars msg!user)))

(def chat-json-page ()
  (let since-id (or (safe-posint arg!since) 0)
       before-id (safe-posint arg!before)
    (responding type-header*!json (prn)
      (prjson
        (obj ok t messages
             (map chat-json-message (chat-json-messages since-id before-id)))))))

(def chat-page ()
  (shortpage nil "chat" "Trader News chat" "chat"
    (let recent (chat-recent-messages)
      (tag (div id "trader-chat" class "trader-chat"
                data-last-id (string (chat-last-id))
                data-oldest-id (string (if recent (last recent)!id 0)))
      (tag (div class "trader-chat-heading")
        (tag (h1) (pr "Trader News chat"))
        (tag (p class "trader-chat-note")
          (pr "Logged-in users can join the conversation. Be civil, stay on topic, and flag abuse. New messages refresh every 30 seconds while this tab is visible. ")
          (tag (span id "trader-chat-refresh" class "trader-chat-refresh")
            (pr "Next refresh in 30s"))))
      (tag (div class "trader-chat-history-controls")
        (tag (button id "trader-chat-load-older" type "button")
          (pr "load older messages")))
      (tag (div id "trader-chat-messages" class "trader-chat-messages")
        (each msg (rev recent)
          (chat-message-row msg)))
      (when (chat-blocked? (me))
        (tag (p class "trader-chat-blocked")
          (pr "Your chat access is currently blocked by a moderator.")))
      (if (no (me))
          (tag (p class "trader-chat-login")
            (pr "Log in to post messages. ")
            (tag (a href "login?goto=chat") (pr "log in")))
          (unless (chat-blocked? (me))
        (urform (do (chat-add! (me) arg!text) "chat")
          (tag (div class "trader-chat-compose")
            (tag (textarea name "text" rows "3" cols "60"
                          maxlength "500" placeholder "Write a message...")
              (pr (or arg!text "")))
            (tag (div class "trader-chat-compose-foot")
              (pr "No investment advice or personal data, please. ")
              (submit "send"))))))))))

(def chat-admin-page ()
  (if (no (is (chat-key (me)) "failmore"))
      (login-page 'login "The chat moderation page is restricted." {admin})
      (shortpage nil "admin" "Chat moderation" "admin"
        (tag (div class "trader-chat-admin")
          (tag (h1) (pr "Chat moderation"))
          (tag (p) (pr "Flagged messages block the author until reinstated."))
          (if (empty chat-blocked*)
              (tag (p) (pr "No blocked chat users."))
              (each key (sort < (keys chat-blocked*))
                (let record (chat-blocked* key)
                  (tag (div class "trader-chat-admin-user")
                    (tag (div class "trader-chat-admin-user-heading")
                      (link record!user (user-url record!user))
                      (pr " · " (len record!flagged-by) " flag(s)"))
                    (w/rlink (chat-reinstate! record!user)
                      (pr "reinstate chat"))
                    (pr " · ")
                    (w/rlink (chat-delete-user! record!user)
                      (pr "delete user and chat"))))))
          (tag (h2) (pr "Flagged messages"))
          (each msg (keep (fn (msg) (and (no msg!deleted) msg!flags))
                          (chat-recent-messages))
            (chat-message-row msg t))))))

(def chat-user? (user) user)

(defop chat
  (chat-page))

(defop chat.json
  (chat-json-page))

(defopt chat-flag chat-user? " to flag chat"
  (chat-flag! id (me)))

(newsop terms ()
  (shortpage nil "terms" "Trader News terms of use" "terms"
    (tag (div class "trader-terms")
      (tag (h1) (pr "Trader News terms of use"))
      (tag (p class "trader-terms-note")
        (pr "This is a plain-language site summary, not legal advice. Odd Solutions Ltd should have a solicitor review the final wording before public launch."))
      (tag (h2) (pr "What Trader News is"))
      (tag (p) (pr "Trader News is an information and discussion website. Market prices, charts, company data, news, rankings, and other material may be delayed, incomplete, unavailable, or wrong. Data is supplied for general information only."))
      (tag (h2) (pr "No investment advice"))
      (tag (p) (pr "Nothing on Trader News is investment, financial, tax, legal, or trading advice. Odd Solutions Ltd does not recommend any security, asset, strategy, or transaction, and accepts no responsibility for investment decisions or losses. Make your own assessment and obtain independent professional advice where appropriate."))
      (tag (h2) (pr "Accounts and community use"))
      (tag (p) (pr "Keep your account details secure and do not impersonate another person. Do not post unlawful material, spam, market manipulation, confidential information, personal data, threats, harassment, discrimination, or abusive language. Chat messages are user content, and should be treated as public."))
      (tag (h2) (pr "Moderation"))
      (tag (p) (pr "We may filter, flag, hide, delete, or restrict content and accounts. Flagging is not proof that a report is correct. Chat access may be blocked while a report is reviewed. We may disable accounts or cooperate with lawful requests where required."))
      (tag (h2) (pr "Availability and liability"))
      (tag (p) (pr "The service is provided on an availability basis. To the fullest extent permitted by applicable law, Odd Solutions Ltd excludes responsibility for losses, decisions, interruptions, errors, omissions, unavailable data, third-party links, user content, and indirect or consequential loss. Nothing here excludes liability that cannot lawfully be excluded."))
      (tag (h2) (pr "Changes and contact"))
      (tag (p) (pr "We may update these terms as the service changes. Continued use after an update means you accept the updated wording. If you have a legal or safety concern, use the site's contact route.")))))
