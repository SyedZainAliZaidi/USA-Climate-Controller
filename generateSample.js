// One time generator used to build data/sampleHeatmap.json.
// Not part of the running app, kept here so the sample data can be
// regenerated or extended later without hand editing JSON.

const fs = require("fs");
const path = require("path");

const baseLat = 33.4480;
const baseLng = -112.0740;
const rows = 14;
const cols = 14;
const cellSize = 0.0016;

function seededRandom(seed) {
  let value = seed;
  return function () {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

const rand = seededRandom(42);

const features = [];
let tileId = 0;
const tcm = [];
const exceedance = [];
const timeOfMeasure = [];
const persistence = [];

for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const lat = baseLat - r * cellSize;
    const lng = baseLng + c * cellSize;

    // Base temperature climbs toward the center of the grid to mimic an
    // urban heat island, then gets a bit of noise on top.
    const distFromCenter = Math.sqrt(
      Math.pow(r - rows / 2, 2) + Math.pow(c - cols / 2, 2)
    );
    const base = 46 - distFromCenter * 0.9;
    const noise = (rand() - 0.5) * 3;
    const avgTemp = Math.round((base + noise) * 10) / 10;
    const minTemp = Math.round((avgTemp - 2 - rand() * 2) * 10) / 10;
    const maxTemp = Math.round((avgTemp + 2 + rand() * 3) * 10) / 10;

    const exceedanceHours = Math.max(0, Math.round((avgTemp - 38) * 0.8 + rand() * 2));
    const peakHour = 13 + Math.round(rand() * 5); // afternoon peak, 13 to 18
    const persistenceHours = Math.max(1, Math.round(exceedanceHours * 1.4));

    tcm.push({
      tile_id: tileId,
      average_temperature: avgTemp,
      min_temperature: minTemp,
      max_temperature: maxTemp
    });
    exceedance.push({ tile_id: tileId, value: exceedanceHours });
    timeOfMeasure.push({ tile_id: tileId, value: peakHour });
    persistence.push({ tile_id: tileId, value: persistenceHours });

    features.push({
      type: "Feature",
      properties: { tile_id: tileId },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [lng, lat],
          [lng + cellSize, lat],
          [lng + cellSize, lat - cellSize],
          [lng, lat - cellSize],
          [lng, lat]
        ]]
      }
    });

    tileId += 1;
  }
}

const sample = {
  activity_id: "sample-run-20260826-phoenix",
  status: "Completed",
  measured_at: "2026-08-26T13:00:00Z",
  aoi_name: "downtown_phoenix",
  n_cells: features.length,
  granularity_m: 60,
  map_data: { type: "FeatureCollection", features },
  stats_data: {
    activity_id: "sample-run-20260826-phoenix",
    n_cells: features.length,
    temperature_stats: {
      overall_min: Math.min(...tcm.map((t) => t.min_temperature)),
      overall_max: Math.max(...tcm.map((t) => t.max_temperature)),
      overall_average:
        Math.round(
          (tcm.reduce((s, t) => s + t.average_temperature, 0) / tcm.length) * 10
        ) / 10
    },
    overall_temperature_distribution: tcm
  },
  tcm,
  exceedance,
  time_of_measure: timeOfMeasure,
  persistence
};

fs.writeFileSync(
  path.join(__dirname, "sampleHeatmap.json"),
  JSON.stringify(sample, null, 2)
);

console.log("Wrote sampleHeatmap.json with " + features.length + " tiles.");
