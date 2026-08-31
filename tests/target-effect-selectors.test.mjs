import assert from "node:assert/strict";
import test from "node:test";
import {
  selectCanonicalTargetEffect,
  selectDisplayFrame,
} from "../lib/frontend/selectors.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { simulate } from "../lib/simulation.ts";
import { buildReportExport } from "../lib/report-export.ts";

function governedIntercept() {
  return simulate(SCENARIO_LIBRARY.find((item) => item.id === "a2a-defensive-break").scenario);
}

function committedEvent(result) {
  return result.engineRun.events.items.find(
    (event) => event.payload.kind === "TARGET_EFFECT_COMMITTED",
  );
}

test("the selector presents the canonical commit only at and after its exact retained frame", () => {
  const result = governedIntercept();
  const event = committedEvent(result);
  assert.ok(event);

  const before = selectCanonicalTargetEffect(result, {
    frame: result.frames[event.frameIndex - 1],
    frameIndex: event.frameIndex - 1,
    displayTimeSeconds: result.frames[event.frameIndex - 1].t,
  });
  assert.equal(before.presentation.state, "BEFORE_EFFECT_BOUNDARY");
  assert.equal(before.presentation.killClaimAuthorized, false);

  const atBoundary = selectCanonicalTargetEffect(result, {
    frame: result.frames[event.frameIndex],
    frameIndex: event.frameIndex,
    displayTimeSeconds: result.frames[event.frameIndex].t,
  });
  assert.equal(atBoundary.eventId, event.id);
  assert.equal(atBoundary.presentation.effectClass, event.payload.commit.result);
  assert.equal(atBoundary.projection.frameIndex, event.frameIndex);
  assert.equal(atBoundary.projection.modelTimeSeconds, event.modelTimeSeconds);
  assert.equal(atBoundary.projection.authority.state, "UNAVAILABLE");
  assert.equal(atBoundary.projection.effectReason, "AUTHORITY_UNAVAILABLE");
  assert.equal(atBoundary.presentation.assumptionLabel, null);
});

test("an admitted-model EFFECT_UNAVAILABLE retains model limitations and commit reason", () => {
  for (const [reason, cause] of [
    ["OUTSIDE_TARGET_DOMAIN", "GEOMETRIC_INTERCEPT"],
    ["TARGET_UNAVAILABLE", "TARGET_UNAVAILABLE"],
  ]) {
    const result = governedIntercept();
    const event = committedEvent(result);
    const causalEvent = result.engineRun.events.items.find(
      (candidate) => candidate.id === event.causeEventIds[0],
    );
    const model = result.engineRun.scenario.targetEffectAuthority.models[0];
    Object.assign(event.payload.commit, {
      modelId: model.id,
      modelVersion: model.version,
      modelDigest: model.digest,
      intendedUseId: model.intendedUse.id,
      intendedUseVersion: model.intendedUse.version,
      targetProfileId: model.targetProfile.id,
      targetProfileVersion: model.targetProfile.version,
      valueState: "MODEL_ASSUMPTION",
      reason,
    });
    event.payload.commit.terminationReceipt.cause = cause;
    causalEvent.payload.cause = cause;

    const selected = selectCanonicalTargetEffect(
      result,
      selectDisplayFrame(result, result.timeOfFlight),
    );
    assert.equal(selected.presentation.effectClass, "EFFECT_UNAVAILABLE");
    assert.equal(selected.presentation.assumptionLabel, "MODEL_ASSUMPTION");
    assert.equal(selected.projection.authority.state, "ADMITTED");
    assert.match(selected.presentation.detail, new RegExp(reason));
    assert.match(selected.presentation.detail, /MODEL_ASSUMPTION limitations:/);
    assert.equal(selected.presentation.killClaimAuthorized, false);
  }
});

test("canonical event/frame commit disagreement fails closed", () => {
  const result = governedIntercept();
  const event = committedEvent(result);
  const target = result.frames[event.frameIndex].entities.find(
    (entity) => entity.id === event.payload.commit.targetId,
  );
  target.targetEffect.commitId = "corrupt-commit-id";

  const selected = selectCanonicalTargetEffect(
    result,
    selectDisplayFrame(result, result.timeOfFlight),
  );
  assert.equal(selected.presentation.state, "UNAVAILABLE");
  assert.equal(selected.presentation.killClaimAuthorized, false);
  assert.match(selected.presentation.detail, /INCONSISTENT_CANONICAL_TARGET_EFFECT/);
  assert.doesNotMatch(
    `${selected.presentation.label} ${selected.presentation.headline} ${selected.presentation.detail}`,
    /\bkill(?:ed)?\b/i,
  );
});

test("causal agreement requires matching event tick, frame and termination cause", () => {
  const mutations = [
    (effect) => { effect.tick += 1; },
    (_effect, cause) => { cause.frameIndex += 1; },
    (_effect, cause) => { cause.payload.cause = "ENERGY_DEPLETED"; },
  ];
  for (const mutate of mutations) {
    const result = governedIntercept();
    const effect = committedEvent(result);
    const cause = result.engineRun.events.items.find(
      (candidate) => candidate.id === effect.causeEventIds[0],
    );
    mutate(effect, cause);
    const selected = selectCanonicalTargetEffect(
      result,
      selectDisplayFrame(result, result.timeOfFlight),
    );
    assert.equal(selected.presentation.state, "UNAVAILABLE");
    assert.match(selected.presentation.detail, /INCONSISTENT_CANONICAL_TARGET_EFFECT/);
    assert.equal(selected.presentation.killClaimAuthorized, false);
  }
});

test("legacy NOT_MODELLED remains explicit when no canonical commit exists", () => {
  const result = governedIntercept();
  const event = committedEvent(result);
  result.engineRun.events.items = result.engineRun.events.items.filter(
    (candidate) => candidate.id !== event.id,
  );
  delete result.frames[event.frameIndex].entities.find(
    (entity) => entity.id === event.payload.commit.targetId,
  ).targetEffect;

  const selected = selectCanonicalTargetEffect(
    result,
    selectDisplayFrame(result, result.timeOfFlight),
  );
  assert.equal(selected.presentation.state, "NOT_MODELLED");
  assert.equal(selected.presentation.label, "Not modelled");
  assert.equal(selected.presentation.killClaimAuthorized, false);
});

test("terminal-effect wording requires canonical KILL and TERMINATED target proof at the effect frame", () => {
  const result = governedIntercept();
  const event = committedEvent(result);
  const model = result.engineRun.scenario.targetEffectAuthority.models[0];
  const commit = event.payload.commit;
  Object.assign(commit, {
    modelId: model.id,
    modelVersion: model.version,
    modelDigest: model.digest,
    intendedUseId: model.intendedUse.id,
    intendedUseVersion: model.intendedUse.version,
    targetProfileId: model.targetProfile.id,
    targetProfileVersion: model.targetProfile.version,
    valueState: "MODEL_ASSUMPTION",
    result: "KILL",
    reason: "THRESHOLD_BAND",
    targetEffectStateAfter: "KILL",
    targetLifecycleAfter: "TERMINATED",
  });
  const target = result.frames[event.frameIndex].entities.find(
    (entity) => entity.id === commit.targetId,
  );
  target.lifecycle = "TERMINATED";
  target.targetEffect.state = "KILL";

  const selected = selectCanonicalTargetEffect(
    result,
    selectDisplayFrame(result, result.timeOfFlight),
  );
  assert.equal(selected.presentation.effectClass, "KILL");
  assert.equal(selected.presentation.killClaimAuthorized, true);
  assert.match(selected.presentation.headline, /scored a modeled kill/);
  assert.match(selected.presentation.detail, /MODEL_ASSUMPTION limitations:/);
  assert.match(selected.presentation.detail, /no outcome-probability model/);
});

test("report export carries the exact canonical target-effect event projection", () => {
  const definition = SCENARIO_LIBRARY.find((item) => item.id === "a2a-defensive-break");
  const result = simulate(definition.scenario);
  const event = committedEvent(result);
  const report = buildReportExport({
    scenario: definition.scenario,
    result,
    events: [],
    createdAt: "2026-08-30T00:00:00.000Z",
    engine: "test",
    profileVersion: "test",
  }, definition, "last-saved");

  assert.equal(report.result.targetEffect.eventId, event.id);
  assert.equal(report.result.targetEffect.effectClass, event.payload.commit.result);
  assert.equal(report.session.targetEffectEvent.eventId, event.id);
  assert.equal(report.session.targetEffectEvent.frameIndex, event.frameIndex);
  assert.equal(report.session.targetEffectEvent.time.value, event.modelTimeSeconds);
  assert.equal(report.result.targetEffect.killClaimAuthorized, false);
  assert.match(result.reason, /No governed target-effect result is available/);
  assert.doesNotMatch(result.reason, /\bkill(?:ed)?\b/i);
});
