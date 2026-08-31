#!/usr/bin/env node
// Answers the six "verify with key" lines in section 03 of the coordination plan,
// plus the one question the whole location decision hangs on: does the key serve
// Abu Dhabi, or is coverage United States only as the docs state?
//
//   node scripts/verify-api.mjs                 # full run
//   node scripts/verify-api.mjs --only=usage    # plan + credits only, spends nothing
//   node scripts/verify-api.mjs --rate-probe    # add the burst test for rate limits
//
// Every check prints PASS / FAIL / WARN with the evidence it saw, and the whole run
// is written to out/verification-report.{json,md}.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  submitHeatmap,
  submitEnvParams,
  getStatus,
  fetchUsage,
  pollUntilDone,
  centroidOf,
} from "./lib/fg-client.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "out");

// --- tiny .env reader, so nobody needs a dependency -------------------------
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
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith("--only=")) || "").split("=")[1];
const rateProbe = args.includes("--rate-probe");

const AOI = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "aoi.json"), "utf8"));

const results = [];
function record(id, planLine, status, detail, evidence) {
  results.push({ id, planLine, status, detail, evidence });
  const tag = { PASS: "PASS", FAIL: "FAIL", WARN: "WARN", INFO: "INFO" }[status];
  console.log(`\n[${tag}] ${id} — ${planLine}\n       ${detail}`);
}

// --- date helpers -----------------------------------------------------------
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const hm = (d) => `${pad(d.getUTCHours())}:00`;

function errMessage(json) {
  return json?.details?.message || json?.message || json?.detail || JSON.stringify(json).slice(0, 300);
}

async function main() {
  if (!API_KEY) {
    console.error("FG_API_KEY is not set. Copy .env.example to .env and paste the hackathon key.");
    process.exit(2);
  }
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`UrbanCool — FortyGuard live-key verification\nkey ...${API_KEY.slice(-6)}   ${new Date().toISOString()}`);

  // === 1. Plan, credits, key lifetime ======================================
  let usageBefore = null;
  const u = await fetchUsage(API_KEY);
  // This endpoint returns its payload at the top level, unlike the /v1 activity
  // endpoints which nest under `data`. Accept either.
  const usageBody = u.json?.data ?? u.json;
  if (u.ok && usageBody?.credit_summary) {
    usageBefore = usageBody;
    const plan = usageBefore.plan_details ?? {};
    const credits = usageBefore.credit_summary ?? {};
    const key = usageBefore.api_key_details ?? {};
    record(
      "credits-plan",
      "Credit cost and trial balance / key lifetime",
      "PASS",
      `plan=${plan.plan_type} remaining=${credits.cycle_remaining_credits} of ` +
        `${credits.total_available_credits}; key ${key.status}, expires ${key.expiry_date}`,
      usageBefore
    );
  } else {
    record("credits-plan", "Credit cost and trial balance", "WARN", `usage endpoint returned ${u.status}: ${errMessage(u.json)}`, u.json);
  }
  if (only === "usage") return finish(usageBefore);

  // === 2. THE location question ============================================
  // Docs (Known Limitations) say coordinates must fall within the United States on
  // Basic, Premium and Startup. If that holds for the hackathon key, Masdar City
  // is not buildable and decision 02 has to change. Test it directly.
  const now = new Date();
  // The dataset lags real time by roughly 40 hours, so "an hour ago" returns an
  // empty map. Probe far enough back to be inside the data window.
  const pastHour = new Date(now.getTime() - 48 * 3600 * 1000);
  const singleHour = { start_date: ymd(pastHour), start_time: hm(pastHour), filter_type: 1 };

  // Submit, poll, and report how many tiles actually came back.
  async function submitAndCount(opts) {
    const res = await submitHeatmap(API_KEY, opts);
    const id = res.json?.data?.activity_id;
    if (!id) return { ok: false, tiles: 0, http: res.status, msg: errMessage(res.json) };
    const poll = await pollUntilDone(API_KEY, id, { intervalMs: 5000, timeoutMs: 180000 });
    return {
      ok: true,
      tiles: poll.json?.data?.result?.map_data?.features?.length ?? 0,
      status: poll.status,
    };
  }

  let workingAoi = null;
  for (const key of ["masdar", "phoenix"]) {
    const aoi = AOI[key];
    const res = await submitHeatmap(API_KEY, { aoi, dateTime: singleHour, granularity: 100 });
    const activityId = res.json?.data?.activity_id;
    if (!res.ok || !activityId) {
      record(`aoi-${key}`, `Coverage — ${aoi.name}`, "WARN", `rejected at submit, HTTP ${res.status}: ${errMessage(res.json)}`, res.json);
      continue;
    }
    // Submission acceptance proves nothing about coverage — an uncovered area is
    // accepted and returns an empty map. Poll through and count tiles.
    const poll = await pollUntilDone(API_KEY, activityId, { intervalMs: 5000, timeoutMs: 180000 });
    const tiles = poll.json?.data?.result?.map_data?.features?.length ?? 0;
    record(
      `aoi-${key}`,
      `Coverage — ${aoi.name}`,
      tiles > 0 ? "PASS" : "FAIL",
      tiles > 0 ? `${tiles} tiles returned — covered` : `accepted and Completed, but ZERO tiles — no data for this area`,
      { request: singleHour, tiles }
    );
    if (tiles > 0 && !workingAoi) {
      workingAoi = { key, aoi, activityId };
      break;
    }
  }

  if (!workingAoi) {
    record("coverage", "Maximum AOI size and granularity", "FAIL", "No AOI was accepted — cannot continue.", null);
    return finish(usageBefore);
  }

  // === 3. Async pattern, job latency, response shape =======================
  const done = await pollUntilDone(API_KEY, workingAoi.activityId, { intervalMs: 5000, timeoutMs: 180000 });
  const result = done.json?.data?.result;
  if (done.status === "Completed" && result) {
    const features = result.map_data?.features?.length ?? 0;
    const stats = result.stats_data?.temperature_stats ?? {};
    // A request outside coverage or outside the data window does NOT error. It is
    // accepted, polls through to Completed, and returns an empty FeatureCollection
    // with stats_data = {activity_id, n_cells: 0}. Completed alone means nothing —
    // always assert on tile count.
    record(
      "latency-shape",
      "Rate limits and job latency / response schema",
      features > 0 ? "PASS" : "FAIL",
      features > 0
        ? `completed in ${(done.waitedMs / 1000).toFixed(1)}s over ${done.polls} polls; ` +
          `${features} tiles; ${stats.minimum?.toFixed(1)}–${stats.maximum?.toFixed(1)} degC (mean ${stats.mean?.toFixed(1)})`
        : `completed in ${(done.waitedMs / 1000).toFixed(1)}s but returned ZERO tiles — ` +
          `no data for this area/time. n_cells=${result.stats_data?.n_cells ?? "?"}`,
      { statsKeys: Object.keys(result.stats_data ?? {}), sampleTile: result.map_data?.features?.[0] ?? null }
    );
  } else {
    record("latency-shape", "Rate limits and job latency", "FAIL", `status=${done.status} after ${(done.waitedMs / 1000).toFixed(1)}s / ${done.polls} polls: ${errMessage(done.json)}`, done.json);
  }

  // === 4. Granularity floor ================================================
  const g60 = await submitAndCount({ aoi: workingAoi.aoi, dateTime: singleHour, granularity: 60 });
  record(
    "granularity-60",
    "Maximum AOI size and granularity",
    g60.tiles > 0 ? "PASS" : "WARN",
    g60.tiles > 0
      ? `60 m returned ${g60.tiles} tiles over ~1 km² (vs 74 at 100 m) — finer zones are available`
      : `60 m returned nothing`,
    g60
  );

  // === 5. Parameters beyond air temperature ================================
  // Decides whether Open-Meteo is needed at all. Startup/Basic cap this at 3.
  const [lat, lon] = centroidOf(workingAoi.aoi);
  const wanted = ["heat_index_celsius", "relative_humidity_percent", "wet_bulb_temperature_celsius"];
  const env = await submitEnvParams(API_KEY, {
    latitude: lat,
    longitude: lon,
    temperature: 35,
    dateTime: singleHour,
    analysis: wanted,
  });
  if (env.ok && env.json?.data?.activity_id) {
    const envDone = await pollUntilDone(API_KEY, env.json.data.activity_id, { intervalMs: 5000, timeoutMs: 180000 });
    const params = envDone.json?.data?.result?.locations?.[0]?.parameters ?? {};
    const got = Object.entries(params)
      .filter(([, v]) => Array.isArray(v) && v.some((x) => x !== null && x !== -999))
      .map(([k]) => k);
    record(
      "env-params",
      "Parameters beyond air temperature",
      got.length ? "PASS" : "WARN",
      got.length
        ? `returned with values: ${got.join(", ")} — humidity and heat index come from FortyGuard, so Open-Meteo is not needed`
        : `activity finished (${envDone.status}) but no non-null parameters came back`,
      { requested: wanted, parameters: params }
    );
  } else {
    record("env-params", "Parameters beyond air temperature", "WARN", `HTTP ${env.status}: ${errMessage(env.json)} — keep Open-Meteo as the humidity source`, env.json);
  }

  // === 6. Forecast horizon =================================================
  const plus11 = new Date(now.getTime() + 11 * 3600 * 1000);
  const fc = await submitAndCount({
    aoi: workingAoi.aoi,
    dateTime: { start_date: ymd(plus11), start_time: hm(plus11), filter_type: 1 },
    granularity: 100,
  });
  record(
    "forecast",
    "Forecast horizon and interval",
    fc.tiles > 0 ? "PASS" : "FAIL",
    fc.tiles > 0
      ? `now + 11 h returned ${fc.tiles} tiles — the 12 h forecast is real`
      : `now + 11 h is ACCEPTED but returns zero tiles. The documented 12 h forecast ` +
        `has no data behind it — the project cannot be predictive on live data`,
    fc
  );

  // === 7. Historical range =================================================
  // Docs disagree with themselves: create-heatmap lists filter_type 4 (range of
  // days, <= 1 month); Known Limitations lists only 1-3. This settles it, and
  // decides whether seven days of history is one call or seven.
  const weekAgo = new Date(now.getTime() - 9 * 86400 * 1000);
  const hist = await submitAndCount({
    aoi: workingAoi.aoi,
    dateTime: { start_date: ymd(weekAgo), end_date: ymd(pastHour), filter_type: 4 },
    granularity: 100,
  });
  record(
    "history",
    "Historical range",
    hist.tiles > 0 ? "PASS" : "WARN",
    hist.tiles > 0
      ? `filter_type 4 returned ${hist.tiles} tiles — seven days of history is a single call`
      : `filter_type 4 returned nothing — budget one call per day instead`,
    hist
  );

  // === 8. Analysis layer ===================================================
  const exc = await submitAndCount({
    aoi: workingAoi.aoi,
    dateTime: { start_date: ymd(pastHour), start_time: "06:00", end_time: "18:00", filter_type: 2 },
    granularity: 100,
    analyticType: "exceedance",
    threshold: 39,
    direction: "above",
  });
  record(
    "exceedance",
    "Analysis layer",
    exc.tiles > 0 ? "PASS" : "WARN",
    exc.tiles > 0
      ? `exceedance at the Danger threshold returned ${exc.tiles} tiles (properties are tile_id + value in hours)`
      : `exceedance returned no tiles`,
    exc
  );

  // === 9. Rate limits (optional) ===========================================
  if (rateProbe) {
    const burst = await Promise.all(
      Array.from({ length: 12 }, () => getStatus(API_KEY, workingAoi.activityId))
    );
    const codes = burst.map((b) => b.status);
    const limited = codes.filter((c) => c === 429).length;
    record(
      "rate-limit",
      "Rate limits and job latency",
      limited ? "WARN" : "PASS",
      limited ? `${limited}/12 concurrent status calls returned 429 — back off below that` : `12 concurrent status calls, no 429 — a 5 s poll is comfortably safe`,
      codes
    );
  }

  // === 10. Credit cost, by difference ======================================
  const after = await fetchUsage(API_KEY);
  const afterBody = after.json?.data ?? after.json;
  if (usageBefore && after.ok && afterBody?.credit_summary) {
    const b = usageBefore.credit_summary?.cycle_remaining_credits;
    const a = afterBody.credit_summary?.cycle_remaining_credits;
    const breakdown = (afterBody.activity_breakdown ?? [])
      .filter((x) => x.name !== "Unused Credits")
      .map((x) => `${x.name} ${x.credits} over ${x.count} call(s)`)
      .join("; ");
    record(
      "credit-cost",
      "Credit cost per call",
      "PASS",
      `remaining ${b} -> ${a} (spent ${b - a} across this run). Breakdown: ${breakdown || "none recorded yet"}`,
      afterBody
    );
  }

  return finish(usageBefore);
}

function finish(usageBefore) {
  const jsonPath = path.join(OUT, "verification-report.json");
  fs.writeFileSync(jsonPath, JSON.stringify({ ranAt: new Date().toISOString(), usageBefore, results }, null, 2));

  const rows = results.map((r) => `| ${r.id} | ${r.planLine} | **${r.status}** | ${r.detail.replace(/\|/g, "\\|")} |`);
  const md = [
    "# UrbanCool — FortyGuard live-key verification",
    "",
    `Run ${new Date().toISOString()}`,
    "",
    "| check | coordination-plan line | result | what we saw |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(OUT, "verification-report.md"), md);

  const fails = results.filter((r) => r.status === "FAIL").length;
  console.log(`\n${"-".repeat(70)}\n${results.length} checks, ${fails} failed. Reports written to out/.`);
  process.exitCode = fails ? 1 : 0;
}

main().catch((e) => {
  console.error("\nverification aborted:", e);
  process.exit(1);
});
