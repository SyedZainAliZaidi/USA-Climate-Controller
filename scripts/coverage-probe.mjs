#!/usr/bin/env node
// Does the API actually hold data where we want it?
//
// A heatmap submission for an uncovered area does not fail. It is accepted, it
// polls through to `Completed`, and it returns an empty FeatureCollection with
// `n_cells: 0`. Nothing in the status response says "no data" — so coverage has
// to be probed for explicitly, per area, before anyone builds on it.
//
//   node scripts/coverage-probe.mjs            # masdar vs phoenix
//   node scripts/coverage-probe.mjs dubai      # add any named AOI from aoi.json

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { submitHeatmap, pollUntilDone } from "./lib/fg-client.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const p = path.join(ROOT, ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const API_KEY = process.env.FG_API_KEY;
if (!API_KEY) {
  console.error("FG_API_KEY is not set.");
  process.exit(2);
}

const AOI = JSON.parse(fs.readFileSync(path.join(ROOT, "aoi.json"), "utf8"));
const names = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(AOI).filter((k) => AOI[k] && AOI[k].type === "FeatureCollection");

const pad = (n) => String(n).padStart(2, "0");
const when = new Date(Date.now() - 2 * 3600 * 1000);
const dateTime = {
  start_date: `${when.getUTCFullYear()}-${pad(when.getUTCMonth() + 1)}-${pad(when.getUTCDate())}`,
  start_time: `${pad(when.getUTCHours())}:00`,
  filter_type: 1,
};

console.log(`coverage probe — ${dateTime.start_date} ${dateTime.start_time}Z, granularity 100 m\n`);

for (const name of names) {
  const aoi = AOI[name];
  if (!aoi) {
    console.log(`${name.padEnd(9)} — not in aoi.json`);
    continue;
  }
  const sub = await submitHeatmap(API_KEY, { aoi, dateTime, granularity: 100 });
  const id = sub.json?.data?.activity_id;
  if (!id) {
    console.log(`${name.padEnd(9)} REJECTED at submit — HTTP ${sub.status}: ${JSON.stringify(sub.json).slice(0, 200)}`);
    continue;
  }
  const done = await pollUntilDone(API_KEY, id, { intervalMs: 5000, timeoutMs: 180000 });
  const result = done.json?.data?.result ?? {};
  const cells = result.stats_data?.n_cells ?? result.map_data?.features?.length ?? 0;
  // tcm tiles carry average_temperature; the analytic layers carry `value`.
  const temps = (result.map_data?.features ?? [])
    .map((f) => f.properties?.average_temperature ?? f.properties?.value)
    .filter((t) => typeof t === "number");
  const range = temps.length ? `${Math.min(...temps).toFixed(1)}–${Math.max(...temps).toFixed(1)} degC` : "no values";

  console.log(
    `${name.padEnd(9)} ${done.status.padEnd(10)} n_cells=${String(cells).padEnd(6)} ${range.padEnd(18)} ` +
      `${(done.waitedMs / 1000).toFixed(0)}s   ${cells > 0 ? "COVERED" : "*** NO DATA ***"}`
  );
  console.log(`          ${aoi.name}`);
}
