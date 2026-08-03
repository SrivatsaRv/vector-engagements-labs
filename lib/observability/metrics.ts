type Labels = Record<string, string | number | boolean>;

type HistogramState = {
  buckets: number[];
  counts: number[];
  count: number;
  sum: number;
};

type Registry = {
  counters: Map<string, number>;
  gauges: Map<string, number>;
  histograms: Map<string, HistogramState>;
};

const registryKey = "__vector_metrics_registry__";
const runtime = globalThis as typeof globalThis & { [registryKey]?: Registry };
const registry = runtime[registryKey] ?? {
  counters: new Map<string, number>(),
  gauges: new Map<string, number>(),
  histograms: new Map<string, HistogramState>(),
};
runtime[registryKey] = registry;

const definitions: Record<string, { help: string; type: "counter" | "gauge" | "histogram" }> = {
  vector_http_requests_total: { help: "HTTP requests handled by VECTOR", type: "counter" },
  vector_http_request_duration_seconds: { help: "VECTOR HTTP request duration", type: "histogram" },
  vector_database_operations_total: { help: "PostgreSQL operations attempted by VECTOR", type: "counter" },
  vector_database_operation_duration_seconds: { help: "PostgreSQL operation duration", type: "histogram" },
  vector_scenario_runs_started_total: { help: "Browser scenario runs started", type: "counter" },
  vector_scenario_runs_completed_total: { help: "Browser scenario runs completed", type: "counter" },
  vector_scenario_runs_failed_total: { help: "Browser scenario runs that failed", type: "counter" },
  vector_scenario_runs_active: { help: "Browser scenario runs currently executing", type: "gauge" },
  vector_scenario_run_duration_seconds: { help: "Browser wall time used to compute a scenario", type: "histogram" },
  vector_scenario_model_duration_seconds: { help: "Model time represented by a scenario run", type: "histogram" },
  vector_scenario_entity_count: { help: "Entities declared in computed scenario runs", type: "histogram" },
  vector_reports_total: { help: "Saved report operations", type: "counter" },
  vector_map_loads_total: { help: "Map initialization outcomes", type: "counter" },
  vector_browser_long_task_duration_seconds: { help: "Browser main-thread long task duration", type: "histogram" },
  vector_browser_navigation_duration_seconds: { help: "Browser navigation duration", type: "histogram" },
  vector_telemetry_events_rejected_total: { help: "Rejected browser telemetry events", type: "counter" },
};

const defaultBuckets = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

function normalizedLabels(labels: Labels = {}) {
  return Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => [name, String(value)] as const);
}

function metricKey(name: string, labels: Labels = {}) {
  return `${name}|${JSON.stringify(normalizedLabels(labels))}`;
}

function splitKey(key: string) {
  const separator = key.indexOf("|");
  return {
    name: key.slice(0, separator),
    labels: JSON.parse(key.slice(separator + 1)) as Array<[string, string]>,
  };
}

function escapeLabel(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"');
}

function labelText(labels: Array<[string, string]>, extra?: [string, string]) {
  const values = extra ? [...labels, extra] : labels;
  if (values.length === 0) return "";
  return `{${values.map(([name, value]) => `${name}="${escapeLabel(value)}"`).join(",")}}`;
}

export function incrementCounter(name: string, labels: Labels = {}, amount = 1) {
  const key = metricKey(name, labels);
  registry.counters.set(key, (registry.counters.get(key) ?? 0) + amount);
}

export function setGauge(name: string, value: number, labels: Labels = {}) {
  registry.gauges.set(metricKey(name, labels), value);
}

export function addGauge(name: string, amount: number, labels: Labels = {}) {
  const key = metricKey(name, labels);
  registry.gauges.set(key, Math.max(0, (registry.gauges.get(key) ?? 0) + amount));
}

export function observeHistogram(
  name: string,
  value: number,
  labels: Labels = {},
  buckets = defaultBuckets,
) {
  if (!Number.isFinite(value) || value < 0) return;
  const key = metricKey(name, labels);
  const state = registry.histograms.get(key) ?? {
    buckets,
    counts: buckets.map(() => 0),
    count: 0,
    sum: 0,
  };
  state.count += 1;
  state.sum += value;
  state.buckets.forEach((bucket, index) => {
    if (value <= bucket) state.counts[index] += 1;
  });
  registry.histograms.set(key, state);
}

export function prometheusMetrics() {
  const lines: string[] = [];
  for (const [name, definition] of Object.entries(definitions)) {
    lines.push(`# HELP ${name} ${definition.help}`);
    lines.push(`# TYPE ${name} ${definition.type}`);
    if (definition.type === "counter") {
      for (const [key, value] of registry.counters) {
        const parsed = splitKey(key);
        if (parsed.name === name) lines.push(`${name}${labelText(parsed.labels)} ${value}`);
      }
    } else if (definition.type === "gauge") {
      for (const [key, value] of registry.gauges) {
        const parsed = splitKey(key);
        if (parsed.name === name) lines.push(`${name}${labelText(parsed.labels)} ${value}`);
      }
    } else {
      for (const [key, state] of registry.histograms) {
        const parsed = splitKey(key);
        if (parsed.name !== name) continue;
        state.buckets.forEach((bucket, index) => {
          lines.push(`${name}_bucket${labelText(parsed.labels, ["le", String(bucket)])} ${state.counts[index]}`);
        });
        lines.push(`${name}_bucket${labelText(parsed.labels, ["le", "+Inf"])} ${state.count}`);
        lines.push(`${name}_sum${labelText(parsed.labels)} ${state.sum}`);
        lines.push(`${name}_count${labelText(parsed.labels)} ${state.count}`);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}
