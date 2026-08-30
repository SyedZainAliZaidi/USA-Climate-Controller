require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");

const fgClient = require("./src/fg/client");
const alertEngine = require("./src/alerts/alertEngine");

const app = express();
const PORT = process.env.PORT || 3000;

const aoiConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, "config", "aoi.json"), "utf8")
);

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    demoMode: String(process.env.DEMO_MODE || "true").toLowerCase() === "true",
    activeAoi: aoiConfig.active
  });
});

app.get("/api/heatmap", async (req, res) => {
  try {
    const aoi = aoiConfig[aoiConfig.active];
    const run = await fgClient.getHeatmapData(aoi, { granularity_m: 60 });
    res.json(run);
  } catch (err) {
    res.status(500).json({ error: "heatmap_failed", message: err.message });
  }
});

app.get("/api/alerts", async (req, res) => {
  try {
    const aoi = aoiConfig[aoiConfig.active];
    const run = await fgClient.getHeatmapData(aoi, { granularity_m: 60 });
    const alerts = alertEngine.generateAlertsForTiles(run.tiles);
    const summary = alertEngine.summarizeAlerts(alerts);
    res.json({
      source: run.source,
      measuredAt: run.measuredAt,
      aoiName: run.aoiName,
      summary,
      alerts
    });
  } catch (err) {
    res.status(500).json({ error: "alerts_failed", message: err.message });
  }
});

app.get("/api/usage", async (req, res) => {
  try {
    const usage = await fgClient.getUsage();
    res.json(usage);
  } catch (err) {
    res.status(500).json({ error: "usage_failed", message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Environmental and health monitoring app listening on port ${PORT}`);
});
