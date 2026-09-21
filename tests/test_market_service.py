import importlib.util, json, tempfile, time, unittest
from unittest.mock import patch
from pathlib import Path

spec=importlib.util.spec_from_file_location('market_service',Path(__file__).parents[1]/'scripts/market_service.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

def payload(timestamps=None, closes=None):
 timestamps=timestamps or [int(time.time())-400,int(time.time())-220,int(time.time())-40]
 closes=closes or [1.5,None,3.5]
 return {'chart':{'result':[{'meta':{'regularMarketPrice':12,'previousClose':10,'regularMarketTime':timestamps[-1],'currency':'GBp','marketState':'REGULAR','exchangeTimezoneName':'Europe/London'},'timestamp':timestamps,'indicators':{'quote':[{'open':[1,None,3],'high':[2,None,4],'low':[.5,None,2],'close':closes,'volume':[5,None,7]}],'adjclose':[{'adjclose':[1.4,None,3.4]}]}}], 'error':None}}
PAYLOAD=payload()

class MarketServiceTest(unittest.TestCase):
 def setUp(self): self.d=tempfile.TemporaryDirectory(); self.s=m.Store(Path(self.d.name)/'m.sqlite')
 def tearDown(self): self.d.cleanup()
 def test_nulls_and_duplicate_upsert_preserve_grid(self):
  self.s.upsert_chart('X','2m',PAYLOAD,fetched=111); self.s.upsert_chart('X','2m',PAYLOAD,fetched=112)
  with self.s.connect() as c: rows=c.execute("select ts,close,adj_close from bars order by ts").fetchall()
  self.assertEqual([(x['close'],x['adj_close']) for x in rows],[(1.5,1.4),(3.5,3.4)])
  self.assertEqual(self.s.feed('X','1d')['currency'],'GBp')
 def test_range_boundary_and_freshness(self):
  n=m.now()//120*120; p=payload([n-90000,n-120],[1,2])
  self.s.upsert_chart('X','2m',p,fetched=m.now())
  f=self.s.feed('X','1d'); self.assertEqual([x['close'] for x in f['points']],[10,12]); self.assertLessEqual(m.now()-f['fetchedAt'],1)
 def test_legacy_does_not_overwrite_existing(self):
  self.s.upsert_chart('X','1d',PAYLOAD,fetched=99)
  p=Path(self.d.name)/'legacy.json'; p.write_text(json.dumps({'entries':[{'symbol':'X','points':[{'ts':100000,'close':99}]}]}))
  m.import_legacy(self.s,p)
  with self.s.connect() as c: self.assertEqual(c.execute("select close from bars where symbol='X' and interval='1d'").fetchone()[0],1.5)
 def test_normalization_and_universe_decoder(self):
  self.assertEqual(m.normalize('BRK.B'),'BRK-B'); self.assertEqual(m.normalize('7203'),'7203.T')
  p=Path(self.d.name)/'u.js'; p.write_text('window.FINANCE_MARKETS = [{"key":"nifty50","symbol":"^NSEI","constituents":[["INFY","I",{}]]}]; trailing')
  rows,_=m.load_universe(p); self.assertEqual(rows['INFY'][0],'INFY.NS')
 def test_off_grid_quote_stub_is_not_a_new_2m_bar(self):
  n=m.now()//120*120; self.s.upsert_chart('X','2m',payload([n-240,n-120,n-1],[1,2,99]),fetched=n)
  with self.s.connect() as c: rows=c.execute("select ts,close from bars").fetchall()
  self.assertEqual([(r['ts'],r['close']) for r in rows],[(n-240,1),(n-120,2)])
  self.assertEqual(self.s.quote('X','1d')['price'],12)
 def test_429_uses_retry_after_global_backoff(self):
  rows={'X':('X','company')}; self.s.add_instruments(rows); worker=m.Collector(self.s,rows,[])
  worker.handle_failure('X',m.ProviderError('slow down',429,91))
  self.assertGreaterEqual(worker.backoff_until,m.now()+90)
  with self.s.connect() as c: self.assertEqual(c.execute("select error from latest_quotes where symbol='X'").fetchone()[0],'slow down')
 def test_fetch_parses_http_429_retry_after_header(self):
  worker=m.Collector(self.s,{'X':('X','company')},[])
  class Result: returncode=0; stdout='{}\n429'; stderr=''
  def fake_run(args, **kwargs):
   Path(args[args.index('-D')+1]).write_text('HTTP/2 429\r\nRetry-After: 73\r\n\r\n')
   return Result()
  with patch.object(m.subprocess,'run',fake_run):
   with self.assertRaises(m.ProviderError) as raised: worker.fetch('X','2m','1d')
  self.assertEqual(raised.exception.status,429); self.assertEqual(raised.exception.retry_after,73)
 def test_invalid_symbol_is_local_cooldown_not_global_backoff(self):
  rows={'BAD':('BAD','company')}; self.s.add_instruments(rows); worker=m.Collector(self.s,rows,[])
  worker.handle_failure('BAD',m.ProviderError('missing',404))
  self.assertEqual(worker.backoff_until,0)
  with self.s.connect() as c: self.assertGreater(c.execute("select cooldown_until from instruments where symbol='BAD'").fetchone()[0],m.now())
 def test_failed_null_response_preserves_last_good_quote(self):
  self.s.upsert_chart('X','2m',PAYLOAD,fetched=m.now())
  self.s.fail('X',m.ProviderError('temporary nulls',502))
  with self.s.connect() as c:
   row=c.execute("select price,error from latest_quotes where symbol='X'").fetchone()
  self.assertEqual(row['price'],12); self.assertEqual(row['error'],'temporary nulls')
 def test_legacy_or_partial_daily_does_not_mark_full_history(self):
  self.s.add_instruments({'X':('X','company')})
  p=Path(self.d.name)/'legacy.json'; p.write_text(json.dumps({'entries':[{'symbol':'X','interval':'1d','points':[{'ts':(m.now()-100)*1000,'close':7}]}]}))
  m.import_legacy(self.s,p)
  worker=m.Collector(self.s,{'X':('X','company')},[])
  task=worker.next_task(); self.assertEqual(task[2:],('1d','5y'))
  self.s.upsert_chart('X','1d',payload([m.now()-86400,m.now()],[7,8]),full_history=False)
  with self.s.connect() as c: self.assertIsNone(c.execute("select full_at from history_state where symbol='X'").fetchone())
if __name__=='__main__': unittest.main()
