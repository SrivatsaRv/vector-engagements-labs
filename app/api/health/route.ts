import { withDatabase } from "@/db";
import { withObservedRoute } from "@/lib/observability/server";
import { publicApiError } from "@/lib/security/public-api";
import { publicApiAdmissionStatus } from "@/lib/security/runtime";

export async function GET(request: Request) {
  return withObservedRoute("/api/health", request, async () => {
   try {
    const rows = await withDatabase((sql) => sql`
      SELECT current_database() AS database,
        postgis_version() AS postgis,
        (SELECT count(*)::int FROM platform_variants) AS platforms,
        (SELECT count(*)::int FROM weapons) AS weapons,
        (SELECT count(*)::int FROM simulation_models) AS models,
        (SELECT count(*)::int FROM installations) AS installations,
        (SELECT count(*)::int FROM scenario_templates WHERE status='VALIDATED') AS scenarios
    `);
    if (!rows[0]) throw new Error("readiness query returned no row");
    return Response.json({
      status: "ready",
      publicApiAdmission: await publicApiAdmissionStatus(),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return publicApiError(error, 503);
    }
  });
}
