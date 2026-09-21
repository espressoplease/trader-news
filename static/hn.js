function $ (id) { return document.getElementById(id); }
function byClass (el, cl) { return el ? el.getElementsByClassName(cl) : [] }
function byTag (el, tg) { return el ? el.getElementsByTagName(tg) : [] }
function allof (cl) { return byClass(document, cl) }
function classes (el) { return (el && el.className && el.className.split(' ')) || []; }
function hasClass (el, cl) { return afind(cl, classes(el)) }
function addClass (el, cl) { if (el) { var a = classes(el); if (!afind(cl, a)) { a.unshift(cl); el.className = a.join(' ')}} }
function remClass (el, cl) { if (el) { var a = classes(el); arem(a, cl); el.className = a.join(' ') } }
function uptil (el, f) { if (el) return f(el) ? el : uptil(el.parentNode, f) }
function upclass (el, cl) { return uptil(el, function (x) { return hasClass(x, cl) }) }
function html (el) { return el ? el.innerHTML : null; }
function attr (el, name) { return el.getAttribute(name) }
function tonum (x) { var n = parseFloat(x); return isNaN(n) ? null : n }
function remEl (el) { el.parentNode.removeChild(el) }
function posf (f, a) { for (var i=0; i < a.length; i++) { if (f(a[i])) return i; } return -1; }
function apos (x, a) { return (typeof x == 'function') ? posf(x,a) : Array.prototype.indexOf.call(a,x) }
function afind (x, a) { var i = apos(x, a); return (i >= 0) ? a[i] : null; }
function acut (a, m, n) { return Array.prototype.slice.call(a, m, n) }
function aeach (fn, a) { return Array.prototype.forEach.call(a, fn) }
function arem (a, x) { var i = apos(x, a); if (i >= 0) { a.splice(i, 1); } return a; }
function alast (a) { return a[a.length - 1] }
function vis (el, on) { if (el) { (on ? remClass : addClass)(el, 'nosee') } }
function setshow (el, on) { (on ? remClass : addClass)(el, 'noshow') }
function send (url) { var req = new XMLHttpRequest(); req.open('GET', url); req.send(); }

function ind (tr) {
  var el = byClass(tr, 'ind')[0];
  return el ? tonum(attr(el, 'indent')) : null;
}

function vurl (id, how, auth, _goto) {
  return "vote?id=" + id + "&how=" + how + "&auth=" + encodeURIComponent(auth) + "&goto=" + encodeURIComponent(_goto) + "&js=t"
}

function vote (id, how, auth, _goto) {
  vis($('up_' + id), how == 'un');
  vis($('down_' + id), how == 'un');
  var unv = '';
  if (how != 'un') {
    unv = " | <a id='un_" + id + "' class='clicky' " +
      "href='" + vurl(id, 'un', auth, _goto) + "'>" +
      (how == 'up' ? 'unvote' : 'undown') + "</a>"
  }
  $('unv_' + id).innerHTML = unv;
  send(vurl(id, how, auth, _goto));
}

function nextcomm (el) {
  while (el = el.nextElementSibling) {
    if (hasClass(el, 'comtr')) return el;
  }
}

function hidekids (tr) {
  var n = ind(tr);
  while ((tr = nextcomm(tr)) && ind(tr) > n) {
    setshow(tr, false);
  }
}

function showkids (tr) {
  var m = ind(tr);
  while (tr = nextcomm(tr)) {
    var n = ind(tr);
    if (n <= m) return;
    if (n == m + 1) {
      setshow(tr, true);
      (hasClass(tr, 'coll') ? hidekids : showkids)(tr);
    }
  }
}

function toggleCollapse (id) {
  var tr = $(id), coll = !hasClass(tr, 'coll');
  collstate(tr, coll);
  (coll ? hidekids : showkids)(tr);
  if ($('logout')) {
    send('collapse?id=' + id + (coll ? '' : '&un=true'));
  }
}

function collstate (tr, coll) {
  (coll ? addClass : remClass)(tr, 'coll');
  vis(byClass(tr, 'votelinks')[0], !coll);
  setshow(byClass(tr, 'comment')[0], !coll);
  var el = byClass(tr, 'togg')[0];
  el.innerHTML = coll ? ('[' + attr(el, 'n') + ' more]') : '[–]';
}

function onop () { return attr(byTag(document,'html')[0],'op') }

function ranknum (el) {
  var s = html(el) || "";
  var a = s.match(/[0-9]+/);
  if (a) {
    return tonum(a[0]);
  }
}

var n1 = ranknum(allof('rank')[0]) || 1;

function newstory (pair) {
  if (pair) {
    var sp = alast(allof('spacer'));
    sp.insertAdjacentHTML('afterend', pair[0] + sp.outerHTML);
    fixranks();
    if (onop() == 'newest') {
      var n = ranknum(alast(allof('rank')));
      allof('morelink')[0].href = 'newest?next=' + pair[1] + '&n=' + (n + 1);
    }
  }
}

function fixranks () {
  var rks = allof('rank');
  aeach(function (rk) { rk.innerHTML = (apos(rk,rks) + n1) + '.' }, rks);
}

function moreurl () { return allof('morelink')[0].href }
function morenext () { return tonum(moreurl().split('next=')[1]) }

function hidestory (el, id) {
  for (var i=0; i < 2; i++) { remEl($(id).nextSibling) }
  remEl($(id));
  fixranks();
  var next = (onop() == 'newest' && morenext()) ? ('&next=' + morenext()) : '';
  var url = el.href.replace('hide', 'snip-story').replace('goto', 'onop');
  fetch(url + next).then(r => r.json()).then(newstory);
}

function onclick (ev) {
  var el = upclass(ev.target, 'clicky');
  if (el) {
    var u = new URL(el.href, location);
    var p = u.searchParams;
    if (u.pathname == '/vote') {
      vote(p.get('id'), p.get('how'), p.get('auth'), p.get('goto'));
    } else if (u.pathname == '/hide') {
      hidestory(el, p.get('id'));
    } else if (hasClass(el, 'togg')) {
      toggleCollapse(attr(el, 'id'));
    } else {
      $(u.hash.substring(1)).scrollIntoView({behavior: "smooth"})
    }
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    ev.preventDefault();
    return false;
  }
}

document.addEventListener("click", onclick);

  /* Finance market explorer. The browser reads a shared server cache. The
     server is the only component allowed to contact a market provider. */
(function () {
  var marketData = window.FINANCE_MARKETS || [];
  var byKey = {};
  var ranges = {
    '1d':  { api: '1d',  interval: '5m', label: '1D',  points: 2 },
    '5d':  { api: '5d',  interval: '15m', label: '5D', points: 5 },
    '1mo': { api: '1mo', interval: '1d', label: '1M', points: 21 },
    '3mo': { api: '3mo', interval: '1d', label: '3M', points: 30 },
    '6mo': { api: '6mo', interval: '1d', label: '6M', points: 40 },
    'ytd': { api: '1y',  interval: '1d', label: 'YTD', points: 21 },
    '1y':  { api: '1y',  interval: '1wk', label: '1Y', points: 40 },
    '5y':  { api: '5y',  interval: '1mo', label: '5Y', points: 60 }
  };
  var activeMarket = null, activeEntity = null, activeRange = '1mo', activeSort = 'move', activeFilter = 'all';
  var sortModes = ['move', 'marketcap', 'pe', 'yield', 'name'];
  var activeToken = 0, constituentLimit = 10000, marketRequestCache = {};
  aeach(function (item) { item.cache = {}; byKey[item.key] = item; }, marketData);

  function marketEl(id) { return document.getElementById(id); }
  function marketText(el, value) { if (el) el.textContent = value; }
  function marketNumber(value) { return Number(value).toLocaleString(undefined, {maximumFractionDigits: 2}); }
  function metricNumber(value, suffix) { return value === null || value === undefined || !isFinite(value) ? 'n/a' : marketNumber(value) + (suffix || ''); }
  function compactMoney(value) {
    if (value === null || value === undefined || !isFinite(value)) return 'n/a';
    if (value >= 1000000000000) return '$' + (value / 1000000000000).toFixed(2) + 'T';
    if (value >= 1000000000) return '$' + (value / 1000000000).toFixed(1) + 'B';
    if (value >= 1000000) return '$' + (value / 1000000).toFixed(0) + 'M';
    return '$' + marketNumber(value);
  }
  function sortLabel() { return activeSort == 'marketcap' ? 'market cap' : activeSort == 'pe' ? 'P/E' : activeSort == 'yield' ? 'yield' : activeSort; }
  function signedPct(value) { return (value >= 0 ? '+' : '') + value.toFixed(2) + '%'; }
  function updatePageTitle(entity, dayPct) {
    var label = entity.kind == 'company' ? entity.symbol : entity.name;
    document.title = signedPct(isFinite(dayPct) ? dayPct : 0) + ' ' + label + ' | Trader News';
  }
  function marketFeedUrl(symbol, range, all) {
    return '/market-feed?' + (all ? 'all=1' : 'symbol=' + encodeURIComponent(symbol) + '&range=' + encodeURIComponent(range));
  }
  function feedAgeLabel(feed) {
    return feed && (feed.ageLabel || feed.agelabel) ? (feed.ageLabel || feed.agelabel) : 'warming';
  }
  function feedSourceLabel(feed) {
    if (!feed) return 'Server cache warming · local snapshot if unavailable';
    if (feed.status == 'live-delayed') return 'Server cache · delayed feed · ' + feedAgeLabel(feed);
    if (feed.status == 'stale') return 'Server cache · stale, last update ' + feedAgeLabel(feed);
    return 'Server cache warming · local snapshot if unavailable';
  }
  function cleanMarketPoints(points) {
    return (points || []).filter(function (point) {
      return point && isFinite(Number(point.ts)) && isFinite(Number(point.close));
    }).map(function (point) { return {ts:Number(point.ts), close:Number(point.close)}; });
  }
  function marketHistorySource(range) {
    return ['1mo','3mo','6mo','ytd','1y'].indexOf(range) >= 0 ? '1y' : range;
  }
  function marketClientTtl(range) {
    return range == '1d' ? 30000 : range == '5d' ? 120000 : 300000;
  }
  function clientCacheKey(symbol, range) { return 'trader-news-market-v2:' + encodeURIComponent(symbol + '|' + range); }
  function readClientMarketCache(symbol, range) {
    try {
      var raw = sessionStorage.getItem(clientCacheKey(symbol, range));
      if (!raw) return null;
      var stored = JSON.parse(raw);
      if (!stored || !stored.savedAt || Date.now() - stored.savedAt > marketClientTtl(range)) return null;
      return stored.payload;
    } catch (error) { return null; }
  }
  function writeClientMarketCache(symbol, range, payload) {
    try { sessionStorage.setItem(clientCacheKey(symbol, range), JSON.stringify({savedAt:Date.now(), payload:payload})); } catch (error) {}
  }
  function sliceMarketHistory(points, range) {
    var clean = cleanMarketPoints(points);
    if (range == '1y' || marketHistorySource(range) != '1y' || clean.length < 2) return clean;
    var end = clean[clean.length - 1].ts, cutoff;
    if (range == 'ytd') {
      var date = new Date(end); cutoff = Date.UTC(date.getUTCFullYear(), 0, 1);
    } else {
      var days = range == '1mo' ? 31 : range == '3mo' ? 93 : 186;
      cutoff = end - days * 86400000;
    }
    var sliced = clean.filter(function (point) { return point.ts >= cutoff; });
    return sliced.length >= 2 ? sliced : clean.slice(Math.max(0, clean.length - 2));
  }
  function fetchMarketSource(symbol, range) {
    var key = symbol + '|' + range, cached = readClientMarketCache(symbol, range);
    if (cached) return Promise.resolve(cached);
    if (marketRequestCache[key]) return marketRequestCache[key];
    marketRequestCache[key] = fetch(marketFeedUrl(symbol, range)).then(function (response) {
      if (!response.ok) throw new Error('market feed ' + response.status);
      return response.json();
    }).then(function (payload) {
      if (cleanMarketPoints(payload.points).length >= 2) writeClientMarketCache(symbol, range, payload);
      return payload;
    }).catch(function (error) {
      delete marketRequestCache[key];
      throw error;
    });
    return marketRequestCache[key];
  }
  function refreshPageTitle() {
    if (!activeEntity || document.hidden) return;
    var entity = activeEntity;
    fetch(marketFeedUrl(entity.symbol, '1d')).then(function (response) {
      if (!response.ok) throw new Error('title feed ' + response.status);
      return response.json();
    }).then(function (payload) {
      if (entity !== activeEntity) return;
      var points = cleanMarketPoints(payload.points);
      if (points.length >= 2) updatePageTitle(entity, seriesStats(points).dayPct);
    }).catch(function () {});
  }
  function setMarketChange(el, pct) {
    if (!el) return;
    el.textContent = signedPct(pct);
    if (pct < 0) addClass(el, 'is-negative'); else remClass(el, 'is-negative');
  }
  function seriesStats(points) {
    points = cleanMarketPoints(points);
    var first = points[0] && points[0].close, last = points[points.length - 1] && points[points.length - 1].close;
    var previous = points[points.length - 2] && points[points.length - 2].close;
    var low = points.length ? Math.min.apply(Math, points.map(function (p) { return p.close; })) : 0;
    var high = points.length ? Math.max.apply(Math, points.map(function (p) { return p.close; })) : 0;
    return {last:last || 0, periodPct:first ? ((last - first) / first) * 100 : 0, dayPct:previous ? ((last - previous) / previous) * 100 : 0, low:low, high:high};
  }
  function rangeInfo() { return ranges[activeRange] || ranges['1mo']; }
  function fallbackPoints(item, range) {
    if (item.kind == 'company') return companyFallbackPoints(item.company, range);
    var cfg = ranges[range] || ranges['1mo'], values = item.fallback || [0, 1], count = cfg.points;
    if (count <= values.length) values = values.slice(values.length - count);
    var out = [], now = Date.now(), span = range == '5y' ? 30 * 86400000 : range == '1y' ? 7 * 86400000 : 86400000;
    for (var i = 0; i < count; i++) {
      var pos = count == 1 ? 0 : (i / (count - 1)) * (values.length - 1);
      var lo = Math.floor(pos), hi = Math.min(values.length - 1, Math.ceil(pos)), frac = pos - lo;
      var value = values[lo] + ((values[hi] || values[lo]) - values[lo]) * frac;
      out.push({ts: now - (count - 1 - i) * span, close: value});
    }
    return out;
  }
  function normalizeYahoo(payload) {
    var result = payload && payload.chart && payload.chart.result && payload.chart.result[0];
    var ts = result && result.timestamp, closes = result && result.indicators && result.indicators.quote[0].close, out = [];
    if (!ts || !closes) return out;
    for (var i = 0; i < Math.min(ts.length, closes.length); i++) {
      if (typeof closes[i] == 'number' && isFinite(closes[i])) out.push({ts:ts[i] * 1000, close:closes[i]});
    }
    return out;
  }
  function fetchMarketValues(item, range) {
    if (item.cache[range]) return item.cache[range];
    var sourceRange = marketHistorySource(range);
    item.cache[range] = fetchMarketSource(item.symbol, sourceRange).then(function (payload) {
      item.marketFeed = payload;
      var points = sliceMarketHistory(payload.points, range);
      if (points.length < 2) { item.live = false; return fallbackPoints(item, range); }
      item.live = payload.status == 'live-delayed';
      return points;
    }).catch(function () {
      item.live = false;
      return fallbackPoints(item, range);
    });
    return item.cache[range];
  }
  function companyStats(item, company, indexStats) {
    var ticker = company[0], hash = 0, supplied = company[2] || {};
    for (var i = 0; i < ticker.length; i++) hash = (hash * 31 + ticker.charCodeAt(i)) % 997;
    var price = supplied.price || Math.max(.1, ((hash * 17) % 9000) / 10 + 18);
    var dayMove = supplied.dayMove === undefined ? ((hash % 601) - 300) / 100 + indexStats.dayPct * .25 : supplied.dayMove;
    var basePeriodMove = supplied.periodMove === undefined ? ((hash % 601) - 300) / 100 + indexStats.periodPct * .12 : supplied.periodMove;
    var rangeFactor = {'1d':0, '5d':.45, '1mo':1, '3mo':1.45, '6mo':1.8, 'ytd':2.1, '1y':2.7, '5y':4.6}[activeRange] || 1;
    var longTermDrift = ((hash * 17 % 1701) - 850) / 100;
    var periodMove = activeRange == '1d' ? dayMove : activeRange == '1mo' ? basePeriodMove : basePeriodMove * rangeFactor + longTermDrift * Math.max(0, rangeFactor - 1) * .32;
    var pe = supplied.pe === undefined ? (hash % 17 == 0 ? null : 8 + (hash % 520) / 10) : supplied.pe;
    var marketCap = supplied.marketCap || Math.round((1.2 + (hash % 8500) / 100) * 1000000000);
    var dividendYield = supplied.dividendYield === undefined ? (hash % 11 == 0 ? null : (hash % 390) / 100) : supplied.dividendYield;
    var volume = supplied.volume || Math.round((2 + hash % 900) * 100000);
    return {ticker:ticker, name:company[1], price:price, dayMove:dayMove, periodMove:periodMove, move:periodMove, marketCap:marketCap, pe:pe, dividendYield:dividendYield, volume:volume, averageVolume:volume * (1.1 + (hash % 25) / 100), yearLow:price * (.58 + (hash % 25) / 100), yearHigh:price * (1.12 + (hash % 55) / 100), eps:pe ? price / pe : null, sector:supplied.sector || ['Technology','Financials','Health Care','Industrials','Consumer','Energy','Utilities'][hash % 7], exchange:supplied.exchange || (ticker.indexOf('.') >= 0 ? 'International' : 'US'), quality:supplied.quality || 'snapshot', hash:hash};
  }
  function companyFallbackPoints(company, range) {
    var cfg = ranges[range] || ranges['1mo'], count = cfg.points, base = Math.max(.1, company.price), start = base / Math.max(.2, 1 + company.periodMove / 100), span = range == '5y' ? 30 * 86400000 : range == '1y' ? 7 * 86400000 : 86400000, out = [], now = Date.now();
    for (var i = 0; i < count; i++) {
      var fraction = count == 1 ? 1 : i / (count - 1), drift = start + (base - start) * fraction, wobble = Math.sin((i + company.hash) * .73) * base * .012;
      out.push({ts:now - (count - 1 - i) * span, close:Math.max(.1, drift + wobble)});
    }
    return out;
  }
  function companyEntity(item, company) {
    return {kind:'company', item:item, company:company, name:company.name, symbol:company.ticker, fallback:companyFallbackPoints(company, activeRange), cache:{}, live:false};
  }
  function updateRail(item) {
    var card = marketEl('market-' + item.key); if (!card) return;
    var stats = seriesStats(fallbackPoints(item, '1d'));
    marketText(card.querySelector('.market-index-last'), marketNumber(stats.last));
    setMarketChange(card.querySelector('.market-index-change'), stats.dayPct);
  }
  function applyMarketRegime() {
    var moves = marketData.map(function (item) { return seriesStats(fallbackPoints(item, '1d')).dayPct; }), average = moves.reduce(function (sum, move) { return sum + move; }, 0) / (moves.length || 1), positive = moves.filter(function (move) { return move > 0; }).length, ratio = positive / (moves.length || 1), regime = average > .25 && ratio >= .55 ? 'green' : average < -.25 && ratio <= .45 ? 'red' : 'flat';
    var body = document.body, strip = marketEl('market-strip');
    aeach(function (name) { remClass(body, 'market-regime-' + name); if (strip) remClass(strip, 'market-regime-' + name); }, ['green','red','flat']);
    addClass(body, 'market-regime-' + regime); if (strip) { addClass(strip, 'market-regime-' + regime); strip.setAttribute('data-regime', regime); }
    marketText(marketEl('market-regime'), (regime == 'green' ? 'broad tape up ' : regime == 'red' ? 'broad tape down ' : 'mixed tape ') + signedPct(average) + ' · ' + Math.round(ratio * 100) + '% green');
  }
  function applyFocusRegime(periodPct) {
    var body = document.body, regimes = ['green','red','flat','strong-green','strong-red'];
    aeach(function (name) { remClass(body, 'market-focus-' + name); }, regimes);
    var regime = periodPct >= 5 ? 'strong-green' : periodPct > .25 ? 'green' : periodPct <= -5 ? 'strong-red' : periodPct < -.25 ? 'red' : 'flat';
    addClass(body, 'market-focus-' + regime);
  }
  function applyConstituentTone(row, periodPct) {
    var magnitude = Math.min(Math.abs(periodPct), 90) / 90, alpha = .06 + magnitude * .84, base = periodPct >= 0 ? [57,130,74] : [177,75,63], dark = alpha >= .38;
    row.style.setProperty('--market-row-bg', 'rgba(' + base[0] + ',' + base[1] + ',' + base[2] + ',' + alpha.toFixed(2) + ')');
    row.style.setProperty('--market-row-ink', dark ? '#fff' : '#333');
    row.style.setProperty('--market-row-accent', dark ? '#fff' : (periodPct >= 0 ? '#39824a' : '#b14b3f'));
    row.style.setProperty('--market-row-negative', dark ? '#fff' : '#b14b3f');
    row.style.setProperty('--market-day-accent', dark ? '#fff' : '#39824a');
    row.style.setProperty('--market-day-negative', dark ? '#fff' : '#b14b3f');
  }
  function renderChart(points, item, range) {
    points = cleanMarketPoints(points);
    var chart = marketEl('market-chart'); if (!chart || points.length < 2) return;
    var width = 640, height = 132, pad = 16, min = Math.min.apply(Math, points.map(function (p) { return p.close; })), max = Math.max.apply(Math, points.map(function (p) { return p.close; })), span = max - min || 1;
    var coords = points.map(function (point, i) { return [pad + i / (points.length - 1) * (width - pad * 2), height - pad - (point.close - min) / span * (height - pad * 2)]; });
    var line = coords.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '), area = pad + ',' + (height - pad) + ' ' + line + ' ' + (width - pad) + ',' + (height - pad), stats = seriesStats(points), stroke = stats.periodPct >= 0 ? '#39824a' : '#b14b3f';
    chart.innerHTML = '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" role="img" aria-label="' + item.name + ' ' + (ranges[range] || ranges['1mo']).label + ' performance chart">' +
      '<line x1="16" y1="116" x2="624" y2="116" stroke="#ead8c0" stroke-width="1" />' +
      '<line x1="16" y1="16" x2="16" y2="116" stroke="#ead8c0" stroke-width="1" />' +
      '<polygon points="' + area + '" fill="' + stroke + '" opacity=".08" />' +
      '<polyline points="' + line + '" fill="none" stroke="' + stroke + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />' +
      '<circle cx="' + coords[coords.length - 1][0].toFixed(1) + '" cy="' + coords[coords.length - 1][1].toFixed(1) + '" r="3" fill="' + stroke + '" />' +
      '</svg>';
    marketText(marketEl('market-chart-caption'), (ranges[range] || ranges['1mo']).label + ': ' + (stats.periodPct >= 0 ? 'up ' : 'down ') + Math.abs(stats.periodPct).toFixed(2) + '%, range low ' + marketNumber(stats.low) + ', high ' + marketNumber(stats.high) + '.');
  }
  function renderCompanyDetail(company, item, stats, liveChart) {
    var detail = marketEl('market-company-detail'); if (!detail) return;
    setshow(detail, true); marketText(marketEl('market-company-detail-name'), company.name + ' (' + company.ticker + ')');
    marketText(marketEl('market-company-detail-meta'), company.sector + ' · ' + company.exchange + ' · ' + (liveChart ? 'live chart feed, snapshot fundamentals' : 'local snapshot') + ' · as of page load');
    var metrics = marketEl('market-company-detail-metrics'); metrics.innerHTML = '';
    var fields = [['price', marketNumber(company.price)], ['day', signedPct(company.dayMove)], [(ranges[activeRange] || ranges['1mo']).label, signedPct(company.periodMove)], ['market cap', compactMoney(company.marketCap)], ['P/E', metricNumber(company.pe, 'x')], ['EPS', metricNumber(company.eps)], ['dividend yield', metricNumber(company.dividendYield, '%')], ['volume', compactMoney(company.volume)], ['52-week range', marketNumber(company.yearLow) + ' - ' + marketNumber(company.yearHigh)]];
    aeach(function (field) { var cell = document.createElement('div'), label = document.createElement('span'), value = document.createElement('strong'); cell.className = 'market-company-detail-metric'; label.className = 'market-company-detail-label'; value.className = 'market-company-detail-value'; label.textContent = field[0]; value.textContent = field[1]; if (field[0] == 'day' || field[0] == 'selected range') { if ((field[0] == 'day' ? company.dayMove : company.periodMove) < 0) addClass(value, 'is-negative'); } cell.appendChild(label); cell.appendChild(value); metrics.appendChild(cell); }, fields);
  }
  function renderConstituents(item, points) {
    var target = marketEl('market-constituents'); if (!target) return;
    var stats = seriesStats(points), input = marketEl('market-constituent-search'), query = (input && input.value || '').toLowerCase();
    var rows = item.constituents.map(function (company) { return companyStats(item, company, stats); }).filter(function (company) {
      var matchesQuery = !query || (company.ticker + ' ' + company.name + ' ' + company.sector + ' ' + company.exchange).toLowerCase().indexOf(query) >= 0;
      var matchesFilter = activeFilter == 'all' || (activeFilter == 'gainers' && company.periodMove > 0) || (activeFilter == 'losers' && company.periodMove < 0);
      return matchesQuery && matchesFilter;
    });
    rows.sort(function (a, b) {
      if (activeSort == 'name') return a.name.localeCompare(b.name);
      var av = activeSort == 'marketcap' ? a.marketCap : activeSort == 'pe' ? a.pe : activeSort == 'yield' ? a.dividendYield : a.periodMove;
      var bv = activeSort == 'marketcap' ? b.marketCap : activeSort == 'pe' ? b.pe : activeSort == 'yield' ? b.dividendYield : b.periodMove;
      if (av === null || av === undefined) return 1; if (bv === null || bv === undefined) return -1; return bv - av;
    });
    var shown = rows.slice(0, constituentLimit); target.innerHTML = '';
    aeach(function (company, index) {
      var row = document.createElement('div'), ident = document.createElement('span'), price = document.createElement('span'), day = document.createElement('span'), period = document.createElement('span'), cap = document.createElement('span'), pe = document.createElement('span'), yieldValue = document.createElement('span');
      row.className = 'market-constituent'; row.title = 'View chart and detail for ' + company.name; row.setAttribute('tabindex', '0'); row.setAttribute('role', 'button');
      if (activeEntity && activeEntity.kind == 'company' && activeEntity.company.ticker == company.ticker) addClass(row, 'is-selected');
      ident.className = 'market-constituent-ident'; price.className = 'market-constituent-price'; day.className = 'market-constituent-day market-constituent-move'; period.className = 'market-constituent-period market-constituent-move'; cap.className = 'market-constituent-cap'; pe.className = 'market-constituent-pe'; yieldValue.className = 'market-constituent-yield';
      ident.textContent = company.ticker + ' ' + company.name; price.textContent = marketNumber(company.price); day.textContent = signedPct(company.dayMove); period.textContent = signedPct(company.periodMove); cap.textContent = compactMoney(company.marketCap); pe.textContent = metricNumber(company.pe, 'x'); yieldValue.textContent = metricNumber(company.dividendYield, '%');
      if (company.dayMove < 0) addClass(day, 'is-negative'); if (company.periodMove < 0) addClass(period, 'is-negative');
      applyConstituentTone(row, company.periodMove);
      row.appendChild(ident); row.appendChild(price); row.appendChild(day); row.appendChild(period); row.appendChild(cap); row.appendChild(pe); row.appendChild(yieldValue); target.appendChild(row);
      row.addEventListener('click', function () { aeach(function (candidate) { remClass(candidate, 'is-selected'); }, allof('market-constituent')); addClass(row, 'is-selected'); loadCompany(item, company); }); row.addEventListener('keydown', function (event) { if (event.key == 'Enter' || event.key == ' ') { event.preventDefault(); loadCompany(item, company); } });
    }, shown);
    marketText(marketEl('market-constituent-count'), item.constituents.length + ' companies');
    marketText(marketEl('market-legend-range'), (ranges[activeRange] || ranges['1mo']).label);
    marketText(marketEl('market-constituent-summary'), 'showing ' + shown.length + ' of ' + rows.length + ' matches · filter: ' + activeFilter + ' · sort: ' + sortLabel() + ' · ' + (item.live ? 'index feed, estimated company fields' : 'local snapshot'));
    var more = marketEl('market-show-more'); if (more) { more.style.display = shown.length < rows.length ? 'inline-block' : 'none'; more.textContent = 'show more'; }
    marketText(marketEl('market-constituent-sort'), 'sort: ' + sortLabel());
  }
  function renderChartLoading(item, range) {
    var chart = marketEl('market-chart'); if (!chart) return;
    chart.innerHTML = '<div class="market-chart-loading" role="status">loading ' + ((ranges[range] || ranges['1mo']).label) + ' history…</div>';
    marketText(marketEl('market-chart-caption'), 'Fetching the selected history from the server cache…');
  }
  function loadEntity(entity) {
    var item = entity.kind == 'company' ? entity.item : entity;
    activeMarket = item; activeEntity = entity; activeToken += 1; var token = activeToken, detail = marketEl('market-detail');
    updatePageTitle(entity, entity.kind == 'company' ? entity.company.dayMove : seriesStats(fallbackPoints(entity, '1d')).dayPct);
    setshow(detail, true); marketText(marketEl('market-detail-name'), entity.name); marketText(marketEl('market-detail-symbol'), entity.symbol); marketText(marketEl('market-detail-last'), 'loading'); marketText(marketEl('market-detail-change'), '...');
    var detailGrid = document.querySelector('.market-detail-grid'); if (detailGrid) { if (entity.kind == 'company') addClass(detailGrid, 'company-selected'); else remClass(detailGrid, 'company-selected'); }
    if (entity.kind == 'company') setshow(marketEl('market-company-detail'), true); else setshow(marketEl('market-company-detail'), false);
    aeach(function (card) { var selected = card.id == 'market-' + item.key; if (selected) addClass(card, 'is-open'); else remClass(card, 'is-open'); }, allof('market-index'));
    aeach(function (button) { var selected = button.id == 'market-range-' + activeRange; if (selected) addClass(button, 'is-selected'); else remClass(button, 'is-selected'); }, allof('market-range'));
    var local = fallbackPoints(entity, activeRange), localStats = seriesStats(local); entity.points = entity.points || {}; entity.points[activeRange] = local; renderChartLoading(entity, activeRange); applyFocusRegime(entity.kind == 'company' ? entity.company.periodMove : localStats.periodPct);
    if (entity.kind == 'index') renderConstituents(item, local); else { renderCompanyDetail(entity.company, item, localStats, false); renderConstituents(item, item.points && item.points[activeRange] ? item.points[activeRange] : fallbackPoints(item, activeRange)); }
    fetchMarketValues(entity, activeRange).then(function (points) {
      if (token != activeToken) return;
      entity.points[activeRange] = points;
      var stats = seriesStats(points); marketText(marketEl('market-detail-last'), marketNumber(stats.last)); setMarketChange(marketEl('market-detail-change'), stats.periodPct); renderChart(points, entity, activeRange);
      if (!entity.live && (!entity.marketFeed || entity.marketFeed.status == 'unavailable' || entity.marketFeed.status == 'warming')) marketText(marketEl('market-chart-caption'), 'Provider cache warming, showing local snapshot.');
      applyFocusRegime(entity.kind == 'company' && !entity.live ? entity.company.periodMove : stats.periodPct);
      if (entity.kind == 'index') { updatePageTitle(entity, activeRange == '1d' ? stats.dayPct : seriesStats(fallbackPoints(entity, '1d')).dayPct); renderConstituents(item, points); marketText(marketEl('market-source'), feedSourceLabel(entity.marketFeed) + ' · constituent moves estimated locally'); }
      else { if (entity.live) { entity.company.price = stats.last; entity.company.dayMove = stats.dayPct; entity.company.periodMove = stats.periodPct; entity.company.move = stats.periodPct; } updatePageTitle(entity, entity.company.dayMove); renderCompanyDetail(entity.company, item, stats, entity.live); renderConstituents(item, item.points && item.points[activeRange] ? item.points[activeRange] : fallbackPoints(item, activeRange)); marketText(marketEl('market-source'), feedSourceLabel(entity.marketFeed) + ' · fundamentals are snapshot estimates'); }
    });
  }
  function loadMarket(item) {
    item.kind = 'index';
    loadEntity(item);
  }
  function loadCompany(item, company) {
    var raw = item.constituents.filter(function (entry) { return entry[0] == company.ticker; })[0] || [company.ticker, company.name];
    var current = companyStats(item, raw, seriesStats(fallbackPoints(item, activeRange)));
    loadEntity(companyEntity(item, current));
  }
  function toggleExplorer() {
    var strip = marketEl('market-strip'), button = marketEl('market-toggle'), collapsed = hasClass(strip, 'is-collapsed');
    if (collapsed) { remClass(strip, 'is-collapsed'); button.textContent = 'collapse'; button.title = 'Collapse market explorer'; button.setAttribute('aria-expanded', 'true'); }
    else { addClass(strip, 'is-collapsed'); button.textContent = 'expand'; button.title = 'Expand market explorer'; button.setAttribute('aria-expanded', 'false'); }
  }
  function initMarkets() {
    var strip = marketEl('market-strip'); if (!strip || !marketData.length) return;
    aeach(updateRail, marketData);
    applyMarketRegime();
    var toggle = marketEl('market-toggle'); if (toggle) { toggle.setAttribute('aria-expanded', 'true'); toggle.addEventListener('click', toggleExplorer); }
    aeach(function (card) { card.addEventListener('click', function () { var key = card.id.substring(7); if (byKey[key]) loadMarket(byKey[key]); }); }, allof('market-index'));
    aeach(function (button) { button.addEventListener('click', function () { activeRange = button.id.substring(13); constituentLimit = 10000; if (activeEntity && activeEntity.kind == 'company') loadCompany(activeEntity.item, activeEntity.company); else if (activeMarket) loadMarket(activeMarket); }); }, allof('market-range'));
    var search = marketEl('market-constituent-search'); if (search) search.addEventListener('input', function () { if (activeMarket) renderConstituents(activeMarket, activeMarket.points && activeMarket.points[activeRange] ? activeMarket.points[activeRange] : fallbackPoints(activeMarket, activeRange)); });
    aeach(function (button) { button.addEventListener('click', function () { activeFilter = button.id.substring(14); aeach(function (candidate) { if (candidate.id == button.id) addClass(candidate, 'is-selected'); else remClass(candidate, 'is-selected'); }, allof('market-filter')); if (activeMarket) renderConstituents(activeMarket, activeMarket.points && activeMarket.points[activeRange] ? activeMarket.points[activeRange] : fallbackPoints(activeMarket, activeRange)); }); }, allof('market-filter'));
    var sort = marketEl('market-constituent-sort'); if (sort) sort.addEventListener('click', function () { activeSort = sortModes[(sortModes.indexOf(activeSort) + 1) % sortModes.length]; if (activeMarket) renderConstituents(activeMarket, activeMarket.points && activeMarket.points[activeRange] ? activeMarket.points[activeRange] : fallbackPoints(activeMarket, activeRange)); });
    var more = marketEl('market-show-more'); if (more) more.addEventListener('click', function () { constituentLimit += 50; if (activeMarket) renderConstituents(activeMarket, activeMarket.points && activeMarket.points[activeRange] ? activeMarket.points[activeRange] : fallbackPoints(activeMarket, activeRange)); });
    var close = marketEl('market-company-detail-close'); if (close) close.addEventListener('click', function () { if (activeEntity && activeEntity.kind == 'company') loadMarket(activeEntity.item); else setshow(marketEl('market-company-detail'), false); });
    window.setInterval(refreshPageTitle, 60000);
    marketText(marketEl('market-refresh'), marketData.length + ' indices · server cache warming');
    fetch(marketFeedUrl('', '', true)).then(function (response) { return response.json(); }).then(function (payload) {
      var entries = payload.entries || [], railEntries = entries.filter(function (entry) { return entry.range == '1d'; }), bySymbol = {};
      aeach(function (entry) { bySymbol[entry.symbol] = entry; }, railEntries);
      aeach(function (item) {
        var entry = bySymbol[item.symbol];
        if (!entry || !entry.points || entry.points.length < 2) return;
        item.cache = item.cache || {};
        item.cache['1d'] = Promise.resolve(cleanMarketPoints(entry.points));
        item.marketFeed = entry; item.live = entry.status == 'live-delayed'; updateRail(item);
      }, marketData);
      var freshest = railEntries.filter(function (entry) { return entry.status == 'live-delayed'; }).sort(function (a, b) { return (a.ageSecs || a.agesecs || 0) - (b.ageSecs || b.agesecs || 0); })[0];
      marketText(marketEl('market-refresh'), freshest ? 'server cache · ' + feedAgeLabel(freshest) : marketData.length + ' indices · warming');
      marketText(marketEl('market-source'), freshest ? feedSourceLabel(freshest) : 'Server cache warming · local snapshot if unavailable');
      applyMarketRegime();
    }).catch(function () { marketText(marketEl('market-refresh'), marketData.length + ' indices · cache unavailable'); });
    loadMarket(marketData[0]);
  }
  if (document.readyState == 'loading') document.addEventListener('DOMContentLoaded', initMarkets); else initMarkets();
})();
