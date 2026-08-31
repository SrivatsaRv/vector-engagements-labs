import { canonicalJson } from "../canonical-json.ts";
import { sha256HexBytesSync } from "../geospatial/digest.ts";

export const TARGET_EFFECT_MODEL_SCHEMA = "vector.target-effect-model.v1" as const;
export const TARGET_EFFECT_COMMIT_SCHEMA = "vector.target-effect-commit.v1" as const;
export const TARGET_EFFECT_INTENDED_USE_ID =
  "vector.intended-use.generic-target-effect-study" as const;

export type TargetEffectResult =
  | "NO_EFFECT"
  | "DEGRADED"
  | "MISSION_KILL"
  | "KILL"
  | "EFFECT_UNAVAILABLE";

export type TargetEffectReason =
  | "THRESHOLD_BAND"
  | "ABOVE_EFFECT_BANDS"
  | "TERMINATION_NOT_EFFECT_ELIGIBLE"
  | "AUTHORITY_UNAVAILABLE"
  | "OUTSIDE_TARGET_DOMAIN"
  | "TARGET_UNAVAILABLE";

export type TargetEffectEntityLifecycle =
  | "STOWED"
  | "ACTIVE"
  | "TRACKING"
  | "ENGAGING"
  | "TERMINATED";

export type TargetEffectModelMaterialV1 = {
  schemaVersion: typeof TARGET_EFFECT_MODEL_SCHEMA;
  id: string;
  version: string;
  intendedUse: {
    id: typeof TARGET_EFFECT_INTENDED_USE_ID;
    version: string;
  };
  evaluator: "DETERMINISTIC_RADIAL_THRESHOLD_BANDS";
  sampling: "NONE";
  valueState: "MODEL_ASSUMPTION";
  evidenceRefIds: string[];
  limitationIds: string[];
  fuze: {
    mode: "GENERIC_PROXIMITY";
    activationMaximumDistanceM: number;
    evidenceRefIds: string[];
  };
  warhead: {
    model: "GENERIC_RADIAL_DISTANCE_EFFECT";
    evidenceRefIds: string[];
  };
  targetProfile: {
    id: string;
    version: string;
    targetKind: "AIRCRAFT";
    evidenceRefIds: string[];
    minimumMassKg: number;
    maximumMassKg: number;
    minimumSpeedMps: number;
    maximumSpeedMps: number;
    minimumAltitudeMslM: number;
    maximumAltitudeMslM: number;
  };
  thresholds: {
    killMaximumDistanceM: number;
    missionKillMaximumDistanceM: number;
    degradedMaximumDistanceM: number;
  };
};

export type TargetEffectModelV1 = TargetEffectModelMaterialV1 & {
  digest: string;
};

export type TargetEffectTerminationInput = {
  receipt: {
    tick: number;
    localKey: string;
  };
  cause:
    | "GEOMETRIC_INTERCEPT"
    | "ENERGY_DEPLETED"
    | "FLIGHT_TIME_EXPIRED"
    | "TERRAIN_IMPACT"
    | "TARGET_UNAVAILABLE";
  closestApproachM: number;
  modelTimeSeconds: number;
};

export type TargetEffectTargetInput = {
  entityId: string;
  kind: string;
  lifecycle: TargetEffectEntityLifecycle;
  massKg: number;
  speedMps: number;
  altitudeMslM: number;
};

export type TargetEffectEvaluationInput = {
  modelPackDigest: string;
  model: Readonly<TargetEffectModelV1> | null;
  weaponId: string;
  termination: TargetEffectTerminationInput;
  target: TargetEffectTargetInput;
};

export type TargetEffectEvaluation = {
  schemaVersion: typeof TARGET_EFFECT_COMMIT_SCHEMA;
  commitId: string;
  modelPackDigest: string;
  modelId: string | null;
  modelVersion: string | null;
  modelDigest: string | null;
  intendedUseId: string | null;
  intendedUseVersion: string | null;
  targetProfileId: string | null;
  targetProfileVersion: string | null;
  weaponId: string;
  targetId: string;
  terminationReceipt: {
    tick: number;
    localKey: string;
    cause: TargetEffectTerminationInput["cause"];
    modelTimeSeconds: number;
  };
  valueState: "MODEL_ASSUMPTION" | "UNAVAILABLE";
  result: TargetEffectResult;
  reason: TargetEffectReason;
  closestApproachM: number;
  targetMassKg: number;
  targetSpeedMps: number;
  targetAltitudeMslM: number;
  selectedThresholdUpperBoundM: number | null;
  targetEffectStateBefore: "UNRESOLVED";
  targetEffectStateAfter: TargetEffectResult;
  targetLifecycleBefore: TargetEffectEntityLifecycle;
  targetLifecycleAfter: TargetEffectEntityLifecycle;
};

const MODEL_KEYS = [
  "schemaVersion", "id", "version", "digest", "intendedUse", "evaluator",
  "sampling", "valueState", "evidenceRefIds", "limitationIds", "fuze",
  "warhead", "targetProfile", "thresholds",
] as const;
const MATERIAL_KEYS = MODEL_KEYS.filter((key) => key !== "digest");
const INTENDED_USE_KEYS = ["id", "version"] as const;
const FUZE_KEYS = ["mode", "activationMaximumDistanceM", "evidenceRefIds"] as const;
const WARHEAD_KEYS = ["model", "evidenceRefIds"] as const;
const TARGET_PROFILE_KEYS = [
  "id", "version", "targetKind", "evidenceRefIds", "minimumMassKg",
  "maximumMassKg", "minimumSpeedMps", "maximumSpeedMps",
  "minimumAltitudeMslM", "maximumAltitudeMslM",
] as const;
const THRESHOLD_KEYS = [
  "killMaximumDistanceM", "missionKillMaximumDistanceM",
  "degradedMaximumDistanceM",
] as const;
const EVALUATION_KEYS = [
  "schemaVersion", "commitId", "modelPackDigest", "modelId", "modelVersion",
  "modelDigest", "intendedUseId", "intendedUseVersion", "targetProfileId",
  "targetProfileVersion", "weaponId", "targetId", "terminationReceipt",
  "valueState", "result", "reason", "closestApproachM", "targetMassKg",
  "targetSpeedMps", "targetAltitudeMslM", "selectedThresholdUpperBoundM",
  "targetEffectStateBefore", "targetEffectStateAfter", "targetLifecycleBefore",
  "targetLifecycleAfter",
] as const;
const TERMINATION_RECEIPT_KEYS = [
  "tick", "localKey", "cause", "modelTimeSeconds",
] as const;
const DIGEST = /^[a-f0-9]{64}$/;
const STABLE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const LIFECYCLES = new Set<TargetEffectEntityLifecycle>([
  "STOWED", "ACTIVE", "TRACKING", "ENGAGING", "TERMINATED",
]);
const TERMINATION_CAUSES = new Set<TargetEffectTerminationInput["cause"]>([
  "GEOMETRIC_INTERCEPT", "ENERGY_DEPLETED", "FLIGHT_TIME_EXPIRED",
  "TERRAIN_IMPACT", "TARGET_UNAVAILABLE",
]);
const RESULTS = new Set<TargetEffectResult>([
  "NO_EFFECT", "DEGRADED", "MISSION_KILL", "KILL", "EFFECT_UNAVAILABLE",
]);
const REASONS = new Set<TargetEffectReason>([
  "THRESHOLD_BAND", "ABOVE_EFFECT_BANDS", "TERMINATION_NOT_EFFECT_ELIGIBLE",
  "AUTHORITY_UNAVAILABLE", "OUTSIDE_TARGET_DOMAIN", "TARGET_UNAVAILABLE",
]);
const TARGET_EFFECT_DECIMAL_PLACES = 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: unknown,
  keys: readonly string[],
  path: string,
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${path} must be an object.`);
  const allowed = new Set(keys);
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) throw new TypeError(`${path} is missing ${key}.`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${path} contains unsupported field ${key}.`);
  }
}

function finite(value: unknown, path: string, minimum?: number) {
  if (typeof value !== "number" || !Number.isFinite(value) ||
      (minimum !== undefined && value < minimum)) {
    throw new TypeError(`${path} is outside its finite domain.`);
  }
  return value;
}

/**
 * Canonical numeric boundary for target-effect causality. Engine backends may
 * differ below the retained event precision after otherwise equivalent f64
 * integration. Effect decisions and commit identity consume this projection,
 * never a backend's unretained internal precision.
 */
export function canonicalTargetEffectNumber(value: number) {
  finite(value, "Target-effect canonical number");
  const rounded = Number(value.toFixed(TARGET_EFFECT_DECIMAL_PLACES));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function requireCanonicalTargetEffectNumber(value: number, path: string) {
  if (canonicalTargetEffectNumber(value) !== value) {
    throw new TypeError(`${path} must use canonical six-decimal precision.`);
  }
}

function stableId(value: unknown, path: string) {
  if (typeof value !== "string" || !STABLE_ID.test(value)) {
    throw new TypeError(`${path} must be a stable identifier.`);
  }
}

function stableLocalKey(value: unknown, path: string) {
  if (typeof value !== "string" || value.length === 0 || value.length > 512 ||
      /[\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError(`${path} must be a bounded non-control string.`);
  }
}

function version(value: unknown, path: string) {
  if (typeof value !== "string" || !VERSION.test(value)) {
    throw new TypeError(`${path} must be a semantic version.`);
  }

}

function identifiers(value: unknown, path: string, requireNonEmpty = true) {
  if (!Array.isArray(value) || (requireNonEmpty && value.length === 0)) {
    throw new TypeError(`${path} must be ${requireNonEmpty ? "a non-empty" : "an"} identifier array.`);
  }
  value.forEach((item, index) => stableId(item, `${path}[${index}]`));
  if (new Set(value).size !== value.length) {
    throw new TypeError(`${path} must not contain duplicate identifiers.`);
  }
  return value as string[];
}

function requireEvidenceSubset(
  references: readonly string[],
  admitted: ReadonlySet<string>,
  path: string,
) {
  for (const reference of references) {
    if (!admitted.has(reference)) {
      throw new TypeError(`${path} references evidence outside the target-effect model.`);
    }
  }
}

function materialFromModel(model: Readonly<TargetEffectModelV1>) {
  const material = { ...model } as Partial<TargetEffectModelV1>;
  Reflect.deleteProperty(material, "digest");
  return material as TargetEffectModelMaterialV1;
}

export function targetEffectModelDigest(
  material: Readonly<TargetEffectModelMaterialV1>,
) {
  return sha256HexBytesSync(new TextEncoder().encode(canonicalJson(material)));
}

function assertTargetEffectMaterial(
  material: unknown,
): asserts material is TargetEffectModelMaterialV1 {
  exactKeys(material, MATERIAL_KEYS, "Target-effect model");
  if (material.schemaVersion !== TARGET_EFFECT_MODEL_SCHEMA) {
    throw new TypeError("Target-effect model schema is unsupported.");
  }
  stableId(material.id, "Target-effect model ID");
  version(material.version, "Target-effect model version");
  exactKeys(material.intendedUse, INTENDED_USE_KEYS, "Target-effect intended use");
  if (material.intendedUse.id !== TARGET_EFFECT_INTENDED_USE_ID) {
    throw new TypeError("Target-effect intended use is unsupported.");
  }
  version(material.intendedUse.version, "Target-effect intended-use version");
  if (material.evaluator !== "DETERMINISTIC_RADIAL_THRESHOLD_BANDS" ||
      material.sampling !== "NONE" || material.valueState !== "MODEL_ASSUMPTION") {
    throw new TypeError("Target-effect evaluation authority is unsupported.");
  }
  const evidenceRefIds = identifiers(material.evidenceRefIds, "Target-effect evidenceRefIds");
  identifiers(material.limitationIds, "Target-effect limitationIds");
  const evidence = new Set(evidenceRefIds);

  exactKeys(material.fuze, FUZE_KEYS, "Target-effect fuze");
  if (material.fuze.mode !== "GENERIC_PROXIMITY") {
    throw new TypeError("Target-effect fuze mode is unsupported.");
  }
  const activation = finite(
    material.fuze.activationMaximumDistanceM,
    "Target-effect fuze activationMaximumDistanceM",
    0,
  );
  const fuzeEvidence = identifiers(material.fuze.evidenceRefIds, "Target-effect fuze evidenceRefIds");
  requireEvidenceSubset(fuzeEvidence, evidence, "Target-effect fuze evidenceRefIds");

  exactKeys(material.warhead, WARHEAD_KEYS, "Target-effect warhead");
  if (material.warhead.model !== "GENERIC_RADIAL_DISTANCE_EFFECT") {
    throw new TypeError("Target-effect warhead model is unsupported.");
  }
  const warheadEvidence = identifiers(material.warhead.evidenceRefIds, "Target-effect warhead evidenceRefIds");
  requireEvidenceSubset(warheadEvidence, evidence, "Target-effect warhead evidenceRefIds");

  exactKeys(material.targetProfile, TARGET_PROFILE_KEYS, "Target-effect target profile");
  stableId(material.targetProfile.id, "Target-effect target profile ID");
  version(material.targetProfile.version, "Target-effect target profile version");
  if (material.targetProfile.targetKind !== "AIRCRAFT") {
    throw new TypeError("Target-effect target kind is unsupported.");
  }
  const profileEvidence = identifiers(
    material.targetProfile.evidenceRefIds,
    "Target-effect target profile evidenceRefIds",
  );
  requireEvidenceSubset(profileEvidence, evidence, "Target-effect target profile evidenceRefIds");
  const minimumMass = finite(material.targetProfile.minimumMassKg, "Target-effect minimumMassKg", 0);
  const maximumMass = finite(material.targetProfile.maximumMassKg, "Target-effect maximumMassKg", 0);
  const minimumSpeed = finite(material.targetProfile.minimumSpeedMps, "Target-effect minimumSpeedMps", 0);
  const maximumSpeed = finite(material.targetProfile.maximumSpeedMps, "Target-effect maximumSpeedMps", 0);
  const minimumAltitude = finite(material.targetProfile.minimumAltitudeMslM, "Target-effect minimumAltitudeMslM");
  const maximumAltitude = finite(material.targetProfile.maximumAltitudeMslM, "Target-effect maximumAltitudeMslM");
  if (minimumMass <= 0 || maximumMass < minimumMass || maximumSpeed < minimumSpeed ||
      maximumAltitude < minimumAltitude) {
    throw new TypeError("Target-effect target-profile bounds are inconsistent.");
  }

  exactKeys(material.thresholds, THRESHOLD_KEYS, "Target-effect thresholds");
  const kill = finite(material.thresholds.killMaximumDistanceM, "Target-effect kill threshold", 0);
  const missionKill = finite(
    material.thresholds.missionKillMaximumDistanceM,
    "Target-effect mission-kill threshold",
    0,
  );
  const degraded = finite(
    material.thresholds.degradedMaximumDistanceM,
    "Target-effect degraded threshold",
    0,
  );
  if (!(kill < missionKill && missionKill < degraded && degraded <= activation)) {
    throw new TypeError(
      "Target-effect thresholds must satisfy kill < mission kill < degraded <= fuze activation.",
    );
  }
}

export function assertTargetEffectModel(
  model: unknown,
): asserts model is TargetEffectModelV1 {
  exactKeys(model, MODEL_KEYS, "Target-effect model");
  const material = materialFromModel(model as TargetEffectModelV1);
  assertTargetEffectMaterial(material);
  if (typeof model.digest !== "string" || !DIGEST.test(model.digest) ||
      targetEffectModelDigest(material) !== model.digest) {
    throw new TypeError("Target-effect model digest does not match its canonical content.");
  }
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
}

export function createTargetEffectModel(
  material: TargetEffectModelMaterialV1,
): Readonly<TargetEffectModelV1> {
  const copy = structuredClone(material);
  assertTargetEffectMaterial(copy);
  const model: TargetEffectModelV1 = {
    ...copy,
    digest: targetEffectModelDigest(copy),
  };
  assertTargetEffectModel(model);
  return deepFreeze(model);
}

function assertEvaluationInput(input: TargetEffectEvaluationInput) {
  if (!DIGEST.test(input.modelPackDigest)) {
    throw new TypeError("Target-effect model-pack digest is invalid.");
  }
  stableId(input.weaponId, "Target-effect weapon ID");
  exactKeys(
    input.termination.receipt,
    ["tick", "localKey"],
    "Target-effect termination receipt",
  );
  stableLocalKey(
    input.termination.receipt.localKey,
    "Target-effect termination receipt local key",
  );
  finite(input.termination.closestApproachM, "Target-effect closest approach", 0);
  if (!TERMINATION_CAUSES.has(input.termination.cause)) {
    throw new TypeError("Target-effect termination cause is unsupported.");
  }
  if (!Number.isSafeInteger(input.termination.receipt.tick) ||
      input.termination.receipt.tick < 0) {
    throw new TypeError("Target-effect termination tick is invalid.");
  }
  finite(input.termination.modelTimeSeconds, "Target-effect termination model time", 0);
  stableId(input.target.entityId, "Target-effect target ID");
  if (!LIFECYCLES.has(input.target.lifecycle)) {
    throw new TypeError("Target-effect target lifecycle is unsupported.");
  }
  finite(input.target.massKg, "Target-effect target mass", 0);
  finite(input.target.speedMps, "Target-effect target speed", 0);
  finite(input.target.altitudeMslM, "Target-effect target altitude");
  if (input.model) assertTargetEffectModel(input.model);
}

function targetInsideDomain(
  model: Readonly<TargetEffectModelV1>,
  target: Readonly<TargetEffectTargetInput>,
) {
  const profile = model.targetProfile;
  return target.kind === profile.targetKind &&
    target.massKg >= profile.minimumMassKg && target.massKg <= profile.maximumMassKg &&
    target.speedMps >= profile.minimumSpeedMps && target.speedMps <= profile.maximumSpeedMps &&
    target.altitudeMslM >= profile.minimumAltitudeMslM &&
    target.altitudeMslM <= profile.maximumAltitudeMslM;
}

export function targetEffectCommitDigest(
  material: Readonly<Omit<TargetEffectEvaluation, "commitId">>,
) {
  return sha256HexBytesSync(new TextEncoder().encode(canonicalJson(material)));
}

export function assertTargetEffectEvaluation(
  evaluation: unknown,
): asserts evaluation is TargetEffectEvaluation {
  exactKeys(evaluation, EVALUATION_KEYS, "Target-effect evaluation");
  if (evaluation.schemaVersion !== TARGET_EFFECT_COMMIT_SCHEMA) {
    throw new TypeError("Target-effect evaluation schema is unsupported.");
  }
  if (typeof evaluation.commitId !== "string" || !DIGEST.test(evaluation.commitId)) {
    throw new TypeError("Target-effect evaluation commit digest is invalid.");
  }
  if (typeof evaluation.modelPackDigest !== "string" ||
      !DIGEST.test(evaluation.modelPackDigest)) {
    throw new TypeError("Target-effect evaluation model-pack digest is invalid.");
  }
  stableId(evaluation.weaponId, "Target-effect evaluation weapon ID");
  stableId(evaluation.targetId, "Target-effect evaluation target ID");

  exactKeys(
    evaluation.terminationReceipt,
    TERMINATION_RECEIPT_KEYS,
    "Target-effect evaluation termination receipt",
  );
  const receipt = evaluation.terminationReceipt;
  if (!Number.isSafeInteger(receipt.tick) || (receipt.tick as number) < 0) {
    throw new TypeError("Target-effect evaluation termination tick is invalid.");
  }
  stableLocalKey(receipt.localKey, "Target-effect evaluation termination local key");
  if (typeof receipt.cause !== "string" ||
      !TERMINATION_CAUSES.has(receipt.cause as TargetEffectTerminationInput["cause"])) {
    throw new TypeError("Target-effect evaluation termination cause is unsupported.");
  }
  finite(
    receipt.modelTimeSeconds,
    "Target-effect evaluation termination model time",
    0,
  );
  requireCanonicalTargetEffectNumber(
    receipt.modelTimeSeconds as number,
    "Target-effect evaluation termination model time",
  );

  const authorityValues = [
    evaluation.modelId,
    evaluation.modelVersion,
    evaluation.modelDigest,
    evaluation.intendedUseId,
    evaluation.intendedUseVersion,
    evaluation.targetProfileId,
    evaluation.targetProfileVersion,
  ];
  const authorityAbsent = authorityValues.every((value) => value === null);
  const authorityPresent = authorityValues.every((value) => typeof value === "string");
  if (!authorityAbsent && !authorityPresent) {
    throw new TypeError("Target-effect evaluation model authority is only partially identified.");
  }
  if (authorityPresent) {
    stableId(evaluation.modelId, "Target-effect evaluation model ID");
    version(evaluation.modelVersion, "Target-effect evaluation model version");
    if (!DIGEST.test(evaluation.modelDigest as string)) {
      throw new TypeError("Target-effect evaluation model digest is invalid.");
    }
    if (evaluation.intendedUseId !== TARGET_EFFECT_INTENDED_USE_ID) {
      throw new TypeError("Target-effect evaluation intended use is unsupported.");
    }
    version(evaluation.intendedUseVersion, "Target-effect evaluation intended-use version");
    stableId(evaluation.targetProfileId, "Target-effect evaluation target-profile ID");
    version(evaluation.targetProfileVersion, "Target-effect evaluation target-profile version");
  }

  if (typeof evaluation.result !== "string" ||
      !RESULTS.has(evaluation.result as TargetEffectResult)) {
    throw new TypeError("Target-effect evaluation result is unsupported.");
  }
  if (typeof evaluation.reason !== "string" ||
      !REASONS.has(evaluation.reason as TargetEffectReason)) {
    throw new TypeError("Target-effect evaluation reason is unsupported.");
  }
  if (evaluation.valueState !== "MODEL_ASSUMPTION" &&
      evaluation.valueState !== "UNAVAILABLE") {
    throw new TypeError("Target-effect evaluation value state is unsupported.");
  }
  if ((authorityPresent && evaluation.valueState !== "MODEL_ASSUMPTION") ||
      (authorityAbsent && evaluation.valueState !== "UNAVAILABLE")) {
    throw new TypeError("Target-effect evaluation value state contradicts model authority.");
  }

  const closestApproachM = finite(
    evaluation.closestApproachM,
    "Target-effect evaluation closest approach",
    0,
  );
  const targetMassKg = finite(evaluation.targetMassKg, "Target-effect evaluation target mass", 0);
  const targetSpeedMps = finite(evaluation.targetSpeedMps, "Target-effect evaluation target speed", 0);
  const targetAltitudeMslM = finite(
    evaluation.targetAltitudeMslM,
    "Target-effect evaluation target altitude",
  );
  requireCanonicalTargetEffectNumber(closestApproachM, "Target-effect evaluation closest approach");
  requireCanonicalTargetEffectNumber(targetMassKg, "Target-effect evaluation target mass");
  requireCanonicalTargetEffectNumber(targetSpeedMps, "Target-effect evaluation target speed");
  requireCanonicalTargetEffectNumber(
    targetAltitudeMslM,
    "Target-effect evaluation target altitude",
  );
  let selectedThresholdUpperBoundM: number | null = null;
  if (evaluation.selectedThresholdUpperBoundM !== null) {
    selectedThresholdUpperBoundM = finite(
      evaluation.selectedThresholdUpperBoundM,
      "Target-effect evaluation selected threshold",
      0,
    );
  }

  if (evaluation.targetEffectStateBefore !== "UNRESOLVED" ||
      evaluation.targetEffectStateAfter !== evaluation.result) {
    throw new TypeError("Target-effect evaluation state transition is inconsistent.");
  }
  if (typeof evaluation.targetLifecycleBefore !== "string" ||
      !LIFECYCLES.has(evaluation.targetLifecycleBefore as TargetEffectEntityLifecycle) ||
      typeof evaluation.targetLifecycleAfter !== "string" ||
      !LIFECYCLES.has(evaluation.targetLifecycleAfter as TargetEffectEntityLifecycle)) {
    throw new TypeError("Target-effect evaluation lifecycle is unsupported.");
  }

  const geometric = receipt.cause === "GEOMETRIC_INTERCEPT";
  const result = evaluation.result as TargetEffectResult;
  const reason = evaluation.reason as TargetEffectReason;
  const lifecycleBefore = evaluation.targetLifecycleBefore;
  const lifecycleAfter = evaluation.targetLifecycleAfter;
  if (result === "KILL" || result === "MISSION_KILL" || result === "DEGRADED") {
    if (!authorityPresent || !geometric || lifecycleBefore === "TERMINATED" ||
        reason !== "THRESHOLD_BAND" || selectedThresholdUpperBoundM === null ||
        closestApproachM > selectedThresholdUpperBoundM) {
      throw new TypeError("Target-effect threshold-band result is inconsistent.");
    }
    const expectedLifecycle = result === "DEGRADED" ? lifecycleBefore : "TERMINATED";
    if (lifecycleAfter !== expectedLifecycle) {
      throw new TypeError("Target-effect threshold-band lifecycle is inconsistent.");
    }
  } else if (result === "NO_EFFECT") {
    if (!authorityPresent || selectedThresholdUpperBoundM !== null ||
        lifecycleAfter !== lifecycleBefore ||
        (reason !== "ABOVE_EFFECT_BANDS" &&
          reason !== "TERMINATION_NOT_EFFECT_ELIGIBLE") ||
        (reason === "ABOVE_EFFECT_BANDS" && (!geometric || lifecycleBefore === "TERMINATED")) ||
        (reason === "TERMINATION_NOT_EFFECT_ELIGIBLE" && geometric)) {
      throw new TypeError("Target-effect no-effect result is inconsistent.");
    }
  } else {
    const validUnavailableReason =
      (reason === "AUTHORITY_UNAVAILABLE" && authorityAbsent) ||
      (reason === "TARGET_UNAVAILABLE" && authorityPresent && geometric &&
        lifecycleBefore === "TERMINATED") ||
      (reason === "OUTSIDE_TARGET_DOMAIN" && authorityPresent && geometric &&
        lifecycleBefore !== "TERMINATED");
    if (!validUnavailableReason || selectedThresholdUpperBoundM !== null ||
        lifecycleAfter !== lifecycleBefore) {
      throw new TypeError("Target-effect unavailable result is inconsistent.");
    }
  }

  const material = { ...evaluation } as Partial<TargetEffectEvaluation>;
  Reflect.deleteProperty(material, "commitId");
  if (targetEffectCommitDigest(
    material as Omit<TargetEffectEvaluation, "commitId">,
  ) !== evaluation.commitId) {
    throw new TypeError("Target-effect evaluation commit digest does not match its content.");
  }
}

export function evaluateTargetEffect(
  input: Readonly<TargetEffectEvaluationInput>,
): Readonly<TargetEffectEvaluation> {
  assertEvaluationInput(input as TargetEffectEvaluationInput);
  const model = input.model;
  const termination = {
    ...input.termination,
    closestApproachM: canonicalTargetEffectNumber(input.termination.closestApproachM),
    modelTimeSeconds: canonicalTargetEffectNumber(input.termination.modelTimeSeconds),
  };
  const target = {
    ...input.target,
    massKg: canonicalTargetEffectNumber(input.target.massKg),
    speedMps: canonicalTargetEffectNumber(input.target.speedMps),
    altitudeMslM: canonicalTargetEffectNumber(input.target.altitudeMslM),
  };
  let result: TargetEffectResult;
  let reason: TargetEffectReason;
  let selectedThresholdUpperBoundM: number | null = null;

  if (!model) {
    result = "EFFECT_UNAVAILABLE";
    reason = "AUTHORITY_UNAVAILABLE";
  } else if (termination.cause !== "GEOMETRIC_INTERCEPT") {
    result = "NO_EFFECT";
    reason = "TERMINATION_NOT_EFFECT_ELIGIBLE";
  } else if (target.lifecycle === "TERMINATED") {
    result = "EFFECT_UNAVAILABLE";
    reason = "TARGET_UNAVAILABLE";
  } else if (!targetInsideDomain(model, target)) {
    result = "EFFECT_UNAVAILABLE";
    reason = "OUTSIDE_TARGET_DOMAIN";
  } else {
    const distance = termination.closestApproachM;
    if (distance <= model.thresholds.killMaximumDistanceM) {
      result = "KILL";
      reason = "THRESHOLD_BAND";
      selectedThresholdUpperBoundM = model.thresholds.killMaximumDistanceM;
    } else if (distance <= model.thresholds.missionKillMaximumDistanceM) {
      result = "MISSION_KILL";
      reason = "THRESHOLD_BAND";
      selectedThresholdUpperBoundM = model.thresholds.missionKillMaximumDistanceM;
    } else if (distance <= model.thresholds.degradedMaximumDistanceM) {
      result = "DEGRADED";
      reason = "THRESHOLD_BAND";
      selectedThresholdUpperBoundM = model.thresholds.degradedMaximumDistanceM;
    } else {
      result = "NO_EFFECT";
      reason = "ABOVE_EFFECT_BANDS";
    }
  }

  const targetLifecycleAfter = result === "KILL" || result === "MISSION_KILL"
    ? "TERMINATED" as const
    : target.lifecycle;
  const material: Omit<TargetEffectEvaluation, "commitId"> = {
    schemaVersion: TARGET_EFFECT_COMMIT_SCHEMA,
    modelPackDigest: input.modelPackDigest,
    modelId: model?.id ?? null,
    modelVersion: model?.version ?? null,
    modelDigest: model?.digest ?? null,
    intendedUseId: model?.intendedUse.id ?? null,
    intendedUseVersion: model?.intendedUse.version ?? null,
    targetProfileId: model?.targetProfile.id ?? null,
    targetProfileVersion: model?.targetProfile.version ?? null,
    weaponId: input.weaponId,
    targetId: input.target.entityId,
    terminationReceipt: {
      ...structuredClone(termination.receipt),
      cause: termination.cause,
      modelTimeSeconds: termination.modelTimeSeconds,
    },
    valueState: model ? "MODEL_ASSUMPTION" : "UNAVAILABLE",
    result,
    reason,
    closestApproachM: termination.closestApproachM,
    targetMassKg: target.massKg,
    targetSpeedMps: target.speedMps,
    targetAltitudeMslM: target.altitudeMslM,
    selectedThresholdUpperBoundM,
    targetEffectStateBefore: "UNRESOLVED",
    targetEffectStateAfter: result,
    targetLifecycleBefore: target.lifecycle,
    targetLifecycleAfter,
  };
  const evaluation: TargetEffectEvaluation = {
    ...material,
    commitId: targetEffectCommitDigest(material),
  };
  assertTargetEffectEvaluation(evaluation);
  return deepFreeze(evaluation);
}
