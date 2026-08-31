import { canonicalJson } from "../canonical-json.ts";
import { sha256HexBytesSync } from "../geospatial/digest.ts";
import type { EngineEntityDefinition } from "./contracts.ts";
import {
  assertTargetEffectModel,
  createTargetEffectModel,
  TARGET_EFFECT_INTENDED_USE_ID,
  type TargetEffectModelMaterialV1,
  type TargetEffectModelV1,
} from "./target-effect.ts";

export const TARGET_EFFECT_AUTHORITY_SCHEMA =
  "vector.target-effect-authority.v1" as const;

export type TargetEffectAuthorityBindingV1 = {
  id: string;
  effectModelId: string;
  effectModelVersion: string;
  effectModelDigest: string;
  weaponModelId: string;
  weaponModelVersion: string;
  weaponModelPackDigest: string;
  targetModelId: string;
  targetModelVersion: string;
  targetModelPackDigest: string;
  targetProfileId: string;
  targetProfileVersion: string;
};

export type TargetEffectAuthorityMaterialV1 = {
  schemaVersion: typeof TARGET_EFFECT_AUTHORITY_SCHEMA;
  id: string;
  version: string;
  intendedUse: {
    id: typeof TARGET_EFFECT_INTENDED_USE_ID;
    version: string;
  };
  models: TargetEffectModelV1[];
  bindings: TargetEffectAuthorityBindingV1[];
};

export type TargetEffectAuthorityV1 = TargetEffectAuthorityMaterialV1 & {
  digest: string;
};

export type ResolvedTargetEffectAuthority = {
  authorityDigest: string;
  binding: TargetEffectAuthorityBindingV1;
  model: Readonly<TargetEffectModelV1>;
};

const AUTHORITY_KEYS = [
  "schemaVersion", "id", "version", "digest", "intendedUse", "models", "bindings",
] as const;
const AUTHORITY_MATERIAL_KEYS = AUTHORITY_KEYS.filter((key) => key !== "digest");
const INTENDED_USE_KEYS = ["id", "version"] as const;
const BINDING_KEYS = [
  "id", "effectModelId", "effectModelVersion", "effectModelDigest",
  "weaponModelId", "weaponModelVersion", "weaponModelPackDigest",
  "targetModelId", "targetModelVersion", "targetModelPackDigest",
  "targetProfileId", "targetProfileVersion",
] as const;
const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: unknown, keys: readonly string[], path: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${path} must be an object.`);
  const admitted = new Set(keys);
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) throw new TypeError(`${path} is missing ${key}.`);
  }
  for (const key of Object.keys(value)) {
    if (!admitted.has(key)) throw new TypeError(`${path} contains unsupported field ${key}.`);
  }
}

function identity(value: unknown, path: string) {
  if (typeof value !== "string" || !ID.test(value)) {
    throw new TypeError(`${path} must be a stable identifier.`);
  }
}

function version(value: unknown, path: string) {
  if (typeof value !== "string" || !VERSION.test(value)) {
    throw new TypeError(`${path} must be a semantic version.`);
  }
}

function digest(value: unknown, path: string) {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    throw new TypeError(`${path} must be a SHA-256 digest.`);
  }
}

function materialFromAuthority(authority: Readonly<TargetEffectAuthorityV1>) {
  const material = { ...authority } as Partial<TargetEffectAuthorityV1>;
  Reflect.deleteProperty(material, "digest");
  return material as TargetEffectAuthorityMaterialV1;
}

export function targetEffectAuthorityDigest(
  material: Readonly<TargetEffectAuthorityMaterialV1>,
) {
  return sha256HexBytesSync(new TextEncoder().encode(canonicalJson(material)));
}

function assertAuthorityMaterial(
  material: unknown,
): asserts material is TargetEffectAuthorityMaterialV1 {
  exactKeys(material, AUTHORITY_MATERIAL_KEYS, "Target-effect authority");
  if (material.schemaVersion !== TARGET_EFFECT_AUTHORITY_SCHEMA) {
    throw new TypeError("Target-effect authority schema is unsupported.");
  }
  identity(material.id, "Target-effect authority ID");
  version(material.version, "Target-effect authority version");
  exactKeys(material.intendedUse, INTENDED_USE_KEYS, "Target-effect authority intended use");
  if (material.intendedUse.id !== TARGET_EFFECT_INTENDED_USE_ID) {
    throw new TypeError("Target-effect authority intended use is unsupported.");
  }
  version(material.intendedUse.version, "Target-effect authority intended-use version");
  if (!Array.isArray(material.models) || material.models.length === 0) {
    throw new TypeError("Target-effect authority must contain at least one model.");
  }
  const models = new Map<string, TargetEffectModelV1>();
  for (const [index, candidate] of material.models.entries()) {
    assertTargetEffectModel(candidate);
    const key = `${candidate.id}\u0000${candidate.version}\u0000${candidate.digest}`;
    if (models.has(key)) throw new TypeError("Target-effect authority repeats a model identity.");
    models.set(key, candidate);
    if (candidate.intendedUse.id !== material.intendedUse.id ||
        candidate.intendedUse.version !== material.intendedUse.version) {
      throw new TypeError(`Target-effect authority model ${index} has a different intended use.`);
    }
  }
  if (!Array.isArray(material.bindings) || material.bindings.length === 0) {
    throw new TypeError("Target-effect authority must contain at least one exact binding.");
  }
  const bindingIds = new Set<string>();
  const pairs = new Set<string>();
  for (const [index, binding] of material.bindings.entries()) {
    const path = `Target-effect authority binding ${index}`;
    exactKeys(binding, BINDING_KEYS, path);
    for (const [key, value] of Object.entries(binding)) {
      if (key.endsWith("Digest")) digest(value, `${path}.${key}`);
      else if (key.endsWith("Version")) version(value, `${path}.${key}`);
      else identity(value, `${path}.${key}`);
    }
    const admittedBinding = binding as unknown as TargetEffectAuthorityBindingV1;
    if (bindingIds.has(admittedBinding.id)) throw new TypeError("Target-effect authority repeats a binding ID.");
    bindingIds.add(admittedBinding.id);
    const pair = `${admittedBinding.weaponModelPackDigest}\u0000${admittedBinding.weaponModelId}\u0000${admittedBinding.weaponModelVersion}\u0000${admittedBinding.targetModelPackDigest}\u0000${admittedBinding.targetModelId}\u0000${admittedBinding.targetModelVersion}`;
    if (pairs.has(pair)) throw new TypeError("Target-effect authority has conflicting bindings for one weapon/target pair.");
    pairs.add(pair);
    const model = models.get(`${admittedBinding.effectModelId}\u0000${admittedBinding.effectModelVersion}\u0000${admittedBinding.effectModelDigest}`);
    if (!model || model.targetProfile.id !== admittedBinding.targetProfileId ||
        model.targetProfile.version !== admittedBinding.targetProfileVersion) {
      throw new TypeError(`${path} does not resolve its exact effect model and target profile.`);
    }
  }
}

export function assertTargetEffectAuthority(
  authority: unknown,
): asserts authority is TargetEffectAuthorityV1 {
  exactKeys(authority, AUTHORITY_KEYS, "Target-effect authority");
  const material = materialFromAuthority(authority as TargetEffectAuthorityV1);
  assertAuthorityMaterial(material);
  digest(authority.digest, "Target-effect authority digest");
  if (targetEffectAuthorityDigest(material) !== authority.digest) {
    throw new TypeError("Target-effect authority digest does not match its canonical content.");
  }
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
}

export function createTargetEffectAuthority(
  material: TargetEffectAuthorityMaterialV1,
): Readonly<TargetEffectAuthorityV1> {
  const copy = structuredClone(material);
  assertAuthorityMaterial(copy);
  const authority = { ...copy, digest: targetEffectAuthorityDigest(copy) };
  assertTargetEffectAuthority(authority);
  return deepFreeze(authority);
}

export function resolveTargetEffectAuthority(
  authority: Readonly<TargetEffectAuthorityV1>,
  weapon: Readonly<EngineEntityDefinition>,
  target: Readonly<EngineEntityDefinition>,
): ResolvedTargetEffectAuthority {
  assertTargetEffectAuthority(authority);
  const binding = authority.bindings.find((candidate) =>
    candidate.weaponModelPackDigest === weapon.provenance.modelPackDigest &&
    candidate.weaponModelId === weapon.provenance.modelId &&
    candidate.weaponModelVersion === weapon.provenance.modelVersion &&
    candidate.targetModelPackDigest === target.provenance.modelPackDigest &&
    candidate.targetModelId === target.provenance.modelId &&
    candidate.targetModelVersion === target.provenance.modelVersion
  );
  if (!binding || weapon.kind !== "GUIDED_WEAPON" || target.kind !== "AIRCRAFT" ||
      weapon.weapon?.targetEntityId !== target.id) {
    throw new TypeError("Target-effect authority has no exact weapon/assigned-target binding.");
  }
  const model = authority.models.find((candidate) =>
    candidate.id === binding.effectModelId &&
    candidate.version === binding.effectModelVersion &&
    candidate.digest === binding.effectModelDigest
  );
  if (!model) throw new TypeError("Target-effect authority binding lost its model.");
  return { authorityDigest: authority.digest, binding, model };
}

export function createTargetEffectModelForAuthority(
  material: TargetEffectModelMaterialV1,
) {
  return createTargetEffectModel(material);
}
