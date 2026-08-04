import type { ReportData } from "@/lib/report-export";
import type { ScenarioDefinition } from "@/lib/scenarios";
import {
  type Scenario,
  simulate,
} from "@/lib/simulation";
import { findWeaponSimulationModel } from "@/lib/simulation-models";
import { ENGINE_VERSION } from "@/lib/engine/version";
import { OBJECT_CATALOG } from "@/lib/object-catalog";
import { finiteNumber, PublicApiError, shortString } from "./public-api";

const domains = new Set(["A2A", "A2G", "G2A", "G2G"]);
const profiles = new Set(["short", "medium", "sustained"]);
const guidance = new Set(["direct", "loft"]);
const maneuvers = new Set(["steady", "break", "weave"]);
const radarModes = new Set(["ACTIVE", "SILENT"]);
const trackSources = new Set(["ONBOARD_RADAR", "DATALINK", "AIRBORNE_EARLY_WARNING", "VISUAL"]);
const decisions = new Set(["PRESS", "SUPPORT_WEAPON", "CRANK", "DEFEND", "DISENGAGE"]);

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
    return {
      position: {
        longitude: finiteNumber(point.longitude, 60, 100, `${name}_longitude`),
        latitude: finiteNumber(point.latitude, 0, 40, `${name}_latitude`),
        altitudeM: finiteNumber(point.altitudeM, -500, 30_000, `${name}_altitude`),
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
        };
      }),
    };
  };
  return { blue: side(candidate.blue, "blue"), red: side(candidate.red, "red") };
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
  const scenario: Scenario = {
    engineBackend: "typescript",
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
    blueDecision: enumValue(input.blueDecision, decisions, "blue_decision") as Scenario["blueDecision"],
    redDecision: enumValue(input.redDecision, decisions, "red_decision") as Scenario["redDecision"],
    profile: enumValue(input.profile, profiles, "profile") as Scenario["profile"],
    guidance: enumValue(input.guidance, guidance, "guidance") as Scenario["guidance"],
    altitude: finiteNumber(input.altitude, 0, 30_000, "altitude"),
    cruiseAltitude: finiteNumber(input.cruiseAltitude, 0, 100_000, "cruise_altitude"),
    targetDelta: finiteNumber(input.targetDelta, -30_000, 30_000, "target_delta"),
    range: finiteNumber(input.range, 100, 2_000_000, "range"),
    aspect: finiteNumber(input.aspect, 0, 360, "aspect"),
    launcherSpeed: finiteNumber(input.launcherSpeed, 0, 3_000, "launcher_speed"),
    targetSpeed: finiteNumber(input.targetSpeed, 0, 3_000, "target_speed"),
    maneuver: enumValue(input.maneuver, maneuvers, "maneuver") as Scenario["maneuver"],
    targetG: finiteNumber(input.targetG, 0, 15, "target_g"),
    wind: finiteNumber(input.wind, -150, 150, "wind_east"),
    windNorth: finiteNumber(input.windNorth, -150, 150, "wind_north"),
    visibilityKm: finiteNumber(input.visibilityKm, 0.1, 300, "visibility"),
    humidityPercent: finiteNumber(input.humidityPercent, 0, 100, "humidity"),
    temperatureOffset: finiteNumber(input.temperatureOffset, -80, 80, "temperature_offset"),
    spatialPlan: spatialPlan(input.spatialPlan),
    guidanceInterruptionAt: optionalTime(input.guidanceInterruptionAt, "guidance_interruption_at"),
    guidanceInterruptionDuration: finiteNumber(input.guidanceInterruptionDuration, 0, 60, "guidance_interruption_duration"),
    lossIncreaseAt: optionalTime(input.lossIncreaseAt, "wind_shift_at"),
    lossIncreaseAmount: finiteNumber(input.lossIncreaseAmount, -150, 150, "wind_shift"),
    seed: finiteNumber(input.seed, 0, 2_147_483_647, "seed"),
  };
  if (scenario.domain !== template.domain) throw new PublicApiError(409, "scenario_domain_mismatch");
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
  const result = simulate(scenario);
  if (result.frames.length === 0 || result.frames.length > 10_000) {
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
    packageProvenance: provenance,
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
