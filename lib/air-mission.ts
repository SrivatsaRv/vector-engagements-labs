import { sha256HexSync } from "./geospatial/digest.ts";
import {
  admitGroundStart,
  findRunwayCatalogueRecord,
  INSTALLATION_CATALOGUE_IDENTITY,
  PUBLIC_INSTALLATIONS,
} from "./installations.ts";
import { geographicToEnginePosition, isPointInsideStudyArea } from "./scenario-spatial.ts";
import { getStudyArea } from "./study-areas.ts";
import type { Scenario } from "./simulation.ts";
import { createEnvironmentSampler, type EnvironmentPack } from "./geospatial/environment-pack.ts";
import {
  ModelPackValidationError,
  validateScenarioModelInstance,
  type CompiledModelPack,
} from "./model-pack.ts";

export const AIR_MISSION_SCHEMA_VERSION = "vector.air-mission.v1" as const;
export const COMPILED_AIR_MISSION_SCHEMA_VERSION = "vector.compiled-air-mission.v1" as const;

export type AirMissionClass =
  | "TACTICAL_INTERCEPT"
  | "COMBAT_AIR_PATROL"
  | "FIGHTER_SWEEP"
  | "ESCORT";
export type EngagementRegime = "BVR" | "WVR_BFM" | "UNRESTRICTED_TRANSITION";
export type AirStartPosture = "AIRBORNE" | "PARKING" | "RUNWAY" | "GROUND_ALERT_QRA";
export type FlightLegRole =
  | "DEPARTURE"
  | "TRANSIT"
  | "INGRESS"
  | "INTERCEPT_ATTACK"
  | "ON_STATION_PATROL"
  | "REFUEL"
  | "EGRESS"
  | "RECOVERY"
  | "DIVERT";

export type MissionPosition = {
  longitude: number;
  latitude: number;
  altitude: { valueM: number; datum: "MSL" | "AGL" };
};

export type FlightPlanRoutePoint = {
  id: string;
  position: MissionPosition;
  turnMethod: "START" | "FLY_BY" | "FLY_OVER";
  acceptanceRadiusM: number;
  constraint: {
    speed: { kind: "TAS"; valueMps: number } | { kind: "MACH"; value: number };
    etaSeconds?: number;
    totalTimeOnTargetSeconds?: number;
    locked: boolean;
  };
  taskRef: "MISSION_START" | AirMissionClass | null;
};

export type FlightPlan = {
  schemaVersion: "vector.flight-plan.v1";
  id: string;
  routePoints: FlightPlanRoutePoint[];
  legs: Array<{ id: string; fromPointId: string; toPointId: string; role: FlightLegRole }>;
};

export type RunwayGeometry = {
  id: string;
  threshold: { longitude: number; latitude: number; elevation: { valueM: number; datum: "MSL" } };
  end: { longitude: number; latitude: number; elevation: { valueM: number; datum: "MSL" } };
  headingDeg: number;
  lengthM: number;
  widthM: number;
  surface: "PAVED" | "UNPAVED";
  operationalState: "OPEN" | "CLOSED";
  evidence: {
    state: "SOURCED" | "CALIBRATED" | "MODEL_ASSUMPTION" | "USER_AUTHORED" | "UNKNOWN";
    sourceId: string;
    digest: string;
  };
};

export function runwayEvidenceDigest(runway: Omit<RunwayGeometry, "evidence">, evidence: Pick<RunwayGeometry["evidence"], "state" | "sourceId">) {
  return sha256HexSync({
    schemaVersion: "vector.runway-evidence.v1",
    valueState: evidence.state,
    sourceId: evidence.sourceId,
    runway,
  });
}

export function bindRunwayEvidence(
  runway: Omit<RunwayGeometry, "evidence">,
  evidence: Pick<RunwayGeometry["evidence"], "state" | "sourceId">,
): RunwayGeometry {
  return {
    ...runway,
    evidence: { ...evidence, digest: runwayEvidenceDigest(runway, evidence) },
  };
}

/** Build the only Air-mission runway artifact executable by a regional pack. */
export function bindAdmittedEnvironmentRunway(input: {
  environmentPack: Readonly<EnvironmentPack>;
  installationId: string;
  runwayId: string;
  direction?: "FORWARD" | "RECIPROCAL";
}): RunwayGeometry {
  const start = admitGroundStart({
    pack: input.environmentPack,
    installationId: input.installationId,
    runwayId: input.runwayId,
  });
  const source = findRunwayCatalogueRecord(start.runwayId);
  if (!source?.centreline || !source.thresholdElevationsMslM) {
    throw new TypeError("Admitted runway source geometry is incomplete.");
  }
  if (!Number.isFinite(source.reciprocalTrueHeadingDeg)) {
    throw new TypeError("Admitted runway reciprocal heading is incomplete.");
  }
  if (!["ASP", "CON", "PEM", "PAV"].includes(source.surface ?? "")) {
    throw new TypeError("Admitted runway surface is not mapped to the current paved ground envelope.");
  }
  const reciprocal = input.direction === "RECIPROCAL";
  const thresholdIndex = reciprocal ? 1 : 0;
  const endIndex = reciprocal ? 0 : 1;
  return bindRunwayEvidence({
    id: source.id,
    threshold: {
      longitude: source.centreline.coordinates[thresholdIndex][0],
      latitude: source.centreline.coordinates[thresholdIndex][1],
      elevation: {
        valueM: reciprocal
          ? source.thresholdElevationsMslM.high
          : source.thresholdElevationsMslM.low,
        datum: "MSL",
      },
    },
    end: {
      longitude: source.centreline.coordinates[endIndex][0],
      latitude: source.centreline.coordinates[endIndex][1],
      elevation: {
        valueM: reciprocal
          ? source.thresholdElevationsMslM.low
          : source.thresholdElevationsMslM.high,
        datum: "MSL",
      },
    },
    headingDeg: reciprocal ? Number(source.reciprocalTrueHeadingDeg) : start.trueHeadingDeg,
    lengthM: start.runwayLengthM,
    widthM: start.runwayWidthM,
    surface: "PAVED",
    operationalState: "OPEN",
  }, {
    state: "SOURCED",
    sourceId: `${INSTALLATION_CATALOGUE_IDENTITY.id}@${INSTALLATION_CATALOGUE_IDENTITY.version}:${source.sourceRunwayId}:${INSTALLATION_CATALOGUE_IDENTITY.digest}`,
  });
}

export type AirMissionStart =
  | { posture: "AIRBORNE"; flightPlanId: string; routePointId: string }
  | {
      posture: Exclude<AirStartPosture, "AIRBORNE">;
      installationId: string;
      installationSourceId: string;
      runway: RunwayGeometry;
      readinessDelaySeconds: number;
      taxiFidelity: "ABSTRACTED";
      takeoffCondition: string;
      rejectedTakeoffCondition: string;
    };

type MissionArea = {
  id: string;
  vertices: Array<{ longitude: number; latitude: number }>;
};

export type AirMissionTasks =
  | {
      kind: "TACTICAL_INTERCEPT";
      defendedArea: MissionArea;
      contactCategory: "HOSTILE_AIR_CONTACT";
      initialTrackSource: "ONBOARD_RADAR" | "DATALINK" | "AIRBORNE_EARLY_WARNING" | "VISUAL";
      initialTrackUncertaintyM: number;
      trigger: "CONTACT_ENTERS_DEFENDED_AREA";
      objective: "IDENTIFY_SHADOW_OR_ENGAGE";
      commitCondition: string;
      abortCondition: string;
      disengageCondition: string;
    }
  | {
      kind: "COMBAT_AIR_PATROL";
      patrolArea: MissionArea;
      prosecutionArea: MissionArea | null;
      onStationCount: number;
      flightSize: number;
      patrolPattern: "RACETRACK";
      onStationMinutes: number;
      relief: "FUEL_OR_TIME";
      investigationLimitM: number;
      prosecutionLimitM: number;
      completionCondition: string;
    }
  | {
      kind: "FIGHTER_SWEEP";
      sweepArea: MissionArea;
      targetWindow: { startsSeconds: number; endsSeconds: number };
      formation: "PAIR";
      contactCategories: ["HOSTILE_AIR_CONTACT"];
      engagementBoundary: MissionArea;
      supportRelationship: "MUTUAL_SUPPORT";
      completionCondition: string;
    }
  | {
      kind: "ESCORT";
      protectedPackageId: string;
      joinUpPointId: string;
      joinUpTimeSeconds: number;
      escortGeometry: "BRACKET";
      threatResponseRadiusM: number;
      investigatorCount: number;
      engagerCount: number;
      splitRejoinPolicy: "REJOIN_AFTER_RESPONSE";
      detachCondition: string;
      completionCondition: string;
    };

export type AirMissionDefinition = {
  schemaVersion: typeof AIR_MISSION_SCHEMA_VERSION;
  id: string;
  version: string;
  objective: string;
  side: "BLUE";
  missionClass: AirMissionClass;
  regime: EngagementRegime;
  studyAreaId: string;
  weatherPresetId: string;
  assignedTargetIds: string[];
  flightPlans: FlightPlan[];
  start: AirMissionStart;
  assignments: Array<{
    id: string;
    flightPlanId: string;
    aircraftId: string;
    aircraftModelPackDigest: string;
    initialFuelPercent: number;
    loadout: {
      schemaVersion: "vector.loadout-plan.v1";
      stores: Array<{ stationId: string; weaponId: string; quantity: number; compatibilityRuleId: string }>;
      compatibility: "COMPILED_MODEL_PACK";
    };
    groundCompatibility: {
      schemaVersion: "vector.aircraft-ground-envelope-binding.v1";
      envelopeId: string;
      envelopeDigest: string;
    };
  }>;
  tasks: AirMissionTasks;
  policies: {
    emission: "ACTIVE" | "SILENT";
    weapon: "HOLD" | "TIGHT" | "FREE_WITHIN_BOUNDARY";
    deterministicPolicyVersion: "vector.air-mission-policy.v1";
  };
  fuel: {
    reservePercent: number;
    weaponRtbThreshold: number;
    recoveryInstallationId: string | null;
    divertInstallationId: string | null;
  };
  completionCondition: string;
  abortCondition: string;
  disengagementCondition: string;
  recoveryCondition: string;
  intendedUse: "PUBLIC_EDUCATIONAL";
  provenance: {
    valueState: "MODEL_ASSUMPTION" | "USER_AUTHORED";
    sourceIds: string[];
  };
  assumptions: string[];
  validityLimits: string[];
};

export type AircraftGroundEnvelope = {
  schemaVersion: "vector.compiled-aircraft-ground-envelope.v1";
  id: string;
  aircraftId: string;
  aircraftModelId: string;
  modelPackDigest: string;
  minimumRunwayLengthM: number;
  compatibleSurfaces: Array<"PAVED" | "UNPAVED">;
  maximumTailwindMps: number;
  valueState: "MODEL_ASSUMPTION";
  evidenceRefIds: string[];
  limitationIds: string[];
  digest: string;
};

export type AirMissionAdmissionCode =
  | "MISSION_SCHEMA_UNSUPPORTED"
  | "MISSION_SCHEMA_INVALID"
  | "MISSION_CLASS_FIELDS_MISMATCH"
  | "MISSION_SIDE_UNSUPPORTED"
  | "MISSION_ENVIRONMENT_MISMATCH"
  | "MISSION_MODEL_PACK_MISMATCH"
  | "MISSION_REFERENCE_UNKNOWN"
  | "MISSION_ROUTE_START_MISMATCH"
  | "MISSION_ROUTE_INVALID"
  | "MISSION_TERRAIN_REQUIRED"
  | "MISSION_TIME_CONSTRAINT_IMPOSSIBLE"
  | "MISSION_FUEL_INVALID"
  | "MISSION_FUEL_RESERVE_INSUFFICIENT"
  | "MISSION_LOADOUT_INVALID"
  | "MISSION_RUNWAY_EVIDENCE_MISSING"
  | "MISSION_RUNWAY_INVALID"
  | "MISSION_INSTALLATION_UNKNOWN"
  | "MISSION_AREA_INVALID";

export class AirMissionAdmissionError extends Error {
  readonly code: AirMissionAdmissionCode;
  readonly fieldPath: string;
  readonly correctiveGuidance: string;

  constructor(
    code: AirMissionAdmissionCode,
    fieldPath: string,
    message: string,
    correctiveGuidance: string,
  ) {
    super(message);
    this.name = "AirMissionAdmissionError";
    this.code = code;
    this.fieldPath = fieldPath;
    this.correctiveGuidance = correctiveGuidance;
  }
}

export type CompiledAirMission = {
  schemaVersion: typeof COMPILED_AIR_MISSION_SCHEMA_VERSION;
  id: string;
  version: string;
  authoredDigest: string;
  compiledDigest: string;
  modelPackDigest: string;
  environmentPackDigest: string;
  authored: AirMissionDefinition;
  flightPlan: FlightPlan;
  assignment: {
    id: string;
    flightPlanId: string;
    aircraftId: string;
    initialFuelPercent: number;
    loadout: Array<{ stationId: string; weaponId: string; quantity: number; compatibilityRuleId: string }>;
    groundEnvelope: AircraftGroundEnvelope;
  };
  policies: AirMissionDefinition["policies"];
  start: {
    posture: AirStartPosture;
    entryState: "AIRBORNE" | "GROUND";
    position: MissionPosition;
    initialSpeedMps: number;
    headingSource: "FLIGHT_PLAN_FIRST_LEG" | "RUNWAY_TRUE_HEADING";
    runwayHeadingDegTrue: number | null;
  };
};

type MissionScenario = Pick<
  Scenario,
  | "objective"
  | "studyAreaId"
  | "weatherPresetId"
  | "bluePlatformId"
  | "blueSystemId"
  | "redObjectId"
  | "blueWeaponQuantity"
  | "blueFuelPercent"
  | "blueRadarMode"
  | "blueTrackSource"
  | "wind"
  | "windNorth"
  | "spatialPlan"
>;

const exactKeys = (value: object, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmptyText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function exactRecord(value: unknown, keys: readonly string[], path: string): asserts value is Record<string, unknown> {
  if (!isRecord(value) || !exactKeys(value, keys)) {
    fail("MISSION_SCHEMA_INVALID", path, `${path} contains missing or unknown fields.`, `Use ${AIR_MISSION_SCHEMA_VERSION} exactly; unknown fields never gain runtime authority.`);
  }
}

function fail(code: AirMissionAdmissionCode, fieldPath: string, message: string, guidance: string): never {
  throw new AirMissionAdmissionError(code, fieldPath, message, guidance);
}

function areaAround(longitude: number, latitude: number, id: string): MissionArea {
  const d = 0.04;
  return {
    id,
    vertices: [
      { longitude: longitude - d, latitude: latitude - d },
      { longitude: longitude + d, latitude: latitude - d },
      { longitude: longitude + d, latitude: latitude + d },
      { longitude: longitude - d, latitude: latitude + d },
    ],
  };
}

function taskDefaults(missionClass: AirMissionClass, firstPoint: FlightPlanRoutePoint, trackSource: Scenario["blueTrackSource"]): AirMissionTasks {
  const missionArea = areaAround(firstPoint.position.longitude, firstPoint.position.latitude, `${missionClass.toLowerCase()}-area`);
  switch (missionClass) {
    case "TACTICAL_INTERCEPT":
      return {
        kind: missionClass,
        defendedArea: missionArea,
        contactCategory: "HOSTILE_AIR_CONTACT",
        initialTrackSource: trackSource,
        initialTrackUncertaintyM: 10_000,
        trigger: "CONTACT_ENTERS_DEFENDED_AREA",
        objective: "IDENTIFY_SHADOW_OR_ENGAGE",
        commitCondition: "Assigned contact enters the defended area.",
        abortCondition: "Fuel reserve or mission boundary reached.",
        disengageCondition: "Contact exits the defended area.",
      };
    case "COMBAT_AIR_PATROL":
      return {
        kind: missionClass,
        patrolArea: missionArea,
        prosecutionArea: areaAround(firstPoint.position.longitude, firstPoint.position.latitude, "cap-prosecution-area"),
        onStationCount: 2,
        flightSize: 2,
        patrolPattern: "RACETRACK",
        onStationMinutes: 30,
        relief: "FUEL_OR_TIME",
        investigationLimitM: 40_000,
        prosecutionLimitM: 60_000,
        completionCondition: "Station time, fuel, or weapon threshold reached.",
      };
    case "FIGHTER_SWEEP":
      return {
        kind: missionClass,
        sweepArea: missionArea,
        targetWindow: { startsSeconds: 0, endsSeconds: 1_800 },
        formation: "PAIR",
        contactCategories: ["HOSTILE_AIR_CONTACT"],
        engagementBoundary: missionArea,
        supportRelationship: "MUTUAL_SUPPORT",
        completionCondition: "Sweep route and egress are complete.",
      };
    case "ESCORT":
      return {
        kind: missionClass,
        protectedPackageId: "red-object-1",
        joinUpPointId: firstPoint.id,
        joinUpTimeSeconds: 0,
        escortGeometry: "BRACKET",
        threatResponseRadiusM: 30_000,
        investigatorCount: 1,
        engagerCount: 1,
        splitRejoinPolicy: "REJOIN_AFTER_RESPONSE",
        detachCondition: "Protected package reaches its detach point.",
        completionCondition: "Protected package and escort recover or divert.",
      };
  }
}

function compileGroundEnvelope(
  pack: Readonly<CompiledModelPack>,
  aircraft: CompiledModelPack["aircraft"][number],
): AircraftGroundEnvelope {
  const withoutDigest = {
    schemaVersion: "vector.compiled-aircraft-ground-envelope.v1" as const,
    id: `${aircraft.id}-ground-envelope-v1`,
    aircraftId: aircraft.catalogObjectId,
    aircraftModelId: aircraft.id,
    modelPackDigest: pack.digest,
    minimumRunwayLengthM: 800,
    compatibleSurfaces: ["PAVED"] as Array<"PAVED" | "UNPAVED">,
    maximumTailwindMps: 5,
    valueState: "MODEL_ASSUMPTION" as const,
    evidenceRefIds: [...aircraft.evidenceRefIds],
    limitationIds: [...aircraft.limitationIds],
  };
  return { ...withoutDigest, digest: sha256HexSync(withoutDigest) };
}

function resolveAircraftConfiguration(input: {
  pack: Readonly<CompiledModelPack>;
  aircraftId: string;
  weaponId: string;
  quantity: number;
  stationId?: string;
  compatibilityRuleId?: string;
}) {
  const { pack } = input;
  const aircraft = pack.aircraft.find((candidate) => candidate.catalogObjectId === input.aircraftId);
  if (!aircraft) fail("MISSION_MODEL_PACK_MISMATCH", "assignments[0].aircraftId", "The assigned aircraft is absent from the admitted compiled model pack.", "Select an aircraft identity admitted by the exact model-pack digest.");
  const loadout = pack.loadouts[aircraft.loadoutModelIndex];
  const weaponIndex = pack.weapons.findIndex((candidate) => candidate.catalogObjectId === input.weaponId);
  const weapon = pack.weapons[weaponIndex];
  if (!loadout || loadout.platformCatalogObjectId !== input.aircraftId || weaponIndex < 0) fail("MISSION_LOADOUT_INVALID", "assignments[0].loadout", "The compiled aircraft/loadout/weapon identity cannot be resolved.", "Select a store admitted for the exact compiled aircraft configuration.");
  const station = input.stationId === undefined
    ? loadout.stations.find((candidate) => candidate.compatibleStoreModelIndexes.includes(weaponIndex))
    : loadout.stations.find((candidate) => candidate.id === input.stationId);
  if (!station) fail("MISSION_LOADOUT_INVALID", "assignments[0].loadout.stores[0].stationId", "The station is missing or incompatible with the selected store.", "Select the exact compatible compiled station identity.");
  try {
    validateScenarioModelInstance(pack as CompiledModelPack, {
      id: "air-mission-loadout-admission",
      catalogObjectId: input.aircraftId,
      modelId: aircraft.id,
      modelPackDigest: pack.digest,
      loadout: [{ stationId: station.id, storeModelId: weapon.id, quantity: input.quantity }],
      patches: [],
    });
  } catch (error) {
    const detail = error instanceof ModelPackValidationError ? error.issues.join("; ") : "compiled loadout admission failed";
    fail("MISSION_LOADOUT_INVALID", "assignments[0].loadout.stores[0]", `The admitted compiled model pack rejected this station/store/quantity: ${detail}.`, "Select an exact supported station and quantity within compiled capacity.");
  }
  const rule = pack.compatibility.find((candidate) =>
    candidate.platformCatalogObjectId === input.aircraftId
    && candidate.loadoutModelIndex === aircraft.loadoutModelIndex
    && candidate.storeModelIndex === weaponIndex
    && candidate.stationGroup === station.stationGroup
    && candidate.status === "SUPPORTED"
    && (input.compatibilityRuleId === undefined || candidate.id === input.compatibilityRuleId));
  if (!rule) fail("MISSION_LOADOUT_INVALID", "assignments[0].loadout.stores[0].compatibilityRuleId", "No exact supported compiled compatibility rule admits this store.", "Select a supported rule from the admitted model pack.");
  return { aircraft, station, rule, groundEnvelope: compileGroundEnvelope(pack, aircraft) };
}

export function createDefaultAirMissionDefinition(input: {
  scenario: MissionScenario;
  missionClass?: AirMissionClass;
  modelPack: Readonly<CompiledModelPack>;
}): AirMissionDefinition {
  const scenario = input.scenario;
  if (!scenario.spatialPlan) {
    fail("MISSION_ROUTE_INVALID", "spatialPlan", "Air mission defaults require an explicit spatial plan.", "Author the start positions and routes first.");
  }
  const missionClass = input.missionClass ?? "TACTICAL_INTERCEPT";
  const configuration = resolveAircraftConfiguration({
    pack: input.modelPack,
    aircraftId: scenario.bluePlatformId,
    weaponId: scenario.blueSystemId,
    quantity: scenario.blueWeaponQuantity,
  });
  const transitions = scenario.spatialPlan.blue.routeWaypointTransitions ?? scenario.spatialPlan.blue.route.map((_, index) => index === 0 ? "START" : "FLY_BY");
  const routePoints: FlightPlanRoutePoint[] = scenario.spatialPlan.blue.route.map((point, index) => ({
    id: `blue-route-${index + 1}`,
    position: {
      longitude: point.longitude,
      latitude: point.latitude,
      altitude: { valueM: point.altitudeM, datum: point.verticalDatum },
    },
    turnMethod: transitions[index] ?? (index === 0 ? "START" : "FLY_BY"),
    acceptanceRadiusM: scenario.spatialPlan!.blue.routeAcceptanceRadiiM[index],
    constraint: {
      speed: { kind: "TAS", valueMps: scenario.spatialPlan!.blue.speedMps },
      locked: false,
    },
    taskRef: index === 0 ? "MISSION_START" : missionClass,
  }));
  const flightPlan: FlightPlan = {
    schemaVersion: "vector.flight-plan.v1",
    id: "blue-flight-plan-1",
    routePoints,
    legs: routePoints.slice(1).map((point, index) => ({
      id: `blue-leg-${index + 1}`,
      fromPointId: routePoints[index].id,
      toPointId: point.id,
      role: (index === 0 ? "TRANSIT" : "INTERCEPT_ATTACK") as FlightLegRole,
    })),
  };
  return {
    schemaVersion: AIR_MISSION_SCHEMA_VERSION,
    id: "blue-air-mission-1",
    version: "1.0.0",
    objective: scenario.objective,
    side: "BLUE",
    missionClass,
    regime: "UNRESTRICTED_TRANSITION",
    studyAreaId: scenario.studyAreaId,
    weatherPresetId: scenario.weatherPresetId,
    assignedTargetIds: ["red-object-1"],
    flightPlans: [flightPlan],
    start: { posture: "AIRBORNE", flightPlanId: flightPlan.id, routePointId: routePoints[0].id },
    assignments: [{
      id: "blue-flight-1",
      flightPlanId: flightPlan.id,
      aircraftId: scenario.bluePlatformId,
      aircraftModelPackDigest: input.modelPack.digest,
      initialFuelPercent: scenario.blueFuelPercent,
      loadout: {
        schemaVersion: "vector.loadout-plan.v1",
        stores: [{ stationId: configuration.station.id, weaponId: scenario.blueSystemId, quantity: scenario.blueWeaponQuantity, compatibilityRuleId: configuration.rule.id }],
        compatibility: "COMPILED_MODEL_PACK",
      },
      groundCompatibility: {
        schemaVersion: "vector.aircraft-ground-envelope-binding.v1",
        envelopeId: configuration.groundEnvelope.id,
        envelopeDigest: configuration.groundEnvelope.digest,
      },
    }],
    tasks: taskDefaults(missionClass, routePoints[0], scenario.blueTrackSource),
    policies: {
      emission: scenario.blueRadarMode,
      weapon: "TIGHT",
      deterministicPolicyVersion: "vector.air-mission-policy.v1",
    },
    fuel: {
      reservePercent: 20,
      weaponRtbThreshold: 0,
      recoveryInstallationId: null,
      divertInstallationId: null,
    },
    completionCondition: "Mission objective is complete or the run terminates.",
    abortCondition: "Fuel reserve, validity limit, or assignment loss.",
    disengagementCondition: "Leave the declared engagement boundary.",
    recoveryCondition: "Recover or divert with the declared reserve.",
    intendedUse: "PUBLIC_EDUCATIONAL",
    provenance: { valueState: "MODEL_ASSUMPTION", sourceIds: [] },
    assumptions: ["Current mission policy is authored and recorded; autonomous mission behaviour is outside this contract."],
    validityLimits: [
      "Terrain, atmosphere, and runway fidelity is bounded by the exact admitted EnvironmentPack sources, coverage, validity interval, resolution, and uncertainty.",
    ],
  };
}

/**
 * Rebuild the route/loadout/fuel adapter fields from one Scenario edit while
 * retaining the operator-authored mission policy. The compiler still rejects
 * stale imported objects; this helper is only for visible draft edits.
 */
export function synchronizeScenarioAirMission(
  scenario: Scenario,
  modelPack: Readonly<CompiledModelPack>,
): Scenario {
  const current = scenario.airMission;
  if (!current || !scenario.spatialPlan || scenario.domain !== "A2A") return scenario;
  const next = createDefaultAirMissionDefinition({
    scenario,
    missionClass: current.missionClass,
    modelPack,
  });
  const environmentChanged = current.studyAreaId !== scenario.studyAreaId
    || current.weatherPresetId !== scenario.weatherPresetId;
  const synchronizedTasks: AirMissionTasks = (() => {
    if (current.tasks.kind !== current.missionClass) return next.tasks;
    if (!environmentChanged) return structuredClone(current.tasks);
    switch (current.tasks.kind) {
      case "TACTICAL_INTERCEPT":
        return { ...structuredClone(current.tasks), defendedArea: structuredClone((next.tasks as Extract<AirMissionTasks, { kind: "TACTICAL_INTERCEPT" }>).defendedArea) };
      case "COMBAT_AIR_PATROL": {
        const replacement = next.tasks as Extract<AirMissionTasks, { kind: "COMBAT_AIR_PATROL" }>;
        return { ...structuredClone(current.tasks), patrolArea: structuredClone(replacement.patrolArea), prosecutionArea: structuredClone(replacement.prosecutionArea) };
      }
      case "FIGHTER_SWEEP": {
        const replacement = next.tasks as Extract<AirMissionTasks, { kind: "FIGHTER_SWEEP" }>;
        return { ...structuredClone(current.tasks), sweepArea: structuredClone(replacement.sweepArea), engagementBoundary: structuredClone(replacement.engagementBoundary) };
      }
      case "ESCORT":
        return { ...structuredClone(current.tasks), joinUpPointId: (next.tasks as Extract<AirMissionTasks, { kind: "ESCORT" }>).joinUpPointId };
    }
  })();
  return {
    ...scenario,
    airMission: {
      ...next,
      id: current.id,
      version: current.version,
      start: structuredClone(environmentChanged ? next.start : current.start),
      regime: current.regime,
      tasks: synchronizedTasks,
      policies: structuredClone(current.policies),
      fuel: environmentChanged
        ? { ...structuredClone(current.fuel), recoveryInstallationId: null, divertInstallationId: null }
        : { ...next.fuel, ...structuredClone(current.fuel) },
      completionCondition: current.completionCondition,
      abortCondition: current.abortCondition,
      disengagementCondition: current.disengagementCondition,
      recoveryCondition: current.recoveryCondition,
      provenance: structuredClone(current.provenance),
      assumptions: [...current.assumptions],
      validityLimits: [...current.validityLimits],
    },
  };
}

/**
 * The sole visible flight-plan edit boundary. AirMissionDefinition is
 * authoritative; spatialPlan.blue is updated atomically as a compatibility
 * projection for legacy consumers and compile-time anti-staleness checks.
 */
export function updateScenarioAirMissionRoutePoint(
  scenario: Scenario,
  index: number,
  patch: Partial<FlightPlanRoutePoint>,
): Scenario {
  if (scenario.domain !== "A2A" || !scenario.airMission || !scenario.spatialPlan) return scenario;
  const plan = scenario.airMission.flightPlans[0];
  const currentPoint = plan?.routePoints[index];
  if (!currentPoint) fail("MISSION_REFERENCE_UNKNOWN", `flightPlans[0].routePoints[${index}]`, "The route edit references a missing point.", "Edit an existing visible flight-plan point.");
  const nextPoint: FlightPlanRoutePoint = {
    ...structuredClone(currentPoint),
    ...structuredClone(patch),
  };
  if (patch.turnMethod === "FLY_OVER" && patch.acceptanceRadiusM === undefined) nextPoint.acceptanceRadiusM = 1;
  if (index === 0) {
    nextPoint.turnMethod = "START";
    nextPoint.acceptanceRadiusM = 1;
    nextPoint.taskRef = "MISSION_START";
  }
  if (nextPoint.position.altitude.datum !== "MSL") fail("MISSION_TERRAIN_REQUIRED", `flightPlans[0].routePoints[${index}].position.altitude.datum`, "The compatibility projection cannot represent AGL without admitted terrain.", "Use metres MSL for visible route edits.");
  const flightPlans = structuredClone(scenario.airMission.flightPlans);
  flightPlans[0].routePoints[index] = nextPoint;
  const spatialPlan = structuredClone(scenario.spatialPlan);
  spatialPlan.blue.route[index] = {
    longitude: nextPoint.position.longitude,
    latitude: nextPoint.position.latitude,
    altitudeM: nextPoint.position.altitude.valueM,
    verticalDatum: "MSL",
  };
  if (index === 0) spatialPlan.blue.position = structuredClone(spatialPlan.blue.route[index]);
  const transitions = spatialPlan.blue.routeWaypointTransitions
    ?? spatialPlan.blue.route.map((_, pointIndex) => pointIndex === 0 ? "START" : "FLY_BY");
  transitions[index] = nextPoint.turnMethod;
  spatialPlan.blue.routeWaypointTransitions = transitions;
  spatialPlan.blue.routeAcceptanceRadiiM[index] = nextPoint.acceptanceRadiusM;
  if (patch.constraint?.speed) {
    spatialPlan.blue.speedMps = constrainedSpeedMps(nextPoint);
    flightPlans[0].routePoints = flightPlans[0].routePoints.map((point) => ({
      ...point,
      constraint: { ...point.constraint, speed: structuredClone(nextPoint.constraint.speed) },
    }));
  }
  return { ...scenario, spatialPlan, airMission: { ...scenario.airMission, flightPlans } };
}

function validateArea(area: MissionArea, path: string, studyAreaId: string) {
  exactRecord(area, ["id", "vertices"], path);
  if (!area?.id || !Array.isArray(area.vertices) || area.vertices.length < 3) {
    fail("MISSION_AREA_INVALID", path, "A mission area requires an ID and at least three vertices.", "Author a non-degenerate bounded polygon.");
  }
  const studyArea = getStudyArea(studyAreaId);
  let twiceArea = 0;
  area.vertices.forEach((point, index) => {
    exactRecord(point, ["longitude", "latitude"], `${path}.vertices[${index}]`);
    if (!Number.isFinite(point.longitude) || !Number.isFinite(point.latitude) || !isPointInsideStudyArea({ ...point, altitudeM: 0, verticalDatum: "MSL" }, studyArea)) {
      fail("MISSION_AREA_INVALID", `${path}.vertices[${index}]`, "Mission-area vertices must be finite and inside the selected study area.", "Move the polygon inside environment coverage.");
    }
    const next = area.vertices[(index + 1) % area.vertices.length];
    twiceArea += point.longitude * next.latitude - next.longitude * point.latitude;
  });
  if (Math.abs(twiceArea) < 1e-10) fail("MISSION_AREA_INVALID", path, "Mission-area vertices are degenerate.", "Author a polygon with non-zero area.");
}

function distanceM(left: MissionPosition, right: MissionPosition) {
  const lat = ((left.latitude + right.latitude) / 2) * Math.PI / 180;
  const east = (right.longitude - left.longitude) * 111_320 * Math.cos(lat);
  const north = (right.latitude - left.latitude) * 110_540;
  const up = right.altitude.valueM - left.altitude.valueM;
  return Math.hypot(east, north, up);
}

function constrainedSpeedMps(point: FlightPlanRoutePoint) {
  if (point.constraint.speed.kind === "TAS") return point.constraint.speed.valueMps;
  const altitudeM = Math.min(25_000, Math.max(0, point.position.altitude.valueM));
  const temperatureK = altitudeM <= 11_000 ? 288.15 - 0.0065 * altitudeM : 216.65;
  return point.constraint.speed.value * Math.sqrt(1.4 * 287.05 * temperatureK);
}

function validateMissionShape(value: unknown): asserts value is AirMissionDefinition {
  const rootKeys = ["schemaVersion", "id", "version", "objective", "side", "missionClass", "regime", "studyAreaId", "weatherPresetId", "assignedTargetIds", "flightPlans", "start", "assignments", "tasks", "policies", "fuel", "completionCondition", "abortCondition", "disengagementCondition", "recoveryCondition", "intendedUse", "provenance", "assumptions", "validityLimits"];
  exactRecord(value, rootKeys, "airMission");
  const mission = value as unknown as AirMissionDefinition;
  if (mission.schemaVersion !== AIR_MISSION_SCHEMA_VERSION || !nonEmptyText(mission.id) || !nonEmptyText(mission.version) || !nonEmptyText(mission.objective) || !["BLUE", "RED"].includes(mission.side) || !["TACTICAL_INTERCEPT", "COMBAT_AIR_PATROL", "FIGHTER_SWEEP", "ESCORT"].includes(mission.missionClass) || !["BVR", "WVR_BFM", "UNRESTRICTED_TRANSITION"].includes(mission.regime) || !nonEmptyText(mission.studyAreaId) || !nonEmptyText(mission.weatherPresetId)) {
    fail("MISSION_SCHEMA_INVALID", "airMission", "The Air mission identity, taxonomy, or objective is invalid.", "Select a supported class/regime and provide stable identity and objective.");
  }
  if (mission.side !== "BLUE") fail("MISSION_SIDE_UNSUPPORTED", "side", "The current Air mission runtime admits the BLUE launcher-side mission only.", "Author the BLUE launcher-side mission; RED-side mission mapping is not available in vector.air-mission.v1.");
  if (!Array.isArray(mission.assignedTargetIds) || mission.assignedTargetIds.length === 0 || mission.assignedTargetIds.some((id) => !nonEmptyText(id))) fail("MISSION_SCHEMA_INVALID", "assignedTargetIds", "Assigned targets require stable non-empty IDs.", "Select an existing target/contact identity.");
  if (!Array.isArray(mission.flightPlans) || !Array.isArray(mission.assignments) || !Array.isArray(mission.assumptions) || !Array.isArray(mission.validityLimits) || mission.assumptions.some((item) => !nonEmptyText(item)) || mission.validityLimits.some((item) => !nonEmptyText(item))) fail("MISSION_SCHEMA_INVALID", "airMission", "Mission collections must be explicit arrays with textual assumptions and validity limits.", "Author all required mission collections.");
  if (![mission.completionCondition, mission.abortCondition, mission.disengagementCondition, mission.recoveryCondition].every(nonEmptyText) || mission.intendedUse !== "PUBLIC_EDUCATIONAL") fail("MISSION_SCHEMA_INVALID", "airMission", "Mission conditions and intended use must be explicit.", "Provide completion, abort, disengagement, recovery, and intended-use fields.");

  mission.flightPlans.forEach((plan, planIndex) => {
    const planPath = `flightPlans[${planIndex}]`;
    exactRecord(plan, ["schemaVersion", "id", "routePoints", "legs"], planPath);
    if (plan.schemaVersion !== "vector.flight-plan.v1" || !nonEmptyText(plan.id) || !Array.isArray(plan.routePoints) || !Array.isArray(plan.legs)) fail("MISSION_SCHEMA_INVALID", planPath, "Flight-plan identity, points, or legs are malformed.", "Use vector.flight-plan.v1 with explicit point and leg arrays.");
    plan.routePoints.forEach((point, pointIndex) => {
      const pointPath = `${planPath}.routePoints[${pointIndex}]`;
      exactRecord(point, ["id", "position", "turnMethod", "acceptanceRadiusM", "constraint", "taskRef"], pointPath);
      exactRecord(point.position, ["longitude", "latitude", "altitude"], `${pointPath}.position`);
      exactRecord(point.position.altitude, ["valueM", "datum"], `${pointPath}.position.altitude`);
      if (!isRecord(point.constraint) || !("speed" in point.constraint) || !("locked" in point.constraint) || Object.keys(point.constraint).some((key) => !["speed", "etaSeconds", "totalTimeOnTargetSeconds", "locked"].includes(key))) {
        fail("MISSION_SCHEMA_INVALID", `${pointPath}.constraint`, "Route-point constraint contains missing or unknown fields.", "Use speed, optional ETA/TOT, and lock state only.");
      }
      if (!isRecord(point.constraint.speed)) fail("MISSION_SCHEMA_INVALID", `${pointPath}.constraint.speed`, "Speed constraint is malformed.", "Choose TAS metres per second or Mach.");
      const speedKeys = point.constraint.speed.kind === "TAS" ? ["kind", "valueMps"] : ["kind", "value"];
      exactRecord(point.constraint.speed, speedKeys, `${pointPath}.constraint.speed`);
      if (!nonEmptyText(point.id) || !["START", "FLY_BY", "FLY_OVER"].includes(point.turnMethod) || !Number.isFinite(point.acceptanceRadiusM) || point.acceptanceRadiusM < 1 || point.acceptanceRadiusM > 25_000 || (pointIndex === 0 && point.acceptanceRadiusM !== 1) || (point.turnMethod === "FLY_OVER" && point.acceptanceRadiusM !== 1) || (point.taskRef !== null && !nonEmptyText(point.taskRef)) || typeof point.constraint.locked !== "boolean" || !["MSL", "AGL"].includes(point.position.altitude.datum) || !["TAS", "MACH"].includes(point.constraint.speed.kind)) fail("MISSION_SCHEMA_INVALID", pointPath, "Route-point identity, turn, acceptance radius, datum, speed, lock, or task reference is invalid.", "Author an exact typed route point with a bounded radius; START and FLY_OVER use 1 metre.");
      const expectedTaskRef = pointIndex === 0 ? "MISSION_START" : mission.missionClass;
      if (point.taskRef !== null && point.taskRef !== expectedTaskRef) fail("MISSION_REFERENCE_UNKNOWN", `${pointPath}.taskRef`, "Route point references a missing or unrelated mission task.", `Reference ${expectedTaskRef} or leave the optional task reference empty.`);
    });
    plan.legs.forEach((leg, legIndex) => {
      const legPath = `${planPath}.legs[${legIndex}]`;
      exactRecord(leg, ["id", "fromPointId", "toPointId", "role"], legPath);
      if (!nonEmptyText(leg.id) || !nonEmptyText(leg.fromPointId) || !nonEmptyText(leg.toPointId) || !["DEPARTURE", "TRANSIT", "INGRESS", "INTERCEPT_ATTACK", "ON_STATION_PATROL", "REFUEL", "EGRESS", "RECOVERY", "DIVERT"].includes(leg.role)) fail("MISSION_SCHEMA_INVALID", legPath, "Flight-plan leg identity, endpoints, or role is invalid.", "Use an existing route-point pair and supported leg role.");
    });
  });

  if (!isRecord(mission.start) || !["AIRBORNE", "PARKING", "RUNWAY", "GROUND_ALERT_QRA"].includes(mission.start.posture)) fail("MISSION_SCHEMA_INVALID", "start", "Start posture is missing or unsupported.", "Select Airborne, Parking, Runway, or Ground alert/QRA.");
  if (mission.start.posture === "AIRBORNE") {
    exactRecord(mission.start, ["posture", "flightPlanId", "routePointId"], "start");
    if (!nonEmptyText(mission.start.flightPlanId) || !nonEmptyText(mission.start.routePointId)) fail("MISSION_SCHEMA_INVALID", "start", "Airborne start references are empty.", "Reference the first route point of an admitted flight plan.");
  } else {
    exactRecord(mission.start, ["posture", "installationId", "installationSourceId", "runway", "readinessDelaySeconds", "taxiFidelity", "takeoffCondition", "rejectedTakeoffCondition"], "start");
    exactRecord(mission.start.runway, ["id", "threshold", "end", "headingDeg", "lengthM", "widthM", "surface", "operationalState", "evidence"], "start.runway");
    for (const endpoint of ["threshold", "end"] as const) {
      exactRecord(mission.start.runway[endpoint], ["longitude", "latitude", "elevation"], `start.runway.${endpoint}`);
      exactRecord(mission.start.runway[endpoint].elevation, ["valueM", "datum"], `start.runway.${endpoint}.elevation`);
    }
    exactRecord(mission.start.runway.evidence, ["state", "sourceId", "digest"], "start.runway.evidence");
    if (!nonEmptyText(mission.start.installationId) || !nonEmptyText(mission.start.installationSourceId) || !nonEmptyText(mission.start.runway.id) || !nonEmptyText(mission.start.takeoffCondition) || !nonEmptyText(mission.start.rejectedTakeoffCondition) || mission.start.taxiFidelity !== "ABSTRACTED" || !["PAVED", "UNPAVED"].includes(mission.start.runway.surface) || !["OPEN", "CLOSED"].includes(mission.start.runway.operationalState) || !["SOURCED", "CALIBRATED", "MODEL_ASSUMPTION", "USER_AUTHORED", "UNKNOWN"].includes(mission.start.runway.evidence.state)) fail("MISSION_SCHEMA_INVALID", "start", "Ground-start identity, runway taxonomy, conditions, or fidelity is invalid.", "Provide exact installation, runway, evidence, takeoff conditions, and taxi-fidelity values.");
  }

  mission.assignments.forEach((assignment, index) => {
    const path = `assignments[${index}]`;
    exactRecord(assignment, ["id", "flightPlanId", "aircraftId", "aircraftModelPackDigest", "initialFuelPercent", "loadout", "groundCompatibility"], path);
    exactRecord(assignment.loadout, ["schemaVersion", "stores", "compatibility"], `${path}.loadout`);
    exactRecord(assignment.groundCompatibility, ["schemaVersion", "envelopeId", "envelopeDigest"], `${path}.groundCompatibility`);
    if (!Array.isArray(assignment.loadout.stores)) fail("MISSION_SCHEMA_INVALID", path, "Assignment stores must be an explicit array.", "Author an exact compiled-model-pack loadout binding.");
    assignment.loadout.stores.forEach((store, storeIndex) => exactRecord(store, ["stationId", "weaponId", "quantity", "compatibilityRuleId"], `${path}.loadout.stores[${storeIndex}]`));
    if (!nonEmptyText(assignment.id) || !nonEmptyText(assignment.flightPlanId) || !nonEmptyText(assignment.aircraftId) || !/^[0-9a-f]{64}$/.test(assignment.aircraftModelPackDigest) || assignment.loadout.schemaVersion !== "vector.loadout-plan.v1" || assignment.loadout.compatibility !== "COMPILED_MODEL_PACK" || assignment.groundCompatibility.schemaVersion !== "vector.aircraft-ground-envelope-binding.v1" || !nonEmptyText(assignment.groundCompatibility.envelopeId) || !/^[0-9a-f]{64}$/.test(assignment.groundCompatibility.envelopeDigest)) fail("MISSION_SCHEMA_INVALID", path, "Assignment identity, model binding, loadout, or ground-envelope binding is invalid.", "Bind one exact flight, aircraft model pack, loadout, and content-addressed assumption envelope.");
  });

  exactRecord(mission.policies, ["emission", "weapon", "deterministicPolicyVersion"], "policies");
  exactRecord(mission.fuel, ["reservePercent", "weaponRtbThreshold", "recoveryInstallationId", "divertInstallationId"], "fuel");
  exactRecord(mission.provenance, ["valueState", "sourceIds"], "provenance");
  if (!["ACTIVE", "SILENT"].includes(mission.policies.emission) || !["HOLD", "TIGHT", "FREE_WITHIN_BOUNDARY"].includes(mission.policies.weapon) || mission.policies.deterministicPolicyVersion !== "vector.air-mission-policy.v1" || !Array.isArray(mission.provenance.sourceIds) || mission.provenance.sourceIds.some((id) => !nonEmptyText(id)) || !["MODEL_ASSUMPTION", "USER_AUTHORED"].includes(mission.provenance.valueState)) fail("MISSION_SCHEMA_INVALID", "policies", "Policy or provenance taxonomy is invalid.", "Use the supported deterministic policy and explicit provenance classification.");

  if (!isRecord(mission.tasks) || !["TACTICAL_INTERCEPT", "COMBAT_AIR_PATROL", "FIGHTER_SWEEP", "ESCORT"].includes(mission.tasks.kind)) fail("MISSION_CLASS_FIELDS_MISMATCH", "tasks", "Mission-specific fields are missing or unsupported.", "Author the required task object for the selected mission class.");
  if (mission.tasks.kind !== mission.missionClass) fail("MISSION_CLASS_FIELDS_MISMATCH", "tasks.kind", "Mission-specific fields do not match the selected class.", "Load or author the required fields for the selected mission class.");
  const taskKeys: Record<AirMissionClass, readonly string[]> = {
    TACTICAL_INTERCEPT: ["kind", "defendedArea", "contactCategory", "initialTrackSource", "initialTrackUncertaintyM", "trigger", "objective", "commitCondition", "abortCondition", "disengageCondition"],
    COMBAT_AIR_PATROL: ["kind", "patrolArea", "prosecutionArea", "onStationCount", "flightSize", "patrolPattern", "onStationMinutes", "relief", "investigationLimitM", "prosecutionLimitM", "completionCondition"],
    FIGHTER_SWEEP: ["kind", "sweepArea", "targetWindow", "formation", "contactCategories", "engagementBoundary", "supportRelationship", "completionCondition"],
    ESCORT: ["kind", "protectedPackageId", "joinUpPointId", "joinUpTimeSeconds", "escortGeometry", "threatResponseRadiusM", "investigatorCount", "engagerCount", "splitRejoinPolicy", "detachCondition", "completionCondition"],
  };
  exactRecord(mission.tasks, taskKeys[mission.tasks.kind], "tasks");
}

export function compileAirMissionDefinition(
  input: AirMissionDefinition,
  context: { scenario: MissionScenario; modelPack: Readonly<CompiledModelPack>; environmentPackDigest: string; environmentPack?: Readonly<EnvironmentPack> },
): CompiledAirMission {
  if (input?.schemaVersion !== AIR_MISSION_SCHEMA_VERSION) fail("MISSION_SCHEMA_UNSUPPORTED", "schemaVersion", "The Air mission schema version is unsupported.", `Use ${AIR_MISSION_SCHEMA_VERSION}.`);
  const mission: unknown = structuredClone(input);
  validateMissionShape(mission);
  const modelPackDigest = context.modelPack.digest;
  if (mission.studyAreaId !== context.scenario.studyAreaId) fail("MISSION_ENVIRONMENT_MISMATCH", "studyAreaId", "Mission study area does not match the admitted scenario environment.", "Select the exact authored environment identity.");
  if (mission.weatherPresetId !== context.scenario.weatherPresetId) fail("MISSION_ENVIRONMENT_MISMATCH", "weatherPresetId", "Mission weather preset does not match the admitted scenario environment.", "Select the exact authored weather identity.");
  if (!context.scenario.spatialPlan) fail("MISSION_ROUTE_INVALID", "spatialPlan", "An Air mission requires an explicit geographic spatial plan.", "Author both aircraft start positions and routes.");
  if (mission.flightPlans.length !== 1 || mission.assignments.length !== 1) fail("MISSION_REFERENCE_UNKNOWN", "flightPlans", "The current Air runtime requires exactly one flight plan and one assignment.", "Author one admitted flight; multi-flight execution remains unsupported and is not silently truncated.");

  const flightIds = new Set<string>();
  mission.flightPlans.forEach((plan, planIndex) => {
    if (plan.schemaVersion !== "vector.flight-plan.v1" || !plan.id || flightIds.has(plan.id) || plan.routePoints.length < 2) fail("MISSION_ROUTE_INVALID", `flightPlans[${planIndex}]`, "Flight plans require a unique ID and at least two route points.", "Author an ordered, non-zero route.");
    if (planIndex === 0 && plan.routePoints.length !== context.scenario.spatialPlan!.blue.route.length) fail("MISSION_ROUTE_START_MISMATCH", `flightPlans[${planIndex}].routePoints`, "The Air mission and compatibility spatial projection have different route cardinality.", "Edit the flight plan through the single Air mission route adapter.");
    flightIds.add(plan.id);
    const pointIds = new Set<string>();
    plan.routePoints.forEach((point, pointIndex) => {
      const path = `flightPlans[${planIndex}].routePoints[${pointIndex}]`;
      if (!point.id || pointIds.has(point.id)) fail("MISSION_ROUTE_INVALID", `${path}.id`, "Route-point IDs must be unique and stable.", "Assign each point a unique ID.");
      pointIds.add(point.id);
      if (point.position.altitude.datum === "AGL") fail("MISSION_TERRAIN_REQUIRED", `${path}.position.altitude.datum`, "AGL flight-plan points require admitted terrain sampling.", "Use MSL or admit an exact terrain dataset and conversion.");
      if (!Number.isFinite(point.position.longitude) || !Number.isFinite(point.position.latitude) || !Number.isFinite(point.position.altitude.valueM) || point.position.altitude.valueM < 0) fail("MISSION_ROUTE_INVALID", `${path}.position`, "Route-point coordinates and altitude must be finite.", "Provide WGS84 longitude/latitude and non-negative metres MSL.");
      if (!isPointInsideStudyArea({ longitude: point.position.longitude, latitude: point.position.latitude, altitudeM: point.position.altitude.valueM, verticalDatum: point.position.altitude.datum }, getStudyArea(mission.studyAreaId))) fail("MISSION_ROUTE_INVALID", `${path}.position`, "Route point is outside the admitted environment coverage.", "Move the WGS84 point inside the selected study area.");
      const speed = constrainedSpeedMps(point);
      if (!Number.isFinite(speed) || speed <= 0) fail("MISSION_ROUTE_INVALID", `${path}.constraint.speed`, "Route speed must be finite and positive.", "Provide TAS in m/s or positive Mach.");
      if (pointIndex > 0) {
        const previous = plan.routePoints[pointIndex - 1];
        if (distanceM(previous.position, point.position) <= 1) fail("MISSION_ROUTE_INVALID", `${path}.position`, "A route leg must be longer than one metre.", "Move or remove the duplicate route point.");
        if (point.constraint.etaSeconds !== undefined) {
          const tas = constrainedSpeedMps(point);
          const minimum = distanceM(previous.position, point.position) / tas;
          if (!Number.isFinite(point.constraint.etaSeconds) || point.constraint.etaSeconds <= minimum) fail("MISSION_TIME_CONSTRAINT_IMPOSSIBLE", `${path}.constraint.etaSeconds`, "ETA is earlier than the leg can be flown at its declared speed.", "Increase ETA or speed within the admitted model envelope.");
        }
        if (point.constraint.totalTimeOnTargetSeconds !== undefined && (!Number.isFinite(point.constraint.totalTimeOnTargetSeconds) || point.constraint.totalTimeOnTargetSeconds < 0 || (point.constraint.etaSeconds !== undefined && point.constraint.totalTimeOnTargetSeconds < point.constraint.etaSeconds))) {
          fail("MISSION_TIME_CONSTRAINT_IMPOSSIBLE", `${path}.constraint.totalTimeOnTargetSeconds`, "TOT must be finite, non-negative, and no earlier than ETA.", "Correct the model-time ETA/TOT sequence.");
        }
      }
      if (planIndex === 0) {
        const authoredPoint = context.scenario.spatialPlan!.blue.route[pointIndex];
        const authoredTransition = context.scenario.spatialPlan!.blue.routeWaypointTransitions?.[pointIndex]
          ?? (pointIndex === 0 ? "START" : "FLY_BY");
        const authoredRadiusM = context.scenario.spatialPlan!.blue.routeAcceptanceRadiiM[pointIndex];
        if (!authoredPoint || Math.abs(point.position.longitude - authoredPoint.longitude) > 1e-9 || Math.abs(point.position.latitude - authoredPoint.latitude) > 1e-9 || Math.abs(point.position.altitude.valueM - authoredPoint.altitudeM) > 1e-6 || point.turnMethod !== authoredTransition) {
          fail("MISSION_ROUTE_START_MISMATCH", `${path}.position`, "Mission flight-plan geometry or turn method disagrees with the authored spatial route.", "Edit route geometry and transitions through the Air mission adapter.");
        }
        if (point.acceptanceRadiusM !== authoredRadiusM) fail("MISSION_ROUTE_START_MISMATCH", `${path}.acceptanceRadiusM`, "Mission flight-plan acceptance radius disagrees with the compatibility spatial projection.", "Edit the radius through the single Air mission route adapter.");
        if (Math.abs(constrainedSpeedMps(point) - context.scenario.spatialPlan!.blue.speedMps) > 1e-6) {
          fail("MISSION_ROUTE_INVALID", `${path}.constraint.speed`, "Resolved flight-plan speed must equal the assigned spatial-route speed.", "Edit TAS or Mach through the Air mission flight plan.");
        }
      }
    });
    if (plan.legs.length !== plan.routePoints.length - 1) fail("MISSION_ROUTE_INVALID", `flightPlans[${planIndex}].legs`, "Flight-plan legs must connect every adjacent route point exactly once.", "Create one ordered leg per route segment.");
    plan.legs.forEach((leg, legIndex) => {
      if (!leg.id || !pointIds.has(leg.fromPointId) || !pointIds.has(leg.toPointId) || leg.fromPointId === leg.toPointId) fail("MISSION_REFERENCE_UNKNOWN", `flightPlans[${planIndex}].legs[${legIndex}]`, "A flight-plan leg references a missing or identical endpoint.", "Reference two distinct route-point IDs.");
      if (leg.fromPointId !== plan.routePoints[legIndex]?.id || leg.toPointId !== plan.routePoints[legIndex + 1]?.id) fail("MISSION_REFERENCE_UNKNOWN", `flightPlans[${planIndex}].legs[${legIndex}]`, "Flight-plan legs must follow route-point order without cycles or skips.", "Create one ordered leg between each adjacent route point.");
    });
  });

  const assignmentIds = new Set<string>();
  mission.assignments.forEach((assignment, index) => {
    const path = `assignments[${index}]`;
    if (!assignment.id || assignmentIds.has(assignment.id) || !flightIds.has(assignment.flightPlanId)) fail("MISSION_REFERENCE_UNKNOWN", path, "Flight assignment identity or flight-plan reference is invalid.", "Use unique assignment and existing flight-plan IDs.");
    assignmentIds.add(assignment.id);
    if (assignment.aircraftModelPackDigest !== modelPackDigest) fail("MISSION_MODEL_PACK_MISMATCH", `${path}.aircraftModelPackDigest`, "Flight assignment model-pack digest is not the admitted digest.", "Recompile the mission against the selected immutable model pack.");
    if (assignment.aircraftId !== context.scenario.bluePlatformId) fail("MISSION_MODEL_PACK_MISMATCH", `${path}.aircraftId`, "Flight assignment aircraft identity does not match the scenario selection.", "Select the assigned compiled aircraft.");
    if (!Number.isFinite(assignment.initialFuelPercent) || assignment.initialFuelPercent <= 0 || assignment.initialFuelPercent > 100) fail("MISSION_FUEL_INVALID", `${path}.initialFuelPercent`, "Initial fuel must be finite and in (0, 100] percent.", "Choose a physically bounded initial fuel state.");
    if (assignment.initialFuelPercent !== context.scenario.blueFuelPercent) fail("MISSION_FUEL_INVALID", `${path}.initialFuelPercent`, "Mission fuel disagrees with the scenario fuel input.", "Edit fuel through the mission assignment.");
    if (assignment.loadout.schemaVersion !== "vector.loadout-plan.v1" || assignment.loadout.compatibility !== "COMPILED_MODEL_PACK" || assignment.loadout.stores.length !== 1) fail("MISSION_LOADOUT_INVALID", `${path}.loadout`, "The current assignment requires one compiled-model-pack loadout entry.", "Choose the one admitted compatible weapon/station entry.");
    let resolvedConfiguration: ReturnType<typeof resolveAircraftConfiguration> | undefined;
    assignment.loadout.stores.forEach((store, storeIndex) => {
      if (store.weaponId !== context.scenario.blueSystemId) fail("MISSION_LOADOUT_INVALID", `${path}.loadout.stores[${storeIndex}].weaponId`, "Loadout store identity disagrees with the compiled scenario.", "Select the exact compiled weapon identity.");
      if (store.quantity !== context.scenario.blueWeaponQuantity) fail("MISSION_LOADOUT_INVALID", `${path}.loadout.stores[${storeIndex}].quantity`, "Loadout quantity disagrees with the compiled scenario.", "Select the exact positive compiled quantity.");
      resolvedConfiguration = resolveAircraftConfiguration({
        pack: context.modelPack,
        aircraftId: assignment.aircraftId,
        weaponId: store.weaponId,
        quantity: store.quantity,
        stationId: store.stationId,
        compatibilityRuleId: store.compatibilityRuleId,
      });
    });
    if (!resolvedConfiguration || assignment.groundCompatibility.envelopeId !== resolvedConfiguration.groundEnvelope.id || assignment.groundCompatibility.envelopeDigest !== resolvedConfiguration.groundEnvelope.digest) fail("MISSION_RUNWAY_INVALID", `${path}.groundCompatibility`, "The authored ground-envelope binding does not match the immutable compiled MODEL_ASSUMPTION resolver.", "Rebind the mission to the exact admitted model-pack digest and aircraft identity; authored performance values are not accepted.");
  });
  if (!Number.isFinite(mission.fuel.reservePercent) || mission.fuel.reservePercent < 0 || mission.fuel.reservePercent > 100) fail("MISSION_FUEL_INVALID", "fuel.reservePercent", "Fuel reserve must be from 0 to 100 percent.", "Provide an explicit bounded reserve.");
  if (!Number.isInteger(mission.fuel.weaponRtbThreshold) || mission.fuel.weaponRtbThreshold < 0 || mission.fuel.weaponRtbThreshold > context.scenario.blueWeaponQuantity) fail("MISSION_FUEL_INVALID", "fuel.weaponRtbThreshold", "Weapon RTB threshold must be a bounded store count.", "Choose an integer from zero through the admitted loadout quantity.");
  if (mission.assignments.some((assignment) => assignment.initialFuelPercent <= mission.fuel.reservePercent)) fail("MISSION_FUEL_RESERVE_INSUFFICIENT", "fuel.reservePercent", "Initial fuel does not exceed the declared reserve.", "Increase initial fuel or reduce the reserve after reviewing recovery needs.");
  if (new Set(mission.assignedTargetIds).size !== mission.assignedTargetIds.length || mission.assignedTargetIds.length !== 1 || mission.assignedTargetIds[0] !== "red-object-1") fail("MISSION_REFERENCE_UNKNOWN", "assignedTargetIds", "The assigned target is missing, duplicated, or not present in the compiled scenario.", "Select the exact compiled target identity.");
  for (const field of ["recoveryInstallationId", "divertInstallationId"] as const) {
    const installationId = mission.fuel[field];
    if (installationId === null) continue;
    const installation = PUBLIC_INSTALLATIONS.find((item) => item.id === installationId);
    const packed = context.environmentPack?.content.installations.find((item) => item.id === installationId);
    if (!installation || !packed || !isPointInsideStudyArea({ longitude: installation.longitude, latitude: installation.latitude, altitudeM: 0, verticalDatum: "MSL" }, getStudyArea(mission.studyAreaId))) fail("MISSION_INSTALLATION_UNKNOWN", `fuel.${field}`, "Recovery/divert installation is unknown or outside the admitted environment coverage.", "Select an exact installation identity inside the selected study area or leave it explicitly unassigned.");
  }

  const firstPlan = mission.flightPlans[0];
  const firstPoint = firstPlan.routePoints[0];
  const authoredStart = context.scenario.spatialPlan.blue.position;
  if (Math.abs(firstPoint.position.longitude - authoredStart.longitude) > 1e-9 || Math.abs(firstPoint.position.latitude - authoredStart.latitude) > 1e-9 || Math.abs(firstPoint.position.altitude.valueM - authoredStart.altitudeM) > 1e-6) fail("MISSION_ROUTE_START_MISMATCH", "flightPlans[0].routePoints[0].position", "The mission flight-plan start disagrees with authored placement.", "Edit placement through the mission flight plan.");

  let start: CompiledAirMission["start"];
  if (mission.start.posture === "AIRBORNE") {
    if (mission.start.flightPlanId !== firstPlan.id || mission.start.routePointId !== firstPoint.id) fail("MISSION_REFERENCE_UNKNOWN", "start", "Airborne start must reference the first point of its assigned flight plan.", "Reference the exact flight plan and start point.");
    const studyArea = getStudyArea(mission.studyAreaId);
    if (firstPoint.position.altitude.valueM <= studyArea.surfaceElevationM) fail("MISSION_TERRAIN_REQUIRED", "start.routePointId", "Airborne start must be above the admitted MSL reference surface.", "Increase start altitude or author an admitted ground start.");
    start = { posture: "AIRBORNE", entryState: "AIRBORNE", position: firstPoint.position, initialSpeedMps: constrainedSpeedMps(firstPoint), headingSource: "FLIGHT_PLAN_FIRST_LEG", runwayHeadingDegTrue: null };
  } else {
    const groundStart = mission.start;
    const installation = PUBLIC_INSTALLATIONS.find((item) => item.id === groundStart.installationId);
    if (!installation) fail("MISSION_INSTALLATION_UNKNOWN", "start.installationId", "Ground start references an unknown installation.", "Select an installation inside the admitted environment pack.");
    const packedInstallation = context.environmentPack?.content.installations.find((item) => item.id === groundStart.installationId);
    if (!packedInstallation || packedInstallation.sourceId !== groundStart.installationSourceId || installation.sourceId !== groundStart.installationSourceId) fail("MISSION_INSTALLATION_UNKNOWN", "start.installationSourceId", "Ground start installation/source identity is not present in the admitted environment pack.", "Select the exact installation and source identity from the frozen environment pack.");
    const runway = groundStart.runway;
    if (runway.evidence.state === "UNKNOWN" || !runway.evidence.sourceId || !/^[0-9a-f]{64}$/.test(runway.evidence.digest)) fail("MISSION_RUNWAY_EVIDENCE_MISSING", "start.runway.evidence", "Ground/runway start requires exact runway evidence identity.", "Admit a source, calibrated artifact, explicit model assumption, or user-authored artifact with SHA-256 identity.");
    const { evidence, ...runwayMaterial } = runway;
    if (evidence.digest !== runwayEvidenceDigest(runwayMaterial, evidence)) fail("MISSION_RUNWAY_EVIDENCE_MISSING", "start.runway.evidence.digest", "Runway evidence digest does not bind the exact geometry and classification.", "Recompute vector.runway-evidence.v1 after every runway edit.");
    let admittedRunways: RunwayGeometry[];
    try {
      if (!context.environmentPack) throw new TypeError("Environment pack unavailable.");
      admittedRunways = (["FORWARD", "RECIPROCAL"] as const).map((direction) =>
        bindAdmittedEnvironmentRunway({
          environmentPack: context.environmentPack!,
          installationId: groundStart.installationId,
          runwayId: runway.id,
          direction,
        }),
      );
    } catch {
      fail("MISSION_RUNWAY_INVALID", "start.runway.id", "Ground start does not resolve to an eligible runway in the exact environment pack.", "Select an eligible sourced runway exposed by the selected environment pack.");
    }
    const heading = runway.headingDeg;
    if (runway.operationalState !== "OPEN") fail("MISSION_RUNWAY_INVALID", "start.runway.operationalState", "A closed runway cannot admit a ground start.", "Select an open runway artifact or use an airborne start.");
    if (!Number.isFinite(heading) || heading < 0 || heading >= 360 || !Number.isFinite(runway.lengthM) || runway.lengthM <= 0 || !Number.isFinite(runway.widthM) || runway.widthM <= 0 || runway.threshold.elevation.datum !== "MSL" || runway.end.elevation.datum !== "MSL") fail("MISSION_RUNWAY_INVALID", "start.runway", "Runway geometry, dimensions, heading, or MSL datum is invalid.", "Provide finite WGS84 threshold/end geometry and explicit metres MSL.");
    const area = getStudyArea(mission.studyAreaId);
    for (const [name, point] of [["threshold", runway.threshold], ["end", runway.end]] as const) {
      if (!isPointInsideStudyArea({ longitude: point.longitude, latitude: point.latitude, altitudeM: point.elevation.valueM, verticalDatum: "MSL" }, area)) fail("MISSION_RUNWAY_INVALID", `start.runway.${name}`, "Runway geometry is outside environment coverage.", "Select a runway fully covered by the admitted environment pack.");
    }
    if (
      Math.abs(runway.threshold.longitude - firstPoint.position.longitude) > 1e-9 ||
      Math.abs(runway.threshold.latitude - firstPoint.position.latitude) > 1e-9 ||
      Math.abs(runway.threshold.elevation.valueM - firstPoint.position.altitude.valueM) > 1e-6
    ) {
      fail("MISSION_ROUTE_START_MISMATCH", "start.runway.threshold", "Ground/runway start must be the first flight-plan point.", "Begin the flight plan at the admitted runway threshold; ground starts may not teleport airborne.");
    }
    const runwayEndPosition: MissionPosition = { longitude: runway.end.longitude, latitude: runway.end.latitude, altitude: runway.end.elevation };
    const geometricLengthM = distanceM({ longitude: runway.threshold.longitude, latitude: runway.threshold.latitude, altitude: runway.threshold.elevation }, runwayEndPosition);
    if (Math.abs(geometricLengthM - runway.lengthM) > Math.max(25, runway.lengthM * 0.15)) fail("MISSION_RUNWAY_INVALID", "start.runway.lengthM", "Declared runway length disagrees with threshold/end geometry.", "Correct the WGS84 endpoints or declared metres.");
    const east = (runway.end.longitude - runway.threshold.longitude) * Math.cos(runway.threshold.latitude * Math.PI / 180);
    const north = runway.end.latitude - runway.threshold.latitude;
    const geometricHeading = (Math.atan2(east, north) * 180 / Math.PI + 360) % 360;
    const headingDelta = Math.abs(((heading - geometricHeading + 540) % 360) - 180);
    if (headingDelta > 5) fail("MISSION_RUNWAY_INVALID", "start.runway.headingDeg", "Runway heading disagrees with threshold/end geometry.", "Use the WGS84-derived takeoff direction.");
    const assignment = mission.assignments[0];
    const store = assignment.loadout.stores[0];
    const groundEnvelope = resolveAircraftConfiguration({ pack: context.modelPack, aircraftId: assignment.aircraftId, weaponId: store.weaponId, quantity: store.quantity, stationId: store.stationId, compatibilityRuleId: store.compatibilityRuleId }).groundEnvelope;
    if (runway.lengthM < groundEnvelope.minimumRunwayLengthM) fail("MISSION_RUNWAY_INVALID", "start.runway.lengthM", "Runway is shorter than the assigned aircraft ground envelope.", "Choose a longer runway or a different admitted aircraft configuration.");
    if (!groundEnvelope.compatibleSurfaces.includes(runway.surface)) fail("MISSION_RUNWAY_INVALID", "start.runway.surface", "Runway surface is incompatible with the assigned aircraft ground envelope.", "Choose a compatible surface.");
    if (!Number.isFinite(groundStart.readinessDelaySeconds) || groundStart.readinessDelaySeconds < 0) fail("MISSION_RUNWAY_INVALID", "start.readinessDelaySeconds", "Readiness delay must be finite and non-negative.", "Provide seconds from model start.");
    const runwayEnginePosition = geographicToEnginePosition({
      longitude: runway.threshold.longitude,
      latitude: runway.threshold.latitude,
      altitudeM: runway.threshold.elevation.valueM,
      verticalDatum: "MSL",
    }, area);
    let effectiveWind: { x: number; y: number };
    try {
      effectiveWind = createEnvironmentSampler(context.environmentPack!).sample({
        eastM: runwayEnginePosition.x,
        northM: runwayEnginePosition.y,
        upM: runway.threshold.elevation.valueM,
        modelTimeSeconds: groundStart.readinessDelaySeconds,
      }).windEnuMps;
    } catch {
      fail("MISSION_RUNWAY_INVALID", "start.runway.headingDeg", "The admitted environment has no valid wind sample at the runway threshold and mission start time.", "Select a runway and start time inside the exact EnvironmentPack coverage and validity interval.");
    }
    const headingRad = heading * Math.PI / 180;
    const tailwindMps = effectiveWind!.x * Math.sin(headingRad) + effectiveWind!.y * Math.cos(headingRad);
    if (tailwindMps > groundEnvelope.maximumTailwindMps) fail("MISSION_RUNWAY_INVALID", "start.runway.headingDeg", "Tailwind exceeds the assigned aircraft ground envelope.", "Reverse takeoff direction, select another runway, or change admitted weather.");
    if (!admittedRunways!.some((admittedRunway) =>
      sha256HexSync(runway) === sha256HexSync(admittedRunway)
    )) {
      fail("MISSION_RUNWAY_INVALID", "start.runway", "Ground-start runway fields or provenance differ from the exact admitted environment artifact.", "Rebind the ground start from the selected immutable environment pack; authored runway substitutions are rejected.");
    }
    start = {
      posture: groundStart.posture,
      entryState: "GROUND",
      position: { longitude: runway.threshold.longitude, latitude: runway.threshold.latitude, altitude: runway.threshold.elevation },
      initialSpeedMps: 0,
      headingSource: "RUNWAY_TRUE_HEADING",
      runwayHeadingDegTrue: runway.headingDeg,
    };
  }

  switch (mission.tasks.kind) {
    case "TACTICAL_INTERCEPT":
      validateArea(mission.tasks.defendedArea, "tasks.defendedArea", mission.studyAreaId);
      if (mission.tasks.contactCategory !== "HOSTILE_AIR_CONTACT" || !["ONBOARD_RADAR", "DATALINK", "AIRBORNE_EARLY_WARNING", "VISUAL"].includes(mission.tasks.initialTrackSource) || !Number.isFinite(mission.tasks.initialTrackUncertaintyM) || mission.tasks.initialTrackUncertaintyM < 0 || mission.tasks.trigger !== "CONTACT_ENTERS_DEFENDED_AREA" || mission.tasks.objective !== "IDENTIFY_SHADOW_OR_ENGAGE" || ![mission.tasks.commitCondition, mission.tasks.abortCondition, mission.tasks.disengageCondition].every(nonEmptyText)) fail("MISSION_CLASS_FIELDS_MISMATCH", "tasks", "Tactical Intercept requires a bounded track, trigger, objective, and explicit commit/abort/disengage conditions.", "Author every Tactical Intercept task field.");
      break;
    case "COMBAT_AIR_PATROL":
      validateArea(mission.tasks.patrolArea, "tasks.patrolArea", mission.studyAreaId);
      if (mission.tasks.prosecutionArea) validateArea(mission.tasks.prosecutionArea, "tasks.prosecutionArea", mission.studyAreaId);
      if (!Number.isInteger(mission.tasks.onStationCount) || mission.tasks.onStationCount <= 0 || !Number.isInteger(mission.tasks.flightSize) || mission.tasks.flightSize <= 0 || mission.tasks.onStationCount > mission.tasks.flightSize || !Number.isFinite(mission.tasks.onStationMinutes) || mission.tasks.onStationMinutes <= 0 || mission.tasks.patrolPattern !== "RACETRACK" || mission.tasks.relief !== "FUEL_OR_TIME" || !Number.isFinite(mission.tasks.investigationLimitM) || mission.tasks.investigationLimitM <= 0 || !Number.isFinite(mission.tasks.prosecutionLimitM) || mission.tasks.prosecutionLimitM < mission.tasks.investigationLimitM || !nonEmptyText(mission.tasks.completionCondition)) fail("MISSION_CLASS_FIELDS_MISMATCH", "tasks", "CAP geometry, staffing, duration, relief, investigation/prosecution limits, and completion must be valid.", "Provide visible CAP task values with on-station count within flight size and prosecution at least as large as investigation.");
      break;
    case "FIGHTER_SWEEP":
      validateArea(mission.tasks.sweepArea, "tasks.sweepArea", mission.studyAreaId);
      validateArea(mission.tasks.engagementBoundary, "tasks.engagementBoundary", mission.studyAreaId);
      exactRecord(mission.tasks.targetWindow, ["startsSeconds", "endsSeconds"], "tasks.targetWindow");
      if (!Number.isFinite(mission.tasks.targetWindow.startsSeconds) || mission.tasks.targetWindow.startsSeconds < 0 || !Number.isFinite(mission.tasks.targetWindow.endsSeconds) || mission.tasks.targetWindow.endsSeconds <= mission.tasks.targetWindow.startsSeconds || mission.tasks.formation !== "PAIR" || !Array.isArray(mission.tasks.contactCategories) || mission.tasks.contactCategories.length !== 1 || mission.tasks.contactCategories[0] !== "HOSTILE_AIR_CONTACT" || mission.tasks.supportRelationship !== "MUTUAL_SUPPORT" || !nonEmptyText(mission.tasks.completionCondition)) fail("MISSION_CLASS_FIELDS_MISMATCH", "tasks", "Fighter Sweep requires a valid target window, formation, contact category, support relationship, and completion.", "Author every Fighter Sweep task field.");
      break;
    case "ESCORT":
      if (mission.tasks.protectedPackageId !== "red-object-1" || !firstPlan.routePoints.some((point) => point.id === (mission.tasks as Extract<AirMissionTasks, { kind: "ESCORT" }>).joinUpPointId)) fail("MISSION_REFERENCE_UNKNOWN", "tasks.joinUpPointId", "Escort join-up must reference the compiled protected package and a route point.", "Select the exact existing package and join-up point.");
      if (!Number.isFinite(mission.tasks.joinUpTimeSeconds) || mission.tasks.joinUpTimeSeconds < 0 || mission.tasks.escortGeometry !== "BRACKET" || !Number.isFinite(mission.tasks.threatResponseRadiusM) || mission.tasks.threatResponseRadiusM <= 0 || !Number.isInteger(mission.tasks.investigatorCount) || mission.tasks.investigatorCount < 0 || !Number.isInteger(mission.tasks.engagerCount) || mission.tasks.engagerCount <= 0 || mission.tasks.splitRejoinPolicy !== "REJOIN_AFTER_RESPONSE" || !nonEmptyText(mission.tasks.detachCondition) || !nonEmptyText(mission.tasks.completionCondition)) fail("MISSION_CLASS_FIELDS_MISMATCH", "tasks", "Escort requires valid join-up timing, geometry, response radius, allocation, split/rejoin, detach, and completion fields.", "Author every Escort task field.");
      break;
  }

  const authoredDigest = sha256HexSync(mission);
  const withoutDigest = {
    schemaVersion: COMPILED_AIR_MISSION_SCHEMA_VERSION,
    id: mission.id,
    version: mission.version,
    authoredDigest,
    modelPackDigest,
    environmentPackDigest: context.environmentPackDigest,
    authored: mission,
    flightPlan: structuredClone(mission.flightPlans[0]),
    assignment: {
      id: mission.assignments[0].id,
      flightPlanId: mission.assignments[0].flightPlanId,
      aircraftId: mission.assignments[0].aircraftId,
      initialFuelPercent: mission.assignments[0].initialFuelPercent,
      loadout: structuredClone(mission.assignments[0].loadout.stores),
      groundEnvelope: resolveAircraftConfiguration({
        pack: context.modelPack,
        aircraftId: mission.assignments[0].aircraftId,
        weaponId: mission.assignments[0].loadout.stores[0].weaponId,
        quantity: mission.assignments[0].loadout.stores[0].quantity,
        stationId: mission.assignments[0].loadout.stores[0].stationId,
        compatibilityRuleId: mission.assignments[0].loadout.stores[0].compatibilityRuleId,
      }).groundEnvelope,
    },
    policies: structuredClone(mission.policies),
    start,
  };
  return Object.freeze({ ...withoutDigest, compiledDigest: sha256HexSync(withoutDigest) });
}

export function isAirMissionDefinition(value: unknown): value is AirMissionDefinition {
  try {
    validateMissionShape(value);
    return true;
  } catch {
    return false;
  }
}
