import { withDatabase } from "@/db";
import { withObservedRoute } from "@/lib/observability/server";

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
    return Response.json({ status: "ready", ...rows[0] });
  } catch (error) {
    return Response.json(
      { status: "unavailable", error: error instanceof Error ? error.message : "Database unavailable" },
      { status: 503 },
    );
    }
  });
}
