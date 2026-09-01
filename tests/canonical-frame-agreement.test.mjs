import assert from "node:assert/strict";
import test from "node:test";

import {
  selectCanonicalTargetEffect,
  selectCurrentGeometry,
  selectDisplayFrame,
  selectRecordedTrackState,
  selectRouteTransitionStates,
} from "../lib/frontend/selectors.ts";
import { buildCanonicalReportDebrief } from "../lib/report-debrief.ts";
import { createVerificationDeploymentCapabilities } from "../lib/runtime/deployment-capabilities.ts";
import {
  CURRENT_AIR_COMBAT_STUDY_IDS,
  getScenarioDefinition,
} from "../lib/scenarios.ts";
import { simulateWithCapabilitiesForVerification } from "../lib/simulation.ts";

const EXPECTED_EFFECTS = new Map([
  ["a2a-crossing-intercept", "KILL"],
  ["a2a-defensive-break", "KILL"],
  ["a2a-high-energy-crossing-challenge", "NO_EFFECT"],
]);

const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);

function targetEffectEvent(result) {
  assert.equal(result.engineRun.events.state, "AVAILABLE");
  const events = result.engineRun.events.items.filter(
    (event) => event.payload.kind === "TARGET_EFFECT_COMMITTED",
  );
  assert.equal(events.length, 1);
  return events[0];
}

test("all exact Air studies project one canonical effect frame through every read-only view selector", () => {
  for (const scenarioId of CURRENT_AIR_COMBAT_STUDY_IDS) {
    const definition = getScenarioDefinition(scenarioId);
    assert.ok(definition);

    // Conduct physics exactly once. Every assertion below projects this one
    // immutable result; changing a view cannot create a second simulation.
    const result = simulateWithCapabilitiesForVerification(
      definition.scenario,
      capabilities,
    );
    const event = targetEffectEvent(result);
    const selected = selectDisplayFrame(result, event.modelTimeSeconds);
    assert.equal(selected.frame, result.frames[event.frameIndex]);
    assert.equal(selected.frameIndex, event.frameIndex);
    assert.equal(selected.displayTimeSeconds, event.modelTimeSeconds);

    const geometry = selectCurrentGeometry(result, selected);
    assert.equal(geometry.frameIndex, selected.frameIndex);
    assert.equal(geometry.displayTimeSeconds, selected.displayTimeSeconds);

    const transitions = selectRouteTransitionStates(result, selected);
    assert.ok(transitions.length >= 2);
    for (const transition of transitions) {
      assert.equal(transition.frameIndex, selected.frameIndex);
      assert.equal(transition.displayTimeSeconds, selected.displayTimeSeconds);
    }

    for (const perspective of ["IAF", "PAF"]) {
      const track = selectRecordedTrackState(result.pictures, selected, perspective);
      assert.equal(track.displayTimeSeconds, selected.displayTimeSeconds);
      if (track.state === "AVAILABLE") {
        assert.equal(track.track.modelTimeSeconds, selected.displayTimeSeconds);
      }
    }

    const targetEffect = selectCanonicalTargetEffect(result, selected);
    assert.equal(targetEffect.eventId, event.id);
    assert.equal(targetEffect.projection.frameIndex, selected.frameIndex);
    assert.equal(targetEffect.projection.modelTimeSeconds, selected.displayTimeSeconds);
    assert.equal(targetEffect.presentation.state, "RECORDED");
    assert.equal(targetEffect.presentation.effectClass, EXPECTED_EFFECTS.get(scenarioId));

    // Situation Log and report debrief both consume this committed event and
    // retained result; neither classifies from rendered geometry.
    const debrief = buildCanonicalReportDebrief(
      result,
      definition,
      definition.scenario,
    );
    assert.equal(debrief.targetEffect.eventId, targetEffect.eventId);
    assert.equal(debrief.targetEffect.projection.frameIndex, selected.frameIndex);
    assert.equal(
      debrief.targetEffect.projection.modelTimeSeconds,
      selected.displayTimeSeconds,
    );
    assert.equal(
      debrief.targetEffect.presentation.effectClass,
      targetEffect.presentation.effectClass,
    );
    assert.equal(debrief.weaponTermination?.modelTimeSeconds, selected.displayTimeSeconds);
  }
});
