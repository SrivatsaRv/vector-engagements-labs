import { OBJECT_CATALOG } from "./object-catalog.ts";
import {
  AIRCRAFT_SIMULATION_MODELS,
  MODEL_LOADOUT_COMPATIBILITY,
  WEAPON_SIMULATION_MODELS,
} from "./simulation-models.ts";
import {
  INTENDED_USE_SCHEMA_VERSION,
  MODEL_PACK_SOURCE_SCHEMA_VERSION,
  type CoefficientTableSource,
  type ModelPackSource,
  type Quantity,
  type SourceUnit,
  type ValidityDomain,
} from "./model-pack.ts";

export const CURRENT_MODEL_PACK_ID = "vector-scalar-study-models";
export const CURRENT_MODEL_PACK_VERSION = "0.5.0";
export const CURRENT_MODEL_PACK_DIGEST = "181379ad76df8cdbf08666788bf1aace54b05651ce1d2e852487d651c6fb0e1d";
export const CURRENT_INTENDED_USE_ID = "vector.intended-use.geometry-teaching";
export const CURRENT_INTENDED_USE_VERSION = "1.0.0";
export const CURRENT_CREDIBILITY_MANIFEST_ID = "vector-scalar-study-credibility";
export const CURRENT_CREDIBILITY_MANIFEST_VERSION = "1.0.0";

const ASSUMPTION_EVIDENCE_ID = "current-scalar-model-assumptions";
const CONTRACT_EVIDENCE_ID = "model-pack-contract-tests";
const LIMITATION_ID = "not-named-system-performance";

const validity = (): ValidityDomain => ({
  altitude: { minimum: 0, maximum: 20, unit: "km" },
  mach: { minimum: 0, maximum: 5, unit: "1" },
  angleOfAttack: { minimum: -10, maximum: 20, unit: "deg" },
  loadFactor: { minimum: -4, maximum: 40, unit: "g0" },
  configurations: ["DECLARED_SCENARIO_CONFIGURATION"],
  environments: ["NASA_EDUCATIONAL_STANDARD"],
});

const quantity = (value: number, unit: SourceUnit): Quantity => ({
  value,
  unit,
  evidenceRefIds: [ASSUMPTION_EVIDENCE_ID],
});

const table = (
  id: string,
  semantic: CoefficientTableSource["axes"][number]["semantic"],
  axisUnit: SourceUnit,
  axisValues: number[],
  outputUnit: SourceUnit,
  values: number[],
): CoefficientTableSource => ({
  id,
  outputUnit,
  axes: [{ semantic, unit: axisUnit, values: axisValues }],
  values,
  evidenceRefIds: [ASSUMPTION_EVIDENCE_ID],
  validityDomain: validity(),
});

const aircraftModelId = (aircraftId: string) =>
  AIRCRAFT_SIMULATION_MODELS.find((item) => item.aircraftId === aircraftId)?.id;
const weaponModelId = (weaponId: string) =>
  WEAPON_SIMULATION_MODELS.find((item) => item.weaponId === weaponId)?.id;
const loadoutModelId = (platformId: string) => `${platformId}-loadout-study-v05`;

export function createCurrentModelPackSource(): ModelPackSource {
  const aerodynamics = [
    ...AIRCRAFT_SIMULATION_MODELS.map((item) => ({
      kind: "AERODYNAMIC" as const,
      id: `${item.aircraftId}-aerodynamic-study-v05`,
      version: item.version,
      evidenceRefIds: [ASSUMPTION_EVIDENCE_ID],
      validityDomain: validity(),
      limitationIds: [LIMITATION_ID],
      referenceArea: quantity(item.referenceAreaM2, "m2"),
      referenceChord: quantity(1, "m"),
      referenceSpan: quantity(1, "m"),
      coefficientTables: [
        table(
          `${item.aircraftId}-zero-lift-drag-table-v05`,
          "MACH",
          "1",
          [0, 5],
          "1",
          [item.zeroLiftDragCoefficient, item.zeroLiftDragCoefficient],
        ),
        table(
          `${item.aircraftId}-induced-drag-table-v05`,
          "ANGLE_OF_ATTACK",
          "deg",
          [-10, 20],
          "1",
          [item.inducedDragFactor, item.inducedDragFactor],
        ),
      ],
    })),
    ...WEAPON_SIMULATION_MODELS.map((item) => ({
      kind: "AERODYNAMIC" as const,
      id: `${item.weaponId}-aerodynamic-study-v05`,
      version: item.version,
      evidenceRefIds: [ASSUMPTION_EVIDENCE_ID],
      validityDomain: validity(),
      limitationIds: [LIMITATION_ID],
      referenceArea: quantity(item.referenceAreaM2, "m2"),
      referenceChord: quantity(1, "m"),
      referenceSpan: quantity(1, "m"),
      coefficientTables: [
        table(
          `${item.weaponId}-drag-table-v05`,
          "MACH",
          "1",
          [0, 5],
          "1",
          [item.dragCoefficient, item.dragCoefficient],
        ),
      ],
    })),
  ];

  const propulsion = [
    ...AIRCRAFT_SIMULATION_MODELS.map((item) => ({
      kind: "PROPULSION" as const,
      id: `${item.aircraftId}-propulsion-study-v05`,
      version: item.version,
      evidenceRefIds: [ASSUMPTION_EVIDENCE_ID],
      validityDomain: validity(),
      limitationIds: [LIMITATION_ID],
      engineCount: 1,
      thrustTable: table(
        `${item.aircraftId}-thrust-table-v05`,
        "THROTTLE",
        "1",
        [0, 1],
        "N",
        [0, item.maximumThrustNewtons],
      ),
      fuelFlowTable: table(
        `${item.aircraftId}-fuel-flow-table-v05`,
        "THROTTLE",
        "1",
        [0, 1],
        "kg/(N*s)",
        [item.specificFuelConsumptionKgPerNewtonSecond, item.specificFuelConsumptionKgPerNewtonSecond],
      ),
      spoolTime: quantity(0, "s"),
    })),
    ...WEAPON_SIMULATION_MODELS.map((item) => ({
      kind: "PROPULSION" as const,
      id: `${item.weaponId}-propulsion-study-v05`,
      version: item.version,
      evidenceRefIds: [ASSUMPTION_EVIDENCE_ID],
      validityDomain: validity(),
      limitationIds: [LIMITATION_ID],
      engineCount: 1,
      thrustTable: table(
        `${item.weaponId}-thrust-table-v05`,
        "TIME",
        "s",
        [0, item.poweredFlightSeconds],
        "N",
        [item.thrustNewtons, item.thrustNewtons],
      ),
      fuelFlowTable: table(
        `${item.weaponId}-fuel-flow-table-v05`,
        "TIME",
        "s",
        [0, item.poweredFlightSeconds],
        "kg/(N*s)",
        [
          (item.launchMassKg - item.dryMassKg) /
            Math.max(item.poweredFlightSeconds * item.thrustNewtons, 1),
          (item.launchMassKg - item.dryMassKg) /
            Math.max(item.poweredFlightSeconds * item.thrustNewtons, 1),
        ],
      ),
      spoolTime: quantity(0, "s"),
    })),
  ];

  const sensors = [
    {
      kind: "SENSOR" as const,
      id: "declared-envelope-sensor-study-v05",
      version: "0.5.0",
      evidenceRefIds: [ASSUMPTION_EVIDENCE_ID],
      validityDomain: validity(),
      limitationIds: [LIMITATION_ID],
      sensorKind: "DECLARED_ENVELOPE" as const,
      detectionRange: quantity(0, "m"),
      minimumRange: quantity(0, "m"),
      scanPeriod: quantity(1, "s"),
      azimuthFieldOfView: quantity(360, "deg"),
      elevationFieldOfView: quantity(180, "deg"),
    },
  ];

  const loadoutPlatforms = [
    ...new Set([
      ...MODEL_LOADOUT_COMPATIBILITY.map((item) => item.platformId),
      ...AIRCRAFT_SIMULATION_MODELS.map((item) => item.aircraftId),
    ]),
  ];
  const loadouts = loadoutPlatforms.map((platformId) => {
    const compatibleStoreModelIds = MODEL_LOADOUT_COMPATIBILITY
      .filter((item) => item.platformId === platformId)
      .map((item) => weaponModelId(item.weaponId))
      .filter((item): item is string => Boolean(item));
    return {
      kind: "LOADOUT" as const,
      id: loadoutModelId(platformId),
      version: "0.5.0",
      platformCatalogObjectId: platformId,
      evidenceRefIds: [ASSUMPTION_EVIDENCE_ID],
      validityDomain: validity(),
      limitationIds: [LIMITATION_ID],
      dependsOn: compatibleStoreModelIds,
      stations: compatibleStoreModelIds.length === 0 ? [] : [
        {
          id: `${platformId}-study-station`,
          stationGroup: "DECLARED_STUDY_STATION",
          positionBody: {
            x: quantity(0, "m"),
            y: quantity(0, "m"),
            z: quantity(0, "m"),
          },
          maximumQuantity: 1,
          compatibleStoreModelIds,
        },
      ],
    };
  });

  const aircraft = AIRCRAFT_SIMULATION_MODELS.map((item) => ({
    kind: "AIRCRAFT" as const,
    id: item.id,
    version: item.version,
    catalogObjectId: item.aircraftId,
    evidenceRefIds: [ASSUMPTION_EVIDENCE_ID],
    validityDomain: validity(),
    limitationIds: [LIMITATION_ID],
    aerodynamicModelId: `${item.aircraftId}-aerodynamic-study-v05`,
    propulsionModelIds: [`${item.aircraftId}-propulsion-study-v05`],
    sensorModelIds: ["declared-envelope-sensor-study-v05"],
    loadoutModelId: loadoutModelId(item.aircraftId),
    dependsOn: [
      `${item.aircraftId}-aerodynamic-study-v05`,
      `${item.aircraftId}-propulsion-study-v05`,
      "declared-envelope-sensor-study-v05",
      loadoutModelId(item.aircraftId),
    ],
    emptyMass: quantity(item.emptyMassKg, "kg"),
    fuelCapacity: quantity(item.fuelCapacityKg, "kg"),
    maximumCommandLoadFactor: quantity(item.maximumCommandG, "g0"),
  }));

  const weapons = WEAPON_SIMULATION_MODELS.map((item) => ({
    kind: "WEAPON" as const,
    id: item.id,
    version: item.version,
    catalogObjectId: item.weaponId,
    evidenceRefIds: [ASSUMPTION_EVIDENCE_ID],
    validityDomain: validity(),
    limitationIds: [LIMITATION_ID],
    aerodynamicModelId: `${item.weaponId}-aerodynamic-study-v05`,
    propulsionModelId: `${item.weaponId}-propulsion-study-v05`,
    sensorModelId: "declared-envelope-sensor-study-v05",
    dependsOn: [
      `${item.weaponId}-aerodynamic-study-v05`,
      `${item.weaponId}-propulsion-study-v05`,
      "declared-envelope-sensor-study-v05",
    ],
    launchMass: quantity(item.launchMassKg, "kg"),
    dryMass: quantity(item.dryMassKg, "kg"),
    maximumCommandLoadFactor: quantity(item.maximumCommandG, "g0"),
    seekerActivationRange: quantity(item.seekerActivationRangeM, "m"),
    datalinkUpdatePeriod: quantity(item.datalinkUpdateSeconds, "s"),
  }));

  return {
    schemaVersion: MODEL_PACK_SOURCE_SCHEMA_VERSION,
    id: CURRENT_MODEL_PACK_ID,
    version: CURRENT_MODEL_PACK_VERSION,
    coordinateConventions: {
      geodeticDatum: "WGS84",
      localFrame: "EAST_NORTH_UP",
      bodyAxes: "X_FORWARD_Y_RIGHT_Z_DOWN",
      aerodynamicAxes: "X_FORWARD_Y_RIGHT_Z_DOWN",
      angularUnit: "RADIAN",
      positionUnit: "METER",
      velocityUnit: "METER_PER_SECOND",
      verticalReference: "MEAN_SEA_LEVEL",
    },
    intendedUses: [
      {
        schemaVersion: INTENDED_USE_SCHEMA_VERSION,
        id: CURRENT_INTENDED_USE_ID,
        version: CURRENT_INTENDED_USE_VERSION,
        question: "How do relative geometry, altitude, aspect, closure, and deterministic recorded state evolve in a bounded teaching scenario?",
        requiredCapabilities: ["coordinate-transform", "fixed-step-integration", "immutable-recording"],
        supportedInterpretations: ["geometry teaching", "controlled comparison of declared inputs"],
        unsupportedInterpretations: [
          "named-aircraft handling or performance",
          "named-weapon effectiveness or probability of kill",
          "operational sensor, electronic-warfare, or launch-zone performance",
        ],
      },
    ],
    evidence: [
      {
        id: ASSUMPTION_EVIDENCE_ID,
        kind: "ASSUMPTION",
        title: "VECTOR 0.5 scalar regression assumptions",
        uri: "urn:vector:model-assumption:scalar-v0.5",
        accessedAt: "2026-08-06",
      },
      {
        id: CONTRACT_EVIDENCE_ID,
        kind: "VERIFICATION",
        title: "Model-pack contract and deterministic digest test suite",
        uri: "urn:vector:test:model-pack-contract-v1",
        accessedAt: "2026-08-06",
      },
    ],
    catalogIdentities: OBJECT_CATALOG.map((item) => ({
      catalogObjectId: item.id,
      kind: item.kind,
      definitionModelIds: [
        ...(aircraftModelId(item.id) ? [aircraftModelId(item.id)!] : []),
        ...(weaponModelId(item.id) ? [weaponModelId(item.id)!] : []),
      ],
    })),
    aerodynamics,
    propulsion,
    sensors,
    aircraft,
    weapons,
    loadouts,
    compatibility: MODEL_LOADOUT_COMPATIBILITY.map((item) => ({
      id: `${item.platformId}-${item.weaponId}-compatibility-v05`,
      platformCatalogObjectId: item.platformId,
      loadoutModelId: loadoutModelId(item.platformId),
      storeModelId: weaponModelId(item.weaponId)!,
      stationGroup: "DECLARED_STUDY_STATION",
      status: "SUPPORTED" as const,
      maximumQuantity: 1,
      rationale: "Existing scenario compatibility retained for regression continuity; named-system integration evidence remains catalog provenance, not model-performance evidence.",
      evidenceRefIds: [ASSUMPTION_EVIDENCE_ID],
    })),
    credibility: {
      id: CURRENT_CREDIBILITY_MANIFEST_ID,
      version: CURRENT_CREDIBILITY_MANIFEST_VERSION,
      engineDigest: "c59104464d75fa910f8ba79114d50a9ffae31c92875ab9ac6e65f62679ddc4aa",
      intendedUseRefs: [{ id: CURRENT_INTENDED_USE_ID, version: CURRENT_INTENDED_USE_VERSION }],
      validityDomain: validity(),
      requirements: [
        { id: "deterministic-pack-compile", statement: "Identical source definitions compile to one canonical digest." },
        { id: "fail-closed-references", statement: "Missing model and compatibility references block compilation." },
      ],
      cases: [
        {
          id: "model-pack-contract-case",
          requirementId: "deterministic-pack-compile",
          kind: "VERIFICATION",
          result: "NOT_RUN",
          tolerance: "exact SHA-256 identity",
          evidenceRefId: CONTRACT_EVIDENCE_ID,
        },
        {
          id: "model-pack-reference-case",
          requirementId: "fail-closed-references",
          kind: "VERIFICATION",
          result: "NOT_RUN",
          tolerance: "zero unresolved references",
          evidenceRefId: CONTRACT_EVIDENCE_ID,
        },
      ],
      numericalTolerances: [{ metric: "canonical digest mismatch", tolerance: 0, unit: "1" }],
      uncertaintyCharacterization: "The current scalar coefficients are unvalidated model assumptions retained to preserve regression behavior while executable model-pack infrastructure is introduced.",
      limitations: [
        {
          id: LIMITATION_ID,
          severity: "BLOCKING",
          statement: "This pack must not be interpreted as named-aircraft, named-weapon, sensor, or operational effectiveness performance.",
          affectedCapabilities: ["aircraft-performance", "weapon-effectiveness", "sensor-performance", "operational-analysis"],
        },
      ],
      approvalState: "DRAFT",
    },
  };
}
