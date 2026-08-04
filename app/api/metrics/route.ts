import { prometheusMetrics } from "@/lib/observability/metrics";
import { bearerToken, isLocalRequest, timingSafeEqual } from "@/lib/security/public-api";
import { runtimeSecret } from "@/lib/security/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const expected = await runtimeSecret("METRICS_BEARER_TOKEN");
  if (!isLocalRequest(request) && (!expected || !timingSafeEqual(bearerToken(request), expected))) {
    return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  }
  return new Response(prometheusMetrics(), {
    headers: {
      "content-type": "text/plain; version=0.0.4; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
