// Alert engine.
//
// Takes the merged tile list from src/fg/client.js and turns it into risk
// levels, alert messages and safety recommendations. This is where the
// numbers from FortyGuard get translated into something a worker or a
// supervisor can actually read and act on.

const RISK_LEVELS = [
  {
    id: "low",
    label: "Low",
    color: "#2e7d32",
    minTemp: -100,
    maxTemp: 32,
    summary: "Conditions are within a safe range for normal outdoor work."
  },
  {
    id: "moderate",
    label: "Moderate",
    color: "#f9a825",
    minTemp: 32,
    maxTemp: 38,
    summary: "Heat is building up. Regular breaks and hydration are recommended."
  },
  {
    id: "high",
    label: "High",
    color: "#ef6c00",
    minTemp: 38,
    maxTemp: 44,
    summary: "Heat stress risk is significant. Limit continuous exposure."
  },
  {
    id: "extreme",
    label: "Extreme",
    color: "#c62828",
    minTemp: 44,
    maxTemp: 1000,
    summary: "Dangerous heat. Outdoor work should be rescheduled or heavily limited."
  }
];

const RECOMMENDATIONS = {
  low: [
    "Keep water within reach and drink on a normal schedule.",
    "Light, breathable clothing is enough for this level."
  ],
  moderate: [
    "Take a short shaded break at least once every hour.",
    "Carry more water than usual and drink before you feel thirsty.",
    "Wear a hat or light head covering when working in direct sun."
  ],
  high: [
    "Move the heaviest tasks to the early morning or evening if possible.",
    "Take a fifteen minute shaded or cooled break every thirty to forty five minutes.",
    "Watch coworkers for dizziness, cramps or confusion, these are early heat stress signs.",
    "Use cooling towels or a spray bottle if one is available on site."
  ],
  extreme: [
    "Pause non essential outdoor tasks until the peak hours pass.",
    "Rotate workers more frequently and keep shaded rest areas stocked with water.",
    "Anyone showing signs of heat exhaustion should stop work immediately and cool down.",
    "Treat this as an emergency planning window, not a normal work day."
  ]
};

function classifyRisk(temperature) {
  return (
    RISK_LEVELS.find((level) => temperature >= level.minTemp && temperature < level.maxTemp) ||
    RISK_LEVELS[RISK_LEVELS.length - 1]
  );
}

function formatHour(hour) {
  if (hour === undefined || hour === null) return "an unknown hour";
  const suffix = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:00 ${suffix}`;
}

function buildAlertMessage(tile) {
  const risk = classifyRisk(tile.averageTemperature);
  const peak = formatHour(tile.peakHour);

  const message =
    `Tile ${tile.tileId}: expected around ${tile.averageTemperature} degrees, ` +
    `peaking near ${peak}. Risk level is ${risk.label.toLowerCase()}. ${risk.summary}`;

  return {
    tileId: tile.tileId,
    temperature: tile.averageTemperature,
    minTemperature: tile.minTemperature,
    maxTemperature: tile.maxTemperature,
    peakHour: tile.peakHour,
    exceedanceHours: tile.exceedanceHours,
    persistenceHours: tile.persistenceHours,
    riskLevel: risk.id,
    riskLabel: risk.label,
    riskColor: risk.color,
    message,
    recommendations: RECOMMENDATIONS[risk.id]
  };
}

function generateAlertsForTiles(tiles) {
  return tiles.map(buildAlertMessage);
}

// A short summary across all tiles, used for the top of the dashboard and
// for the single push style notification a user would receive.
function summarizeAlerts(alerts) {
  if (!alerts.length) {
    return {
      headline: "No data available for this run.",
      worstRiskLevel: null,
      worstRiskLabel: null,
      recommendations: []
    };
  }

  const order = ["extreme", "high", "moderate", "low"];
  const worst = alerts.reduce((current, alert) => {
    return order.indexOf(alert.riskLevel) < order.indexOf(current.riskLevel) ? alert : current;
  }, alerts[0]);

  const avgTemp =
    Math.round(
      (alerts.reduce((sum, a) => sum + a.temperature, 0) / alerts.length) * 10
    ) / 10;

  return {
    headline:
      `Tomorrow's outlook: around ${avgTemp} degrees on average, reaching ` +
      `${worst.riskLabel.toLowerCase()} risk near ${formatHour(worst.peakHour)} in the hottest spots. ` +
      `Take precautions and check the map for the areas affected.`,
    worstRiskLevel: worst.riskLevel,
    worstRiskLabel: worst.riskLabel,
    averageTemperature: avgTemp,
    recommendations: RECOMMENDATIONS[worst.riskLevel]
  };
}

module.exports = {
  RISK_LEVELS,
  RECOMMENDATIONS,
  classifyRisk,
  buildAlertMessage,
  generateAlertsForTiles,
  summarizeAlerts,
  formatHour
};
