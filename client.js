// FortyGuard API client.
//
// This wraps the submit, poll and usage calls described in the
// verification README, and adds one thing on top: it treats an empty
// FeatureCollection as a failed run rather than a successful empty one,
// since that is the single most important fact the verification run
// surfaced (a request with no data behind it still returns 200 and
// "Completed").
//
// When FORTYGUARD_API_BASE is not set, or DEMO_MODE is true, or the live
// call fails for any reason, this falls back to the sample data in /data
// so the dashboard, alerts and tests all keep working offline.

const fs = require("fs");
const path = require("path");

const API_KEY = process.env.FORTYGUARD_API_KEY || "";
const API_BASE = process.env.FORTYGUARD_API_BASE || "";
const DEMO_MODE = String(process.env.DEMO_MODE || "true").toLowerCase() === "true";

const SAMPLE_HEATMAP_PATH = path.join(__dirname, "..", "..", "data", "sampleHeatmap.json");
const SAMPLE_USAGE_PATH = path.join(__dirname, "..", "..", "data", "sampleUsage.json");

function loadSampleHeatmap() {
  const raw = fs.readFileSync(SAMPLE_HEATMAP_PATH, "utf8");
  return JSON.parse(raw);
}

function loadSampleUsage() {
  const raw = fs.readFileSync(SAMPLE_USAGE_PATH, "utf8");
  return JSON.parse(raw);
}

// Merge the four parallel arrays the API returns (tcm, exceedance,
// time_of_measure, persistence) into one object per tile, keyed by
// tile_id. The dashboard and the alert engine both want one flat list of
// tiles rather than four lists to join by hand.
function mergeTileData(run) {
  const byId = new Map();

  (run.tcm || []).forEach((t) => {
    byId.set(t.tile_id, {
      tileId: t.tile_id,
      averageTemperature: t.average_temperature,
      minTemperature: t.min_temperature,
      maxTemperature: t.max_temperature
    });
  });

  (run.exceedance || []).forEach((e) => {
    const tile = byId.get(e.tile_id) || { tileId: e.tile_id };
    tile.exceedanceHours = e.value;
    byId.set(e.tile_id, tile);
  });

  (run.time_of_measure || []).forEach((m) => {
    const tile = byId.get(m.tile_id) || { tileId: m.tile_id };
    tile.peakHour = m.value;
    byId.set(m.tile_id, tile);
  });

  (run.persistence || []).forEach((p) => {
    const tile = byId.get(p.tile_id) || { tileId: p.tile_id };
    tile.persistenceHours = p.value;
    byId.set(p.tile_id, tile);
  });

  return Array.from(byId.values()).sort((a, b) => a.tileId - b.tileId);
}

// Builds a plain FeatureCollection from a list of tile objects and a
// matching map_data FeatureCollection, so the dashboard can draw the grid
// and read the stats off the same array.
function toFeatureCollection(tiles, mapData) {
  const geometryByTileId = new Map();
  (mapData && mapData.features ? mapData.features : []).forEach((f) => {
    geometryByTileId.set(f.properties.tile_id, f.geometry);
  });

  return {
    type: "FeatureCollection",
    features: tiles.map((t) => ({
      type: "Feature",
      properties: t,
      geometry: geometryByTileId.get(t.tileId) || null
    }))
  };
}

async function submitHeatmapJob(aoiFeatureCollection, params) {
  if (!API_BASE) throw new Error("FORTYGUARD_API_BASE is not set");

  const response = await fetch(`${API_BASE}/heatmap/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`
    },
    body: JSON.stringify({ aoi: aoiFeatureCollection, ...params })
  });

  const body = await response.json();
  if (!response.ok) {
    const message = body && body.details ? body.details.message : "submit failed";
    throw new Error(message);
  }
  return body.activity_id;
}

async function pollJobStatus(activityId) {
  if (!API_BASE) throw new Error("FORTYGUARD_API_BASE is not set");

  const maxAttempts = 20;
  const delayMs = 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`${API_BASE}/heatmap/status/${activityId}`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    });
    const body = await response.json();
    if (!response.ok) {
      const message = body && body.details ? body.details.message : "status check failed";
      throw new Error(message);
    }
    if (body.status === "Completed") return body;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error("timed out waiting for the job to complete");
}

async function getUsage() {
  if (DEMO_MODE || !API_BASE) return loadSampleUsage();

  try {
    const response = await fetch(`${API_BASE}/usage`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.details ? body.details.message : "usage call failed");
    return body;
  } catch (err) {
    return loadSampleUsage();
  }
}

// Main entry point used by the server. Returns a run object with the tile
// list already merged, plus a flag saying whether this came from the live
// API or from the sample file.
async function getHeatmapData(aoiFeatureCollection, params) {
  if (DEMO_MODE || !API_BASE) {
    const sample = loadSampleHeatmap();
    return {
      source: "sample",
      measuredAt: sample.measured_at,
      aoiName: sample.aoi_name,
      tiles: mergeTileData(sample),
      mapData: sample.map_data,
      stats: sample.stats_data
    };
  }

  try {
    const activityId = await submitHeatmapJob(aoiFeatureCollection, params);
    const run = await pollJobStatus(activityId);

    if (!run.map_data || !run.map_data.features || run.map_data.features.length === 0) {
      throw new Error("live run returned no tiles for this area and date, falling back to sample data");
    }

    return {
      source: "live",
      measuredAt: run.measured_at || new Date().toISOString(),
      aoiName: run.aoi_name || "",
      tiles: mergeTileData(run),
      mapData: run.map_data,
      stats: run.stats_data
    };
  } catch (err) {
    const sample = loadSampleHeatmap();
    return {
      source: "sample",
      fallbackReason: err.message,
      measuredAt: sample.measured_at,
      aoiName: sample.aoi_name,
      tiles: mergeTileData(sample),
      mapData: sample.map_data,
      stats: sample.stats_data
    };
  }
}

module.exports = {
  submitHeatmapJob,
  pollJobStatus,
  getUsage,
  getHeatmapData,
  mergeTileData,
  toFeatureCollection
};
