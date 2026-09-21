#!/usr/bin/env python3
"""Small, dependency-free Yahoo market cache and loopback JSON service.

The browser never calls Yahoo.  This process deliberately makes only one
provider request at a time and keeps serving the last successful SQLite data.
"""
import argparse, calendar, datetime, fcntl, json, os, sqlite3, subprocess, threading, time, logging, math, tempfile, hashlib, sys
from contextlib import contextmanager
from functools import lru_cache
from email.utils import parsedate_to_datetime
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT / 'scripts'))
from market_fundamentals import source_url, parse_statistics
DATA = Path(os.environ.get("MARKET_DATA_DIR", ROOT / "arc/news/market"))
DB_PATH = DATA / "market.sqlite3"
UNIVERSE = ROOT / "static/market-data.js"
ALIASES = {"BNR.F": "BNR.DE", "BEI.F": "BEI.DE"} # only aliases proved useful by prior validation
RANGES = {"1d": ("2m", "1d"), "5d": ("30m", "5d"), "1mo": ("1d", "1mo"),
          "3mo": ("1d", "3mo"), "6mo": ("1d", "6mo"), "ytd": ("1d", "ytd"),
          "1y": ("1d", "1y"), "5y": ("1d", "5y")}
KEEP = {"2m": 11*86400, "30m": 23*86400, "1d": (5*366+10)*86400}
log = logging.getLogger("market-service")

def now(): return int(time.time())

def range_timezone(quote_row):
    """Use the exchange's reported zone when defining calendar ranges."""
    try: return ZoneInfo(quote_row['exchange_tz']) if quote_row and quote_row['exchange_tz'] else datetime.timezone.utc
    except Exception: return datetime.timezone.utc

def range_asof(quote_row):
    stamp=(quote_row['market_time'] if quote_row and quote_row['market_time'] else None) or (quote_row['fetched_at'] if quote_row and quote_row['fetched_at'] else None) or now()
    return datetime.datetime.fromtimestamp(stamp, range_timezone(quote_row))

def range_months_before(day, months):
    month=day.month-months; year=day.year
    while month < 1: month += 12; year -= 1
    return day.replace(year=year, month=month, day=min(day.day,calendar.monthrange(year,month)[1]))

def range_window(range_, quote_row):
    """Return epoch cut-off and expected calendar start for an as-of market day."""
    asof=range_asof(quote_row); start=asof.replace(hour=0, minute=0, second=0, microsecond=0)
    if range_ == '1d': expected=start
    elif range_ == '5d': expected=start-datetime.timedelta(days=6)
    elif range_ == '1mo': expected=range_months_before(start,1)
    elif range_ == '3mo': expected=range_months_before(start,3)
    elif range_ == '6mo': expected=range_months_before(start,6)
    elif range_ == 'ytd': expected=start.replace(month=1, day=1)
    elif range_ == '1y': expected=range_months_before(start,12)
    elif range_ == '5y': expected=range_months_before(start,60)
    else: expected=start
    return int(expected.timestamp()), int(expected.timestamp())

def range_interval(range_, quote_row, connection, symbol):
    """Use the configured chart cadence, falling back to daily bars for 5D."""
    interval=RANGES.get(range_,RANGES['1d'])[0]
    if range_ != '5d': return interval
    cutoff, _=range_window(range_,quote_row)
    found=connection.execute("SELECT 1 FROM bars WHERE symbol=? AND interval='30m' AND ts>=? LIMIT 1",(symbol,cutoff)).fetchone()
    return '30m' if found else '1d'

def range_coverage(points, expected_start):
    actual=int(points[0]['ts']) if points else None
    # Calendar ranges can begin after a weekend or exchange holiday. Report
    # coverage explicitly instead of pretending sparse history is complete.
    tolerance=3*86400
    return {'expectedStart':expected_start, 'actualStart':actual,
            'complete':bool(actual is not None and actual <= expected_start+tolerance)}

def quote_baseline(connection, symbol, range_, quote_row, cutoff):
    # Returns use the last daily close before the selected window, shared by
    # both table and chart regardless of the chart's sampling interval.
    base=connection.execute("SELECT ts,close FROM bars WHERE symbol=? AND interval='1d' AND ts<? ORDER BY ts DESC LIMIT 1",(symbol,cutoff)).fetchone()
    if range_=='1d' and quote_row and quote_row['previous_close'] is not None:
        return {'ts':base['ts'] if base else cutoff-1,'close':quote_row['previous_close']}
    return base or connection.execute("SELECT ts,close FROM bars WHERE symbol=? AND interval='1d' AND ts>=? ORDER BY ts LIMIT 1",(symbol,cutoff)).fetchone()

def quote_return(price, base):
    return ((price-base)/base*100) if price is not None and base not in (None,0) else None

def quote_response(symbol, range_, quote_row, base_row, expected_start):
    price=quote_row['price'] if quote_row and quote_row['price'] is not None else None
    base=base_row['close'] if base_row else None
    actual=int(base_row['ts']) if base_row else None
    previous=quote_row['previous_close'] if quote_row else None
    coverage={'expectedStart':expected_start, 'actualStart':actual,
              'complete':bool(actual is not None and expected_start-7*86400 <= actual <= expected_start+3*86400)}
    status=('stale' if quote_row['error'] else 'cached') if price is not None else ('warming' if quote_row is None else 'unavailable')
    if base is not None and not coverage['complete']: status='partial'
    return {'symbol':symbol, 'range':range_, 'price':price, 'basePrice':base,
            'dayChangePct':quote_return(price,previous), 'periodChangePct':quote_return(price,previous) if range_=='1d' else quote_return(price,base) if coverage['complete'] else None,
            'status':status, 'coverage':coverage,
            'asOf':quote_row['market_time'] if quote_row else None,
            'fetchedAt':quote_row['fetched_at'] if quote_row else None,
            'currency':quote_row['currency'] if quote_row else None,
            'marketState':quote_row['market_state'] if quote_row else None,
            'source':quote_row['source'] if quote_row else None,
            'error':quote_row['error'] if quote_row else None}

def range_response(symbol, range_, quote_row, points, expected_start, base_row=None):
    payload=quote_response(symbol,range_,quote_row,base_row,expected_start)
    payload['points']=[{'ts':row['ts']*1000,'close':row['close']} for row in points]
    if points and base_row and base_row['ts']<points[0]['ts']:
        payload['points'].insert(0,{'ts':base_row['ts']*1000,'close':base_row['close']})
    if payload['points'] and payload['price'] is not None and payload['asOf']:
        latest={'ts':payload['asOf']*1000,'close':payload['price']}
        if latest['ts']>payload['points'][-1]['ts']: payload['points'].append(latest)
        elif latest['ts']==payload['points'][-1]['ts']: payload['points'][-1]=latest
    # A returned series is useful even if it begins late, but its status makes
    # that distinction visible to callers that require a complete range.
    if payload['points'] and not payload['coverage']['complete']: payload['status']='partial'
    return payload
def normalize(s):
    s = (s or "").strip().upper()
    if s in ALIASES: return ALIASES[s]
    if s.isdigit() and len(s) == 4: return s + ".T"
    # raw Nifty constituents without a Yahoo suffix are NSE symbols
    if s and s[0].isalpha() and "." not in s and s not in {"A", "C", "T"}: return s
    return s.replace(".", "-") if s in {"BRK.B", "BF.B"} else s

def load_universe(path=UNIVERSE):
    text = Path(path).read_text(encoding="utf-8")
    marker = "window.FINANCE_MARKETS ="
    start = text.index(marker) + len(marker)
    obj, _ = json.JSONDecoder().raw_decode(text[start:].lstrip())
    rows, indexes = {}, []
    for market in obj:
        indexes.append(market["symbol"])
        rows[market["symbol"]] = (normalize(market["symbol"]), "index")
        for c in market.get("constituents", []):
            raw = c[0]
            if raw:
                provider = normalize(raw)
                if market.get("key") == "nifty50" and "." not in provider: provider += ".NS"
                rows[raw] = (provider, "company")
    return rows, indexes

class Store:
    def __init__(self, path=DB_PATH):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.path = str(path); self.lock = threading.RLock(); self.fundamentals_revision=0
        with self.connect() as c:
            c.executescript("""PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
            CREATE TABLE IF NOT EXISTS instruments(symbol TEXT PRIMARY KEY, provider_symbol TEXT NOT NULL, kind TEXT, exchange_tz TEXT, enabled INTEGER DEFAULT 1, cooldown_until INTEGER DEFAULT 0, requested_at INTEGER DEFAULT 0, requested_range TEXT);
            CREATE TABLE IF NOT EXISTS latest_quotes(symbol TEXT PRIMARY KEY, price REAL, previous_close REAL, market_time INTEGER, fetched_at INTEGER, attempted_at INTEGER, currency TEXT, market_state TEXT, exchange TEXT, exchange_tz TEXT, regular_open INTEGER, regular_close INTEGER, source TEXT, error TEXT);
            CREATE TABLE IF NOT EXISTS bars(symbol TEXT NOT NULL, interval TEXT NOT NULL, ts INTEGER NOT NULL, open REAL, high REAL, low REAL, close REAL, adj_close REAL, volume REAL, fetched_at INTEGER, source TEXT, PRIMARY KEY(symbol,interval,ts));
            CREATE INDEX IF NOT EXISTS bars_range ON bars(symbol,interval,ts);
            CREATE TABLE IF NOT EXISTS history_state(symbol TEXT PRIMARY KEY,full_at INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS market_jobs(symbol TEXT,interval TEXT,period TEXT,requested_at INTEGER,PRIMARY KEY(symbol,interval));
            CREATE TABLE IF NOT EXISTS fundamentals(symbol TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,attempted_at INTEGER,next_due INTEGER DEFAULT 0,error TEXT,requested_at INTEGER DEFAULT 0);
            CREATE TABLE IF NOT EXISTS fundamental_provider_state(key TEXT PRIMARY KEY,value INTEGER);
            CREATE TABLE IF NOT EXISTS corporate_actions(symbol TEXT,kind TEXT,ts INTEGER,payload TEXT,PRIMARY KEY(symbol,kind,ts));""")
            try: c.execute("ALTER TABLE instruments ADD COLUMN requested_range TEXT")
            except sqlite3.OperationalError: pass
    @contextmanager
    def connect(self):
        c=sqlite3.connect(self.path, timeout=10); c.row_factory=sqlite3.Row
        try:
            with c: yield c
        finally: c.close()
    def add_instruments(self, rows):
        with self.lock, self.connect() as c:
            c.executemany("INSERT INTO instruments(symbol,provider_symbol,kind) VALUES(?,?,?) ON CONFLICT(symbol) DO UPDATE SET provider_symbol=excluded.provider_symbol,kind=excluded.kind", [(a,b,k) for a,(b,k) in rows.items()])
    def enqueue(self, symbol, range_='1d'):
        interval, period=RANGES.get(range_, RANGES['1d'])
        with self.lock, self.connect() as c:
            c.execute("INSERT INTO fundamentals(symbol,requested_at) SELECT symbol,? FROM instruments WHERE symbol=? AND kind='company' ON CONFLICT(symbol) DO UPDATE SET requested_at=excluded.requested_at",(now(),symbol))
            full=c.execute("SELECT full_at FROM history_state WHERE symbol=?",(symbol,)).fetchone()
            last=c.execute("SELECT max(fetched_at) FROM bars WHERE symbol=? AND interval=? AND source='yahoo'",(symbol,interval)).fetchone()[0]
            ttl={'2m':120,'30m':600,'1d':900}[interval]
            if last and now()-last<ttl and full: return
            c.execute("INSERT OR IGNORE INTO market_jobs VALUES(?,?,?,?)",(symbol,interval,period,now()))

    def upsert_chart(self, symbol, interval, payload, fetched=None, full_history=False):
        fetched=fetched or now()
        result=(payload.get('chart') or {}).get('result') or []
        if not result:
            error=(payload.get('chart') or {}).get('error') or {}
            raise ProviderError(error.get('description','No chart result'),404 if error.get('code')=='Not Found' else 502)
        r=result[0]; meta=r.get('meta') or {}; indicators=r.get('indicators') or {}
        q=(indicators.get('quote') or [{}])[0] or {}; adj=(indicators.get('adjclose') or [{}])[0] or {}
        timestamps=r.get('timestamp') or []; bars=[]
        width={'2m':120,'30m':1800}.get(interval)
        alignment=int(timestamps[0])%width if timestamps and width else None
        for i,ts in enumerate(timestamps):
            # Yahoo appends a moving off-grid quote stub. Keep it as a quote,
            # not an additional candle on every refresh.
            if width and int(ts)%width!=alignment: continue
            def item(name):
                values=q.get(name) or []
                value=values[i] if i<len(values) else None
                return value if isinstance(value,(int,float)) and math.isfinite(value) else None
            close=item('close')
            if close is None: continue
            av=adj.get('adjclose') or []; adjusted=av[i] if i<len(av) else None
            bars.append((symbol,interval,int(ts),item('open'),item('high'),item('low'),close,adjusted,item('volume'),fetched,'yahoo'))
        price=meta.get('regularMarketPrice'); asof=meta.get('regularMarketTime')
        if not isinstance(price,(int,float)) or not math.isfinite(price):
            if not bars: raise ValueError('Response has no usable quote or bars')
            price=bars[-1][6]; asof=bars[-1][2]
        if not asof: raise ValueError('Response has no price timestamp')
        tzname=meta.get('exchangeTimezoneName') or 'UTC'
        try: tz=ZoneInfo(tzname)
        except Exception: tz=datetime.timezone.utc
        quote_day=datetime.datetime.fromtimestamp(asof,tz).date()
        regular=(meta.get('currentTradingPeriod') or {}).get('regular') or {}
        opening=regular.get('start'); closing=regular.get('end')
        state='REGULAR' if opening and closing and opening<=fetched<closing else 'CLOSED' if closing else meta.get('marketState')
        splits=(r.get('events') or {}).get('splits') or {}
        with self.lock, self.connect() as c:
            # A new split invalidates older raw-price history. Keep last-good
            # data until the queued full replacement arrives atomically.
            unseen_split=False
            for kind,events in (r.get('events') or {}).items():
                for event in events.values():
                    stamp=event.get('date',0)
                    inserted=c.execute('INSERT OR IGNORE INTO corporate_actions VALUES(?,?,?,?)',(symbol,kind,stamp,json.dumps(event))).rowcount
                    unseen_split=unseen_split or bool(inserted and kind=='splits')
            if unseen_split and not full_history:
                c.execute('DELETE FROM history_state WHERE symbol=?',(symbol,))
                c.execute("INSERT OR REPLACE INTO market_jobs VALUES(?,'1d','5y',?)",(symbol,now()))
                return
            if full_history:
                c.execute("DELETE FROM bars WHERE symbol=? AND interval='1d'",(symbol,))
            c.executemany("INSERT INTO bars(symbol,interval,ts,open,high,low,close,adj_close,volume,fetched_at,source) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol,interval,ts) DO UPDATE SET open=excluded.open,high=excluded.high,low=excluded.low,close=excluded.close,adj_close=excluded.adj_close,volume=excluded.volume,fetched_at=excluded.fetched_at,source=excluded.source",bars)
            previous=meta.get('previousClose')
            if interval=='1d' or previous is None:
                candidates=c.execute("SELECT ts,close FROM bars WHERE symbol=? AND interval='1d' ORDER BY ts DESC LIMIT 10",(symbol,)).fetchall()
                previous=next((x['close'] for x in candidates if datetime.datetime.fromtimestamp(x['ts'],tz).date()<quote_day),previous)
            if previous is None:
                old=c.execute('SELECT previous_close,market_time FROM latest_quotes WHERE symbol=?',(symbol,)).fetchone()
                if old and old['market_time'] and datetime.datetime.fromtimestamp(old['market_time'],tz).date()==quote_day: previous=old['previous_close']
            c.execute("INSERT INTO latest_quotes(symbol,price,previous_close,market_time,fetched_at,attempted_at,currency,market_state,exchange,exchange_tz,regular_open,regular_close,source,error) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,NULL) ON CONFLICT(symbol) DO UPDATE SET price=excluded.price,previous_close=excluded.previous_close,market_time=excluded.market_time,fetched_at=excluded.fetched_at,attempted_at=excluded.attempted_at,currency=excluded.currency,market_state=excluded.market_state,exchange=excluded.exchange,exchange_tz=excluded.exchange_tz,regular_open=excluded.regular_open,regular_close=excluded.regular_close,source=excluded.source,error=NULL",(symbol,price,previous,asof,fetched,fetched,meta.get('currency'),state,meta.get('exchangeName'),tzname,opening,closing,'yahoo'))
            if full_history:
                c.execute('INSERT OR REPLACE INTO history_state VALUES(?,?)',(symbol,fetched))
            c.execute('UPDATE instruments SET cooldown_until=0 WHERE symbol=?',(symbol,))

    def prune(self):
        with self.lock, self.connect() as c:
            for interval,seconds in KEEP.items():
                c.execute('DELETE FROM bars WHERE interval=? AND ts<?',(interval,now()-seconds))

    def fail(self,symbol,error):
        with self.lock, self.connect() as c:
            c.execute("INSERT INTO latest_quotes(symbol,attempted_at,error,source) VALUES(?,?,?,'yahoo') ON CONFLICT(symbol) DO UPDATE SET attempted_at=excluded.attempted_at,error=excluded.error",(symbol,now(),str(error)[:400]))
            if isinstance(error,ProviderError) and error.status in (404,422):
                c.execute('UPDATE instruments SET cooldown_until=? WHERE symbol=?',(now()+86400,symbol))

    def feed(self,symbol,range_):
        with self.connect() as c:
            quote_row=c.execute("SELECT * FROM latest_quotes WHERE symbol=?",(symbol,)).fetchone()
            interval=range_interval(range_, quote_row, c, symbol)
            cutoff, expected_start=range_window(range_, quote_row)
            points=c.execute("SELECT ts,close FROM bars WHERE symbol=? AND interval=? AND ts>=? ORDER BY ts",(symbol,interval,cutoff)).fetchall()
            base=quote_baseline(c,symbol,range_,quote_row,cutoff)
        return self.with_fundamentals(range_response(symbol, range_, quote_row, points, expected_start,base))
    def quote(self,symbol,range_):
        # A quote needs only its first in-range close, never the complete chart.
        with self.connect() as c:
            quote_row=c.execute("SELECT * FROM latest_quotes WHERE symbol=?",(symbol,)).fetchone()
            interval=range_interval(range_, quote_row, c, symbol)
            cutoff, expected_start=range_window(range_, quote_row)
            base=quote_baseline(c,symbol,range_,quote_row,cutoff)
        return self.with_fundamentals(quote_response(symbol, range_, quote_row, base, expected_start))
    def with_fundamentals(self, payload):
        with self.connect() as c:
            row=c.execute('SELECT * FROM fundamentals WHERE symbol=?',(payload['symbol'],)).fetchone()
        values=json.loads(row['payload']) if row and row['payload'] else {}
        payload.update(values)
        payload['fundamentalsFetchedAt']=row['fetched_at'] if row else None
        payload['fundamentalsError']=row['error'] if row else None
        return payload

    def next_fundamental(self):
        with self.connect() as c:
            paused=c.execute("SELECT value FROM fundamental_provider_state WHERE key='backoff_until'").fetchone()
            if paused and paused[0]>now(): return None
            return c.execute("SELECT i.symbol,i.provider_symbol FROM instruments i LEFT JOIN fundamentals f USING(symbol) WHERE i.kind='company' AND coalesce(f.next_due,0)<=? ORDER BY coalesce(f.requested_at,0) DESC, CASE WHEN i.symbol IN ('AAPL','MSFT','NVDA','AMD','META','AMZN','GOOGL','TSLA','HOOD','COIN') THEN 0 ELSE 1 END,coalesce(f.fetched_at,0),i.rowid LIMIT 1",(now(),)).fetchone()

    def save_fundamental(self,symbol,values):
        with self.lock,self.connect() as c:
            c.execute("INSERT INTO fundamentals(symbol,payload,fetched_at,attempted_at,next_due,error) VALUES(?,?,?,?,?,NULL) ON CONFLICT(symbol) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,attempted_at=excluded.attempted_at,next_due=excluded.next_due,error=NULL",(symbol,json.dumps(values),now(),now(),now()+86400))
        self.fundamentals_revision+=1

    def fail_fundamental(self,symbol,error):
        status=getattr(error,'status',0)
        listing_error=status in (301,302,404,422) or isinstance(error,ValueError)
        delay=7*86400 if listing_error else 86400 if status==403 else max(900,getattr(error,'retry_after',0))
        with self.lock,self.connect() as c:
            c.execute("INSERT INTO fundamentals(symbol,attempted_at,next_due,error) VALUES(?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET attempted_at=excluded.attempted_at,next_due=excluded.next_due,error=excluded.error",(symbol,now(),now()+delay,str(error)[:400]))
            if not listing_error:
                c.execute("INSERT OR REPLACE INTO fundamental_provider_state VALUES('backoff_until',?)",(now()+delay,))
        self.fundamentals_revision+=1

    def health(self, worker=None):
        with self.connect() as c:
            instruments=c.execute('SELECT count(*) FROM instruments').fetchone()[0]
            fundamental_count=c.execute('SELECT count(*) FROM fundamentals WHERE fetched_at IS NOT NULL').fetchone()[0]
            fundamental_errors=c.execute('SELECT count(*) FROM fundamentals WHERE error IS NOT NULL').fetchone()[0]
            fundamental_pause=c.execute("SELECT value FROM fundamental_provider_state WHERE key='backoff_until'").fetchone()
            quotes=c.execute('SELECT count(*) FROM latest_quotes WHERE price IS NOT NULL').fetchone()[0]
            histories=c.execute('SELECT count(*) FROM history_state').fetchone()[0]
            pending=c.execute('SELECT count(*) FROM market_jobs').fetchone()[0]
            intervals={r[0]:r[1] for r in c.execute('SELECT interval,count(*) FROM bars GROUP BY interval')}
            last=c.execute('SELECT max(fetched_at),max(attempted_at) FROM latest_quotes').fetchone()
            errors=c.execute('SELECT count(*) FROM latest_quotes WHERE error IS NOT NULL').fetchone()[0]
            fresh=c.execute('SELECT count(*) FROM latest_quotes WHERE fetched_at>? AND price IS NOT NULL',(now()-3600,)).fetchone()[0]
        alive=bool(worker and worker.is_alive())
        return {'ok':bool(alive and last[0] and now()-last[0]<7200), 'workerAlive':alive,
                'instruments':instruments,'quotes':quotes,'dailyHistories':histories,'warming':instruments-quotes,
                'fundamentals':{'populated':fundamental_count,'errors':fundamental_errors,'backoffUntil':fundamental_pause[0] if fundamental_pause else 0,'refreshSecs':86400},
                'pending':pending,'bars':sum(intervals.values()),'barsByInterval':intervals,
                'dbBytes':sum(os.path.getsize(self.path+s) for s in ('','-wal') if os.path.exists(self.path+s)),
                'lastSuccessAt':last[0],'lastAttemptAt':last[1],'fetchedWithinHour':fresh,'symbolsWithErrors':errors,
                'requestSpacingSecs':2,'backoffUntil':getattr(worker,'backoff_until',0),
                'lastSymbol':getattr(worker,'last_symbol',None),'requestCount':getattr(worker,'requests',0),
                'failureCount':getattr(worker,'failures',0),'lastError':getattr(worker,'last_error',None),
                'note':'Collector health is not a guarantee of freshness for each instrument.'}

class ProviderError(Exception):
    def __init__(self,message,status=502,retry_after=0):
        super().__init__(message); self.status=status; self.retry_after=retry_after

def parse_chart_json(body): return json.loads(body)

class Collector(threading.Thread):
    def __init__(self, store, rows, indexes):
        super().__init__(daemon=True)
        self.store=store; self.rows=rows; self.indexes=deque(indexes)
        store.add_instruments(rows)
        with store.connect() as c:
            companies=c.execute("SELECT i.symbol FROM instruments i LEFT JOIN latest_quotes q USING(symbol) LEFT JOIN history_state h USING(symbol) WHERE i.kind='company' ORDER BY h.full_at IS NOT NULL,q.fetched_at,i.rowid").fetchall()
            self.bootstrap=deque(s for s in indexes if not c.execute('SELECT 1 FROM history_state WHERE symbol=?',(s,)).fetchone())
        self.companies=deque(r[0] for r in companies)
        self.stop_event=threading.Event(); self.last_start=0.; self.backoff_until=0
        self.tick=0; self.requests=0; self.failures=0; self.consecutive_failures=0
        self.last_symbol=None; self.last_error=None; self.last_prune=0; self.fundamental_turn=0

    def fetch(self, provider, interval, period):
        url='https://query1.finance.yahoo.com/v8/finance/chart/'+quote(provider,safe='^.-')+'?interval='+interval+'&range='+period+'&includePrePost=false&events=div%2Csplits'
        log.info('scheduled symbol=%s interval=%s range=%s',provider,interval,period)
        return parse_chart_json(self.request(url))

    def request(self,url):
        delay=max(0,2-(time.monotonic()-self.last_start),self.backoff_until-time.time())
        if delay: self.stop_event.wait(delay)
        if self.stop_event.is_set(): raise InterruptedError('Collector stopping')
        self.last_start=time.monotonic(); self.requests+=1
        log.info('upstream request host=%s',urlparse(url).hostname)
        with tempfile.NamedTemporaryFile() as headers:
            p=subprocess.run(['curl','-4','--silent','--show-error','--max-time','20','-A','TraderNews/1.0 (+https://tradernews.fyi)','-D',headers.name,'-w','\n%{http_code}',url],capture_output=True,text=True)
            header_text=Path(headers.name).read_text()
        if p.returncode: raise ProviderError('curl '+str(p.returncode)+': '+p.stderr[-200:])
        body,_,status=p.stdout.rpartition('\n'); status=int(status)
        retry=0
        for line in header_text.splitlines():
            if line.lower().startswith('retry-after:'):
                value=line.split(':',1)[1].strip()
                try: retry=max(0,int(value))
                except ValueError:
                    try: retry=max(0,parsedate_to_datetime(value).timestamp()-time.time())
                    except Exception: pass
        if status!=200: raise ProviderError('Provider HTTP '+str(status),status,retry)
        return body

    def next_task(self):
        self.tick+=1
        with self.store.connect() as c:
            wanted=c.execute('SELECT j.* FROM market_jobs j JOIN instruments i USING(symbol) WHERE i.cooldown_until<=? ORDER BY j.requested_at LIMIT 1',(now(),)).fetchone()
            if self.bootstrap:
                symbol=self.bootstrap.popleft(); interval,period='1d','5y'; demand=False
            elif wanted and self.tick%4==0:
                symbol=wanted['symbol']; interval=wanted['interval']; period=wanted['period']; demand=True
            else:
                queue=self.indexes if self.tick%10==0 or not self.companies else self.companies
                if not queue: return None
                symbol=queue.popleft(); queue.append(symbol); interval,period='1d','5d'; demand=False
            instrument=c.execute('SELECT * FROM instruments WHERE symbol=?',(symbol,)).fetchone()
            if instrument['cooldown_until']>now(): return None
            history=c.execute('SELECT full_at FROM history_state WHERE symbol=?',(symbol,)).fetchone()
            if not history or now()-history['full_at']>30*86400:
                interval,period='1d','5y'
            if demand and interval==wanted['interval']:
                c.execute('DELETE FROM market_jobs WHERE symbol=? AND interval=?',(symbol,interval))
            return symbol,instrument['provider_symbol'],interval,period

    def handle_failure(self,symbol,error):
        self.store.fail(symbol,error); self.failures+=1; self.last_error=str(error)
        if isinstance(error,ProviderError) and error.status in (404,422): return
        self.consecutive_failures+=1
        delay=min(300,10*2**min(self.consecutive_failures-1,5))
        if isinstance(error,ProviderError) and error.status==429: delay=max(60,error.retry_after,delay)
        self.backoff_until=now()+delay

    def run(self):
        while not self.stop_event.is_set():
            symbol=None
            try:
                if now()-self.last_prune>3600:
                    self.store.prune(); self.last_prune=now()
                self.fundamental_turn+=1
                fundamental=self.store.next_fundamental() if self.fundamental_turn%3==0 else None
                if fundamental:
                    symbol=fundamental['symbol']; url=source_url(fundamental['provider_symbol'])
                    try:
                        if not url: raise ProviderError('Unsupported fundamentals listing',404)
                        log.info('fundamentals scheduled symbol=%s',symbol)
                        values=parse_statistics(self.request(url))
                        values.update(fundamentalsSource='Stock Analysis',fundamentalsSourceUrl=url)
                        self.store.save_fundamental(symbol,values)
                        log.info('fundamentals success symbol=%s',symbol)
                    except Exception as error:
                        self.store.fail_fundamental(symbol,error)
                        log.warning('fundamentals failure symbol=%s error=%s',symbol,error)
                    continue
                task=self.next_task()
                if not task:
                    self.stop_event.wait(.1); continue
                symbol,provider,interval,period=task; self.last_symbol=symbol
                self.store.upsert_chart(symbol,interval,self.fetch(provider,interval,period),full_history=period=='5y')
                self.consecutive_failures=0; self.last_error=None
                log.info('success symbol=%s interval=%s',symbol,interval)
            except Exception as e:
                if symbol: self.handle_failure(symbol,e)
                log.warning('failure symbol=%s error=%s',symbol,e)
                self.stop_event.wait(1)

def import_legacy(store, legacy):
    if not Path(legacy).exists(): return 0
    try: data=json.loads(Path(legacy).read_text())
    except Exception: return 0
    count=0
    entries=data.get('entries',[]) if isinstance(data,dict) and isinstance(data.get('entries'),list) else []
    if not entries and isinstance(data,dict): entries=[dict(v,symbol=s) for s,v in data.items() if isinstance(v,dict)]
    for v in entries:
        sym=v.get('symbol'); points=v.get('points',[]) if isinstance(v,dict) else []
        closes=[x.get('close') for x in points if isinstance(x,dict)]; ts=[x.get('ts') for x in points if isinstance(x,dict)]
        if not sym: continue
        if not ts: continue
        if v.get('interval') != '1d': continue
        rows=[(sym,'1d',int(t/1000 if t>10**11 else t),None,None,None,close,close,None,0,'legacy-migration') for t,close in zip(ts,closes) if close is not None]
        with store.lock, store.connect() as c: c.executemany('INSERT OR IGNORE INTO bars(symbol,interval,ts,open,high,low,close,adj_close,volume,fetched_at,source) VALUES(?,?,?,?,?,?,?,?,?,?,?)',rows); count+=len(rows)
    return count

def market_memberships(path=UNIVERSE):
    source=Path(path).read_text().split('window.FINANCE_MARKETS =',1)[1].lstrip()
    markets,_=json.JSONDecoder().raw_decode(source)
    return {m['key']:tuple(sorted(set(c[0] for c in m['constituents']))) for m in markets}

def make_handler(store, rows, indexes, worker, memberships=None):
    memberships=market_memberships() if memberships is None else memberships
    @lru_cache(maxsize=32)
    def cached_quotes(symbols, range_, bucket, fundamentals_revision):
        return {'entries':[store.quote(symbol,range_) for symbol in symbols]}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*a): pass
        def respond(self,obj,code=200):
            raw=json.dumps(obj,separators=(',',':')).encode()
            cacheable=code==200 and urlparse(self.path).path in ('/market-feed','/market-quotes')
            etag='"'+hashlib.sha256(raw).hexdigest()+'"'
            matches=[tag.strip().removeprefix('W/') for tag in self.headers.get('If-None-Match','').split(',')]
            unchanged=cacheable and (etag in matches or '*' in matches)
            self.send_response(304 if unchanged else code)
            self.send_header('Content-Type','application/json')
            self.send_header('Cache-Control','public, max-age=0, s-maxage=120' if cacheable else 'no-store')
            if cacheable: self.send_header('ETag',etag)
            if not unchanged: self.send_header('Content-Length',str(len(raw)))
            self.end_headers()
            if not unchanged and self.command!='HEAD': self.wfile.write(raw)
        def do_HEAD(self):
            self.do_GET()
        def do_GET(self):
            u=urlparse(self.path); q=parse_qs(u.query)
            if u.path=='/market-feed-health': return self.respond(store.health(worker))
            if u.path=='/market-feed':
                if q.get('all',[''])[0]: return self.respond(cached_quotes(tuple(indexes),'1d',now()//5,store.fundamentals_revision))
                s=q.get('symbol',['^GSPC'])[0];
                if s not in rows: return self.respond({'status':'unknown','error':'unknown symbol'},404)
                store.enqueue(s,q.get('range',['1d'])[0]); return self.respond(store.feed(s,q.get('range',['1d'])[0]))
            if u.path=='/market-quotes':
                rr=q.get('range',['3mo'])[0]
                market=q.get('market',[''])[0]
                if market and market not in memberships: return self.respond({'error':'unknown market'},404)
                symbols=memberships[market] if market else tuple(sorted(set(q.get('symbols',[''])[0].split(',')) & rows.keys()))
                return self.respond(cached_quotes(symbols,rr,now()//5,store.fundamentals_revision))
            self.respond({'error':'not found'},404)
    return Handler

def main():
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    ap=argparse.ArgumentParser(); ap.add_argument('--port',type=int,default=8766); ap.add_argument('--no-collector',action='store_true'); a=ap.parse_args()
    DATA.mkdir(parents=True,exist_ok=True); lock=open(DATA/'market.lock','w')
    try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError: raise SystemExit('another market collector holds '+lock.name)
    rows,indexes=load_universe(); store=Store(); store.add_instruments(rows); import_legacy(store,DATA/'market-cache.json'); worker=None
    if not a.no_collector: worker=Collector(store,rows,indexes); worker.start()
    ThreadingHTTPServer(('127.0.0.1',a.port),make_handler(store,rows,indexes,worker)).serve_forever()
if __name__=='__main__': main()
