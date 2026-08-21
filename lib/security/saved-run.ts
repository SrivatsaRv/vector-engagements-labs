import type { ReportData } from "@/lib/report-export";
import type { ScenarioDefinition } from "@/lib/scenarios";
import {
  type Scenario,
  simulate,
} from "@/lib/simulation";
import { findWeaponSimulationModel } from "@/lib/simulation-models";
import { ENGINE_VERSION } from "@/lib/engine/version";
import { OBJECT_CATALOG } from "@/lib/object-catalog";
import { compileModelPack } from "@/lib/model-pack";
import { createCurrentModelPackSource } from "@/lib/reference-model-pack";
import {
  EnvironmentAdmissionError,
  resolveEnvironmentSelection,
} from "@/lib/study-areas";
import {
  MissionAdmissionError,
  resolveInstallationOriginReference,
  type InstallationOriginReference,
} from "@/lib/mission-admission";
import { finiteNumber, PublicApiError, shortString } from "./public-api";
import { SAVED_RUN_LIFECYCLE_POLICY } from "./admission-policy";

const domains = new Set(["A2A", "A2G", "G2A", "G2G"]);
const profiles = new Set(["short", "medium", "sustained"]);
const guidance = new Set(["direct", "loft"]);
const radarModes = new Set(["ACTIVE", "SILENT"]);
const trackSources = new Set(["ONBOARD_RADAR", "DATALINK", "AIRBORNE_EARLY_WARNING", "VISUAL"]);

function enumValue(value: unknown, values: Set<string>, field: string) {
  if (typeof value !== "string" || !values.has(value)) {
    throw new PublicApiError(400, `invalid_${field}`);
  }
  return value;
}

function bool(value: unknown, field: string) {
  if (typeof value !== "boolean") throw new PublicApiError(400, `invalid_${field}`);
  return value;
}

function optionalTime(value: unknown, field: string) {
  return value === null ? null : finiteNumber(value, 0, 600, field);
}

function spatialPlan(value: unknown): Scenario["spatialPlan"] {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") throw new PublicApiError(400, "invalid_spatial_plan");
  const candidate = value as Record<string, unknown>;
  const side = (input: unknown, name: string) => {
    if (!input || typeof input !== "object") throw new PublicApiError(400, `invalid_${name}_placement`);
    const placement = input as Record<string, unknown>;
    if (!placement.position || typeof placement.position !== "object") {
      throw new PublicApiError(400, `invalid_${name}_position`);
    }
    const point = placement.position as Record<string, unknown>;
    const route = Array.isArray(placement.route) ? placement.route : [];
    if (route.length > 64) throw new PublicApiError(400, `invalid_${name}_route`);
    const routeAcceptanceRadiiM = placement.routeAcceptanceRadiiM;
    if (!Array.isArray(routeAcceptanceRadiiM) || routeAcceptanceRadiiM.length !== route.length) {
      throw new PublicApiError(400, `invalid_${name}_route_plan`);
    }
    const acceptedRadii = routeAcceptanceRadiiM.map((entry, index) => {
      const radius = finiteNumber(entry, 1, 25_000, `${name}_route_acceptance_radius_${index}`);
      if (index === 0 && radius !== 1) {
        throw new PublicApiError(400, `invalid_${name}_route_plan`);
      }
      return radius;
    });
    return {
      position: {
        longitude: finiteNumber(point.longitude, 60, 100, `${name}_longitude`),
        latitude: finiteNumber(point.latitude, 0, 40, `${name}_latitude`),
        altitudeM: finiteNumber(point.altitudeM, -500, 30_000, `${name}_altitude`),
        verticalDatum: explicitMsl(point.verticalDatum, `${name}_vertical_datum`),
      },
      headingDeg: finiteNumber(placement.headingDeg, 0, 360, `${name}_heading`),
      speedMps: finiteNumber(placement.speedMps, 0, 3_000, `${name}_speed`),
      route: route.map((entry, index) => {
        if (!entry || typeof entry !== "object") throw new PublicApiError(400, `invalid_${name}_route_${index}`);
        const routePoint = entry as Record<string, unknown>;
        return {
          longitude: finiteNumber(routePoint.longitude, 60, 100, `${name}_route_longitude`),
          latitude: finiteNumber(routePoint.latitude, 0, 40, `${name}_route_latitude`),
          altitudeM: finiteNumber(routePoint.altitudeM, -500, 30_000, `${name}_route_altitude`),
          verticalDatum: explicitMsl(
            routePoint.verticalDatum,
            `${name}_route_vertical_datum`,
          ),
        };
      }),
      routeAcceptanceRadiiM: acceptedRadii,
      originReference: installationOriginReference(
        placement.originReference,
        `${name}_origin_reference`,
      ),
    };
  };
  return { blue: side(candidate.blue, "blue"), red: side(candidate.red, "red") };
}

function installationOriginReference(
  value: unknown,
  field: string,
): InstallationOriginReference | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") {
    throw new PublicApiError(400, `invalid_${field}`);
  }
  const input = value as Record<string, unknown>;
  const environment = input.environment;
  if (!environment || typeof environment !== "object") {
    throw new PublicApiError(400, `invalid_${field}_environment`);
  }
  const environmentInput = environment as Record<string, unknown>;
  if (input.schemaVersion !== "vector.installation-origin.v1") {
    throw new PublicApiError(400, `invalid_${field}_schema_version`);
  }
  const reference: InstallationOriginReference = {
    schemaVersion: input.schemaVersion,
    installationId: shortString(input.installationId, 120, `${field}_installation_id`),
    sourceId: shortString(input.sourceId, 160, `${field}_source_id`),
    environment: {
      studyAreaId: shortString(environmentInput.studyAreaId, 80, `${field}_study_area_id`),
      weatherPresetId: shortString(environmentInput.weatherPresetId, 80, `${field}_weather_preset_id`),
    },
  };
  if (input.runwayId !== undefined) {
    reference.runwayId = shortString(input.runwayId, 120, `${field}_runway_id`);
  }
  return reference;
}

function explicitMsl(value: unknown, field: string): "MSL" {
  // vector.scenario.v2 predates the datum field but documented altitude as
  // ASL/MSL. The compatibility adapter makes that legacy meaning explicit;
  // any declared non-MSL datum is rejected rather than converted.
  if (value === undefined || value === "MSL") return "MSL";
  throw new PublicApiError(400, `invalid_${field}`);
}

function catalogObject(id: string, domain: Scenario["domain"], field: string) {
  const object = OBJECT_CATALOG.find((candidate) => candidate.id === id);
  if (!object || (field !== "red_system" && !object.domains.includes(domain))) {
    throw new PublicApiError(400, `invalid_${field}`);
  }
  return object;
}

export function validateSavedScenario(value: unknown, template: ScenarioDefinition): Scenario {
  if (!value || typeof value !== "object") throw new PublicApiError(400, "invalid_scenario");
  const input = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(input, "engineBackend")) {
    throw new PublicApiError(400, "scenario_engine_forbidden");
  }
  for (const field of ["blueDecision", "redDecision", "maneuver", "targetG"] as const) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      throw new PublicApiError(
        400,
        "SCENARIO_RETIRED_BEHAVIOR_CONTROL",
        "Tactical decision and maneuver controls are unavailable until an admitted mission-policy runtime exists.",
        undefined,
        field,
      );
    }
  }
  const scenario: Scenario = {
    domain: enumValue(input.domain, domains, "domain") as Scenario["domain"],
    name: shortString(input.name, 120, "name"),
    objective: shortString(input.objective, 500, "objective"),
    bluePlatformId: shortString(input.bluePlatformId, 80, "blue_platform"),
    blueSystemId: shortString(input.blueSystemId, 80, "blue_system"),
    redObjectId: shortString(input.redObjectId, 80, "red_object"),
    redSystemId: shortString(input.redSystemId, 80, "red_system"),
    studyAreaId: shortString(input.studyAreaId, 80, "study_area"),
    weatherPresetId: shortString(input.weatherPresetId, 80, "weather_preset"),
    blueWeaponQuantity: finiteNumber(input.blueWeaponQuantity, 0, 64, "blue_weapon_quantity"),
    redWeaponQuantity: finiteNumber(input.redWeaponQuantity, 0, 64, "red_weapon_quantity"),
    blueFuelPercent: finiteNumber(input.blueFuelPercent, 0, 100, "blue_fuel"),
    redFuelPercent: finiteNumber(input.redFuelPercent, 0, 100, "red_fuel"),
    blueRadarMode: enumValue(input.blueRadarMode, radarModes, "blue_radar_mode") as Scenario["blueRadarMode"],
    redRadarMode: enumValue(input.redRadarMode, radarModes, "red_radar_mode") as Scenario["redRadarMode"],
    blueTrackSource: enumValue(input.blueTrackSource, trackSources, "blue_track_source") as Scenario["blueTrackSource"],
    redTrackSource: enumValue(input.redTrackSource, trackSources, "red_track_source") as Scenario["redTrackSource"],
    blueDatalink: bool(input.blueDatalink, "blue_datalink"),
    redDatalink: bool(input.redDatalink, "red_datalink"),
    blueJammer: bool(input.blueJammer, "blue_jammer"),
    redJammer: bool(input.redJammer, "red_jammer"),
    profile: enumValue(input.profile, profiles, "profile") as Scenario["profile"],
    guidance: enumValue(input.guidance, guidance, "guidance") as Scenario["guidance"],
    altitude: finiteNumber(input.altitude, 0, 30_000, "altitude"),
    cruiseAltitude: finiteNumber(input.cruiseAltitude, 0, 100_000, "cruise_altitude"),
    targetDelta: finiteNumber(input.targetDelta, -30_000, 30_000, "target_delta"),
    range: finiteNumber(input.range, 100, 2_000_000, "range"),
    aspect: finiteNumber(input.aspect, 0, 360, "aspect"),
    launcherSpeed: finiteNumber(input.launcherSpeed, 0, 3_000, "launcher_speed"),
    targetSpeed: finiteNumber(input.targetSpeed, 0, 3_000, "target_speed"),
    wind: finiteNumber(input.wind, -150, 150, "wind_east"),
    windNorth: finiteNumber(input.windNorth, -150, 150, "wind_north"),
    visibilityKm: finiteNumber(input.visibilityKm, 0.1, 300, "visibility"),
    humidityPercent: finiteNumber(input.humidityPercent, 0, 100, "humidity"),
    temperatureOffset: finiteNumber(input.temperatureOffset, -80, 80, "temperature_offset"),
    spatialPlan: spatialPlan(input.spatialPlan),
    lossIncreaseAt: optionalTime(input.lossIncreaseAt, "wind_shift_at"),
    lossIncreaseAmount: finiteNumber(input.lossIncreaseAmount, -150, 150, "wind_shift"),
    seed: finiteNumber(input.seed, 0, 2_147_483_647, "seed"),
  };
  if (scenario.domain !== template.domain) throw new PublicApiError(409, "scenario_domain_mismatch");
  try {
    resolveEnvironmentSelection(scenario);
    for (const [team, placement] of Object.entries(scenario.spatialPlan ?? {})) {
      resolveInstallationOriginReference({
        reference: placement.originReference,
        studyAreaId: scenario.studyAreaId,
        weatherPresetId: scenario.weatherPresetId,
        fieldPath: `spatialPlan.${team}.originReference`,
      });
    }
  } catch (error) {
    if (error instanceof EnvironmentAdmissionError) {
      throw new PublicApiError(400, error.code, error.message, undefined, error.fieldPath);
    }
    if (error instanceof MissionAdmissionError) {
      throw new PublicApiError(400, error.code, error.message, undefined, error.fieldPath);
    }
    throw error;
  }
  catalogObject(scenario.bluePlatformId, scenario.domain, "blue_platform");
  catalogObject(scenario.blueSystemId, scenario.domain, "blue_system");
  catalogObject(scenario.redObjectId, scenario.domain, "red_object");
  catalogObject(scenario.redSystemId, scenario.domain, "red_system");
  return scenario;
}

export async function buildVerifiedSavedRun(
  input: unknown,
  template: ScenarioDefinition,
  provenance: { schemaVersion: string; contentHash: string; draftRevision: number },
) {
  const scenario = validateSavedScenario(input, template);
  const modelPackBundle = await compileModelPack(createCurrentModelPackSource());
  if (
    template.modelPack.id !== modelPackBundle.pack.id ||
    template.modelPack.version !== modelPackBundle.pack.version ||
    template.modelPack.digest !== modelPackBundle.pack.digest ||
    !modelPackBundle.pack.intendedUses.some(
      (item) => item.id === template.intendedUse.id && item.version === template.intendedUse.version,
    )
  ) {
    throw new PublicApiError(409, "scenario_model_pack_mismatch");
  }
  const result = simulate(scenario);
  if (result.frames.length === 0 || result.frames.length > 10_000) {
    throw new PublicApiError(422, "simulation_output_rejected");
  }
  if (new TextEncoder().encode(JSON.stringify(result.frames)).byteLength > SAVED_RUN_LIFECYCLE_POLICY.maxServerResultBytes) {
    throw new PublicApiError(422, "simulation_output_rejected");
  }
  const model = findWeaponSimulationModel(scenario.blueSystemId);
  const report: ReportData = {
    scenario,
    result,
    events: [
      { id: 1, time: 0, type: "run", title: "Verified run started", detail: "Recomputed by the server from the saved scenario inputs." },
      { id: 2, time: result.timeOfFlight, type: "outcome", title: "Run completed", detail: result.reason },
    ],
    createdAt: new Date().toISOString(),
    engine: ENGINE_VERSION,
    profileVersion: model ? `${model.id}@${model.version}` : "model-unavailable",
    packageProvenance: {
      ...provenance,
      intendedUse: template.intendedUse,
      modelPack: template.modelPack,
      credibilityManifest: {
        id: modelPackBundle.credibilityManifest.id,
        version: modelPackBundle.credibilityManifest.version,
        approvalState: modelPackBundle.credibilityManifest.approvalState,
        limitations: modelPackBundle.credibilityManifest.limitations.map((item) => ({
          id: item.id,
          severity: item.severity,
          statement: item.statement,
        })),
      },
    },
    libraryScenario: {
      id: template.id,
      version: template.version,
      domain: template.domain,
      title: template.title,
      scope: template.scope,
      targetProfile: template.targetProfile,
      theatre: template.theatre,
    },
  };
  return { scenario, result, report };
}
