import { withDatabase } from "@/db";
import { sha256Hex } from "@/lib/canonical-json";
import { ENGINE_VERSION } from "@/lib/engine/version";
import { addGauge, incrementCounter, observeHistogram } from "@/lib/observability/metrics";
import { withObservedRoute } from "@/lib/observability/server";
import { isScenarioDefinition } from "@/lib/scenario-package";
import { ScenarioDraftAdmissionError } from "@/lib/scenario-draft-admission";
import {
  publicApiError,
  PublicApiError,
  readBoundedJson,
  shortString,
} from "@/lib/security/public-api";
import { buildVerifiedSavedRun } from "@/lib/security/saved-run";
import { admitSavedRun, releaseSavedRunAdmission } from "@/lib/security/saved-run-admission";
import { enforceRateLimit } from "@/lib/security/runtime";

const MAX_SAVED_RUN_REQUEST_BYTES = 96 * 1024;

type SavedRunRow = {
  id: string;
  scenario_id: string;
  scenario_version: string;
  engine_version: string;
  intended_use_id: string;
  intended_use_version: string;
  model_pack_id: string;
  model_pack_version: string;
  model_pack_digest: string;
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
    intendedUse: { id: row.intended_use_id, version: row.intended_use_version },
    modelPack: { id: row.model_pack_id, version: row.model_pack_version, digest: row.model_pack_digest },
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
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export async function GET(request: Request) {
  return withObservedRoute("/api/runs", request, async () => {
    try {
      await enforceRateLimit(request, "PUBLIC_API_RATE_LIMITER");
      const id = new URL(request.url).searchParams.get("id");
      if (!id?.match(/^[0-9a-f-]{36}$/i)) throw new PublicApiError(400, "invalid_saved_run_id");
      const rows = await withDatabase((sql) =>
        sql`SELECT * FROM saved_run_snapshots WHERE id = ${id} LIMIT 1`,
      );
      if (!rows[0]) throw new PublicApiError(404, "saved_run_not_found");
      return Response.json({ run: serializeRun(rows[0] as unknown as SavedRunRow) }, {
        headers: { "cache-control": "private, no-store" },
      });
    } catch (error) {
      return publicApiError(error, 503);
    }
  });
}

export async function POST(request: Request) {
  return withObservedRoute("/api/runs", request, async () => {
    try {
      await enforceRateLimit(request, "PUBLIC_API_RATE_LIMITER");
      const raw = await readBoundedJson(request, MAX_SAVED_RUN_REQUEST_BYTES);
      if (!raw || typeof raw !== "object") throw new PublicApiError(400, "invalid_saved_run");
      const payload = raw as Record<string, unknown>;
      const scenarioId = shortString(payload.scenarioId, 120, "scenario_id");
      const scenarioVersion = shortString(payload.scenarioVersion, 40, "scenario_version");
      const schemaVersion = shortString(payload.scenarioSchemaVersion, 80, "scenario_schema_version");
      const contentHash = shortString(payload.scenarioContentHash, 64, "scenario_content_hash");
      if (!contentHash.match(/^[0-9a-f]{64}$/)) throw new PublicApiError(400, "invalid_scenario_content_hash");
      if (!Number.isSafeInteger(payload.draftRevision) || (payload.draftRevision as number) < 0) {
        throw new PublicApiError(400, "invalid_draft_revision");
      }

      const templateRows = await withDatabase((sql) => sql`
        SELECT schema_version, content_hash, engine_version, package,
               intended_use_id, intended_use_version,
               model_pack_id, model_pack_version, model_pack_digest
        FROM scenario_templates
        WHERE id = ${scenarioId}
          AND version = ${scenarioVersion}
          AND status = 'VALIDATED'
        LIMIT 1
      `);
      const template = templateRows[0] as
        | {
            schema_version: string;
            content_hash: string;
            engine_version: string;
            package: unknown;
            intended_use_id: string;
            intended_use_version: string;
            model_pack_id: string;
            model_pack_version: string;
            model_pack_digest: string;
          }
        | undefined;
      if (
        !template ||
        template.schema_version !== schemaVersion ||
        template.content_hash !== contentHash ||
        template.engine_version !== ENGINE_VERSION ||
        !isScenarioDefinition(template.package)
      ) {
        throw new PublicApiError(409, "scenario_package_mismatch");
      }
      if (
        template.intended_use_id !== template.package.intendedUse.id ||
        template.intended_use_version !== template.package.intendedUse.version ||
        template.model_pack_id !== template.package.modelPack.id ||
        template.model_pack_version !== template.package.modelPack.version ||
        template.model_pack_digest !== template.package.modelPack.digest
      ) {
        throw new PublicApiError(409, "scenario_model_governance_mismatch");
      }
      const templatePackage = template.package;

      const admission = await admitSavedRun(request);
      let snapshotPersisted = false;
      try {

        const simulationStarted = performance.now();
      incrementCounter("vector_scenario_runs_started_total", { domain: templatePackage.domain, engine_version: ENGINE_VERSION });
      addGauge("vector_scenario_runs_active", 1, { domain: templatePackage.domain });
      let verified;
      try {
        verified = await buildVerifiedSavedRun(payload.initialState, templatePackage, {
          schemaVersion,
          contentHash,
          draftRevision: payload.draftRevision as number,
          admission: payload.admission,
        });
        const outcome = verified.result.termination;
        incrementCounter("vector_scenario_runs_completed_total", { domain: templatePackage.domain, outcome, engine_version: ENGINE_VERSION });
        observeHistogram("vector_scenario_run_duration_seconds", (performance.now() - simulationStarted) / 1000, { domain: templatePackage.domain, outcome });
        observeHistogram("vector_scenario_model_duration_seconds", verified.result.timeOfFlight, { domain: templatePackage.domain, outcome }, [1, 5, 10, 30, 60, 120, 240, 600]);
        observeHistogram("vector_scenario_entity_count", verified.result.entityManifest.length, { domain: templatePackage.domain }, [1, 2, 4, 8, 16, 32, 64, 128, 256]);
      } catch (error) {
        incrementCounter("vector_scenario_runs_failed_total", { domain: templatePackage.domain, outcome: "invalid_scenario", engine_version: ENGINE_VERSION });
        throw error;
      } finally {
        addGauge("vector_scenario_runs_active", -1, { domain: templatePackage.domain });
      }
      const frameHash = await sha256Hex(verified.result.frames);
      verified.report.packageProvenance = {
        ...verified.report.packageProvenance!,
        frameHash,
      };
      const scenario = verified.scenario;
      const engineRun = verified.result.engineRun;
      const id = crypto.randomUUID();
      const rows = await withDatabase((sql) => sql`
        INSERT INTO saved_run_snapshots
          (id,scenario_id,scenario_version,engine_version,scenario_schema_version,
           intended_use_id,intended_use_version,model_pack_id,model_pack_version,model_pack_digest,
           scenario_content_hash,compiled_scenario,frame_hash,draft_revision,
           blue_force,red_force,initial_state,environment,model_assumptions,
           study_area_id,spatial_context)
        VALUES
          (${id},${scenarioId},${scenarioVersion},${ENGINE_VERSION},${schemaVersion},
           ${templatePackage.intendedUse.id},${templatePackage.intendedUse.version},
           ${templatePackage.modelPack.id},${templatePackage.modelPack.version},${templatePackage.modelPack.digest},${contentHash},
           ${sql.json(engineRun.scenario as never)},${frameHash},${payload.draftRevision as number},
           ${sql.json({ platformId: scenario.bluePlatformId, weaponId: scenario.blueSystemId, quantity: scenario.blueWeaponQuantity, fuelPercent: scenario.blueFuelPercent } as never)},
           ${sql.json({ platformId: scenario.redObjectId, weaponId: scenario.redSystemId, quantity: scenario.redWeaponQuantity, fuelPercent: scenario.redFuelPercent } as never)},
           ${sql.json(scenario as never)},
           ${sql.json({ studyAreaId: scenario.studyAreaId, weatherPresetId: scenario.weatherPresetId, windEastMps: scenario.wind, windNorthMps: scenario.windNorth, visibilityKm: scenario.visibilityKm, humidityPercent: scenario.humidityPercent, temperatureOffset: scenario.temperatureOffset } as never)},
           ${sql.json({ report: verified.report, verification: { source: "server-recomputed", engineVersion: ENGINE_VERSION } } as never)},
           ${scenario.studyAreaId},
           ${sql.json((engineRun.scenario.environment.studyArea ?? {}) as never)})
        RETURNING id, created_at
      `);
      snapshotPersisted = true;
      incrementCounter("vector_reports_total", { domain: scenario.domain, outcome: "saved" });
        return Response.json({
          ...(rows[0] as Record<string, unknown>),
          admission: verified.admission,
        }, { status: 201, headers: { "cache-control": "no-store" } });
      } finally {
        await releaseSavedRunAdmission(admission, { persisted: snapshotPersisted });
      }
    } catch (error) {
      incrementCounter("vector_reports_total", { domain: "unknown", outcome: "failed" });
      if (error instanceof ScenarioDraftAdmissionError) {
        return publicApiError(new PublicApiError(
          error.code === "DRAFT_ADMISSION_INVALID" ? 400 : 409,
          error.code,
          error.message,
          undefined,
          error.fieldPath,
        ));
      }
      return publicApiError(error, 503);
    }
  });
}
