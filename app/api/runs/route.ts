import { withDatabase } from "@/db";
import { sha256Hex } from "@/lib/canonical-json";
import { ENGINE_VERSION } from "@/lib/engine/version";
import { incrementCounter } from "@/lib/observability/metrics";
import { withObservedRoute } from "@/lib/observability/server";

type SavedRunRow = {
  id: string;
  scenario_id: string;
  scenario_version: string;
  engine_version: string;
  scenario_schema_version: string;
  scenario_content_hash: string;
  compiled_scenario: Record<string, unknown>;
  frame_hash: string;
  draft_revision: number;
  blue_force: Record<string, unknown>;
  red_force: Record<string, unknown>;
  initial_state: Record<string, unknown>;
  environment: Record<string, unknown>;
  study_area_id: string | null;
  spatial_context: Record<string, unknown> | null;
  model_assumptions: Record<string, unknown>;
  created_at: string | Date;
};

function serializeRun(row: SavedRunRow) {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    scenarioVersion: row.scenario_version,
    engineVersion: row.engine_version,
    scenarioSchemaVersion: row.scenario_schema_version,
    scenarioContentHash: row.scenario_content_hash,
    compiledScenario: row.compiled_scenario,
    frameHash: row.frame_hash,
    draftRevision: row.draft_revision,
    blueForce: row.blue_force,
    redForce: row.red_force,
    initialState: row.initial_state,
    environment: row.environment,
    studyAreaId: row.study_area_id,
    spatialContext: row.spatial_context,
    modelAssumptions: row.model_assumptions,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
  };
}

export async function GET(request: Request) {
 return withObservedRoute("/api/runs", request, async () => {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return Response.json(
        { error: "A saved run id is required" },
        { status: 400 },
      );
    }
    const rows = await withDatabase((sql) =>
      sql`SELECT * FROM saved_run_snapshots WHERE id = ${id} LIMIT 1`,
    );
    if (!rows[0]) return Response.json({ error: "Run not found" }, { status: 404 });
    return Response.json({ run: serializeRun(rows[0] as unknown as SavedRunRow) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Run unavailable" },
      { status: 503 },
    );
   }
 });
}

export async function POST(request: Request) {
 return withObservedRoute("/api/runs", request, async () => {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    if (typeof payload.scenarioId !== "string" || typeof payload.scenarioVersion !== "string") {
      return Response.json(
        { error: "scenarioId and scenarioVersion are required" },
        { status: 400 },
      );
    }
    const assumptions = payload.modelAssumptions as
      | { report?: { result?: { frames?: unknown[] }; createdAt?: string } }
      | undefined;
    if (
      !assumptions?.report ||
      !Array.isArray(assumptions.report.result?.frames) ||
      assumptions.report.result.frames.length === 0 ||
      typeof assumptions.report.createdAt !== "string"
    ) {
      return Response.json(
        { error: "A completed run report with recorded frames is required" },
        { status: 400 },
      );
    }
    if (
      typeof payload.scenarioSchemaVersion !== "string" ||
      typeof payload.scenarioContentHash !== "string" ||
      typeof payload.frameHash !== "string" ||
      typeof payload.draftRevision !== "number" ||
      !payload.compiledScenario ||
      typeof payload.compiledScenario !== "object"
    ) {
      return Response.json(
        { error: "Versioned scenario package provenance is required" },
        { status: 400 },
      );
    }
    const templateRows = await withDatabase((sql) => sql`
      SELECT schema_version, content_hash, engine_version, study_area_id
      FROM scenario_templates
      WHERE id = ${payload.scenarioId as string}
        AND version = ${payload.scenarioVersion as string}
        AND status = 'VALIDATED'
      LIMIT 1
    `);
    const template = templateRows[0] as
      | { schema_version: string; content_hash: string; engine_version: string; study_area_id: string }
      | undefined;
    if (
      !template ||
      template.schema_version !== payload.scenarioSchemaVersion ||
      template.content_hash !== payload.scenarioContentHash
    ) {
      return Response.json(
        { error: "Scenario package identity does not match the validated template" },
        { status: 409 },
      );
    }
    const id = crypto.randomUUID();
    const engineVersion = typeof payload.engineVersion === "string"
      ? payload.engineVersion
      : ENGINE_VERSION;
    if (engineVersion !== template.engine_version || engineVersion !== ENGINE_VERSION) {
      return Response.json(
        { error: "Engine version is incompatible with the scenario package" },
        { status: 409 },
      );
    }
    const serverFrameHash = await sha256Hex(assumptions.report.result?.frames ?? []);
    if (serverFrameHash !== payload.frameHash) {
      return Response.json(
        { error: "Recorded telemetry hash does not match the submitted frames" },
        { status: 409 },
      );
    }
    const initialState = (payload.initialState ?? {}) as Record<string, unknown>;
    if (typeof initialState.studyAreaId !== "string") {
      return Response.json(
        { error: "A PostGIS study area is required" },
        { status: 400 },
      );
    }
    const studyAreaId = initialState.studyAreaId;
    const compiledEnvironment = (
      payload.compiledScenario as { environment?: { studyArea?: unknown } }
    ).environment;
    const rows = await withDatabase((sql) => sql`
      INSERT INTO saved_run_snapshots
        (id,scenario_id,scenario_version,engine_version,scenario_schema_version,
         scenario_content_hash,compiled_scenario,frame_hash,draft_revision,
         blue_force,red_force,initial_state,environment,model_assumptions,
         study_area_id,spatial_context)
      VALUES
        (${id},${payload.scenarioId as string},${payload.scenarioVersion as string},${engineVersion},
         ${payload.scenarioSchemaVersion as string},${payload.scenarioContentHash as string},
         ${sql.json(payload.compiledScenario as never)},${payload.frameHash as string},
         ${payload.draftRevision as number},
         ${sql.json((payload.blueForce ?? {}) as never)},${sql.json((payload.redForce ?? {}) as never)},
         ${sql.json((payload.initialState ?? {}) as never)},${sql.json((payload.environment ?? {}) as never)},
         ${sql.json(assumptions as never)},${studyAreaId},
         ${sql.json((compiledEnvironment?.studyArea ?? {}) as never)})
      RETURNING id, created_at
    `);
    const domain = (payload.scenarioId as string).split("-")[0]?.toUpperCase();
    incrementCounter("vector_reports_total", {
      domain: ["A2A", "A2G", "G2A", "G2G"].includes(domain) ? domain : "unknown",
      outcome: "saved",
    });
    return Response.json(rows[0], { status: 201 });
  } catch (error) {
    incrementCounter("vector_reports_total", { domain: "unknown", outcome: "failed" });
    return Response.json(
      { error: error instanceof Error ? error.message : "Run could not be saved" },
      { status: 503 },
    );
   }
 });
}
