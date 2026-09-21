import importlib.util
import tempfile
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location('market_service', Path(__file__).parents[1] / 'scripts/market_service.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def payload(timestamps, closes, price=120, previous=110, market_time=None):
    return {'chart': {'result': [{'meta': {
        'regularMarketPrice': price, 'previousClose': previous,
        'regularMarketTime': market_time or int(time.time()), 'currency': 'USD',
        'exchangeTimezoneName': 'America/New_York'}, 'timestamp': timestamps,
        'indicators': {'quote': [{'open': closes, 'high': closes, 'low': closes,
                                  'close': closes, 'volume': [1] * len(closes)}]}}]}}


class MarketRangeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = m.Store(Path(self.tmp.name) / 'market.sqlite3')

    def tearDown(self):
        self.tmp.cleanup()

    def test_ytd_uses_current_calendar_year_and_returns_are_not_duplicated(self):
        current = datetime.now(timezone.utc)
        jan = int(datetime(current.year, 1, 2, tzinfo=timezone.utc).timestamp())
        recent = int(time.time()) - 3600
        self.store.upsert_chart('X', '1d', payload([jan, recent], [100, 120]), fetched=int(time.time()))
        feed = self.store.feed('X', 'ytd')
        quote = self.store.quote('X', 'ytd')
        self.assertEqual(len(feed['points']), 3)
        self.assertEqual(feed['points'][-1]['close'], feed['price'])
        self.assertEqual(quote['price'], 120)
        self.assertEqual(quote['basePrice'], 100)
        # The daily bar supplies the prior completed session close (100),
        # which is more reliable than a stale chartPreviousClose value.
        self.assertAlmostEqual(quote['dayChangePct'], 20, places=8)
        self.assertAlmostEqual(quote['periodChangePct'], 20, places=8)
        self.assertTrue(quote['coverage']['complete'])

    def test_five_day_range_falls_back_to_daily_and_latest_session_anchors_one_day(self):
        # Friday remains the relevant one-day session even when the host clock
        # advances through a weekend, because market_time is the as-of date.
        friday = int(datetime(2026, 9, 18, 20, tzinfo=timezone.utc).timestamp())
        friday_open = int(datetime(2026, 9, 18, 13, tzinfo=timezone.utc).timestamp())
        thursday = friday - 86400
        self.store.upsert_chart('X', '2m', payload([friday_open, friday], [100, 120], market_time=friday), fetched=friday)
        self.store.upsert_chart('X', '1d', payload([thursday, friday], [90, 120], market_time=friday), fetched=friday)
        one_day = self.store.feed('X', '1d')
        five_day = self.store.feed('X', '5d')
        self.assertEqual([p['close'] for p in one_day['points']], [90, 100, 120])
        self.assertEqual([p['close'] for p in five_day['points']], [90, 120])
        self.assertFalse(five_day['coverage']['complete'])


if __name__ == '__main__':
    unittest.main()
