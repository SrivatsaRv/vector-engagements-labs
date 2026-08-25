import { sha256Hex } from "./canonical-json.ts";
import { assertGovernedAircraftEvidenceAdmission } from "./aircraft-evidence-registry.ts";
import type { EntityLifecycle, ObserverTrackModel } from "./engine/contracts.ts";
import type { Vec3 } from "./engine/primitives.ts";

export const MODEL_PACK_SOURCE_SCHEMA_VERSION = "vector.model-pack-source.v1";
export const COMPILED_MODEL_PACK_SCHEMA_VERSION = "vector.compiled-model-pack.v1";
export const MODEL_PACK_SOURCE_V2_SCHEMA_VERSION = "vector.model-pack-source.v2";
export const COMPILED_MODEL_PACK_V2_SCHEMA_VERSION = "vector.compiled-model-pack.v2";
export const MODEL_PACK_REQUIREMENT_PROFILE_SCHEMA_VERSION = "vector.model-pack-requirement-profile.v1";
export const AIRCRAFT_RAW_SOURCE_SCHEMA_VERSION = "vector.aircraft-raw-source-artifact.v1";
export const AIRCRAFT_DERIVATIVE_SCHEMA_VERSION = "vector.aircraft-derivative.v1";
export const GOVERNED_MODEL_PACK_EXPORT_SCHEMA_VERSION = "vector.governed-model-pack-export.v1";
export const COMPILED_MODEL_PACK_EXPORT_SCHEMA_VERSION = "vector.compiled-model-pack-export.v1";
export const AIRCRAFT_DERIVATIVE_RECIPE_ID = "vector.aircraft-derivative.canonical-envelope";
export const AIRCRAFT_DERIVATIVE_RECIPE_VERSION = "1.0.0";
export const AIRCRAFT_DERIVATIVE_TOOL_ID = "vector-model-pack-offline-rebuilder";
export const AIRCRAFT_DERIVATIVE_TOOL_VERSION = "1.0.0";
export const CREDIBILITY_MANIFEST_SCHEMA_VERSION = "vector.credibility-manifest.v1";
export const INTENDED_USE_SCHEMA_VERSION = "vector.intended-use.v1";
export const MODEL_PATCH_SCHEMA_VERSION = "vector.model-patch.v1";
export const SENSOR_EVIDENCE_ADMISSION_SCHEMA_VERSION = "vector.sensor-evidence-admission.v1";

export type IntendedUseId =
  | "vector.intended-use.geometry-teaching"
  | "vector.intended-use.wvr-maneuver-study"
  | "vector.intended-use.bvr-timeline-study"
  | "vector.intended-use.weapon-flyout-study"
  | "vector.intended-use.debrief-comparison"
  | "vector.intended-use.engine-verification";

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
  /** SHA-256 of the retrieved public artifact, when a claim depends on it. */
  contentSha256?: string;
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
  /**
   * Required for a positive sensor. This makes evidence incompleteness an
   * explicit source artifact rather than an excuse to promote a range value.
   */
  evidenceAdmission?: SensorEvidenceAdmissionSource;
  detectionRange: Quantity;
  minimumRange: Quantity;
  scanPeriod: Quantity;
  azimuthFieldOfView: Quantity;
  elevationFieldOfView: Quantity;
  /** Bounded generic fixture. Production intended uses cannot admit it. */
  verificationTrackModel?: ObserverTrackModel;
};

export type SensorEvidenceCoverage = {
  detectionRange: "VALIDATED" | "UNKNOWN";
  minimumRange: "VALIDATED" | "UNKNOWN";
  scanPeriod: "VALIDATED" | "UNKNOWN";
  azimuthFieldOfView: "VALIDATED" | "UNKNOWN";
  elevationFieldOfView: "VALIDATED" | "UNKNOWN";
  measurementUncertainty: "VALIDATED" | "UNKNOWN";
  targetApplicability: "VALIDATED" | "UNKNOWN";
};

const SENSOR_EVIDENCE_COVERAGE_FIELDS = [
  "detectionRange",
  "minimumRange",
  "scanPeriod",
  "azimuthFieldOfView",
  "elevationFieldOfView",
  "measurementUncertainty",
  "targetApplicability",
] as const satisfies ReadonlyArray<keyof SensorEvidenceCoverage>;

export type SensorEvidenceAdmissionSource = {
  schemaVersion: typeof SENSOR_EVIDENCE_ADMISSION_SCHEMA_VERSION;
  sourceEvidenceRefIds: string[];
  validationEvidenceRefIds: string[];
  coverage: SensorEvidenceCoverage;
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
  performanceAdmission: AircraftPerformanceAdmissionSource;
};

/**
 * A named catalog identity is not evidence that its performance model is
 * credible. This explicit state prevents an assumption-backed fixture from
 * becoming a named-platform claim merely because its label is familiar.
 */
export type AircraftPerformanceCapability =
  | "AERODYNAMICS"
  | "PROPULSION"
  | "FLIGHT_CONTROLS"
  | "MASS_AND_STORES"
  | "SENSORS";

export type AircraftPerformanceAdmissionSource =
  | {
      state: "UNSUPPORTED";
      limitationId: string;
      reason: string;
    }
  | {
      state: "ADMITTED";
      capabilities: Array<{
        capability: AircraftPerformanceCapability;
        sourceEvidenceRefIds: string[];
        validationEvidenceRefIds: string[];
      }>;
    };

export type CompiledAircraftPerformanceAdmission = AircraftPerformanceAdmissionSource;

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

export type AircraftDataFamily =
  | "AERODYNAMICS"
  | "PROPULSION"
  | "FLIGHT_CONTROLS"
  | "MASS_PROPERTIES"
  | "STATIONS_STORES"
  | "SENSORS";

export type AircraftEvidenceRole = "SOURCE" | "VALIDATION";

export type AircraftLineageValueState =
  | "AVAILABLE"
  | "UNKNOWN"
  | "UNAVAILABLE"
  | "ASSUMPTION"
  | "REFERENCE_ONLY"
  | "UNSUPPORTED"
  | "NOT_APPLICABLE";

export type ModelPackRequirementProfile = {
  schemaVersion: typeof MODEL_PACK_REQUIREMENT_PROFILE_SCHEMA_VERSION;
  id: string;
  version: string;
  intendedUse: { id: IntendedUseId; version: string };
  requirements: Array<{
    id: string;
    dataFamily: AircraftDataFamily;
    applicability: { componentIds: string[]; configurations: string[] };
    fieldSelectors: string[];
    requiredEvidenceRoles: AircraftEvidenceRole[];
    required: boolean;
  }>;
};

export type AircraftRawSourceArtifact = {
  schemaVersion: typeof AIRCRAFT_RAW_SOURCE_SCHEMA_VERSION;
  id: string;
  version: string;
  subject: { id: string; configurationId: string };
  locator: { uri: string; retrievedAt: string; record: string };
  mediaType: string;
  byteLength: number;
  contentDigest: string;
  rights: {
    licenseId: string;
    redistribution: "PERMITTED" | "RESTRICTED" | "PROHIBITED";
    exportDisposition: "PUBLIC" | "CONTROLLED" | "UNKNOWN";
  };
  eligibility: {
    state: "ELIGIBLE" | "ENGINE_VERIFICATION_ONLY" | "REFERENCE_ONLY" | "INELIGIBLE";
    nonclaims: string[];
  };
};

export type AircraftDerivativeRecord = {
  schemaVersion: typeof AIRCRAFT_DERIVATIVE_SCHEMA_VERSION;
  id: string;
  version: string;
  subject: { id: string; configurationId: string };
  orderedInputDigests: string[];
  recipe: {
    id: string;
    version: string;
    tool: { id: string; version: string };
    arguments: string[];
    environmentDigest: string;
  };
  transformations: Array<{
    selector: string;
    fromUnit: SourceUnit;
    toUnit: SourceUnit;
    frame: string;
    datum: string;
    uncertaintyPropagation: "PRESERVED" | "PROPAGATED" | "UNKNOWN";
  }>;
  output: { mediaType: string; byteLength: number; contentDigest: string };
};

export type AircraftFieldLineage = {
  id: string;
  selector: string;
  dataFamily: AircraftDataFamily;
  componentId: string;
  configurationId: string;
  valueState: AircraftLineageValueState;
  evidenceRole: AircraftEvidenceRole;
  valueDigest?: string;
  rawArtifactDigest?: string;
  derivativeDigest?: string;
  sourceLocator?: string;
  sourceRecord?: string;
  unit: SourceUnit;
  frame: string;
  datum: string;
  uncertainty:
    | { state: "KNOWN"; magnitude: number; unit: SourceUnit }
    | { state: "UNKNOWN" };
  validityDomain: ValidityDomain;
  gapReason?: string;
};

export type ModelPackSourceV2 = Omit<ModelPackSource, "schemaVersion"> & {
  schemaVersion: typeof MODEL_PACK_SOURCE_V2_SCHEMA_VERSION;
  governance: {
    requirementProfile: ModelPackRequirementProfile;
    rawSourceArtifacts: AircraftRawSourceArtifact[];
    derivatives: AircraftDerivativeRecord[];
    fieldLineage: AircraftFieldLineage[];
  };
};

export type GovernedModelPackCompileInput = {
  source: ModelPackSourceV2;
  rawArtifactBytes: Array<{ digest: string; bytes: Uint8Array }>;
  derivativeBytes: Array<{ digest: string; bytes: Uint8Array }>;
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
  evidenceAdmission?: SensorEvidenceAdmissionSource;
  detectionRangeM: number;
  minimumRangeM: number;
  scanPeriodS: number;
  azimuthFieldOfViewRad: number;
  elevationFieldOfViewRad: number;
  verificationTrackModel?: ObserverTrackModel;
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
  performanceAdmission: CompiledAircraftPerformanceAdmission;
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

export type ModelPackRequirementCompleteness = {
  profile: { id: string; version: string; digest: string };
  results: Array<{
    requirementId: string;
    state: "SATISFIED" | "INCOMPLETE" | "NOT_APPLICABLE";
    gapReasons: string[];
  }>;
  complete: boolean;
  digest: string;
};

export type CompiledModelPackV2 = Omit<CompiledModelPack, "schemaVersion" | "digest"> & {
  schemaVersion: typeof COMPILED_MODEL_PACK_V2_SCHEMA_VERSION;
  digest: string;
  legacyProjectionDigest: string;
  sourceDigest: string;
  lineageDigest: string;
  admissionState: "INCOMPLETE" | "COMPLETE_FOUNDATION_NON_PROMOTABLE";
  requirementCompleteness: ModelPackRequirementCompleteness;
  evidenceLineage: AircraftFieldLineage[];
};

export type CompiledModelPackV2Bundle = {
  pack: CompiledModelPackV2;
  credibilityManifest: CredibilityManifest;
};

export type ExactModelPackReference = { id: string; version: string; digest: string };

export type GovernedModelPackPublication = GovernedModelPackCompileInput & {
  bundle: CompiledModelPackV2Bundle;
};

export type GovernedModelPackResearchExport = {
  schemaVersion: typeof GOVERNED_MODEL_PACK_EXPORT_SCHEMA_VERSION;
  publications: Array<{
    source: ModelPackSourceV2;
    rawArtifactBytes: Array<{ digest: string; bytes: number[] }>;
    derivativeBytes: Array<{ digest: string; bytes: number[] }>;
    bundle: CompiledModelPackV2Bundle;
  }>;
};

export type CompiledModelPackExport = {
  schemaVersion: typeof COMPILED_MODEL_PACK_EXPORT_SCHEMA_VERSION;
  packs: CompiledModelPackV2Bundle[];
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

/** Raised when an API or future mission mode asks for a named-performance claim that the pack cannot support. */
export class AircraftPerformanceAdmissionError extends Error {
  readonly catalogObjectId: string;
  readonly reason: string;

  constructor(
    catalogObjectId: string,
    reason: string,
  ) {
    super(`Named aircraft performance is unavailable for ${catalogObjectId}: ${reason}`);
    this.name = "AircraftPerformanceAdmissionError";
    this.catalogObjectId = catalogObjectId;
    this.reason = reason;
  }
}

const ID_PATTERN = /^[a-z0-9]+(?:[._:/-][a-z0-9]+)*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const WEAPON_SEEKER_MODES: WeaponSeekerMode[] = ["UNAVAILABLE", "ACTIVE_RADAR", "INFRARED", "PASSIVE_RADIATION"];
const WEAPON_SUPPORT_REQUIREMENTS: WeaponSupportRequirement[] = ["UNAVAILABLE", "NONE", "TRACK_UPDATE"];
const WEAPON_LAUNCH_AUTHORIZATIONS: WeaponLaunchAuthorization[] = ["SCHEDULED_TEST_ONLY", "TRACK_REQUIRED"];
const AIRCRAFT_PERFORMANCE_CAPABILITIES: AircraftPerformanceCapability[] = [
  "AERODYNAMICS",
  "PROPULSION",
  "FLIGHT_CONTROLS",
  "MASS_AND_STORES",
  "SENSORS",
];

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

function validateAircraftPerformanceAdmission(
  issues: string[],
  path: string,
  admission: AircraftPerformanceAdmissionSource,
  evidenceById: Map<string, EvidenceReference>,
  limitations: Map<string, ModelLimitation>,
) {
  if (admission?.state === "UNSUPPORTED") {
    if (!admission.reason?.trim()) issues.push(`${path}.reason must explain the unavailable named-platform claim`);
    const limitation = limitations.get(admission.limitationId);
    if (!limitation) {
      issues.push(`${path}.limitationId references a missing limitation`);
    } else if (limitation.severity !== "BLOCKING") {
      issues.push(`${path}.limitationId must be BLOCKING when named-platform performance is unavailable`);
    }
    return;
  }
  if (admission?.state !== "ADMITTED") {
    issues.push(`${path}.state must be UNSUPPORTED or ADMITTED`);
    return;
  }
  const seenCapabilities = new Set<AircraftPerformanceCapability>();
  for (const [index, capability] of admission.capabilities.entries()) {
    const capabilityPath = `${path}.capabilities[${index}]`;
    if (!AIRCRAFT_PERFORMANCE_CAPABILITIES.includes(capability.capability)) {
      issues.push(`${capabilityPath}.capability is unsupported`);
    }
    if (seenCapabilities.has(capability.capability)) {
      issues.push(`${path}.capabilities contains duplicate ${capability.capability}`);
    }
    seenCapabilities.add(capability.capability);
    const validateBoundEvidence = (ids: string[], evidenceKind: EvidenceReference["kind"], field: string) => {
      if (ids.length === 0) issues.push(`${capabilityPath}.${field} must not be empty`);
      for (const id of ids) {
        const evidence = evidenceById.get(id);
        if (!evidence) {
          issues.push(`${capabilityPath}.${field} references missing evidence ${id}`);
        } else if (evidence.kind !== evidenceKind) {
          issues.push(`${capabilityPath}.${field} evidence ${id} must be ${evidenceKind}`);
        } else if (!evidence.contentSha256 || !DIGEST_PATTERN.test(evidence.contentSha256)) {
          issues.push(`${capabilityPath}.${field} evidence ${id} must carry an immutable SHA-256 artifact digest`);
        }
      }
    };
    validateBoundEvidence(capability.sourceEvidenceRefIds, "SOURCE", "sourceEvidenceRefIds");
    validateBoundEvidence(capability.validationEvidenceRefIds, "VALIDATION", "validationEvidenceRefIds");
    if (capability.sourceEvidenceRefIds.some((id) => capability.validationEvidenceRefIds.includes(id))) {
      issues.push(`${capabilityPath} must not use one evidence artifact as both source and independent validation`);
    }
  }
  for (const capability of AIRCRAFT_PERFORMANCE_CAPABILITIES) {
    if (!seenCapabilities.has(capability)) {
      issues.push(`${path}.capabilities is missing ${capability}`);
    }
  }
}

function validateSensorEvidenceAdmission(
  issues: string[],
  path: string,
  sensor: SensorModelSource,
  evidenceById: Map<string, EvidenceReference>,
) {
  if (sensor.sensorKind === "DECLARED_ENVELOPE") return;

  const admission = sensor.evidenceAdmission;
  if (!admission) {
    issues.push(`${path}.evidenceAdmission is required for a positive ${sensor.sensorKind} sensor`);
    return;
  }
  if (admission.schemaVersion !== SENSOR_EVIDENCE_ADMISSION_SCHEMA_VERSION) {
    issues.push(`${path}.evidenceAdmission.schemaVersion must be ${SENSOR_EVIDENCE_ADMISSION_SCHEMA_VERSION}`);
  }
  const validateArtifacts = (
    ids: string[],
    kind: EvidenceReference["kind"],
    field: "sourceEvidenceRefIds" | "validationEvidenceRefIds",
  ) => {
    if (ids.length === 0) issues.push(`${path}.evidenceAdmission.${field} must not be empty`);
    for (const id of ids) {
      const evidence = evidenceById.get(id);
      if (!evidence) {
        issues.push(`${path}.evidenceAdmission.${field} references missing evidence ${id}`);
      } else if (evidence.kind !== kind) {
        issues.push(`${path}.evidenceAdmission.${field} evidence ${id} must be ${kind}`);
      } else if (!evidence.contentSha256 || !DIGEST_PATTERN.test(evidence.contentSha256)) {
        issues.push(`${path}.evidenceAdmission.${field} evidence ${id} must carry an immutable SHA-256 artifact digest`);
      } else if (!sensor.evidenceRefIds.includes(id)) {
        issues.push(`${path}.evidenceRefIds must include admitted evidence ${id}`);
      }
    }
  };
  validateArtifacts(admission.sourceEvidenceRefIds, "SOURCE", "sourceEvidenceRefIds");
  validateArtifacts(admission.validationEvidenceRefIds, "VALIDATION", "validationEvidenceRefIds");
  if (admission.sourceEvidenceRefIds.some((id) => admission.validationEvidenceRefIds.includes(id))) {
    issues.push(`${path}.evidenceAdmission must not use one artifact as both source and independent validation`);
  }
  for (const field of SENSOR_EVIDENCE_COVERAGE_FIELDS) {
    const state = admission.coverage?.[field];
    if (state !== "VALIDATED") {
      issues.push(`${path}.evidenceAdmission.coverage.${field} must be VALIDATED for a positive sensor`);
    }
  }
}

function validateVerificationTrackModel(
  issues: string[],
  path: string,
  model: ObserverTrackModel | undefined,
  intendedUseIds: ReadonlySet<IntendedUseId>,
) {
  if (!model) return;
  const expectedKeys = new Set([
    "schemaVersion", "valueState", "intendedUse", "positionBiasM", "velocityBiasMps",
    "positionStandardDeviationM", "velocityStandardDeviationMps", "confirmationObservations",
    "maximumObservationAgeSeconds", "coastAfterSeconds", "lostAfterSeconds", "observationWindowsSeconds",
  ]);
  if (
    Object.keys(model).length !== expectedKeys.size ||
    Object.keys(model).some((key) => !expectedKeys.has(key))
  ) issues.push(`${path}.verificationTrackModel has unsupported or missing fields`);
  if (!intendedUseIds.has("vector.intended-use.engine-verification")) {
    issues.push(`${path}.verificationTrackModel requires the engine-verification intended use`);
  }
  const finiteVector = (value: Vec3) =>
    [value?.x, value?.y, value?.z].every((item) => typeof item === "number" && Number.isFinite(item));
  const positiveVector = (value: Vec3) =>
    finiteVector(value) && value.x > 0 && value.y > 0 && value.z > 0;
  if (
    model.schemaVersion !== "vector.generic-track-model.v1" ||
    model.valueState !== "TEST_FIXTURE" ||
    model.intendedUse !== "ENGINE_VERIFICATION_ONLY" ||
    !finiteVector(model.positionBiasM) ||
    !finiteVector(model.velocityBiasMps) ||
    !positiveVector(model.positionStandardDeviationM) ||
    !positiveVector(model.velocityStandardDeviationMps) ||
    !Number.isSafeInteger(model.confirmationObservations) ||
    model.confirmationObservations < 2 ||
    !Number.isFinite(model.maximumObservationAgeSeconds) ||
    model.maximumObservationAgeSeconds < 0 ||
    !Number.isFinite(model.coastAfterSeconds) ||
    model.coastAfterSeconds <= 0 ||
    !Number.isFinite(model.lostAfterSeconds) ||
    model.lostAfterSeconds <= model.coastAfterSeconds ||
    !Array.isArray(model.observationWindowsSeconds) ||
    model.observationWindowsSeconds.length === 0 ||
    model.observationWindowsSeconds.some((window, windowIndex) =>
      Object.keys(window).length !== 2 || !("start" in window) || !("end" in window) ||
      !Number.isFinite(window.start) || !Number.isFinite(window.end) ||
      window.start < 0 || window.end < window.start ||
      (windowIndex > 0 && window.start <= model.observationWindowsSeconds[windowIndex - 1]!.end)
    )
  ) issues.push(`${path}.verificationTrackModel is invalid`);
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
  if (ArrayBuffer.isView(value)) return value;
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

function governedContentDigest(value: unknown) {
  const normalized = normalizeDigestNumbers(value);
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

export function aircraftLineageValueDigest(input: {
  selector: string;
  value: string | number | boolean;
  unit: SourceUnit;
  frame: string;
  datum: string;
}) {
  return governedContentDigest(input);
}

function modelPayloadDigest(pack: Omit<CompiledModelPack, "digest">) {
  return governedContentDigest(digestPayload(pack));
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
  const evidenceById = new Map(source.evidence.map((item) => [item.id, item]));
  const limitationIds = new Set(source.credibility.limitations.map((item) => item.id));
  const limitationsById = new Map(source.credibility.limitations.map((item) => [item.id, item]));
  source.evidence.forEach((item, index) => {
    if (item.contentSha256 !== undefined && !DIGEST_PATTERN.test(item.contentSha256)) {
      issues.push(`evidence[${index}].contentSha256 must be a SHA-256 digest when supplied`);
    }
  });
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

  const intendedUseIds = new Set(source.intendedUses.map((item) => item.id));
  const sensors = source.sensors.map((item, index): CompiledSensorModel => ({
    id: item.id,
    version: item.version,
    evidenceRefIds: [...item.evidenceRefIds],
    validityDomain: normalizeValidityDomain(issues, `sensors[${index}].validityDomain`, item.validityDomain),
    limitationIds: [...item.limitationIds],
    sensorKind: item.sensorKind,
    ...(item.evidenceAdmission
      ? { evidenceAdmission: structuredClone(item.evidenceAdmission) }
      : {}),
    detectionRangeM: normalizeQuantity(issues, `sensors[${index}].detectionRange`, item.detectionRange, "m", evidenceIds),
    minimumRangeM: normalizeQuantity(issues, `sensors[${index}].minimumRange`, item.minimumRange, "m", evidenceIds),
    scanPeriodS: normalizeQuantity(issues, `sensors[${index}].scanPeriod`, item.scanPeriod, "s", evidenceIds),
    azimuthFieldOfViewRad: normalizeQuantity(issues, `sensors[${index}].azimuthFieldOfView`, item.azimuthFieldOfView, "rad", evidenceIds),
    elevationFieldOfViewRad: normalizeQuantity(issues, `sensors[${index}].elevationFieldOfView`, item.elevationFieldOfView, "rad", evidenceIds),
    ...(item.verificationTrackModel
      ? { verificationTrackModel: structuredClone(item.verificationTrackModel) }
      : {}),
  }));
  sensors.forEach((item, index) => {
    if (item.detectionRangeM < 0 || item.minimumRangeM < 0 || item.scanPeriodS <= 0) {
      issues.push(`sensors[${index}] ranges must be non-negative and scan period must be positive`);
    }
    if (item.minimumRangeM > item.detectionRangeM && item.detectionRangeM > 0) {
      issues.push(`sensors[${index}].minimumRange must not exceed detectionRange`);
    }
  });
  source.sensors.forEach((item, index) => {
    validateSensorEvidenceAdmission(issues, `sensors[${index}]`, item, evidenceById);
    validateVerificationTrackModel(
      issues,
      `sensors[${index}]`,
      item.verificationTrackModel,
      intendedUseIds,
    );
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
    validateAircraftPerformanceAdmission(
      issues,
      `aircraft[${index}].performanceAdmission`,
      item.performanceAdmission,
      evidenceById,
      limitationsById,
    );
    try {
      assertGovernedAircraftEvidenceAdmission(item.catalogObjectId, item.performanceAdmission, evidenceById);
    } catch (error) {
      issues.push(`aircraft[${index}].performanceAdmission ${error instanceof Error ? error.message : String(error)}`);
    }
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
      performanceAdmission: structuredClone(item.performanceAdmission),
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

const AIRCRAFT_DATA_FAMILIES: AircraftDataFamily[] = [
  "AERODYNAMICS",
  "PROPULSION",
  "FLIGHT_CONTROLS",
  "MASS_PROPERTIES",
  "STATIONS_STORES",
  "SENSORS",
];
const AIRCRAFT_LINEAGE_VALUE_STATES: AircraftLineageValueState[] = [
  "AVAILABLE",
  "UNKNOWN",
  "UNAVAILABLE",
  "ASSUMPTION",
  "REFERENCE_ONLY",
  "UNSUPPORTED",
  "NOT_APPLICABLE",
];
const MAX_GOVERNED_ARTIFACT_BYTES = 32 * 1024 * 1024;
const MAX_GOVERNED_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_GOVERNED_CORPUS_BYTES = 64 * 1024 * 1024;
const MAX_GOVERNED_RECORDS = 2_048;
const MAX_GOVERNED_CONFIGURATIONS = 128;
const MAX_GOVERNED_TABLE_CELLS = 2_000_000;
const MAX_GOVERNED_TABLE_AXES = 6;

const compareCanonicalText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const pointerToken = (value: string) => value.replaceAll("~", "~0").replaceAll("/", "~1");

export type GovernedAircraftScalarField = {
  componentId: string;
  dataFamily: AircraftDataFamily;
  selector: string;
  unit: SourceUnit;
  value: string | number | boolean;
  configurations: string[];
  validityDomain: ValidityDomain;
};

type GovernedComponentAuthority = {
  component: unknown;
  validityDomain: ValidityDomain;
  families: Set<AircraftDataFamily>;
};

function governedComponentAuthorities(source: ModelPackSourceV2) {
  const authorities = new Map<string, GovernedComponentAuthority>();
  const register = (values: ModelSourceBase[], families: AircraftDataFamily[]) => values.forEach((component) => {
    authorities.set(component.id, {
      component,
      validityDomain: component.validityDomain,
      families: new Set(families),
    });
  });
  register(source.aerodynamics, ["AERODYNAMICS"]);
  register(source.propulsion, ["PROPULSION"]);
  register(source.sensors, ["SENSORS"]);
  register(source.aircraft, ["FLIGHT_CONTROLS", "MASS_PROPERTIES"]);
  register(source.weapons, ["STATIONS_STORES"]);
  register(source.loadouts, ["STATIONS_STORES"]);
  for (const rule of source.compatibility) {
    const loadout = source.loadouts.find((candidate) => candidate.id === rule.loadoutModelId);
    if (!loadout) continue;
    authorities.set(rule.id, {
      component: rule,
      validityDomain: loadout.validityDomain,
      families: new Set(["STATIONS_STORES"]),
    });
  }
  return authorities;
}

export function preflightGovernedModelPackTables(source: Pick<ModelPackSourceV2, "aerodynamics" | "propulsion">) {
  let totalCells = 0;
  const inspect = (path: string, table: CoefficientTableSource) => {
    if (!Array.isArray(table.axes) || table.axes.length < 1 || table.axes.length > MAX_GOVERNED_TABLE_AXES) {
      throw new ModelPackValidationError([
        `[MODEL_PACK_TABLE_SHAPE] ${path}.axes must contain 1..${MAX_GOVERNED_TABLE_AXES} axes`,
      ]);
    }
    if (!Array.isArray(table.values)) {
      throw new ModelPackValidationError([`[MODEL_PACK_TABLE_SHAPE] ${path}.values must be an array`]);
    }
    const valueCount = table.values.length;
    if (!Number.isSafeInteger(valueCount) || valueCount < 0) {
      throw new ModelPackValidationError([
        `[MODEL_PACK_TABLE_SHAPE] ${path}.values must have a non-negative safe-integer length`,
      ]);
    }
    let product = 1;
    for (const [axisIndex, axis] of table.axes.entries()) {
      if (!Array.isArray(axis.values) || !Number.isSafeInteger(axis.values.length) || axis.values.length < 1) {
        throw new ModelPackValidationError([
          `[MODEL_PACK_TABLE_SHAPE] ${path}.axes[${axisIndex}].values must have a positive safe-integer length`,
        ]);
      }
      if (product > Number.MAX_SAFE_INTEGER / axis.values.length) {
        throw new ModelPackValidationError([
          `[MODEL_PACK_TABLE_SHAPE] ${path} axis cardinality product exceeds Number.MAX_SAFE_INTEGER`,
        ]);
      }
      product *= axis.values.length;
    }
    if (valueCount !== product) {
      throw new ModelPackValidationError([
        `[MODEL_PACK_TABLE_SHAPE] ${path}.values length ${valueCount} does not match axis cardinality product ${product}`,
      ]);
    }
    if (product > MAX_GOVERNED_TABLE_CELLS || totalCells > MAX_GOVERNED_TABLE_CELLS - product) {
      throw new ModelPackValidationError([
        `[MODEL_PACK_TABLE_BOUNDS] ${path} exceeds ${MAX_GOVERNED_TABLE_CELLS} total governed table cells`,
      ]);
    }
    totalCells += product;
  };
  source.aerodynamics.forEach((model, modelIndex) => {
    model.coefficientTables.forEach((table, tableIndex) => inspect(
      `source.aerodynamics[${modelIndex}].coefficientTables[${tableIndex}]`,
      table,
    ));
  });
  source.propulsion.forEach((model, modelIndex) => {
    inspect(`source.propulsion[${modelIndex}].thrustTable`, model.thrustTable);
    inspect(`source.propulsion[${modelIndex}].fuelFlowTable`, model.fuelFlowTable);
  });
  return totalCells;
}

export function listGovernedAircraftScalarFields(source: ModelPackSourceV2): GovernedAircraftScalarField[] {
  const fields: GovernedAircraftScalarField[] = [];
  const add = (
    componentId: string,
    component: unknown,
    validityDomain: ValidityDomain,
    dataFamily: AircraftDataFamily,
    selector: string,
    unit: SourceUnit,
  ) => fields.push({
    componentId,
    dataFamily,
    selector,
    unit,
    value: resolveGovernedScalarSelector(component, selector) as string | number | boolean,
    configurations: [...validityDomain.configurations].sort(compareCanonicalText),
    validityDomain: structuredClone(validityDomain),
  });
  const addTable = (
    component: ModelSourceBase,
    dataFamily: AircraftDataFamily,
    root: string,
    table: CoefficientTableSource,
  ) => {
    for (const axis of table.axes) {
      axis.values.forEach((_value, index) => add(
        component.id,
        component,
        component.validityDomain,
        dataFamily,
        `${root}/axes/${pointerToken(axis.semantic)}/values/${index}`,
        axis.unit,
      ));
    }
    table.values.forEach((_value, index) => add(
      component.id,
      component,
      component.validityDomain,
      dataFamily,
      `${root}/values/${index}`,
      table.outputUnit,
    ));
  };
  for (const model of source.aerodynamics) {
    add(model.id, model, model.validityDomain, "AERODYNAMICS", "/referenceArea/value", model.referenceArea.unit);
    add(model.id, model, model.validityDomain, "AERODYNAMICS", "/referenceChord/value", model.referenceChord.unit);
    add(model.id, model, model.validityDomain, "AERODYNAMICS", "/referenceSpan/value", model.referenceSpan.unit);
    for (const table of model.coefficientTables) {
      addTable(model, "AERODYNAMICS", `/coefficientTables/${pointerToken(table.id)}`, table);
    }
  }
  for (const model of source.propulsion) {
    add(model.id, model, model.validityDomain, "PROPULSION", "/engineCount", "1");
    add(model.id, model, model.validityDomain, "PROPULSION", "/spoolTime/value", model.spoolTime.unit);
    addTable(model, "PROPULSION", "/thrustTable", model.thrustTable);
    addTable(model, "PROPULSION", "/fuelFlowTable", model.fuelFlowTable);
  }
  for (const model of source.sensors) {
    add(model.id, model, model.validityDomain, "SENSORS", "/sensorKind", "1");
    for (const field of [
      "detectionRange", "minimumRange", "scanPeriod", "azimuthFieldOfView", "elevationFieldOfView",
    ] as const) add(model.id, model, model.validityDomain, "SENSORS", `/${field}/value`, model[field].unit);
  }
  for (const model of source.aircraft) {
    add(model.id, model, model.validityDomain, "FLIGHT_CONTROLS", "/maximumCommandLoadFactor/value", model.maximumCommandLoadFactor.unit);
    add(model.id, model, model.validityDomain, "MASS_PROPERTIES", "/emptyMass/value", model.emptyMass.unit);
    add(model.id, model, model.validityDomain, "MASS_PROPERTIES", "/fuelCapacity/value", model.fuelCapacity.unit);
  }
  for (const model of source.weapons) {
    for (const field of ["seekerMode", "supportRequirement", "launchAuthorization"] as const) {
      add(model.id, model, model.validityDomain, "STATIONS_STORES", `/${field}`, "1");
    }
    for (const field of [
      "launchMass", "dryMass", "maximumCommandLoadFactor", "seekerActivationRange",
      "datalinkUpdatePeriod", "thrustTaperSpeed", "navigationConstant",
    ] as const) add(model.id, model, model.validityDomain, "STATIONS_STORES", `/${field}/value`, model[field].unit);
  }
  for (const model of source.loadouts) {
    for (const station of model.stations) {
      const root = `/stations/${pointerToken(station.id)}`;
      add(model.id, model, model.validityDomain, "STATIONS_STORES", `${root}/stationGroup`, "1");
      add(model.id, model, model.validityDomain, "STATIONS_STORES", `${root}/positionBody/x/value`, station.positionBody.x.unit);
      add(model.id, model, model.validityDomain, "STATIONS_STORES", `${root}/positionBody/y/value`, station.positionBody.y.unit);
      add(model.id, model, model.validityDomain, "STATIONS_STORES", `${root}/positionBody/z/value`, station.positionBody.z.unit);
      add(model.id, model, model.validityDomain, "STATIONS_STORES", `${root}/maximumQuantity`, "1");
      for (const storeModelId of station.compatibleStoreModelIds) add(
        model.id,
        model,
        model.validityDomain,
        "STATIONS_STORES",
        `${root}/compatibleStoreModelIds/${pointerToken(storeModelId)}`,
        "1",
      );
    }
  }
  for (const rule of source.compatibility) {
    const loadout = source.loadouts.find((candidate) => candidate.id === rule.loadoutModelId);
    if (!loadout) continue;
    for (const [selector, unit] of [
      ["/stationGroup", "1"], ["/status", "1"], ["/maximumQuantity", "1"],
    ] as const) add(rule.id, rule, loadout.validityDomain, "STATIONS_STORES", selector, unit);
  }
  return fields.sort((left, right) => compareCanonicalText(
    `${left.dataFamily}\u0000${left.componentId}\u0000${left.selector}`,
    `${right.dataFamily}\u0000${right.componentId}\u0000${right.selector}`,
  ));
}

function validateUniqueStrings(issues: string[], path: string, values: string[]) {
  nonEmpty(issues, path, values);
  if (new Set(values).size !== values.length) issues.push(`${path} must not contain duplicates`);
}

function validateSourceUnit(issues: string[], path: string, unit: SourceUnit) {
  if (!Object.hasOwn(UNIT_CONVERSIONS, unit)) issues.push(`${path} unit is unsupported`);
}

function resolveGovernedScalarSelector(component: unknown, selector: string) {
  if (!selector.startsWith("/") || /~(?:[^01]|$)/u.test(selector)) return undefined;
  let value: unknown = component;
  for (const encodedToken of selector.slice(1).split("/")) {
    const token = encodedToken.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(value)) {
      if (value.length > 0 && typeof value[0] === "string") {
        const index = value.indexOf(token);
        if (index < 0 || value.indexOf(token, index + 1) >= 0) return undefined;
        value = value[index];
        continue;
      }
      if (value.length > 0 && value[0] && typeof value[0] === "object" && !Array.isArray(value[0])) {
        const matches = value.filter((item): item is Record<string, unknown> =>
          Boolean(item)
          && typeof item === "object"
          && !Array.isArray(item)
          && (item.id === token || item.semantic === token)
        );
        if (matches.length !== 1) return undefined;
        [value] = matches;
      } else {
        if (!/^(?:0|[1-9][0-9]*)$/u.test(token)) return undefined;
        value = value[Number(token)];
      }
    } else if (value && typeof value === "object" && Object.hasOwn(value, token)) {
      value = (value as Record<string, unknown>)[token];
    } else {
      return undefined;
    }
  }
  return ["string", "number", "boolean"].includes(typeof value) ? value : undefined;
}

function exactKeys(
  issues: string[],
  path: string,
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push(`${path} must be an object`);
    return;
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(`${path} has unsupported field ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) issues.push(`${path} is missing field ${key}`);
  }
}

function validateGovernedExactKeys(source: ModelPackSourceV2, issues: string[]) {
  exactKeys(issues, "source", source, [
    "schemaVersion", "id", "version", "coordinateConventions", "intendedUses", "evidence",
    "catalogIdentities", "aerodynamics", "propulsion", "sensors", "aircraft", "weapons",
    "loadouts", "compatibility", "credibility", "governance",
  ]);
  exactKeys(issues, "source.coordinateConventions", source.coordinateConventions, [
    "geodeticDatum", "localFrame", "bodyAxes", "aerodynamicAxes", "angularUnit",
    "positionUnit", "velocityUnit", "verticalReference",
  ]);
  source.intendedUses?.forEach((item, index) => exactKeys(
    issues,
    `source.intendedUses[${index}]`,
    item,
    [
      "schemaVersion", "id", "version", "question", "requiredCapabilities",
      "supportedInterpretations", "unsupportedInterpretations",
    ],
  ));
  source.evidence?.forEach((item, index) => exactKeys(
    issues,
    `source.evidence[${index}]`,
    item,
    ["id", "kind", "title", "uri", "accessedAt"],
    ["locator", "contentSha256"],
  ));
  source.catalogIdentities?.forEach((item, index) => exactKeys(
    issues,
    `source.catalogIdentities[${index}]`,
    item,
    ["catalogObjectId", "kind", "definitionModelIds"],
  ));
  const validity = (path: string, value: ValidityDomain) => {
    exactKeys(issues, path, value, [
      "altitude", "mach", "angleOfAttack", "loadFactor", "configurations", "environments",
    ]);
    for (const field of ["altitude", "mach", "angleOfAttack", "loadFactor"] as const) {
      exactKeys(issues, `${path}.${field}`, value?.[field], ["minimum", "maximum", "unit"]);
    }
  };
  const quantity = (path: string, value: Quantity) => exactKeys(
    issues,
    path,
    value,
    ["value", "unit", "evidenceRefIds"],
  );
  const table = (path: string, value: CoefficientTableSource) => {
    exactKeys(issues, path, value, [
      "id", "outputUnit", "axes", "values", "evidenceRefIds", "validityDomain",
    ]);
    value?.axes?.forEach((axis, index) => exactKeys(
      issues,
      `${path}.axes[${index}]`,
      axis,
      ["semantic", "unit", "values"],
    ));
    validity(`${path}.validityDomain`, value?.validityDomain);
  };
  const base = (path: string, value: ModelSourceBase, specific: string[], optional: string[] = []) => {
    exactKeys(issues, path, value, [
      "kind", "id", "version", "evidenceRefIds", "validityDomain", "limitationIds", ...specific,
    ], ["dependsOn", ...optional]);
    validity(`${path}.validityDomain`, value?.validityDomain);
  };
  source.aerodynamics?.forEach((item, index) => {
    const path = `source.aerodynamics[${index}]`;
    base(path, item, ["referenceArea", "referenceChord", "referenceSpan", "coefficientTables"]);
    quantity(`${path}.referenceArea`, item.referenceArea);
    quantity(`${path}.referenceChord`, item.referenceChord);
    quantity(`${path}.referenceSpan`, item.referenceSpan);
    item.coefficientTables?.forEach((value, tableIndex) => table(`${path}.coefficientTables[${tableIndex}]`, value));
  });
  source.propulsion?.forEach((item, index) => {
    const path = `source.propulsion[${index}]`;
    base(path, item, ["engineCount", "thrustTable", "fuelFlowTable", "spoolTime"]);
    table(`${path}.thrustTable`, item.thrustTable);
    table(`${path}.fuelFlowTable`, item.fuelFlowTable);
    quantity(`${path}.spoolTime`, item.spoolTime);
  });
  source.sensors?.forEach((item, index) => {
    const path = `source.sensors[${index}]`;
    base(path, item, [
      "sensorKind", "detectionRange", "minimumRange", "scanPeriod",
      "azimuthFieldOfView", "elevationFieldOfView",
    ], ["evidenceAdmission", "verificationTrackModel"]);
    for (const field of [
      "detectionRange", "minimumRange", "scanPeriod", "azimuthFieldOfView", "elevationFieldOfView",
    ] as const) quantity(`${path}.${field}`, item[field]);
    if (item.evidenceAdmission) {
      exactKeys(issues, `${path}.evidenceAdmission`, item.evidenceAdmission, [
        "schemaVersion", "sourceEvidenceRefIds", "validationEvidenceRefIds", "coverage",
      ]);
      exactKeys(issues, `${path}.evidenceAdmission.coverage`, item.evidenceAdmission.coverage, [
        ...SENSOR_EVIDENCE_COVERAGE_FIELDS,
      ]);
    }
  });
  source.aircraft?.forEach((item, index) => {
    const path = `source.aircraft[${index}]`;
    base(path, item, [
      "catalogObjectId", "emptyMass", "fuelCapacity", "aerodynamicModelId",
      "propulsionModelIds", "sensorModelIds", "loadoutModelId",
      "maximumCommandLoadFactor", "performanceAdmission",
    ]);
    quantity(`${path}.emptyMass`, item.emptyMass);
    quantity(`${path}.fuelCapacity`, item.fuelCapacity);
    quantity(`${path}.maximumCommandLoadFactor`, item.maximumCommandLoadFactor);
    if (item.performanceAdmission?.state === "UNSUPPORTED") {
      exactKeys(issues, `${path}.performanceAdmission`, item.performanceAdmission, ["state", "limitationId", "reason"]);
    } else {
      exactKeys(issues, `${path}.performanceAdmission`, item.performanceAdmission, ["state", "capabilities"]);
      item.performanceAdmission?.capabilities?.forEach((capability, capabilityIndex) => exactKeys(
        issues,
        `${path}.performanceAdmission.capabilities[${capabilityIndex}]`,
        capability,
        ["capability", "sourceEvidenceRefIds", "validationEvidenceRefIds"],
      ));
    }
  });
  source.weapons?.forEach((item, index) => {
    const path = `source.weapons[${index}]`;
    base(path, item, [
      "catalogObjectId", "launchMass", "dryMass", "aerodynamicModelId", "propulsionModelId",
      "seekerMode", "supportRequirement", "launchAuthorization", "maximumCommandLoadFactor",
      "seekerActivationRange", "datalinkUpdatePeriod", "thrustTaperSpeed", "navigationConstant",
    ], ["sensorModelId"]);
    for (const field of [
      "launchMass", "dryMass", "maximumCommandLoadFactor", "seekerActivationRange",
      "datalinkUpdatePeriod", "thrustTaperSpeed", "navigationConstant",
    ] as const) quantity(`${path}.${field}`, item[field]);
  });
  source.loadouts?.forEach((item, index) => {
    const path = `source.loadouts[${index}]`;
    base(path, item, ["platformCatalogObjectId", "stations"]);
    item.stations?.forEach((station, stationIndex) => {
      const stationPath = `${path}.stations[${stationIndex}]`;
      exactKeys(issues, stationPath, station, [
        "id", "stationGroup", "positionBody", "maximumQuantity", "compatibleStoreModelIds",
      ]);
      exactKeys(issues, `${stationPath}.positionBody`, station.positionBody, ["x", "y", "z"]);
      quantity(`${stationPath}.positionBody.x`, station.positionBody?.x);
      quantity(`${stationPath}.positionBody.y`, station.positionBody?.y);
      quantity(`${stationPath}.positionBody.z`, station.positionBody?.z);
    });
  });
  source.compatibility?.forEach((item, index) => exactKeys(
    issues,
    `source.compatibility[${index}]`,
    item,
    [
      "id", "platformCatalogObjectId", "loadoutModelId", "storeModelId", "stationGroup",
      "status", "maximumQuantity", "rationale", "evidenceRefIds",
    ],
  ));
  exactKeys(issues, "source.credibility", source.credibility, [
    "id", "version", "engineDigest", "intendedUseRefs", "validityDomain", "requirements",
    "cases", "numericalTolerances", "uncertaintyCharacterization", "limitations", "approvalState",
  ]);
  validity("source.credibility.validityDomain", source.credibility?.validityDomain);
  source.credibility?.intendedUseRefs?.forEach((item, index) => exactKeys(
    issues,
    `source.credibility.intendedUseRefs[${index}]`,
    item,
    ["id", "version"],
  ));
  source.credibility?.requirements?.forEach((item, index) => exactKeys(
    issues,
    `source.credibility.requirements[${index}]`,
    item,
    ["id", "statement"],
  ));
  source.credibility?.cases?.forEach((item, index) => exactKeys(
    issues,
    `source.credibility.cases[${index}]`,
    item,
    ["id", "requirementId", "kind", "result", "tolerance", "evidenceRefId"],
    ["executedAt", "reviewedModelDigest"],
  ));
  source.credibility?.numericalTolerances?.forEach((item, index) => exactKeys(
    issues,
    `source.credibility.numericalTolerances[${index}]`,
    item,
    ["metric", "tolerance", "unit"],
  ));
  source.credibility?.limitations?.forEach((item, index) => exactKeys(
    issues,
    `source.credibility.limitations[${index}]`,
    item,
    ["id", "severity", "statement", "affectedCapabilities"],
  ));
  exactKeys(issues, "source.governance", source.governance, [
    "requirementProfile", "rawSourceArtifacts", "derivatives", "fieldLineage",
  ]);
  const profile = source.governance?.requirementProfile;
  exactKeys(issues, "source.governance.requirementProfile", profile, [
    "schemaVersion", "id", "version", "intendedUse", "requirements",
  ]);
  exactKeys(issues, "source.governance.requirementProfile.intendedUse", profile?.intendedUse, ["id", "version"]);
  profile?.requirements?.forEach((item, index) => {
    const path = `source.governance.requirementProfile.requirements[${index}]`;
    exactKeys(issues, path, item, [
      "id", "dataFamily", "applicability", "fieldSelectors", "requiredEvidenceRoles", "required",
    ]);
    exactKeys(issues, `${path}.applicability`, item.applicability, ["componentIds", "configurations"]);
  });
  source.governance?.rawSourceArtifacts?.forEach((item, index) => {
    const path = `source.governance.rawSourceArtifacts[${index}]`;
    exactKeys(issues, path, item, [
      "schemaVersion", "id", "version", "subject", "locator", "mediaType", "byteLength",
      "contentDigest", "rights", "eligibility",
    ]);
    exactKeys(issues, `${path}.subject`, item.subject, ["id", "configurationId"]);
    exactKeys(issues, `${path}.locator`, item.locator, ["uri", "retrievedAt", "record"]);
    exactKeys(issues, `${path}.rights`, item.rights, ["licenseId", "redistribution", "exportDisposition"]);
    exactKeys(issues, `${path}.eligibility`, item.eligibility, ["state", "nonclaims"]);
  });
  source.governance?.derivatives?.forEach((item, index) => {
    const path = `source.governance.derivatives[${index}]`;
    exactKeys(issues, path, item, [
      "schemaVersion", "id", "version", "subject", "orderedInputDigests", "recipe",
      "transformations", "output",
    ]);
    exactKeys(issues, `${path}.subject`, item.subject, ["id", "configurationId"]);
    exactKeys(issues, `${path}.recipe`, item.recipe, ["id", "version", "tool", "arguments", "environmentDigest"]);
    exactKeys(issues, `${path}.recipe.tool`, item.recipe?.tool, ["id", "version"]);
    item.transformations?.forEach((transformation, transformationIndex) => exactKeys(
      issues,
      `${path}.transformations[${transformationIndex}]`,
      transformation,
      ["selector", "fromUnit", "toUnit", "frame", "datum", "uncertaintyPropagation"],
    ));
    exactKeys(issues, `${path}.output`, item.output, ["mediaType", "byteLength", "contentDigest"]);
  });
  source.governance?.fieldLineage?.forEach((item, index) => {
    const path = `source.governance.fieldLineage[${index}]`;
    exactKeys(issues, path, item, [
      "id", "selector", "dataFamily", "componentId", "configurationId", "valueState",
      "evidenceRole", "unit", "frame", "datum", "uncertainty", "validityDomain",
    ], ["valueDigest", "rawArtifactDigest", "derivativeDigest", "sourceLocator", "sourceRecord", "gapReason"]);
    exactKeys(
      issues,
      `${path}.uncertainty`,
      item.uncertainty,
      item.uncertainty?.state === "KNOWN" ? ["state", "magnitude", "unit"] : ["state"],
    );
  });
}

function orderedGovernance(source: ModelPackSourceV2) {
  const clone = structuredClone(source);
  const byId = <T extends { id: string }>(values: T[]) => values.sort((left, right) => compareCanonicalText(left.id, right.id));
  const sortStrings = (values: string[]) => values.sort(compareCanonicalText);
  const sortValidity = (value: ValidityDomain) => {
    sortStrings(value.configurations);
    sortStrings(value.environments);
  };
  clone.intendedUses.sort((left, right) => compareCanonicalText(`${left.id}@${left.version}`, `${right.id}@${right.version}`));
  for (const intendedUse of clone.intendedUses) {
    sortStrings(intendedUse.requiredCapabilities);
    sortStrings(intendedUse.supportedInterpretations);
    sortStrings(intendedUse.unsupportedInterpretations);
  }
  byId(clone.evidence);
  byId(clone.aerodynamics);
  byId(clone.propulsion);
  byId(clone.sensors);
  byId(clone.aircraft);
  byId(clone.weapons);
  byId(clone.loadouts);
  byId(clone.compatibility);
  clone.catalogIdentities.sort((left, right) => compareCanonicalText(left.catalogObjectId, right.catalogObjectId));
  for (const identity of clone.catalogIdentities) sortStrings(identity.definitionModelIds);
  for (const model of [...clone.aerodynamics, ...clone.propulsion, ...clone.sensors, ...clone.aircraft, ...clone.weapons, ...clone.loadouts]) {
    sortStrings(model.evidenceRefIds);
    sortStrings(model.limitationIds);
    if (model.dependsOn) sortStrings(model.dependsOn);
    sortValidity(model.validityDomain);
  }
  for (const model of clone.aerodynamics) byId(model.coefficientTables);
  for (const model of clone.aircraft) {
    sortStrings(model.propulsionModelIds);
    sortStrings(model.sensorModelIds);
  }
  for (const model of clone.loadouts) {
    byId(model.stations);
    for (const station of model.stations) sortStrings(station.compatibleStoreModelIds);
  }
  clone.credibility.intendedUseRefs.sort((left, right) => compareCanonicalText(`${left.id}@${left.version}`, `${right.id}@${right.version}`));
  byId(clone.credibility.requirements);
  byId(clone.credibility.cases);
  byId(clone.credibility.limitations);
  clone.credibility.numericalTolerances.sort((left, right) => compareCanonicalText(left.metric, right.metric));
  sortValidity(clone.credibility.validityDomain);
  clone.governance.requirementProfile.requirements.sort((left, right) => compareCanonicalText(left.id, right.id));
  for (const requirement of clone.governance.requirementProfile.requirements) {
    requirement.applicability.componentIds.sort(compareCanonicalText);
    requirement.applicability.configurations.sort(compareCanonicalText);
    requirement.fieldSelectors.sort(compareCanonicalText);
    requirement.requiredEvidenceRoles.sort(compareCanonicalText);
  }
  clone.governance.rawSourceArtifacts.sort((left, right) => compareCanonicalText(left.id, right.id));
  for (const artifact of clone.governance.rawSourceArtifacts) artifact.eligibility.nonclaims.sort(compareCanonicalText);
  clone.governance.derivatives.sort((left, right) => compareCanonicalText(left.id, right.id));
  for (const derivative of clone.governance.derivatives) {
    derivative.transformations.sort((left, right) => compareCanonicalText(left.selector, right.selector));
  }
  clone.governance.fieldLineage.sort((left, right) => compareCanonicalText(left.id, right.id));
  return clone;
}

export async function sha256ArtifactBytes(bytes: Uint8Array) {
  const ownedBytes = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", ownedBytes.buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function byteMap(
  issues: string[],
  path: string,
  entries: Array<{ digest: string; bytes: Uint8Array }>,
) {
  const result = new Map<string, Uint8Array>();
  let totalBytes = 0;
  if (entries.length > MAX_GOVERNED_RECORDS) issues.push(`${path} exceeds ${MAX_GOVERNED_RECORDS} records`);
  for (const [index, entry] of entries.entries()) {
    exactKeys(issues, `${path}[${index}]`, entry, ["digest", "bytes"]);
    if (!DIGEST_PATTERN.test(entry.digest)) issues.push(`${path}[${index}].digest must be a SHA-256 digest`);
    if (!(entry.bytes instanceof Uint8Array)) issues.push(`${path}[${index}].bytes must be Uint8Array`);
    if (entry.bytes?.byteLength > MAX_GOVERNED_ARTIFACT_BYTES) {
      issues.push(`${path}[${index}].bytes exceeds ${MAX_GOVERNED_ARTIFACT_BYTES} bytes`);
    }
    totalBytes += entry.bytes?.byteLength ?? 0;
    if (result.has(entry.digest)) issues.push(`${path} contains duplicate digest ${entry.digest}`);
    result.set(entry.digest, entry.bytes);
  }
  if (totalBytes > MAX_GOVERNED_CORPUS_BYTES) issues.push(`${path} exceeds ${MAX_GOVERNED_CORPUS_BYTES} total bytes`);
  return result;
}

export async function rebuildAircraftDerivative(
  derivative: AircraftDerivativeRecord,
  orderedInputs: Array<{ digest: string; bytes: Uint8Array }>,
) {
  if (
    derivative.recipe.id !== AIRCRAFT_DERIVATIVE_RECIPE_ID
    || derivative.recipe.version !== AIRCRAFT_DERIVATIVE_RECIPE_VERSION
    || derivative.recipe.tool.id !== AIRCRAFT_DERIVATIVE_TOOL_ID
    || derivative.recipe.tool.version !== AIRCRAFT_DERIVATIVE_TOOL_VERSION
  ) {
    throw new ModelPackValidationError([
      `[MODEL_PACK_DERIVATIVE_RECIPE] derivative ${derivative.id} uses an unsupported recipe/tool identity`,
    ]);
  }
  if (
    orderedInputs.length !== derivative.orderedInputDigests.length
    || orderedInputs.some((input, index) => input.digest !== derivative.orderedInputDigests[index])
  ) {
    throw new ModelPackValidationError([
      `[MODEL_PACK_DERIVATIVE_INPUT] derivative ${derivative.id} inputs do not match orderedInputDigests`,
    ]);
  }
  const encoded = JSON.stringify({
    schemaVersion: derivative.schemaVersion,
    id: derivative.id,
    version: derivative.version,
    subject: derivative.subject,
    orderedInputs: orderedInputs.map((input) => ({ digest: input.digest, bytes: [...input.bytes] })),
    recipe: derivative.recipe,
    transformations: [...derivative.transformations].sort((left, right) =>
      compareCanonicalText(left.selector, right.selector)
    ),
    outputMediaType: derivative.output.mediaType,
  });
  return new TextEncoder().encode(encoded);
}

async function validateGovernedLineage(input: GovernedModelPackCompileInput) {
  const { source } = input;
  const issues: string[] = [];
  exactKeys(issues, "compileInput", input, ["source", "rawArtifactBytes", "derivativeBytes"]);
  if (source.schemaVersion !== MODEL_PACK_SOURCE_V2_SCHEMA_VERSION) {
    issues.push(`schemaVersion must be ${MODEL_PACK_SOURCE_V2_SCHEMA_VERSION}`);
  }
  validateGovernedExactKeys(source, issues);
  if (issues.length > 0) throw new ModelPackValidationError(issues);
  preflightGovernedModelPackTables(source);
  const encodedSource = new TextEncoder().encode(JSON.stringify(source));
  if (encodedSource.byteLength > MAX_GOVERNED_SOURCE_BYTES) {
    issues.push(`source exceeds ${MAX_GOVERNED_SOURCE_BYTES} bytes`);
  }
  const { requirementProfile, rawSourceArtifacts, derivatives, fieldLineage } = source.governance;
  if (requirementProfile.schemaVersion !== MODEL_PACK_REQUIREMENT_PROFILE_SCHEMA_VERSION) {
    issues.push(`requirementProfile.schemaVersion must be ${MODEL_PACK_REQUIREMENT_PROFILE_SCHEMA_VERSION}`);
  }
  stableId(issues, "requirementProfile.id", requirementProfile.id);
  version(issues, "requirementProfile.version", requirementProfile.version);
  uniqueIds(issues, "requirementProfile.requirements", requirementProfile.requirements);
  uniqueIds(issues, "rawSourceArtifacts", rawSourceArtifacts);
  uniqueIds(issues, "derivatives", derivatives);
  uniqueIds(issues, "fieldLineage", fieldLineage);
  if (rawSourceArtifacts.length + derivatives.length + fieldLineage.length > MAX_GOVERNED_RECORDS) {
    issues.push(`governed record count exceeds ${MAX_GOVERNED_RECORDS}`);
  }
  if (!source.intendedUses.some((item) =>
    item.id === requirementProfile.intendedUse.id && item.version === requirementProfile.intendedUse.version
  )) issues.push("requirementProfile.intendedUse is not declared by the source pack");

  const rawBytes = byteMap(issues, "rawArtifactBytes", input.rawArtifactBytes);
  const normalizedBytes = byteMap(issues, "derivativeBytes", input.derivativeBytes);
  const rawByDigest = new Map(rawSourceArtifacts.map((item) => [item.contentDigest, item]));
  const derivativeByDigest = new Map(derivatives.map((item) => [item.output.contentDigest, item]));
  if (rawByDigest.size !== rawSourceArtifacts.length) issues.push("rawSourceArtifacts contains duplicate contentDigest");
  if (derivativeByDigest.size !== derivatives.length) issues.push("derivatives contains duplicate output contentDigest");
  const redistributionStates = new Set(["PERMITTED", "RESTRICTED", "PROHIBITED"]);
  const exportDispositions = new Set(["PUBLIC", "CONTROLLED", "UNKNOWN"]);
  const eligibilityStates = new Set(["ELIGIBLE", "ENGINE_VERIFICATION_ONLY", "REFERENCE_ONLY", "INELIGIBLE"]);
  for (const [index, artifact] of rawSourceArtifacts.entries()) {
    const path = `rawSourceArtifacts[${index}]`;
    if (artifact.schemaVersion !== AIRCRAFT_RAW_SOURCE_SCHEMA_VERSION) issues.push(`${path}.schemaVersion is unsupported`);
    stableId(issues, `${path}.id`, artifact.id);
    version(issues, `${path}.version`, artifact.version);
    if (!DIGEST_PATTERN.test(artifact.contentDigest)) issues.push(`${path}.contentDigest must be a SHA-256 digest`);
    if (!Number.isSafeInteger(artifact.byteLength) || artifact.byteLength < 0 || artifact.byteLength > MAX_GOVERNED_ARTIFACT_BYTES) {
      issues.push(`${path}.byteLength is outside the governed bound`);
    }
    if (!artifact.subject.id.trim() || !artifact.subject.configurationId.trim()) issues.push(`${path}.subject must be exact`);
    if (
      !artifact.locator.uri.trim()
      || artifact.locator.uri !== artifact.locator.uri.trim()
      || !artifact.locator.record.trim()
      || artifact.locator.record !== artifact.locator.record.trim()
      || !Number.isFinite(Date.parse(artifact.locator.retrievedAt))
      || new Date(artifact.locator.retrievedAt).toISOString() !== artifact.locator.retrievedAt
    ) {
      issues.push(`${path}.locator must be canonical and retrieval-bound`);
    }
    if (!artifact.mediaType.trim()) issues.push(`${path}.mediaType must not be blank`);
    if (
      !artifact.rights.licenseId.trim()
      || !redistributionStates.has(artifact.rights.redistribution)
      || !exportDispositions.has(artifact.rights.exportDisposition)
    ) {
      issues.push(`${path}.rights must carry an explicit licence and export disposition`);
    }
    if (!eligibilityStates.has(artifact.eligibility.state)) issues.push(`${path}.eligibility.state is unsupported`);
    nonEmpty(issues, `${path}.eligibility.nonclaims`, artifact.eligibility.nonclaims);
    const bytes = rawBytes.get(artifact.contentDigest);
    if (!bytes) issues.push(`${path} is missing raw artifact bytes`);
    else {
      if (bytes.byteLength !== artifact.byteLength) issues.push(`${path} raw artifact byte length does not match`);
      if (await sha256ArtifactBytes(bytes) !== artifact.contentDigest) issues.push(`${path} raw artifact bytes do not match contentDigest`);
    }
  }
  for (const entry of input.rawArtifactBytes) {
    if (!rawByDigest.has(entry.digest)) issues.push(`rawArtifactBytes contains unreferenced digest ${entry.digest}`);
  }

  for (const [index, derivative] of derivatives.entries()) {
    const path = `derivatives[${index}]`;
    if (derivative.schemaVersion !== AIRCRAFT_DERIVATIVE_SCHEMA_VERSION) issues.push(`${path}.schemaVersion is unsupported`);
    stableId(issues, `${path}.id`, derivative.id);
    version(issues, `${path}.version`, derivative.version);
    stableId(issues, `${path}.recipe.id`, derivative.recipe.id);
    version(issues, `${path}.recipe.version`, derivative.recipe.version);
    stableId(issues, `${path}.recipe.tool.id`, derivative.recipe.tool.id);
    version(issues, `${path}.recipe.tool.version`, derivative.recipe.tool.version);
    if (!derivative.subject.id.trim() || !derivative.subject.configurationId.trim()) issues.push(`${path}.subject must be exact`);
    if (!DIGEST_PATTERN.test(derivative.recipe.environmentDigest)) issues.push(`${path}.recipe.environmentDigest must be a SHA-256 digest`);
    nonEmpty(issues, `${path}.orderedInputDigests`, derivative.orderedInputDigests);
    validateUniqueStrings(
      issues,
      `${path}.transformations`,
      derivative.transformations.map((transformation) => transformation.selector),
    );
    for (const digest of derivative.orderedInputDigests) {
      const rawInput = rawByDigest.get(digest);
      const derivativeInput = derivativeByDigest.get(digest);
      if (!rawInput && !derivativeInput) issues.push(`${path} references unavailable input digest ${digest}`);
      const inputSubject = rawInput?.subject ?? derivativeInput?.subject;
      if (
        inputSubject
        && (inputSubject.id !== derivative.subject.id || inputSubject.configurationId !== derivative.subject.configurationId)
      ) issues.push(`${path} launders input subject or configuration identity`);
      if (digest === derivative.output.contentDigest) issues.push(`${path} cannot consume its own output digest`);
    }
    if (!DIGEST_PATTERN.test(derivative.output.contentDigest)) issues.push(`${path}.output.contentDigest must be a SHA-256 digest`);
    if (
      !Number.isSafeInteger(derivative.output.byteLength)
      || derivative.output.byteLength < 0
      || derivative.output.byteLength > MAX_GOVERNED_ARTIFACT_BYTES
    ) issues.push(`${path}.output.byteLength is outside the governed bound`);
    if (!derivative.output.mediaType.trim()) issues.push(`${path}.output.mediaType must not be blank`);
    for (const [transformationIndex, transformation] of derivative.transformations.entries()) {
      const transformationPath = `${path}.transformations[${transformationIndex}]`;
      if (!transformation.selector.startsWith("/")) issues.push(`${transformationPath}.selector must be canonical`);
      validateSourceUnit(issues, `${transformationPath}.fromUnit`, transformation.fromUnit);
      validateSourceUnit(issues, `${transformationPath}.toUnit`, transformation.toUnit);
      if (!transformation.frame.trim()) issues.push(`${transformationPath}.frame must be explicit`);
      if (!transformation.datum.trim()) issues.push(`${transformationPath}.datum must be explicit`);
      if (!["PRESERVED", "PROPAGATED", "UNKNOWN"].includes(transformation.uncertaintyPropagation)) {
        issues.push(`${transformationPath}.uncertaintyPropagation is unsupported`);
      }
    }
    const bytes = normalizedBytes.get(derivative.output.contentDigest);
    if (!bytes) issues.push(`${path} is missing derivative bytes`);
    else {
      if (bytes.byteLength !== derivative.output.byteLength) issues.push(`${path} derivative byte length does not match`);
      if (await sha256ArtifactBytes(bytes) !== derivative.output.contentDigest) issues.push(`${path} derivative bytes do not match contentDigest`);
    }
  }
  for (const entry of input.derivativeBytes) {
    if (!derivativeByDigest.has(entry.digest)) issues.push(`derivativeBytes contains unreferenced digest ${entry.digest}`);
  }

  const visitState = new Map<string, "VISITING" | "VISITED">();
  const visit = (digest: string) => {
    if (visitState.get(digest) === "VISITING") {
      issues.push(`derivative dependency cycle contains ${digest}`);
      return;
    }
    if (visitState.get(digest) === "VISITED") return;
    visitState.set(digest, "VISITING");
    for (const dependency of derivativeByDigest.get(digest)?.orderedInputDigests ?? []) {
      if (derivativeByDigest.has(dependency)) visit(dependency);
    }
    visitState.set(digest, "VISITED");
  };
  derivativeByDigest.forEach((_value, digest) => visit(digest));
  const derivativeDescendsFromRaw = (derivativeDigest: string, rawDigest: string, seen = new Set<string>()): boolean => {
    if (seen.has(derivativeDigest)) return false;
    seen.add(derivativeDigest);
    return (derivativeByDigest.get(derivativeDigest)?.orderedInputDigests ?? []).some((inputDigest) =>
      inputDigest === rawDigest
      || (derivativeByDigest.has(inputDigest) && derivativeDescendsFromRaw(inputDigest, rawDigest, seen))
    );
  };

  const componentAuthorities = governedComponentAuthorities(source);
  const validComponentIds = new Set(componentAuthorities.keys());
  const governedFields = listGovernedAircraftScalarFields(source);
  const governedFieldByKey = new Map(governedFields.map((field) => [
    `${field.dataFamily}\u0000${field.componentId}\u0000${field.selector}`,
    field,
  ]));
  for (const [index, lineage] of fieldLineage.entries()) {
    const path = `fieldLineage[${index}]`;
    if (!AIRCRAFT_DATA_FAMILIES.includes(lineage.dataFamily)) issues.push(`${path}.dataFamily is unsupported`);
    if (!AIRCRAFT_LINEAGE_VALUE_STATES.includes(lineage.valueState)) issues.push(`${path}.valueState is unsupported`);
    if (lineage.evidenceRole !== "SOURCE" && lineage.evidenceRole !== "VALIDATION") issues.push(`${path}.evidenceRole is unsupported`);
    if (!validComponentIds.has(lineage.componentId)) issues.push(`${path}.componentId is unresolved`);
    if (!lineage.selector.startsWith("/")) issues.push(`${path}.selector must be canonical`);
    const componentAuthority = componentAuthorities.get(lineage.componentId);
    if (componentAuthority && !componentAuthority.families.has(lineage.dataFamily)) {
      issues.push(`${path}.componentId cannot establish ${lineage.dataFamily} authority`);
    }
    const authoredValue = componentAuthority
      ? resolveGovernedScalarSelector(componentAuthority.component, lineage.selector)
      : undefined;
    if (componentAuthority && authoredValue === undefined) {
      issues.push(`${path}.selector does not resolve to an authored scalar field`);
    }
    const governedField = governedFieldByKey.get(`${lineage.dataFamily}\u0000${lineage.componentId}\u0000${lineage.selector}`);
    if (!governedField) issues.push(`${path}.selector is not an owned physical scalar for ${lineage.dataFamily}`);
    if (governedField && lineage.unit !== governedField.unit) {
      issues.push(`${path}.unit does not match the authored scalar unit ${governedField.unit}`);
    }
    if (governedField && !governedField.configurations.includes(lineage.configurationId)) {
      issues.push(`${path}.configurationId is outside component validity`);
    }
    validateSourceUnit(issues, `${path}.unit`, lineage.unit);
    if (!lineage.frame.trim()) issues.push(`${path}.frame must be explicit`);
    if (!lineage.datum.trim()) issues.push(`${path}.datum must be explicit`);
    normalizeValidityDomain(issues, `${path}.validityDomain`, lineage.validityDomain);
    if (componentAuthority && !validityDomainCovers(
      normalizeValidityDomain([], `${path}.validityDomain`, lineage.validityDomain),
      normalizeValidityDomain([], `${path}.componentValidityDomain`, componentAuthority.validityDomain),
    )) issues.push(`${path}.validityDomain does not cover the owning component validity domain`);
    if (lineage.uncertainty.state === "KNOWN") {
      finite(issues, `${path}.uncertainty.magnitude`, lineage.uncertainty.magnitude);
      if (lineage.uncertainty.magnitude < 0) issues.push(`${path}.uncertainty.magnitude must not be negative`);
      validateSourceUnit(issues, `${path}.uncertainty`, lineage.uncertainty.unit);
    } else if (lineage.uncertainty.state !== "UNKNOWN") {
      issues.push(`${path}.uncertainty.state is unsupported`);
    }
    if (lineage.valueState === "AVAILABLE") {
      if (!lineage.valueDigest || !DIGEST_PATTERN.test(lineage.valueDigest)) {
        issues.push(`${path}.valueDigest must be a SHA-256 digest for AVAILABLE`);
      } else if (
        authoredValue !== undefined
        && await aircraftLineageValueDigest({
          selector: lineage.selector,
          value: authoredValue as string | number | boolean,
          unit: lineage.unit,
          frame: lineage.frame,
          datum: lineage.datum,
        }) !== lineage.valueDigest
      ) issues.push(`${path}.valueDigest does not match the authored scalar value`);
      const raw = lineage.rawArtifactDigest ? rawByDigest.get(lineage.rawArtifactDigest) : undefined;
      const derivative = lineage.derivativeDigest ? derivativeByDigest.get(lineage.derivativeDigest) : undefined;
      if (!raw) issues.push(`${path}.rawArtifactDigest is unresolved`);
      if (!derivative) issues.push(`${path}.derivativeDigest is unresolved`);
      if (raw && lineage.sourceLocator !== raw.locator.uri) issues.push(`${path}.sourceLocator does not match its raw artifact`);
      if (raw && lineage.sourceRecord !== raw.locator.record) issues.push(`${path}.sourceRecord does not match its raw artifact`);
      if (raw && !["ELIGIBLE", "ENGINE_VERIFICATION_ONLY"].includes(raw.eligibility.state)) {
        issues.push(`${path}.rawArtifactDigest is not eligible for executable lineage`);
      }
      if (raw?.rights.exportDisposition === "UNKNOWN") {
        issues.push(`${path}.rawArtifactDigest has unknown export disposition and is not eligible for executable lineage`);
      }
      if (raw && (raw.subject.id !== lineage.componentId || raw.subject.configurationId !== lineage.configurationId)) {
        issues.push(`${path} launders subject or configuration identity`);
      }
      if (derivative && (derivative.subject.id !== lineage.componentId || derivative.subject.configurationId !== lineage.configurationId)) {
        issues.push(`${path} launders derivative subject or configuration identity`);
      }
      if (derivative && lineage.rawArtifactDigest && !derivativeDescendsFromRaw(derivative.output.contentDigest, lineage.rawArtifactDigest)) {
        issues.push(`${path}.derivativeDigest does not descend from its raw artifact`);
      }
      const transformation = derivative?.transformations.find((item) => item.selector === lineage.selector);
      if (derivative && !transformation) issues.push(`${path}.derivativeDigest does not transform its governed selector`);
      if (
        transformation
        && (
          transformation.toUnit !== lineage.unit
          || transformation.frame !== lineage.frame
          || transformation.datum !== lineage.datum
        )
      ) issues.push(`${path}.derivative transformation does not preserve unit, frame, and datum authority`);
      if (lineage.gapReason !== undefined) issues.push(`${path}.gapReason is not permitted for AVAILABLE`);
    } else {
      if (!lineage.gapReason?.trim()) issues.push(`${path}.gapReason is required for ${lineage.valueState}`);
      if (lineage.valueDigest || lineage.rawArtifactDigest || lineage.derivativeDigest || lineage.sourceLocator || lineage.sourceRecord) {
        issues.push(`${path} cannot attach executable lineage to ${lineage.valueState}`);
      }
    }
  }

  const allConfigurations = new Set<string>();
  for (const requirement of requirementProfile.requirements) {
    if (!AIRCRAFT_DATA_FAMILIES.includes(requirement.dataFamily)) issues.push(`requirement ${requirement.id}.dataFamily is unsupported`);
    if (typeof requirement.required !== "boolean") issues.push(`requirement ${requirement.id}.required must be boolean`);
    validateUniqueStrings(issues, `requirement ${requirement.id}.applicability.componentIds`, requirement.applicability.componentIds);
    validateUniqueStrings(issues, `requirement ${requirement.id}.applicability.configurations`, requirement.applicability.configurations);
    validateUniqueStrings(issues, `requirement ${requirement.id}.fieldSelectors`, requirement.fieldSelectors);
    validateUniqueStrings(issues, `requirement ${requirement.id}.requiredEvidenceRoles`, requirement.requiredEvidenceRoles);
    requirement.applicability.componentIds.forEach((id) => {
      const authority = componentAuthorities.get(id);
      if (!authority) {
        issues.push(`requirement ${requirement.id} references unresolved component ${id}`);
        return;
      }
      if (!authority.families.has(requirement.dataFamily)) {
        issues.push(`requirement ${requirement.id} component ${id} cannot establish ${requirement.dataFamily} authority`);
      }
      for (const selector of requirement.fieldSelectors) {
        if (resolveGovernedScalarSelector(authority.component, selector) === undefined) {
          issues.push(`requirement ${requirement.id} selector ${selector} does not resolve for component ${id}`);
        }
      }
      for (const configuration of requirement.applicability.configurations) {
        if (!authority.validityDomain.configurations.includes(configuration)) {
          issues.push(`requirement ${requirement.id} configuration ${configuration} is outside component validity ${id}`);
        }
      }
    });
    requirement.applicability.configurations.forEach((configuration) => allConfigurations.add(configuration));
    requirement.fieldSelectors.forEach((selector) => {
      if (!selector.startsWith("/")) issues.push(`requirement ${requirement.id} has non-canonical field selector ${selector}`);
    });
    for (const role of requirement.requiredEvidenceRoles) {
      if (role !== "SOURCE" && role !== "VALIDATION") issues.push(`requirement ${requirement.id} has unsupported evidence role ${role}`);
    }
  }
  for (const field of governedFields) {
    const requirements = requirementProfile.requirements.filter((requirement) =>
      requirement.dataFamily === field.dataFamily
      && requirement.applicability.componentIds.includes(field.componentId)
      && requirement.fieldSelectors.includes(field.selector)
    );
    if (requirements.length === 0) {
      issues.push(
        `authored scalar ${field.selector} is absent from the closed requirement profile for ${field.componentId}`,
      );
      continue;
    }
    for (const configuration of field.configurations) {
      if (!requirements.some((requirement) => requirement.applicability.configurations.includes(configuration))) {
        issues.push(
          `authored scalar ${field.selector} configuration ${configuration} is absent from the closed requirement profile for ${field.componentId}`,
        );
      }
    }
  }
  if (allConfigurations.size > MAX_GOVERNED_CONFIGURATIONS) issues.push(`configuration count exceeds ${MAX_GOVERNED_CONFIGURATIONS}`);

  if (issues.length > 0) throw new ModelPackValidationError(issues);
  const rebuiltDerivatives = new Map<string, Uint8Array>();
  const rebuildDerivative = async (digest: string): Promise<Uint8Array> => {
    const prior = rebuiltDerivatives.get(digest);
    if (prior) return prior;
    const derivative = derivativeByDigest.get(digest);
    if (!derivative) throw new ModelPackValidationError([`[MODEL_PACK_DERIVATIVE_INPUT] unresolved derivative ${digest}`]);
    const orderedInputs = [];
    for (const inputDigest of derivative.orderedInputDigests) {
      const raw = rawBytes.get(inputDigest);
      const bytes = raw ?? await rebuildDerivative(inputDigest);
      orderedInputs.push({ digest: inputDigest, bytes });
    }
    const rebuilt = await rebuildAircraftDerivative(derivative, orderedInputs);
    const stored = normalizedBytes.get(digest);
    if (!stored || stored.byteLength !== rebuilt.byteLength || stored.some((byte, index) => byte !== rebuilt[index])) {
      throw new ModelPackValidationError([
        `[MODEL_PACK_DERIVATIVE_REBUILD] derivative ${derivative.id} does not reproduce its exact stored bytes`,
      ]);
    }
    rebuiltDerivatives.set(digest, rebuilt);
    return rebuilt;
  };
  for (const digest of derivativeByDigest.keys()) await rebuildDerivative(digest);
  return { rawBytes, normalizedBytes };
}

async function requirementCompleteness(source: ModelPackSourceV2): Promise<ModelPackRequirementCompleteness> {
  const profile = source.governance.requirementProfile;
  const results = [...profile.requirements]
    .sort((left, right) => compareCanonicalText(left.id, right.id))
    .map((requirement) => {
      const gapReasons: string[] = [];
      for (const componentId of requirement.applicability.componentIds) {
        for (const configurationId of requirement.applicability.configurations) {
          for (const selector of requirement.fieldSelectors) {
            const availableForSelector = source.governance.fieldLineage.filter((lineage) =>
              lineage.selector === selector
              && lineage.dataFamily === requirement.dataFamily
              && lineage.componentId === componentId
              && lineage.configurationId === configurationId
              && lineage.valueState === "AVAILABLE"
            );
            const sourceEvidence = availableForSelector.filter((lineage) => lineage.evidenceRole === "SOURCE");
            for (const evidenceRole of requirement.requiredEvidenceRoles) {
              const roleEvidence = availableForSelector.filter((lineage) => lineage.evidenceRole === evidenceRole);
              const independent = evidenceRole !== "VALIDATION"
                || !requirement.requiredEvidenceRoles.includes("SOURCE")
                || roleEvidence.some((validation) => sourceEvidence.every((sourceLineage) =>
                  validation.rawArtifactDigest !== sourceLineage.rawArtifactDigest
                  && validation.derivativeDigest !== sourceLineage.derivativeDigest
                ));
              if (roleEvidence.length === 0) {
                gapReasons.push(`${componentId}/${configurationId}/${selector}/${evidenceRole}`);
              } else if (!independent) {
                gapReasons.push(`${componentId}/${configurationId}/${selector}/${evidenceRole}/INDEPENDENT`);
              }
            }
          }
        }
      }
      const state = gapReasons.length === 0
        ? "SATISFIED"
        : requirement.required ? "INCOMPLETE" : "NOT_APPLICABLE";
      return { requirementId: requirement.id, state, gapReasons } as const;
    });
  const profileDigest = await governedContentDigest(profile);
  const withoutDigest = {
    profile: { id: profile.id, version: profile.version, digest: profileDigest },
    results,
    complete: results.every((item) => item.state !== "INCOMPLETE"),
  };
  return { ...withoutDigest, digest: await governedContentDigest(withoutDigest) };
}

export async function compileGovernedModelPack(
  input: GovernedModelPackCompileInput,
): Promise<CompiledModelPackV2Bundle> {
  await validateGovernedLineage(input);
  if (input.source.credibility.approvalState !== "DRAFT") {
    throw new ModelPackValidationError(["v2 Stage-B packs are foundation-only; authors cannot self-declare admission"]);
  }
  const orderedSource = orderedGovernance(input.source);
  const legacySource = structuredClone(orderedSource) as unknown as ModelPackSource & {
    governance?: ModelPackSourceV2["governance"];
  };
  legacySource.schemaVersion = MODEL_PACK_SOURCE_SCHEMA_VERSION;
  Reflect.deleteProperty(legacySource, "governance");
  const legacyBundle = await compileModelPack(legacySource);
  const completeness = await requirementCompleteness(orderedSource);
  const sourceDigest = await governedContentDigest(orderedSource);
  const evidenceLineage = structuredClone(orderedSource.governance.fieldLineage);
  const lineageDigest = await governedContentDigest({
    requirementProfile: orderedSource.governance.requirementProfile,
    rawSourceArtifacts: orderedSource.governance.rawSourceArtifacts,
    derivatives: orderedSource.governance.derivatives,
    fieldLineage: evidenceLineage,
  });
  const legacyProjectionDigest = legacyBundle.pack.digest;
  const legacyPayload = structuredClone(legacyBundle.pack) as Partial<CompiledModelPack>;
  Reflect.deleteProperty(legacyPayload, "digest");
  Reflect.deleteProperty(legacyPayload, "schemaVersion");
  const payload: Omit<CompiledModelPackV2, "digest"> = {
    ...legacyPayload as Omit<CompiledModelPack, "digest" | "schemaVersion">,
    schemaVersion: COMPILED_MODEL_PACK_V2_SCHEMA_VERSION,
    legacyProjectionDigest,
    sourceDigest,
    lineageDigest,
    admissionState: completeness.complete ? "COMPLETE_FOUNDATION_NON_PROMOTABLE" : "INCOMPLETE",
    requirementCompleteness: completeness,
    evidenceLineage,
  };
  const digest = await governedContentDigest(payload);
  const manifestWithoutContentDigest: Omit<CredibilityManifest, "contentDigest"> = {
    ...legacyBundle.credibilityManifest,
    subject: { kind: "MODEL_PACK", id: payload.id, digest },
    modelPackDigest: digest,
  };
  const credibilityManifest = {
    ...manifestWithoutContentDigest,
    contentDigest: await sha256Hex(manifestWithoutContentDigest),
  };
  return deepFreeze({ pack: { ...payload, digest }, credibilityManifest });
}

function validateCompiledModelPackV2ExactKeys(pack: CompiledModelPackV2, issues: string[]) {
  exactKeys(issues, "pack", pack, [
    "schemaVersion", "id", "version", "digest", "unitSystem", "coordinateConventions",
    "intendedUses", "credibilityManifestRef", "evidence", "catalogIdentities",
    "aerodynamics", "propulsion", "sensors", "aircraft", "weapons", "loadouts",
    "compatibility", "legacyProjectionDigest", "sourceDigest", "lineageDigest",
    "admissionState", "requirementCompleteness", "evidenceLineage",
  ]);
  exactKeys(issues, "pack.coordinateConventions", pack.coordinateConventions, [
    "geodeticDatum", "localFrame", "bodyAxes", "aerodynamicAxes", "angularUnit",
    "positionUnit", "velocityUnit", "verticalReference",
  ]);
  pack.intendedUses?.forEach((item, index) => exactKeys(
    issues, `pack.intendedUses[${index}]`, item, ["id", "version"],
  ));
  exactKeys(issues, "pack.credibilityManifestRef", pack.credibilityManifestRef, ["id", "version"]);
  pack.evidence?.forEach((item, index) => exactKeys(
    issues,
    `pack.evidence[${index}]`,
    item,
    ["id", "kind", "title", "uri", "accessedAt"],
    ["locator", "contentSha256"],
  ));
  pack.catalogIdentities?.forEach((item, index) => exactKeys(
    issues, `pack.catalogIdentities[${index}]`, item, ["catalogObjectId", "kind", "definitionModelIds"],
  ));
  const validity = (path: string, value: SiValidityDomain) => {
    exactKeys(issues, path, value, [
      "altitudeM", "mach", "angleOfAttackRad", "loadFactorG", "configurations", "environments",
    ]);
    for (const field of ["altitudeM", "mach", "angleOfAttackRad", "loadFactorG"] as const) {
      exactKeys(issues, `${path}.${field}`, value?.[field], ["minimum", "maximum"]);
    }
  };
  const table = (path: string, value: CompiledTable) => {
    exactKeys(issues, path, value, [
      "id", "outputUnit", "axes", "values", "evidenceRefIds", "validityDomain",
    ]);
    value?.axes?.forEach((axis, index) => exactKeys(
      issues, `${path}.axes[${index}]`, axis, ["semantic", "unit", "values"],
    ));
    validity(`${path}.validityDomain`, value?.validityDomain);
  };
  const base = (path: string, value: CompiledModelBase, specific: string[], optional: string[] = []) => {
    exactKeys(issues, path, value, [
      "id", "version", "evidenceRefIds", "validityDomain", "limitationIds", ...specific,
    ], optional);
    validity(`${path}.validityDomain`, value?.validityDomain);
  };
  pack.aerodynamics?.forEach((item, index) => {
    const path = `pack.aerodynamics[${index}]`;
    base(path, item, ["referenceAreaM2", "referenceChordM", "referenceSpanM", "coefficientTables"]);
    item.coefficientTables?.forEach((value, tableIndex) => table(`${path}.coefficientTables[${tableIndex}]`, value));
  });
  pack.propulsion?.forEach((item, index) => {
    const path = `pack.propulsion[${index}]`;
    base(path, item, ["engineCount", "thrustTable", "fuelFlowTable", "spoolTimeS"]);
    table(`${path}.thrustTable`, item.thrustTable);
    table(`${path}.fuelFlowTable`, item.fuelFlowTable);
  });
  pack.sensors?.forEach((item, index) => {
    const path = `pack.sensors[${index}]`;
    base(path, item, [
      "sensorKind", "detectionRangeM", "minimumRangeM", "scanPeriodS",
      "azimuthFieldOfViewRad", "elevationFieldOfViewRad",
    ], ["evidenceAdmission", "verificationTrackModel"]);
    if (item.evidenceAdmission) {
      exactKeys(issues, `${path}.evidenceAdmission`, item.evidenceAdmission, [
        "schemaVersion", "sourceEvidenceRefIds", "validationEvidenceRefIds", "coverage",
      ]);
      exactKeys(issues, `${path}.evidenceAdmission.coverage`, item.evidenceAdmission.coverage, [
        ...SENSOR_EVIDENCE_COVERAGE_FIELDS,
      ]);
    }
  });
  pack.aircraft?.forEach((item, index) => {
    const path = `pack.aircraft[${index}]`;
    base(path, item, [
      "catalogObjectId", "emptyMassKg", "fuelCapacityKg", "aerodynamicModelIndex",
      "propulsionModelIndexes", "sensorModelIndexes", "loadoutModelIndex",
      "maximumCommandLoadFactorG", "performanceAdmission",
    ]);
    if (item.performanceAdmission.state === "UNSUPPORTED") {
      exactKeys(issues, `${path}.performanceAdmission`, item.performanceAdmission, ["state", "limitationId", "reason"]);
    } else {
      exactKeys(issues, `${path}.performanceAdmission`, item.performanceAdmission, ["state", "capabilities"]);
      item.performanceAdmission.capabilities.forEach((capability, capabilityIndex) => exactKeys(
        issues,
        `${path}.performanceAdmission.capabilities[${capabilityIndex}]`,
        capability,
        ["capability", "sourceEvidenceRefIds", "validationEvidenceRefIds"],
      ));
    }
  });
  pack.weapons?.forEach((item, index) => base(`pack.weapons[${index}]`, item, [
    "catalogObjectId", "launchMassKg", "dryMassKg", "aerodynamicModelIndex",
    "propulsionModelIndex", "sensorModelIndex", "seekerMode", "supportRequirement",
    "launchAuthorization", "maximumCommandLoadFactorG", "seekerActivationRangeM",
    "datalinkUpdatePeriodS", "thrustTaperSpeedMps", "navigationConstant",
  ]));
  pack.loadouts?.forEach((item, index) => {
    const path = `pack.loadouts[${index}]`;
    base(path, item, ["platformCatalogObjectId", "stations"]);
    item.stations?.forEach((station, stationIndex) => {
      const stationPath = `${path}.stations[${stationIndex}]`;
      exactKeys(issues, stationPath, station, [
        "id", "stationGroup", "positionBodyM", "maximumQuantity", "compatibleStoreModelIndexes",
      ]);
      exactKeys(issues, `${stationPath}.positionBodyM`, station.positionBodyM, ["x", "y", "z"]);
    });
  });
  pack.compatibility?.forEach((item, index) => exactKeys(
    issues,
    `pack.compatibility[${index}]`,
    item,
    [
      "id", "platformCatalogObjectId", "loadoutModelIndex", "storeModelIndex",
      "stationGroup", "status", "maximumQuantity", "rationale", "evidenceRefIds",
    ],
  ));
  exactKeys(issues, "pack.requirementCompleteness", pack.requirementCompleteness, [
    "profile", "results", "complete", "digest",
  ]);
  exactKeys(issues, "pack.requirementCompleteness.profile", pack.requirementCompleteness?.profile, [
    "id", "version", "digest",
  ]);
  pack.requirementCompleteness?.results?.forEach((item, index) => exactKeys(
    issues,
    `pack.requirementCompleteness.results[${index}]`,
    item,
    ["requirementId", "state", "gapReasons"],
  ));
  pack.evidenceLineage?.forEach((item, index) => {
    const path = `pack.evidenceLineage[${index}]`;
    exactKeys(issues, path, item, [
      "id", "selector", "dataFamily", "componentId", "configurationId", "valueState",
      "evidenceRole", "unit", "frame", "datum", "uncertainty", "validityDomain",
    ], ["valueDigest", "rawArtifactDigest", "derivativeDigest", "sourceLocator", "sourceRecord", "gapReason"]);
    exactKeys(
      issues,
      `${path}.uncertainty`,
      item.uncertainty,
      item.uncertainty?.state === "KNOWN" ? ["state", "magnitude", "unit"] : ["state"],
    );
    const domain = item.validityDomain;
    exactKeys(issues, `${path}.validityDomain`, domain, [
      "altitude", "mach", "angleOfAttack", "loadFactor", "configurations", "environments",
    ]);
    for (const field of ["altitude", "mach", "angleOfAttack", "loadFactor"] as const) {
      exactKeys(issues, `${path}.validityDomain.${field}`, domain?.[field], ["minimum", "maximum", "unit"]);
    }
  });
}

export async function validateCompiledModelPackV2(pack: unknown): Promise<CompiledModelPackV2> {
  const issues: string[] = [];
  validateCompiledModelPackV2ExactKeys(pack as CompiledModelPackV2, issues);
  if (issues.length > 0) {
    throw new ModelPackValidationError(issues.map((issue) => `[MODEL_PACK_V2_SCHEMA] ${issue}`));
  }
  const candidate = pack as CompiledModelPackV2;
  if (candidate.schemaVersion !== COMPILED_MODEL_PACK_V2_SCHEMA_VERSION) {
    issues.push(`[MODEL_PACK_V2_SCHEMA] pack.schemaVersion must be ${COMPILED_MODEL_PACK_V2_SCHEMA_VERSION}`);
  }
  for (const [path, digest] of [
    ["pack.digest", candidate.digest],
    ["pack.legacyProjectionDigest", candidate.legacyProjectionDigest],
    ["pack.sourceDigest", candidate.sourceDigest],
    ["pack.lineageDigest", candidate.lineageDigest],
    ["pack.requirementCompleteness.profile.digest", candidate.requirementCompleteness.profile.digest],
    ["pack.requirementCompleteness.digest", candidate.requirementCompleteness.digest],
  ] as const) {
    if (!DIGEST_PATTERN.test(digest)) issues.push(`[MODEL_PACK_V2_IDENTITY] ${path} must be a SHA-256 digest`);
  }
  const completenessPayload = structuredClone(candidate.requirementCompleteness) as Partial<ModelPackRequirementCompleteness>;
  Reflect.deleteProperty(completenessPayload, "digest");
  if (await governedContentDigest(completenessPayload) !== candidate.requirementCompleteness.digest) {
    issues.push("[MODEL_PACK_V2_IDENTITY] pack.requirementCompleteness.digest does not match its payload");
  }
  const expectedAdmission = candidate.requirementCompleteness.complete
    ? "COMPLETE_FOUNDATION_NON_PROMOTABLE"
    : "INCOMPLETE";
  if (candidate.admissionState !== expectedAdmission) {
    issues.push("[MODEL_PACK_V2_ADMISSION] pack.admissionState does not match computed completeness");
  }
  const legacyProjection = structuredClone(candidate) as unknown as Record<string, unknown>;
  for (const key of [
    "legacyProjectionDigest", "sourceDigest", "lineageDigest", "admissionState",
    "requirementCompleteness", "evidenceLineage",
  ] as const) Reflect.deleteProperty(legacyProjection, key);
  legacyProjection.schemaVersion = COMPILED_MODEL_PACK_SCHEMA_VERSION;
  legacyProjection.digest = candidate.legacyProjectionDigest;
  if (!await verifyCompiledModelPackDigest(legacyProjection as CompiledModelPack)) {
    issues.push("[MODEL_PACK_V2_IDENTITY] pack.legacyProjectionDigest does not match its SI projection");
  }
  const payload = structuredClone(candidate) as Partial<CompiledModelPackV2>;
  Reflect.deleteProperty(payload, "digest");
  if (await governedContentDigest(payload) !== candidate.digest) {
    issues.push("[MODEL_PACK_V2_IDENTITY] pack.digest does not match its canonical payload");
  }
  if (issues.length > 0) throw new ModelPackValidationError(issues);
  return deepFreeze(structuredClone(candidate));
}

export async function verifyCompiledModelPackV2Digest(pack: CompiledModelPackV2) {
  try {
    await validateCompiledModelPackV2(pack);
    return true;
  } catch {
    return false;
  }
}

export async function readLegacyCompiledModelPack(pack: CompiledModelPack) {
  if (pack.schemaVersion !== COMPILED_MODEL_PACK_SCHEMA_VERSION || !await verifyCompiledModelPackDigest(pack)) {
    throw new ModelPackValidationError(["legacy v1 compiled pack is unreadable or corrupt"]);
  }
  return deepFreeze({ pack: structuredClone(pack), promotable: false as const });
}

function exactReferenceKey(reference: ExactModelPackReference) {
  return `${reference.id}\u0000${reference.version}\u0000${reference.digest}`;
}

function versionKey(reference: Pick<ExactModelPackReference, "id" | "version">) {
  return `${reference.id}\u0000${reference.version}`;
}

function governedSubrecordVersionKey(
  kind: "intended-use contract" | "requirement profile" | "raw source artifact" | "derivative" | "credibility manifest",
  record: { schemaVersion: string; id: string; version: string },
) {
  return `${kind}\u0000${record.schemaVersion}\u0000${record.id}\u0000${record.version}`;
}

function referenceFor(bundle: CompiledModelPackV2Bundle): ExactModelPackReference {
  return { id: bundle.pack.id, version: bundle.pack.version, digest: bundle.pack.digest };
}

type ArchiveBytePreflightState = { entryCount: number; totalBytes: number };
type PreflightedArchiveByte = { digest: string; bytes: number[]; byteLength: number };

function exactArchiveByteLength(bytes: unknown, path: string) {
  if (!Array.isArray(bytes)) {
    throw new ModelPackValidationError([`[MODEL_PACK_ARCHIVE_BYTE_LENGTH] ${path} is not an exact byte array`]);
  }
  let length: number;
  try {
    length = bytes.length;
  } catch {
    throw new ModelPackValidationError([`[MODEL_PACK_ARCHIVE_BYTE_LENGTH] ${path}.length must be a safe nonnegative integer`]);
  }
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new ModelPackValidationError([`[MODEL_PACK_ARCHIVE_BYTE_LENGTH] ${path}.length must be a safe nonnegative integer`]);
  }
  return length;
}

function preflightArchiveBytes(
  entries: unknown,
  path: string,
  state: ArchiveBytePreflightState,
) {
  if (!Array.isArray(entries)) {
    throw new ModelPackValidationError([`[MODEL_PACK_ARCHIVE_ENTRY_COUNT] ${path} must be an exact entry array`]);
  }
  let entryCount: number;
  try {
    entryCount = entries.length;
  } catch {
    throw new ModelPackValidationError([`[MODEL_PACK_ARCHIVE_ENTRY_COUNT] ${path}.length must be a safe nonnegative integer`]);
  }
  if (!Number.isSafeInteger(entryCount) || entryCount < 0) {
    throw new ModelPackValidationError([`[MODEL_PACK_ARCHIVE_ENTRY_COUNT] ${path}.length must be a safe nonnegative integer`]);
  }
  if (entryCount > MAX_GOVERNED_RECORDS - state.entryCount) {
    throw new ModelPackValidationError([
      `[MODEL_PACK_ARCHIVE_ENTRY_COUNT] ${path} exceeds ${MAX_GOVERNED_RECORDS} cumulative entries`,
    ]);
  }
  state.entryCount += entryCount;
  const preflighted: PreflightedArchiveByte[] = [];
  for (let index = 0; index < entryCount; index += 1) {
    const entry = entries[index] as unknown;
    const issues: string[] = [];
    exactKeys(issues, `${path}[${index}]`, entry, ["digest", "bytes"]);
    if (issues.length > 0) throw new ModelPackValidationError(issues);
    const { digest, bytes } = entry as { digest: string; bytes: unknown };
    const byteLength = exactArchiveByteLength(bytes, `${path}[${index}].bytes`);
    if (byteLength > MAX_GOVERNED_ARTIFACT_BYTES) {
      throw new ModelPackValidationError([
        `[MODEL_PACK_ARCHIVE_ARTIFACT_BOUNDS] ${path}[${index}].bytes exceeds ${MAX_GOVERNED_ARTIFACT_BYTES} bytes`,
      ]);
    }
    if (byteLength > MAX_GOVERNED_CORPUS_BYTES - state.totalBytes) {
      throw new ModelPackValidationError([
        `[MODEL_PACK_ARCHIVE_CORPUS_BOUNDS] ${path} exceeds ${MAX_GOVERNED_CORPUS_BYTES} cumulative bytes`,
      ]);
    }
    state.totalBytes += byteLength;
    preflighted.push({ digest, bytes: bytes as number[], byteLength });
  }
  return preflighted;
}

function archiveBytes(entries: PreflightedArchiveByte[], path: string) {
  return entries.map((entry, index) => {
    if (entry.bytes.length !== entry.byteLength) {
      throw new ModelPackValidationError([
        `[MODEL_PACK_ARCHIVE_BYTE_LENGTH] ${path}[${index}].bytes.length changed after preflight`,
      ]);
    }
    const ownedBytes = new Uint8Array(entry.byteLength);
    for (let byteIndex = 0; byteIndex < entry.byteLength; byteIndex += 1) {
      const byte = entry.bytes[byteIndex];
      if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
        throw new ModelPackValidationError([`${path}[${index}].bytes is not an exact byte array`]);
      }
      ownedBytes[byteIndex] = byte;
    }
    return { digest: entry.digest, bytes: ownedBytes };
  });
}

function orderedUniqueReferences(references: ExactModelPackReference[]) {
  if (references.length === 0) throw new ModelPackValidationError(["reference list must not be empty"]);
  const ordered = [...references].sort((left, right) =>
    compareCanonicalText(exactReferenceKey(left), exactReferenceKey(right))
  );
  for (let index = 1; index < ordered.length; index += 1) {
    if (exactReferenceKey(ordered[index - 1]) === exactReferenceKey(ordered[index])) {
      throw new ModelPackValidationError(["reference list contains a duplicate exact reference"]);
    }
  }
  return ordered;
}

export class InMemoryModelPackRepository {
  readonly #publications = new Map<string, GovernedModelPackPublication>();
  readonly #versionIdentities = new Map<string, string>();
  readonly #governedSubrecordIdentities = new Map<string, string>();

  get size() {
    return this.#publications.size;
  }

  async #readExactPublication(reference: ExactModelPackReference) {
    const referenceIssues: string[] = [];
    exactKeys(referenceIssues, "reference", reference, ["id", "version", "digest"]);
    if (referenceIssues.length > 0) throw new ModelPackValidationError(referenceIssues);
    if (!ID_PATTERN.test(reference.id) || !SEMVER_PATTERN.test(reference.version) || !DIGEST_PATTERN.test(reference.digest)) {
      throw new ModelPackValidationError(["exact model-pack reference is malformed"]);
    }
    const publication = this.#publications.get(exactReferenceKey(reference));
    if (!publication) throw new ModelPackValidationError(["exact compiled model pack was not found"]);
    try {
      await validateCompiledModelPackV2(publication.bundle.pack);
    } catch {
      throw new ModelPackValidationError(["[MODEL_PACK_STORAGE_CORRUPT] stored compiled model pack is corrupt"]);
    }
    return publication;
  }

  async publishBatch(publications: GovernedModelPackPublication[]) {
    if (publications.length === 0) throw new ModelPackValidationError(["publication batch must not be empty"]);
    if (publications.length > MAX_GOVERNED_RECORDS) throw new ModelPackValidationError(["publication batch is oversized"]);
    const staged = new Map<string, GovernedModelPackPublication>();
    const stagedVersions = new Map<string, string>();
    const stagedGovernedSubrecords = new Map<string, string>();
    for (const [publicationIndex, publication] of publications.entries()) {
      const publicationIssues: string[] = [];
      exactKeys(publicationIssues, `publication[${publicationIndex}]`, publication, [
        "source", "rawArtifactBytes", "derivativeBytes", "bundle",
      ]);
      if (publicationIssues.length > 0) throw new ModelPackValidationError(publicationIssues);
      const rebuilt = await compileGovernedModelPack({
        source: publication.source,
        rawArtifactBytes: publication.rawArtifactBytes,
        derivativeBytes: publication.derivativeBytes,
      });
      if (await governedContentDigest(rebuilt) !== await governedContentDigest(publication.bundle)) {
        throw new ModelPackValidationError(["published bundle does not match reproducible compilation"]);
      }
      const reference = referenceFor(rebuilt);
      const key = exactReferenceKey(reference);
      const identity = versionKey(reference);
      const existingDigest = stagedVersions.get(identity) ?? this.#versionIdentities.get(identity);
      if (existingDigest && existingDigest !== reference.digest) {
        throw new ModelPackValidationError([`append-only identity ${reference.id}@${reference.version} already has digest ${existingDigest}`]);
      }
      if (staged.has(key) || this.#publications.has(key)) {
        throw new ModelPackValidationError([`published identity ${reference.id}@${reference.version}/${reference.digest} already exists`]);
      }
      const orderedSource = orderedGovernance(publication.source);
      const governance = orderedSource.governance;
      const governedSubrecords = [
        ...orderedSource.intendedUses.map((record) => ({
          kind: "intended-use contract" as const,
          record,
        })),
        { kind: "requirement profile" as const, record: governance.requirementProfile },
        ...governance.rawSourceArtifacts.map((record) => ({ kind: "raw source artifact" as const, record })),
        ...governance.derivatives.map((record) => ({ kind: "derivative" as const, record })),
        { kind: "credibility manifest" as const, record: rebuilt.credibilityManifest },
      ];
      for (const { kind, record } of governedSubrecords) {
        const recordKey = governedSubrecordVersionKey(kind, record);
        const contentDigest = await governedContentDigest(record);
        const existingContentDigest = stagedGovernedSubrecords.get(recordKey)
          ?? this.#governedSubrecordIdentities.get(recordKey);
        if (existingContentDigest && existingContentDigest !== contentDigest) {
          throw new ModelPackValidationError([
            `[MODEL_PACK_STORAGE_IDENTITY_CONFLICT] ${kind} ${record.id}@${record.version} already has canonical content digest ${existingContentDigest}`,
          ]);
        }
        stagedGovernedSubrecords.set(recordKey, contentDigest);
      }
      stagedVersions.set(identity, reference.digest);
      staged.set(key, deepFreeze({
        source: structuredClone(publication.source),
        rawArtifactBytes: publication.rawArtifactBytes.map((item) => ({ digest: item.digest, bytes: item.bytes.slice() })),
        derivativeBytes: publication.derivativeBytes.map((item) => ({ digest: item.digest, bytes: item.bytes.slice() })),
        bundle: rebuilt,
      }));
    }
    for (const [key, publication] of staged) this.#publications.set(key, publication);
    for (const [key, digest] of stagedVersions) this.#versionIdentities.set(key, digest);
    for (const [key, digest] of stagedGovernedSubrecords) this.#governedSubrecordIdentities.set(key, digest);
  }

  async resolveExact(reference: ExactModelPackReference) {
    const publication = await this.#readExactPublication(reference);
    if (publication.bundle.pack.admissionState !== "COMPLETE_FOUNDATION_NON_PROMOTABLE") {
      throw new ModelPackValidationError(["compiled model pack is incomplete"]);
    }
    return publication.bundle;
  }

  async resolveForDeployment(reference: ExactModelPackReference): Promise<never> {
    await this.resolveExact(reference);
    throw new ModelPackValidationError(["Stage-B compiled packs are non-promotable until runtime admission lands"]);
  }

  async exportResearch(references: ExactModelPackReference[]): Promise<GovernedModelPackResearchExport> {
    const publications = [];
    for (const reference of orderedUniqueReferences(references)) {
      const publication = await this.#readExactPublication(reference);
      publications.push({
        source: structuredClone(publication.source),
        rawArtifactBytes: publication.rawArtifactBytes.map((item) => ({ digest: item.digest, bytes: [...item.bytes] })),
        derivativeBytes: publication.derivativeBytes.map((item) => ({ digest: item.digest, bytes: [...item.bytes] })),
        bundle: structuredClone(publication.bundle),
      });
    }
    return { schemaVersion: GOVERNED_MODEL_PACK_EXPORT_SCHEMA_VERSION, publications };
  }

  async importResearch(archive: GovernedModelPackResearchExport) {
    const archiveIssues: string[] = [];
    exactKeys(archiveIssues, "archive", archive, ["schemaVersion", "publications"]);
    if (archiveIssues.length > 0) throw new ModelPackValidationError(archiveIssues);
    if (archive.schemaVersion !== GOVERNED_MODEL_PACK_EXPORT_SCHEMA_VERSION || !Array.isArray(archive.publications)) {
      throw new ModelPackValidationError(["research export schema is unsupported"]);
    }
    if (archive.publications.length > MAX_GOVERNED_RECORDS) {
      throw new ModelPackValidationError([
        `[MODEL_PACK_ARCHIVE_ENTRY_COUNT] archive.publications exceeds ${MAX_GOVERNED_RECORDS} entries`,
      ]);
    }
    const rawPreflight = { entryCount: 0, totalBytes: 0 };
    const derivativePreflight = { entryCount: 0, totalBytes: 0 };
    const preflightedPublications = [];
    for (const [index, publication] of archive.publications.entries()) {
      const issues: string[] = [];
      exactKeys(issues, `archive.publications[${index}]`, publication, [
        "source", "rawArtifactBytes", "derivativeBytes", "bundle",
      ]);
      if (issues.length > 0) throw new ModelPackValidationError(issues);
      const rawArtifactBytes = preflightArchiveBytes(
        publication.rawArtifactBytes,
        `archive.publications[${index}].rawArtifactBytes`,
        rawPreflight,
      );
      const derivativeBytes = preflightArchiveBytes(
        publication.derivativeBytes,
        `archive.publications[${index}].derivativeBytes`,
        derivativePreflight,
      );
      preflightedPublications.push({ publication, rawArtifactBytes, derivativeBytes });
    }
    const publications = preflightedPublications.map(({ publication, rawArtifactBytes, derivativeBytes }, index) => {
      return {
        source: structuredClone(publication.source),
        rawArtifactBytes: archiveBytes(rawArtifactBytes, `archive.publications[${index}].rawArtifactBytes`),
        derivativeBytes: archiveBytes(derivativeBytes, `archive.publications[${index}].derivativeBytes`),
        bundle: structuredClone(publication.bundle),
      };
    });
    await this.publishBatch(publications);
  }

  async exportCompiled(references: ExactModelPackReference[]): Promise<CompiledModelPackExport> {
    const packs = [];
    for (const reference of orderedUniqueReferences(references)) {
      packs.push(structuredClone(await this.resolveExact(reference)));
    }
    return { schemaVersion: COMPILED_MODEL_PACK_EXPORT_SCHEMA_VERSION, packs };
  }
}

/**
 * Admission boundary for consumers that need a named-aircraft performance
 * interpretation. Geometry-teaching execution does not call this boundary and
 * remains governed by the pack's intended-use contract instead.
 */
export function requireNamedAircraftPerformanceAdmission(
  pack: CompiledModelPack,
  catalogObjectId: string,
) {
  const aircraft = pack.aircraft.find((item) => item.catalogObjectId === catalogObjectId);
  if (!aircraft) {
    throw new AircraftPerformanceAdmissionError(catalogObjectId, "no compiled aircraft model exists");
  }
  if (aircraft.performanceAdmission.state !== "ADMITTED") {
    throw new AircraftPerformanceAdmissionError(catalogObjectId, aircraft.performanceAdmission.reason);
  }
  return aircraft.performanceAdmission;
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
