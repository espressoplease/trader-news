#!/usr/bin/env node

// Compact daily company brief for the editorial automation. Reads public data.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const base = new URL(process.argv[2] || "https://tradernews.fyi/");
const root = resolve(import.meta.dirname, "..");
const scope = { window: {} };
runInNewContext(readFileSync(resolve(root, "static/market-data.js"), "utf8"), scope);
const markets = scope.window.FINANCE_MARKETS || [];
const execFileAsync = promisify(execFile);

async function get(path) {
  const { stdout } = await execFileAsync("curl", ["--fail", "--silent", "--show-error", "--max-time", "15", new URL(path, base).href],
    { maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(stdout);
}

const quoteResults = await Promise.allSettled(markets.map(async (market) => {
  const payload = await get(`/market-quotes?market=${encodeURIComponent(market.key)}&range=1d`);
  const names = new Map(market.constituents.map(([symbol, name]) => [symbol, name]));
  return (payload.entries || []).map((quote) => ({
    symbol: quote.symbol,
    name: names.get(quote.symbol) || quote.symbol,
    market: market.name,
    changePct: quote.dayChangePct,
    asOf: quote.asOf,
  }));
}));

const failures = [];
const bySymbol = new Map();
quoteResults.forEach((result, index) => {
  if (result.status === "rejected") { failures.push(`${markets[index].name}: ${result.reason.message}`); return; }
  result.value.forEach((quote) => {
    if (bySymbol.has(quote.symbol)) return;
    bySymbol.set(quote.symbol, quote);
  });
});

const now = Date.now() / 1000;
const valid = [...bySymbol.values()].filter((quote) =>
  Number.isFinite(quote.changePct) && Number.isFinite(quote.asOf) &&
  quote.asOf <= now && now - quote.asOf < 4 * 86400);
valid.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
const movers = valid.slice(0, 12);
const quietPool = valid.slice(12).sort((a, b) => Math.abs(a.changePct) - Math.abs(b.changePct))
  .slice(0, Math.ceil((valid.length - 12) / 2));
const day = new Date().toISOString().slice(0, 10);
let seed = [...day].reduce((value, char) => ((value * 33) ^ char.charCodeAt(0)) >>> 0, 5381);
for (let i = quietPool.length - 1; i > 0; i--) {
  seed = (1664525 * seed + 1013904223) >>> 0;
  const j = seed % (i + 1);
  [quietPool[i], quietPool[j]] = [quietPool[j], quietPool[i]];
}
const quiet = quietPool.slice(0, 6);

const covered = await Promise.allSettled([...movers, ...quiet].map(async (quote) => {
  const payload = await get(`/articles.json?symbol=${encodeURIComponent(quote.symbol)}&limit=5`);
  return { ...quote, articleCount: payload.symbolcounts?.[quote.symbol] || 0,
    recentArticles: (payload.articles || []).map(({ title, url, status }) => ({ title, url, status })) };
}));
const selected = covered.map((result, index) => result.status === "fulfilled" ? result.value : {
  ...[...movers, ...quiet][index], articleCount: null, recentArticles: [], coverageError: result.reason.message,
});

console.log(JSON.stringify({ date: day, base: base.href, quoted: bySymbol.size, usable: valid.length,
  failures, movers: selected.slice(0, movers.length), quiet: selected.slice(movers.length) }, null, 2));
