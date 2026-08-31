# USA-Climate-Controller

Heat-risk alerts for outdoor workers, built on the FortyGuard Temperature API.
Environmental & Health Monitoring, FortyGuard Hackathon 26.

This project handles the queries regarding the functionality of every those areas/domains
where there is heat superstitioons and handles it accordingly to managae the warmer areas
stay cool or atleast handle such high heat temperatures.

The dashboard, alert engine and Express server are documented in
[zainContributions.md](zainContributions.md). The FortyGuard client, the live-key
verification and the area-of-interest choice are documented in
[shahadContributions.md](shahadContributions.md). What follows is the verified
behaviour of the API that the rest of the project is built on.

---

Verified against the live key on 2026-08-28: **10 of 12 checks pass.**

## The one thing to know before writing any code

**A request with no data behind it does not fail.** It returns `200`, gets an
`activity_id`, polls through to `status: "Completed"`, and hands back an empty
FeatureCollection. Nothing says "no data".

```jsonc
// data present
"stats_data": { "temperature_stats": {...}, "overall_temperature_distribution": [...] }

// NO DATA — same 200, same "Completed"
"stats_data": { "activity_id": "...", "n_cells": 0 }
"map_data":   { "type": "FeatureCollection", "features": [] }
```

Always assert `map_data.features.length > 0` before caching or rendering. Treat an
empty result as a failure.

## Verified facts

```bash
npm run verify                    # ten checks, ~30k credits
npm run verify:usage              # plan + balance only, spends nothing
node scripts/coverage-probe.js    # is a given AOI covered at all?
```

| Question | Answer (measured) |
| --- | --- |
| Plan | `Hackathon` — an undocumented tier, not in the published plan table |
| Credits | 2,000,000. **4,220** per heatmap call, **2,900** per env_params call |
| Key expiry | 2026-10-01 — past the 30 Aug deadline |
| **Coverage** | **US only. Abu Dhabi returns 0 tiles** at a date that returns 74 in Phoenix |
| **Data window** | **Ends 2026-08-26 13:00Z — ~40 h behind real time** |
| **Forecast** | **Accepted at submit, returns 0 tiles.** No live or forward data exists |
| Granularity | 74 tiles at 100 m over ~1 km²; **198 at 60 m**. Use 60 m |
| Latency | 2–32 s per job. 12 concurrent status calls, no `429` |
| History | `filter_type: 4` works — a week in one call, back to 2019 |
| env_params | All 15 params returned (not the documented 3-cap). **`temperature` is an input** — heat index is derived from what you pass in |
| Tile properties | `tcm` → `{tile_id, average_temperature, min_temperature, max_temperature}`<br>`exceedance`/`time_of_measure`/`persistence` → `{tile_id, value}` in hours |
| AOI payload | GeoJSON **FeatureCollection**, not a bare Polygon |
| Errors | `{error, status_code, details:{message}}` |

## Consequences for the plan

1. **AOI moves to downtown Phoenix.** `config/aoi.json` has the working polygon.
   City name, polygon and regulatory hook change; zones, thresholds, contracts,
   cloud and computer vision do not.
2. **The demo runs on a fixed date — 2026-08-26** — and says so on screen.
3. **"When it peaks" comes from `time_of_measure`**, not a forecast. It returns the
   peak hour per tile (`{"tile_id":0,"value":15}`) and works on historical data.
4. **Drop the 60-calls-a-week budget rule.** 1.8M credits remain.

## Layout

- `src/fg/client.js` — submit, poll, usage, FeatureCollection helper
- `scripts/verify-api.js` — the ten checks
- `scripts/coverage-probe.js` — run this against any new AOI before committing to it
- `config/aoi.json` — Masdar (no data, kept as the documented refusal) and Phoenix
- `scripts/make-pdf.js` — renders `docs/plan-revision.html` to PDF
- `docs/plan-revision.html` — the coordination plan, verified against the live key
- `docs/UrbanCool-Plan-Revision.pdf` — the same, rendered for submission
