import type { ScenarioDefinition } from "@/lib/scenarios";
import { getProfile, type Scenario } from "@/lib/simulation";

export type ValidationState = "pass" | "warning" | "error";
export type ValidationItem = { id: string; label: string; detail: string; state: ValidationState };

export function validateScenario(definition: ScenarioDefinition, scenario: Scenario): ValidationItem[] {
  const profile = getProfile(scenario);
  const targetAltitude = scenario.altitude + scenario.targetDelta;
  const profileFits = scenario.range <= profile.maxRange * 1000;
  const targetStateFits = definition.targetMotion === "fixed"
    ? scenario.targetSpeed === 0 && scenario.maneuver === "steady" && scenario.targetG === 0
    : scenario.targetSpeed > 0;

  return [
    {
      id: "purpose",
      label: scenario.objective.trim() ? "Run purpose is defined" : "Run purpose is missing",
      detail: scenario.objective.trim() ? scenario.objective : "Add a plain-language purpose in Brief.",
      state: scenario.objective.trim() ? "pass" : "error",
    },
    {
      id: "profile-envelope",
      label: profileFits ? "Starting distance is inside the selected profile envelope" : "Starting distance exceeds the selected profile envelope",
      detail: `${scenario.range / 1000} km selected · ${profile.maxRange} km ${profile.name} envelope`,
      state: profileFits ? "pass" : "error",
    },
    {
      id: "target-state",
      label: targetStateFits ? `${definition.targetMotion === "fixed" ? "Fixed objective" : "Moving target"} state is internally consistent` : "Target state conflicts with this template",
      detail: definition.targetMotion === "fixed" ? "Speed 0 m/s · no evasive maneuver" : `Speed ${scenario.targetSpeed} m/s · ${scenario.maneuver} behavior`,
      state: targetStateFits ? "pass" : "error",
    },
    {
      id: "altitude",
      label: scenario.altitude >= 0 && targetAltitude >= 0 ? "Launch and objective altitudes are valid" : "An altitude falls below the local reference surface",
      detail: `Launch ${scenario.altitude} m · objective ${targetAltitude} m`,
      state: scenario.altitude >= 0 && targetAltitude >= 0 ? "pass" : "error",
    },
    {
      id: "event-scope",
      label: "Prepared condition has a defined model effect",
      detail: definition.preparedEvent.physicsEffect === "guidance-hold" ? "Guidance holds the last line-of-sight command for eight model seconds." : "Environmental-loss index increases by eight points from the selected model time.",
      state: "pass",
    },
    {
      id: "provenance",
      label: "Template and model versions will be recorded",
      detail: `${definition.id}@${definition.version} · browser-point-mass-v0.3`,
      state: "pass",
    },
  ];
}

export const canConduct = (items: ValidationItem[]) => items.every((item) => item.state !== "error");
