export type BrowserTelemetryEvent =
  | {
      type: "scenario_run_started";
      runId: string;
      domain: string;
      engineVersion: string;
    }
  | {
      type: "scenario_run_completed" | "scenario_run_failed";
      runId: string;
      domain: string;
      engineVersion: string;
      outcome: string;
      durationMs: number;
      modelSeconds: number;
      entityCount: number;
    }
  | { type: "report_saved" | "report_failed"; domain: string }
  | { type: "map_loaded" | "map_failed"; basemap: string; durationMs: number }
  | { type: "browser_long_task"; durationMs: number }
  | { type: "browser_navigation"; durationMs: number };

export function emitBrowserTelemetry(event: BrowserTelemetryEvent) {
  const payload = JSON.stringify(event);
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/telemetry", new Blob([payload], { type: "application/json" }));
    return;
  }
  void fetch("/api/telemetry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
  });
}
