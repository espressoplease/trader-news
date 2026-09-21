#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const inputPath = process.argv[2];

if (!inputPath || process.argv.length !== 3) {
  console.error("Usage: node scripts/backlog-import.mjs /path/to/articles.json");
  process.exit(2);
}

let entries;
try {
  entries = JSON.parse(readFileSync(inputPath, "utf8"));
} catch (error) {
  console.error(`Could not read article JSON: ${error.message}`);
  process.exit(2);
}

if (!Array.isArray(entries) || entries.length === 0 || entries.length > 100) {
  console.error("Article JSON must be an array containing 1 to 100 entries.");
  process.exit(2);
}

const seen = new Set();
const cleanEntries = entries.map((entry, index) => {
  if (!entry || typeof entry !== "object") {
    throw new Error(`Entry ${index + 1} must be an object.`);
  }

  const title = String(entry.title || "").trim();
  const url = String(entry.url || "").trim();
  const source = String(entry.source || "").trim();

  if (!title || !url) {
    throw new Error(`Entry ${index + 1} needs a title and URL.`);
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Entry ${index + 1} has an invalid URL.`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Entry ${index + 1} must use HTTP or HTTPS.`);
  }

  const key = url.toLowerCase();
  if (seen.has(key)) {
    throw new Error(`Entry ${index + 1} duplicates an earlier URL.`);
  }
  seen.add(key);
  return { title, url, source };
});

const arcString = (value) => JSON.stringify(value);
const program = [
  '(load "news.arc")',
  '(ensure-newsdirs)',
  '(ensure-market-backlog)',
  '(prn (+ "stored-before=" (len market-backlog*)))',
  ...cleanEntries.map(
    ({ title, url, source }) =>
      `(backlog-add ${arcString(title)} ${arcString(url)} ${arcString(source)})`,
  ),
  '(prn (+ "stored-after=" (len market-backlog*)))',
  '(prn (+ "pending=" (len:backlog-pending)))',
].join("\n");

const root = resolve(import.meta.dirname, "..");
const result = spawnSync("./sharc", [], {
  cwd: root,
  input: `${program}\n`,
  encoding: "utf8",
  env: process.env,
});

if (result.error) {
  console.error(`Could not start Sharc: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || "Backlog import failed.\n");
  process.exit(result.status || 1);
}

const pending = result.stdout.match(/pending=(\d+)/)?.[1] || "unknown";
const before = Number(result.stdout.match(/stored-before=(\d+)/)?.[1]);
const after = Number(result.stdout.match(/stored-after=(\d+)/)?.[1]);
const added = Number.isFinite(before) && Number.isFinite(after) ? after - before : "unknown";
console.log(`Processed ${cleanEntries.length} candidate${cleanEntries.length === 1 ? "" : "s"}; added=${added}; pending=${pending}.`);
