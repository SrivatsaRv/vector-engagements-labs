import {
  bindAdmittedEnvironmentRunway,
  createDefaultAirMissionDefinition,
  synchronizeScenarioAirMission,
} from "../air-mission.ts";
import { CURRENT_COMPILED_MODEL_PACK } from "../engine/weapon-admission.ts";
import { admitEnvironmentPack } from "../geospatial/environment-pack.ts";
import { createDefaultSpatialPlan } from "../scenario-spatial.ts";
import { DEFAULT_SCENARIO } from "../simulation.ts";
import { getStudyArea } from "../study-areas.ts";

export const GENERIC_TAKEOFF_PERFORMANCE_PROFILE = Object.freeze({
  schemaVersion: "vector.generic-takeoff-performance-profile.v1" as const,
  id: "generic-runway-takeoff-climbout-50s.v1" as const,
  durationSeconds: 50,
  warmupRunsPerBackend: 3,
  measuredRunsPerBackend: 20,
  percentile: 0.95,
  maximumP95Ms: 100,
  maximumFramesPerRun: 300,
  backends: Object.freeze(["typescript", "rust-wasm"] as const),
});

export function createGenericTakeoffPerformanceScenario() {
  let scenario = structuredClone(DEFAULT_SCENARIO);
  let area = getStudyArea(scenario.studyAreaId);
  scenario.spatialPlan = createDefaultSpatialPlan({
    studyArea: area,
    rangeM: scenario.range,
    blueAltitudeM: scenario.altitude,
    redAltitudeM: scenario.altitude + scenario.targetDelta,
    blueSpeedMps: scenario.launcherSpeed,
    redSpeedMps: scenario.targetSpeed,
    crossingAngleDeg: scenario.aspect,
  });
  scenario.airMission = createDefaultAirMissionDefinition({
    scenario,
    missionClass: "COMBAT_AIR_PATROL",
    modelPack: CURRENT_COMPILED_MODEL_PACK,
  });

  area = getStudyArea("rajasthan-desert");
  scenario = synchronizeScenarioAirMission({
    ...scenario,
    studyAreaId: area.id,
    weatherPresetId: area.defaultWeatherPresetId,
    spatialPlan: createDefaultSpatialPlan({
      studyArea: area,
      rangeM: scenario.range,
      blueAltitudeM: scenario.altitude,
      redAltitudeM: scenario.altitude + scenario.targetDelta,
      blueSpeedMps: scenario.launcherSpeed,
      redSpeedMps: scenario.targetSpeed,
      crossingAngleDeg: scenario.aspect,
    }),
  }, CURRENT_COMPILED_MODEL_PACK);
  if (!scenario.airMission || !scenario.spatialPlan) {
    throw new Error("Generic takeoff performance scenario did not retain its admitted mission and spatial plan.");
  }
  const runway = bindAdmittedEnvironmentRunway({
    environmentPack: admitEnvironmentPack({
      studyAreaId: scenario.studyAreaId,
      weatherPresetId: scenario.weatherPresetId,
    }).pack,
    installationId: "iaf-jodhpur",
    runwayId: "runway:iaf-jodhpur:236786",
  });
  const threshold = runway.threshold;
  scenario.airMission.start = {
    posture: "RUNWAY",
    installationId: "iaf-jodhpur",
    installationSourceId: "iaf-stations-wikipedia",
    runway,
    readinessDelaySeconds: 0,
    taxiFidelity: "ABSTRACTED",
    takeoffCondition: "Runway open and readiness delay elapsed.",
    rejectedTakeoffCondition: "Ground envelope violation before release.",
  };
  scenario.spatialPlan.blue.position = {
    longitude: threshold.longitude,
    latitude: threshold.latitude,
    altitudeM: threshold.elevation.valueM,
    verticalDatum: "MSL",
  };
  scenario.spatialPlan.blue.route[0] = structuredClone(scenario.spatialPlan.blue.position);
  scenario.airMission.flightPlans[0].routePoints[0].position = {
    longitude: threshold.longitude,
    latitude: threshold.latitude,
    altitude: structuredClone(threshold.elevation),
  };
  return scenario;
}

export function nearestRankIndex(sampleCount: number, percentile: number): number {
  if (!Number.isInteger(sampleCount) || sampleCount <= 0) {
    throw new Error("Performance sample count must be a positive integer.");
  }
  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 1) {
    throw new Error("Performance percentile must be in (0, 1].");
  }
  return Math.ceil(sampleCount * percentile) - 1;
}
