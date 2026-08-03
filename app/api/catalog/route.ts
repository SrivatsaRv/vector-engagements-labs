import { CATALOG_SCHEMA_VERSION } from "@/db/bootstrap";
import { withDatabase } from "@/db";
import { withObservedRoute } from "@/lib/observability/server";

export async function GET(request: Request) {
  return withObservedRoute("/api/catalog", request, async () => {
   try {
    const catalog = await withDatabase(async (sql) => {
      const [
        platforms,
        weapons,
        subsystems,
        sources,
        compatibility,
        assertions,
        simulationModels,
        installations,
        studyAreas,
        scenarioTemplates,
      ] = await Promise.all([
        sql`SELECT * FROM platform_variants ORDER BY service, display_name`,
        sql`SELECT * FROM weapons ORDER BY category, display_name`,
        sql`SELECT * FROM subsystems ORDER BY kind, designation`,
        sql`SELECT * FROM sources ORDER BY publisher, title`,
        sql`SELECT * FROM platform_weapon_compatibility ORDER BY platform_id, weapon_id`,
        sql`SELECT * FROM source_assertions ORDER BY entity_type, entity_id, field_path`,
        sql`SELECT * FROM simulation_models ORDER BY weapon_id, version`,
        sql`SELECT id, service, name, installation_type,
              ST_X(location) AS longitude, ST_Y(location) AS latitude,
              public_reference, source_id
            FROM installations ORDER BY service, name`,
        sql`SELECT id, name, short_name, description, terrain_class,
              surface_elevation_m,
              ST_X(anchor) AS anchor_longitude,
              ST_Y(anchor) AS anchor_latitude,
              ST_AsGeoJSON(boundary)::json AS boundary,
              environment_presets, default_environment_preset_id, source_class
            FROM study_areas ORDER BY name`,
        sql`SELECT id, version, domain, title, status, package,
              schema_version, content_hash, engine_version
            FROM scenario_templates WHERE status = 'VALIDATED'
            ORDER BY domain, title`,
      ]);
      return {
        platforms,
        weapons,
        subsystems,
        sources,
        compatibility,
        assertions,
        simulationModels,
        installations,
        studyAreas,
        scenarioTemplates,
      };
    });
    return Response.json({
      schema: CATALOG_SCHEMA_VERSION,
      state: "POSTGIS",
      ...catalog,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Catalog unavailable" },
      { status: 503 },
    );
    }
  });
}
