import { CATALOG_SCHEMA_VERSION } from "@/db/bootstrap";
import { withDatabase } from "@/db";
import { withObservedRoute } from "@/lib/observability/server";
import { publicApiError } from "@/lib/security/public-api";
import { enforceRateLimit } from "@/lib/security/runtime";

const CATALOG_TTL_MS = 5 * 60 * 1000;
let catalogCache: { expiresAt: number; value: Record<string, unknown> } | undefined;
let catalogLoad: Promise<Record<string, unknown>> | undefined;

async function loadCatalog() {
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.value;
  catalogLoad ??= withDatabase(async (sql) => {
    const [platforms, weapons, subsystems, sources, compatibility, assertions, simulationModels, installations, studyAreas, scenarioTemplates] = await Promise.all([
      sql`SELECT * FROM platform_variants ORDER BY service, display_name`,
      sql`SELECT * FROM weapons ORDER BY category, display_name`,
      sql`SELECT * FROM subsystems ORDER BY kind, designation`,
      sql`SELECT * FROM sources ORDER BY publisher, title`,
      sql`SELECT * FROM platform_weapon_compatibility ORDER BY platform_id, weapon_id`,
      sql`SELECT * FROM source_assertions ORDER BY entity_type, entity_id, field_path`,
      sql`SELECT * FROM simulation_models ORDER BY weapon_id, version`,
      sql`SELECT id, service, name, icao_code, elevation_ft, runway_info, installation_type, ST_X(location) AS longitude, ST_Y(location) AS latitude, public_reference, source_id FROM installations ORDER BY service, name`,
      sql`SELECT id, name, short_name, description, terrain_class, surface_elevation_m, ST_X(anchor) AS anchor_longitude, ST_Y(anchor) AS anchor_latitude, ST_AsGeoJSON(boundary)::json AS boundary, environment_presets, default_environment_preset_id, source_class FROM study_areas ORDER BY name`,
      sql`SELECT id, version, domain, title, status, package, schema_version, content_hash, engine_version FROM scenario_templates WHERE status = 'VALIDATED' ORDER BY domain, title`,
    ]);
    return { platforms, weapons, subsystems, sources, compatibility, assertions, simulationModels, installations, studyAreas, scenarioTemplates };
  }).then((value) => {
    catalogCache = { expiresAt: Date.now() + CATALOG_TTL_MS, value };
    return value;
  }).finally(() => { catalogLoad = undefined; });
  return catalogLoad;
}

export async function GET(request: Request) {
  return withObservedRoute("/api/catalog", request, async () => {
   try {
    await enforceRateLimit(request, "PUBLIC_API_RATE_LIMITER");
    const catalog = await loadCatalog();
    return Response.json({
      schema: CATALOG_SCHEMA_VERSION,
      state: "POSTGIS",
      ...catalog,
    }, { headers: { "cache-control": "public, max-age=300, s-maxage=3600" } });
  } catch (error) {
    return publicApiError(error, 503);
    }
  });
}
