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

let telemetryQueue = Promise.resolve();

export function emitBrowserTelemetry(event: BrowserTelemetryEvent) {
  const payload = JSON.stringify(event);
  // Preserve start → completion ordering. A pair of independent sendBeacon
  // calls can be observed in reverse order, leaving an active-run gauge stale.
  telemetryQueue = telemetryQueue
    .catch(() => undefined)
    .then(async () => {
      await fetch("/api/telemetry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        keepalive: true,
      });
    })
    .catch(() => undefined);
}
