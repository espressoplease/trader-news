import importlib.util,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('market_service',Path(__file__).parents[1]/'scripts/market_service.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
from market_fundamentals import parse_statistics,source_url

def page(cap='1,200,000,000',pe='20.500',yield_value='0.000%',currency='USD'):
    return f'''<p>Currency is {currency} · Price in GBX</p><table>
    <tr><td>Market Cap</td><td title="{cap}">1.2B</td></tr>
    <tr><td>PE Ratio</td><td title="{pe}">20.5</td></tr>
    <tr><td>Dividend Yield</td><td title="{yield_value}">0%</td></tr></table>
    <span>Last updated:</span><span>Sep 21, 2026</span>'''

class FundamentalsTest(unittest.TestCase):
    def test_raw_values_currency_and_zero_yield(self):
        x=parse_statistics(page(currency='GBP'))
        self.assertEqual(x['marketCap'],1200000000)
        self.assertEqual(x['marketCapCurrency'],'GBP')
        self.assertEqual(x['trailingPE'],20.5)
        self.assertEqual(x['dividendYieldPct'],0)
    def test_missing_negative_and_no_currency(self):
        x=parse_statistics(page(pe='-3',yield_value='n/a',currency='unknown'))
        self.assertIsNone(x['trailingPE']);self.assertIsNone(x['dividendYieldPct']);self.assertIsNone(x['marketCap'])
        with self.assertRaises(ValueError):parse_statistics('<html>Access unavailable</html>')
    def test_routes(self):
        self.assertIn('/stocks/aapl/',source_url('AAPL'))
        self.assertIn('/stocks/brk.b/',source_url('BRK-B'))
        self.assertIn('/quote/lon/VOD/',source_url('VOD.L'))
        self.assertIn('/quote/tyo/7203/',source_url('7203.T'))
        self.assertIsNone(source_url('^GSPC'))
    def test_saved_fundamentals_survive_failure_and_restart(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'market.sqlite';s=m.Store(p);s.add_instruments({'AAPL':('AAPL','company')})
            values=parse_statistics(page());values['fundamentalsSource']='Stock Analysis'
            s.save_fundamental('AAPL',values);s.fail_fundamental('AAPL',m.ProviderError('rate limited',429,1800))
            s=m.Store(p);q=s.quote('AAPL','3mo')
            self.assertEqual(q['marketCap'],1200000000)
            self.assertIsNotNone(q['fundamentalsFetchedAt']);self.assertEqual(q['fundamentalsError'],'rate limited')
            self.assertIsNone(s.next_fundamental())
    def test_daily_refresh_and_chart_priority(self):
        with tempfile.TemporaryDirectory() as tmp:
            s=m.Store(Path(tmp)/'m.sqlite');s.add_instruments({'AAPL':('AAPL','company'),'VOD.L':('VOD.L','company')})
            s.enqueue('VOD.L','3mo');self.assertEqual(s.next_fundamental()['symbol'],'VOD.L')
            s.save_fundamental('VOD.L',parse_statistics(page()))
            self.assertEqual(s.next_fundamental()['symbol'],'AAPL')
            s.save_fundamental('AAPL',parse_statistics(page()))
            self.assertIsNone(s.next_fundamental())
if __name__=='__main__':unittest.main()
