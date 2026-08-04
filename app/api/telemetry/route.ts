import { incrementCounter, observeHistogram } from "@/lib/observability/metrics";
import { withObservedRoute } from "@/lib/observability/server";
import { publicApiError, PublicApiError, readBoundedJson } from "@/lib/security/public-api";
import { enforceRateLimit } from "@/lib/security/runtime";

const MAX_TELEMETRY_BYTES = 2 * 1024;

function duration(value: unknown, maximumMs: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximumMs) {
    throw new PublicApiError(400, "invalid_duration");
  }
  return value;
}

export async function POST(request: Request) {
  return withObservedRoute("/api/telemetry", request, async () => {
    try {
      await enforceRateLimit(request, "PUBLIC_API_RATE_LIMITER");
      const raw = await readBoundedJson(request, MAX_TELEMETRY_BYTES);
      if (!raw || typeof raw !== "object") throw new PublicApiError(400, "invalid_telemetry_event");
      const payload = raw as Record<string, unknown>;
      if (payload.type === "map_loaded" || payload.type === "map_failed") {
        const basemap = payload.basemap === "MINIMAL" ? "minimal" : "unknown";
        incrementCounter("vector_map_loads_total", {
          basemap,
          outcome: payload.type === "map_loaded" ? "loaded" : "failed",
        });
      } else if (payload.type === "browser_long_task") {
        observeHistogram(
          "vector_browser_long_task_duration_seconds",
          duration(payload.durationMs, 60_000) / 1000,
          {},
          [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
        );
      } else if (payload.type === "browser_navigation") {
        observeHistogram(
          "vector_browser_navigation_duration_seconds",
          duration(payload.durationMs, 300_000) / 1000,
        );
      } else {
        incrementCounter("vector_telemetry_events_rejected_total", { reason: "unsupported_type" });
        throw new PublicApiError(400, "unsupported_telemetry_event");
      }
      return new Response(null, { status: 204 });
    } catch (error) {
      return publicApiError(error, 503);
    }
  });
}
