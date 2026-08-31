import assert from "node:assert/strict";
import test from "node:test";
import {
  selectCanonicalTargetEffect,
  selectDisplayFrame,
} from "../lib/frontend/selectors.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { simulate } from "../lib/simulation.ts";
import { buildReportExport } from "../lib/report-export.ts";
import {
  assertTargetEffectEvaluation,
  evaluateTargetEffect,
  targetEffectCommitDigest,
} from "../lib/engine/target-effect.ts";

function governedIntercept() {
  return simulate(SCENARIO_LIBRARY.find((item) => item.id === "a2a-defensive-break").scenario);
}

function governedHighEnergy() {
  return simulate(SCENARIO_LIBRARY.find(
    (item) => item.id === "a2a-high-energy-crossing-challenge",
  ).scenario);
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

  const earlyTarget = result.frames[event.frameIndex - 1].entities.find(
    (entity) => entity.id === event.payload.commit.targetId,
  );
  earlyTarget.targetEffect = {
    commitId: event.payload.commit.commitId,
    state: event.payload.commit.result,
  };
  const forgedBefore = selectCanonicalTargetEffect(result, {
    frame: result.frames[event.frameIndex - 1],
    frameIndex: event.frameIndex - 1,
    displayTimeSeconds: result.frames[event.frameIndex - 1].t,
  });
  assert.equal(forgedBefore.presentation.state, "UNAVAILABLE");
  assert.match(forgedBefore.presentation.detail, /TARGET_EFFECT_BEFORE_CAUSAL_FRAME/);
  assert.equal(forgedBefore.presentation.killClaimAuthorized, false);
  delete earlyTarget.targetEffect;

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

test("selector requires exact target projection persistence and exclusive ownership on later frames", () => {
  const mutations = [
    {
      reason: "NON_TARGET_EFFECT_PROJECTION",
      apply(frame, event) {
        frame.entities.find(
          (entity) => entity.id !== event.payload.commit.targetId,
        ).targetEffect = {
          commitId: event.payload.commit.commitId,
          state: event.payload.commit.result,
        };
      },
    },
    {
      reason: "TARGET_EFFECT_PROJECTION_NOT_PERSISTED",
      apply(frame, event) {
        delete frame.entities.find(
          (entity) => entity.id === event.payload.commit.targetId,
        ).targetEffect;
      },
    },
    {
      reason: "TARGET_EFFECT_PROJECTION_NOT_PERSISTED",
      apply(frame, event) {
        frame.entities.find(
          (entity) => entity.id === event.payload.commit.targetId,
        ).targetEffect.state = "KILL";
      },
    },
  ];
  for (const mutation of mutations) {
    const result = governedHighEnergy();
    const event = committedEvent(result);
    const laterFrame = structuredClone(result.frames[event.frameIndex]);
    laterFrame.t = Number((laterFrame.t + result.engineRun.scenario.fixedStepSeconds).toFixed(6));
    result.frames.push(laterFrame);
    const positive = selectCanonicalTargetEffect(result, {
      frame: laterFrame,
      frameIndex: event.frameIndex + 1,
      displayTimeSeconds: laterFrame.t,
    });
    assert.equal(positive.presentation.effectClass, event.payload.commit.result);

    mutation.apply(laterFrame, event);
    const rejected = selectCanonicalTargetEffect(result, {
      frame: laterFrame,
      frameIndex: event.frameIndex + 1,
      displayTimeSeconds: laterFrame.t,
    });
    assert.equal(rejected.presentation.state, "UNAVAILABLE");
    assert.match(rejected.presentation.detail, new RegExp(mutation.reason));
    assert.equal(rejected.presentation.killClaimAuthorized, false);
  }
});

test("an admitted-model EFFECT_UNAVAILABLE retains model limitations and commit reason", () => {
  for (const reason of ["OUTSIDE_TARGET_DOMAIN", "TARGET_UNAVAILABLE"]) {
    const result = governedHighEnergy();
    const event = committedEvent(result);
    const causalEvent = result.engineRun.events.items.find(
      (candidate) => candidate.id === event.causeEventIds[0],
    );
    const target = result.frames[event.frameIndex].entities.find(
      (entity) => entity.id === event.payload.commit.targetId,
    );
    const priorTarget = result.frames[event.frameIndex - 1].entities.find(
      (entity) => entity.id === event.payload.commit.targetId,
    );
    const model = result.engineRun.scenario.targetEffectAuthority.models[0];
    if (reason === "OUTSIDE_TARGET_DOMAIN") target.speedMps = 700;
    if (reason === "TARGET_UNAVAILABLE") {
      target.lifecycle = "TERMINATED";
      priorTarget.lifecycle = "TERMINATED";
    }
    const evaluation = evaluateTargetEffect({
      modelPackDigest: result.engineRun.scenario.targetEffectAuthority.digest,
      model,
      weaponId: event.payload.commit.weaponId,
      termination: {
        receipt: { tick: causalEvent.tick, localKey: causalEvent.localKey },
        cause: causalEvent.payload.cause,
        closestApproachM: causalEvent.payload.closestApproachM,
        modelTimeSeconds: causalEvent.modelTimeSeconds,
      },
      target: {
        entityId: target.id,
        kind: target.kind,
        lifecycle: target.lifecycle,
        massKg: target.massKg,
        speedMps: target.speedMps,
        altitudeMslM: target.position.z,
      },
    });
    event.payload.commit = structuredClone(evaluation);
    target.targetEffect = {
      commitId: evaluation.commitId,
      state: evaluation.result,
    };

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

test("coordinated terminal-effect frame forgery fails with a stale or resealed commit identity", () => {
  for (const reseal of [false, true]) {
    const result = governedIntercept();
    const event = committedEvent(result);
    const originalCommitId = event.payload.commit.commitId;
    const causalEvent = result.engineRun.events.items.find(
      (candidate) => candidate.id === event.causeEventIds[0],
    );
    const target = result.frames[event.frameIndex].entities.find(
      (entity) => entity.id === event.payload.commit.targetId,
    );
    const authority = result.engineRun.scenario.targetEffectAuthority;
    const model = authority.models[0];
    const forged = structuredClone(evaluateTargetEffect({
      modelPackDigest: authority.digest,
      model,
      weaponId: event.payload.commit.weaponId,
      termination: {
        receipt: {
          tick: causalEvent.tick,
          localKey: causalEvent.localKey,
        },
        cause: causalEvent.payload.cause,
        closestApproachM: 1,
        modelTimeSeconds: causalEvent.modelTimeSeconds,
      },
      target: {
        entityId: target.id,
        kind: target.kind,
        lifecycle: "ACTIVE",
        massKg: target.massKg,
        speedMps: target.speedMps,
        altitudeMslM: target.position.z,
      },
    }));
    if (!reseal) forged.commitId = originalCommitId;
    event.payload.commit = forged;
    target.lifecycle = "TERMINATED";
    target.targetEffect = { commitId: forged.commitId, state: "KILL" };

    const selected = selectCanonicalTargetEffect(
      result,
      selectDisplayFrame(result, result.timeOfFlight),
    );
    assert.equal(selected.presentation.state, "UNAVAILABLE");
    assert.match(
      selected.presentation.detail,
      reseal
        ? /TARGET_EFFECT_REEVALUATION_MISMATCH/
        : /TARGET_EFFECT_COMMIT_INVALID/,
    );
    assert.equal(selected.presentation.killClaimAuthorized, false);
    assert.doesNotMatch(
      `${selected.presentation.label} ${selected.presentation.headline} ${selected.presentation.detail}`,
      /\bkill(?:ed)?\b/i,
    );
  }
});

test("resealed high-energy KILL with an invented threshold cannot override independent evaluation", () => {
  const result = governedHighEnergy();
  const event = committedEvent(result);
  const target = result.frames[event.frameIndex].entities.find(
    (entity) => entity.id === event.payload.commit.targetId,
  );
  assert.equal(event.payload.commit.closestApproachM, 21.836104);
  assert.equal(event.payload.commit.result, "NO_EFFECT");

  const forged = structuredClone(event.payload.commit);
  Object.assign(forged, {
    result: "KILL",
    reason: "THRESHOLD_BAND",
    selectedThresholdUpperBoundM: 21.836104,
    targetEffectStateAfter: "KILL",
    targetLifecycleAfter: "TERMINATED",
  });
  const material = structuredClone(forged);
  Reflect.deleteProperty(material, "commitId");
  forged.commitId = targetEffectCommitDigest(material);
  assert.doesNotThrow(() => assertTargetEffectEvaluation(forged));
  event.payload.commit = forged;
  target.lifecycle = "TERMINATED";
  target.targetEffect = { commitId: forged.commitId, state: "KILL" };

  const selected = selectCanonicalTargetEffect(
    result,
    selectDisplayFrame(result, result.timeOfFlight),
  );
  assert.equal(selected.presentation.state, "UNAVAILABLE");
  assert.match(selected.presentation.detail, /TARGET_EFFECT_REEVALUATION_MISMATCH/);
  assert.equal(selected.presentation.killClaimAuthorized, false);
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
  const unsupportedProjection = selectCanonicalTargetEffect(
    result,
    selectDisplayFrame(result, result.timeOfFlight),
  );
  assert.equal(unsupportedProjection.presentation.state, "UNAVAILABLE");
  assert.match(
    unsupportedProjection.presentation.detail,
    /TARGET_EFFECT_WITHOUT_CAUSAL_EVENT/,
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
  const result = governedHighEnergy();
  const event = committedEvent(result);
  const model = result.engineRun.scenario.targetEffectAuthority.models[0];
  const causalEvent = result.engineRun.events.items.find(
    (candidate) => candidate.id === event.causeEventIds[0],
  );
  const target = result.frames[event.frameIndex].entities.find(
    (entity) => entity.id === event.payload.commit.targetId,
  );
  causalEvent.payload.closestApproachM = 1;
  const commit = evaluateTargetEffect({
    modelPackDigest: result.engineRun.scenario.targetEffectAuthority.digest,
    model,
    weaponId: event.payload.commit.weaponId,
    termination: {
      receipt: { tick: causalEvent.tick, localKey: causalEvent.localKey },
      cause: causalEvent.payload.cause,
      closestApproachM: causalEvent.payload.closestApproachM,
      modelTimeSeconds: causalEvent.modelTimeSeconds,
    },
    target: {
      entityId: target.id,
      kind: target.kind,
      lifecycle: "ACTIVE",
      massKg: target.massKg,
      speedMps: target.speedMps,
      altitudeMslM: target.position.z,
    },
  });
  event.payload.commit = structuredClone(commit);
  target.lifecycle = "TERMINATED";
  target.targetEffect = { commitId: commit.commitId, state: "KILL" };

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
