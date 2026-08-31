# My Work on This Project

Name: Shahad

Project: Environmental and Health Monitoring App (UrbanCool, FortyGuard integration)

## What I built

* The live-key verification pass against the FortyGuard Temperature API on
  2026 08 28, in `scripts/verify-api.mjs`. Ten checks covering authentication,
  the async submit-and-poll pattern, coverage, granularity, credit cost,
  environmental parameters, forecast horizon, historical range, analysis
  layers, and rate limits. Every fact in the verified table in the main
  `README.md` comes from a real response, not from the documentation.
* The coverage probe in `scripts/coverage-probe.mjs`. This is the one to run
  before committing to any new area of interest, for the reason in the next
  section.
* The raw verification client in `scripts/lib/fg-client.mjs`. Deliberately
  separate from the app client in `client.js` — this one does no demo-mode
  fallback and no smoothing, so a verification run reports exactly what the
  API returned.
* The PDF renderer in `scripts/make-pdf.mjs`, and the coordination plan it
  produces in `docs/plan-revision.html` and
  `docs/UrbanCool-Plan-Revision.pdf`.
* `.gitignore` and `.env.example`, which the repo was missing.

## The finding the whole project rests on

**A request with no data behind it does not fail.** It returns `200`, is
assigned an `activity_id`, polls through to `status: "Completed"`, and hands
back an empty FeatureCollection. Nothing in the response says "no data". The
only tell is the shape of `stats_data`:

```jsonc
// data present
"stats_data": { "temperature_stats": {...}, "overall_temperature_distribution": [...] }

// NO DATA — same 200, same "Completed"
"stats_data": { "activity_id": "...", "n_cells": 0 }
```

Built naively, the dashboard shows a blank map with a green last-updated
timestamp and no error in any log. Two consequences shaped the project:

* **Abu Dhabi has no data.** The original area of interest was Masdar City.
  Tested at a date and hour proven to return data elsewhere in the same run,
  Masdar returned 0 tiles while Phoenix returned 74. Coverage is United
  States only, on every plan tier including the undocumented `Hackathon`
  tier our key runs on. That is why the area of interest is downtown Phoenix.
* **The forecast returns nothing.** The 12 hour horizon is documented and
  accepted at submit, but comes back empty, as does everything in the last
  ~40 hours. The dataset ends 2026 08 26 13:00Z. So the demo runs on a fixed
  date, and "when it peaks" comes from the `time_of_measure` analysis layer,
  which returns a real peak hour per tile, rather than from a forecast that
  does not exist.

## Verified numbers

| | |
| --- | --- |
| Plan tier | `Hackathon` — undocumented, not in the published plan table |
| Credits | 2,000,000; 4,220 per heatmap call, 2,900 per env_params call |
| Key expiry | 2026 10 01 |
| Granularity | 74 tiles at 100 m over ~1 km², 198 at 60 m |
| Job latency | 2–32 s; 12 concurrent status calls, no `429` |
| History | back to 2019 01 01, `filter_type: 4` works — a week in one call |
| Parameters | all 15 returned, not the documented 3-parameter cap |

`env_params` takes `temperature` as an **input** and derives the heat index
from whatever is passed in, so it has to be fed the real tile temperature or
the output is confidently wrong.

## How to run my part

```bash
cp .env.example .env        # put the key in FG_API_KEY
npm run verify:usage        # plan, credits, key expiry — spends nothing
npm run verify              # all ten checks, ~30k credits
npm run coverage            # is an area of interest covered at all?
```

Results are written to `out/verification-report.md` and `.json`.

## One thing to fix in the repo

The files were uploaded through the GitHub web interface, which flattened the
directory structure. `package.json` points at `tests/runTests.js`,
`data/generateSample.js` and `server.js` serves `public/`, and `client.js`
resolves its sample data with `path.join(__dirname, "..", "..", "data")` — but
every file currently sits at the repository root, so `npm start` and
`npm test` both fail. Restoring the intended layout (`public/`, `src/alerts/`,
`src/fg/`, `data/`, `tests/`, `docs/`) fixes both without any code change. I
left it alone rather than move someone else's files in this branch.
