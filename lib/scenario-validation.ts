import type { ScenarioDefinition } from "./scenarios.ts";
import type { Scenario } from "./simulation.ts";
import { findPlatform, findWeapon } from "./capability-data.ts";
import { getCatalogObject } from "./object-catalog.ts";
import { ENGINE_VERSION } from "./engine/version.ts";
import { findWeaponSimulationModel } from "./simulation-models.ts";
import { STUDY_AREAS } from "./study-areas.ts";
import {
  hasNonZeroRouteLegs,
  hasValidRouteAcceptanceRadii,
  hasValidRouteWaypointTransitions,
  isPointInsideStudyArea,
} from "./scenario-spatial.ts";

export type ValidationState = "pass" | "warning" | "error";
export type ValidationItem = {
  id: string;
  label: string;
  detail: string;
  state: ValidationState;
};

export function validateScenario(
  definition: ScenarioDefinition,
  scenario: Scenario,
): ValidationItem[] {
  const platform = findPlatform(scenario.bluePlatformId);
  const weapon = findWeapon(scenario.blueSystemId);
  const simulationModel = findWeaponSimulationModel(scenario.blueSystemId);
  const launchObject = getCatalogObject(scenario.bluePlatformId);
  const guidedSystem = getCatalogObject(scenario.blueSystemId);
  const loadoutLinked =
    scenario.domain === "A2A"
      ? Boolean(
          platform &&
            weapon &&
            platform.compatibleWeaponIds.includes(weapon.id),
        )
      : Boolean(scenario.bluePlatformId && scenario.blueSystemId);
  const loadoutSourceLinked =
    scenario.bluePlatformId === "su-30mki" &&
    scenario.blueSystemId === "astra-mk1";
  const targetAltitude = scenario.altitude + scenario.targetDelta;
  const studyArea = STUDY_AREAS.find((area) => area.id === scenario.studyAreaId);
  const weatherPreset = studyArea?.weatherPresets.find(
    (preset) => preset.id === scenario.weatherPresetId,
  );
  const cruiseAltitudeValid =
    scenario.domain !== "G2G" || scenario.cruiseAltitude >= 30;
  const targetStateFits =
    definition.targetMotion === "fixed"
      ? scenario.targetSpeed === 0
      : scenario.targetSpeed > 0;
  const authoredPoints = scenario.spatialPlan
    ? [
        scenario.spatialPlan.blue.position,
        scenario.spatialPlan.red.position,
        ...scenario.spatialPlan.blue.route,
        ...scenario.spatialPlan.red.route,
      ]
    : [];
  const spatialEntities = scenario.spatialPlan
    ? [scenario.spatialPlan.blue, scenario.spatialPlan.red]
    : [];
  const spatialPlanValid = Boolean(
    studyArea &&
      authoredPoints.every(
        (point) =>
          Number.isFinite(point.longitude) &&
          Number.isFinite(point.latitude) &&
          Number.isFinite(point.altitudeM) &&
          point.altitudeM >= 0 &&
          isPointInsideStudyArea(point, studyArea),
      ) &&
      spatialEntities.every(
        (entity) =>
          Number.isFinite(entity.headingDeg) &&
          entity.headingDeg >= 0 &&
          entity.headingDeg < 360 &&
          Number.isFinite(entity.speedMps) &&
          entity.speedMps >= 0 &&
          entity.route.length >= 1 &&
          hasNonZeroRouteLegs(entity, studyArea) &&
          hasValidRouteAcceptanceRadii(entity) &&
          hasValidRouteWaypointTransitions(entity) &&
          Math.abs(entity.route[0].longitude - entity.position.longitude) < 1e-9 &&
          Math.abs(entity.route[0].latitude - entity.position.latitude) < 1e-9 &&
          Math.abs(entity.route[0].altitudeM - entity.position.altitudeM) < 1e-6,
      ),
  );

  return [
    {
      id: "purpose",
      label: scenario.objective.trim()
        ? "Run purpose is defined"
        : "Run purpose is missing",
      detail: scenario.objective.trim()
        ? scenario.objective
        : "Add a plain-language purpose in Define.",
      state: scenario.objective.trim() ? "pass" : "error",
    },
    {
      id: "spatial-context",
      label:
        studyArea && weatherPreset
          ? "Study area and weather preset are defined"
          : "Study area or weather preset is unavailable",
      detail:
        studyArea && weatherPreset
          ? `${studyArea.shortName} · ${studyArea.terrainClass.toLowerCase().replaceAll("_", " ")} · ${studyArea.surfaceElevationM} m reference terrain · ${weatherPreset.label}`
          : "Choose a PostGIS-backed study area and one of its declared weather presets.",
      state: studyArea && weatherPreset ? "pass" : "error",
    },
    {
      id: "flight-model",
      label: simulationModel
        ? "Selected weapon has a flight-model coefficient set"
        : "Selected weapon has no flight-model coefficient set",
      detail: simulationModel
        ? `${simulationModel.id}@${simulationModel.version} · ${simulationModel.valueState.toLowerCase().replaceAll("_", " ")}. This confirms model availability, not real-world performance.`
        : `No deterministic 3DOF coefficient set is registered for ${scenario.blueSystemId}.`,
      state: simulationModel ? "pass" : "error",
    },
    {
      id: "authored-placement",
      label: scenario.spatialPlan
        ? spatialPlanValid
          ? "Authored positions and routes are inside the selected study area"
          : "Authored placement or route state is invalid"
        : "Template geometry will be compiled from the starting conditions",
      detail: scenario.spatialPlan
        ? `${scenario.spatialPlan.blue.route.length - 1} Blue waypoints · ${scenario.spatialPlan.red.route.length - 1} Red waypoints · headings, speeds, route origins, and preset boundary checked`
        : "Open Place & flight to create explicit geographic start positions and declared routes.",
      state: scenario.spatialPlan ? (spatialPlanValid ? "pass" : "error") : "pass",
    },
    {
      id: "loadout",
      label: loadoutLinked
        ? scenario.domain === "A2A"
          ? "Selected weapon is assigned to the launch platform"
          : "Launch object and guided system are assigned"
        : "Selected weapon is not linked to this platform",
      detail: loadoutLinked
        ? scenario.domain === "A2A"
          ? `${weapon!.designation} / ${platform!.designation} · quantity ${scenario.blueWeaponQuantity} · ${loadoutSourceLinked ? "source-backed catalog link" : "scenario catalog assignment; exact variant integration remains unverified"}`
          : `${launchObject.designation} / ${guidedSystem.designation} · scenario catalog assignment`
        : `Choose a weapon with a cataloged compatibility record for ${platform?.designation ?? launchObject.designation}.`,
      state: loadoutLinked ? "pass" : "error",
    },
    {
      id: "target-state",
      label: targetStateFits
        ? `${definition.targetMotion === "fixed" ? "Fixed objective" : "Moving target"} state is internally consistent`
        : "Target state conflicts with this template",
      detail:
        definition.targetMotion === "fixed"
          ? "Speed 0 m/s · no evasive maneuver"
          : `Speed ${scenario.targetSpeed} m/s · authored route`,
      state: targetStateFits ? "pass" : "error",
    },
    {
      id: "flight-state",
      label:
        scenario.altitude >= 0 && targetAltitude >= 0 && cruiseAltitudeValid
          ? "Starting flight state is internally consistent"
          : "An altitude is invalid for this scenario",
      detail: `${scenario.domain === "G2G" ? `Launcher elevation ${scenario.altitude} m · commanded cruise altitude ${scenario.cruiseAltitude} m · objective elevation ${targetAltitude} m` : `Blue ${scenario.altitude} m at ${scenario.launcherSpeed} m/s · Red ${targetAltitude} m at ${scenario.targetSpeed} m/s · ${scenario.aspect}° crossing angle`}`,
      state:
        scenario.altitude >= 0 && targetAltitude >= 0 && cruiseAltitudeValid
          ? "pass"
          : "error",
    },
    {
      id: "information-path",
      label:
        scenario.domain === "A2A"
          ? "Both teams have declared air-picture sources"
          : "Scenario conditions are defined",
      detail:
        scenario.domain === "A2A"
          ? `IAF ${scenario.blueTrackSource.replaceAll("_", " ").toLowerCase()} · PAF ${scenario.redTrackSource.replaceAll("_", " ").toLowerCase()}`
          : `Target motion ${definition.targetMotion} · east–west wind ${scenario.wind} m/s`,
      state: "pass",
    },
    {
      id: "provenance",
      label: "Sources, assumptions, and versions will be frozen with the run",
      detail: `${definition.id}@${definition.version} · ${ENGINE_VERSION} · ${simulationModel?.id ?? "model unavailable"}@${simulationModel?.version ?? "unknown"}`,
      state: "pass",
    },
  ];
}

export const canConduct = (items: ValidationItem[]) =>
  items.every((item) => item.state !== "error");
