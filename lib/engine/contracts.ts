import type {
  EngagementDomain,
  Guidance,
  Maneuver,
  Vec3,
} from "./primitives.ts";
import type { ScenarioModelPatch } from "../model-pack.ts";
import type {
  CoverageBasis,
  GeographicEntityState,
  RecordedGeographicPosition,
  ScenarioOrigin,
} from "../geospatial/contracts.ts";
import type { SyntheticEnvironmentManifest } from "../geospatial/synthetic-environment.ts";

export type EntityKind =
  | "AIRCRAFT"
  | "GUIDED_WEAPON"
  | "AIR_DEFENCE_SYSTEM"
  | "RADAR"
  | "SURFACE_LAUNCHER"
  | "BASE"
  | "FIXED_OBJECTIVE";

export type TacticalSymbolRole =
  | "FIGHTER"
  | "BOMBER"
  | "TRANSPORT"
  | "AEW_C"
  | "TANKER"
  | "HELICOPTER"
  | "UAV"
  | "GUIDED_MISSILE"
  | "RADAR"
  | "SAM_SYSTEM"
  | "SURFACE_LAUNCHER"
  | "AIR_BASE"
  | "FIXED_OBJECTIVE";

export type Affiliation = "BLUE" | "RED" | "NEUTRAL";
export type EngineBackendId = "typescript" | "rust-wasm";
export type EntityLifecycle =
  | "STOWED"
  | "ACTIVE"
  | "TRACKING"
  | "ENGAGING"
  | "TERMINATED";

export type ModelValueState =
  | "SOURCED"
  | "MODEL_ASSUMPTION"
  | "USER_PROVIDED"
  | "UNKNOWN";

export type EngineEntityDefinition = {
  id: string;
  rddfId: string;
  designation: string;
  callsign: string;
  affiliation: Affiliation;
  kind: EntityKind;
  symbolRole: TacticalSymbolRole;
  lifecycle: EntityLifecycle;
  route?: Vec3[];
  initial: {
    position: Vec3;
    velocity: Vec3;
    headingRad: number;
    massKg: number;
    fuelKg: number;
  };
  behavior: {
    maneuver: Maneuver;
    commandedG: number;
    decision: string;
  };
  weapon?: {
    launchPlatformId: string;
    targetEntityId: string;
    guidance: Guidance;
    launchTimeSeconds: number | null;
    burnSeconds: number;
    launchMassKg: number;
    dryMassKg: number;
    thrustNewtons: number;
    thrustTaperSpeedMps: number;
    referenceAreaM2: number;
    dragCoefficient: number;
    navigationConstant: number;
    maximumCommandG: number;
    seekerActivationRangeM: number;
    datalinkUpdateSeconds: number;
    commandedCruiseAltitudeM: number;
  };
  sensor?: {
    detectionRadiusM: number;
    trackingRadiusM: number;
    engagementRadiusM: number;
    minimumRangeM: number;
    minimumAltitudeM: number;
    maximumAltitudeM: number;
  };
  aircraft?: {
    emptyMassKg: number;
    fuelCapacityKg: number;
    referenceAreaM2: number;
    zeroLiftDragCoefficient: number;
    inducedDragFactor: number;
    maximumThrustNewtons: number;
    specificFuelConsumptionKgPerNewtonSecond: number;
    maximumCommandG: number;
  };
  provenance: {
    sourceObjectId: string;
    modelId: string;
    modelVersion: string;
    modelPackDigest: string;
    valueState: ModelValueState;
  };
};

export type EngineScenario = {
  id: string;
  version: string;
  domain: EngagementDomain;
  name: string;
  seed: number;
  durationSeconds: number;
  fixedStepSeconds: number;
  modelPack: {
    schemaVersion: "vector.compiled-model-pack.v1";
    id: string;
    version: string;
    digest: string;
    intendedUse: { id: string; version: string };
    scenarioPatches: ScenarioModelPatch[];
  };
  entities: EngineEntityDefinition[];
  geospatial: {
    schemaVersion: "vector.engine-geospatial.v1";
    origin: ScenarioOrigin;
    initialPositions: GeographicEntityState[];
    syntheticEnvironment: SyntheticEnvironmentManifest;
  };
  environment: {
    gravityMps2: number;
    temperatureOffsetC: number;
    windMps: Vec3;
    atmosphere: "NASA_EDUCATIONAL_STANDARD";
    studyArea: {
      id: string;
      name: string;
      terrainClass: string;
      surfaceElevationM: number;
      surfaceElevationDatum: "MSL";
      anchor: { longitude: number; latitude: number };
      bounds: [[number, number], [number, number]];
      weatherPresetId: string;
    };
  };
  completion: {
    distanceMeters: number;
  };
  events: Array<{
    id: string;
    type: "GUIDANCE_HOLD" | "WIND_SHIFT";
    startSeconds: number;
    durationSeconds: number;
    entityId?: string;
    vectorMps?: Vec3;
  }>;
};

export type EngineEntityFrame = {
  id: string;
  rddfId: string;
  designation: string;
  callsign: string;
  affiliation: Affiliation;
  kind: EntityKind;
  symbolRole: TacticalSymbolRole;
  lifecycle: EntityLifecycle;
  position: Vec3;
  velocity: Vec3;
  speedMps: number;
  headingRad: number;
  massKg: number;
  fuelKg: number;
  mach: number;
  specificEnergyJkg: number;
  dragNewtons: number;
  thrustNewtons: number;
  commandedG: number;
  availableG: number;
  phase: string;
  valueState: ModelValueState;
  aircraftControl?: {
    routePointIndex: number | null;
    requestedVelocityMps: Vec3;
    acceptedSteeringAccelerationMps2: Vec3;
    achievedVelocityMps: Vec3;
    limiter: "LOAD_FACTOR" | "NONE" | "ROUTE_COMPLETE";
  };
};

export type CoverageEnvelope = {
  id: string;
  entityId: string;
  affiliation: Affiliation;
  kind: "DETECTION" | "TRACKING" | "ENGAGEMENT" | "MINIMUM_RANGE";
  radiusM: number;
  minimumAltitudeM: number;
  maximumAltitudeM: number;
  valueState: ModelValueState;
  label: string;
  basis: CoverageBasis;
};

export type EngineFrame = {
  t: number;
  entities: EngineEntityFrame[];
  geographicPositions: RecordedGeographicPosition[];
  primaryWeaponId: string;
  primaryTargetId: string;
  separationM: number;
  closureRateMps: number;
  lineOfSightRateRadS: number;
};

export type EngineRun = {
  scenario: EngineScenario;
  frames: EngineFrame[];
  envelopes: CoverageEnvelope[];
  primaryWeaponId: string;
  primaryTargetId: string;
  termination:
    | "threshold_reached"
    | "energy_depleted"
    | "time_limit"
    | "invalid_scenario";
  closestApproachM: number;
  peakCommandG: number;
  diagnostics: {
    backend: EngineBackendId;
    fixedStepSeconds: number;
    integratedSteps: number;
    nonFiniteStateCount: number;
    minimumMassMarginKg: number;
  };
};
