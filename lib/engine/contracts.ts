import type {
  EngagementDomain,
  Guidance,
  Vec3,
} from "./primitives.ts";
import type { ScenarioModelPatch } from "../model-pack.ts";
import type {
  WeaponLaunchAuthorization,
  WeaponSeekerMode,
  WeaponSupportRequirement,
} from "../model-pack.ts";
import type {
  CoverageBasis,
  GeographicEntityState,
  RecordedGeographicPosition,
  ScenarioOrigin,
} from "../geospatial/contracts.ts";
import type { SyntheticEnvironmentManifest } from "../geospatial/synthetic-environment.ts";
import type { EnvironmentPack, EnvironmentPackBinding } from "../geospatial/environment-pack.ts";
import type { InstallationOriginReference } from "../mission-admission.ts";

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
export type ObserverPerspective = "IAF" | "PAF";

export const SIMULATION_EVENT_SCHEMA = "vector.simulation-event.v2" as const;

export const SIMULATION_EVENT_PAYLOAD_SCHEMAS = {
  RUN_STARTED: "vector.simulation-event-payload.run-started.v1",
  ENTITY_ENTERED_WORLD: "vector.simulation-event-payload.entity-entered-world.v1",
  ENTITY_LIFECYCLE_CHANGED: "vector.simulation-event-payload.entity-lifecycle-changed.v1",
  RUN_COMPLETED: "vector.simulation-event-payload.run-completed.v1",
  TRACK_STATE_CHANGED: "vector.simulation-event-payload.track-state-changed.v3",
} as const;

export type SimulationEventParticipantRole =
  | "ACTOR"
  | "SUBJECT"
  | "LAUNCHER"
  | "WEAPON"
  | "SENSOR";

export type SimulationEventParticipant = {
  entityId: string;
  role: SimulationEventParticipantRole;
};

/**
 * Tick-owned information state. The current deployment has no admitted sensor
 * model pack, so it can only emit this explicit fail-closed state.
 */
export type ObserverSensorMode = "OFF" | "SEARCH";
export type ObserverSensorKind = "RADAR" | "INFRARED" | "VISUAL";

/**
 * Immutable sensor inputs copied from the selected compiled model pack. The
 * engine has no access to the catalog during a tick, so this is the complete
 * admitted measurement boundary rather than a UI preference or a range
 * substitute.
 */
export type ObserverSensorAdmission = {
  schemaVersion:
    | "vector.observer-sensor-admission.v1"
    | "vector.observer-sensor-admission.v2";
  modelPackDigest: string;
  modelId: string;
  modelVersion: string;
  evidenceRefIds: string[];
  sensorKind: ObserverSensorKind;
  mode: ObserverSensorMode;
  detectionRangeM: number;
  minimumRangeM: number;
  scanPeriodS: number;
  azimuthFieldOfViewRad: number;
  elevationFieldOfViewRad: number;
  verificationTrackModel?: ObserverTrackModel;
};

export type ObserverTrackModel = {
  schemaVersion: "vector.generic-track-model.v1";
  valueState: "TEST_FIXTURE";
  intendedUse: "ENGINE_VERIFICATION_ONLY";
  positionBiasM: Vec3;
  velocityBiasMps: Vec3;
  positionStandardDeviationM: Vec3;
  velocityStandardDeviationMps: Vec3;
  confirmationObservations: number;
  maximumObservationAgeSeconds: number;
  coastAfterSeconds: number;
  lostAfterSeconds: number;
  observationWindowsSeconds: Array<{ start: number; end: number }>;
};

export type TrackEstimate =
  | { valueState: "UNAVAILABLE"; reason: "NON_POSITIONAL_OBSERVATION" }
  | { valueState: "ESTIMATED"; positionM: Vec3; velocityMps: Vec3 };

export type TrackUncertainty =
  | { valueState: "UNAVAILABLE"; reason: "UNCERTAINTY_MODEL_UNAVAILABLE" }
  | {
      valueState: "ESTIMATED";
      positionStandardDeviationM: Vec3;
      velocityStandardDeviationMps: Vec3;
    };

export type EngineObservation = {
  schemaVersion: "vector.observation.v1";
  id: string;
  owner: ObserverPerspective;
  /** Opaque source-local association; it is never a world entity identity. */
  sourceAssociationId: string;
  source: {
    modelPackDigest: string;
    sensorModelId: string;
    sensorModelVersion: string;
  };
  sourceSequence: number;
  sourceTimeSeconds: number;
  estimate: TrackEstimate;
  uncertainty: TrackUncertainty;
};

export type EngineTrackLifecycle = "TENTATIVE" | "CONFIRMED" | "COASTING" | "LOST";

export type EngineTrack = {
  schemaVersion: "vector.track.v1";
  trackId: string;
  owner: ObserverPerspective;
  sourceAssociationId: string;
  source: EngineObservation["source"];
  sourceSequence: number;
  sourceTimeSeconds: number;
  state: EngineTrackLifecycle;
  estimate: Extract<TrackEstimate, { valueState: "ESTIMATED" }>;
  uncertainty: Extract<TrackUncertainty, { valueState: "ESTIMATED" }>;
  updateCount: number;
  ageSeconds: number;
  freshUntilSeconds: number;
  expiresAtSeconds: number;
};

export type TrackTransitionCause =
  | "INITIAL_OBSERVATION"
  | "CONFIRMATION_THRESHOLD_MET"
  | "FRESHNESS_EXPIRED"
  | "OBSERVATION_REACQUIRED"
  | "TRACK_EXPIRED";

export type TrackTransitionCommit = {
  localKey: string;
  trackId: string;
  owner: ObserverPerspective;
  from: "NONE" | EngineTrackLifecycle;
  to: EngineTrackLifecycle;
  cause: TrackTransitionCause;
  sourceAssociationId: string;
  source: EngineObservation["source"];
  sourceSequence: number;
  sourceTimeSeconds: number;
  observationId?: string;
};

type EngineObserverStateBase = {
  perspective: ObserverPerspective;
  effectScope: "AIR_PICTURE_ONLY";
  stateExplanation: string | null;
};

export type EngineObserverStateV2 = EngineObserverStateBase & (
  | {
      schemaVersion: "vector.observer-state.v2";
      sensorState: "UNSUPPORTED";
      observationCount: 0;
      trackState: "UNSUPPORTED";
      visible: false;
      availabilityReason: "SENSOR_MODEL_UNAVAILABLE";
    }
  | {
      schemaVersion: "vector.observer-state.v2";
      sensorState: "OFF";
      observationCount: 0;
      trackState: "NONE";
      visible: false;
      availabilityReason: "SENSOR_OFF";
      sensorModelId: string;
    }
  | {
      schemaVersion: "vector.observer-state.v2";
      sensorState: "SEARCH";
      observationCount: 0;
      trackState: "NONE";
      visible: false;
      availabilityReason: "SCAN_NOT_DUE" | "TARGET_OUTSIDE_ADMITTED_SENSOR_VOLUME";
      sensorModelId: string;
    }
  | {
      schemaVersion: "vector.observer-state.v2";
      sensorState: "SEARCH";
      observationCount: 1;
      trackState: "PLOT";
      visible: false;
      availabilityReason: "OBSERVATION_ADMITTED";
      sensorModelId: string;
    }
);

export type EngineObserverStateV3 = EngineObserverStateBase & {
  schemaVersion: "vector.observer-state.v3";
  sensorState: "SEARCH";
  observationCount: number;
  trackCount: number;
  visibleTrackCount: number;
  scanReason:
    | "SCAN_NOT_DUE"
    | "TARGET_OUTSIDE_ADMITTED_SENSOR_VOLUME"
    | "OBSERVATION_ADMITTED";
  sensorModelId: string;
  observations: EngineObservation[];
  tracks: EngineTrack[];
};

export type EngineObserverState = EngineObserverStateV2 | EngineObserverStateV3;
export type EntityLifecycle =
  | "STOWED"
  | "ACTIVE"
  | "TRACKING"
  | "ENGAGING"
  | "TERMINATED";

export type EngineTermination =
  | "threshold_reached"
  | "energy_depleted"
  | "target_unavailable"
  | "time_limit"
  | "invalid_scenario";

/**
 * Closed output-event union delivered by the current runtime. The v2 envelope
 * is immutable. Every payload family has its own schema identity, so #26, #28,
 * and #38 can add governed variants only with an explicit payload version and
 * older readers reject the unknown family instead of partially accepting it.
 * Engine events contain typed facts, never presentation text.
 */
export type SimulationEventPayload =
  | {
      kind: "RUN_STARTED";
      schemaVersion: typeof SIMULATION_EVENT_PAYLOAD_SCHEMAS.RUN_STARTED;
      scenarioId: string;
      scenarioVersion: string;
    }
  | {
      kind: "ENTITY_ENTERED_WORLD";
      schemaVersion: typeof SIMULATION_EVENT_PAYLOAD_SCHEMAS.ENTITY_ENTERED_WORLD;
      entityKind: EntityKind;
      lifecycle: Exclude<EntityLifecycle, "STOWED" | "TERMINATED">;
    }
  | {
      kind: "ENTITY_LIFECYCLE_CHANGED";
      schemaVersion: typeof SIMULATION_EVENT_PAYLOAD_SCHEMAS.ENTITY_LIFECYCLE_CHANGED;
      entityKind: EntityKind;
      from: EntityLifecycle;
      to: EntityLifecycle;
    }
  | {
      kind: "RUN_COMPLETED";
      schemaVersion: typeof SIMULATION_EVENT_PAYLOAD_SCHEMAS.RUN_COMPLETED;
      termination: EngineTermination;
    }
  | {
      kind: "TRACK_STATE_CHANGED";
      schemaVersion: typeof SIMULATION_EVENT_PAYLOAD_SCHEMAS.TRACK_STATE_CHANGED;
      perspective: ObserverPerspective;
      trackId: string;
      from: "NONE" | EngineTrackLifecycle;
      to: EngineTrackLifecycle;
      cause: TrackTransitionCause;
      sensorModelId: string;
      sensorModelVersion: string;
      modelPackDigest: string;
      sourceAssociationId: string;
      sourceSequence: number;
      sourceTimeSeconds: number;
      observationId: string | null;
      estimateValueState: "ESTIMATED";
      uncertaintyValueState: "ESTIMATED";
    };

export type SimulationEventV2 = {
  schemaVersion: typeof SIMULATION_EVENT_SCHEMA;
  id: string;
  sequence: number;
  /** Producer-stable identity within one tick; never derived from call order. */
  localKey: string;
  tick: number;
  modelTimeSeconds: number;
  frameIndex: number;
  phase:
    | "LIFECYCLE"
    | "SENSING"
    | "TRACKING"
    | "MISSION"
    | "WEAPON"
    | "TERMINATION";
  producer: {
    subsystem: "RUN_COORDINATOR" | "ENTITY_LIFECYCLE" | "SENSOR_TRACK";
    entityId?: string;
  };
  ownerAffiliation?: Affiliation;
  knowledgeScope: "WORLD" | "SIDE_OWNED";
  participants: SimulationEventParticipant[];
  causeEventIds: string[];
  correlationId?: string;
  payload: SimulationEventPayload;
};

export type SimulationEventStream =
  | {
      state: "AVAILABLE";
      schemaVersion: typeof SIMULATION_EVENT_SCHEMA;
      items: SimulationEventV2[];
    }
  | {
      state: "UNAVAILABLE";
      sourceSchemaVersion: "vector.events.v1";
      reason: "LEGACY_EVENT_SCHEMA";
    };

/** Achieved propulsion/guidance stage; not a seeker or support claim. */
export type WeaponFlightState =
  | "STOWED"
  | "BOOST"
  | "COAST"
  | "TERMINAL_GUIDANCE"
  | "TARGET_UNAVAILABLE";

export type ModelValueState =
  | "SOURCED"
  | "MODEL_ASSUMPTION"
  | "USER_PROVIDED"
  | "UNKNOWN";

/** Immutable one-axis SI table admitted before a simulation starts. */
export type EngineTable1D = {
  id: string;
  axis: readonly number[];
  values: readonly number[];
};

/** Immutable proof that a store was admitted from one compiled model pack. */
export type WeaponAdmission = {
  modelPackDigest: string;
  weaponModelId: string;
  stationId: string;
  compatibilityRuleId: string;
  seekerMode: WeaponSeekerMode;
  supportRequirement: WeaponSupportRequirement;
  launchAuthorization: WeaponLaunchAuthorization;
};

/** A compiled flight-plan constraint; waypoint 0 is the aircraft start. */
export type RoutePlan = {
  /** v1 remains replayable with its documented all-fly-by semantics. */
  schemaVersion: "vector.route-plan.v1" | "vector.route-plan.v2";
  waypointAcceptanceRadiiM: number[];
  /** Required for v2. `START` occupies the initial route point. */
  waypointTransitions?: ("START" | "FLY_BY" | "FLY_OVER")[];
};

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
  routePlan?: RoutePlan;
  initial: {
    position: Vec3;
    velocity: Vec3;
    headingRad: number;
    massKg: number;
    fuelKg: number;
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
    admission: WeaponAdmission;
  };
  sensor?: {
    detectionRadiusM: number;
    trackingRadiusM: number;
    engagementRadiusM: number;
    minimumRangeM: number;
    minimumAltitudeM: number;
    maximumAltitudeM: number;
  };
  observerSensor?: ObserverSensorAdmission;
  aircraft?: {
    emptyMassKg: number;
    fuelCapacityKg: number;
    referenceAreaM2: number;
    zeroLiftDragByMach: EngineTable1D;
    inducedDragByAngleOfAttackRad: EngineTable1D;
    thrustByThrottle: EngineTable1D;
    fuelFlowByThrottle: EngineTable1D;
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
    /** SHA-256 of this compact runtime projection, excluding this field. */
    runtimeDigest?: string;
    observerSensors: Array<{
      modelId: string;
      modelVersion: string;
      evidenceRefIds: string[];
      /** Includes DECLARED_ENVELOPE so the binding can prove it is not a radar. */
      sensorKind: ObserverSensorKind | "DECLARED_ENVELOPE";
      detectionRangeM: number;
      minimumRangeM: number;
      scanPeriodS: number;
      azimuthFieldOfViewRad: number;
      elevationFieldOfViewRad: number;
      verificationTrackModel?: ObserverTrackModel;
    }>;
    scenarioPatches: ScenarioModelPatch[];
  };
  entities: EngineEntityDefinition[];
  geospatial: {
    schemaVersion: "vector.engine-geospatial.v1";
    origin: ScenarioOrigin;
    initialPositions: GeographicEntityState[];
    syntheticEnvironment: SyntheticEnvironmentManifest;
    /** Full immutable admission artifact used to verify saved-run replay. */
    environmentPack: Readonly<EnvironmentPack>;
    originReferences: Array<{
      entityId: string;
      reference: InstallationOriginReference;
    }>;
  };
  environment: {
    gravityMps2: number;
    temperatureOffsetC: number;
    windMps: Vec3;
    atmosphere: "NASA_EDUCATIONAL_STANDARD";
    /** Rust/WASM validates this compact binding before it accepts the run. */
    environmentPack: EnvironmentPackBinding;
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
    type: "WIND_SHIFT";
    startSeconds: number;
    durationSeconds: number;
    vectorMps: Vec3;
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
  storeMassKg: number;
  installedStoreIds: string[];
  phase: string;
  weaponFlightState?: WeaponFlightState;
  valueState: ModelValueState;
  aircraftControl?: {
    routePointIndex: number | null;
    requestedVelocityMps: Vec3;
    requestedSteeringAccelerationMps2: Vec3;
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
  /** Canonical side-owned information state at this exact model tick. */
  observerStates: EngineObserverState[];
};

export type EngineRun = {
  scenario: EngineScenario;
  frames: EngineFrame[];
  events: SimulationEventStream;
  envelopes: CoverageEnvelope[];
  primaryWeaponId: string;
  primaryTargetId: string;
  termination: EngineTermination;
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
