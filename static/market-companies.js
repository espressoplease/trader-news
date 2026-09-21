/* Small, client-side company context for the market explorer. */
(function () {
  var sectorByTicker = {
    AAPL:'consumer technology and devices', MSFT:'software, cloud services, and enterprise technology',
    AMZN:'e-commerce, cloud computing, and digital services', GOOGL:'internet search, advertising, and cloud services', GOOG:'internet search, advertising, and cloud services',
    META:'social platforms, advertising, and virtual reality', NVDA:'semiconductors and accelerated computing', AVGO:'semiconductors and infrastructure software',
    TSLA:'electric vehicles, energy storage, and solar power', JPM:'banking and financial services', BAC:'banking and financial services',
    WMT:'mass retail and e-commerce', V:'payments technology', MA:'payments technology', JNJ:'health care and pharmaceuticals',
    LLY:'pharmaceuticals and biotechnology', UNH:'health insurance and health care services', XOM:'oil, gas, and energy products',
    CVX:'oil, gas, and energy products', COST:'membership retail and e-commerce', HD:'home improvement retail', DIS:'entertainment and media',
    NFLX:'streaming entertainment', CRM:'customer relationship software and cloud services', ORCL:'enterprise software and cloud infrastructure',
    ADBE:'creative, document, and marketing software', INTC:'semiconductors and computing hardware', AMD:'semiconductors and computing hardware',
    PFE:'pharmaceuticals and vaccines', ABBV:'pharmaceuticals and biopharmaceuticals', MRK:'pharmaceuticals and health care',
    KO:'non-alcoholic beverages', PEP:'beverages, snacks, and packaged food', MCD:'restaurants and franchising', NKE:'athletic footwear and apparel',
    GE:'industrial technology and aerospace', CAT:'construction and mining equipment', BA:'aerospace and defense', UBER:'ride-hailing and delivery technology',
    JPM:'banking and financial services', GS:'investment banking and financial services', MS:'wealth management and investment banking',
    BLK:'asset management and investment technology', C:'banking and financial services', WFC:'banking and financial services',
    T:'telecommunications', VZ:'telecommunications', CMCSA:'communications and media', LIN:'industrial gases and materials',
    UPS:'parcel delivery and logistics', FDX:'parcel delivery and logistics', RTX:'aerospace and defense', LMT:'aerospace and defense',
    DE:'agricultural and construction equipment', NEE:'electric utilities and renewable energy', DUK:'electric and gas utilities',
    PLD:'logistics real estate', AMT:'wireless communications real estate', SPG:'retail real estate',
    SAP:'enterprise software', ASML:'semiconductor manufacturing equipment', TSM:'semiconductor manufacturing', SONY:'electronics, entertainment, and financial services',
    TM:'automobiles and mobility', BABA:'e-commerce and cloud computing', TCEHY:'internet services and digital entertainment'
  };

  var irByTicker = {
    AAPL:'https://investor.apple.com', MSFT:'https://www.microsoft.com/en-us/Investor', AMZN:'https://www.aboutamazon.com/investor-relations',
    GOOGL:'https://abc.xyz/investor', GOOG:'https://abc.xyz/investor', META:'https://investor.atmeta.com', NVDA:'https://investor.nvidia.com',
    AVGO:'https://investors.broadcom.com', TSLA:'https://ir.tesla.com', JPM:'https://www.jpmorganchase.com/ir', BAC:'https://investor.bankofamerica.com',
    WMT:'https://stock.walmart.com', V:'https://investor.visa.com', MA:'https://investor.mastercard.com', JNJ:'https://investor.jnj.com',
    LLY:'https://investor.lilly.com', UNH:'https://www.unitedhealthgroup.com/investors.html', XOM:'https://investor.exxonmobil.com',
    CVX:'https://www.chevron.com/investors', COST:'https://investor.costco.com', HD:'https://ir.homedepot.com', DIS:'https://thewaltdisneycompany.com/investor-relations',
    NFLX:'https://ir.netflix.net', CRM:'https://investor.salesforce.com', ORCL:'https://investor.oracle.com', ADBE:'https://www.adobe.com/investor-relations.html',
    INTC:'https://www.intc.com', AMD:'https://ir.amd.com', PFE:'https://www.pfizer.com/investor', ABBV:'https://investors.abbvie.com',
    MRK:'https://www.merck.com/investor-relations', KO:'https://investors.coca-colacompany.com', PEP:'https://www.pepsico.com/investors',
    MCD:'https://corporate.mcdonalds.com/corpmcd/investors.html', NKE:'https://investors.nike.com', GE:'https://www.ge.com/investor',
    CAT:'https://investors.caterpillar.com', BA:'https://investors.boeing.com', UBER:'https://investor.uber.com', GS:'https://www.goldmansachs.com/investor-relations',
    MS:'https://www.morganstanley.com/about-us/investor-relations', BLK:'https://ir.blackrock.com', C:'https://www.citigroup.com/global/investor-relations',
    WFC:'https://www.wellsfargo.com/about/investor-relations', T:'https://investors.att.com', VZ:'https://www.verizon.com/about/investors',
    CMCSA:'https://www.cmcsa.com', LIN:'https://www.linde.com/investors', UPS:'https://investors.ups.com', FDX:'https://investors.fedex.com',
    RTX:'https://investors.rtx.com', LMT:'https://investors.lockheedmartin.com', DE:'https://investor.deere.com', NEE:'https://www.investor.nexteraenergy.com',
    DUK:'https://investors.duke-energy.com', PLD:'https://ir.prologis.com', AMT:'https://www.americantower.com/investor-relations', SPG:'https://investors.simon.com',
    SAP:'https://www.sap.com/investors/en.html', ASML:'https://www.asml.com/en/investors', TSM:'https://investor.tsmc.com', SONY:'https://www.sony.com/en/SonyInfo/IR',
    TM:'https://global.toyota/en/ir', BABA:'https://ir.alibabagroup.com', TCEHY:'https://www.tencent.com/en-us/investors.html'
  };

  function utm(url, content) {
    var separator = url.indexOf('?') >= 0 ? '&' : '?';
    return url + separator + 'utm_source=trader_news&utm_medium=referral&utm_campaign=market_explorer&utm_content=' + encodeURIComponent(content);
  }

  function yahooSymbol(symbol) { return String(symbol || '').replace(/\./g, '-'); }

  function clickUrl(symbol, kind) {
    return '/market-click?symbol=' + encodeURIComponent(String(symbol || '')) + '&kind=' + encodeURIComponent(kind);
  }

  function inferSector(symbol, name) {
    if (sectorByTicker[symbol]) return sectorByTicker[symbol];
    var value = String(name || '').toLowerCase();
    var patterns = [
      [/bank|banc|financial|capital|asset management|exchange|credit|insurance/, 'banking, markets, and financial services'],
      [/pharma|health|medical|hospital|biotech|therapeutic|lab|diagnostic/, 'health care, medical products, and life sciences'],
      [/software|systems|technology|tech\b|digital|data|cyber|internet|computing|semiconductor/, 'software, technology, and digital services'],
      [/oil|petroleum|energy|pipeline|solar|utility|electric|power|gas\b/, 'energy, utilities, and infrastructure'],
      [/airline|airways|aviation|aerospace|defense/, 'transportation, aerospace, and defense'],
      [/retail|stores|market|foods|beverage|restaurant|brands|apparel|clothing|consumer/, 'consumer products, retail, and services'],
      [/real estate|reit|properties|commercial/, 'real estate and property operations'],
      [/mining|metals|steel|chemical|materials|cement/, 'materials, chemicals, and industrial commodities'],
      [/industrial|machinery|equipment|manufactur|construction|engineering/, 'industrial products, equipment, and services'],
      [/media|broadcast|entertainment|gaming|communication|telecom/, 'media, communications, and entertainment']
    ];
    for (var i = 0; i < patterns.length; i++) if (patterns[i][0].test(value)) return patterns[i][1];
    return 'its listed products and services';
  }

  function description(symbol, name, marketName) {
    var sector = inferSector(symbol, name);
    return String(name || symbol) + ' operates in ' + sector + '.';
  }

  function irDestination(symbol, name) {
    if (irByTicker[symbol]) return {url:irByTicker[symbol], label:'Investor relations'};
    return {url:'https://www.google.com/search?q=' + encodeURIComponent(String(name || symbol) + ' investor relations'), label:'Find investor relations'};
  }

  window.FINANCE_COMPANY_INFO = function (symbol, name, marketName) {
    var ir = irDestination(symbol, name);
    return {
      description:description(symbol, name, marketName),
      yahooUrl:utm('https://finance.yahoo.com/quote/' + encodeURIComponent(yahooSymbol(symbol)), 'company_quote'),
      irUrl:utm(ir.url, 'investor_relations'),
      yahooClickUrl:clickUrl(symbol, 'company_quote'),
      irClickUrl:clickUrl(symbol, 'investor_relations'),
      irLabel:ir.label
    };
  };
})();
