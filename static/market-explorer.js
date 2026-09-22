/* Native market explorer. All prices and history come from the server cache. */
(function () {
  var markets = window.FINANCE_MARKETS || [];
  var ranges = { '1d':'1D', '5d':'5D', '1mo':'1M', '3mo':'3M', '6mo':'6M', 'ytd':'YTD', '1y':'1Y', '5y':'5Y' };
  var byKey = {}, state = { market:null, entity:null, range:'1d', filter:'all', sort:'move', sortDirection:'desc', token:0, feeds:{}, quotes:{}, quotePromise:null };
  var pollTimer, visible = !document.hidden;
  markets.forEach(function (market) { byKey[market.key] = market; });
  var viewStorageKey = 'trader-news.market-view.v1';
  function savedView() {
    try { var value = JSON.parse(localStorage.getItem(viewStorageKey)); return value && typeof value === 'object' ? value : {}; } catch (_) { return {}; }
  }
  function saveView() {
    if (!state.market || !state.entity) return;
    try { localStorage.setItem(viewStorageKey, JSON.stringify({
      market:state.market.key, symbol:state.entity.symbol, range:state.range,
      filter:state.filter, sort:state.sort, sortDirection:state.sortDirection, search:el('market-constituent-search').value,
      collapsed:el('market-strip').classList.contains('is-collapsed')
    })); } catch (_) { /* Browsing still works when storage is unavailable. */ }
  }
  function el(id) { return document.getElementById(id); }
  function text(id, value) { var node = el(id); if (node) node.textContent = value; }
  function clean(points) { return (points || []).filter(function (p) { return p && finite(p.ts) && finite(p.close); }).map(function (p) { return {ts:+p.ts, close:+p.close}; }); }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function number(value) { return finite(value) ? Number(value).toLocaleString(undefined, {maximumFractionDigits:2}) : 'n/a'; }
  function percent(value) { return finite(value) ? (value >= 0 ? '+' : '') + Number(value).toFixed(2) + '%' : 'n/a'; }
  function extendedQuote(record) {
    if (!record) return null;
    var session = String(record.marketState || '').toUpperCase();
    if (session === 'PRE' && finite(record.preMarketPrice)) return {label:'pre', price:record.preMarketPrice, change:record.preMarketChangePct, time:record.preMarketTime};
    if (session === 'POST' && finite(record.postMarketPrice)) return {label:'post', price:record.postMarketPrice, change:record.postMarketChangePct, time:record.postMarketTime};
    return null;
  }
  function extendedText(record) {
    var quote = extendedQuote(record);
    return quote ? quote.label + ' ' + number(quote.price) + ' ' + percent(quote.change) : '';
  }
  function marketCap(record) {
    var value = record.marketCap;
    if (!finite(value) || !record.marketCapCurrency) return 'n/a';
    var units = [[1e12,'T'],[1e9,'B'],[1e6,'M'],[1e3,'K']], result = number(value);
    for (var i=0;i<units.length;i++) if (value >= units[i][0]) { result = number(value / units[i][0]) + units[i][1]; break; }
    return result + ' ' + record.marketCapCurrency;
  }
  function peRatio(record) { return finite(record.trailingPE) && record.trailingPE > 0 ? number(record.trailingPE) + 'x' : 'n/a'; }
  function dividendYield(record) { return finite(record.dividendYieldPct) ? record.dividendYieldPct.toFixed(2) + '%' : 'n/a'; }
  function fundamentalsTitle(record) {
    if (!record.fundamentalsFetchedAt) return record.fundamentalsError ? 'Fundamentals unavailable: ' + record.fundamentalsError : 'Fundamentals awaiting collection.';
    return 'Source: ' + record.fundamentalsSource + '\nFetched: ' + timestamp(record.fundamentalsFetchedAt) + '\nSource page updated: ' + (record.sourceUpdatedOn || 'not reported') + '\nP/E: trailing earnings. Yield: provider-reported dividend yield.' + (record.fundamentalsError ? '\nRefresh failed; displaying saved values.' : '');
  }
  function renderFundamentals(record) {
    var target = el('market-company-detail-metrics'); if (!target) return;
    target.innerHTML = '';
    [['Market cap',marketCap(record)],['P/E (trailing)',peRatio(record)],['Dividend yield',dividendYield(record)]].forEach(function(metric) {
      var box=document.createElement('div'), label=document.createElement('span'), value=document.createElement('strong');
      box.className='market-company-detail-metric'; label.className='market-company-detail-label'; value.className='market-company-detail-value';
      label.textContent=metric[0]; value.textContent=metric[1]; box.title=fundamentalsTitle(record); box.appendChild(label); box.appendChild(value); target.appendChild(box);
    });
    var meta=el('market-company-detail-meta'); meta.textContent=record.fundamentalsFetchedAt ? 'Fundamentals checked ' + age(Date.now()/1000-record.fundamentalsFetchedAt) + '. ' : 'Fundamentals awaiting collection. ';
    if (record.fundamentalsSourceUrl) { var link=document.createElement('a'); link.href=record.fundamentalsSourceUrl; link.target='_blank'; link.rel='noopener noreferrer'; link.textContent=record.fundamentalsSource; meta.appendChild(link); }
    meta.title=fundamentalsTitle(record);
  }
  function renderCompanyResources(entity) {
    var description = el('market-company-detail-description'), links = el('market-company-detail-links');
    if (!description || !links) return;
    description.textContent = '';
    links.innerHTML = '';
    var info = window.FINANCE_COMPANY_INFO ? window.FINANCE_COMPANY_INFO(entity.symbol, entity.companyName || entity.name, entity.marketName || (state.market && state.market.name)) : null;
    if (!info) return;
    description.textContent = info.description;
    [['Yahoo Finance', info.yahooUrl, info.yahooClickUrl], [info.irLabel, info.irUrl, info.irClickUrl]].forEach(function (item) {
      var link = document.createElement('a'); link.href = item[1]; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = item[0];
      link.addEventListener('click', function () {
        try {
          if (navigator.sendBeacon) navigator.sendBeacon(item[2], new Blob([''], {type:'text/plain'}));
          else fetch(item[2], {credentials:'same-origin', keepalive:true});
        } catch (_) { /* The destination link still works if analytics is blocked. */ }
      });
      links.appendChild(link);
    });
  }
  function changeClass(node, value) { if (!node) return; node.className = node.className.replace(/\bis-negative\b/g, ''); if (finite(value) && value < 0) node.className += ' is-negative'; }
  function age(seconds) { if (!finite(seconds)) return 'unknown'; seconds = Math.max(0, Math.round(seconds)); if (seconds < 60) return seconds + 's ago'; if (seconds < 3600) return Math.round(seconds / 60) + 'm ago'; if (seconds < 86400) return Math.round(seconds / 3600) + 'h ago'; return Math.round(seconds / 86400) + 'd ago'; }
  function timestamp(seconds) { return finite(seconds) ? new Date(seconds * 1000).toLocaleString() : 'unknown'; }
  function statusLabel(record) { if (!record) return 'warming'; if (record.status === 'warming') return 'warming'; if (record.status === 'unavailable') return 'unavailable'; if (record.status === 'error') return 'unavailable'; if (record.marketState === 'CLOSED') return 'closed'; return record.status || 'cached'; }
  function badgeText(record) { if (!record || !finite(record.asOf)) return record && record.error ? 'unavailable' : 'warming'; var extended = extendedQuote(record); if (extended) return extended.label + ' · ' + age(Date.now() / 1000 - extended.time); var priceAge = finite(record.asOf) ? age(Date.now() / 1000 - record.asOf) : 'unknown'; return record.marketState === 'CLOSED' ? 'closed · ' + priceAge : priceAge; }
  function badgeTitle(record) { if (!record) return 'Awaiting a server cache response.'; var extended = extendedText(record); return 'Source: ' + (record.source || 'server cache') + '\nQuote timestamp: ' + timestamp(record.asOf) + '\nLast fetched: ' + timestamp(record.fetchedAt) + '\nMarket state: ' + (record.marketState || 'unknown') + '\nCurrency: ' + (record.currency || 'unknown') + (extended ? '\nExtended-hours quote: ' + extended + ' at ' + timestamp((extendedQuote(record) || {}).time) : '') + (record.error ? '\nRefresh issue: ' + record.error : '') + (record.coverage && !record.coverage.complete ? '\nFull selected-range history is not yet available.' : ''); }
  function sourceLine(record) { if (!record) return 'Server cache warming.'; var fetchedAge = finite(record.fetchedAt) ? age(Date.now() / 1000 - record.fetchedAt) : 'unknown'; var priceAge = finite(record.asOf) ? age(Date.now() / 1000 - record.asOf) : 'unknown'; return (record.source || 'server cache') + ' · fetched ' + fetchedAge + ' · price ' + priceAge + ' · ' + statusLabel(record); }
  function feedUrl(symbol, range) { return '/market-feed?symbol=' + encodeURIComponent(symbol) + '&range=' + encodeURIComponent(range); }
  function getFeed(symbol, range, fresh) {
    var key = symbol + '|' + range, cached = state.feeds[key];
    if (!fresh && cached && cached.data && Date.now() - cached.savedAt < 30000) return Promise.resolve(cached.data);
    if (cached && cached.promise) return cached.promise;
    var request = fetch(feedUrl(symbol, range), {credentials:'same-origin'}).then(function (response) { if (!response.ok) throw Error(String(response.status)); return response.json(); }).then(function (data) { state.feeds[key] = {data:data, savedAt:Date.now()}; return data; }).catch(function (error) { delete state.feeds[key]; throw error; });
    state.feeds[key] = {promise:request, savedAt:Date.now()}; return request;
  }
  function getQuotes(market, fresh) {
    if (!market) return Promise.resolve([]);
    var key = market.key + '|' + state.range;
    var cached = state.quotes[key];
    if (!fresh && cached && cached.data && Date.now() - cached.savedAt < 30000) return Promise.resolve(cached.data);
    if (cached && cached.promise) return cached.promise;
    var request = fetch('/market-quotes?market=' + encodeURIComponent(market.key) + '&range=' + encodeURIComponent(state.range), {credentials:'same-origin'}).then(function (response) { if (!response.ok) throw Error(String(response.status)); return response.json(); }).then(function (data) { var entries = data.entries || []; state.quotes[key] = {data:entries, savedAt:Date.now()}; return entries; }).catch(function (error) { delete state.quotes[key]; throw error; });
    state.quotes[key] = {promise:request, savedAt:Date.now()}; return request;
  }
  function stats(points) { points = clean(points); if (points.length < 2) return {}; var first = points[0].close, last = points[points.length - 1].close; return {last:last, move:first ? ((last - first) / first * 100) : null, low:Math.min.apply(null, points.map(function (p) { return p.close; })), high:Math.max.apply(null, points.map(function (p) { return p.close; }))}; }
  function chartPoints(record) {
    var regular = clean(record && record.points);
    return regular.length ? {points:regular, extendedOnly:false, previousSession:!!(record && record.previousSession)} : {points:clean(record && record.extendedPoints), extendedOnly:!!(record && record.extendedOnly), previousSession:false};
  }
  function draw(points, label, extendedOnly, emptyMessage) {
    var chart = el('market-chart'); points = clean(points);
    if (!chart) return;
    if (points.length < 2) { var empty = document.createElement('div'); empty.className = 'market-chart-loading'; empty.textContent = emptyMessage || 'No history is available yet.'; chart.innerHTML = ''; chart.appendChild(empty); return; }
    var width = 640, height = 168, left = 42, right = 10, top = 12, bottom = 26, values = points.map(function (p) { return p.close; }), lo = Math.min.apply(null, values), hi = Math.max.apply(null, values), span = hi - lo || Math.max(Math.abs(hi) * .01, 1);
    var coords = points.map(function (point, i) { return [left + i / (points.length - 1) * (width - left - right), height - bottom - (point.close - lo) / span * (height - top - bottom)]; });
    var line = coords.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '), change = stats(points).move, color = extendedOnly ? '#8b7b6c' : change < 0 ? '#b14b3f' : '#39824a';
    var mid = lo + span / 2, ticks = [[top,hi],[top + (height - top - bottom) / 2,mid],[height - bottom,lo]], grid = ticks.map(function (tick) { return '<line class="market-chart-grid" x1="' + left + '" y1="' + tick[0].toFixed(1) + '" x2="' + (width - right) + '" y2="' + tick[0].toFixed(1) + '" /><text class="market-chart-axis-label" x="2" y="' + (tick[0] + 3).toFixed(1) + '">' + number(tick[1]) + '</text>'; }).join('');
    chart.innerHTML = '<svg viewBox="0 0 640 168" preserveAspectRatio="none" role="img" aria-label="' + label.replace(/"/g, '') + ' chart"><g>' + grid + '</g><polyline class="market-chart-line' + (extendedOnly ? ' is-extended' : '') + '" points="' + line + '" fill="none" stroke="' + color + '" stroke-width="2" /><line class="market-chart-hover-line" x1="0" y1="' + top + '" x2="0" y2="' + (height - bottom) + '" /><circle class="market-chart-hover-dot" cx="0" cy="0" r="3" /><g class="market-chart-tooltip"><rect class="market-chart-tooltip-bg" x="0" y="0" width="174" height="28" rx="2" /><text class="market-chart-tooltip-text" x="7" y="11"> </text><text class="market-chart-tooltip-text" x="7" y="22"> </text></g></svg>';
    var svg = chart.querySelector('svg'), hoverLine = chart.querySelector('.market-chart-hover-line'), hoverDot = chart.querySelector('.market-chart-hover-dot'), tooltip = chart.querySelector('.market-chart-tooltip'), tooltipBg = chart.querySelector('.market-chart-tooltip-bg'), tooltipText = chart.querySelectorAll('.market-chart-tooltip-text');
    var hover = document.createElementNS('http://www.w3.org/2000/svg','rect'); hover.setAttribute('x',left); hover.setAttribute('y',top); hover.setAttribute('width',width-left-right); hover.setAttribute('height',height-top-bottom); hover.setAttribute('fill','transparent'); hover.setAttribute('class','market-chart-hover'); svg.appendChild(hover);
    function hideHover () { tooltip.setAttribute('visibility','hidden'); hoverLine.setAttribute('visibility','hidden'); hoverDot.setAttribute('visibility','hidden'); }
    function showHover (event) {
      var bounds = svg.getBoundingClientRect(), ratio = bounds.width ? (event.clientX - bounds.left) / bounds.width : 0, x = left + Math.max(0,Math.min(1,ratio)) * (width-left-right), index = Math.round((x-left) / (width-left-right) * (points.length-1)), point = points[index], coord = coords[index], tooltipX = Math.max(left,Math.min(width-right-174,coord[0]-87));
      hoverLine.setAttribute('x1',coord[0]); hoverLine.setAttribute('x2',coord[0]); hoverLine.setAttribute('visibility','visible'); hoverDot.setAttribute('cx',coord[0]); hoverDot.setAttribute('cy',coord[1]); hoverDot.setAttribute('visibility','visible'); tooltip.setAttribute('transform','translate(' + tooltipX + ' ' + (top+4) + ')'); tooltip.setAttribute('visibility','visible'); tooltipBg.setAttribute('stroke',color); tooltipText[0].textContent = new Date(point.ts).toLocaleString(); tooltipText[1].textContent = number(point.close) + (extendedOnly ? ' · extended hours' : '');
    }
    hover.addEventListener('mousemove',showHover); hover.addEventListener('mouseleave',hideHover); hover.addEventListener('touchmove',function (event) { if (event.touches && event.touches[0]) showHover(event.touches[0]); },{passive:true}); hideHover();
  }
  function setRail(market, record) {
    var card = el('market-' + market.key); if (!card) return;
    var last = card.querySelector('.market-index-last'), move = card.querySelector('.market-index-change'), extended = card.querySelector('.market-index-extended'), badge = card.querySelector('.market-index-badge');
    var s = stats(record && record.points), value = finite(record && record.price) ? record.price : s.last, dayMove = record && record.dayChangePct;
    if (last) last.textContent = number(value);
    if (move) { move.textContent = percent(dayMove); changeClass(move, dayMove); }
    if (extended) { extended.textContent = extendedText(record); extended.title = extendedText(record) ? badgeTitle(record) : ''; }
    if (!badge) { badge = document.createElement('span'); badge.className = 'market-index-badge'; card.querySelector('.market-index-reading').appendChild(badge); }
    badge.textContent = badgeText(record); badge.title = badgeTitle(record);
  }
  function applyRegime(records) {
    var moves = markets.map(function (market) { return records[market.symbol] && records[market.symbol].dayChangePct; }).filter(finite);
    var body = document.body, strip = el('market-strip');
    ['green','red','flat'].forEach(function (name) { body.className = body.className.replace(new RegExp('\\bmarket-regime-' + name + '\\b', 'g'), ''); if (strip) strip.className = strip.className.replace(new RegExp('\\bmarket-regime-' + name + '\\b', 'g'), ''); });
    if (!moves.length) return;
    var average = moves.reduce(function (sum, move) { return sum + move; }, 0) / moves.length, regime = average > .1 ? 'green' : average < -.1 ? 'red' : 'flat';
    body.className += ' market-regime-' + regime; if (strip) strip.className += ' market-regime-' + regime;
    text('market-regime', (regime === 'flat' ? 'mixed markets' : regime === 'green' ? 'markets broadly up' : 'markets broadly down') + ' · ' + percent(average));
  }
  function tone(row, move) {
    row.style.removeProperty('--market-row-bg'); row.style.removeProperty('--market-row-ink');
    if (!finite(move)) return;
    var alpha = .06 + Math.min(Math.abs(move), 30) / 30 * .28, rgb = move >= 0 ? '57,130,74' : '177,75,63';
    row.style.setProperty('--market-row-bg', 'rgba(' + rgb + ',' + alpha.toFixed(2) + ')');
  }
  function quoteMap(entries) { var map = {}; (entries || []).forEach(function (q) { map[q.symbol] = q; }); return map; }
  function sortValue(row) {
    if (state.sort === 'name') return row.name;
    if (state.sort === 'price') return row.quote.price;
    if (state.sort === 'day') return row.quote.dayChangePct;
    if (state.sort === 'move') return row.move;
    if (state.sort === 'marketCap') return row.quote.marketCap;
    if (state.sort === 'pe') return row.quote.trailingPE;
    if (state.sort === 'yield') return row.quote.dividendYieldPct;
    return row.move;
  }
  function compareRows(a, b) {
    var av = sortValue(a), bv = sortValue(b), direction = state.sortDirection === 'asc' ? 1 : -1;
    if (typeof av === 'string' || typeof bv === 'string') {
      av = String(av || '').toLowerCase(); bv = String(bv || '').toLowerCase();
      return (av.localeCompare(bv) || a.ticker.localeCompare(b.ticker)) * direction;
    }
    if (!finite(av) && !finite(bv)) return a.name.localeCompare(b.name);
    if (!finite(av)) return 1;
    if (!finite(bv)) return -1;
    return ((av === bv ? a.name.localeCompare(b.name) : av - bv) * direction);
  }
  function updateSortButtons() {
    var buttons = document.querySelectorAll('.market-column-sort'), labels = {
      name:'company', price:'price', day:'day', move:ranges[state.range],
      marketCap:'market cap', pe:'P/E', yield:'yield'
    };
    for (var i=0;i<buttons.length;i++) {
      var button = buttons[i], key = button.id.replace('market-sort-', ''), sort = key === 'market-cap' ? 'marketCap' : key;
      button.className = button.className.replace(/\bis-active\b/g, '').replace(/\bis-ascending\b/g, '').replace(/\bis-descending\b/g, '');
      if (sort === state.sort) {
        button.className += ' is-active ' + (state.sortDirection === 'asc' ? 'is-ascending' : 'is-descending');
        button.textContent = labels[sort] + (state.sortDirection === 'asc' ? ' ↑' : ' ↓');
      } else button.textContent = labels[sort];
    }
  }
  function renderRows(entries) {
    var market = state.market, target = el('market-constituents'); if (!market || !target) return;
    var query = (el('market-constituent-search').value || '').toLowerCase(), quotes = quoteMap(entries), rows = market.constituents.map(function (company) { var q = quotes[company[0]] || {}; return {ticker:company[0], name:company[1], meta:company[2] || {}, quote:q, move:state.range === '1d' ? q.dayChangePct : q.periodChangePct}; });
    rows = rows.filter(function (row) { var found = !query || (row.ticker + ' ' + row.name).toLowerCase().indexOf(query) >= 0; var direction = state.filter === 'all' || (state.filter === 'gainers' && row.move > 0) || (state.filter === 'losers' && row.move < 0); return found && direction; });
    rows.sort(compareRows);
    target.innerHTML = '';
    rows.forEach(function (row) {
      var node = document.createElement('div'), ident = document.createElement('span'), price = document.createElement('span'), day = document.createElement('span'), period = document.createElement('span'), cap = document.createElement('span'), pe = document.createElement('span'), yieldValue = document.createElement('span'), badge = document.createElement('span');
      var info = window.FINANCE_COMPANY_INFO ? window.FINANCE_COMPANY_INFO(row.ticker, row.name, market.name) : null;
      node.className = 'market-constituent'; node.tabIndex = 0; node.setAttribute('role', 'button'); node.title = info ? info.description + '\nClick for chart, detail, and research links.' : badgeTitle(row.quote); ident.className = 'market-constituent-ident'; price.className = 'market-constituent-price'; day.className = 'market-constituent-day market-constituent-move'; period.className = 'market-constituent-period market-constituent-move'; cap.className = 'market-constituent-cap'; pe.className = 'market-constituent-pe'; yieldValue.className = 'market-constituent-yield'; badge.className = 'market-row-badge';
      ident.textContent = row.ticker + ' ' + row.name; price.textContent = number(row.quote.price) + (finite(row.quote.price) && row.quote.currency ? ' ' + row.quote.currency : ''); var extended = extendedQuote(row.quote); if (extended) { var extendedNode = document.createElement('span'); extendedNode.className = 'market-constituent-pre'; extendedNode.textContent = extendedText(row.quote); extendedNode.title = badgeTitle(row.quote); price.appendChild(extendedNode); } day.textContent = percent(row.quote.dayChangePct); period.textContent = percent(row.quote.periodChangePct); cap.textContent = marketCap(row.quote); pe.textContent = peRatio(row.quote); yieldValue.textContent = dividendYield(row.quote); [cap,pe,yieldValue].forEach(function(field) { field.title = fundamentalsTitle(row.quote); }); badge.textContent = badgeText(row.quote); badge.title = badgeTitle(row.quote); changeClass(day, row.quote.dayChangePct); changeClass(period, row.quote.periodChangePct); tone(node, row.move);
      [ident, price, day, period, cap, pe, yieldValue, badge].forEach(function (child) { node.appendChild(child); });
      function select() { loadCompany(row); } node.addEventListener('click', select); node.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } }); target.appendChild(node);
    });
    text('market-constituent-count', market.constituents.length + ' companies'); updateSortButtons(); text('market-constituent-summary', rows.length + ' matches · all loaded');
  }
  function renderDetail(entity, record) {
    var plotted = chartPoints(record), points = plotted.points, s = stats(points), value = finite(record && record.price) ? record.price : s.last, move = record && (state.range === '1d' ? record.dayChangePct : record.periodChangePct), chartLabel = plotted.extendedOnly ? 'premarket' : plotted.previousSession ? 'previous regular session' : ranges[state.range];
    text('market-detail-name', entity.name); text('market-detail-symbol', entity.symbol); text('market-detail-last', number(value) + (entity.type === 'company' && record && record.currency ? ' ' + record.currency : '')); var change = el('market-detail-change'); if (change) { change.textContent = percent(move); changeClass(change, move); } var extended = el('market-detail-extended'); if (extended) { extended.textContent = extendedText(record); extended.title = extendedText(record) ? badgeTitle(record) : ''; }
    if (entity.type === 'company') renderFundamentals(record || {});
    draw(points, entity.name, plotted.extendedOnly, record && record.marketState === 'CLOSED' ? 'Market closed. Intraday history is not cached for this symbol yet.' : 'No history is available yet.'); text('market-chart-caption', chartLabel + ' price history' + (plotted.extendedOnly ? ' · regular-session bars have not arrived yet' : plotted.previousSession ? ' · market is currently premarket' : '') + ' · ' + (points.length ? new Date(points[0].ts).toLocaleDateString() + ' to ' + new Date(points[points.length-1].ts).toLocaleDateString() + ' · ' : '') + sourceLine(record)); text('market-source', sourceLine(record));
  }
  function selectEntity(entity) {
    state.entity = entity; saveView(); state.token++; var token = state.token; el('market-detail').className = 'market-detail';
    var companyPanel = el('market-company-detail'); document.querySelector('.market-detail-grid').classList.toggle('company-selected', entity.type === 'company');
    if (companyPanel) {
      companyPanel.className = companyPanel.className.replace(/\bnoshow\b/g, '') + (entity.type === 'company' ? '' : ' noshow');
      if (entity.type === 'company') {
        text('market-company-detail-name', entity.name);
        renderCompanyResources(entity);
        renderFundamentals(entity.quote || {});
      }
    }
    document.querySelectorAll('.market-range').forEach(function (button) { button.className = button.className.replace(/\bis-selected\b/g, '') + (button.id === 'market-range-' + state.range ? ' is-selected' : ''); });
    el('market-chart').innerHTML = '<div class="market-chart-loading">Loading history…</div>'; text('market-chart-caption', 'Loading ' + ranges[state.range] + ' history…');
    getFeed(entity.symbol, state.range).then(function (record) { if (token === state.token) renderDetail(entity, record); }).catch(function () { if (token === state.token) { draw([], entity.name); text('market-chart-caption', 'History is temporarily unavailable.'); text('market-source', 'Server cache unavailable.'); } });
  }
  function updateRows(fresh) {
    var market = state.market, range = state.range;
    return getQuotes(market, fresh).then(function(entries) {
      if (state.market === market && state.range === range) renderRows(entries);
    }).catch(function() { if (state.market === market && state.range === range) text('market-constituent-summary', 'Quote refresh unavailable. Previously received data is retained.'); });
  }
  function loadMarket(market, company) {
    state.market = market;
    document.querySelectorAll('.market-index').forEach(function(button) { button.classList.toggle('is-open', button.id === 'market-' + market.key); });
    if (company) loadCompany({ticker:company[0], name:company[1], quote:{}});
    else selectEntity({type:'index', name:market.name, symbol:market.symbol});
    renderRows([]); updateRows(false);
  }
  function loadCompany(row) { selectEntity({type:'company', name:row.name + ' (' + row.ticker + ')', companyName:row.name, marketName:state.market && state.market.name, symbol:row.ticker, quote:row.quote}); }
  function createRail() { document.querySelectorAll('.market-index').forEach(function (button) { var market = byKey[button.id.replace('market-', '')]; if (market) button.addEventListener('click', function () { loadMarket(market); }); }); }
  function refresh(fresh) {
    if (!visible) return;
    fetch('/market-feed?all=1', {credentials:'same-origin'}).then(function (response) { if (!response.ok) throw Error(); return response.json(); }).then(function (payload) { var records = {}; (payload.entries || []).forEach(function (entry) { if (entry.range === '1d' || !records[entry.symbol]) records[entry.symbol] = entry; }); markets.forEach(function (market) { setRail(market, records[market.symbol]); }); applyRegime(records); var first = records[markets[0] && markets[0].symbol]; text('market-refresh', first ? sourceLine(first) : 'Server cache warming.'); }).catch(function () { text('market-refresh', 'Market cache unavailable.'); });
    var market = state.market, entity = state.entity, range = state.range;
    if (market) getQuotes(market, fresh).then(function (entries) { if (state.market === market && state.range === range) renderRows(entries); }).catch(function () {});
    if (entity) getFeed(entity.symbol, range, fresh).then(function (record) { if (state.entity === entity && state.range === range) renderDetail(entity, record); }).catch(function () {});
  }
  function schedulePoll(delay) {
    window.clearTimeout(pollTimer);
    if (!visible) return;
    pollTimer = window.setTimeout(function () {
      refresh(true);
      schedulePoll();
    }, delay === undefined ? 120000 + Math.random() * 60000 : delay);
  }
  function init() {
    if (!el('market-strip') || !markets.length) return; createRail();
    Object.keys(ranges).forEach(function (range) { var button = el('market-range-' + range); if (button) button.addEventListener('click', function () { state.range = range; selectEntity(state.entity); renderRows([]); updateRows(false); }); });
    ['all','gainers','losers'].forEach(function (filter) { var button = el('market-filter-' + filter); if (button) button.addEventListener('click', function () { state.filter = filter; saveView(); document.querySelectorAll('.market-filter').forEach(function (b) { b.className = b.className.replace(/\bis-selected\b/g, '') + (b === button ? ' is-selected' : ''); }); updateRows(false); }); });
    el('market-constituent-search').addEventListener('input', function () { saveView(); updateRows(false); });
    var sortKeys = ['name','price','day','move','market-cap','pe','yield'];
    sortKeys.forEach(function (key) { var button = el('market-sort-' + key); if (button) button.addEventListener('click', function () { var sort = key === 'market-cap' ? 'marketCap' : key; if (state.sort === sort) state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc'; else { state.sort = sort; state.sortDirection = sort === 'name' ? 'asc' : 'desc'; } updateSortButtons(); saveView(); updateRows(false); }); });
    el('market-toggle').addEventListener('click', function () { var strip = el('market-strip'), closed = /\bis-collapsed\b/.test(strip.className); strip.className = strip.className.replace(/\bis-collapsed\b/g, '') + (closed ? '' : ' is-collapsed'); this.textContent = closed ? 'collapse' : 'expand'; saveView(); }); el('market-company-detail-close').addEventListener('click', function () { if (state.market) loadMarket(state.market); });
    document.addEventListener('visibilitychange', function () { visible = !document.hidden; window.clearTimeout(pollTimer); if (visible) schedulePoll(Math.random() * 3000); }); var saved = savedView(), market = markets.find(function (m) { return m.key === saved.market; }) || markets[0];
    if (Object.prototype.hasOwnProperty.call(ranges, saved.range)) state.range = saved.range;
    if (['all','gainers','losers'].indexOf(saved.filter) >= 0) state.filter = saved.filter;
    if (['move','name','price','day','marketCap','pe','yield'].indexOf(saved.sort) >= 0) state.sort = saved.sort;
    if (saved.sortDirection === 'asc' || saved.sortDirection === 'desc') state.sortDirection = saved.sortDirection;
    if (typeof saved.search === 'string') el('market-constituent-search').value = saved.search;
    document.querySelectorAll('.market-filter').forEach(function (button) { button.classList.toggle('is-selected', button.id === 'market-filter-' + state.filter); });
    updateSortButtons();
    if (saved.collapsed === true) { el('market-strip').classList.add('is-collapsed'); text('market-toggle', 'expand'); }
    var company = market.constituents.find(function (c) { return c[0] === saved.symbol; });
    loadMarket(market, company); refresh(); schedulePoll();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
