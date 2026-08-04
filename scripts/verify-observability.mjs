import assert from "node:assert/strict";

const vectorUrl = process.env.VECTOR_URL ?? "http://127.0.0.1:4317";
const prometheusUrl = process.env.PROMETHEUS_URL ?? "http://127.0.0.1:9090";
const tempoUrl = process.env.TEMPO_URL ?? "http://127.0.0.1:3200";
const lokiUrl = process.env.LOKI_URL ?? "http://127.0.0.1:3100";
const grafanaUrl = process.env.GRAFANA_URL ?? "http://127.0.0.1:4300";
const grafanaAuthorization = `Basic ${Buffer.from(`vector:${process.env.VECTOR_GRAFANA_PASSWORD ?? "vector-local-only"}`).toString("base64")}`;

async function waitFor(url, predicate = (response) => response.ok) {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (predicate(response)) return response;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw lastError ?? new Error(`${url} did not become ready`);
}

await Promise.all([
  waitFor(`${vectorUrl}/api/health`),
  waitFor(`${prometheusUrl}/-/ready`),
  waitFor(`${tempoUrl}/ready`),
  waitFor(`${lokiUrl}/ready`),
  waitFor(`${grafanaUrl}/api/health`),
]);

for (const event of [
  { type: "map_loaded", basemap: "MINIMAL", durationMs: 84 },
  { type: "browser_long_task", durationMs: 72 },
  { type: "browser_navigation", durationMs: 135 },
]) {
  const response = await fetch(`${vectorUrl}/api/telemetry`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
  assert.equal(response.status, 204);
}

const rejected = await fetch(`${vectorUrl}/api/telemetry`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ type: "unbounded_custom_event" }),
});
assert.equal(rejected.status, 400);

await new Promise((resolve) => setTimeout(resolve, 7000));

const targets = await fetch(`${prometheusUrl}/api/v1/targets`).then((response) => response.json());
const vectorTarget = targets.data.activeTargets.find((target) => target.labels.job === "vector-web");
assert.equal(vectorTarget?.health, "up");

const query = async (expression) =>
  fetch(`${prometheusUrl}/api/v1/query?query=${encodeURIComponent(expression)}`).then((response) => response.json());
const routeRequests = await query('sum(vector_http_requests_total{route="/api/telemetry"})');
assert.ok(Number(routeRequests.data.result[0]?.value[1]) >= 2);
const databaseOperations = await query("sum(vector_database_operations_total)");
assert.ok(Number(databaseOperations.data.result[0]?.value[1]) >= 1);
const mapLoads = await query('sum(vector_map_loads_total{outcome="loaded"})');
assert.ok(Number(mapLoads.data.result[0]?.value[1]) >= 1);
const longTasks = await query("sum(vector_browser_long_task_duration_seconds_count)");
assert.ok(Number(longTasks.data.result[0]?.value[1]) >= 1);
const navigations = await query("sum(vector_browser_navigation_duration_seconds_count)");
assert.ok(Number(navigations.data.result[0]?.value[1]) >= 1);

const dashboardsResponse = await fetch(`${grafanaUrl}/api/search?type=dash-db`, {
  headers: { authorization: grafanaAuthorization },
});
assert.equal(dashboardsResponse.status, 200, "Grafana credentials must permit dashboard verification");
const dashboards = await dashboardsResponse.json();
assert.ok(Array.isArray(dashboards), "Grafana dashboard search must return an array");
const dashboardUids = new Set(dashboards.map((dashboard) => dashboard.uid));
assert.ok(dashboardUids.has("vector-operations"));
assert.ok(dashboardUids.has("vector-browser-performance"));

const operationsDashboard = await fetch(`${grafanaUrl}/api/dashboards/uid/vector-operations`, {
  headers: { authorization: grafanaAuthorization },
}).then((response) => response.json());
const operationPanelTitles = new Set(
  operationsDashboard.dashboard.panels.map((panel) => panel.title),
);
assert.ok(operationPanelTitles.has("Runs missing a completion event · 15m"));
assert.ok(operationPanelTitles.has("Browser runs slower than 250 ms · 1h"));
assert.ok(operationPanelTitles.has("Mean declared entities per run"));

const browserDashboard = await fetch(`${grafanaUrl}/api/dashboards/uid/vector-browser-performance`, {
  headers: { authorization: grafanaAuthorization },
}).then((response) => response.json());
const browserPanelTitles = new Set(
  browserDashboard.dashboard.panels.map((panel) => panel.title),
);
assert.ok(browserPanelTitles.has("Browser responsiveness"));
assert.ok(browserPanelTitles.has("Map and telemetry outcomes"));

const datasources = await fetch(`${grafanaUrl}/api/datasources`, {
  headers: { authorization: grafanaAuthorization },
}).then((response) => response.json());
assert.deepEqual(
  new Set(datasources.map((datasource) => datasource.uid)),
  new Set(["prometheus", "tempo", "loki"]),
);

const traces = await fetch(`${tempoUrl}/api/search?limit=20`).then((response) => response.json());
assert.ok(Array.isArray(traces.traces));
assert.ok(traces.traces.length >= 1, "expected at least one VECTOR API trace in Tempo");

process.stdout.write("VECTOR observability stack, metrics, traces, and Grafana dashboards verified\n");
