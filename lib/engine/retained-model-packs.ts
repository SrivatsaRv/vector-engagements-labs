import historicalBundle from "../../fixtures/model-packs/vector-scalar-study-v0.8.compiled.json" with { type: "json" };
import {
  type CompiledModelPack,
  type SiValidityDomain,
  validityDomainCovers,
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

const COMPILED_WEAPON_KEYS = [
  "id",
  "version",
  "evidenceRefIds",
  "validityDomain",
  "limitationIds",
  "catalogObjectId",
  "launchMassKg",
  "dryMassKg",
  "aerodynamicModelIndex",
  "propulsionModelIndex",
  "sensorModelIndex",
  "seekerMode",
  "supportRequirement",
  "launchAuthorization",
  "maximumCommandLoadFactorG",
  "seekerActivationRangeM",
  "datalinkUpdatePeriodS",
  "thrustTaperSpeedMps",
  "navigationConstant",
  "termination",
] as const;

const COMPILED_AIRCRAFT_KEYS = [
  "id",
  "version",
  "evidenceRefIds",
  "validityDomain",
  "limitationIds",
  "catalogObjectId",
  "emptyMassKg",
  "fuelCapacityKg",
  "aerodynamicModelIndex",
  "propulsionModelIndexes",
  "sensorModelIndexes",
  "loadoutModelIndex",
  "maximumCommandLoadFactorG",
  "performanceAdmission",
] as const;

const COMPILED_LOADOUT_KEYS = [
  "id",
  "version",
  "evidenceRefIds",
  "validityDomain",
  "limitationIds",
  "platformCatalogObjectId",
  "stations",
] as const;

const COMPILED_LOADOUT_STATION_KEYS = [
  "id",
  "stationGroup",
  "positionBodyM",
  "maximumQuantity",
  "compatibleStoreModelIndexes",
] as const;

const COMPILED_COMPATIBILITY_KEYS = [
  "id",
  "platformCatalogObjectId",
  "loadoutModelIndex",
  "storeModelIndex",
  "stationGroup",
  "status",
  "maximumQuantity",
  "rationale",
  "evidenceRefIds",
] as const;

const COMPILED_VALIDITY_DOMAIN_KEYS = [
  "altitudeM",
  "mach",
  "angleOfAttackRad",
  "loadFactorG",
  "configurations",
  "environments",
] as const;

const COMPILED_RANGE_KEYS = ["minimum", "maximum"] as const;
const COMPILED_VECTOR_KEYS = ["x", "y", "z"] as const;
const COMPILED_TERMINATION_KEYS = [
  "schemaVersion",
  "intendedUse",
  "criterion",
  "interceptRadiusM",
  "maximumFlightTimeS",
] as const;
const STABLE_ID_PATTERN = /^[a-z0-9]+(?:[._:/-][a-z0-9]+)*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const WEAPON_SEEKER_MODES = new Set(["UNAVAILABLE", "ACTIVE_RADAR", "INFRARED", "PASSIVE_RADIATION"]);
const WEAPON_SUPPORT_REQUIREMENTS = new Set(["UNAVAILABLE", "NONE", "TRACK_UPDATE"]);
const WEAPON_LAUNCH_AUTHORIZATIONS = new Set(["SCHEDULED_TEST_ONLY", "TRACK_REQUIRED"]);
const AIRCRAFT_PERFORMANCE_CAPABILITIES = new Set([
  "AERODYNAMICS",
  "PROPULSION",
  "FLIGHT_CONTROLS",
  "MASS_AND_STORES",
  "SENSORS",
]);
const COMPATIBILITY_STATUSES = new Set(["SUPPORTED", "UNSUPPORTED"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  return actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index]);
}

function isNonBlankStringArray(value: unknown, requireNonEmpty = false): value is string[] {
  return Array.isArray(value) &&
    (!requireNonEmpty || value.length > 0) &&
    value.every((item) => typeof item === "string" && item.trim().length > 0);
}

function isCompiledRange(value: unknown): value is { minimum: number; maximum: number } {
  return isRecord(value) &&
    hasExactKeys(value, COMPILED_RANGE_KEYS) &&
    typeof value.minimum === "number" &&
    Number.isFinite(value.minimum) &&
    typeof value.maximum === "number" &&
    Number.isFinite(value.maximum) &&
    value.minimum <= value.maximum;
}

function isCompiledValidityDomain(value: unknown): value is SiValidityDomain {
  return isRecord(value) &&
    hasExactKeys(value, COMPILED_VALIDITY_DOMAIN_KEYS) &&
    isCompiledRange(value.altitudeM) &&
    isCompiledRange(value.mach) &&
    isCompiledRange(value.angleOfAttackRad) &&
    isCompiledRange(value.loadFactorG) &&
    isNonBlankStringArray(value.configurations, true) &&
    isNonBlankStringArray(value.environments, true);
}

function isModelIndex(value: unknown, length: number) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value < length;
}

function requireCompiledAircraftStructure(
  aircraft: unknown,
  index: number,
  pack: Record<string, unknown>,
  evidenceIds: ReadonlySet<string>,
  catalogObjectIds: ReadonlySet<string>,
): asserts aircraft is Record<string, unknown> {
  const path = `aircraft[${index}]`;
  const invalid = (field: string): never => {
    throw new Error(
      `Supplied engine-verification compiled model pack ${path}.${field} is structurally invalid.`,
    );
  };
  if (!isRecord(aircraft)) invalid("record");
  const candidate = aircraft as Record<string, unknown>;
  if (!hasExactKeys(candidate, COMPILED_AIRCRAFT_KEYS)) invalid("fields");
  if (typeof candidate.id !== "string" || !STABLE_ID_PATTERN.test(candidate.id)) invalid("id");
  if (typeof candidate.version !== "string" || !SEMVER_PATTERN.test(candidate.version)) invalid("version");
  if (!isNonBlankStringArray(candidate.evidenceRefIds, true) ||
      candidate.evidenceRefIds.some((id) => !evidenceIds.has(id))) invalid("evidenceRefIds");
  if (!isCompiledValidityDomain(candidate.validityDomain)) invalid("validityDomain");
  if (!isNonBlankStringArray(candidate.limitationIds)) invalid("limitationIds");
  const limitationIds = candidate.limitationIds as string[];
  if (typeof candidate.catalogObjectId !== "string" ||
      !catalogObjectIds.has(candidate.catalogObjectId)) invalid("catalogObjectId");
  if (typeof candidate.emptyMassKg !== "number" ||
      !Number.isFinite(candidate.emptyMassKg) || candidate.emptyMassKg <= 0) invalid("emptyMassKg");
  if (typeof candidate.fuelCapacityKg !== "number" ||
      !Number.isFinite(candidate.fuelCapacityKg) || candidate.fuelCapacityKg < 0) invalid("fuelCapacityKg");
  if (typeof candidate.maximumCommandLoadFactorG !== "number" ||
      !Number.isFinite(candidate.maximumCommandLoadFactorG) ||
      candidate.maximumCommandLoadFactorG <= 0) invalid("maximumCommandLoadFactorG");

  const aerodynamics = pack.aerodynamics as unknown[];
  const propulsion = pack.propulsion as unknown[];
  const sensors = pack.sensors as unknown[];
  const loadouts = pack.loadouts as unknown[];
  if (!isModelIndex(candidate.aerodynamicModelIndex, aerodynamics.length)) invalid("aerodynamicModelIndex");
  if (!Array.isArray(candidate.propulsionModelIndexes) ||
      candidate.propulsionModelIndexes.length === 0 ||
      candidate.propulsionModelIndexes.some((value) => !isModelIndex(value, propulsion.length))) {
    invalid("propulsionModelIndexes");
  }
  if (!Array.isArray(candidate.sensorModelIndexes) ||
      candidate.sensorModelIndexes.some((value) => !isModelIndex(value, sensors.length))) {
    invalid("sensorModelIndexes");
  }
  if (!isModelIndex(candidate.loadoutModelIndex, loadouts.length)) invalid("loadoutModelIndex");

  if (!isRecord(candidate.performanceAdmission)) invalid("performanceAdmission");
  const admission = candidate.performanceAdmission as Record<string, unknown>;
  if (admission.state === "UNSUPPORTED") {
    if (!hasExactKeys(admission, ["state", "limitationId", "reason"]) ||
        typeof admission.limitationId !== "string" ||
        !limitationIds.includes(admission.limitationId) ||
        typeof admission.reason !== "string" ||
        admission.reason.trim().length === 0) invalid("performanceAdmission");
    return;
  }
  if (admission.state !== "ADMITTED" ||
      !hasExactKeys(admission, ["state", "capabilities"]) ||
      !Array.isArray(admission.capabilities) ||
      admission.capabilities.length !== AIRCRAFT_PERFORMANCE_CAPABILITIES.size) {
    invalid("performanceAdmission");
  }
  const capabilityIds = new Set<string>();
  const capabilities = admission.capabilities as unknown[];
  for (const capability of capabilities) {
    if (!isRecord(capability)) invalid("performanceAdmission");
    const capabilityRecord = capability as Record<string, unknown>;
    if (!hasExactKeys(capabilityRecord, ["capability", "sourceEvidenceRefIds", "validationEvidenceRefIds"]) ||
        typeof capabilityRecord.capability !== "string" ||
        !AIRCRAFT_PERFORMANCE_CAPABILITIES.has(capabilityRecord.capability) ||
        capabilityIds.has(capabilityRecord.capability)) {
      invalid("performanceAdmission");
    }
    if (!isNonBlankStringArray(capabilityRecord.sourceEvidenceRefIds, true) ||
        !isNonBlankStringArray(capabilityRecord.validationEvidenceRefIds, true)) {
      invalid("performanceAdmission");
    }
    const sourceEvidenceRefIds = capabilityRecord.sourceEvidenceRefIds as string[];
    const validationEvidenceRefIds = capabilityRecord.validationEvidenceRefIds as string[];
    if (sourceEvidenceRefIds.some((id) => !evidenceIds.has(id)) ||
        validationEvidenceRefIds.some((id) => !evidenceIds.has(id)) ||
        sourceEvidenceRefIds.some((id) => validationEvidenceRefIds.includes(id))) {
      invalid("performanceAdmission");
    }
    capabilityIds.add(capabilityRecord.capability as string);
  }
}

function requireCompiledWeaponStructure(
  weapon: unknown,
  index: number,
  pack: Record<string, unknown>,
  evidenceIds: ReadonlySet<string>,
  catalogObjectIds: ReadonlySet<string>,
): asserts weapon is Record<string, unknown> {
  const path = `weapons[${index}]`;
  const invalid = (field: string): never => {
    throw new Error(
      `Supplied engine-verification compiled model pack ${path}.${field} is structurally invalid.`,
    );
  };
  if (!isRecord(weapon)) invalid("record");
  const candidate = weapon as Record<string, unknown>;
  if (!hasExactKeys(candidate, COMPILED_WEAPON_KEYS)) invalid("fields");
  if (typeof candidate.id !== "string" || !STABLE_ID_PATTERN.test(candidate.id)) invalid("id");
  if (typeof candidate.version !== "string" || !SEMVER_PATTERN.test(candidate.version)) invalid("version");
  if (!isNonBlankStringArray(candidate.evidenceRefIds, true) ||
      candidate.evidenceRefIds.some((id) => !evidenceIds.has(id))) invalid("evidenceRefIds");
  if (!isCompiledValidityDomain(candidate.validityDomain)) invalid("validityDomain");
  if (!isNonBlankStringArray(candidate.limitationIds)) invalid("limitationIds");
  if (typeof candidate.catalogObjectId !== "string" ||
      !catalogObjectIds.has(candidate.catalogObjectId)) invalid("catalogObjectId");

  const positiveFields = [
    "launchMassKg",
    "dryMassKg",
    "maximumCommandLoadFactorG",
    "datalinkUpdatePeriodS",
    "thrustTaperSpeedMps",
    "navigationConstant",
  ] as const;
  for (const field of positiveFields) {
    if (typeof candidate[field] !== "number" ||
        !Number.isFinite(candidate[field]) ||
        candidate[field] <= 0) invalid(field);
  }
  if (typeof candidate.seekerActivationRangeM !== "number" ||
      !Number.isFinite(candidate.seekerActivationRangeM) ||
      candidate.seekerActivationRangeM < 0) invalid("seekerActivationRangeM");
  if ((candidate.dryMassKg as number) > (candidate.launchMassKg as number)) invalid("dryMassKg");

  const aerodynamics = pack.aerodynamics as unknown[];
  const propulsion = pack.propulsion as unknown[];
  const sensors = pack.sensors as unknown[];
  if (!isModelIndex(candidate.aerodynamicModelIndex, aerodynamics.length)) invalid("aerodynamicModelIndex");
  if (!isModelIndex(candidate.propulsionModelIndex, propulsion.length)) invalid("propulsionModelIndex");
  if (candidate.sensorModelIndex !== null && !isModelIndex(candidate.sensorModelIndex, sensors.length)) {
    invalid("sensorModelIndex");
  }
  if (typeof candidate.seekerMode !== "string" || !WEAPON_SEEKER_MODES.has(candidate.seekerMode)) {
    invalid("seekerMode");
  }
  if (typeof candidate.supportRequirement !== "string" ||
      !WEAPON_SUPPORT_REQUIREMENTS.has(candidate.supportRequirement)) invalid("supportRequirement");
  if (typeof candidate.launchAuthorization !== "string" ||
      !WEAPON_LAUNCH_AUTHORIZATIONS.has(candidate.launchAuthorization)) invalid("launchAuthorization");

  if (!isRecord(candidate.termination) ||
      !hasExactKeys(candidate.termination, COMPILED_TERMINATION_KEYS)) {
    invalid("termination");
  }
  const termination = candidate.termination as Record<string, unknown>;
  if (termination.schemaVersion !== "vector.weapon-termination-model.v1" ||
      termination.intendedUse !== "ENGINE_VERIFICATION_ONLY" ||
      termination.criterion !== "GEOMETRIC_CLOSEST_APPROACH" ||
      typeof termination.interceptRadiusM !== "number" ||
      !Number.isFinite(termination.interceptRadiusM) ||
      termination.interceptRadiusM <= 0 ||
      typeof termination.maximumFlightTimeS !== "number" ||
      !Number.isFinite(termination.maximumFlightTimeS) ||
      termination.maximumFlightTimeS <= 0) invalid("termination");
}

function requireCompiledLoadoutStructure(
  loadout: unknown,
  index: number,
  pack: Record<string, unknown>,
  evidenceIds: ReadonlySet<string>,
  catalogObjectIds: ReadonlySet<string>,
): asserts loadout is Record<string, unknown> {
  const path = `loadouts[${index}]`;
  const invalid = (field: string): never => {
    throw new Error(
      `Supplied engine-verification compiled model pack ${path}.${field} is structurally invalid.`,
    );
  };
  if (!isRecord(loadout)) invalid("record");
  const candidate = loadout as Record<string, unknown>;
  if (!hasExactKeys(candidate, COMPILED_LOADOUT_KEYS)) invalid("fields");
  if (typeof candidate.id !== "string" || !STABLE_ID_PATTERN.test(candidate.id)) invalid("id");
  if (typeof candidate.version !== "string" || !SEMVER_PATTERN.test(candidate.version)) invalid("version");
  if (!isNonBlankStringArray(candidate.evidenceRefIds, true) ||
      candidate.evidenceRefIds.some((id) => !evidenceIds.has(id))) invalid("evidenceRefIds");
  if (!isCompiledValidityDomain(candidate.validityDomain)) invalid("validityDomain");
  if (!isNonBlankStringArray(candidate.limitationIds)) invalid("limitationIds");
  if (typeof candidate.platformCatalogObjectId !== "string" ||
      !catalogObjectIds.has(candidate.platformCatalogObjectId)) invalid("platformCatalogObjectId");
  if (!Array.isArray(candidate.stations)) invalid("stations");

  const weaponCount = (pack.weapons as unknown[]).length;
  const stationIds = new Set<string>();
  const stations = candidate.stations as unknown[];
  for (const [stationIndex, station] of stations.entries()) {
    const stationPath = `stations[${stationIndex}]`;
    if (!isRecord(station)) invalid(stationPath);
    const stationRecord = station as Record<string, unknown>;
    if (!hasExactKeys(stationRecord, COMPILED_LOADOUT_STATION_KEYS)) invalid(`${stationPath}.fields`);
    if (typeof stationRecord.id !== "string" || !STABLE_ID_PATTERN.test(stationRecord.id) ||
        stationIds.has(stationRecord.id)) invalid(`${stationPath}.id`);
    stationIds.add(stationRecord.id as string);
    if (typeof stationRecord.stationGroup !== "string" ||
        stationRecord.stationGroup.trim().length === 0) invalid(`${stationPath}.stationGroup`);
    if (!isRecord(stationRecord.positionBodyM)) invalid(`${stationPath}.positionBodyM`);
    const positionBodyM = stationRecord.positionBodyM as Record<string, unknown>;
    if (!hasExactKeys(positionBodyM, COMPILED_VECTOR_KEYS) ||
        COMPILED_VECTOR_KEYS.some((axis) =>
          typeof positionBodyM[axis] !== "number" ||
          !Number.isFinite(positionBodyM[axis])
        )) invalid(`${stationPath}.positionBodyM`);
    if (typeof stationRecord.maximumQuantity !== "number" ||
        !Number.isSafeInteger(stationRecord.maximumQuantity) ||
        stationRecord.maximumQuantity < 1) invalid(`${stationPath}.maximumQuantity`);
    if (!Array.isArray(stationRecord.compatibleStoreModelIndexes) ||
        stationRecord.compatibleStoreModelIndexes.some((value) => !isModelIndex(value, weaponCount)) ||
        new Set(stationRecord.compatibleStoreModelIndexes).size !==
          stationRecord.compatibleStoreModelIndexes.length) {
      invalid(`${stationPath}.compatibleStoreModelIndexes`);
    }
  }
}

function requireCompiledCompatibilityStructure(
  compatibility: unknown,
  index: number,
  pack: Record<string, unknown>,
  evidenceIds: ReadonlySet<string>,
  catalogObjectIds: ReadonlySet<string>,
): asserts compatibility is Record<string, unknown> {
  const path = `compatibility[${index}]`;
  const invalid = (field: string): never => {
    throw new Error(
      `Supplied engine-verification compiled model pack ${path}.${field} is structurally invalid.`,
    );
  };
  if (!isRecord(compatibility)) invalid("record");
  const candidate = compatibility as Record<string, unknown>;
  if (!hasExactKeys(candidate, COMPILED_COMPATIBILITY_KEYS)) invalid("fields");
  if (typeof candidate.id !== "string" || !STABLE_ID_PATTERN.test(candidate.id)) invalid("id");
  if (typeof candidate.platformCatalogObjectId !== "string" ||
      !catalogObjectIds.has(candidate.platformCatalogObjectId)) invalid("platformCatalogObjectId");
  const loadouts = pack.loadouts as Array<Record<string, unknown>>;
  const weapons = pack.weapons as Array<Record<string, unknown>>;
  if (!isModelIndex(candidate.loadoutModelIndex, loadouts.length)) invalid("loadoutModelIndex");
  if (!isModelIndex(candidate.storeModelIndex, weapons.length)) invalid("storeModelIndex");
  if (typeof candidate.stationGroup !== "string" ||
      candidate.stationGroup.trim().length === 0) invalid("stationGroup");
  if (typeof candidate.status !== "string" ||
      !COMPATIBILITY_STATUSES.has(candidate.status)) invalid("status");
  if (typeof candidate.maximumQuantity !== "number" ||
      !Number.isSafeInteger(candidate.maximumQuantity) ||
      candidate.maximumQuantity < 1) invalid("maximumQuantity");
  if (typeof candidate.rationale !== "string" ||
      candidate.rationale.trim().length === 0) invalid("rationale");
  if (!isNonBlankStringArray(candidate.evidenceRefIds, true) ||
      candidate.evidenceRefIds.some((id) => !evidenceIds.has(id))) invalid("evidenceRefIds");

  const loadout = loadouts[candidate.loadoutModelIndex as number];
  if (loadout.platformCatalogObjectId !== candidate.platformCatalogObjectId) {
    invalid("platformCatalogObjectId");
  }
  const matchingStation = (loadout.stations as Array<Record<string, unknown>>).find(
    (station) =>
      station.stationGroup === candidate.stationGroup &&
      (station.compatibleStoreModelIndexes as number[]).includes(candidate.storeModelIndex as number),
  );
  const admittedStation = matchingStation ?? invalid("stationGroup");
  if ((candidate.maximumQuantity as number) > (admittedStation.maximumQuantity as number)) {
    invalid("maximumQuantity");
  }
}

function requireCompiledV1Structure(value: unknown): asserts value is CompiledModelPack {
  if (!isRecord(value)) {
    throw new Error("Supplied engine-verification compiled model pack is structurally invalid.");
  }
  if (!hasExactKeys(value, COMPILED_V1_KEYS)) {
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
  const catalogObjectIds = new Set(
    (value.catalogIdentities as unknown[])
      .filter(isRecord)
      .map((item) => item.catalogObjectId)
      .filter((id): id is string => typeof id === "string"),
  );
  const weaponIds = new Set<string>();
  const loadoutIds = new Set<string>();
  const compatibilityIds = new Set<string>();
  const aircraftIds = new Set<string>();
  for (const [index, weapon] of value.weapons.entries()) {
    requireCompiledWeaponStructure(weapon, index, value, evidenceIds, catalogObjectIds);
    const weaponId = weapon.id as string;
    if (weaponIds.has(weaponId)) {
      throw new Error(
        `Supplied engine-verification compiled model pack has duplicate weapon ID ${weaponId}.`,
      );
    }
    weaponIds.add(weaponId);
  }
  for (const [index, loadout] of (value.loadouts as unknown[]).entries()) {
    requireCompiledLoadoutStructure(loadout, index, value, evidenceIds, catalogObjectIds);
    const loadoutId = loadout.id as string;
    if (loadoutIds.has(loadoutId)) {
      throw new Error(
        `Supplied engine-verification compiled model pack has duplicate loadout ID ${loadoutId}.`,
      );
    }
    loadoutIds.add(loadoutId);
  }
  for (const [index, compatibility] of (value.compatibility as unknown[]).entries()) {
    requireCompiledCompatibilityStructure(
      compatibility,
      index,
      value,
      evidenceIds,
      catalogObjectIds,
    );
    const compatibilityId = compatibility.id as string;
    if (compatibilityIds.has(compatibilityId)) {
      throw new Error(
        `Supplied engine-verification compiled model pack has duplicate compatibility ID ${compatibilityId}.`,
      );
    }
    compatibilityIds.add(compatibilityId);
  }
  for (const [index, aircraft] of (value.aircraft as unknown[]).entries()) {
    requireCompiledAircraftStructure(aircraft, index, value, evidenceIds, catalogObjectIds);
    const aircraftId = aircraft.id as string;
    if (aircraftIds.has(aircraftId)) {
      throw new Error(
        `Supplied engine-verification compiled model pack has duplicate aircraft ID ${aircraftId}.`,
      );
    }
    aircraftIds.add(aircraftId);
    const loadout = (value.loadouts as Array<Record<string, unknown>>)[
      aircraft.loadoutModelIndex as number
    ];
    if (loadout.platformCatalogObjectId !== aircraft.catalogObjectId) {
      throw new Error(
        `Supplied engine-verification compiled model pack aircraft[${index}].loadoutModelIndex does not reference the aircraft platform.`,
      );
    }
    if (!validityDomainCovers(
      loadout.validityDomain as SiValidityDomain,
      aircraft.validityDomain as SiValidityDomain,
    )) {
      throw new Error(
        `Supplied engine-verification compiled model pack aircraft[${index}].loadoutModel.validityDomain does not cover its admitted aircraft validity domain.`,
      );
    }
  }
  if (value.weapons.length === 0) {
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
