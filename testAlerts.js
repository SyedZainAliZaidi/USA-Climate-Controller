const assert = require("assert");
const alertEngine = require("../src/alerts/alertEngine");

function run() {
  const results = [];

  function check(name, fn) {
    try {
      fn();
      results.push({ name, passed: true });
    } catch (err) {
      results.push({ name, passed: false, error: err.message });
    }
  }

  check("classifyRisk returns low for cool temperatures", () => {
    const risk = alertEngine.classifyRisk(25);
    assert.strictEqual(risk.id, "low");
  });

  check("classifyRisk returns moderate at the lower boundary", () => {
    const risk = alertEngine.classifyRisk(32);
    assert.strictEqual(risk.id, "moderate");
  });

  check("classifyRisk returns high in the high band", () => {
    const risk = alertEngine.classifyRisk(40);
    assert.strictEqual(risk.id, "high");
  });

  check("classifyRisk returns extreme above 44", () => {
    const risk = alertEngine.classifyRisk(48);
    assert.strictEqual(risk.id, "extreme");
  });

  check("buildAlertMessage includes the tile id and temperature", () => {
    const alert = alertEngine.buildAlertMessage({
      tileId: 7,
      averageTemperature: 41,
      minTemperature: 38,
      maxTemperature: 44,
      peakHour: 15,
      exceedanceHours: 3,
      persistenceHours: 4
    });
    assert.strictEqual(alert.tileId, 7);
    assert.strictEqual(alert.riskLevel, "high");
    assert.ok(alert.message.includes("Tile 7"));
    assert.ok(Array.isArray(alert.recommendations) && alert.recommendations.length > 0);
  });

  check("generateAlertsForTiles returns one alert per tile", () => {
    const tiles = [
      { tileId: 0, averageTemperature: 30, peakHour: 14 },
      { tileId: 1, averageTemperature: 45, peakHour: 15 }
    ];
    const alerts = alertEngine.generateAlertsForTiles(tiles);
    assert.strictEqual(alerts.length, 2);
    assert.strictEqual(alerts[0].riskLevel, "low");
    assert.strictEqual(alerts[1].riskLevel, "extreme");
  });

  check("summarizeAlerts picks the worst risk level across tiles", () => {
    const tiles = [
      { tileId: 0, averageTemperature: 30, peakHour: 14 },
      { tileId: 1, averageTemperature: 45, peakHour: 16 },
      { tileId: 2, averageTemperature: 35, peakHour: 15 }
    ];
    const alerts = alertEngine.generateAlertsForTiles(tiles);
    const summary = alertEngine.summarizeAlerts(alerts);
    assert.strictEqual(summary.worstRiskLevel, "extreme");
    assert.ok(summary.headline.length > 0);
  });

  check("summarizeAlerts handles an empty tile list without throwing", () => {
    const summary = alertEngine.summarizeAlerts([]);
    assert.strictEqual(summary.worstRiskLevel, null);
  });

  check("formatHour formats afternoon hours correctly", () => {
    assert.strictEqual(alertEngine.formatHour(13), "1:00 PM");
    assert.strictEqual(alertEngine.formatHour(0), "12:00 AM");
    assert.strictEqual(alertEngine.formatHour(12), "12:00 PM");
  });

  return results;
}

module.exports = { run };
