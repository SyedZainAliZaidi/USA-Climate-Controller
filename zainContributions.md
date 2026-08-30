# My Work on This Project

Name: Syed Zain

Project: Environmental and Health Monitoring App (UrbanCool, FortyGuard integration)

## What I built

* The dashboard layout and all of its content, in `public/index.html`,
  `public/style.css`, and `public/dashboard.js`. This covers the heat map
  grid, the outlook summary card, the safety recommendation list, the tile
  detail table with a risk filter, and the API usage panel.
* The alert engine in `src/alerts/alertEngine.js`, which classifies risk
  into four bands, builds a readable alert message per tile, and generates
  the safety recommendation text shown on the dashboard.
* The Express server in `server.js` and its three endpoints, `/api/heatmap`,
  `/api/alerts`, and `/api/usage`, which connect the dashboard to the data
  layer.
* The test suite in `tests/`, covering the alert engine and the tile data
  merge logic, runnable with `npm test`.
* The sample data set in `data/`, built to match the exact response shape
  documented in the team's FortyGuard verification work, so the app is
  fully functional and demoable even without a live call.
* The project documentation in `docs/projectDocumentation.md` and the demo
  script in `docs/demoScript.md`, prepared for the final presentation.

## What came from the team's verification work

The FortyGuard client interface in `src/fg/client.js`, the area of
interest choice in `config/aoi.json`, and every fact in the verified table
in the main `README.md` come from the teammate who ran the live
verification pass against the API on 2026 08 28. My part of the project
was built to match that interface exactly, so the dashboard, the alerts,
and the tests all reflect the real, verified behavior of the API rather
than assumptions about it.

## How to run everything

```bash
npm install
cp .env.example .env
npm test
npm start
```

Then open `http://localhost:3000` in a browser. The dashboard loads in demo
mode by default, using the sample data in `data/`, which mirrors a real
FortyGuard run for the project's area of interest, downtown Phoenix, on the
fixed demo date of 2026 08 26.
