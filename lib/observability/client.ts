export type BrowserTelemetryEvent =
  | { type: "map_loaded" | "map_failed"; basemap: string; durationMs: number }
  | { type: "browser_long_task"; durationMs: number }
  | { type: "browser_navigation"; durationMs: number };

let telemetryQueue = Promise.resolve();

export function emitBrowserTelemetry(event: BrowserTelemetryEvent) {
  const payload = JSON.stringify(event);
  // Preserve browser performance-event ordering without blocking interaction.
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
