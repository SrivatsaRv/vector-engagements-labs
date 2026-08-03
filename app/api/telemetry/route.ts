import {
  addGauge,
  incrementCounter,
  observeHistogram,
} from "@/lib/observability/metrics";
import { withObservedRoute } from "@/lib/observability/server";

const domains = new Set(["A2A", "A2G", "G2A", "G2G"]);
const outcomes = new Set(["intercept", "threshold_reached", "energy_depleted", "time_limit", "invalid_scenario", "unknown"]);

function bounded(value: unknown, allowed: Set<string>, fallback = "unknown") {
  return typeof value === "string" && allowed.has(value) ? value : fallback;
}

export async function POST(request: Request) {
  return withObservedRoute("/api/telemetry", request, async () => {
    const payload = (await request.json()) as Record<string, unknown>;
    const type = typeof payload.type === "string" ? payload.type : "";
    const domain = bounded(payload.domain, domains);
    const engineVersion = typeof payload.engineVersion === "string"
      ? payload.engineVersion.slice(0, 64)
      : "unknown";
    if (type === "scenario_run_started") {
      incrementCounter("vector_scenario_runs_started_total", { domain, engine_version: engineVersion });
      addGauge("vector_scenario_runs_active", 1, { domain });
    } else if (type === "scenario_run_completed" || type === "scenario_run_failed") {
      const outcome = bounded(payload.outcome, outcomes);
      incrementCounter(
        type === "scenario_run_completed"
          ? "vector_scenario_runs_completed_total"
          : "vector_scenario_runs_failed_total",
        { domain, outcome, engine_version: engineVersion },
      );
      addGauge("vector_scenario_runs_active", -1, { domain });
      observeHistogram("vector_scenario_run_duration_seconds", Number(payload.durationMs) / 1000, { domain, outcome });
      observeHistogram("vector_scenario_model_duration_seconds", Number(payload.modelSeconds), { domain, outcome }, [1, 5, 10, 30, 60, 120, 240, 600]);
      observeHistogram("vector_scenario_entity_count", Number(payload.entityCount), { domain }, [1, 2, 4, 8, 16, 32, 64, 128, 256]);
    } else if (type === "report_saved" || type === "report_failed") {
      incrementCounter("vector_reports_total", { domain, outcome: type === "report_saved" ? "saved" : "failed" });
    } else if (type === "map_loaded" || type === "map_failed") {
      const basemap = payload.basemap === "MINIMAL" ? "minimal" : "unknown";
      incrementCounter("vector_map_loads_total", { basemap, outcome: type === "map_loaded" ? "loaded" : "failed" });
    } else if (type === "browser_long_task") {
      observeHistogram("vector_browser_long_task_duration_seconds", Number(payload.durationMs) / 1000, {}, [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]);
    } else if (type === "browser_navigation") {
      observeHistogram("vector_browser_navigation_duration_seconds", Number(payload.durationMs) / 1000);
    } else {
      incrementCounter("vector_telemetry_events_rejected_total", { reason: "unsupported_type" });
      return Response.json({ error: "Unsupported telemetry event" }, { status: 400 });
    }
    return new Response(null, { status: 204 });
  });
}
