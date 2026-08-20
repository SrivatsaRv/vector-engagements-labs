import { sha256Hex } from "./canonical-json.ts";
import type { EntityLifecycle } from "./engine/contracts.ts";
import type { Vec3 } from "./engine/primitives.ts";

export const MODEL_PACK_SOURCE_SCHEMA_VERSION = "vector.model-pack-source.v1";
export const COMPILED_MODEL_PACK_SCHEMA_VERSION = "vector.compiled-model-pack.v1";
export const CREDIBILITY_MANIFEST_SCHEMA_VERSION = "vector.credibility-manifest.v1";
export const INTENDED_USE_SCHEMA_VERSION = "vector.intended-use.v1";
export const MODEL_PATCH_SCHEMA_VERSION = "vector.model-patch.v1";

export type IntendedUseId =
  | "vector.intended-use.geometry-teaching"
  | "vector.intended-use.wvr-maneuver-study"
  | "vector.intended-use.bvr-timeline-study"
  | "vector.intended-use.weapon-flyout-study"
  | "vector.intended-use.debrief-comparison";

export type IntendedUseContract = {
  schemaVersion: typeof INTENDED_USE_SCHEMA_VERSION;
  id: IntendedUseId;
  version: string;
  question: string;
  requiredCapabilities: string[];
  supportedInterpretations: string[];
  unsupportedInterpretations: string[];
};

export type EvidenceReference = {
  id: string;
  kind: "SOURCE" | "REQUIREMENT" | "VERIFICATION" | "VALIDATION" | "ASSUMPTION";
  title: string;
  uri: string;
  locator?: string;
  accessedAt: string;
};

export type SourceUnit =
  | "1"
  | "kg"
  | "g"
  | "m"
  | "km"
  | "ft"
  | "m2"
  | "cm2"
  | "s"
  | "ms"
  | "N"
  | "kN"
  | "m/s"
  | "km/h"
  | "rad"
  | "deg"
  | "g0"
  | "kg/(N*s)";

export type SiUnit =
  | "1"
  | "kg"
  | "m"
  | "m2"
  | "s"
  | "N"
  | "m/s"
  | "rad"
  | "g0"
  | "kg/(N*s)";

export type Quantity = {
  value: number;
  unit: SourceUnit;
  evidenceRefIds: string[];
};

export type Range = {
  minimum: number;
  maximum: number;
  unit: SourceUnit;
};

export type ValidityDomain = {
  altitude: Range;
  mach: Range;
  angleOfAttack: Range;
  loadFactor: Range;
  configurations: string[];
  environments: string[];
};

export type SiValidityDomain = {
  altitudeM: { minimum: number; maximum: number };
  mach: { minimum: number; maximum: number };
  angleOfAttackRad: { minimum: number; maximum: number };
  loadFactorG: { minimum: number; maximum: number };
  configurations: string[];
  environments: string[];
};

export type CoordinateConventions = {
  geodeticDatum: "WGS84";
  localFrame: "EAST_NORTH_UP";
  bodyAxes: "X_FORWARD_Y_RIGHT_Z_DOWN";
  aerodynamicAxes: "X_FORWARD_Y_RIGHT_Z_DOWN";
  angularUnit: "RADIAN";
  positionUnit: "METER";
  velocityUnit: "METER_PER_SECOND";
  verticalReference: "ELLIPSOID_HEIGHT" | "MEAN_SEA_LEVEL";
};

export type ModelLimitation = {
  id: string;
  severity: "INFORMATION" | "CAUTION" | "BLOCKING";
  statement: string;
  affectedCapabilities: string[];
};

export type CredibilityCase = {
  id: string;
  requirementId: string;
  kind: "VERIFICATION" | "VALIDATION";
  result: "PASS" | "FAIL" | "NOT_RUN";
  tolerance: string;
  evidenceRefId: string;
  executedAt?: string;
  reviewedModelDigest?: string;
};

export type CredibilityManifestSource = {
  id: string;
  version: string;
  engineDigest: string;
  intendedUseRefs: Array<{ id: IntendedUseId; version: string }>;
  validityDomain: ValidityDomain;
  requirements: Array<{ id: string; statement: string }>;
  cases: CredibilityCase[];
  numericalTolerances: Array<{ metric: string; tolerance: number; unit: SourceUnit }>;
  uncertaintyCharacterization: string;
  limitations: ModelLimitation[];
  approvalState: "DRAFT" | "APPROVED_FOR_DECLARED_USE" | "RETIRED";
};

export type CredibilityManifest = Omit<
  CredibilityManifestSource,
  "validityDomain" | "numericalTolerances"
> & {
  schemaVersion: typeof CREDIBILITY_MANIFEST_SCHEMA_VERSION;
  subject: {
    kind: "MODEL_PACK" | "ENGINE";
    id: string;
    digest: string;
  };
  modelPackDigest: string;
  validityDomain: SiValidityDomain;
  numericalTolerances: Array<{ metric: string; tolerance: number; unit: SiUnit }>;
  contentDigest: string;
};

export type TableAxisSource = {
  semantic: "MACH" | "ANGLE_OF_ATTACK" | "ALTITUDE" | "THROTTLE" | "TIME" | "RANGE";
  unit: SourceUnit;
  values: number[];
};

export type CoefficientTableSource = {
  id: string;
  outputUnit: SourceUnit;
  axes: TableAxisSource[];
  values: number[];
  evidenceRefIds: string[];
  validityDomain: ValidityDomain;
};

type ModelSourceBase = {
  id: string;
  version: string;
  evidenceRefIds: string[];
  validityDomain: ValidityDomain;
  limitationIds: string[];
  dependsOn?: string[];
};

export type AerodynamicModelSource = ModelSourceBase & {
  kind: "AERODYNAMIC";
  referenceArea: Quantity;
  referenceChord: Quantity;
  referenceSpan: Quantity;
  coefficientTables: CoefficientTableSource[];
};

export type PropulsionModelSource = ModelSourceBase & {
  kind: "PROPULSION";
  engineCount: number;
  thrustTable: CoefficientTableSource;
  fuelFlowTable: CoefficientTableSource;
  spoolTime: Quantity;
};

export type SensorModelSource = ModelSourceBase & {
  kind: "SENSOR";
  sensorKind: "DECLARED_ENVELOPE" | "RADAR" | "INFRARED" | "VISUAL";
  detectionRange: Quantity;
  minimumRange: Quantity;
  scanPeriod: Quantity;
  azimuthFieldOfView: Quantity;
  elevationFieldOfView: Quantity;
};

export type AircraftModelSource = ModelSourceBase & {
  kind: "AIRCRAFT";
  catalogObjectId: string;
  emptyMass: Quantity;
  fuelCapacity: Quantity;
  aerodynamicModelId: string;
  propulsionModelIds: string[];
  sensorModelIds: string[];
  loadoutModelId: string;
  maximumCommandLoadFactor: Quantity;
};

export type WeaponModelSource = ModelSourceBase & {
  kind: "WEAPON";
  catalogObjectId: string;
  launchMass: Quantity;
  dryMass: Quantity;
  aerodynamicModelId: string;
  propulsionModelId: string;
  sensorModelId?: string;
  /** Declared seeker category. `UNAVAILABLE` is an explicit no-seeker claim. */
  seekerMode: WeaponSeekerMode;
  /** Declared support dependency; never infer this from a weapon name. */
  supportRequirement: WeaponSupportRequirement;
  /** Current launch authority is deliberately limited to scheduled test release. */
  launchAuthorization: WeaponLaunchAuthorization;
  maximumCommandLoadFactor: Quantity;
  seekerActivationRange: Quantity;
  datalinkUpdatePeriod: Quantity;
  thrustTaperSpeed: Quantity;
  navigationConstant: Quantity;
};

export type WeaponSeekerMode = "UNAVAILABLE" | "ACTIVE_RADAR" | "INFRARED" | "PASSIVE_RADIATION";
export type WeaponSupportRequirement = "UNAVAILABLE" | "NONE" | "TRACK_UPDATE";
export type WeaponLaunchAuthorization = "SCHEDULED_TEST_ONLY" | "TRACK_REQUIRED";

export type LoadoutStationSource = {
  id: string;
  stationGroup: string;
  positionBody: { x: Quantity; y: Quantity; z: Quantity };
  maximumQuantity: number;
  compatibleStoreModelIds: string[];
};

export type LoadoutModelSource = ModelSourceBase & {
  kind: "LOADOUT";
  platformCatalogObjectId: string;
  stations: LoadoutStationSource[];
};

export type CompatibilityRuleSource = {
  id: string;
  platformCatalogObjectId: string;
  loadoutModelId: string;
  storeModelId: string;
  stationGroup: string;
  status: "SUPPORTED" | "UNSUPPORTED";
  maximumQuantity: number;
  rationale: string;
  evidenceRefIds: string[];
};

export type CatalogModelIdentity = {
  catalogObjectId: string;
  kind:
    | "AIRCRAFT"
    | "GUIDED_WEAPON"
    | "AIR_DEFENCE_SYSTEM"
    | "RADAR"
    | "SURFACE_LAUNCHER"
    | "FIXED_SITE";
  definitionModelIds: string[];
};

export type ModelPackSource = {
  schemaVersion: typeof MODEL_PACK_SOURCE_SCHEMA_VERSION;
  id: string;
  version: string;
  coordinateConventions: CoordinateConventions;
  intendedUses: IntendedUseContract[];
  evidence: EvidenceReference[];
  catalogIdentities: CatalogModelIdentity[];
  aerodynamics: AerodynamicModelSource[];
  propulsion: PropulsionModelSource[];
  sensors: SensorModelSource[];
  aircraft: AircraftModelSource[];
  weapons: WeaponModelSource[];
  loadouts: LoadoutModelSource[];
  compatibility: CompatibilityRuleSource[];
  credibility: CredibilityManifestSource;
};

export type CompiledTable = {
  id: string;
  outputUnit: SiUnit;
  axes: Array<{ semantic: TableAxisSource["semantic"]; unit: SiUnit; values: number[] }>;
  values: number[];
  evidenceRefIds: string[];
  validityDomain: SiValidityDomain;
};

type CompiledModelBase = {
  id: string;
  version: string;
  evidenceRefIds: string[];
  validityDomain: SiValidityDomain;
  limitationIds: string[];
};

export type CompiledAerodynamicModel = CompiledModelBase & {
  referenceAreaM2: number;
  referenceChordM: number;
  referenceSpanM: number;
  coefficientTables: CompiledTable[];
};

export type CompiledPropulsionModel = CompiledModelBase & {
  engineCount: number;
  thrustTable: CompiledTable;
  fuelFlowTable: CompiledTable;
  spoolTimeS: number;
};

export type CompiledSensorModel = CompiledModelBase & {
  sensorKind: SensorModelSource["sensorKind"];
  detectionRangeM: number;
  minimumRangeM: number;
  scanPeriodS: number;
  azimuthFieldOfViewRad: number;
  elevationFieldOfViewRad: number;
};

export type CompiledAircraftModel = CompiledModelBase & {
  catalogObjectId: string;
  emptyMassKg: number;
  fuelCapacityKg: number;
  aerodynamicModelIndex: number;
  propulsionModelIndexes: number[];
  sensorModelIndexes: number[];
  loadoutModelIndex: number;
  maximumCommandLoadFactorG: number;
};

export type CompiledWeaponModel = CompiledModelBase & {
  catalogObjectId: string;
  launchMassKg: number;
  dryMassKg: number;
  aerodynamicModelIndex: number;
  propulsionModelIndex: number;
  sensorModelIndex: number | null;
  seekerMode: WeaponSeekerMode;
  supportRequirement: WeaponSupportRequirement;
  launchAuthorization: WeaponLaunchAuthorization;
  maximumCommandLoadFactorG: number;
  seekerActivationRangeM: number;
  datalinkUpdatePeriodS: number;
  thrustTaperSpeedMps: number;
  navigationConstant: number;
};

export type CompiledLoadoutModel = CompiledModelBase & {
  platformCatalogObjectId: string;
  stations: Array<{
    id: string;
    stationGroup: string;
    positionBodyM: Vec3;
    maximumQuantity: number;
    compatibleStoreModelIndexes: number[];
  }>;
};

export type CompiledCompatibilityRule = Omit<
  CompatibilityRuleSource,
  "loadoutModelId" | "storeModelId"
> & {
  loadoutModelIndex: number;
  storeModelIndex: number;
};

export type CompiledModelPack = {
  schemaVersion: typeof COMPILED_MODEL_PACK_SCHEMA_VERSION;
  id: string;
  version: string;
  digest: string;
  unitSystem: "SI";
  coordinateConventions: CoordinateConventions;
  intendedUses: Array<{ id: IntendedUseId; version: string }>;
  credibilityManifestRef: { id: string; version: string };
  evidence: EvidenceReference[];
  catalogIdentities: CatalogModelIdentity[];
  aerodynamics: CompiledAerodynamicModel[];
  propulsion: CompiledPropulsionModel[];
  sensors: CompiledSensorModel[];
  aircraft: CompiledAircraftModel[];
  weapons: CompiledWeaponModel[];
  loadouts: CompiledLoadoutModel[];
  compatibility: CompiledCompatibilityRule[];
};

export type CompiledModelPackBundle = {
  pack: CompiledModelPack;
  credibilityManifest: CredibilityManifest;
};

export type ScenarioModelPatch = {
  schemaVersion: typeof MODEL_PATCH_SCHEMA_VERSION;
  id: string;
  modelPackDigest: string;
  modelId: string;
  fieldPath: string;
  oldValue: number;
  newValue: number;
  unit: SiUnit;
  reason: string;
  provenance: {
    authorId: string;
    authoredAt: string;
    evidenceRefIds: string[];
  };
};

export type ScenarioModelInstance = {
  id: string;
  catalogObjectId: string;
  modelId: string;
  modelPackDigest: string;
  loadout: Array<{ stationId: string; storeModelId: string; quantity: number }>;
  patches: ScenarioModelPatch[];
};

export type MutableRuntimeEntityState = {
  instanceId: string;
  lifecycle: EntityLifecycle;
  positionM: Vec3;
  velocityMps: Vec3;
  massKg: number;
  fuelKg: number;
};

export class ModelPackValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid model pack:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "ModelPackValidationError";
    this.issues = issues;
  }
}

const ID_PATTERN = /^[a-z0-9]+(?:[._:/-][a-z0-9]+)*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const WEAPON_SEEKER_MODES: WeaponSeekerMode[] = ["UNAVAILABLE", "ACTIVE_RADAR", "INFRARED", "PASSIVE_RADIATION"];
const WEAPON_SUPPORT_REQUIREMENTS: WeaponSupportRequirement[] = ["UNAVAILABLE", "NONE", "TRACK_UPDATE"];
const WEAPON_LAUNCH_AUTHORIZATIONS: WeaponLaunchAuthorization[] = ["SCHEDULED_TEST_ONLY", "TRACK_REQUIRED"];

const UNIT_CONVERSIONS: Record<SourceUnit, { unit: SiUnit; scale: number }> = {
  "1": { unit: "1", scale: 1 },
  kg: { unit: "kg", scale: 1 },
  g: { unit: "kg", scale: 0.001 },
  m: { unit: "m", scale: 1 },
  km: { unit: "m", scale: 1000 },
  ft: { unit: "m", scale: 0.3048 },
  m2: { unit: "m2", scale: 1 },
  cm2: { unit: "m2", scale: 0.0001 },
  s: { unit: "s", scale: 1 },
  ms: { unit: "s", scale: 0.001 },
  N: { unit: "N", scale: 1 },
  kN: { unit: "N", scale: 1000 },
  "m/s": { unit: "m/s", scale: 1 },
  "km/h": { unit: "m/s", scale: 1 / 3.6 },
  rad: { unit: "rad", scale: 1 },
  deg: { unit: "rad", scale: Math.PI / 180 },
  g0: { unit: "g0", scale: 1 },
  "kg/(N*s)": { unit: "kg/(N*s)", scale: 1 },
};

function stableId(issues: string[], path: string, value: string) {
  if (!ID_PATTERN.test(value)) issues.push(`${path} must be a stable lowercase identifier`);
}

function version(issues: string[], path: string, value: string) {
  if (!SEMVER_PATTERN.test(value)) issues.push(`${path} must be semantic version x.y.z`);
}

function finite(issues: string[], path: string, value: number) {
  if (!Number.isFinite(value)) issues.push(`${path} must be finite`);
}

function nonEmpty(issues: string[], path: string, values: string[]) {
  if (values.length === 0) issues.push(`${path} must not be empty`);
  values.forEach((value, index) => {
    if (!value.trim()) issues.push(`${path}[${index}] must not be blank`);
  });
}

function uniqueIds(issues: string[], path: string, values: Array<{ id: string }>) {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    stableId(issues, `${path}[${index}].id`, value.id);
    if (seen.has(value.id)) issues.push(`${path} contains duplicate id ${value.id}`);
    seen.add(value.id);
  }
}

function normalizeNumber(value: number, unit: SourceUnit) {
  const conversion = UNIT_CONVERSIONS[unit];
  if (!conversion) {
    throw new ModelPackValidationError([`Unsupported or missing unit: ${String(unit)}`]);
  }
  return { value: value * conversion.scale, unit: conversion.unit };
}

function validateEvidenceRefs(
  issues: string[],
  path: string,
  values: string[],
  evidenceIds: Set<string>,
) {
  if (values.length === 0) issues.push(`${path} must contain at least one evidence reference`);
  for (const value of values) {
    if (!evidenceIds.has(value)) issues.push(`${path} references missing evidence ${value}`);
  }
}

function normalizeQuantity(
  issues: string[],
  path: string,
  quantity: Quantity,
  expected: SiUnit,
  evidenceIds: Set<string>,
) {
  finite(issues, `${path}.value`, quantity.value);
  validateEvidenceRefs(issues, `${path}.evidenceRefIds`, quantity.evidenceRefIds, evidenceIds);
  const normalized = normalizeNumber(quantity.value, quantity.unit);
  if (normalized.unit !== expected) {
    issues.push(`${path}.unit ${quantity.unit} is not compatible with ${expected}`);
  }
  return normalized.value;
}

function normalizeRange(
  issues: string[],
  path: string,
  range: Range,
  expected: SiUnit,
) {
  finite(issues, `${path}.minimum`, range.minimum);
  finite(issues, `${path}.maximum`, range.maximum);
  const minimum = normalizeNumber(range.minimum, range.unit);
  const maximum = normalizeNumber(range.maximum, range.unit);
  if (minimum.unit !== expected) issues.push(`${path}.unit ${range.unit} is not compatible with ${expected}`);
  if (minimum.value > maximum.value) issues.push(`${path} minimum must not exceed maximum`);
  return { minimum: minimum.value, maximum: maximum.value };
}

function normalizeValidityDomain(
  issues: string[],
  path: string,
  domain: ValidityDomain,
): SiValidityDomain {
  nonEmpty(issues, `${path}.configurations`, domain.configurations);
  nonEmpty(issues, `${path}.environments`, domain.environments);
  return {
    altitudeM: normalizeRange(issues, `${path}.altitude`, domain.altitude, "m"),
    mach: normalizeRange(issues, `${path}.mach`, domain.mach, "1"),
    angleOfAttackRad: normalizeRange(issues, `${path}.angleOfAttack`, domain.angleOfAttack, "rad"),
    loadFactorG: normalizeRange(issues, `${path}.loadFactor`, domain.loadFactor, "g0"),
    configurations: [...domain.configurations],
    environments: [...domain.environments],
  };
}

function validityDomainCovers(
  provider: SiValidityDomain,
  required: SiValidityDomain,
) {
  const coversRange = (
    available: { minimum: number; maximum: number },
    demanded: { minimum: number; maximum: number },
  ) => available.minimum <= demanded.minimum && available.maximum >= demanded.maximum;
  return coversRange(provider.altitudeM, required.altitudeM) &&
    coversRange(provider.mach, required.mach) &&
    coversRange(provider.angleOfAttackRad, required.angleOfAttackRad) &&
    coversRange(provider.loadFactorG, required.loadFactorG) &&
    required.configurations.every((value) => provider.configurations.includes(value)) &&
    required.environments.every((value) => provider.environments.includes(value));
}

function requireValidityDomainCoverage(
  issues: string[],
  path: string,
  provider: SiValidityDomain,
  required: SiValidityDomain,
) {
  if (!validityDomainCovers(provider, required)) {
    issues.push(`${path}.validityDomain does not cover its admitted aircraft validity domain`);
  }
}

function compileTable(
  issues: string[],
  path: string,
  table: CoefficientTableSource,
  evidenceIds: Set<string>,
): CompiledTable {
  stableId(issues, `${path}.id`, table.id);
  validateEvidenceRefs(issues, `${path}.evidenceRefIds`, table.evidenceRefIds, evidenceIds);
  if (table.axes.length === 0) issues.push(`${path}.axes must not be empty`);
  let expectedLength = 1;
  const axes = table.axes.map((axis, index) => {
    if (axis.values.length === 0) issues.push(`${path}.axes[${index}].values must not be empty`);
    let previous = Number.NEGATIVE_INFINITY;
    const normalized = axis.values.map((value, valueIndex) => {
      finite(issues, `${path}.axes[${index}].values[${valueIndex}]`, value);
      const item = normalizeNumber(value, axis.unit);
      if (item.value <= previous) issues.push(`${path}.axes[${index}].values must be strictly increasing`);
      previous = item.value;
      return item.value;
    });
    expectedLength *= axis.values.length;
    return {
      semantic: axis.semantic,
      unit: normalizeNumber(0, axis.unit).unit,
      values: normalized,
    };
  });
  if (table.values.length !== expectedLength) {
    issues.push(`${path}.values length ${table.values.length} does not match axis product ${expectedLength}`);
  }
  const output = normalizeNumber(0, table.outputUnit);
  const values = table.values.map((value, index) => {
    finite(issues, `${path}.values[${index}]`, value);
    return normalizeNumber(value, table.outputUnit).value;
  });
  return {
    id: table.id,
    outputUnit: output.unit,
    axes,
    values,
    evidenceRefIds: [...table.evidenceRefIds],
    validityDomain: normalizeValidityDomain(issues, `${path}.validityDomain`, table.validityDomain),
  };
}

function ensureNoDependencyCycles(
  issues: string[],
  definitions: Array<ModelSourceBase & { kind: string }>,
) {
  const known = new Set(definitions.map((definition) => definition.id));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const visit = (id: string, chain: string[]) => {
    if (visiting.has(id)) {
      issues.push(`model dependency cycle: ${[...chain, id].join(" -> ")}`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const definition = byId.get(id);
    for (const dependency of definition?.dependsOn ?? []) {
      if (!known.has(dependency)) issues.push(`model ${id} depends on missing model ${dependency}`);
      else visit(dependency, [...chain, id]);
    }
    visiting.delete(id);
    visited.add(id);
  };
  definitions.forEach((definition) => visit(definition.id, []));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return value;
}

function digestPayload(pack: Omit<CompiledModelPack, "digest">) {
  return pack;
}

function normalizeDigestNumbers(value: unknown): unknown {
  if (typeof value === "number") {
    return `#number:${value.toExponential(12).replace("e+", "e")}`;
  }
  if (Array.isArray(value)) return value.map(normalizeDigestNumbers);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        normalizeDigestNumbers(item),
      ]),
    );
  }
  return value;
}

function modelPayloadDigest(pack: Omit<CompiledModelPack, "digest">) {
  const normalized = normalizeDigestNumbers(digestPayload(pack));
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([key, item]) => [key, canonicalize(item)]),
      );
    }
    return value;
  };
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(normalized)));
  return crypto.subtle.digest("SHA-256", bytes).then((digest) =>
    [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(""),
  );
}

export async function compileModelPack(source: ModelPackSource): Promise<CompiledModelPackBundle> {
  const issues: string[] = [];
  if (source.schemaVersion !== MODEL_PACK_SOURCE_SCHEMA_VERSION) {
    issues.push(`schemaVersion must be ${MODEL_PACK_SOURCE_SCHEMA_VERSION}`);
  }
  stableId(issues, "id", source.id);
  version(issues, "version", source.version);
  const coordinateExpectations: Record<keyof CoordinateConventions, string[]> = {
    geodeticDatum: ["WGS84"],
    localFrame: ["EAST_NORTH_UP"],
    bodyAxes: ["X_FORWARD_Y_RIGHT_Z_DOWN"],
    aerodynamicAxes: ["X_FORWARD_Y_RIGHT_Z_DOWN"],
    angularUnit: ["RADIAN"],
    positionUnit: ["METER"],
    velocityUnit: ["METER_PER_SECOND"],
    verticalReference: ["ELLIPSOID_HEIGHT", "MEAN_SEA_LEVEL"],
  };
  for (const [field, allowed] of Object.entries(coordinateExpectations)) {
    const value = source.coordinateConventions?.[field as keyof CoordinateConventions];
    if (typeof value !== "string" || !allowed.includes(value)) {
      issues.push(`coordinateConventions.${field} is unsupported`);
    }
  }
  uniqueIds(issues, "evidence", source.evidence);
  uniqueIds(issues, "intendedUses", source.intendedUses);
  uniqueIds(issues, "catalogIdentities", source.catalogIdentities.map((item) => ({ id: item.catalogObjectId })));
  uniqueIds(issues, "aerodynamics", source.aerodynamics);
  uniqueIds(issues, "propulsion", source.propulsion);
  uniqueIds(issues, "sensors", source.sensors);
  uniqueIds(issues, "aircraft", source.aircraft);
  uniqueIds(issues, "weapons", source.weapons);
  uniqueIds(issues, "loadouts", source.loadouts);
  uniqueIds(issues, "compatibility", source.compatibility);

  const evidenceIds = new Set(source.evidence.map((item) => item.id));
  const limitationIds = new Set(source.credibility.limitations.map((item) => item.id));
  const definitionGroups = [
    ...source.aerodynamics,
    ...source.propulsion,
    ...source.sensors,
    ...source.aircraft,
    ...source.weapons,
    ...source.loadouts,
  ];
  ensureNoDependencyCycles(issues, definitionGroups);
  for (const [index, definition] of definitionGroups.entries()) {
    version(issues, `definitions[${index}].version`, definition.version);
    validateEvidenceRefs(issues, `definitions[${index}].evidenceRefIds`, definition.evidenceRefIds, evidenceIds);
    normalizeValidityDomain(issues, `definitions[${index}].validityDomain`, definition.validityDomain);
    for (const limitationId of definition.limitationIds) {
      if (!limitationIds.has(limitationId)) issues.push(`model ${definition.id} references missing limitation ${limitationId}`);
    }
  }

  for (const [index, intendedUse] of source.intendedUses.entries()) {
    if (intendedUse.schemaVersion !== INTENDED_USE_SCHEMA_VERSION) {
      issues.push(`intendedUses[${index}].schemaVersion must be ${INTENDED_USE_SCHEMA_VERSION}`);
    }
    version(issues, `intendedUses[${index}].version`, intendedUse.version);
    nonEmpty(issues, `intendedUses[${index}].requiredCapabilities`, intendedUse.requiredCapabilities);
    nonEmpty(issues, `intendedUses[${index}].supportedInterpretations`, intendedUse.supportedInterpretations);
    nonEmpty(issues, `intendedUses[${index}].unsupportedInterpretations`, intendedUse.unsupportedInterpretations);
  }

  const aerodynamicIndexes = new Map(source.aerodynamics.map((item, index) => [item.id, index]));
  const propulsionIndexes = new Map(source.propulsion.map((item, index) => [item.id, index]));
  const sensorIndexes = new Map(source.sensors.map((item, index) => [item.id, index]));
  const weaponIndexes = new Map(source.weapons.map((item, index) => [item.id, index]));
  const loadoutIndexes = new Map(source.loadouts.map((item, index) => [item.id, index]));
  const catalogIds = new Set(source.catalogIdentities.map((item) => item.catalogObjectId));

  const aerodynamics = source.aerodynamics.map((item, index): CompiledAerodynamicModel => ({
    id: item.id,
    version: item.version,
    evidenceRefIds: [...item.evidenceRefIds],
    validityDomain: normalizeValidityDomain(issues, `aerodynamics[${index}].validityDomain`, item.validityDomain),
    limitationIds: [...item.limitationIds],
    referenceAreaM2: normalizeQuantity(issues, `aerodynamics[${index}].referenceArea`, item.referenceArea, "m2", evidenceIds),
    referenceChordM: normalizeQuantity(issues, `aerodynamics[${index}].referenceChord`, item.referenceChord, "m", evidenceIds),
    referenceSpanM: normalizeQuantity(issues, `aerodynamics[${index}].referenceSpan`, item.referenceSpan, "m", evidenceIds),
    coefficientTables: item.coefficientTables.map((table, tableIndex) => compileTable(issues, `aerodynamics[${index}].coefficientTables[${tableIndex}]`, table, evidenceIds)),
  }));
  for (const [index, item] of source.aerodynamics.entries()) {
    if (item.coefficientTables.length === 0) issues.push(`aerodynamics[${index}].coefficientTables must not be empty`);
    if (aerodynamics[index].referenceAreaM2 <= 0 || aerodynamics[index].referenceChordM <= 0 || aerodynamics[index].referenceSpanM <= 0) {
      issues.push(`aerodynamics[${index}] reference geometry must be greater than zero`);
    }
  }

  const propulsion = source.propulsion.map((item, index): CompiledPropulsionModel => {
    if (!Number.isSafeInteger(item.engineCount) || item.engineCount < 1) issues.push(`propulsion[${index}].engineCount must be a positive integer`);
    return {
      id: item.id,
      version: item.version,
      evidenceRefIds: [...item.evidenceRefIds],
      validityDomain: normalizeValidityDomain(issues, `propulsion[${index}].validityDomain`, item.validityDomain),
      limitationIds: [...item.limitationIds],
      engineCount: item.engineCount,
      thrustTable: compileTable(issues, `propulsion[${index}].thrustTable`, item.thrustTable, evidenceIds),
      fuelFlowTable: compileTable(issues, `propulsion[${index}].fuelFlowTable`, item.fuelFlowTable, evidenceIds),
      spoolTimeS: normalizeQuantity(issues, `propulsion[${index}].spoolTime`, item.spoolTime, "s", evidenceIds),
    };
  });
  propulsion.forEach((item, index) => {
    if (item.spoolTimeS < 0) issues.push(`propulsion[${index}].spoolTime must be non-negative`);
  });

  const sensors = source.sensors.map((item, index): CompiledSensorModel => ({
    id: item.id,
    version: item.version,
    evidenceRefIds: [...item.evidenceRefIds],
    validityDomain: normalizeValidityDomain(issues, `sensors[${index}].validityDomain`, item.validityDomain),
    limitationIds: [...item.limitationIds],
    sensorKind: item.sensorKind,
    detectionRangeM: normalizeQuantity(issues, `sensors[${index}].detectionRange`, item.detectionRange, "m", evidenceIds),
    minimumRangeM: normalizeQuantity(issues, `sensors[${index}].minimumRange`, item.minimumRange, "m", evidenceIds),
    scanPeriodS: normalizeQuantity(issues, `sensors[${index}].scanPeriod`, item.scanPeriod, "s", evidenceIds),
    azimuthFieldOfViewRad: normalizeQuantity(issues, `sensors[${index}].azimuthFieldOfView`, item.azimuthFieldOfView, "rad", evidenceIds),
    elevationFieldOfViewRad: normalizeQuantity(issues, `sensors[${index}].elevationFieldOfView`, item.elevationFieldOfView, "rad", evidenceIds),
  }));
  sensors.forEach((item, index) => {
    if (item.detectionRangeM < 0 || item.minimumRangeM < 0 || item.scanPeriodS <= 0) {
      issues.push(`sensors[${index}] ranges must be non-negative and scan period must be positive`);
    }
    if (item.minimumRangeM > item.detectionRangeM && item.detectionRangeM > 0) {
      issues.push(`sensors[${index}].minimumRange must not exceed detectionRange`);
    }
  });

  const aircraft = source.aircraft.map((item, index): CompiledAircraftModel => {
    const aerodynamicModelIndex = aerodynamicIndexes.get(item.aerodynamicModelId);
    const loadoutModelIndex = loadoutIndexes.get(item.loadoutModelId);
    if (!catalogIds.has(item.catalogObjectId)) issues.push(`aircraft[${index}] references missing catalog object ${item.catalogObjectId}`);
    if (aerodynamicModelIndex === undefined) issues.push(`aircraft[${index}] references missing aerodynamic model ${item.aerodynamicModelId}`);
    if (loadoutModelIndex === undefined) issues.push(`aircraft[${index}] references missing loadout model ${item.loadoutModelId}`);
    const propulsionModelIndexes = item.propulsionModelIds.map((id) => {
      const value = propulsionIndexes.get(id);
      if (value === undefined) issues.push(`aircraft[${index}] references missing propulsion model ${id}`);
      return value ?? -1;
    });
    if (propulsionModelIndexes.length === 0) issues.push(`aircraft[${index}].propulsionModelIds must not be empty`);
    const sensorModelIndexes = item.sensorModelIds.map((id) => {
      const value = sensorIndexes.get(id);
      if (value === undefined) issues.push(`aircraft[${index}] references missing sensor model ${id}`);
      return value ?? -1;
    });
    return {
      id: item.id,
      version: item.version,
      evidenceRefIds: [...item.evidenceRefIds],
      validityDomain: normalizeValidityDomain(issues, `aircraft[${index}].validityDomain`, item.validityDomain),
      limitationIds: [...item.limitationIds],
      catalogObjectId: item.catalogObjectId,
      emptyMassKg: normalizeQuantity(issues, `aircraft[${index}].emptyMass`, item.emptyMass, "kg", evidenceIds),
      fuelCapacityKg: normalizeQuantity(issues, `aircraft[${index}].fuelCapacity`, item.fuelCapacity, "kg", evidenceIds),
      aerodynamicModelIndex: aerodynamicModelIndex ?? -1,
      propulsionModelIndexes,
      sensorModelIndexes,
      loadoutModelIndex: loadoutModelIndex ?? -1,
      maximumCommandLoadFactorG: normalizeQuantity(issues, `aircraft[${index}].maximumCommandLoadFactor`, item.maximumCommandLoadFactor, "g0", evidenceIds),
    };
  });
  aircraft.forEach((item, index) => {
    if (item.emptyMassKg <= 0 || item.fuelCapacityKg < 0 || item.maximumCommandLoadFactorG <= 0) {
      issues.push(`aircraft[${index}] mass and load-factor values are outside their physical domain`);
    }
    const aerodynamic = aerodynamics[item.aerodynamicModelIndex];
    if (aerodynamic) {
      requireValidityDomainCoverage(
        issues,
        `aircraft[${index}].aerodynamicModel`,
        aerodynamic.validityDomain,
        item.validityDomain,
      );
      aerodynamic.coefficientTables.forEach((table, tableIndex) => {
        requireValidityDomainCoverage(
          issues,
          `aircraft[${index}].aerodynamicModel.coefficientTables[${tableIndex}]`,
          table.validityDomain,
          item.validityDomain,
        );
      });
    }
    item.propulsionModelIndexes.forEach((propulsionIndex, propulsionPosition) => {
      const propulsionModel = propulsion[propulsionIndex];
      if (!propulsionModel) return;
      requireValidityDomainCoverage(
        issues,
        `aircraft[${index}].propulsionModels[${propulsionPosition}]`,
        propulsionModel.validityDomain,
        item.validityDomain,
      );
      requireValidityDomainCoverage(
        issues,
        `aircraft[${index}].propulsionModels[${propulsionPosition}].thrustTable`,
        propulsionModel.thrustTable.validityDomain,
        item.validityDomain,
      );
      requireValidityDomainCoverage(
        issues,
        `aircraft[${index}].propulsionModels[${propulsionPosition}].fuelFlowTable`,
        propulsionModel.fuelFlowTable.validityDomain,
        item.validityDomain,
      );
    });
    item.sensorModelIndexes.forEach((sensorIndex, sensorPosition) => {
      const sensor = sensors[sensorIndex];
      if (sensor) {
        requireValidityDomainCoverage(
          issues,
          `aircraft[${index}].sensorModels[${sensorPosition}]`,
          sensor.validityDomain,
          item.validityDomain,
        );
      }
    });
  });

  const weapons = source.weapons.map((item, index): CompiledWeaponModel => {
    const aerodynamicModelIndex = aerodynamicIndexes.get(item.aerodynamicModelId);
    const propulsionModelIndex = propulsionIndexes.get(item.propulsionModelId);
    const sensorModelIndex = item.sensorModelId ? sensorIndexes.get(item.sensorModelId) : null;
    if (!catalogIds.has(item.catalogObjectId)) issues.push(`weapons[${index}] references missing catalog object ${item.catalogObjectId}`);
    if (aerodynamicModelIndex === undefined) issues.push(`weapons[${index}] references missing aerodynamic model ${item.aerodynamicModelId}`);
    if (propulsionModelIndex === undefined) issues.push(`weapons[${index}] references missing propulsion model ${item.propulsionModelId}`);
    if (item.sensorModelId && sensorModelIndex === undefined) issues.push(`weapons[${index}] references missing sensor model ${item.sensorModelId}`);
    if (!WEAPON_SEEKER_MODES.includes(item.seekerMode)) issues.push(`weapons[${index}].seekerMode is unsupported`);
    if (!WEAPON_SUPPORT_REQUIREMENTS.includes(item.supportRequirement)) issues.push(`weapons[${index}].supportRequirement is unsupported`);
    if (!WEAPON_LAUNCH_AUTHORIZATIONS.includes(item.launchAuthorization)) issues.push(`weapons[${index}].launchAuthorization is unsupported`);
    const launchMassKg = normalizeQuantity(issues, `weapons[${index}].launchMass`, item.launchMass, "kg", evidenceIds);
    const dryMassKg = normalizeQuantity(issues, `weapons[${index}].dryMass`, item.dryMass, "kg", evidenceIds);
    if (dryMassKg > launchMassKg) issues.push(`weapons[${index}].dryMass must not exceed launchMass`);
    return {
      id: item.id,
      version: item.version,
      evidenceRefIds: [...item.evidenceRefIds],
      validityDomain: normalizeValidityDomain(issues, `weapons[${index}].validityDomain`, item.validityDomain),
      limitationIds: [...item.limitationIds],
      catalogObjectId: item.catalogObjectId,
      launchMassKg,
      dryMassKg,
      aerodynamicModelIndex: aerodynamicModelIndex ?? -1,
      propulsionModelIndex: propulsionModelIndex ?? -1,
      sensorModelIndex: sensorModelIndex ?? null,
      seekerMode: item.seekerMode,
      supportRequirement: item.supportRequirement,
      launchAuthorization: item.launchAuthorization,
      maximumCommandLoadFactorG: normalizeQuantity(issues, `weapons[${index}].maximumCommandLoadFactor`, item.maximumCommandLoadFactor, "g0", evidenceIds),
      seekerActivationRangeM: normalizeQuantity(issues, `weapons[${index}].seekerActivationRange`, item.seekerActivationRange, "m", evidenceIds),
      datalinkUpdatePeriodS: normalizeQuantity(issues, `weapons[${index}].datalinkUpdatePeriod`, item.datalinkUpdatePeriod, "s", evidenceIds),
      thrustTaperSpeedMps: normalizeQuantity(issues, `weapons[${index}].thrustTaperSpeed`, item.thrustTaperSpeed, "m/s", evidenceIds),
      navigationConstant: normalizeQuantity(issues, `weapons[${index}].navigationConstant`, item.navigationConstant, "1", evidenceIds),
    };
  });
  weapons.forEach((item, index) => {
    if (
      item.launchMassKg <= 0 ||
      item.dryMassKg <= 0 ||
      item.maximumCommandLoadFactorG <= 0 ||
      item.seekerActivationRangeM < 0 ||
      item.datalinkUpdatePeriodS <= 0 ||
      item.thrustTaperSpeedMps <= 0 ||
      item.navigationConstant <= 0
    ) {
      issues.push(`weapons[${index}] contains values outside its physical domain`);
    }
  });

  const allExecutableModelIds = new Set([
    ...source.aerodynamics.map((item) => item.id),
    ...source.propulsion.map((item) => item.id),
    ...source.sensors.map((item) => item.id),
    ...source.aircraft.map((item) => item.id),
    ...source.weapons.map((item) => item.id),
    ...source.loadouts.map((item) => item.id),
  ]);
  for (const [index, identity] of source.catalogIdentities.entries()) {
    for (const definitionModelId of identity.definitionModelIds) {
      if (!allExecutableModelIds.has(definitionModelId)) {
        issues.push(`catalogIdentities[${index}] references missing model ${definitionModelId}`);
      }
    }
  }

  const loadouts = source.loadouts.map((item, index): CompiledLoadoutModel => {
    if (!catalogIds.has(item.platformCatalogObjectId)) issues.push(`loadouts[${index}] references missing catalog object ${item.platformCatalogObjectId}`);
    uniqueIds(issues, `loadouts[${index}].stations`, item.stations);
    return {
      id: item.id,
      version: item.version,
      evidenceRefIds: [...item.evidenceRefIds],
      validityDomain: normalizeValidityDomain(issues, `loadouts[${index}].validityDomain`, item.validityDomain),
      limitationIds: [...item.limitationIds],
      platformCatalogObjectId: item.platformCatalogObjectId,
      stations: item.stations.map((station, stationIndex) => {
        if (!Number.isSafeInteger(station.maximumQuantity) || station.maximumQuantity < 1) issues.push(`loadouts[${index}].stations[${stationIndex}].maximumQuantity must be a positive integer`);
        return {
          id: station.id,
          stationGroup: station.stationGroup,
          positionBodyM: {
            x: normalizeQuantity(issues, `loadouts[${index}].stations[${stationIndex}].positionBody.x`, station.positionBody.x, "m", evidenceIds),
            y: normalizeQuantity(issues, `loadouts[${index}].stations[${stationIndex}].positionBody.y`, station.positionBody.y, "m", evidenceIds),
            z: normalizeQuantity(issues, `loadouts[${index}].stations[${stationIndex}].positionBody.z`, station.positionBody.z, "m", evidenceIds),
          },
          maximumQuantity: station.maximumQuantity,
          compatibleStoreModelIndexes: station.compatibleStoreModelIds.map((id) => {
            const value = weaponIndexes.get(id);
            if (value === undefined) issues.push(`loadouts[${index}].stations[${stationIndex}] references missing store model ${id}`);
            return value ?? -1;
          }),
        };
      }),
    };
  });

  aircraft.forEach((item, index) => {
    const loadout = loadouts[item.loadoutModelIndex];
    if (loadout) {
      requireValidityDomainCoverage(
        issues,
        `aircraft[${index}].loadoutModel`,
        loadout.validityDomain,
        item.validityDomain,
      );
    }
  });

  const compatibility = source.compatibility.map((item, index): CompiledCompatibilityRule => {
    validateEvidenceRefs(issues, `compatibility[${index}].evidenceRefIds`, item.evidenceRefIds, evidenceIds);
    const loadoutModelIndex = loadoutIndexes.get(item.loadoutModelId);
    const storeModelIndex = weaponIndexes.get(item.storeModelId);
    if (!catalogIds.has(item.platformCatalogObjectId)) issues.push(`compatibility[${index}] references missing catalog object ${item.platformCatalogObjectId}`);
    if (loadoutModelIndex === undefined) issues.push(`compatibility[${index}] references missing loadout ${item.loadoutModelId}`);
    if (storeModelIndex === undefined) issues.push(`compatibility[${index}] references missing store ${item.storeModelId}`);
    if (!Number.isSafeInteger(item.maximumQuantity) || item.maximumQuantity < 1) issues.push(`compatibility[${index}].maximumQuantity must be a positive integer`);
    const loadout = loadoutModelIndex === undefined ? undefined : source.loadouts[loadoutModelIndex];
    const station = loadout?.stations.find((candidate) => candidate.stationGroup === item.stationGroup);
    if (!station) issues.push(`compatibility[${index}] references missing station group ${item.stationGroup}`);
    if (station && !station.compatibleStoreModelIds.includes(item.storeModelId)) issues.push(`compatibility[${index}] store is absent from station compatibility`);
    if (item.maximumQuantity > (station?.maximumQuantity ?? 0)) issues.push(`compatibility[${index}].maximumQuantity exceeds station capacity`);
    return {
      id: item.id,
      platformCatalogObjectId: item.platformCatalogObjectId,
      loadoutModelIndex: loadoutModelIndex ?? -1,
      storeModelIndex: storeModelIndex ?? -1,
      stationGroup: item.stationGroup,
      status: item.status,
      maximumQuantity: item.maximumQuantity,
      rationale: item.rationale,
      evidenceRefIds: [...item.evidenceRefIds],
    };
  });

  const intendedUseKeys = new Set(source.intendedUses.map((item) => `${item.id}@${item.version}`));
  for (const [index, reference] of source.credibility.intendedUseRefs.entries()) {
    if (!intendedUseKeys.has(`${reference.id}@${reference.version}`)) issues.push(`credibility.intendedUseRefs[${index}] is unresolved`);
  }
  uniqueIds(issues, "credibility.requirements", source.credibility.requirements);
  uniqueIds(issues, "credibility.cases", source.credibility.cases);
  uniqueIds(issues, "credibility.limitations", source.credibility.limitations);
  const requirementIds = new Set(source.credibility.requirements.map((item) => item.id));
  for (const [index, item] of source.credibility.cases.entries()) {
    if (!requirementIds.has(item.requirementId)) issues.push(`credibility.cases[${index}] references missing requirement ${item.requirementId}`);
    if (!evidenceIds.has(item.evidenceRefId)) issues.push(`credibility.cases[${index}] references missing evidence ${item.evidenceRefId}`);
  }
  if (!DIGEST_PATTERN.test(source.credibility.engineDigest)) issues.push("credibility.engineDigest must be a SHA-256 digest");
  version(issues, "credibility.version", source.credibility.version);

  if (issues.length > 0) throw new ModelPackValidationError(issues);

  const payload: Omit<CompiledModelPack, "digest"> = {
    schemaVersion: COMPILED_MODEL_PACK_SCHEMA_VERSION,
    id: source.id,
    version: source.version,
    unitSystem: "SI",
    coordinateConventions: { ...source.coordinateConventions },
    intendedUses: source.intendedUses.map((item) => ({ id: item.id, version: item.version })),
    credibilityManifestRef: { id: source.credibility.id, version: source.credibility.version },
    evidence: structuredClone(source.evidence),
    catalogIdentities: structuredClone(source.catalogIdentities),
    aerodynamics,
    propulsion,
    sensors,
    aircraft,
    weapons,
    loadouts,
    compatibility,
  };
  const digest = await modelPayloadDigest(payload);
  if (source.credibility.approvalState === "APPROVED_FOR_DECLARED_USE") {
    const staleCases = source.credibility.cases.filter(
      (item) => item.result !== "PASS" || item.reviewedModelDigest !== digest,
    );
    if (staleCases.length > 0) {
      throw new ModelPackValidationError([
        `approved credibility cases must all pass against ${digest}: ${staleCases.map((item) => item.id).join(", ")}`,
      ]);
    }
  }
  const manifestWithoutDigest: Omit<CredibilityManifest, "contentDigest"> = {
    schemaVersion: CREDIBILITY_MANIFEST_SCHEMA_VERSION,
    subject: { kind: "MODEL_PACK", id: source.id, digest },
    id: source.credibility.id,
    version: source.credibility.version,
    modelPackDigest: digest,
    engineDigest: source.credibility.engineDigest,
    intendedUseRefs: structuredClone(source.credibility.intendedUseRefs),
    validityDomain: normalizeValidityDomain([], "credibility.validityDomain", source.credibility.validityDomain),
    requirements: structuredClone(source.credibility.requirements),
    cases: structuredClone(source.credibility.cases),
    numericalTolerances: source.credibility.numericalTolerances.map((item) => {
      const normalized = normalizeNumber(item.tolerance, item.unit);
      return { metric: item.metric, tolerance: normalized.value, unit: normalized.unit };
    }),
    uncertaintyCharacterization: source.credibility.uncertaintyCharacterization,
    limitations: structuredClone(source.credibility.limitations),
    approvalState: source.credibility.approvalState,
  };
  const credibilityManifest: CredibilityManifest = {
    ...manifestWithoutDigest,
    contentDigest: await sha256Hex(manifestWithoutDigest),
  };
  return deepFreeze({ pack: { ...payload, digest }, credibilityManifest });
}

export async function verifyCompiledModelPackDigest(pack: CompiledModelPack) {
  if (!DIGEST_PATTERN.test(pack.digest)) return false;
  const payload = Object.fromEntries(
    Object.entries(pack).filter(([key]) => key !== "digest"),
  ) as Omit<CompiledModelPack, "digest">;
  return (await modelPayloadDigest(payload)) === pack.digest;
}

function resolvePatchTarget(pack: CompiledModelPack, modelId: string, fieldPath: string) {
  const aircraft = pack.aircraft.find((item) => item.id === modelId);
  if (aircraft) {
    const allowed: Record<string, { value: number; unit: SiUnit }> = {
      "/emptyMassKg": { value: aircraft.emptyMassKg, unit: "kg" },
      "/fuelCapacityKg": { value: aircraft.fuelCapacityKg, unit: "kg" },
      "/maximumCommandLoadFactorG": { value: aircraft.maximumCommandLoadFactorG, unit: "g0" },
    };
    return allowed[fieldPath];
  }
  const weapon = pack.weapons.find((item) => item.id === modelId);
  if (weapon) {
    const allowed: Record<string, { value: number; unit: SiUnit }> = {
      "/launchMassKg": { value: weapon.launchMassKg, unit: "kg" },
      "/dryMassKg": { value: weapon.dryMassKg, unit: "kg" },
      "/maximumCommandLoadFactorG": { value: weapon.maximumCommandLoadFactorG, unit: "g0" },
      "/seekerActivationRangeM": { value: weapon.seekerActivationRangeM, unit: "m" },
      "/datalinkUpdatePeriodS": { value: weapon.datalinkUpdatePeriodS, unit: "s" },
    };
    return allowed[fieldPath];
  }
  const sensor = pack.sensors.find((item) => item.id === modelId);
  if (sensor) {
    const allowed: Record<string, { value: number; unit: SiUnit }> = {
      "/detectionRangeM": { value: sensor.detectionRangeM, unit: "m" },
      "/minimumRangeM": { value: sensor.minimumRangeM, unit: "m" },
      "/scanPeriodS": { value: sensor.scanPeriodS, unit: "s" },
    };
    return allowed[fieldPath];
  }
  return undefined;
}

export function validateScenarioModelPatch(pack: CompiledModelPack, patch: ScenarioModelPatch) {
  const issues: string[] = [];
  stableId(issues, "patch.id", patch.id);
  if (patch.schemaVersion !== MODEL_PATCH_SCHEMA_VERSION) issues.push(`patch.schemaVersion must be ${MODEL_PATCH_SCHEMA_VERSION}`);
  if (patch.modelPackDigest !== pack.digest) issues.push("patch.modelPackDigest does not match the compiled pack");
  const target = resolvePatchTarget(pack, patch.modelId, patch.fieldPath);
  if (!target) issues.push(`patch target ${patch.modelId}${patch.fieldPath} is not patchable`);
  finite(issues, "patch.oldValue", patch.oldValue);
  finite(issues, "patch.newValue", patch.newValue);
  if (target && patch.unit !== target.unit) issues.push(`patch.unit must be ${target.unit}`);
  if (target && !Object.is(patch.oldValue, target.value)) issues.push(`patch.oldValue must equal compiled value ${target.value}`);
  if (!patch.reason.trim()) issues.push("patch.reason must not be blank");
  if (!patch.provenance.authorId.trim()) issues.push("patch.provenance.authorId must not be blank");
  if (!Number.isFinite(Date.parse(patch.provenance.authoredAt))) issues.push("patch.provenance.authoredAt must be ISO-8601");
  const evidenceIds = new Set(pack.evidence.map((item) => item.id));
  validateEvidenceRefs(issues, "patch.provenance.evidenceRefIds", patch.provenance.evidenceRefIds, evidenceIds);
  if (issues.length > 0) throw new ModelPackValidationError(issues);
}

export function validateScenarioModelInstance(pack: CompiledModelPack, instance: ScenarioModelInstance) {
  const issues: string[] = [];
  stableId(issues, "instance.id", instance.id);
  if (instance.modelPackDigest !== pack.digest) issues.push("instance.modelPackDigest does not match the compiled pack");
  const aircraftIndex = pack.aircraft.findIndex((item) => item.id === instance.modelId);
  const weaponIndex = pack.weapons.findIndex((item) => item.id === instance.modelId);
  if (aircraftIndex < 0 && weaponIndex < 0) issues.push(`instance references unknown executable model ${instance.modelId}`);
  const model = aircraftIndex >= 0 ? pack.aircraft[aircraftIndex] : weaponIndex >= 0 ? pack.weapons[weaponIndex] : undefined;
  if (model && model.catalogObjectId !== instance.catalogObjectId) issues.push("instance catalog identity does not match its executable model");
  if (weaponIndex >= 0 && instance.loadout.length > 0) issues.push("weapon instances cannot carry loadout inventory");
  if (aircraftIndex >= 0) {
    const aircraft = pack.aircraft[aircraftIndex];
    const loadout = pack.loadouts[aircraft.loadoutModelIndex];
    for (const [index, item] of instance.loadout.entries()) {
      if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) issues.push(`instance.loadout[${index}].quantity must be a positive integer`);
      const station = loadout?.stations.find((candidate) => candidate.id === item.stationId);
      const storeIndex = pack.weapons.findIndex((candidate) => candidate.id === item.storeModelId);
      if (!station) issues.push(`instance.loadout[${index}] references missing station ${item.stationId}`);
      if (storeIndex < 0) issues.push(`instance.loadout[${index}] references missing store ${item.storeModelId}`);
      if (station && !station.compatibleStoreModelIndexes.includes(storeIndex)) issues.push(`instance.loadout[${index}] is incompatible with station ${item.stationId}`);
      if (station && item.quantity > station.maximumQuantity) issues.push(`instance.loadout[${index}] exceeds station capacity`);
      const rule = pack.compatibility.find((candidate) =>
        candidate.platformCatalogObjectId === instance.catalogObjectId &&
        candidate.loadoutModelIndex === aircraft.loadoutModelIndex &&
        candidate.storeModelIndex === storeIndex &&
        candidate.stationGroup === station?.stationGroup
      );
      if (!rule || rule.status !== "SUPPORTED") issues.push(`instance.loadout[${index}] has no supported compatibility rule`);
      if (rule && item.quantity > rule.maximumQuantity) issues.push(`instance.loadout[${index}] exceeds compatibility quantity`);
    }
  }
  for (const patch of instance.patches) {
    try {
      validateScenarioModelPatch(pack, patch);
    } catch (error) {
      if (error instanceof ModelPackValidationError) issues.push(...error.issues.map((issue) => `instance patch ${patch.id}: ${issue}`));
      else throw error;
    }
  }
  if (issues.length > 0) throw new ModelPackValidationError(issues);
}
