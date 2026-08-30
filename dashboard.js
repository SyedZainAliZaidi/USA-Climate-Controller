const RISK_COLORS = {
  low: "#2e7d32",
  moderate: "#f9a825",
  high: "#ef6c00",
  extreme: "#c62828"
};

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`request to ${url} failed`);
  return response.json();
}

function setBadge(text, ok) {
  const badge = document.getElementById("statusBadge");
  badge.textContent = text;
  badge.style.background = ok ? "#1e3a5f" : "#8a1f1f";
}

function renderLegend() {
  const legend = document.getElementById("legend");
  const labels = { low: "Low", moderate: "Moderate", high: "High", extreme: "Extreme" };
  legend.innerHTML = Object.keys(labels)
    .map(
      (key) =>
        `<span><span class="legendDot" style="background:${RISK_COLORS[key]}"></span>${labels[key]}</span>`
    )
    .join("");
}

function temperatureToColor(temp) {
  if (temp < 32) return RISK_COLORS.low;
  if (temp < 38) return RISK_COLORS.moderate;
  if (temp < 44) return RISK_COLORS.high;
  return RISK_COLORS.extreme;
}

function renderHeatGrid(tiles) {
  const grid = document.getElementById("heatGrid");
  grid.innerHTML = "";
  tiles.forEach((tile) => {
    const cell = document.createElement("div");
    cell.className = "heatCell";
    cell.style.background = temperatureToColor(tile.averageTemperature);
    cell.title = `Tile ${tile.tileId}: ${tile.averageTemperature} degrees`;
    grid.appendChild(cell);
  });
}

function renderSummary(summary, source, measuredAt) {
  document.getElementById("summaryHeadline").textContent = summary.headline;
  document.getElementById("summaryTemp").textContent = summary.averageTemperature
    ? `Average: ${summary.averageTemperature} degrees`
    : "";
  const riskEl = document.getElementById("summaryRisk");
  riskEl.textContent = summary.worstRiskLabel ? `Worst area: ${summary.worstRiskLabel}` : "";
  riskEl.style.color = summary.worstRiskLevel ? RISK_COLORS[summary.worstRiskLevel] : "inherit";

  const note = document.getElementById("dataNote");
  const sourceText =
    source === "live"
      ? "Live FortyGuard data."
      : "Demo mode data, based on the verified sample run for this project.";
  note.textContent = `${sourceText} Measured at ${measuredAt}.`;
}

function renderRecommendations(recommendations) {
  const list = document.getElementById("recommendationList");
  list.innerHTML = "";
  (recommendations || []).forEach((rec) => {
    const li = document.createElement("li");
    li.textContent = rec;
    list.appendChild(li);
  });
}

let allAlerts = [];

function renderTable(alerts) {
  const body = document.getElementById("tileTableBody");
  body.innerHTML = "";
  alerts.forEach((alert) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${alert.tileId}</td>
      <td>${alert.temperature}&deg;</td>
      <td>${formatHourClient(alert.peakHour)}</td>
      <td>${alert.exceedanceHours ?? "-"}</td>
      <td>${alert.persistenceHours ?? "-"}</td>
      <td><span class="riskPill" style="background:${alert.riskColor}">${alert.riskLabel}</span></td>
    `;
    body.appendChild(row);
  });
}

function formatHourClient(hour) {
  if (hour === undefined || hour === null) return "-";
  const suffix = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:00 ${suffix}`;
}

function setupFilter() {
  const input = document.getElementById("riskFilter");
  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    const filtered = query
      ? allAlerts.filter((a) => a.riskLabel.toLowerCase().includes(query))
      : allAlerts;
    renderTable(filtered);
  });
}

function renderUsage(usage) {
  const body = document.getElementById("usageBody");
  if (usage.error) {
    body.textContent = "Usage data is unavailable right now.";
    return;
  }
  const percentUsed = usage.credits_total
    ? Math.round((usage.credits_used / usage.credits_total) * 100)
    : 0;
  body.innerHTML = `
    <p>Plan: <strong>${usage.plan}</strong></p>
    <p>Credits remaining: <strong>${usage.credits_remaining.toLocaleString()}</strong> of ${usage.credits_total.toLocaleString()} (${percentUsed}% used)</p>
    <p>Cost per heatmap call: ${usage.cost_per_heatmap_call} credits, per env params call: ${usage.cost_per_env_params_call} credits</p>
    <p>Key expiry: ${usage.key_expiry}</p>
  `;
}

async function loadDashboard() {
  renderLegend();
  setupFilter();

  try {
    const status = await fetchJson("/api/status");
    setBadge(status.demoMode ? "Demo mode" : "Live mode", true);
  } catch (err) {
    setBadge("Status unavailable", false);
  }

  try {
    const heatmap = await fetchJson("/api/heatmap");
    renderHeatGrid(heatmap.tiles);
  } catch (err) {
    document.getElementById("heatGrid").textContent = "Could not load the heat map.";
  }

  try {
    const alertsResponse = await fetchJson("/api/alerts");
    allAlerts = alertsResponse.alerts;
    renderSummary(alertsResponse.summary, alertsResponse.source, alertsResponse.measuredAt);
    renderRecommendations(alertsResponse.summary.recommendations);
    renderTable(allAlerts);
  } catch (err) {
    document.getElementById("summaryHeadline").textContent = "Could not load alerts.";
  }

  try {
    const usage = await fetchJson("/api/usage");
    renderUsage(usage);
  } catch (err) {
    document.getElementById("usageBody").textContent = "Could not load usage data.";
  }
}

loadDashboard();
