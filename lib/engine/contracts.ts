import type {
  EngagementDomain,
  Guidance,
  Maneuver,
  Vec3,
} from "./primitives.ts";

export type EntityKind =
  | "AIRCRAFT"
  | "GUIDED_WEAPON"
  | "AIR_DEFENCE_SYSTEM"
  | "RADAR"
  | "SURFACE_LAUNCHER"
  | "BASE"
  | "FIXED_OBJECTIVE";

export type Affiliation = "BLUE" | "RED" | "NEUTRAL";
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
  lifecycle: EntityLifecycle;
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
  provenance: {
    sourceObjectId: string;
    modelVersion: string;
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
  entities: EngineEntityDefinition[];
  environment: {
    gravityMps2: number;
    temperatureOffsetC: number;
    windMps: Vec3;
    atmosphere: "NASA_EDUCATIONAL_STANDARD";
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
};

export type EngineFrame = {
  t: number;
  entities: EngineEntityFrame[];
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
    fixedStepSeconds: number;
    integratedSteps: number;
    nonFiniteStateCount: number;
    minimumMassMarginKg: number;
  };
};
