"""Parse public Stock Analysis statistics without inventing missing metrics."""
import math
import re
from html.parser import HTMLParser
from urllib.parse import quote

EXCHANGES={'L':'lon','DE':'etr','F':'fra','PA':'epa','AS':'ams','MI':'bit','MC':'bme','BR':'ebr','T':'tyo','HK':'hkg','NS':'nse','AX':'asx','KS':'krx'}

def source_url(symbol):
    if symbol.startswith('^'): return None
    if symbol in ('BRK-B','BF-B'):
        return 'https://stockanalysis.com/stocks/'+symbol.lower().replace('-','.')+'/statistics/'
    if '.' in symbol:
        ticker,suffix=symbol.rsplit('.',1)
        if suffix not in EXCHANGES: return None
        return 'https://stockanalysis.com/quote/'+EXCHANGES[suffix]+'/'+quote(ticker,safe='')+'/statistics/'
    return 'https://stockanalysis.com/stocks/'+quote(symbol.lower(),safe='-')+'/statistics/'

class StatisticsParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows={}; self.cells=None; self.cell=None; self.text=[]; self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'): self.skip+=1
        if tag=='tr': self.cells=[]
        if tag=='td' and self.cells is not None: self.cell=[[],dict(attrs).get('title')]
    def handle_endtag(self,tag):
        if tag in ('script','style'): self.skip=max(0,self.skip-1)
        if tag=='td' and self.cell is not None:
            self.cells.append((' '.join(''.join(self.cell[0]).split()),self.cell[1]));self.cell=None
        if tag=='tr' and self.cells is not None:
            if len(self.cells)==2: self.rows[self.cells[0][0]]=self.cells[1]
            self.cells=None
    def handle_data(self,data):
        if not self.skip:
            self.text.append(data)
            if self.cell is not None: self.cell[0].append(data)

def numeric(value):
    if value is None: return None
    value=value.strip().replace(',','').replace('%','')
    match=re.fullmatch(r'(-?\d+(?:\.\d+)?)\s*([KMBT])?',value)
    if not match: return None
    n=float(match[1])*{'K':1e3,'M':1e6,'B':1e9,'T':1e12,None:1}[match[2]]
    return n if math.isfinite(n) and n>=0 else None

def parse_statistics(body):
    parser=StatisticsParser();parser.feed(body)
    text=' '.join(' '.join(parser.text).split())
    if 'Market Cap' not in parser.rows or 'PE Ratio' not in parser.rows:
        raise ValueError('Statistics table missing; previous fundamentals retained')
    def value(label):
        display,precise=parser.rows.get(label,(None,None))
        return numeric(precise if precise is not None else display)
    cap=value('Market Cap'); pe=value('PE Ratio'); yield_pct=value('Dividend Yield')
    # A missing dividend is unknown, not automatically a zero yield.
    currency=re.search(r'Currency is ([A-Z]{3})',text)
    if not currency: currency=re.search(r'(?:NASDAQ|NYSE|NYSEARCA|NYSEAMERICAN|OTC)[^·]{0,40}·[^·]{0,50}·\s*(USD)\b',text)
    if not currency: currency=re.search(r'market cap or net worth of ([A-Z]{3})\b',text)
    if not currency and re.search(r'market cap or net worth of \$',text): cap_currency='USD'
    else: cap_currency=currency[1] if currency else None
    if cap_currency is None: cap=None
    updated=re.search(r'Last updated:\s*([A-Za-z]{3} \d{1,2}, \d{4})',text)
    return {'marketCap':cap,'marketCapCurrency':cap_currency,'trailingPE':pe if pe and pe>0 else None,
            'dividendYieldPct':yield_pct,'sourceUpdatedOn':updated[1] if updated else None}
