import type { ScenarioDefinition } from "@/lib/scenarios";
import { getProfile, type Scenario } from "@/lib/simulation";
import { findPlatform, findWeapon } from "@/lib/capability-data";
import { getCatalogObject } from "@/lib/object-catalog";

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
  const profile = getProfile(scenario);
  const platform = findPlatform(scenario.bluePlatformId);
  const weapon = findWeapon(scenario.blueSystemId);
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
  const targetAltitude = scenario.altitude + scenario.targetDelta;
  const profileFits = scenario.range <= profile.maxRange * 1000;
  const targetStateFits =
    definition.targetMotion === "fixed"
      ? scenario.targetSpeed === 0 &&
        scenario.maneuver === "steady" &&
        scenario.targetG === 0
      : scenario.targetSpeed > 0;

  return [
    {
      id: "purpose",
      label: scenario.objective.trim()
        ? "Run purpose is defined"
        : "Run purpose is missing",
      detail: scenario.objective.trim()
        ? scenario.objective
        : "Add a plain-language purpose in Brief.",
      state: scenario.objective.trim() ? "pass" : "error",
    },
    {
      id: "study-boundary",
      label: profileFits
        ? "Starting distance is inside this model's study boundary"
        : "Starting distance exceeds this model's study boundary",
      detail: `${scenario.range / 1000} km selected · ${profile.maxRange} km study limit for ${profile.name}. This is a model limit, not a published weapon range.`,
      state: profileFits ? "pass" : "error",
    },
    {
      id: "loadout",
      label: loadoutLinked
        ? scenario.domain === "A2A"
          ? "Selected weapon is source-linked to the launch platform"
          : "Launch object and guided system are assigned"
        : "Selected weapon is not linked to this platform",
      detail: loadoutLinked
        ? scenario.domain === "A2A"
          ? `${weapon!.designation} is available for ${platform!.designation}; quantity ${scenario.blueWeaponQuantity}.`
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
          : `Speed ${scenario.targetSpeed} m/s · ${scenario.maneuver} behavior`,
      state: targetStateFits ? "pass" : "error",
    },
    {
      id: "flight-state",
      label:
        scenario.altitude >= 0 && targetAltitude >= 0
          ? "Starting flight state is internally consistent"
          : "An altitude falls below the local reference surface",
      detail: `Blue ${scenario.altitude} m at ${scenario.launcherSpeed} m/s · Red ${targetAltitude} m at ${scenario.targetSpeed} m/s · ${scenario.aspect}° crossing angle`,
      state: scenario.altitude >= 0 && targetAltitude >= 0 ? "pass" : "error",
    },
    {
      id: "information-path",
      label:
        scenario.domain === "A2A"
          ? "Blue Team has a defined source for the opposing track"
          : "Scenario conditions are defined",
      detail:
        scenario.domain === "A2A"
          ? `${scenario.blueTrackSource.replaceAll("_", " ").toLowerCase()} · radar ${scenario.blueRadarMode.toLowerCase()} · data link ${scenario.blueDatalink ? "available" : "unavailable"} · Blue ${scenario.blueDecision.replaceAll("_", " ").toLowerCase()} · Red ${scenario.redDecision.replaceAll("_", " ").toLowerCase()}`
          : `Target motion ${definition.targetMotion} · environmental-loss input ${scenario.wind}`,
      state: "pass",
    },
    {
      id: "prepared-condition",
      label: "Prepared condition has an explicit effect",
      detail:
        definition.preparedEvent.physicsEffect === "guidance-hold"
          ? "When applied, Blue guidance holds the last line-of-sight command for eight model seconds and the IAF RASP track ages."
          : "When applied, the environmental-loss input increases by eight points from the selected model time.",
      state: "pass",
    },
    {
      id: "provenance",
      label: "Sources, assumptions, and versions will be frozen with the run",
      detail: `${definition.id}@${definition.version} · browser-point-mass-v0.4 · ${weapon?.model.version ?? "generic-public-study-v0.4"}`,
      state: "pass",
    },
  ];
}

export const canConduct = (items: ValidationItem[]) =>
  items.every((item) => item.state !== "error");
