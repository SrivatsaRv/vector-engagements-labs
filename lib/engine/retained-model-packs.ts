import historicalBundle from "../../fixtures/model-packs/vector-scalar-study-v0.8.compiled.json" with { type: "json" };
import {
  type CompiledModelPack,
  verifyCompiledModelPackDigestSync,
} from "../model-pack.ts";
import { CURRENT_COMPILED_MODEL_PACK } from "./weapon-admission.ts";

const RETAINED_COMPILED_MODEL_PACKS = [
  historicalBundle.pack as CompiledModelPack,
  CURRENT_COMPILED_MODEL_PACK,
] as const;

const COMPILED_V1_KEYS = [
  "schemaVersion",
  "id",
  "version",
  "digest",
  "unitSystem",
  "coordinateConventions",
  "intendedUses",
  "credibilityManifestRef",
  "evidence",
  "catalogIdentities",
  "aerodynamics",
  "propulsion",
  "sensors",
  "aircraft",
  "weapons",
  "loadouts",
  "compatibility",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireCompiledV1Structure(value: unknown): asserts value is CompiledModelPack {
  if (!isRecord(value)) {
    throw new Error("Supplied engine-verification compiled model pack is structurally invalid.");
  }
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...COMPILED_V1_KEYS].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(
      "Supplied engine-verification compiled model pack must use the exact compiled-v1 key set.",
    );
  }
  if (value.schemaVersion !== "vector.compiled-model-pack.v1" || value.unitSystem !== "SI") {
    throw new Error(
      "Supplied engine-verification compiled model pack schema or unit system is unsupported.",
    );
  }
  if (
    typeof value.id !== "string" ||
    typeof value.version !== "string" ||
    typeof value.digest !== "string"
  ) {
    throw new Error(
      "Supplied engine-verification compiled model pack identity is structurally invalid.",
    );
  }
  for (const field of [
    "catalogIdentities",
    "aerodynamics",
    "propulsion",
    "sensors",
    "aircraft",
    "loadouts",
    "compatibility",
  ] as const) {
    if (!Array.isArray(value[field])) {
      throw new Error(`Supplied engine-verification compiled model pack ${field} must be an array.`);
    }
  }
  if (
    !Array.isArray(value.intendedUses) ||
    value.intendedUses.some(
      (item) => !isRecord(item) || typeof item.id !== "string" || typeof item.version !== "string",
    )
  ) {
    throw new Error(
      "Supplied engine-verification compiled model pack intendedUses are structurally invalid.",
    );
  }
  const intendedUseIds = new Set<string>();
  for (const intendedUse of value.intendedUses) {
    if (intendedUseIds.has(intendedUse.id)) {
      throw new Error(
        `Supplied engine-verification compiled model pack has duplicate intended-use ID ${intendedUse.id}.`,
      );
    }
    intendedUseIds.add(intendedUse.id);
  }
  if (
    !Array.isArray(value.evidence) ||
    value.evidence.length === 0 ||
    value.evidence.some((item) => !isRecord(item) || typeof item.id !== "string")
  ) {
    throw new Error(
      "Supplied engine-verification compiled model pack evidence is structurally invalid.",
    );
  }
  if (!Array.isArray(value.weapons)) {
    throw new Error("Supplied engine-verification compiled model pack weapons must be an array.");
  }
  const evidenceIds = new Set(value.evidence.map((item) => item.id as string));
  const weaponIds = new Set<string>();
  let terminationCount = 0;
  for (const [index, weapon] of value.weapons.entries()) {
    if (
      !isRecord(weapon) ||
      typeof weapon.id !== "string" ||
      typeof weapon.version !== "string"
    ) {
      throw new Error(
        `Supplied engine-verification compiled model pack weapons[${index}] is structurally invalid.`,
      );
    }
    if (weaponIds.has(weapon.id)) {
      throw new Error(
        `Supplied engine-verification compiled model pack has duplicate weapon ID ${weapon.id}.`,
      );
    }
    weaponIds.add(weapon.id);
    if (!("termination" in weapon)) continue;
    terminationCount += 1;
    const termination = weapon.termination;
    if (
      !isRecord(termination) ||
      typeof termination.schemaVersion !== "string" ||
      typeof termination.intendedUse !== "string" ||
      typeof termination.criterion !== "string" ||
      typeof termination.interceptRadiusM !== "number" ||
      !Number.isFinite(termination.interceptRadiusM) ||
      termination.interceptRadiusM <= 0 ||
      typeof termination.maximumFlightTimeS !== "number" ||
      !Number.isFinite(termination.maximumFlightTimeS) ||
      termination.maximumFlightTimeS <= 0 ||
      !Array.isArray(weapon.evidenceRefIds) ||
      weapon.evidenceRefIds.length === 0 ||
      weapon.evidenceRefIds.some(
        (id) => typeof id !== "string" || !evidenceIds.has(id),
      )
    ) {
      throw new Error(
        `Supplied engine-verification compiled model pack weapons[${index}] termination is structurally invalid.`,
      );
    }
  }
  if (terminationCount === 0) {
    throw new Error(
      "Supplied engine-verification compiled model pack contains no weapon-termination authority.",
    );
  }
}

export function findRetainedCompiledModelPack(identity: {
  id: string;
  version: string;
  digest: string;
}): CompiledModelPack | undefined {
  return RETAINED_COMPILED_MODEL_PACKS.find(
    (candidate) =>
      candidate.id === identity.id &&
      candidate.version === identity.version &&
      candidate.digest === identity.digest,
  );
}

/**
 * Product execution resolves only the retained inventory. Explicit
 * verification tooling may supply the complete compiled pack that owns a
 * verification scenario, but its full identity must match exactly.
 */
export function findEngineCompiledModelPackAuthority(
  identity: {
    id: string;
    version: string;
    digest: string;
    intendedUse: { id: string; version: string };
  },
  verificationPack?: Readonly<CompiledModelPack>,
): Readonly<CompiledModelPack> | undefined {
  const retained = findRetainedCompiledModelPack(identity);
  if (!verificationPack) return retained;
  requireCompiledV1Structure(verificationPack);
  if (!verifyCompiledModelPackDigestSync(verificationPack)) {
    throw new Error(
      "Supplied engine-verification compiled model pack digest does not match its canonical content.",
    );
  }
  const verificationUse = verificationPack.intendedUses.find(
    (use) => use.id === "vector.intended-use.engine-verification",
  );
  if (
    identity.intendedUse.id !== "vector.intended-use.engine-verification" ||
    !verificationUse ||
    verificationUse.version !== identity.intendedUse.version ||
    verificationPack.id !== identity.id ||
    verificationPack.version !== identity.version ||
    verificationPack.digest !== identity.digest
  ) {
    throw new Error(
      "Supplied engine-verification compiled model pack does not match the exact scenario identity and intended use.",
    );
  }
  return retained ?? verificationPack;
}

/**
 * Resolve only an exact, application-retained pack identity. Saved-run replay
 * must never reinterpret archived authored inputs through the current pack.
 */
export function resolveRetainedCompiledModelPack(identity: {
  id: string;
  version: string;
  digest: string;
}): CompiledModelPack {
  const pack = findRetainedCompiledModelPack(identity);
  if (!pack) {
    throw new Error(
      `No retained compiled model pack matches ${identity.id}@${identity.version} (${identity.digest}).`,
    );
  }
  return pack;
}
