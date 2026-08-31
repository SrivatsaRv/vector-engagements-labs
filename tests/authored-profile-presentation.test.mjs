import assert from "node:assert/strict";
import test from "node:test";

import { selectAuthoredProfilePresentation } from "../lib/frontend/authored-profile-presentation.ts";
import { buildAuthoredProfileBinding } from "../lib/report-profile.ts";
import { getScenarioDefinition } from "../lib/scenarios.ts";
import { simulate } from "../lib/simulation.ts";

const definition = getScenarioDefinition("a2a-crossing-intercept");
assert.ok(definition?.authoredProfile);
const result = simulate(definition.scenario);

function authorityFor(scenario) {
  const binding = buildAuthoredProfileBinding(definition, scenario);
  assert.ok(binding);
  return {
    binding,
    profile: definition.authoredProfile,
    currentScenario: scenario,
  };
}

test("authored-profile presentation ignores names and binds the exact causal projection", () => {
  assert.equal(
    selectAuthoredProfilePresentation(result, authorityFor(definition.scenario)).state,
    "MATCHED",
  );
  const renamed = structuredClone(definition.scenario);
  renamed.name = "Operator-local display rename";
  const renamedResult = structuredClone(result);
  renamedResult.engineRun.scenario.name = "Independent recorded display rename";
  assert.equal(
    selectAuthoredProfilePresentation(renamedResult, authorityFor(renamed)).state,
    "MATCHED",
  );
});

test("every canonical profile input mutation suppresses current authored-leg claims", () => {
  const cases = [
    ["duration", (scenario) => { scenario.runDurationSeconds += 1; }],
    ["guidance", (scenario) => { scenario.guidance = "loft"; }],
    ["regime", (scenario) => { scenario.airMission.regime = "WVR_BFM"; }],
    ["mission start", (scenario) => { scenario.airMission.start.kind = "AIRBORNE"; delete scenario.airMission.start.runway; }],
    ["flight-leg role", (scenario) => { scenario.airMission.flightPlans[0].legs[0].role = "EGRESS"; }],
    ["release request", (scenario) => { scenario.airMission.assignments[0].storeTransferPlan.requests[0].requestedTimeSeconds += 1; }],
    ["start position", (scenario) => { scenario.spatialPlan.blue.position.longitude += 0.001; }],
    ["start heading", (scenario) => { scenario.spatialPlan.blue.headingDeg += 1; }],
    ["start TAS", (scenario) => { scenario.spatialPlan.blue.speedMps += 1; }],
    ["origin reference", (scenario) => { scenario.spatialPlan.blue.originReference = {
      schemaVersion: "vector.installation-origin.v2",
      installationId: "test-installation",
      sourceId: "test-source",
      startKind: "RUNWAY",
      environment: {
        studyAreaId: scenario.studyAreaId,
        weatherPresetId: scenario.weatherPresetId,
      },
      runwayId: "test-runway",
    }; }],
    ["route position", (scenario) => { scenario.spatialPlan.red.route[1].latitude += 0.001; }],
    ["route transition", (scenario) => { scenario.spatialPlan.red.routeWaypointTransitions[1] = "FLY_OVER"; }],
    ["acceptance radius", (scenario) => { scenario.spatialPlan.red.routeAcceptanceRadiiM[1] += 1; }],
  ];

  for (const [name, mutate] of cases) {
    const scenario = structuredClone(definition.scenario);
    mutate(scenario);
    const presentation = selectAuthoredProfilePresentation(result, authorityFor(scenario));
    assert.notEqual(presentation.state, "MATCHED", name);
  }
});

test("a saved-report binding preserves modified spatial ancestry without authored-leg claims", () => {
  const scenario = structuredClone(definition.scenario);
  scenario.spatialPlan.red.headingDeg += 7;
  const presentation = selectAuthoredProfilePresentation(
    simulate(scenario),
    authorityFor(scenario),
  );
  assert.equal(presentation.state, "MODIFIED_FROM");
  assert.equal(presentation.profile.id, definition.authoredProfile.id);
});
