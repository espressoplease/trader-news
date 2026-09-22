# Trader News production deployment runbook

Prepared 2026-09-21.

This is the current deployment path for Trader News. It supersedes the older Sharc notes that refer to /opt/sharc, sharc.service, tmux, or news.ycombinator.lol.

## Current production facts

- Repository: https://github.com/espressoplease/trader-news
- Local checkout: /Users/mac/code/sharc
- GitHub remote used for deployment: trader-news
- Local branch: main
- Production branch: main
- Production server: Hetzner, 178.156.150.201
- Local SSH alias: r5c
- SSH user: deploy
- Production checkout: /home/deploy/apps/trader-news
- Systemd unit: trader-news.service
- Public URL: https://tradernews.fyi
- App listens on port 8080
- Nginx proxies the public domain to 127.0.0.1:8080
- Runtime: /usr/bin/sbcl
- Service starts boot.lisp with news.arc
- Server-owned application data lives under arc/ and is not in Git

The production remote has been verified as:

~~~text
origin https://github.com/espressoplease/trader-news.git
~~~

The service environment includes:

~~~text
PORT=8080
SITE_URL=https://tradernews.fyi
SHARC_DAEMON=1
~~~

## Normal deployment

### 1. Work locally

~~~sh
cd /Users/mac/code/sharc
~~~

Inspect the current state before changing anything:

~~~sh
git status --short --branch
git log -5 --oneline
git remote -v
~~~

Run the project checks:

~~~sh
./sharc test.arc
node --check static/hn.js
git diff --check
~~~

The known baseline is 1039 tests passing. Do not deploy if tests or syntax checks fail unless the failure is understood and intentional.

### 2. Commit the change

Review the diff:

~~~sh
git diff
git status --short
~~~

Commit only the intended files:

~~~sh
git add path/to/file1 path/to/file2
git commit -m "describe the change"
~~~

Push the main branch to the Trader News repository:

~~~sh
git push trader-news main
~~~

Confirm the commit that was pushed:

~~~sh
git rev-parse --short HEAD
git ls-remote trader-news refs/heads/main
~~~

### 3. Check that production is safe to update

The production checkout must be clean before using the hard reset deployment command. This protects any unexpected server-side edits.

~~~sh
ssh r5c 'git -C /home/deploy/apps/trader-news status --short --branch'
~~~

Expected output is a clean branch line similar to:

~~~text
## main...origin/main
~~~

If tracked changes are present, stop and inspect them. Do not overwrite them automatically.

The arc/ directory is live application data and is normally ignored by Git. Do not copy a local arc/ directory to production.

### 4. Deploy the pushed commit

After confirming the production checkout is clean:

~~~sh
ssh r5c 'set -e
git -C /home/deploy/apps/trader-news fetch origin main
git -C /home/deploy/apps/trader-news reset --hard origin/main
sudo systemctl restart trader-news.service
sleep 6
systemctl is-active trader-news.service
git -C /home/deploy/apps/trader-news rev-parse --short HEAD'
~~~

The final output should include:

~~~text
active
<the commit that was just pushed>
~~~

The hard reset is intentional here, but only use it after the clean-tree check. Do not use git clean, do not reset the arc/ directory, and do not run this against a broad or uncertain path.

### 5. Verify the public deployment

Check the service locally on the server:

~~~sh
ssh r5c 'systemctl is-active trader-news.service
curl -fsS http://127.0.0.1:8080/market-feed-health'
~~~

Check the public app:

~~~sh
curl -fsS -I https://tradernews.fyi/
curl -fsS https://tradernews.fyi/market-feed-health
curl -fsS 'https://tradernews.fyi/market-feed?symbol=%5EGSPC&range=1y'
~~~

The health response should be interpreted carefully:

- ok true means the background poller is ticking and a provider request has succeeded recently;
- it does not mean every instrument is fresh;
- check queueDepth, failureCount, lastSuccessAt, lastSymbol, and providerStatus;
- market data can remain delayed or stale even when the service is healthy.

Check the latest service logs if needed:

~~~sh
ssh r5c 'journalctl -u trader-news.service -n 100 --no-pager'
~~~

## Market-data deployment notes

The finance subsystem is in market-feed.arc and starts from news.arc.

It runs an in-process background job:

~~~arc
(defbg market-feed 15
  (market-feed-poll!))
~~~

The upstream request gate currently allows one provider request every 30 seconds. The server persists its latest market windows at:

~~~text
/home/deploy/apps/trader-news/arc/news/market/market-cache.json
/home/deploy/apps/trader-news/arc/news/market/market-feed-state.json
~~~

A normal code deployment must not delete or replace these files. On restart, the process loads the existing cache and continues polling.

Useful production checks:

~~~sh
ssh r5c 'python3 - <<'"'"'PY'
import json, os
for path in [
  "/home/deploy/apps/trader-news/arc/news/market/market-cache.json",
  "/home/deploy/apps/trader-news/arc/news/market/market-feed-state.json",
]:
    print(path, os.path.getsize(path) if os.path.exists(path) else "missing")
PY'
~~~

Public endpoints:

~~~text
https://tradernews.fyi/market-feed-health
https://tradernews.fyi/market-feed?all=1
https://tradernews.fyi/market-feed?symbol=%5EGSPC&range=1mo
~~~

## Rollback

First identify the last known-good commit locally or from GitHub:

~~~sh
git log --oneline --decorate -10
~~~

If the bad commit has already been pushed and the previous commit is known, deploy the previous commit by checking it out in the production checkout and restarting:

~~~sh
ssh r5c 'set -e
git -C /home/deploy/apps/trader-news fetch origin main
git -C /home/deploy/apps/trader-news reset --hard <KNOWN_GOOD_COMMIT>
sudo systemctl restart trader-news.service
sleep 6
systemctl is-active trader-news.service
git -C /home/deploy/apps/trader-news rev-parse --short HEAD'
~~~

This rolls back tracked code only. It should not remove market cache or Arc application data.

After the incident is understood, restore the normal main deployment:

~~~sh
ssh r5c 'set -e
git -C /home/deploy/apps/trader-news fetch origin main
git -C /home/deploy/apps/trader-news reset --hard origin/main
sudo systemctl restart trader-news.service
systemctl is-active trader-news.service'
~~~

If the service fails after a deployment:

~~~sh
ssh r5c 'systemctl status trader-news.service --no-pager
journalctl -u trader-news.service -n 200 --no-pager'
~~~

## Common mistakes to avoid

- Do not use /opt/sharc for this project.
- Do not use sharc.service for this project.
- Do not use the old news.ycombinator.lol hostname.
- Do not rsync a full local checkout over production.
- Do not copy local arc/ data over the server's arc/ data.
- Do not run git reset --hard before checking production status.
- Do not use git clean on the production application directory.
- Do not assume a healthy systemd unit means fresh market data.
- Do not assume a successful provider response means real-time data.
- Do not expose SSH keys, passwords, API keys, or private environment values in commits or deployment logs.

## TLS and domain check

The public domain should be tested after deployments:

~~~sh
curl -fsS -I https://tradernews.fyi/
curl -fsS -I http://tradernews.fyi/
~~~

If HTTPS fails, inspect Nginx and certificate state on the server before changing application code:

~~~sh
ssh r5c 'sudo nginx -t
sudo systemctl status nginx --no-pager
sudo certbot certificates'
~~~

The application itself listens on HTTP port 8080. TLS termination is handled by the reverse proxy layer.

## Short version

For a normal code change:

~~~sh
cd /Users/mac/code/sharc
./sharc test.arc
node --check static/hn.js
git diff --check
git add <intended files>
git commit -m "describe the change"
git push trader-news main
ssh r5c 'test -z "$(git -C /home/deploy/apps/trader-news status --porcelain)"'
ssh r5c 'git -C /home/deploy/apps/trader-news fetch origin main && git -C /home/deploy/apps/trader-news reset --hard origin/main && sudo systemctl restart trader-news.service && sleep 6 && systemctl is-active trader-news.service && git -C /home/deploy/apps/trader-news rev-parse --short HEAD'
curl -fsS https://tradernews.fyi/market-feed-health
~~~

The clean-tree check is a required safety gate. If it fails, stop and investigate before deploying.

