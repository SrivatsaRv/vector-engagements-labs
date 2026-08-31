import { CURRENT_MODEL_PACK_DIGEST } from "../reference-model-pack.ts";
import {
  assertTargetEffectAuthority,
  createTargetEffectAuthority,
  createTargetEffectModelForAuthority,
  type TargetEffectAuthorityV1,
} from "./target-effect-authority.ts";

export const CURRENT_TARGET_EFFECT_AUTHORITY_ID =
  "vector-generic-aircraft-target-effects" as const;
export const CURRENT_TARGET_EFFECT_AUTHORITY_VERSION = "1.0.0" as const;
export const CURRENT_TARGET_EFFECT_MODEL_ID =
  "generic-aircraft-radial-effect-study-v1" as const;

const model = createTargetEffectModelForAuthority({
  schemaVersion: "vector.target-effect-model.v1",
  id: CURRENT_TARGET_EFFECT_MODEL_ID,
  version: "1.0.0",
  intendedUse: {
    id: "vector.intended-use.generic-target-effect-study",
    version: "1.0.0",
  },
  evaluator: "DETERMINISTIC_RADIAL_THRESHOLD_BANDS",
  sampling: "NONE",
  valueState: "MODEL_ASSUMPTION",
  evidenceRefIds: ["generic-target-effect-study-assumption"],
  limitationIds: [
    "not-named-weapon-effectiveness",
    "not-probability-of-kill",
    "not-operational-damage-prediction",
  ],
  fuze: {
    mode: "GENERIC_PROXIMITY",
    activationMaximumDistanceM: 25,
    evidenceRefIds: ["generic-target-effect-study-assumption"],
  },
  warhead: {
    model: "GENERIC_RADIAL_DISTANCE_EFFECT",
    evidenceRefIds: ["generic-target-effect-study-assumption"],
  },
  targetProfile: {
    id: "generic-fast-jet-susceptibility-study-v1",
    version: "1.0.0",
    targetKind: "AIRCRAFT",
    evidenceRefIds: ["generic-target-effect-study-assumption"],
    minimumMassKg: 5_000,
    maximumMassKg: 40_000,
    minimumSpeedMps: 60,
    maximumSpeedMps: 650,
    minimumAltitudeMslM: -500,
    maximumAltitudeMslM: 20_000,
  },
  thresholds: {
    killMaximumDistanceM: 4,
    missionKillMaximumDistanceM: 10,
    degradedMaximumDistanceM: 20,
  },
});

const binding = (
  id: string,
  weaponModelId: string,
  targetModelId: string,
) => ({
  id,
  effectModelId: model.id,
  effectModelVersion: model.version,
  effectModelDigest: model.digest,
  weaponModelId,
  weaponModelVersion: "0.5.0",
  weaponModelPackDigest: CURRENT_MODEL_PACK_DIGEST,
  targetModelId,
  targetModelVersion: "0.5.0",
  targetModelPackDigest: CURRENT_MODEL_PACK_DIGEST,
  targetProfileId: model.targetProfile.id,
  targetProfileVersion: model.targetProfile.version,
});

export const CURRENT_TARGET_EFFECT_AUTHORITY = createTargetEffectAuthority({
  schemaVersion: "vector.target-effect-authority.v1",
  id: CURRENT_TARGET_EFFECT_AUTHORITY_ID,
  version: CURRENT_TARGET_EFFECT_AUTHORITY_VERSION,
  intendedUse: {
    id: "vector.intended-use.generic-target-effect-study",
    version: "1.0.0",
  },
  models: [structuredClone(model)],
  bindings: [
    binding(
      "astra-study-to-f16-study-target-effect-v1",
      "astra-mk1-study-v05",
      "f-16c-block52-aircraft-study-v05",
    ),
    binding(
      "aim120-study-to-su30-study-target-effect-v1",
      "aim-120c5-study-v05",
      "su-30mki-aircraft-study-v05",
    ),
  ],
});

export const CURRENT_TARGET_EFFECT_AUTHORITY_DIGEST =
  CURRENT_TARGET_EFFECT_AUTHORITY.digest;

export function resolveRetainedTargetEffectAuthority(reference: {
  id: string;
  version: string;
  digest: string;
}): Readonly<TargetEffectAuthorityV1> | undefined {
  return reference.id === CURRENT_TARGET_EFFECT_AUTHORITY.id &&
      reference.version === CURRENT_TARGET_EFFECT_AUTHORITY.version &&
      reference.digest === CURRENT_TARGET_EFFECT_AUTHORITY.digest
    ? CURRENT_TARGET_EFFECT_AUTHORITY
    : undefined;
}

export function assertRetainedTargetEffectAuthority(
  authority: Readonly<TargetEffectAuthorityV1>,
) {
  assertTargetEffectAuthority(authority);
  if (!resolveRetainedTargetEffectAuthority(authority)) {
    throw new TypeError(
      `No retained target-effect authority matches ${authority.id}@${authority.version} (${authority.digest}).`,
    );
  }
}
