const assert = require("assert");
const path = require("path");
const fs = require("fs");
const fgClient = require("../src/fg/client");

async function run() {
  const results = [];

  async function check(name, fn) {
    try {
      await fn();
      results.push({ name, passed: true });
    } catch (err) {
      results.push({ name, passed: false, error: err.message });
    }
  }

  await check("sampleHeatmap.json exists and has tiles", () => {
    const samplePath = path.join(__dirname, "..", "data", "sampleHeatmap.json");
    const sample = JSON.parse(fs.readFileSync(samplePath, "utf8"));
    assert.ok(sample.map_data.features.length > 0, "sample data must not be empty");
    assert.strictEqual(sample.status, "Completed");
  });

  await check("mergeTileData joins the four parallel arrays by tile_id", () => {
    const run = {
      tcm: [{ tile_id: 0, average_temperature: 40, min_temperature: 36, max_temperature: 44 }],
      exceedance: [{ tile_id: 0, value: 2 }],
      time_of_measure: [{ tile_id: 0, value: 15 }],
      persistence: [{ tile_id: 0, value: 3 }]
    };
    const merged = fgClient.mergeTileData(run);
    assert.strictEqual(merged.length, 1);
    assert.strictEqual(merged[0].averageTemperature, 40);
    assert.strictEqual(merged[0].exceedanceHours, 2);
    assert.strictEqual(merged[0].peakHour, 15);
    assert.strictEqual(merged[0].persistenceHours, 3);
  });

  await check("mergeTileData sorts tiles by tile_id", () => {
    const run = {
      tcm: [
        { tile_id: 2, average_temperature: 30, min_temperature: 28, max_temperature: 33 },
        { tile_id: 1, average_temperature: 35, min_temperature: 32, max_temperature: 38 }
      ]
    };
    const merged = fgClient.mergeTileData(run);
    assert.deepStrictEqual(
      merged.map((t) => t.tileId),
      [1, 2]
    );
  });

  await check("toFeatureCollection attaches geometry to matching tile ids", () => {
    const tiles = [{ tileId: 0, averageTemperature: 40 }];
    const mapData = {
      features: [
        {
          properties: { tile_id: 0 },
          geometry: { type: "Polygon", coordinates: [[[0, 0]]] }
        }
      ]
    };
    const collection = fgClient.toFeatureCollection(tiles, mapData);
    assert.strictEqual(collection.features[0].geometry.type, "Polygon");
  });

  await check("getHeatmapData in demo mode never returns an empty tile list", async () => {
    const original = process.env.DEMO_MODE;
    process.env.DEMO_MODE = "true";
    const run = await fgClient.getHeatmapData({}, {});
    process.env.DEMO_MODE = original;
    assert.ok(run.tiles.length > 0, "an empty result must be treated as a failure, not success");
    assert.strictEqual(run.source, "sample");
  });

  return results;
}

module.exports = { run };
