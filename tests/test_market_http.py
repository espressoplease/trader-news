import importlib.util
import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path

spec=importlib.util.spec_from_file_location('market_service',Path(__file__).parents[1]/'scripts/market_service.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

class MarketHttpTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.store=m.Store(Path(self.temp.name)/'test.sqlite3')
        self.rows={'TEST':('TEST','company')}
        self.store.add_instruments(self.rows)
        handler=m.make_handler(self.store,self.rows,[],None,{'sample':('TEST',)})
        self.server=ThreadingHTTPServer(('127.0.0.1',0),handler)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join(); self.temp.cleanup()
    def request(self,path,headers=None,method='GET'):
        connection=HTTPConnection('127.0.0.1',self.server.server_port)
        connection.request(method,path,headers=headers or {})
        response=connection.getresponse()
        result=response.status,dict(response.getheaders()),response.read()
        connection.close()
        return result
    def test_shared_membership_and_conditional_response(self):
        status,headers,body=self.request('/market-quotes?market=sample&range=3mo')
        self.assertEqual(status,200)
        self.assertEqual(headers['Content-Type'],'application/json')
        self.assertIn('s-maxage=120',headers['Cache-Control'])
        self.assertEqual(json.loads(body)['entries'][0]['symbol'],'TEST')
        legacy=self.request('/market-quotes?symbols=TEST&range=3mo')
        self.assertEqual(body,legacy[2])
        status,_,body=self.request('/market-quotes?market=sample&range=3mo',{'If-None-Match':'W/'+headers['ETag'],'Cookie':'session=example'})
        self.assertEqual(status,304); self.assertEqual(body,b'')
    def test_new_quote_invalidates_etag(self):
        path='/market-feed?symbol=TEST&range=1d'
        _,headers,_=self.request(path)
        with self.store.connect() as c:
            c.execute("INSERT INTO latest_quotes(symbol,price,market_time,fetched_at) VALUES('TEST',42,?,?)",(m.now(),m.now()))
        status,new,body=self.request(path,{'If-None-Match':headers['ETag']})
        self.assertEqual(status,200); self.assertNotEqual(headers['ETag'],new['ETag'])
        self.assertEqual(json.loads(body)['price'],42)
    def test_health_and_errors_are_not_cacheable(self):
        for path,status in [('/market-feed-health',200),('/market-quotes?market=unknown',404),('/market-feed?symbol=unknown',404)]:
            actual,headers,_=self.request(path)
            self.assertEqual(actual,status); self.assertEqual(headers['Cache-Control'],'no-store')
            self.assertNotIn('ETag',headers)
    def test_head_has_headers_without_body(self):
        status,headers,body=self.request('/market-quotes?market=sample',method='HEAD')
        self.assertEqual(status,200); self.assertGreater(int(headers['Content-Length']),0)
        self.assertEqual(body,b'')

if __name__=='__main__': unittest.main()
