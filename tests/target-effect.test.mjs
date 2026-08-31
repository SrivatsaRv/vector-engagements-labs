import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  assertTargetEffectEvaluation,
  assertTargetEffectModel,
  canonicalTargetEffectNumber,
  createTargetEffectModel,
  evaluateTargetEffect,
  targetEffectModelDigest,
} from "../lib/engine/target-effect.ts";
import { canonicalJson } from "../lib/canonical-json.ts";
import {
  assertTargetEffectAuthority,
  resolveTargetEffectAuthority,
} from "../lib/engine/target-effect-authority.ts";
import {
  assertRetainedTargetEffectAuthority,
  CURRENT_TARGET_EFFECT_AUTHORITY,
} from "../lib/engine/retained-target-effect-authority.ts";

const MODEL_PACK_DIGEST = "1".repeat(64);

function material(overrides = {}) {
  return {
    schemaVersion: "vector.target-effect-model.v1",
    id: "generic-aircraft-radial-effect-v1",
    version: "1.0.0",
    intendedUse: {
      id: "vector.intended-use.generic-target-effect-study",
      version: "1.0.0",
    },
    evaluator: "DETERMINISTIC_RADIAL_THRESHOLD_BANDS",
    sampling: "NONE",
    valueState: "MODEL_ASSUMPTION",
    evidenceRefIds: ["generic-effect-assumption"],
    limitationIds: ["not-named-system-effectiveness"],
    fuze: {
      mode: "GENERIC_PROXIMITY",
      activationMaximumDistanceM: 25,
      evidenceRefIds: ["generic-effect-assumption"],
    },
    warhead: {
      model: "GENERIC_RADIAL_DISTANCE_EFFECT",
      evidenceRefIds: ["generic-effect-assumption"],
    },
    targetProfile: {
      id: "generic-aircraft-susceptibility-v1",
      version: "1.0.0",
      targetKind: "AIRCRAFT",
      evidenceRefIds: ["generic-effect-assumption"],
      minimumMassKg: 5_000,
      maximumMassKg: 40_000,
      minimumSpeedMps: 100,
      maximumSpeedMps: 500,
      minimumAltitudeMslM: 0,
      maximumAltitudeMslM: 20_000,
    },
    thresholds: {
      killMaximumDistanceM: 4,
      missionKillMaximumDistanceM: 10,
      degradedMaximumDistanceM: 20,
    },
    ...overrides,
  };
}

const MODEL = createTargetEffectModel(material());

function evaluationInput(overrides = {}) {
  return {
    modelPackDigest: MODEL_PACK_DIGEST,
    model: MODEL,
    weaponId: "blue-weapon-1",
    termination: {
      receipt: { tick: 100, localKey: "weapon-terminated:blue-weapon-1" },
      cause: "GEOMETRIC_INTERCEPT",
      closestApproachM: 3,
      modelTimeSeconds: 5,
    },
    target: {
      entityId: "red-aircraft-1",
      kind: "AIRCRAFT",
      lifecycle: "ACTIVE",
      massKg: 12_000,
      speedMps: 250,
      altitudeMslM: 9_000,
    },
    ...overrides,
  };
}

function independentlyReseal(evaluation) {
  const material = structuredClone(evaluation);
  delete material.commitId;
  evaluation.commitId = createHash("sha256")
    .update(canonicalJson(material))
    .digest("hex");
  return evaluation;
}

test("target-effect models have exact content-addressed structure", () => {
  assert.match(MODEL.digest, /^[a-f0-9]{64}$/);
  assert.equal(MODEL.digest, targetEffectModelDigest(material()));
  assert.deepEqual(createTargetEffectModel(structuredClone(material())), MODEL);
  assert.equal(Object.isFrozen(MODEL), true);
  assert.equal(Object.isFrozen(MODEL.targetProfile), true);

  const reordered = {
    thresholds: material().thresholds,
    targetProfile: material().targetProfile,
    warhead: material().warhead,
    fuze: material().fuze,
    limitationIds: material().limitationIds,
    evidenceRefIds: material().evidenceRefIds,
    valueState: material().valueState,
    sampling: material().sampling,
    evaluator: material().evaluator,
    intendedUse: material().intendedUse,
    version: material().version,
    id: material().id,
    schemaVersion: material().schemaVersion,
  };
  assert.equal(targetEffectModelDigest(reordered), MODEL.digest);
});

test("target-effect authority rejects missing, extra, malformed, and digest-mutated fields", () => {
  const cases = [
    ["missing", (value) => { delete value.fuze; }],
    ["extra", (value) => { value.namedWeapon = "Astra"; }],
    ["nested extra", (value) => { value.thresholds.probabilityOfKill = 0.9; }],
    ["schema", (value) => { value.schemaVersion = "vector.target-effect-model.v0"; }],
    ["intended use", (value) => { value.intendedUse.id = "vector.intended-use.geometry-teaching"; }],
    ["sampling", (value) => { value.sampling = "RANDOM"; }],
    ["non-finite", (value) => { value.thresholds.killMaximumDistanceM = Number.NaN; }],
    ["threshold order", (value) => { value.thresholds.killMaximumDistanceM = 11; }],
    ["activation coverage", (value) => { value.fuze.activationMaximumDistanceM = 19; }],
    ["domain order", (value) => { value.targetProfile.minimumMassKg = 50_000; }],
    ["foreign evidence", (value) => { value.fuze.evidenceRefIds = ["foreign-evidence"]; }],
  ];
  for (const [name, mutate] of cases) {
    const value = material();
    mutate(value);
    assert.throws(() => createTargetEffectModel(value), { name: "TypeError" }, name);
  }

  const digestMutation = structuredClone(MODEL);
  digestMutation.thresholds.killMaximumDistanceM = 3.5;
  assert.throws(() => assertTargetEffectModel(digestMutation), /digest/i);
});

test("retained authority binds exact weapon and assigned-target model identities", () => {
  assert.doesNotThrow(() => assertTargetEffectAuthority(CURRENT_TARGET_EFFECT_AUTHORITY));
  assert.doesNotThrow(() => assertRetainedTargetEffectAuthority(CURRENT_TARGET_EFFECT_AUTHORITY));
  const weapon = {
    id: "blue-weapon-1",
    kind: "GUIDED_WEAPON",
    provenance: {
      modelId: "astra-mk1-study-v05",
      modelVersion: "0.5.0",
      modelPackDigest: "aecedbb6868395bb6ee2b46c4867c032d358210b1aa5a719cb5a868b24f5917c",
    },
    weapon: { targetEntityId: "red-object-1" },
  };
  const target = {
    id: "red-object-1",
    kind: "AIRCRAFT",
    provenance: {
      modelId: "f-16c-block52-aircraft-study-v05",
      modelVersion: "0.5.0",
      modelPackDigest: "aecedbb6868395bb6ee2b46c4867c032d358210b1aa5a719cb5a868b24f5917c",
    },
  };
  const resolved = resolveTargetEffectAuthority(
    CURRENT_TARGET_EFFECT_AUTHORITY,
    weapon,
    target,
  );
  assert.equal(resolved.binding.id, "astra-study-to-f16-study-target-effect-v1");
  assert.equal(resolved.model.id, "generic-aircraft-radial-effect-study-v1");

  assert.throws(
    () => resolveTargetEffectAuthority(
      CURRENT_TARGET_EFFECT_AUTHORITY,
      { ...weapon, provenance: { ...weapon.provenance, modelId: "renamed-weapon-model" } },
      target,
    ),
    /no exact weapon\/assigned-target binding/i,
  );
  assert.throws(
    () => resolveTargetEffectAuthority(
      CURRENT_TARGET_EFFECT_AUTHORITY,
      weapon,
      { ...target, id: "substitute-target" },
    ),
    /no exact weapon\/assigned-target binding/i,
  );

  const resealedLooking = structuredClone(CURRENT_TARGET_EFFECT_AUTHORITY);
  resealedLooking.models[0].thresholds.killMaximumDistanceM = 3;
  assert.throws(() => assertRetainedTargetEffectAuthority(resealedLooking));
});

test("independent threshold-band oracle covers immediately below, equal, and above each boundary", () => {
  const oracle = [
    [3.999999, "KILL", 4],
    [4, "KILL", 4],
    [4.000001, "MISSION_KILL", 10],
    [9.999999, "MISSION_KILL", 10],
    [10, "MISSION_KILL", 10],
    [10.000001, "DEGRADED", 20],
    [19.999999, "DEGRADED", 20],
    [20, "DEGRADED", 20],
    [20.000001, "NO_EFFECT", null],
    [25, "NO_EFFECT", null],
  ];
  for (const [closestApproachM, expected, threshold] of oracle) {
    const result = evaluateTargetEffect(evaluationInput({
      termination: {
        ...evaluationInput().termination,
        closestApproachM,
      },
    }));
    assert.equal(result.result, expected, `${closestApproachM} m`);
    assert.equal(result.selectedThresholdUpperBoundM, threshold, `${closestApproachM} m threshold`);
  }
});

test("the same termination and target state contrast under two admitted packs", () => {
  const broaderKillModel = createTargetEffectModel(material({
    id: "generic-aircraft-radial-effect-contrast-v1",
    thresholds: {
      killMaximumDistanceM: 7,
      missionKillMaximumDistanceM: 12,
      degradedMaximumDistanceM: 22,
    },
  }));
  const termination = {
    ...evaluationInput().termination,
    closestApproachM: 6,
  };
  assert.equal(evaluateTargetEffect(evaluationInput({ termination })).result, "MISSION_KILL");
  assert.equal(
    evaluateTargetEffect(evaluationInput({ model: broaderKillModel, termination })).result,
    "KILL",
  );
});

test("display labels, affiliation, and scenario names cannot alter the causal result", () => {
  const baseline = evaluateTargetEffect(evaluationInput());
  const relabelled = evaluateTargetEffect({
    ...evaluationInput(),
    weaponDisplayLabel: "Completely different weapon label",
    targetDisplayLabel: "Completely different aircraft label",
    affiliation: "NEUTRAL",
    scenarioName: "Renamed demonstration",
  });
  assert.deepEqual(relabelled, baseline);
});

test("non-geometric termination and absent authority fail closed without an effect", () => {
  for (const cause of [
    "ENERGY_DEPLETED",
    "FLIGHT_TIME_EXPIRED",
    "TERRAIN_IMPACT",
    "TARGET_UNAVAILABLE",
  ]) {
    const result = evaluateTargetEffect(evaluationInput({
      termination: { ...evaluationInput().termination, cause },
    }));
    assert.equal(result.result, "NO_EFFECT", cause);
    assert.equal(result.reason, "TERMINATION_NOT_EFFECT_ELIGIBLE", cause);
    assert.equal(result.targetLifecycleAfter, "ACTIVE", cause);
  }

  const unavailable = evaluateTargetEffect(evaluationInput({ model: null }));
  assert.equal(unavailable.result, "EFFECT_UNAVAILABLE");
  assert.equal(unavailable.reason, "AUTHORITY_UNAVAILABLE");
  assert.equal(unavailable.modelDigest, null);
  assert.equal(unavailable.targetLifecycleAfter, "ACTIVE");
});

test("target-domain boundaries are inclusive and every outside value is unavailable", () => {
  const fields = [
    ["massKg", 5_000, 40_000, 4_999.999999, 40_000.000001],
    ["speedMps", 100, 500, 99.999999, 500.000001],
    ["altitudeMslM", 0, 20_000, -0.000001, 20_000.000001],
  ];
  for (const [field, minimum, maximum, below, above] of fields) {
    for (const admitted of [minimum, maximum]) {
      const result = evaluateTargetEffect(evaluationInput({
        target: { ...evaluationInput().target, [field]: admitted },
      }));
      assert.equal(result.result, "KILL", `${field}=${admitted}`);
    }
    for (const unavailable of [below, above]) {
      const result = evaluateTargetEffect(evaluationInput({
        target: { ...evaluationInput().target, [field]: unavailable },
      }));
      assert.equal(result.result, "EFFECT_UNAVAILABLE", `${field}=${unavailable}`);
      assert.equal(result.reason, "OUTSIDE_TARGET_DOMAIN", `${field}=${unavailable}`);
    }
  }

  const wrongKind = evaluateTargetEffect(evaluationInput({
    target: { ...evaluationInput().target, kind: "FIXED_OBJECTIVE" },
  }));
  assert.equal(wrongKind.result, "EFFECT_UNAVAILABLE");
  assert.equal(wrongKind.reason, "OUTSIDE_TARGET_DOMAIN");

  const unavailableTarget = evaluateTargetEffect(evaluationInput({
    target: { ...evaluationInput().target, lifecycle: "TERMINATED" },
  }));
  assert.equal(unavailableTarget.result, "EFFECT_UNAVAILABLE");
  assert.equal(unavailableTarget.reason, "TARGET_UNAVAILABLE");
});

test("effect state and target lifecycle transitions remain closed", () => {
  const expected = [
    [3, "KILL", "TERMINATED"],
    [6, "MISSION_KILL", "TERMINATED"],
    [15, "DEGRADED", "ACTIVE"],
    [23, "NO_EFFECT", "ACTIVE"],
  ];
  for (const [closestApproachM, effect, lifecycle] of expected) {
    const result = evaluateTargetEffect(evaluationInput({
      termination: { ...evaluationInput().termination, closestApproachM },
    }));
    assert.equal(result.targetEffectStateBefore, "UNRESOLVED");
    assert.equal(result.targetEffectStateAfter, effect);
    assert.equal(result.targetLifecycleBefore, "ACTIVE");
    assert.equal(result.targetLifecycleAfter, lifecycle);
  }
});

test("commit identity is deterministic and binds every causal authority input", () => {
  const first = evaluateTargetEffect(evaluationInput());
  const second = evaluateTargetEffect(structuredClone(evaluationInput()));
  assert.doesNotThrow(() => assertTargetEffectEvaluation(first));
  assert.equal(first.commitId, second.commitId);
  assert.match(first.commitId, /^[a-f0-9]{64}$/);
  assert.deepEqual(first.terminationReceipt, {
    tick: 100,
    localKey: "weapon-terminated:blue-weapon-1",
    cause: "GEOMETRIC_INTERCEPT",
    modelTimeSeconds: 5,
  });

  const changes = [
    { weaponId: "blue-weapon-2" },
    { modelPackDigest: "2".repeat(64) },
    { termination: {
      ...evaluationInput().termination,
      receipt: { tick: 100, localKey: "weapon-terminated:blue-weapon-2" },
    } },
    { termination: { ...evaluationInput().termination, closestApproachM: 3.5 } },
    { target: { ...evaluationInput().target, speedMps: 251 } },
  ];
  for (const change of changes) {
    assert.notEqual(evaluateTargetEffect(evaluationInput(change)).commitId, first.commitId);
  }
});

test("commit identity consumes the canonical six-decimal causal projection", () => {
  const typescriptDrift = evaluateTargetEffect(evaluationInput({
    termination: {
      ...evaluationInput().termination,
      modelTimeSeconds: 5.000000000000001,
    },
    target: {
      ...evaluationInput().target,
      massKg: 12_000.000000000002,
      speedMps: 60.64609313343199,
      altitudeMslM: 9_000.000000000004,
    },
  }));
  const rustDrift = evaluateTargetEffect(evaluationInput({
    termination: {
      ...evaluationInput().termination,
      modelTimeSeconds: 5.000000000000002,
    },
    target: {
      ...evaluationInput().target,
      massKg: 12_000.000000000004,
      speedMps: 60.64609313343203,
      altitudeMslM: 9_000.000000000005,
    },
  }));

  assert.equal(typescriptDrift.commitId, rustDrift.commitId);
  assert.equal(typescriptDrift.targetSpeedMps, 60.646093);
  assert.equal(typescriptDrift.targetMassKg, 12_000);
  assert.equal(typescriptDrift.targetAltitudeMslM, 9_000);
  assert.equal(typescriptDrift.terminationReceipt.modelTimeSeconds, 5);
  assert.equal(canonicalTargetEffectNumber(-0.0000001), 0);

  const materiallyDifferent = evaluateTargetEffect(evaluationInput({
    target: { ...evaluationInput().target, speedMps: 60.646095 },
  }));
  assert.notEqual(typescriptDrift.commitId, materiallyDifferent.commitId);
});

test("strict evaluation admission rejects malformed and resealed contradictory commits", () => {
  const baseline = evaluateTargetEffect(evaluationInput());
  const unavailable = evaluateTargetEffect(evaluationInput({ model: null }));
  const targetUnavailable = evaluateTargetEffect(evaluationInput({
    target: { ...evaluationInput().target, lifecycle: "TERMINATED" },
  }));
  assert.doesNotThrow(() => assertTargetEffectEvaluation(baseline));
  assert.doesNotThrow(() => assertTargetEffectEvaluation(unavailable));
  assert.doesNotThrow(() => assertTargetEffectEvaluation(targetUnavailable));

  const digestMutation = structuredClone(baseline);
  digestMutation.closestApproachM = 2;
  assert.throws(
    () => assertTargetEffectEvaluation(digestMutation),
    /commit digest does not match/i,
  );

  const cases = [
    ["top-level extra key", baseline, (value) => { value.probabilityOfKill = 0.95; }],
    ["top-level missing key", baseline, (value) => { delete value.targetMassKg; }],
    ["receipt extra key", baseline, (value) => { value.terminationReceipt.eventId = "event-1"; }],
    ["receipt missing key", baseline, (value) => { delete value.terminationReceipt.localKey; }],
    ["closed result", baseline, (value) => { value.result = "DESTROYED"; }],
    ["closed reason", baseline, (value) => { value.reason = "PROBABILISTIC_KILL"; }],
    ["closed lifecycle", baseline, (value) => { value.targetLifecycleAfter = "DESTROYED"; }],
    ["closed cause", baseline, (value) => { value.terminationReceipt.cause = "DETONATED"; }],
    ["fractional tick", baseline, (value) => { value.terminationReceipt.tick = 1.5; }],
    ["negative model time", baseline, (value) => { value.terminationReceipt.modelTimeSeconds = -1; }],
    ["noncanonical model time", baseline, (value) => {
      value.terminationReceipt.modelTimeSeconds = 5.0000001;
    }],
    ["noncanonical target speed", baseline, (value) => {
      value.targetSpeedMps = 250.0000001;
    }],
    ["partial authority", baseline, (value) => { value.modelId = null; }],
    ["authority value state", baseline, (value) => { value.valueState = "UNAVAILABLE"; }],
    ["absent-authority value state", unavailable, (value) => {
      value.valueState = "MODEL_ASSUMPTION";
    }],
    ["effect state mismatch", baseline, (value) => { value.targetEffectStateAfter = "NO_EFFECT"; }],
    ["kill lifecycle mismatch", baseline, (value) => { value.targetLifecycleAfter = "ACTIVE"; }],
    ["kill reason mismatch", baseline, (value) => { value.reason = "ABOVE_EFFECT_BANDS"; }],
    ["kill threshold absent", baseline, (value) => { value.selectedThresholdUpperBoundM = null; }],
    ["kill outside selected threshold", baseline, (value) => {
      value.selectedThresholdUpperBoundM = 2;
    }],
    ["non-geometric kill", baseline, (value) => {
      value.terminationReceipt.cause = "ENERGY_DEPLETED";
    }],
    ["authority-unavailable kill", baseline, (value) => {
      value.modelId = null;
      value.modelVersion = null;
      value.modelDigest = null;
      value.intendedUseId = null;
      value.intendedUseVersion = null;
      value.targetProfileId = null;
      value.targetProfileVersion = null;
      value.valueState = "UNAVAILABLE";
    }],
    ["target-unavailable lifecycle mismatch", targetUnavailable, (value) => {
      value.targetLifecycleBefore = "ACTIVE";
      value.targetLifecycleAfter = "ACTIVE";
    }],
    ["unavailable reason with authority absent", unavailable, (value) => {
      value.reason = "OUTSIDE_TARGET_DOMAIN";
    }],
  ];
  for (const [name, source, mutate] of cases) {
    const value = structuredClone(source);
    mutate(value);
    independentlyReseal(value);
    assert.throws(
      () => assertTargetEffectEvaluation(value),
      { name: "TypeError" },
      name,
    );
  }
});

test("non-finite or malformed causal inputs reject before evaluation", () => {
  const cases = [
    { modelPackDigest: "not-a-digest" },
    { termination: { ...evaluationInput().termination, closestApproachM: Number.NaN } },
    { termination: {
      ...evaluationInput().termination,
      receipt: { ...evaluationInput().termination.receipt, tick: 1.5 },
    } },
    { target: { ...evaluationInput().target, massKg: Number.POSITIVE_INFINITY } },
    { target: { ...evaluationInput().target, speedMps: -1 } },
    { target: { ...evaluationInput().target, lifecycle: "DESTROYED" } },
  ];
  for (const value of cases) {
    assert.throws(() => evaluateTargetEffect(evaluationInput(value)), { name: "TypeError" });
  }
});
