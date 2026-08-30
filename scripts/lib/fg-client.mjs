// Minimal FortyGuard Temperature API client, used by the verification scripts only.
//
// This is deliberately NOT the client the app runs on — that is `client.js`, which
// adds demo-mode fallback, sample data and tile merging. This one stays raw and
// dependency-free so a verification run reports exactly what the API returned,
// with nothing smoothing it over.
//
// Base URL, header name, payload shapes and status lifecycle all follow
// https://docs-api.fortyguard.com/docs/ (create-heatmap, environmental-parameters, check-status).

export const BASE_URL = "https://api.fortyguard.com";

export class FgError extends Error {
  constructor(message, { status, body, url }) {
    super(message);
    this.name = "FgError";
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

function requireKey(apiKey) {
  if (!apiKey) throw new Error("Missing API key. Set FG_API_KEY in .env");
  return apiKey;
}

async function request(path, { method = "POST", apiKey, body, useHeaderAuth = true } = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { "Content-Type": "application/json" };
  // Every documented endpoint authenticates with the `api-key` header. The two
  // /v1/system/* usage endpoints are the exception: they take the key in the body.
  if (useHeaderAuth) headers["api-key"] = requireKey(apiKey);

  const started = Date.now();
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { ok: res.ok, status: res.status, json, elapsedMs: Date.now() - started, url };
}

/**
 * Normalise an area of interest into the FeatureCollection the API expects.
 * Accepts either a bare coordinate ring or an entry from `aoi.json`, which is
 * already stored as a FeatureCollection.
 */
export function featureCollection(aoi) {
  if (aoi && aoi.type === "FeatureCollection") return aoi;
  const ring = Array.isArray(aoi) ? aoi : aoi?.ring;
  if (!Array.isArray(ring)) throw new Error("AOI must be a coordinate ring or a FeatureCollection");
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [ring] },
      },
    ],
  };
}

/** Centroid [lat, lon] of an AOI, for the point-based env_params call. */
export function centroidOf(aoi) {
  const fc = featureCollection(aoi);
  const ring = fc.features[0].geometry.coordinates[0];
  const pts = ring.slice(0, -1); // the closing point repeats the first
  const lon = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return [lat, lon];
}

/**
 * POST /v1/heatmap — returns { activity_id } under `data`.
 * filter_type: 1 Single Hour, 2 Range of Hours (same day, <= 23h), 3 Single Day, 4 Range of Days (<= 1 month).
 * analytic_type: tcm (default, degC per tile) | time_of_measure | exceedance | persistence.
 */
export function submitHeatmap(apiKey, { aoi, ring, dateTime, granularity = 100, analyticType, threshold, direction }) {
  const body = {
    polygon_aoi: featureCollection(aoi ?? ring),
    date_time: dateTime,
    granularity,
  };
  if (analyticType) body.analytic_type = analyticType;
  if (threshold !== undefined) body.threshold = threshold;
  if (direction) body.direction = direction;
  return request("/v1/heatmap", { apiKey, body });
}

/**
 * POST /v1/env_params — point query. `temperature` is the value you already got
 * from the heatmap for this location. `analysis` picks which parameters come back;
 * API Basic and API Startup are capped at 3 per request.
 */
export function submitEnvParams(apiKey, { latitude, longitude, temperature, dateTime, analysis }) {
  const body = { latitude, longitude, temperature, date_time: dateTime };
  if (analysis) body.analysis = analysis;
  return request("/v1/env_params", { apiKey, body });
}

/** GET /v1/status/{activity_id} — data.status is Processing | Completed | Failed. */
export function getStatus(apiKey, activityId) {
  return request(`/v1/status/${activityId}`, { method: "GET", apiKey });
}

/** POST /v1/system/fetch-api-key-usage — plan, credit balance, per-activity breakdown. Key goes in the body. */
export function fetchUsage(apiKey) {
  return request("/v1/system/fetch-api-key-usage", {
    body: { api_key: requireKey(apiKey) },
    useHeaderAuth: false,
  });
}

/**
 * Poll until terminal. Docs recommend 5s intervals; the default 2-minute ceiling
 * matches the coordination plan. Returns the final status response plus timing.
 */
export async function pollUntilDone(apiKey, activityId, { intervalMs = 5000, timeoutMs = 120000 } = {}) {
  const started = Date.now();
  let polls = 0;
  for (;;) {
    const res = await getStatus(apiKey, activityId);
    polls += 1;
    const status = res.json?.data?.status;
    if (status === "Completed" || status === "Failed") {
      return { ...res, status, polls, waitedMs: Date.now() - started };
    }
    if (!res.ok && res.status !== 404) {
      // 404 right after submit is expected — the activity may not be registered yet.
      return { ...res, status: status ?? `http_${res.status}`, polls, waitedMs: Date.now() - started };
    }
    if (Date.now() - started > timeoutMs) {
      return { ...res, status: "TimedOut", polls, waitedMs: Date.now() - started };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
