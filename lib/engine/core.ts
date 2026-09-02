import { standardAtmosphere } from "./atmosphere.ts";
import type {
  CoverageEnvelope,
  EngineFrame,
  EngineEntityDefinition,
  EngineEntityFrame,
  EngineObserverState,
  ObserverPerspective,
  EngineRun,
  EngineScenario,
  AircraftOperationalState,
  WeaponFlightState,
  WeaponTerminalState,
  SimulationEventPayload,
} from "./contracts.ts";
import { SIMULATION_EVENT_PAYLOAD_SCHEMAS } from "./contracts.ts";
import { SIMULATION_EVENT_SCHEMA } from "./contracts.ts";
import {
  assertSimulationEventStream,
  mergeWeaponEvidenceFrames,
  compareCanonicalText,
  firstFixedStepTickAtOrAfter,
  MAX_SIMULATION_EVENTS,
  modelTimeAtTick,
  recordedModelTimeAtTick,
  SimulationEventJournal,
} from "./simulation-events.ts";
import type { Vec3 } from "./primitives.ts";
import {
  add,
  clampMagnitude,
  cross,
  dot,
  magnitude,
  normalize,
  scale,
  subtract,
} from "./vector.ts";
import { enginePositionToGeographic } from "../scenario-spatial.ts";
import {
  assertEnvironmentPack,
  createEnvironmentSampler,
  environmentPackBinding,
  environmentRuntimeProjection,
} from "../geospatial/environment-pack.ts";
import type { EnvironmentSample } from "../geospatial/environment-pack.ts";
import {
  assertRuntimeModelPackAuthority,
} from "./runtime-model-pack.ts";
import { findEngineCompiledModelPackAuthority } from "./retained-model-packs.ts";
import type { CompiledModelPack } from "../model-pack.ts";
import {
  assertNoTruthIdentity,
  assertVerificationTrackModel,
  createVerificationObservation,
  TrackStore,
} from "./track-store.ts";
import type { SimulationEventReceipt } from "./simulation-events.ts";
import type { TrackTransitionCommit } from "./contracts.ts";
import { sha256HexSync } from "../geospatial/digest.ts";
import { AIRBORNE_STORE_TRANSFER_INSTALLED_DRAG_AREA_M2 } from "../air-mission.ts";
import { closestApproachOnRelativeSegment } from "./weapon-termination.ts";
import {
  evaluateTargetEffect,
  type TargetEffectEvaluation,
} from "./target-effect.ts";
import {
  assertTargetEffectAuthority,
  resolveTargetEffectAuthority,
} from "./target-effect-authority.ts";

type RuntimeState = {
  definition: EngineEntityDefinition;
  lifecycle: EngineEntityDefinition["lifecycle"];
  position: Vec3;
  velocity: Vec3;
  massKg: number;
  fuelKg: number;
  headingRad: number;
  commandedG: number;
  availableG: number;
  storeMassKg: number;
  installedStoreIds: Set<string>;
  installedStoreDragAreaM2: number;
  storeTransferAttempted: boolean;
  dragNewtons: number;
  thrustNewtons: number;
  phase: string;
  weaponFlightState?: WeaponFlightState;
  targetEffect?: NonNullable<EngineEntityFrame["targetEffect"]>;
  routePointIndex: number;
  aircraftControl?: NonNullable<EngineEntityFrame["aircraftControl"]>;
  aircraftOperationalState?: AircraftOperationalState;
  lastGuidanceAcceleration: Vec3;
  lastGuidanceUpdateSeconds: number;
};

type WeaponEvidenceSnapshot = {
  modelTimeSeconds: number;
  states: RuntimeState[];
  observerStates: readonly EngineObserverState[];
};

function snapshotRuntimeState(state: RuntimeState): RuntimeState {
  // Numerical updates replace vectors, controls, and inventory collections
  // instead of mutating them in place, so a shallow snapshot preserves the
  // exact pre-step object graph without cloning immutable model authority.
  return { ...state };
}

function refreshRuntimeStateSnapshot(target: RuntimeState, source: RuntimeState) {
  target.lifecycle = source.lifecycle;
  target.position = source.position;
  target.velocity = source.velocity;
  target.massKg = source.massKg;
  target.fuelKg = source.fuelKg;
  target.headingRad = source.headingRad;
  target.commandedG = source.commandedG;
  target.availableG = source.availableG;
  target.storeMassKg = source.storeMassKg;
  target.installedStoreIds = source.installedStoreIds;
  target.installedStoreDragAreaM2 = source.installedStoreDragAreaM2;
  target.storeTransferAttempted = source.storeTransferAttempted;
  target.dragNewtons = source.dragNewtons;
  target.thrustNewtons = source.thrustNewtons;
  target.phase = source.phase;
  target.weaponFlightState = source.weaponFlightState;
  target.targetEffect = source.targetEffect;
  target.routePointIndex = source.routePointIndex;
  target.aircraftControl = source.aircraftControl;
  target.aircraftOperationalState = source.aircraftOperationalState;
  target.lastGuidanceAcceleration = source.lastGuidanceAcceleration;
  target.lastGuidanceUpdateSeconds = source.lastGuidanceUpdateSeconds;
}

const G0 = 9.80665;
const PUBLISHED_NONNEGATIVE_EVENT_SCALAR_SCALE = 1_000_000;
const CANONICAL_RECORDED_DRAG_SCALE = 1_000;

function canonicalNonnegativeEventScalar(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Published non-negative event scalar is outside its domain.");
  }
  return Math.round(value * PUBLISHED_NONNEGATIVE_EVENT_SCALAR_SCALE)
    / PUBLISHED_NONNEGATIVE_EVENT_SCALAR_SCALE;
}

function canonicalRecordedDragNewtons(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Canonical aerodynamic drag is outside its domain.");
  }
  return Math.round(value * CANONICAL_RECORDED_DRAG_SCALE)
    / CANONICAL_RECORDED_DRAG_SCALE;
}

function interpolateTable(table: import("./contracts.ts").EngineTable1D, input: number) {
  const { axis, values } = table;
  if (axis.length < 2 || axis.length !== values.length || !Number.isFinite(input)) {
    throw new Error(`Invalid admitted table ${table.id}.`);
  }
  if (input < axis[0] || input > axis.at(-1)!) {
    throw new Error(`Input ${input} is outside admitted table ${table.id} coverage.`);
  }
  for (let index = 0; index < axis.length; index += 1) {
    if (!Number.isFinite(axis[index]) || !Number.isFinite(values[index])) {
      throw new Error(`Invalid admitted table ${table.id}.`);
    }
    if (index === 0) continue;
    if (!(axis[index] > axis[index - 1])) throw new Error(`Invalid admitted table ${table.id}.`);
    if (input <= axis[index]) {
      const fraction = (input - axis[index - 1]) / (axis[index] - axis[index - 1]);
      return values[index - 1] + (values[index] - values[index - 1]) * fraction;
    }
  }
  return values.at(-1)!;
}

function unavailableObserverState(
  perspective: EngineObserverState["perspective"],
  explanation = "No admitted sensor model pack is bound to this run.",
): EngineObserverState {
  return {
    schemaVersion: "vector.observer-state.v2",
    perspective,
    sensorState: "UNSUPPORTED",
    observationCount: 0,
    trackState: "UNSUPPORTED",
    visible: false,
    availabilityReason: "SENSOR_MODEL_UNAVAILABLE",
    effectScope: "AIR_PICTURE_ONLY",
    stateExplanation: explanation,
  };
}

/**
 * An observer admission is a projection of one sensor model already compiled
 * into the compiler-produced run binding. A digest alone is not sufficient:
 * entity-level input must not manufacture a radar by supplying a new range or
 * field of view alongside an otherwise valid pack digest. The binding
 * transport remains a separate governed concern.
 */
function assertObserverSensorBoundToModelPack(
  entity: EngineEntityDefinition,
  scenario: EngineScenario,
) {
  const admission = entity.observerSensor;
  if (!admission) return;
  const sensor = scenario.modelPack.observerSensors.find((candidate) =>
    candidate.modelId === admission.modelId,
  );
  assertNoTruthIdentity(admission, `Observer sensor ${entity.id}`);
  if (sensor) assertNoTruthIdentity(sensor, `Observer sensor binding ${sensor.modelId}`);
  const sameEvidence = sensor !== undefined &&
    sensor.evidenceRefIds.length === admission.evidenceRefIds.length &&
    sensor.evidenceRefIds.every((id, index) => id === admission.evidenceRefIds[index]);
  const sameTrackModel = JSON.stringify(sensor?.verificationTrackModel ?? null) ===
    JSON.stringify(admission.verificationTrackModel ?? null);
  if (
    !sensor ||
    admission.modelPackDigest !== scenario.modelPack.digest ||
    admission.modelVersion !== sensor.modelVersion ||
    admission.sensorKind !== sensor.sensorKind ||
    !sameEvidence ||
    admission.detectionRangeM !== sensor.detectionRangeM ||
    admission.minimumRangeM !== sensor.minimumRangeM ||
    admission.scanPeriodS !== sensor.scanPeriodS ||
    admission.azimuthFieldOfViewRad !== sensor.azimuthFieldOfViewRad ||
    admission.elevationFieldOfViewRad !== sensor.elevationFieldOfViewRad ||
    !sameTrackModel
  ) {
    throw new Error(`Observer sensor ${entity.id} is not bound to an admitted compiled sensor model.`);
  }
}

type ObserverTickResult = {
  state: EngineObserverState;
  sensorEntityId?: string;
  transitions: TrackTransitionCommit[];
};

function observerStates(
  states: readonly RuntimeState[],
  scenario: EngineScenario,
  time: number,
  dt: number,
  trackStores: Map<ObserverPerspective, TrackStore>,
): ObserverTickResult[] {
  if (scenario.domain !== "A2A") return [];
  return ([
    ["IAF", "BLUE"],
    ["PAF", "RED"],
  ] as const).map(([perspective, affiliation]) => {
    const observer = states.filter((state) =>
      state.definition.affiliation === affiliation &&
      state.definition.kind === "AIRCRAFT" &&
      state.lifecycle === "ACTIVE" &&
      state.definition.observerSensor !== undefined,
    ).sort((left, right) => compareCanonicalText(left.definition.id, right.definition.id))[0];
    const targetCandidates = states.filter((state) =>
      state.definition.affiliation !== affiliation &&
      state.definition.kind === "AIRCRAFT",
    ).sort((left, right) => compareCanonicalText(left.definition.id, right.definition.id));
    const targets = targetCandidates
      .map((target, targetIndex) => ({ target, targetIndex }))
      .filter(({ target }) => target.lifecycle === "ACTIVE");
    const sensor = observer?.definition.observerSensor;
    if (!observer || !sensor) return { state: unavailableObserverState(perspective), transitions: [] };
    if (
      sensor.modelPackDigest !== scenario.modelPack.digest ||
      !["vector.observer-sensor-admission.v1", "vector.observer-sensor-admission.v2"].includes(sensor.schemaVersion) ||
      !sensor.modelId || !sensor.modelVersion || !sensor.evidenceRefIds.length ||
      !Number.isFinite(sensor.detectionRangeM) || sensor.detectionRangeM <= 0 ||
      !Number.isFinite(sensor.minimumRangeM) || sensor.minimumRangeM < 0 ||
      sensor.minimumRangeM > sensor.detectionRangeM ||
      !Number.isFinite(sensor.scanPeriodS) || sensor.scanPeriodS <= 0 ||
      !Number.isFinite(sensor.azimuthFieldOfViewRad) || sensor.azimuthFieldOfViewRad <= 0 || sensor.azimuthFieldOfViewRad > Math.PI * 2 ||
      !Number.isFinite(sensor.elevationFieldOfViewRad) || sensor.elevationFieldOfViewRad <= 0 || sensor.elevationFieldOfViewRad > Math.PI
    ) return { state: unavailableObserverState(perspective, "The admitted sensor inputs are incomplete or inconsistent with the compiled model pack."), transitions: [] };
    if (sensor.schemaVersion === "vector.observer-sensor-admission.v2") {
      assertVerificationTrackModel(sensor.verificationTrackModel, scenario.modelPack.intendedUse.id);
    } else if (sensor.verificationTrackModel !== undefined) {
      throw new Error(`Observer sensor ${observer.definition.id} cannot attach a track model to admission v1.`);
    }
    if (sensor.mode === "OFF") return { state: {
      schemaVersion: "vector.observer-state.v2",
      perspective,
      sensorState: "OFF",
      observationCount: 0,
      trackState: "NONE",
      visible: false,
      availabilityReason: "SENSOR_OFF",
      effectScope: "AIR_PICTURE_ONLY",
      stateExplanation: "The admitted sensor is off. No observation or track is emitted.",
      sensorModelId: sensor.modelId,
    }, sensorEntityId: observer.definition.id, transitions: [] };
    const source = {
      modelPackDigest: sensor.modelPackDigest,
      sensorModelId: sensor.modelId,
      sensorModelVersion: sensor.modelVersion,
    };
    let store = trackStores.get(perspective);
    if (sensor.verificationTrackModel && !store) {
      store = new TrackStore(
        { owner: perspective, source },
        sensor.verificationTrackModel,
        scenario.modelPack.intendedUse.id,
      );
      trackStores.set(perspective, store);
    }
    const trackedState = (
      scanReason: "SCAN_NOT_DUE" | "TARGET_OUTSIDE_ADMITTED_SENSOR_VOLUME" | "OBSERVATION_ADMITTED",
      explanation: string,
      observations: import("./contracts.ts").EngineObservation[] = [],
    ): ObserverTickResult => {
      if (!store) throw new Error("Verification track admission has no TrackStore.");
      const update = store.update(time, observations);
      const tracks = update.snapshot.tracks;
      return {
        state: {
          schemaVersion: "vector.observer-state.v3",
          perspective,
          sensorState: "SEARCH",
          observationCount: observations.length,
          trackCount: tracks.length,
          visibleTrackCount: tracks.filter((track) => track.state === "CONFIRMED" || track.state === "COASTING").length,
          scanReason,
          effectScope: "AIR_PICTURE_ONLY",
          stateExplanation: explanation,
          sensorModelId: sensor.modelId,
          observations,
          tracks,
        },
        sensorEntityId: observer.definition.id,
        transitions: update.transitions,
      };
    };
    const due = Math.abs(time / sensor.scanPeriodS - Math.round(time / sensor.scanPeriodS)) <= dt / sensor.scanPeriodS / 2 + 1e-9;
    if (!due && store) return trackedState("SCAN_NOT_DUE", "No admitted scan is due at this model time.");
    if (!due) return { state: {
      schemaVersion: "vector.observer-state.v2",
      perspective,
      sensorState: "SEARCH",
      observationCount: 0,
      trackState: "NONE",
      visible: false,
      availabilityReason: "SCAN_NOT_DUE",
      effectScope: "AIR_PICTURE_ONLY",
      stateExplanation: "No admitted scan is due at this model time.",
      sensorModelId: sensor.modelId,
    }, sensorEntityId: observer.definition.id, transitions: [] };
    const forward = { x: Math.cos(observer.headingRad), y: Math.sin(observer.headingRad), z: 0 };
    const verificationWindowOpen = sensor.verificationTrackModel === undefined ||
      sensor.verificationTrackModel.observationWindowsSeconds.some(
        (window) => time >= window.start && time <= window.end,
      );
    const detectedTargets = targets.filter(({ target }) => {
      const relative = subtract(target.position, observer.position);
      const range = magnitude(relative);
      const horizontal = Math.hypot(relative.x, relative.y);
      const azimuth = horizontal > 0
        ? Math.acos(Math.max(-1, Math.min(1, (relative.x * forward.x + relative.y * forward.y) / horizontal)))
        : 0;
      const elevation = range > 0 ? Math.asin(Math.max(-1, Math.min(1, relative.z / range))) : 0;
      return verificationWindowOpen && range >= sensor.minimumRangeM && range <= sensor.detectionRangeM &&
        azimuth <= sensor.azimuthFieldOfViewRad / 2 && Math.abs(elevation) <= sensor.elevationFieldOfViewRad / 2;
    });
    if (detectedTargets.length === 0 && store) return trackedState("TARGET_OUTSIDE_ADMITTED_SENSOR_VOLUME", "The due verification scan produced no observations.");
    if (detectedTargets.length === 0) return { state: {
      schemaVersion: "vector.observer-state.v2",
      perspective,
      sensorState: "SEARCH",
      observationCount: 0,
      trackState: "NONE",
      visible: false,
      availabilityReason: "TARGET_OUTSIDE_ADMITTED_SENSOR_VOLUME",
      effectScope: "AIR_PICTURE_ONLY",
      stateExplanation: "The opposing aircraft is outside the admitted range or field of view at the due scan.",
      sensorModelId: sensor.modelId,
    }, sensorEntityId: observer.definition.id, transitions: [] };
    if (sensor.verificationTrackModel) {
      const observations = detectedTargets.map(({ target, targetIndex }) => {
        return createVerificationObservation({
          identity: source,
          owner: perspective,
          sourceAssociationId: `${perspective}-SOURCE-${(targetIndex + 1).toString().padStart(4, "0")}`,
          sourceSequence: Math.round(time / sensor.scanPeriodS) + 1,
          sourceTimeSeconds: time,
          measuredPositionM: target.position,
          measuredVelocityMps: target.velocity,
          model: sensor.verificationTrackModel!,
        });
      });
      return trackedState(
        "OBSERVATION_ADMITTED",
        "Source-authored generic verification observations updated this side-owned TrackStore.",
        observations,
      );
    }
    return { state: {
      schemaVersion: "vector.observer-state.v2",
      perspective,
      sensorState: "SEARCH",
      observationCount: 1,
      trackState: "PLOT",
      visible: false,
      availabilityReason: "OBSERVATION_ADMITTED",
      effectScope: "AIR_PICTURE_ONLY",
      stateExplanation: "One due scan satisfied the admitted range and field-of-view conditions. This plot has no position estimate or weapon-support authority.",
      sensorModelId: sensor.modelId,
    }, sensorEntityId: observer.definition.id, transitions: [] };
  });
}

function initialState(definition: EngineEntityDefinition): RuntimeState {
  const firstRoutePoint = definition.route?.[0];
  const startsAtFirstRoutePoint =
    firstRoutePoint !== undefined &&
    magnitude(subtract(firstRoutePoint, definition.initial.position)) <= 1e-6;
  return {
    definition,
    lifecycle: definition.lifecycle,
    position: { ...definition.initial.position },
    velocity: { ...definition.initial.velocity },
    massKg: definition.initial.massKg,
    fuelKg: definition.initial.fuelKg,
    headingRad: definition.initial.headingRad,
    commandedG: 0,
    availableG: definition.weapon?.maximumCommandG ?? 9,
    storeMassKg: 0,
    installedStoreIds: new Set(),
    installedStoreDragAreaM2: 0,
    storeTransferAttempted: false,
    dragNewtons: 0,
    thrustNewtons: 0,
    phase: definition.lifecycle === "STOWED" ? "Stowed" : "Initial state",
    weaponFlightState:
      definition.kind === "GUIDED_WEAPON" ? "STOWED" : undefined,
    routePointIndex: startsAtFirstRoutePoint ? 1 : 0,
    aircraftOperationalState:
      definition.kind !== "AIRCRAFT"
        ? undefined
        : definition.groundOperation?.posture === "RUNWAY"
          ? "HOLD_SHORT"
          : definition.groundOperation
            ? "PARKED"
            : "ENROUTE",
    lastGuidanceAcceleration: { x: 0, y: 0, z: 0 },
    lastGuidanceUpdateSeconds: Number.NEGATIVE_INFINITY,
  };
}

type RuntimeEnvironmentSampler = ReturnType<typeof createEnvironmentSampler>;

function activeWind(scenario: EngineScenario, time: number, baseWind = scenario.environment.windMps) {
  return scenario.events.reduce(
    (wind, event) =>
      event.type === "WIND_SHIFT" &&
      time >= event.startSeconds &&
      time < event.startSeconds + event.durationSeconds &&
      event.vectorMps
        ? add(wind, event.vectorMps)
        : wind,
    baseWind,
  );
}

function sampledEnvironment(
  scenario: EngineScenario,
  sampler: RuntimeEnvironmentSampler | undefined,
  position: Vec3,
  time: number,
): { atmosphere: EnvironmentSample["atmosphere"]; windEnuMps: Vec3 } {
  if (sampler) {
    const sample = sampler.sample({
      eastM: position.x,
      northM: position.y,
      upM: position.z,
      modelTimeSeconds: time,
    });
    return { atmosphere: sample.atmosphere, windEnuMps: sample.windEnuMps };
  }
  return {
    atmosphere: standardAtmosphere(position.z, scenario.environment.temperatureOffsetC),
    windEnuMps: scenario.environment.windMps,
  };
}

function terrainElevation(
  sampler: RuntimeEnvironmentSampler | undefined,
  position: Pick<Vec3, "x" | "y">,
) {
  const sample = sampler?.terrain.sample({ eastM: position.x, northM: position.y });
  if (sampler && !sample?.elevation) {
    throw new Error("Runtime position is outside admitted terrain coverage or contains no-data.");
  }
  return sample?.elevation?.valueM ?? 0;
}

function updateKinematicEntity(
  state: RuntimeState,
  scenario: EngineScenario,
  time: number,
  dt: number,
  environmentSampler?: RuntimeEnvironmentSampler,
) {
  if (state.lifecycle !== "ACTIVE" && state.lifecycle !== "TRACKING") return;
  const { kind } = state.definition;
  if (kind !== "AIRCRAFT") return;
  const groundOperation = state.definition.groundOperation;
  if (groundOperation && state.aircraftOperationalState !== "ENROUTE") {
    if (time < groundOperation.releaseTimeSeconds) {
      state.aircraftOperationalState = groundOperation.posture === "RUNWAY" ? "HOLD_SHORT" : "PARKED";
      state.velocity = { x: 0, y: 0, z: 0 };
      state.commandedG = 0;
      state.dragNewtons = 0;
      state.thrustNewtons = 0;
      state.aircraftControl = {
        routePointIndex: state.routePointIndex,
        requestedVelocityMps: { x: 0, y: 0, z: 0 },
        requestedSteeringAccelerationMps2: { x: 0, y: 0, z: 0 },
        acceptedSteeringAccelerationMps2: { x: 0, y: 0, z: 0 },
        achievedVelocityMps: { x: 0, y: 0, z: 0 },
        limiter: "GROUND_HOLD",
      };
      state.phase = "GROUND_READINESS_HOLD";
      return;
    }
    updateGroundAircraft(state, scenario, time, dt, environmentSampler);
    return;
  }
  const model = state.definition.aircraft!;
  const speed = Math.max(1, magnitude(state.velocity));
  const route = state.definition.route ?? [];
  let routePoint = route[state.routePointIndex];
  const transition = routePoint
    ? routeTransition(state.definition.routePlan!, state.routePointIndex)
    : undefined;
  const declaredCaptureRadiusM = routePoint
    ? state.definition.routePlan!.waypointAcceptanceRadiiM[state.routePointIndex]
    : 0;
  const captureRadiusM = transition === "FLY_OVER"
    ? Math.max(1, speed * dt * 2)
    : Math.max(1, speed * dt * 2, declaredCaptureRadiusM);
  while (
    routePoint &&
    state.routePointIndex < route.length - 1 &&
    magnitude(subtract(routePoint, state.position)) <= captureRadiusM
  ) {
    state.routePointIndex += 1;
    routePoint = route[state.routePointIndex];
  }
  const currentDirection = normalize(state.velocity);
  const requestedDirection = routePoint
    ? normalize(subtract(routePoint, state.position))
    : currentDirection;
  const directionCross = magnitude(cross(requestedDirection, currentDirection));
  const directionAligned =
    dot(requestedDirection, currentDirection) > 0 && directionCross < 1e-9;
  const requestedVelocity = directionAligned
    ? scale(currentDirection, speed)
    : scale(requestedDirection, speed);
  let requestedSteeringAcceleration = scale(
    subtract(requestedVelocity, state.velocity),
    1 / dt,
  );
  requestedSteeringAcceleration = subtract(
    requestedSteeringAcceleration,
    scale(
      currentDirection,
      dot(requestedSteeringAcceleration, currentDirection),
    ),
  );
  if (directionAligned || magnitude(requestedSteeringAcceleration) < 1e-9) {
    requestedSteeringAcceleration = { x: 0, y: 0, z: 0 };
  }
  if (
    routePoint &&
    dot(normalize(requestedVelocity), currentDirection) < -0.999 &&
    magnitude(requestedSteeringAcceleration) < 1e-6
  ) {
    requestedSteeringAcceleration = {
      x: -currentDirection.y * model.maximumCommandG * G0,
      y: currentDirection.x * model.maximumCommandG * G0,
      z: 0,
    };
  }
  const acceptedSteeringAcceleration = clampMagnitude(
    requestedSteeringAcceleration,
    model.maximumCommandG * G0,
  );
  const steeringLimited =
    magnitude(requestedSteeringAcceleration) >
    magnitude(acceptedSteeringAcceleration) + 1e-9;
  const acceptedSteeringG = steeringLimited
    ? model.maximumCommandG
    : magnitude(acceptedSteeringAcceleration) / G0;
  const environment = sampledEnvironment(scenario, environmentSampler, state.position, time);
  const atmosphere = environment.atmosphere;
  const airRelative = subtract(state.velocity, activeWind(scenario, time, environment.windEnuMps));
  const airspeed = Math.max(1, magnitude(airRelative));
  let longitudinalAcceleration = 0;
  {
    const dynamicPressure = Math.max(1, 0.5 * atmosphere.densityKgM3 * airspeed * airspeed);
    const steeringG = acceptedSteeringG;
    const loadFactor = Math.sqrt(1 + steeringG * steeringG);
    const liftCoefficient =
      (state.massKg * G0 * loadFactor) /
      (dynamicPressure * model.referenceAreaM2);
    const mach = airspeed / atmosphere.speedOfSoundMps;
    const dragCoefficient =
      interpolateTable(model.zeroLiftDragByMach, mach) +
      interpolateTable(model.inducedDragByAngleOfAttackRad, 0) * liftCoefficient * liftCoefficient;
    const installedStoreDrag = dynamicPressure * state.installedStoreDragAreaM2;
    const drag = dynamicPressure * model.referenceAreaM2 * dragCoefficient + installedStoreDrag;
    const maximumThrust = interpolateTable(model.thrustByThrottle, 1);
    if (!(maximumThrust > 0)) {
      throw new Error(`Admitted table ${model.thrustByThrottle.id} has no positive full-throttle thrust.`);
    }
    const throttle = Math.min(1, (drag * (steeringG === 0 ? 1.02 : 1.18)) / maximumThrust);
    const thrustDemand = interpolateTable(model.thrustByThrottle, throttle);
    const specificFuelConsumption = interpolateTable(model.fuelFlowByThrottle, throttle);
    const fuelFlow =
      state.fuelKg > 0
        ? thrustDemand * specificFuelConsumption
        : 0;
    const consumed = Math.min(state.fuelKg, fuelFlow * dt);
    state.fuelKg -= consumed;
    state.massKg = Math.max(
      model.emptyMassKg + state.storeMassKg,
      state.massKg - consumed,
    );
    // Motion retains the raw force above. Only recorded drag telemetry crosses
    // this millinewton boundary, removing host-specific last-bit VSR drift.
    state.dragNewtons = canonicalRecordedDragNewtons(drag);
    state.thrustNewtons = state.fuelKg > 0 ? thrustDemand : 0;
    longitudinalAcceleration =
      (state.thrustNewtons - drag) / state.massKg;
    state.availableG = model.maximumCommandG;
  }
  const nextSpeed = Math.max(60, speed + longitudinalAcceleration * dt);
  const steeredVelocity = add(
    state.velocity,
    scale(acceptedSteeringAcceleration, dt),
  );
  state.velocity =
    magnitude(acceptedSteeringAcceleration) === 0
      ? scale(state.velocity, nextSpeed / speed)
      : scale(normalize(steeredVelocity), nextSpeed);
  state.headingRad = Math.atan2(state.velocity.y, state.velocity.x);
  state.position = add(state.position, scale(state.velocity, dt));
  state.commandedG = acceptedSteeringG;
  state.phase = routePoint ? "Following route" : "Route complete";
  state.aircraftOperationalState = "ENROUTE";
  state.aircraftControl = {
    routePointIndex: routePoint ? state.routePointIndex : null,
    requestedVelocityMps: requestedVelocity,
    requestedSteeringAccelerationMps2: requestedSteeringAcceleration,
    acceptedSteeringAccelerationMps2: acceptedSteeringAcceleration,
    achievedVelocityMps: { ...state.velocity },
    limiter: routePoint
      ? steeringLimited
        ? "LOAD_FACTOR"
        : "NONE"
      : "ROUTE_COMPLETE",
  };
}

function updateGroundAircraft(
  state: RuntimeState,
  scenario: EngineScenario,
  time: number,
  dt: number,
  environmentSampler?: RuntimeEnvironmentSampler,
) {
  const operation = state.definition.groundOperation!;
  const model = state.definition.aircraft!;
  const priorVelocity = { ...state.velocity };
  const runwayDirection = {
    x: Math.cos((90 - operation.runwayHeadingDegTrue) * Math.PI / 180),
    y: Math.sin((90 - operation.runwayHeadingDegTrue) * Math.PI / 180),
    z: 0,
  };
  const environment = sampledEnvironment(scenario, environmentSampler, state.position, time);
  const wind = activeWind(scenario, time, environment.windEnuMps);
  const tailwindMps = dot(wind, runwayDirection);
  const crosswindMps = Math.abs(wind.x * -runwayDirection.y + wind.y * runwayDirection.x);
  if (tailwindMps > operation.maximumTailwindMps || crosswindMps > operation.maximumCrosswindMps) {
    throw new Error("[GROUND_WIND_ENVELOPE_EXCEEDED] Effective runway wind exceeds the admitted projection.");
  }
  const airRelative = subtract(state.velocity, wind);
  const airspeed = magnitude(airRelative);
  const speedOfSound = environment.atmosphere.speedOfSoundMps;
  const dynamicPressure = 0.5 * environment.atmosphere.densityKgM3 * airspeed * airspeed;
  const lift = dynamicPressure * model.referenceAreaM2 * operation.takeoffLiftCoefficient;
  const dragCoefficient = interpolateTable(model.zeroLiftDragByMach, airspeed / speedOfSound)
    + interpolateTable(model.inducedDragByAngleOfAttackRad, 0)
      * operation.takeoffLiftCoefficient * operation.takeoffLiftCoefficient;
  const installedStoreDrag = dynamicPressure * state.installedStoreDragAreaM2;
  const drag = dynamicPressure * model.referenceAreaM2 * dragCoefficient + installedStoreDrag;
  const thrust = interpolateTable(model.thrustByThrottle, 1);
  const fuelCoefficient = interpolateTable(model.fuelFlowByThrottle, 1);
  if (!(thrust > 0) || state.fuelKg <= 0) {
    throw new Error("[GROUND_TAKEOFF_FUEL_EXHAUSTED] Admitted takeoff thrust is unavailable.");
  }
  const fuelConsumed = Math.min(state.fuelKg, thrust * fuelCoefficient * dt);
  state.fuelKg -= fuelConsumed;
  state.massKg = model.emptyMassKg + state.fuelKg + state.storeMassKg;
  if (state.fuelKg < operation.minimumTakeoffFuelKg) {
    throw new Error("[GROUND_TAKEOFF_FUEL_EXHAUSTED] Fuel fell below the admitted takeoff minimum.");
  }
  state.dragNewtons = canonicalRecordedDragNewtons(drag);
  state.thrustNewtons = thrust;
  state.availableG = model.maximumCommandG;

  const currentGroundSpeed = Math.max(0, dot(state.velocity, runwayDirection));
  const normalForce = Math.max(0, state.massKg * G0 - lift);
  const rollingResistance = operation.rollingResistanceCoefficient * normalForce;
  const groundAcceleration = (thrust - drag - rollingResistance) / state.massKg;
  if (!(groundAcceleration > 0)) {
    throw new Error("[GROUND_TAKEOFF_FORCE_INSUFFICIENT] Net runway force is not positive.");
  }
  const nextGroundSpeed = currentGroundSpeed + groundAcceleration * dt;
  const distanceFromThreshold = dot(
    subtract(state.position, state.definition.initial.position),
    runwayDirection,
  );
  const nextDistance = distanceFromThreshold + nextGroundSpeed * dt;
  const priorOperationalState = state.aircraftOperationalState;
  const requestedSpeed = state.aircraftOperationalState === "CLIMBOUT"
    ? operation.climboutSpeedMps
    : operation.liftoffSpeedMps;

  if (priorOperationalState !== "CLIMBOUT") {
    if (nextDistance > operation.runwayLengthM + 1e-9) {
      state.aircraftOperationalState = "ABORTED";
      throw new Error("[GROUND_RUNWAY_OVERRUN] Liftoff was not achieved inside the admitted runway.");
    }
    const runwayFraction = Math.min(1, nextDistance / operation.runwayLengthM);
    state.velocity = scale(runwayDirection, nextGroundSpeed);
    state.position = add(
      state.definition.initial.position,
      {
        x: runwayDirection.x * nextDistance,
        y: runwayDirection.y * nextDistance,
        z: (operation.runwayEndElevationM - state.definition.initial.position.z) * runwayFraction,
      },
    );
    if (priorOperationalState === "ROTATE"
      && airspeed >= operation.liftoffSpeedMps
      && lift >= state.massKg * G0) {
      state.aircraftOperationalState = "CLIMBOUT";
    } else if (priorOperationalState === "TAKEOFF_ROLL"
      && airspeed >= operation.rotationSpeedMps) {
      state.aircraftOperationalState = "ROTATE";
    } else if (priorOperationalState === "PARKED" || priorOperationalState === "HOLD_SHORT") {
      state.aircraftOperationalState = "TAKEOFF_ROLL";
    } else if (priorOperationalState !== "TAKEOFF_ROLL" && priorOperationalState !== "ROTATE") {
      throw new Error("[GROUND_OPERATIONAL_TRANSITION_INVALID] Ground state cannot enter the takeoff sequence.");
    }
  } else {
    const climbSpeed = Math.min(
      operation.climboutSpeedMps,
      Math.max(currentGroundSpeed, magnitude(state.velocity)) + groundAcceleration * dt,
    );
    const horizontalSpeed = climbSpeed * Math.cos(operation.climboutFlightPathAngleRad);
    state.velocity = {
      x: runwayDirection.x * horizontalSpeed,
      y: runwayDirection.y * horizontalSpeed,
      z: climbSpeed * Math.sin(operation.climboutFlightPathAngleRad),
    };
    state.position = add(state.position, scale(state.velocity, dt));
    if (state.position.z - state.definition.initial.position.z >= operation.enrouteTransitionHeightM) {
      state.aircraftOperationalState = "ENROUTE";
    }
  }

  const requestedVelocity = state.aircraftOperationalState === "CLIMBOUT"
    ? {
        x: runwayDirection.x * requestedSpeed * Math.cos(operation.climboutFlightPathAngleRad),
        y: runwayDirection.y * requestedSpeed * Math.cos(operation.climboutFlightPathAngleRad),
        z: requestedSpeed * Math.sin(operation.climboutFlightPathAngleRad),
      }
    : scale(runwayDirection, requestedSpeed);
  const requestedAcceleration = scale(subtract(requestedVelocity, priorVelocity), 1 / dt);
  const acceptedAcceleration = scale(subtract(state.velocity, priorVelocity), 1 / dt);
  if (!state.aircraftOperationalState) {
    throw new Error("[GROUND_OPERATIONAL_TRANSITION_INVALID] Ground state is missing.");
  }
  state.headingRad = (90 - operation.runwayHeadingDegTrue) * Math.PI / 180;
  state.commandedG = magnitude(acceptedAcceleration) / G0;
  state.phase = state.aircraftOperationalState;
  state.aircraftControl = {
    routePointIndex: state.routePointIndex,
    requestedVelocityMps: requestedVelocity,
    requestedSteeringAccelerationMps2: requestedAcceleration,
    acceptedSteeringAccelerationMps2: acceptedAcceleration,
    achievedVelocityMps: { ...state.velocity },
    limiter: state.aircraftOperationalState === "CLIMBOUT" ? "CLIMBOUT" : "GROUND_FORCE",
  };
}

/** v1 explicitly meant all route waypoints were fly-by; v2 names each one. */
function routeTransition(
  plan: NonNullable<EngineEntityDefinition["routePlan"]>,
  index: number,
): "START" | "FLY_BY" | "FLY_OVER" {
  if (plan.schemaVersion === "vector.route-plan.v1") return index === 0 ? "START" : "FLY_BY";
  return plan.waypointTransitions![index]!;
}

function activateWeapon(
  state: RuntimeState,
  states: Map<string, RuntimeState>,
  tick: number,
  scenario: EngineScenario,
  terminalTick: number,
  environmentSampler?: RuntimeEnvironmentSampler,
): Extract<SimulationEventPayload, { kind: "AIRBORNE_STORE_TRANSFER_OUTCOME" }> | null {
  const weapon = state.definition.weapon;
  if (!weapon || weapon.launchTimeSeconds === null) return null;
  const activationTick = firstFixedStepTickAtOrAfter(
    weapon.launchTimeSeconds,
    scenario.fixedStepSeconds,
  );
  if (
    state.lifecycle !== "STOWED" ||
    weapon.launchTimeSeconds > scenario.durationSeconds ||
    activationTick >= terminalTick ||
    tick < activationTick
  ) return null;
  const launcher = states.get(weapon.launchPlatformId);
  if (!launcher) {
    throw new Error(`[STORE_TRANSFER_LAUNCHER_ABSENT] Store ${state.definition.id} has no launcher.`);
  }
  let transferEvent: Extract<SimulationEventPayload, { kind: "AIRBORNE_STORE_TRANSFER_OUTCOME" }> | null = null;
  if (launcher.definition.kind === "AIRCRAFT") {
    const transfer = weapon.storeTransfer;
    if (!transfer) {
      if (scenario.airMission) {
        // Existing airborne v1 missions retain their pre-#187 scheduled path;
        // a ground mission without an authored plan cannot promote itself.
        if (launcher.definition.groundOperation) return null;
      }
      if (!launcher.installedStoreIds.delete(state.definition.id)) {
        throw new Error(
          `[STORE_TRANSFER_STORE_ABSENT] Aircraft ${launcher.definition.id} does not carry store ${state.definition.id}.`,
        );
      }
      launcher.storeMassKg -= weapon.launchMassKg;
      launcher.massKg -= weapon.launchMassKg;
    } else {
      if (state.storeTransferAttempted) return null;
      state.storeTransferAttempted = true;
      const priorDragAreaM2 = launcher.installedStoreDragAreaM2;
      const launcherMassBeforeKg = launcher.massKg;
      const launcherFuelBeforeKg = launcher.fuelKg;
      const outcome = (
        accepted: boolean,
        limiter: Extract<SimulationEventPayload, { kind: "AIRBORNE_STORE_TRANSFER_OUTCOME" }>["limiter"],
        cause: Extract<SimulationEventPayload, { kind: "AIRBORNE_STORE_TRANSFER_OUTCOME" }>["cause"],
        installedDragNewtons = 0,
      ): Extract<SimulationEventPayload, { kind: "AIRBORNE_STORE_TRANSFER_OUTCOME" }> => ({
        kind: "AIRBORNE_STORE_TRANSFER_OUTCOME",
        schemaVersion: SIMULATION_EVENT_PAYLOAD_SCHEMAS.AIRBORNE_STORE_TRANSFER_OUTCOME,
        transferId: transfer.id,
        launcherId: launcher.definition.id,
        stationId: transfer.stationId,
        storeId: state.definition.id,
        operation: transfer.operation,
        requestedTimeSeconds: transfer.requestedTimeSeconds,
        requestedTick: transfer.requestedTick,
        requested: true,
        accepted,
        achieved: accepted,
        limiter,
        cause,
        storeMassKg: transfer.storeMassKg,
        installedDragAreaM2: transfer.installedDragAreaM2,
        installedDragNewtons,
        launcherMassBeforeKg,
        launcherMassAfterKg: launcher.massKg,
        launcherFuelBeforeKg,
        launcherFuelAfterKg: launcher.fuelKg,
        installedDragAreaBeforeM2: priorDragAreaM2,
        installedDragAreaAfterM2: launcher.installedStoreDragAreaM2,
        transferDigest: transfer.digest,
      });
      if (launcher.aircraftOperationalState !== "ENROUTE") {
        return outcome(false, "AIRCRAFT_STATE", "AIRCRAFT_NOT_ENROUTE");
      }
      if (!launcher.installedStoreIds.has(state.definition.id)) {
        return outcome(false, "STORE_INVENTORY", "STORE_NOT_INSTALLED");
      }
      if (priorDragAreaM2 + 1e-12 < transfer.installedDragAreaM2) {
        return outcome(false, "DRAG_AUTHORITY", "INSTALLED_DRAG_EXCEEDED");
      }
      const environment = sampledEnvironment(
        scenario,
        environmentSampler,
        launcher.position,
        modelTimeAtTick(tick, scenario.fixedStepSeconds),
      );
      const wind = activeWind(
        scenario,
        modelTimeAtTick(tick, scenario.fixedStepSeconds),
        environment.windEnuMps,
      );
      const airspeed = magnitude(subtract(launcher.velocity, wind));
      const dynamicPressure = 0.5 * environment.atmosphere.densityKgM3 * airspeed * airspeed;
      const transferredDragNewtons = dynamicPressure * transfer.installedDragAreaM2;
      launcher.installedStoreIds.delete(state.definition.id);
      launcher.installedStoreDragAreaM2 = Math.max(
        0,
        priorDragAreaM2 - transfer.installedDragAreaM2,
      );
      launcher.dragNewtons = canonicalRecordedDragNewtons(
        Math.max(0, launcher.dragNewtons - transferredDragNewtons),
      );
      launcher.storeMassKg -= weapon.launchMassKg;
      launcher.massKg -= weapon.launchMassKg;
      // The integrator retains the full binary64 value; only the published
      // event scalar is canonicalized so independently implemented backends
      // seal identical evidence. Installed drag is governed non-negative, so
      // both Math.round and Rust f64::round resolve half-micro ties upward.
      const publishedTransferredDragNewtons = canonicalNonnegativeEventScalar(
        transferredDragNewtons,
      );
      transferEvent = outcome(
        true,
        "NONE",
        "AIRBORNE_TRANSFER_ADMITTED",
        publishedTransferredDragNewtons,
      );
    }
  }
  state.position = { ...launcher.position };
  state.velocity = { ...launcher.velocity };
  state.headingRad = launcher.headingRad;
  state.lifecycle = "ACTIVE";
  state.phase = weapon.storeTransfer?.operation === "JETTISON" ? "Jettisoned" : "Launched";
  state.weaponFlightState = weapon.storeTransfer?.operation === "JETTISON" ? "COAST" : "BOOST";
  return transferEvent;
}

function updateWeapon(
  state: RuntimeState,
  states: Map<string, RuntimeState>,
  scenario: EngineScenario,
  time: number,
  dt: number,
  environmentSampler?: RuntimeEnvironmentSampler,
) {
  const weapon = state.definition.weapon;
  if (!weapon || state.lifecycle !== "ACTIVE") return;
  // Ground impact is evaluated before atmosphere lookup so a below-terrain
  // state terminates deterministically instead of escaping through the
  // atmosphere validity boundary. The run coordinator records the outcome.
  if (time > 1 && state.position.z <= terrainElevation(environmentSampler, state.position)) {
    state.phase = "Terrain impact";
    return;
  }

  if (weapon.storeTransfer?.operation === "JETTISON") {
    const environment = sampledEnvironment(scenario, environmentSampler, state.position, time);
    const wind = activeWind(scenario, time, environment.windEnuMps);
    const airRelativeVelocity = subtract(state.velocity, wind);
    const airspeed = Math.max(1, magnitude(airRelativeVelocity));
    const dynamicPressure = 0.5 * environment.atmosphere.densityKgM3 * airspeed * airspeed;
    const drag = dynamicPressure * weapon.dragCoefficient * weapon.referenceAreaM2;
    const acceleration = add(
      scale(normalize(airRelativeVelocity), -drag / state.massKg),
      { x: 0, y: 0, z: -scenario.environment.gravityMps2 },
    );
    state.velocity = add(state.velocity, scale(acceleration, dt));
    state.position = add(state.position, scale(state.velocity, dt));
    state.dragNewtons = canonicalRecordedDragNewtons(drag);
    state.thrustNewtons = 0;
    state.commandedG = 0;
    state.phase = "Jettisoned";
    state.weaponFlightState = "COAST";
    return;
  }

  const target = states.get(weapon.targetEntityId);
  if (!target || target.lifecycle === "TERMINATED") {
    state.lifecycle = "TERMINATED";
    state.phase = "Target unavailable";
    state.weaponFlightState = "TARGET_UNAVAILABLE";
    return;
  }

  const sinceLaunch = time - achievedWeaponLaunchTimeSeconds(
    weapon,
    scenario.fixedStepSeconds,
  );
  const relativePosition = subtract(target.position, state.position);
  const separation = Math.max(1, magnitude(relativePosition));
  const los = normalize(relativePosition);
  const relativeVelocity = subtract(target.velocity, state.velocity);
  const closingRate = Math.max(0, -dot(relativeVelocity, los));
  const losRateVector = scale(
    cross(relativePosition, relativeVelocity),
    1 / (separation * separation),
  );

  const environment = sampledEnvironment(scenario, environmentSampler, state.position, time);
  const atmosphere = environment.atmosphere;
  const wind = activeWind(scenario, time, environment.windEnuMps);
  const airRelativeVelocity = subtract(state.velocity, wind);
  const airspeed = Math.max(1, magnitude(airRelativeVelocity));
  const direction = normalize(state.velocity);
  const dynamicPressure = 0.5 * atmosphere.densityKgM3 * airspeed * airspeed;
  const drag = dynamicPressure * weapon.dragCoefficient * weapon.referenceAreaM2;
  const burning = sinceLaunch >= 0 && sinceLaunch < weapon.burnSeconds;
  const taperStart = weapon.thrustTaperSpeedMps * 0.9;
  const taperEnd = weapon.thrustTaperSpeedMps * 1.08;
  const thrustFactor = Math.max(
    0,
    Math.min(1, (taperEnd - airspeed) / Math.max(1, taperEnd - taperStart)),
  );
  const thrust = burning ? weapon.thrustNewtons * thrustFactor : 0;
  const propellantKg = Math.max(0, weapon.launchMassKg - weapon.dryMassKg);
  const massFlowKgS =
    weapon.burnSeconds > 0 ? propellantKg / weapon.burnSeconds : 0;
  if (burning) {
    const consumed = Math.min(state.fuelKg, massFlowKgS * dt);
    state.fuelKg -= consumed;
    state.massKg = Math.max(weapon.dryMassKg, state.massKg - consumed);
  }

  const nominalGuidance = scale(
    cross(losRateVector, los),
    weapon.navigationConstant * closingRate,
  );
  let loftAcceleration: Vec3 = { x: 0, y: 0, z: 0 };
  if (scenario.domain === "G2G") {
    // Surface-strike altitude is an absolute height in the local model frame.
    // Blend from the declared cruise altitude to the objective elevation inside
    // terminal range so both direct and lofted paths finish at the objective.
    const terminalBlend = Math.max(
      0,
      Math.min(1, separation / Math.max(1, weapon.seekerActivationRangeM)),
    );
    const commandedCruiseAltitude = Math.max(
      target.position.z + 30,
      weapon.commandedCruiseAltitudeM,
    );
    const loftApex =
      weapon.guidance === "loft"
        ? Math.max(
            commandedCruiseAltitude,
            target.position.z + Math.min(9000, Math.max(800, separation * 0.06)),
          )
        : commandedCruiseAltitude;
    const desiredAltitude =
      target.position.z + (loftApex - target.position.z) * terminalBlend;
    const altitudeError = desiredAltitude - state.position.z;
    loftAcceleration = {
      x: 0,
      y: 0,
      z: Math.max(
        -22,
        Math.min(22, altitudeError * 0.018 - state.velocity.z * 0.32),
      ),
    };
  } else if (weapon.guidance === "loft") {
    const desiredHeight = Math.min(9000, Math.max(800, separation * 0.06));
    const altitudeError = target.position.z + desiredHeight - state.position.z;
    loftAcceleration = {
      x: 0,
      y: 0,
      z: Math.max(-18, Math.min(18, altitudeError * 0.0025)),
    };
  }
  const maximumAcceleration = weapon.maximumCommandG * G0;
  // The commanded normal acceleration includes gravity compensation. Without
  // it a level-flight command would be interpreted as zero lift and a surface
  // launch would immediately fall into the reference plane.
  const gravityCompensation: Vec3 = { x: 0, y: 0, z: G0 };
  const unclampedGuidance = add(
    add(nominalGuidance, loftAcceleration),
    gravityCompensation,
  );
  const terminalGuidance = separation <= weapon.seekerActivationRangeM;
  const guidanceUpdateDue =
    terminalGuidance ||
    time - state.lastGuidanceUpdateSeconds >=
      weapon.datalinkUpdateSeconds;
  const guidanceAcceleration = !guidanceUpdateDue
    ? state.lastGuidanceAcceleration
    : clampMagnitude(unclampedGuidance, maximumAcceleration);
  if (guidanceUpdateDue) {
    state.lastGuidanceAcceleration = guidanceAcceleration;
    state.lastGuidanceUpdateSeconds = time;
  }

  const thrustAcceleration = scale(direction, thrust / state.massKg);
  const dragAcceleration = scale(normalize(airRelativeVelocity), -drag / state.massKg);
  const gravityAcceleration: Vec3 = { x: 0, y: 0, z: -G0 };
  const acceleration = add(
    add(thrustAcceleration, dragAcceleration),
    add(gravityAcceleration, guidanceAcceleration),
  );

  // Fixed-step semi-implicit integration is deterministic and remains stable
  // for this first browser 3DOF model at the declared 50 ms step.
  state.velocity = add(state.velocity, scale(acceleration, dt));
  state.position = add(state.position, scale(state.velocity, dt));
  state.position.z = Math.max(terrainElevation(environmentSampler, state.position), state.position.z);
  state.headingRad = Math.atan2(state.velocity.y, state.velocity.x);
  state.commandedG = magnitude(guidanceAcceleration) / G0;
  state.availableG = weapon.maximumCommandG;
  state.dragNewtons = canonicalRecordedDragNewtons(drag);
  state.thrustNewtons = thrust;
  state.phase = burning
    ? "Powered flight"
    : terminalGuidance
      ? "Terminal guidance"
      : "Midcourse guidance";
  state.weaponFlightState = burning
    ? "BOOST"
    : terminalGuidance
      ? "TERMINAL_GUIDANCE"
      : "COAST";
}

type WeaponTerminationEvaluation = {
  payload: Extract<SimulationEventPayload, { kind: "WEAPON_TERMINATED" }>;
  runTermination: Extract<EngineRun["termination"], "weapon_intercept" | "weapon_miss" | "weapon_expired" | "weapon_failed" | "target_unavailable">;
};

function achievedWeaponLaunchTimeSeconds(
  weapon: NonNullable<EngineEntityDefinition["weapon"]>,
  fixedStepSeconds: number,
): number {
  return modelTimeAtTick(
    firstFixedStepTickAtOrAfter(weapon.launchTimeSeconds ?? 0, fixedStepSeconds),
    fixedStepSeconds,
  );
}

function weaponActiveStepFraction(
  weaponState: RuntimeState,
  stepStartTimeSeconds: number,
  fixedStepSeconds: number,
): number {
  const weapon = weaponState.definition.weapon;
  if (!weapon) return 1;
  const expiryTimeSeconds =
    achievedWeaponLaunchTimeSeconds(weapon, fixedStepSeconds) +
    weapon.termination.maximumFlightTimeSeconds;
  return Math.max(
    0,
    Math.min(1, (expiryTimeSeconds - stepStartTimeSeconds) / fixedStepSeconds),
  );
}

function relativePositionAtFraction(start: Vec3, end: Vec3, fraction: number): Vec3 {
  return {
    x: start.x + (end.x - start.x) * fraction,
    y: start.y + (end.y - start.y) * fraction,
    z: start.z + (end.z - start.z) * fraction,
  };
}

function evaluateWeaponTermination(
  weaponState: RuntimeState,
  targetState: RuntimeState,
  from: WeaponFlightState | undefined,
  relativeStartM: Vec3,
  relativeEndM: Vec3,
  lifetimeClosestApproachM: number,
  closestApproachWitness: readonly [number, number],
  stepStartTimeSeconds: number,
  fixedStepSeconds: number,
  environmentSampler?: RuntimeEnvironmentSampler,
): WeaponTerminationEvaluation | null {
  const weapon = weaponState.definition.weapon;
  if (!weapon || weaponState.definition.weapon?.storeTransfer?.operation === "JETTISON" || from === undefined || from === "STOWED") return null;
  if (["INTERCEPT", "MISS", "EXPIRED", "FAILED", "SELF_DESTRUCT", "TARGET_UNAVAILABLE"].includes(from)) return null;

  const endTimeSeconds = stepStartTimeSeconds + fixedStepSeconds;
  const launchTimeSeconds = achievedWeaponLaunchTimeSeconds(weapon, fixedStepSeconds);
  const expiryTimeSeconds = launchTimeSeconds + weapon.termination.maximumFlightTimeSeconds;
  const activeStepFraction = weaponActiveStepFraction(
    weaponState,
    stepStartTimeSeconds,
    fixedStepSeconds,
  );
  const activeRelativeEndM = relativePositionAtFraction(
    relativeStartM,
    relativeEndM,
    activeStepFraction,
  );
  const closest = closestApproachOnRelativeSegment(relativeStartM, activeRelativeEndM);
  const sinceLaunchSeconds = endTimeSeconds - launchTimeSeconds;
  let to: WeaponTerminalState | undefined;
  let cause: WeaponTerminationEvaluation["payload"]["cause"] | undefined;
  let occurrenceTimeSeconds = endTimeSeconds;
  let runTermination: WeaponTerminationEvaluation["runTermination"] | undefined;

  if (weaponState.weaponFlightState === "TARGET_UNAVAILABLE" || targetState.lifecycle === "TERMINATED") {
    to = "TARGET_UNAVAILABLE";
    cause = "TARGET_UNAVAILABLE";
    runTermination = "target_unavailable";
  } else if (
    expiryTimeSeconds > stepStartTimeSeconds &&
    closest.distanceM <= weapon.termination.interceptRadiusM
  ) {
    to = "INTERCEPT";
    cause = "GEOMETRIC_INTERCEPT";
    runTermination = "weapon_intercept";
    occurrenceTimeSeconds =
      stepStartTimeSeconds + closest.fraction * activeStepFraction * fixedStepSeconds;
  } else if (expiryTimeSeconds <= endTimeSeconds) {
    to = "EXPIRED";
    cause = "FLIGHT_TIME_EXPIRED";
    runTermination = "weapon_expired";
    occurrenceTimeSeconds = expiryTimeSeconds;
  } else if (
    weaponState.position.z <= terrainElevation(environmentSampler, weaponState.position) &&
    endTimeSeconds > 1
  ) {
    to = "FAILED";
    cause = "TERRAIN_IMPACT";
    runTermination = "weapon_failed";
  } else if (
    sinceLaunchSeconds > weapon.burnSeconds + 2 &&
    magnitude(weaponState.velocity) < 80 &&
    closest.distanceM > 1000
  ) {
    to = "MISS";
    cause = "ENERGY_DEPLETED";
    runTermination = "weapon_miss";
  }
  if (!to || !cause || !runTermination) return null;

  weaponState.lifecycle = "TERMINATED";
  weaponState.weaponFlightState = to;
  weaponState.phase = to === "INTERCEPT"
    ? "Geometric intercept"
    : to === "TARGET_UNAVAILABLE"
      ? "Target unavailable"
      : to === "FAILED"
        ? "Terrain impact"
        : to === "EXPIRED"
          ? "Flight time expired"
          : "Miss";
  return {
    runTermination,
    payload: {
      kind: "WEAPON_TERMINATED",
      schemaVersion: SIMULATION_EVENT_PAYLOAD_SCHEMAS.WEAPON_TERMINATED,
      weaponId: weaponState.definition.id,
      targetId: targetState.definition.id,
      from: from as Exclude<WeaponFlightState, WeaponTerminalState>,
      to,
      cause,
      criterion: weapon.termination.criterion,
      closestApproachM: Number(lifetimeClosestApproachM.toFixed(6)),
      closestApproachPriorTimeSeconds: closestApproachWitness[0],
      closestApproachNextTimeSeconds: closestApproachWitness[1],
      occurrenceTimeSeconds: Number(occurrenceTimeSeconds.toFixed(6)),
      interceptRadiusM: weapon.termination.interceptRadiusM,
      maximumFlightTimeSeconds: weapon.termination.maximumFlightTimeSeconds,
      targetEffect: "NOT_MODELLED",
    },
  };
}

function toFrame(
  state: RuntimeState,
  scenario: EngineScenario,
  modelTimeSeconds: number,
  environmentSampler?: RuntimeEnvironmentSampler,
): EngineEntityFrame {
  const speed = magnitude(state.velocity);
  const atmosphere = sampledEnvironment(scenario, environmentSampler, state.position, modelTimeSeconds).atmosphere;
  return {
    id: state.definition.id,
    rddfId: state.definition.rddfId,
    designation: state.definition.designation,
    callsign: state.definition.callsign,
    affiliation: state.definition.affiliation,
    kind: state.definition.kind,
    symbolRole: state.definition.symbolRole,
    lifecycle: state.lifecycle,
    position: { ...state.position },
    velocity: { ...state.velocity },
    speedMps: speed,
    headingRad: state.headingRad,
    massKg: state.massKg,
    fuelKg: state.fuelKg,
    mach: speed / atmosphere.speedOfSoundMps,
    specificEnergyJkg: G0 * state.position.z + 0.5 * speed * speed,
    dragNewtons: state.dragNewtons,
    thrustNewtons: state.thrustNewtons,
    commandedG: state.commandedG,
    availableG: state.availableG,
    storeMassKg: state.storeMassKg,
    installedStoreIds: [...state.installedStoreIds].sort(),
    phase: state.phase,
    ...(state.weaponFlightState
      ? { weaponFlightState: state.weaponFlightState }
      : {}),
    ...(state.targetEffect
      ? { targetEffect: structuredClone(state.targetEffect) }
      : {}),
    valueState: state.definition.provenance.valueState,
    ...(state.aircraftOperationalState
      ? {
          aircraftOperationalState: state.aircraftOperationalState,
          aircraftOperationalStateValueState:
            state.lifecycle === "TERMINATED" ? "TERMINATED" as const : "VALID" as const,
          aircraftMovementValueState:
            state.lifecycle === "TERMINATED"
              ? "TERMINATED" as const
              : "VALID" as const,
        }
      : {}),
    ...(state.aircraftControl
      ? { aircraftControl: structuredClone(state.aircraftControl) }
      : {}),
  };
}

function buildEnvelopes(scenario: EngineScenario): CoverageEnvelope[] {
  return scenario.entities.flatMap((entity) => {
    const sensor = entity.sensor;
    if (!sensor) return [];
    const shared = {
      entityId: entity.id,
      affiliation: entity.affiliation,
      minimumAltitudeM: sensor.minimumAltitudeM,
      maximumAltitudeM: sensor.maximumAltitudeM,
      valueState: entity.provenance.valueState,
    } as const;
    return [
      {
        ...shared,
        id: `${entity.id}-detection`,
        kind: "DETECTION" as const,
        radiusM: sensor.detectionRadiusM,
        label: `${entity.designation} detection study volume`,
        basis: "DECLARED" as const,
      },
      {
        ...shared,
        id: `${entity.id}-tracking`,
        kind: "TRACKING" as const,
        radiusM: sensor.trackingRadiusM,
        label: `${entity.designation} tracking study volume`,
        basis: "DECLARED" as const,
      },
      {
        ...shared,
        id: `${entity.id}-engagement`,
        kind: "ENGAGEMENT" as const,
        radiusM: sensor.engagementRadiusM,
        label: `${entity.designation} engagement study envelope`,
        basis: "DECLARED" as const,
      },
      {
        ...shared,
        id: `${entity.id}-minimum`,
        kind: "MINIMUM_RANGE" as const,
        radiusM: sensor.minimumRangeM,
        label: `${entity.designation} minimum-range limitation`,
        basis: "DECLARED" as const,
      },
    ];
  });
}

export type EngineBatch = {
  completed: boolean;
  integratedSteps: number;
  modelTimeSeconds: number;
  progress: number;
};

/**
 * Fixed-step TypeScript model clock. The session owns model time and advances
 * only when runTicks is called; wall, render, and playback clocks never enter
 * the numerical loop.
 */
export class EngineSession {
  private readonly scenario: EngineScenario;
  private readonly states: Map<string, RuntimeState>;
  private readonly preStepStates: RuntimeState[];
  private readonly primaryWeapon?: RuntimeState;
  private readonly primaryTarget?: RuntimeState;
  private readonly frames: EngineRun["frames"] = [];
  private readonly eventJournal = new SimulationEventJournal();
  private readonly observerTrackStores = new Map<ObserverPerspective, TrackStore>();
  private readonly priorTrackReceipt = new Map<string, SimulationEventReceipt>();
  private readonly sampleEvery: number;
  private readonly terminalTick: number;
  private readonly recordingOrigin: EngineScenario["geospatial"]["origin"];
  private readonly environmentSampler?: RuntimeEnvironmentSampler;
  private termination: EngineRun["termination"] = "time_limit";
  private closestApproachM = Number.POSITIVE_INFINITY;
  private peakCommandG = 0;
  private integratedSteps = 0;
  private nonFiniteStateCount = 0;
  private minimumMassMarginKg = Number.POSITIVE_INFINITY;
  private completed = false;
  private recordedEntityStates = 0;
  private currentObserverStates: EngineObserverState[] = [];
  private lastObserverTick = -1;
  private closestEvidenceSnapshots?: readonly [WeaponEvidenceSnapshot, WeaponEvidenceSnapshot];
  private terminalPriorEvidenceSnapshot?: WeaponEvidenceSnapshot;

  constructor(scenario: EngineScenario, verificationPack?: Readonly<CompiledModelPack>) {
    scenario = {
      ...scenario,
      entities: [...scenario.entities]
        .sort((left, right) => compareCanonicalText(left.id, right.id)),
    };
    this.scenario = scenario;
    if (scenario.targetEffectAuthority !== undefined) {
      assertTargetEffectAuthority(scenario.targetEffectAuthority);
    }
    const retainedPack = findEngineCompiledModelPackAuthority(scenario.modelPack, verificationPack);
    const carriesWeaponTerminationAuthority = scenario.entities.some(
      (entity) => entity.kind === "GUIDED_WEAPON" && entity.weapon?.termination !== undefined,
    );
    assertRuntimeModelPackAuthority(scenario.modelPack, retainedPack, {
      requireCompiledWeaponTerminationAuthority: carriesWeaponTerminationAuthority,
    });
    this.terminalTick = firstFixedStepTickAtOrAfter(
      scenario.durationSeconds,
      scenario.fixedStepSeconds,
    );
    const maximumTicks = this.terminalTick;
    const regularFrames = Math.ceil(scenario.durationSeconds / 0.25) + 1;
    const eventForcedFrames = Math.min(maximumTicks + 1, MAX_SIMULATION_EVENTS);
    const admittedFrames = Math.min(maximumTicks + 1, regularFrames + eventForcedFrames);
    const admittedEntityStates = admittedFrames * scenario.entities.length;
    if (!Number.isSafeInteger(admittedEntityStates) || admittedEntityStates > 1_000_000) {
      throw new Error(
        `Scenario can retain ${admittedEntityStates} event-preserving entity states; maximum is 1000000.`,
      );
    }
    const admittedPack = scenario.geospatial?.environmentPack;
    const recordedBinding = scenario.environment.environmentPack;
    // Core-only numerical fixtures have no geographic authority by design. A
    // compiled product run must carry both halves; one without the other is a
    // malformed attempted admission, never a catalogue default resolution.
    if (Boolean(admittedPack) !== Boolean(recordedBinding)) {
      throw new Error("Engine environment pack and binding must be supplied together.");
    }
    if (admittedPack && recordedBinding) {
      assertEnvironmentPack(admittedPack);
      const environmentBinding = environmentPackBinding(admittedPack);
      const runtimeProjection = environmentRuntimeProjection(admittedPack);
      if (
        recordedBinding.schemaVersion !== environmentBinding.schemaVersion ||
        recordedBinding.id !== environmentBinding.id ||
        recordedBinding.version !== environmentBinding.version ||
        recordedBinding.digest !== environmentBinding.digest
      ) {
        throw new Error("Engine environment-pack binding does not match the admitted pack.");
      }
      if (!runtimeProjection || !scenario.environment.runtimeEnvironment
        || scenario.environment.runtimeEnvironment.environmentPack.digest !== runtimeProjection.environmentPack.digest
        || scenario.environment.runtimeEnvironment.terrain.digest !== runtimeProjection.terrain.digest
        || scenario.environment.runtimeEnvironment.atmosphere.digest !== runtimeProjection.atmosphere.digest) {
        throw new Error("Engine runtime environment projection does not match the admitted pack.");
      }
      if (
        scenario.environment.temperatureOffsetC !== admittedPack.weather.temperatureOffsetC ||
        scenario.environment.windMps.x !== admittedPack.weather.windEastMps ||
        scenario.environment.windMps.y !== admittedPack.weather.windNorthMps ||
        scenario.environment.studyArea.id !== admittedPack.content.studyAreaId ||
        scenario.environment.studyArea.weatherPresetId !== admittedPack.content.weather.id
      ) {
        throw new Error("Engine environment values do not match the admitted environment pack.");
      }
      this.environmentSampler = createEnvironmentSampler(admittedPack);
      for (const entity of scenario.entities) {
        if (entity.kind !== "AIRCRAFT") continue;
        const points = [entity.initial.position, ...(entity.route ?? [])];
        for (const point of points) {
          const surfaceMslM = terrainElevation(this.environmentSampler, point);
          if (point.z <= surfaceMslM) {
            throw new Error(`Aircraft ${entity.id} start or route point is at or below admitted terrain.`);
          }
        }
      }
    }
    for (const [index, event] of scenario.events.entries()) {
      const values = [
        event.startSeconds,
        event.durationSeconds,
        event.vectorMps.x,
        event.vectorMps.y,
        event.vectorMps.z,
      ];
      if (values.some((value) => !Number.isFinite(value))) {
        throw new Error(`Engine event ${index} contains a non-finite value.`);
      }
      if (event.startSeconds < 0 || event.durationSeconds <= 0) {
        throw new Error(
          `Engine event ${index} requires a non-negative start and positive duration.`,
        );
      }
      if (event.type !== "WIND_SHIFT") {
        throw new Error(`Unsupported engine event type at index ${index}.`);
      }
    }
    const unmodeledAircraft = scenario.entities.find(
      (entity) => entity.kind === "AIRCRAFT" && !entity.aircraft,
    );
    if (unmodeledAircraft) {
      throw new Error(
        `Aircraft ${unmodeledAircraft.id} has no admitted aircraft model.`,
      );
    }
    for (const entity of scenario.entities) {
      if (!entity.route?.length) continue;
      const radii = entity.routePlan?.waypointAcceptanceRadiiM;
      if (
        (entity.routePlan?.schemaVersion !== "vector.route-plan.v1" &&
          entity.routePlan?.schemaVersion !== "vector.route-plan.v2") ||
        !radii ||
        radii.length !== entity.route.length ||
        radii[0] !== 1 ||
        radii.some((radius) => !Number.isFinite(radius) || radius < 1 || radius > 25_000)
      ) {
        throw new Error(`Route plan for ${entity.id} is missing or invalid.`);
      }
      if (
        entity.routePlan.schemaVersion === "vector.route-plan.v2" &&
        (!entity.routePlan.waypointTransitions ||
          entity.routePlan.waypointTransitions.length !== entity.route.length ||
          entity.routePlan.waypointTransitions.some((transition, index) =>
            index === 0
              ? transition !== "START"
              : (transition !== "FLY_BY" && transition !== "FLY_OVER") ||
                (transition === "FLY_OVER" && radii[index] !== 1),
          ))
      ) {
        throw new Error(`Route plan transitions for ${entity.id} are missing or invalid.`);
      }
    }
    const admittedWeaponSeekerModes = new Set([
      "UNAVAILABLE",
      "ACTIVE_RADAR",
      "INFRARED",
      "PASSIVE_RADIATION",
    ]);
    const admittedWeaponSupportRequirements = new Set([
      "UNAVAILABLE",
      "NONE",
      "TRACK_UPDATE",
    ]);
    const admittedLaunchAuthorizations = new Set([
      "SCHEDULED_TEST_ONLY",
      "TRACK_REQUIRED",
    ]);
    if (scenario.airMission) {
      const missionMaterial = structuredClone(scenario.airMission) as Record<string, unknown>;
      delete missionMaterial.compiledDigest;
      if (
        sha256HexSync(scenario.airMission.authored) !== scenario.airMission.authoredDigest ||
        sha256HexSync(missionMaterial) !== scenario.airMission.compiledDigest
      ) {
        throw new Error("Air mission lineage digest is invalid.");
      }
    }
    const admittedTransferIds = new Set<string>();
    const admittedTransferStores = new Set<string>();
    let scheduledGuidedReleaseCount = 0;
    for (const entity of scenario.entities) {
      if (!entity.weapon) continue;
      const launchTimeSeconds = entity.weapon.launchTimeSeconds;
      if (
        entity.kind === "GUIDED_WEAPON" &&
        launchTimeSeconds !== null &&
        entity.lifecycle !== "STOWED"
      ) {
        throw new Error(`Scheduled guided weapon ${entity.id} must begin STOWED.`);
      }
      if (
        entity.kind === "GUIDED_WEAPON" &&
        launchTimeSeconds !== null &&
        entity.weapon.storeTransfer?.operation !== "JETTISON"
      ) {
        scheduledGuidedReleaseCount += 1;
      }
      if (launchTimeSeconds !== null && launchTimeSeconds > scenario.durationSeconds) {
        throw new Error(`Weapon ${entity.id} launches after scenario duration.`);
      }
      if (
        launchTimeSeconds !== null &&
        firstFixedStepTickAtOrAfter(launchTimeSeconds, scenario.fixedStepSeconds) >=
          this.terminalTick
      ) {
        throw new Error(`Weapon ${entity.id} launches outside the executable run window.`);
      }
      const admission = entity.weapon.admission;
      const termination = entity.weapon.termination;
      const projectedTermination = scenario.modelPack.weaponTerminations?.find(
        (candidate) => candidate.modelId === admission?.weaponModelId,
      );
      if (
        !admission ||
        admission.modelPackDigest !== scenario.modelPack.digest ||
        admission.modelPackDigest !== entity.provenance.modelPackDigest ||
        admission.weaponModelId !== entity.provenance.modelId ||
        !admission.stationId ||
        !admission.compatibilityRuleId ||
        !admittedWeaponSeekerModes.has(admission.seekerMode) ||
        !admittedWeaponSupportRequirements.has(admission.supportRequirement) ||
        !admittedLaunchAuthorizations.has(admission.launchAuthorization)
      ) {
        throw new Error(`Weapon ${entity.id} has no valid compiled admission.`);
      }
      if (
        !termination ||
        termination.schemaVersion !== "vector.weapon-termination-model.v1" ||
        termination.intendedUse !== "ENGINE_VERIFICATION_ONLY" ||
        termination.criterion !== "GEOMETRIC_CLOSEST_APPROACH" ||
        !Number.isFinite(termination.interceptRadiusM) ||
        termination.interceptRadiusM <= 0 ||
        !Number.isFinite(termination.maximumFlightTimeSeconds) ||
        termination.maximumFlightTimeSeconds <= 0
      ) {
        throw new Error(`Weapon ${entity.id} has no valid termination admission.`);
      }
      if (
        (scenario.modelPack.weaponTerminations?.length ?? 0) > 0 &&
        (
          !projectedTermination ||
          projectedTermination.modelVersion !== entity.provenance.modelVersion ||
          projectedTermination.termination.schemaVersion !== termination.schemaVersion ||
          projectedTermination.termination.intendedUse !== termination.intendedUse ||
          projectedTermination.termination.criterion !== termination.criterion ||
          projectedTermination.termination.interceptRadiusM !== termination.interceptRadiusM ||
          projectedTermination.termination.maximumFlightTimeSeconds !==
            termination.maximumFlightTimeSeconds
        )
      ) {
        throw new Error(`Weapon ${entity.id} termination is not bound to the admitted compiled model.`);
      }
      const transfer = entity.weapon.storeTransfer;
      const launcher = scenario.entities.find((candidate) => candidate.id === entity.weapon!.launchPlatformId);
      const fullTransferForStore = scenario.airMission?.assignment.storeTransfers?.find(
        (candidate) => candidate.storeEntityId === entity.id,
      );
      const missionLauncher = launcher?.kind === "AIRCRAFT" && scenario.airMission &&
        launcher.provenance.sourceObjectId === scenario.airMission.assignment.aircraftId &&
        (transfer !== undefined || fullTransferForStore !== undefined);
      if (missionLauncher) {
        const full = fullTransferForStore;
        const exactTransferFields = [
          "authority", "compatibilityRuleId", "digest", "evidenceRefIds", "id",
          "installedDragAreaM2", "launcherEntityId", "launcherSourceObjectId",
          "limitationIds", "operation", "requestedTick", "requestedTimeSeconds",
          "schemaVersion", "stationId", "storeEntityId", "storeMassKg", "storeModelId",
          "storeOrdinal", "storeSourceObjectId", "validity", "valueState",
        ];
        const compact = transfer
          ? (() => {
              const value = structuredClone(transfer) as Record<string, unknown>;
              delete value.missionDigest;
              return value;
            })()
          : undefined;
        const digestMaterial = full
          ? (() => {
              const value = structuredClone(full) as Record<string, unknown>;
              delete value.digest;
              return value;
            })()
          : undefined;
        if (
          !scenario.airMission || !transfer || !full || !compact || !digestMaterial ||
          JSON.stringify(Object.keys(full).sort()) !== JSON.stringify(exactTransferFields) ||
          transfer.missionDigest !== scenario.airMission.compiledDigest ||
          sha256HexSync(compact) !== sha256HexSync(full) ||
          sha256HexSync(digestMaterial) !== full.digest ||
          full.schemaVersion !== "vector.compiled-airborne-store-transfer.v1" ||
          full.authority !== "GENERIC_PUBLIC_EDUCATIONAL" ||
          full.validity.schemaVersion !== "vector.airborne-store-transfer-validity.v1" ||
          full.validity.intendedUse !== "PUBLIC_EDUCATIONAL" ||
          full.validity.mechanism !== "AIRBORNE_STORE_RELEASE_OR_JETTISON" ||
          full.validity.minimumInstalledDragAreaM2 !== AIRBORNE_STORE_TRANSFER_INSTALLED_DRAG_AREA_M2.minimum ||
          full.validity.maximumInstalledDragAreaM2 !== AIRBORNE_STORE_TRANSFER_INSTALLED_DRAG_AREA_M2.maximum ||
          !["MODEL_ASSUMPTION", "USER_AUTHORED"].includes(full.valueState) ||
          !["RELEASE", "JETTISON"].includes(full.operation) ||
          (full.requestedTimeSeconds !== null &&
            (!Number.isFinite(full.requestedTimeSeconds) || full.requestedTimeSeconds < 0)) ||
          full.requestedTimeSeconds !== entity.weapon.launchTimeSeconds ||
          full.requestedTick !== firstFixedStepTickAtOrAfter(full.requestedTimeSeconds, scenario.fixedStepSeconds) ||
          full.requestedTimeSeconds !== null &&
            firstFixedStepTickAtOrAfter(full.requestedTimeSeconds, scenario.fixedStepSeconds) >= this.terminalTick ||
          !Number.isFinite(full.storeMassKg) || full.storeMassKg <= 0 ||
          full.storeMassKg !== entity.weapon.launchMassKg ||
          !Number.isFinite(full.installedDragAreaM2) ||
          full.installedDragAreaM2 < full.validity.minimumInstalledDragAreaM2 ||
          full.installedDragAreaM2 > full.validity.maximumInstalledDragAreaM2 ||
          !full.evidenceRefIds.length || !full.limitationIds.length ||
          full.launcherEntityId !== launcher.id ||
          full.launcherSourceObjectId !== launcher.provenance.sourceObjectId ||
          full.storeEntityId !== entity.id ||
          full.storeSourceObjectId !== entity.provenance.sourceObjectId ||
          full.storeModelId !== entity.provenance.modelId ||
          full.stationId !== entity.weapon.admission.stationId ||
          full.compatibilityRuleId !== entity.weapon.admission.compatibilityRuleId ||
          !Number.isSafeInteger(full.storeOrdinal) || full.storeOrdinal < 1 ||
          admittedTransferIds.has(full.id) || admittedTransferStores.has(full.storeEntityId)
        ) {
          throw new Error(`[STORE_TRANSFER_AUTHORITY_INVALID] Store ${entity.id} has no exact compiled airborne-transfer authority.`);
        }
        admittedTransferIds.add(full.id);
        admittedTransferStores.add(full.storeEntityId);
      } else if (transfer !== undefined) {
        throw new Error(`[STORE_TRANSFER_LAUNCHER_INVALID] Store ${entity.id} transfer authority requires an aircraft launcher.`);
      }
    }
    if (
      scenario.airMission &&
      admittedTransferIds.size !== (scenario.airMission.assignment.storeTransfers?.length ?? 0)
    ) {
      throw new Error("[STORE_TRANSFER_AUTHORITY_INVALID] Air mission contains an absent or duplicate store-transfer authority.");
    }
    for (const entity of scenario.entities) {
      const sensor = entity.observerSensor;
      if (!sensor) continue;
      assertObserverSensorBoundToModelPack(entity, scenario);
      if (
        !["vector.observer-sensor-admission.v1", "vector.observer-sensor-admission.v2"].includes(sensor.schemaVersion) ||
        sensor.modelPackDigest !== scenario.modelPack.digest ||
        !sensor.modelId ||
        !sensor.modelVersion ||
        !sensor.evidenceRefIds.length ||
        !["RADAR", "INFRARED", "VISUAL"].includes(sensor.sensorKind) ||
        !["OFF", "SEARCH"].includes(sensor.mode) ||
        !Number.isFinite(sensor.detectionRangeM) || sensor.detectionRangeM <= 0 ||
        !Number.isFinite(sensor.minimumRangeM) || sensor.minimumRangeM < 0 || sensor.minimumRangeM > sensor.detectionRangeM ||
        !Number.isFinite(sensor.scanPeriodS) || sensor.scanPeriodS <= 0 ||
        !Number.isFinite(sensor.azimuthFieldOfViewRad) || sensor.azimuthFieldOfViewRad <= 0 || sensor.azimuthFieldOfViewRad > Math.PI * 2 ||
        !Number.isFinite(sensor.elevationFieldOfViewRad) || sensor.elevationFieldOfViewRad <= 0 || sensor.elevationFieldOfViewRad > Math.PI
      ) {
        throw new Error(`Observer sensor ${entity.id} has no valid compiled admission.`);
      }
      if (sensor.schemaVersion === "vector.observer-sensor-admission.v2") {
        assertVerificationTrackModel(
          sensor.verificationTrackModel,
          scenario.modelPack.intendedUse.id,
        );
      } else if (sensor.verificationTrackModel !== undefined) {
        throw new Error(`Observer sensor ${entity.id} cannot attach a track model to admission v1.`);
      }
    }
    const groundMission = scenario.airMission?.start.entryState === "GROUND"
      ? scenario.airMission
      : undefined;
    const groundAircraft = scenario.entities.filter(
      (entity) => entity.kind === "AIRCRAFT" && entity.groundOperation !== undefined,
    );
    if (
      groundMission
        ? scenario.airMissionRuntime === undefined ||
          groundAircraft.length !== 1 ||
          groundAircraft[0]?.provenance.sourceObjectId !== groundMission.assignment.aircraftId
        : scenario.airMissionRuntime !== undefined || groundAircraft.length !== 0
    ) {
      throw new Error("Scenario has no authoritative ground-operation admission.");
    }
    for (const aircraft of scenario.entities.filter(
      (entity) => entity.kind === "AIRCRAFT",
    )) {
      const ground = aircraft.groundOperation;
      if (ground) {
        const binding = scenario.airMissionRuntime;
        const validDigest = (value: string) => /^[0-9a-f]{64}$/.test(value);
        const exactGroundFields = [
          "climboutFlightPathAngleRad",
          "climboutSpeedMps",
          "enrouteTransitionHeightM",
          "executionAuthority",
          "groundDynamicsDigest",
          "liftoffSpeedMps",
          "maximumCrosswindMps",
          "maximumTailwindMps",
          "maximumTakeoffMassKg",
          "minimumTakeoffFuelKg",
          "missionDigest",
          "posture",
          "releaseTimeSeconds",
          "rollingResistanceCoefficient",
          "rotationSpeedMps",
          "runwayEndElevationM",
          "runwayEvidenceDigest",
          "runwayHeadingDegTrue",
          "runwayLengthM",
          "schemaVersion",
          "takeoffLiftCoefficient",
        ];
        const authoritativeGround = scenario.airMission?.assignment.groundEnvelope.groundDynamics;
        const authoritativeGroundFields = [
          "authority",
          "climboutFlightPathAngleRad",
          "climboutSpeedMps",
          "digest",
          "enrouteTransitionHeightM",
          "evidenceRefIds",
          "liftoffSpeedMps",
          "limitationIds",
          "maximumCrosswindMps",
          "maximumTailwindMps",
          "maximumTakeoffMassKg",
          "minimumTakeoffFuelKg",
          "rollingResistanceCoefficient",
          "rotationSpeedMps",
          "schemaVersion",
          "takeoffLiftCoefficient",
          "validity",
          "valueState",
        ];
        const authoritativeGroundDigestValid = authoritativeGround !== undefined
          && (() => {
            const material = structuredClone(authoritativeGround) as Record<string, unknown>;
            delete material.digest;
            return sha256HexSync(material) === authoritativeGround.digest;
          })();
        const authoredRunway = scenario.airMission?.authored.start.posture === "AIRBORNE"
          ? undefined
          : scenario.airMission?.authored.start.runway;
        if (
          JSON.stringify(Object.keys(ground).sort()) !== JSON.stringify(exactGroundFields) ||
          ground.schemaVersion !== "vector.aircraft-ground-operation.v2" ||
          !["PARKING", "RUNWAY", "GROUND_ALERT_QRA"].includes(ground.posture) ||
          !Number.isFinite(ground.releaseTimeSeconds) ||
          ground.releaseTimeSeconds < 0 ||
          !validDigest(ground.missionDigest) ||
          !validDigest(ground.runwayEvidenceDigest) ||
          !validDigest(ground.groundDynamicsDigest) ||
          ground.executionAuthority !== "ADMITTED_GENERIC_EDUCATIONAL" ||
          !Number.isFinite(ground.maximumTakeoffMassKg) || ground.maximumTakeoffMassKg <= 0 ||
          !Number.isFinite(ground.minimumTakeoffFuelKg) || ground.minimumTakeoffFuelKg <= 0 ||
          !Number.isFinite(ground.rollingResistanceCoefficient) || ground.rollingResistanceCoefficient < 0 || ground.rollingResistanceCoefficient >= 1 ||
          !Number.isFinite(ground.rotationSpeedMps) || ground.rotationSpeedMps <= 0 ||
          !Number.isFinite(ground.liftoffSpeedMps) || ground.liftoffSpeedMps < ground.rotationSpeedMps ||
          !Number.isFinite(ground.takeoffLiftCoefficient) || ground.takeoffLiftCoefficient <= 0 ||
          !Number.isFinite(ground.climboutSpeedMps) || ground.climboutSpeedMps < ground.liftoffSpeedMps ||
          !Number.isFinite(ground.climboutFlightPathAngleRad) || ground.climboutFlightPathAngleRad <= 0 || ground.climboutFlightPathAngleRad >= Math.PI / 2 ||
          !Number.isFinite(ground.enrouteTransitionHeightM) || ground.enrouteTransitionHeightM <= 0 ||
          !Number.isFinite(ground.maximumTailwindMps) || ground.maximumTailwindMps <= 0 ||
          !Number.isFinite(ground.maximumCrosswindMps) || ground.maximumCrosswindMps <= 0 ||
          !binding || sha256HexSync(binding) !== sha256HexSync(ground) ||
          scenario.airMission?.start.entryState !== "GROUND" ||
          scenario.airMission.compiledDigest !== ground.missionDigest ||
          scenario.airMission.authored.start.posture === "AIRBORNE" ||
          scenario.airMission.authored.start.posture !== ground.posture ||
          scenario.airMission.authored.start.readinessDelaySeconds !== ground.releaseTimeSeconds ||
          scenario.airMission.authored.start.runway.evidence.digest !== ground.runwayEvidenceDigest ||
          !authoritativeGround ||
          JSON.stringify(Object.keys(authoritativeGround).sort()) !== JSON.stringify(authoritativeGroundFields) ||
          authoritativeGround.schemaVersion !== "vector.compiled-aircraft-ground-dynamics.v1" ||
          authoritativeGround.authority !== "GENERIC_PUBLIC_EDUCATIONAL" ||
          authoritativeGround.valueState !== "MODEL_ASSUMPTION" ||
          authoritativeGround.validity.schemaVersion !==
            "vector.aircraft-ground-dynamics-validity.v1" ||
          authoritativeGround.validity.intendedUse !== "PUBLIC_EDUCATIONAL" ||
          authoritativeGround.validity.mechanism !==
            "RUNWAY_ROLL_ROTATION_CLIMBOUT" ||
          !Array.isArray(authoritativeGround.evidenceRefIds) || !authoritativeGround.evidenceRefIds.length ||
          authoritativeGround.evidenceRefIds.some((value) => typeof value !== "string" || !value) ||
          !Array.isArray(authoritativeGround.limitationIds) || !authoritativeGround.limitationIds.length ||
          authoritativeGround.limitationIds.some((value) => typeof value !== "string" || !value) ||
          !Number.isFinite(authoritativeGround.maximumCrosswindMps) || authoritativeGround.maximumCrosswindMps <= 0 ||
          !authoritativeGroundDigestValid ||
          authoritativeGround.digest !== ground.groundDynamicsDigest ||
          authoritativeGround.maximumTakeoffMassKg !== ground.maximumTakeoffMassKg ||
          authoritativeGround.minimumTakeoffFuelKg !== ground.minimumTakeoffFuelKg ||
          authoritativeGround.rollingResistanceCoefficient !== ground.rollingResistanceCoefficient ||
          authoritativeGround.rotationSpeedMps !== ground.rotationSpeedMps ||
          authoritativeGround.liftoffSpeedMps !== ground.liftoffSpeedMps ||
          authoritativeGround.takeoffLiftCoefficient !== ground.takeoffLiftCoefficient ||
          authoritativeGround.climboutSpeedMps !== ground.climboutSpeedMps ||
          authoritativeGround.climboutFlightPathAngleRad !== ground.climboutFlightPathAngleRad ||
          authoritativeGround.enrouteTransitionHeightM !== ground.enrouteTransitionHeightM ||
          authoritativeGround.maximumTailwindMps !== ground.maximumTailwindMps ||
          authoritativeGround.maximumCrosswindMps !== ground.maximumCrosswindMps ||
          !authoredRunway ||
          authoredRunway.lengthM !== ground.runwayLengthM ||
          authoredRunway.end.elevation.valueM !== ground.runwayEndElevationM ||
          Math.abs(aircraft.initial.headingRad - (90 - ground.runwayHeadingDegTrue) * Math.PI / 180) > 1e-12 ||
          aircraft.initial.massKg > ground.maximumTakeoffMassKg ||
          aircraft.initial.fuelKg < ground.minimumTakeoffFuelKg ||
          magnitude(aircraft.initial.velocity) !== 0
        ) {
          throw new Error(`Aircraft ${aircraft.id} has no valid ground-operation admission.`);
        }
      }
      const installedStores = scenario.entities.filter(
        (entity) =>
          entity.lifecycle === "STOWED" &&
          entity.weapon?.launchPlatformId === aircraft.id,
      );
      const storeMassKg = installedStores.reduce(
        (total, store) => total + store.weapon!.launchMassKg,
        0,
      );
      const expectedMassKg =
        aircraft.aircraft!.emptyMassKg + aircraft.initial.fuelKg + storeMassKg;
      if (Math.abs(aircraft.initial.massKg - expectedMassKg) > 1e-6) {
        throw new Error(
          `Aircraft ${aircraft.id} initial mass must equal empty mass, fuel, and installed stores.`,
        );
      }
    }
    if (scheduledGuidedReleaseCount > 1) {
      throw new Error(
        "Engine termination admission allows at most one scheduled guided release.",
      );
    }
    const legacyStudyArea = scenario.environment.studyArea;
    this.recordingOrigin = scenario.geospatial?.origin ?? {
      schemaVersion: "vector.scenario-origin.v1" as const,
      id: `legacy:${legacyStudyArea?.id ?? "unlocated"}:origin`,
      frame: "ENU" as const,
      geographic: {
        longitudeDeg: legacyStudyArea?.anchor.longitude ?? 0,
        latitudeDeg: legacyStudyArea?.anchor.latitude ?? 0,
        altitude: { valueM: 0, datum: "ELLIPSOID" as const },
      },
      transformVersion: "vector.wgs84-ecef-local.v1" as const,
    };
    this.states = new Map(
      scenario.entities.map((definition) => [definition.id, initialState(definition)]),
    );
    for (const store of scenario.entities) {
      if (store.lifecycle !== "STOWED" || !store.weapon) continue;
      const launcher = this.states.get(store.weapon.launchPlatformId);
      if (!launcher || launcher.definition.kind !== "AIRCRAFT") continue;
      launcher.installedStoreIds.add(store.id);
      launcher.storeMassKg += store.weapon.launchMassKg;
      launcher.installedStoreDragAreaM2 += store.weapon.storeTransfer?.installedDragAreaM2 ?? 0;
    }
    this.preStepStates = [...this.states.values()].map(snapshotRuntimeState);
    const primaryWeaponDefinition = scenario.entities.find(
      (entity) =>
        entity.kind === "GUIDED_WEAPON" &&
        entity.weapon !== undefined &&
        entity.weapon.launchTimeSeconds !== null &&
        entity.weapon.storeTransfer?.operation !== "JETTISON",
    ) ?? scenario.entities.find(
        (entity) =>
          entity.kind === "GUIDED_WEAPON" &&
          entity.weapon !== undefined &&
          entity.weapon.launchTimeSeconds !== null,
      );
    this.primaryWeapon = this.states.get(primaryWeaponDefinition?.id ?? "");
    this.primaryTarget = this.primaryWeapon?.definition.weapon
      ? this.states.get(this.primaryWeapon.definition.weapon.targetEntityId)
      : undefined;
    this.sampleEvery = Math.max(1, Math.round(0.25 / scenario.fixedStepSeconds));
    if (!this.primaryWeapon || !this.primaryTarget) {
      this.termination = "invalid_scenario";
      this.completed = true;
    }
  }

  private updateObserverState(tick: number, modelTimeSeconds: number) {
    if (this.lastObserverTick === tick || tick >= this.terminalTick) return;
    const results = observerStates(
      [...this.states.values()],
      this.scenario,
      modelTimeSeconds,
      this.scenario.fixedStepSeconds,
      this.observerTrackStores,
    );
    this.currentObserverStates = results.map((item) => item.state);
    this.lastObserverTick = tick;
    for (const result of results) {
      if (!result.sensorEntityId) continue;
      for (const transition of result.transitions) {
        const priorKey = `${transition.owner}\u0000${transition.trackId}`;
        const prior = this.priorTrackReceipt.get(priorKey);
        const ownerAffiliation = transition.owner === "IAF" ? "BLUE" : "RED";
        const receipt = this.eventJournal.emit({
          localKey: transition.localKey,
          tick,
          modelTimeSeconds,
          phase: "TRACKING",
          producer: { subsystem: "SENSOR_TRACK", entityId: result.sensorEntityId },
          ownerAffiliation,
          knowledgeScope: "SIDE_OWNED",
          participants: [{ entityId: result.sensorEntityId, role: "SENSOR" }],
          causes: prior ? [{ kind: "EVENT_RECEIPT", receipt: prior }] : [],
          correlationId: transition.trackId,
          payload: {
            kind: "TRACK_STATE_CHANGED",
            schemaVersion: SIMULATION_EVENT_PAYLOAD_SCHEMAS.TRACK_STATE_CHANGED,
            perspective: transition.owner,
            trackId: transition.trackId,
            from: transition.from,
            to: transition.to,
            cause: transition.cause,
            sensorModelId: transition.source.sensorModelId,
            sensorModelVersion: transition.source.sensorModelVersion,
            modelPackDigest: transition.source.modelPackDigest,
            sourceAssociationId: transition.sourceAssociationId,
            sourceSequence: transition.sourceSequence,
            sourceTimeSeconds: transition.sourceTimeSeconds,
            observationId: transition.observationId ?? null,
            estimateValueState: "ESTIMATED",
            uncertaintyValueState: "ESTIMATED",
          },
        });
        this.priorTrackReceipt.set(priorKey, receipt);
      }
    }
  }

  private projectFrame(
    modelTimeSeconds: number,
    frameStates = [...this.states.values()],
    observerStates: readonly EngineObserverState[] = this.currentObserverStates,
  ): EngineFrame {
    const primaryWeapon = frameStates.find(
      (state) => state.definition.id === this.primaryWeapon!.definition.id,
    )!;
    const primaryTarget = frameStates.find(
      (state) => state.definition.id === this.primaryTarget!.definition.id,
    )!;
    const relativePosition = subtract(primaryTarget.position, primaryWeapon.position);
    const relativeVelocity = subtract(primaryTarget.velocity, primaryWeapon.velocity);
    const separationM = magnitude(relativePosition);
    const los = normalize(relativePosition);
    const closureRateMps = -dot(relativeVelocity, los);
    const lineOfSightRateRadS =
      magnitude(cross(relativePosition, relativeVelocity)) /
      Math.max(1, separationM * separationM);
    const visibleStates = frameStates.filter(
      (state) => state.lifecycle !== "STOWED",
    );
    return {
      t: modelTimeSeconds,
      entities: visibleStates.map((state) => toFrame(
        state,
        this.scenario,
        modelTimeSeconds,
        this.environmentSampler,
      )),
      geographicPositions: visibleStates.map((state) => ({
        entityId: state.definition.id,
        position: enginePositionToGeographic(state.position, this.recordingOrigin),
      })),
      primaryWeaponId: primaryWeapon.definition.id,
      primaryTargetId: primaryTarget.definition.id,
      separationM,
      closureRateMps,
      lineOfSightRateRadS,
      observerStates: structuredClone([...observerStates]),
    };
  }

  private weaponEvidenceSnapshot(
    retained: WeaponEvidenceSnapshot | undefined,
    modelTimeSeconds: number,
    frameStates: readonly RuntimeState[],
  ): WeaponEvidenceSnapshot {
    if (!retained) {
      return {
        modelTimeSeconds,
        states: frameStates.map(snapshotRuntimeState),
        observerStates: this.currentObserverStates,
      };
    }
    retained.modelTimeSeconds = modelTimeSeconds;
    for (let index = 0; index < frameStates.length; index += 1) {
      refreshRuntimeStateSnapshot(retained.states[index]!, frameStates[index]!);
    }
    retained.observerStates = this.currentObserverStates;
    return retained;
  }

  private retainFrame(frame: EngineFrame) {
    if (this.recordedEntityStates + frame.entities.length > 1_000_000) {
      throw new Error("Event-preserving frames exceed 1000000 recorded entity states.");
    }
    const frameIndex = this.frames.length;
    this.frames.push(frame);
    this.recordedEntityStates += frame.entities.length;
    return { frameIndex, separationM: frame.separationM };
  }

  private captureFrame(modelTimeSeconds: number) {
    return this.retainFrame(this.projectFrame(modelTimeSeconds));
  }

  runTicks(maximumTicks: number): EngineBatch {
    if (!Number.isSafeInteger(maximumTicks) || maximumTicks < 1) {
      throw new Error("Engine tick batches must contain a positive safe integer.");
    }
    let batchSteps = 0;
    while (!this.completed && batchSteps < maximumTicks) {
      const primaryWeapon = this.primaryWeapon!;
      const primaryTarget = this.primaryTarget!;
      const tick = this.integratedSteps;
      const scenario = this.scenario;
      const time = modelTimeAtTick(tick, scenario.fixedStepSeconds);
      const eventTime = recordedModelTimeAtTick(tick, scenario.fixedStepSeconds);
      if (tick === 0) {
        this.eventJournal.emit({
          localKey: "run-started",
          tick,
          modelTimeSeconds: eventTime,
          phase: "LIFECYCLE",
          producer: { subsystem: "RUN_COORDINATOR" },
          knowledgeScope: "WORLD",
          participants: [],
          causes: [],
          payload: {
            kind: "RUN_STARTED",
            schemaVersion: SIMULATION_EVENT_PAYLOAD_SCHEMAS.RUN_STARTED,
            scenarioId: scenario.id,
            scenarioVersion: scenario.version,
          },
        });
        for (const state of this.states.values()) {
          if (state.lifecycle === "STOWED" || state.lifecycle === "TERMINATED") continue;
          this.eventJournal.emit({
            localKey: `entity-entered:${state.definition.id}`,
            tick,
            modelTimeSeconds: eventTime,
            phase: "LIFECYCLE",
            producer: {
              subsystem: "ENTITY_LIFECYCLE",
              entityId: state.definition.id,
            },
            knowledgeScope: "WORLD",
            participants: [{ entityId: state.definition.id, role: "SUBJECT" }],
            causes: [],
            payload: {
              kind: "ENTITY_ENTERED_WORLD",
              schemaVersion: SIMULATION_EVENT_PAYLOAD_SCHEMAS.ENTITY_ENTERED_WORLD,
              entityKind: state.definition.kind,
              lifecycle: state.lifecycle,
            },
          });
        }
      }
      const beforeActivation = new Map(
        [...this.states.values()].map((state) => [state.definition.id, state.lifecycle]),
      );
      const storeTransferEvents: Array<Extract<SimulationEventPayload, { kind: "AIRBORNE_STORE_TRANSFER_OUTCOME" }>> = [];
      for (const state of this.states.values()) {
        const transfer = activateWeapon(
          state,
          this.states,
          tick,
          scenario,
          this.terminalTick,
          this.environmentSampler,
        );
        if (transfer) storeTransferEvents.push(transfer);
      }
      const primaryWeaponActivatedThisTick =
        beforeActivation.get(primaryWeapon.definition.id) === "STOWED" &&
        primaryWeapon.lifecycle !== "STOWED";
      for (const state of this.states.values()) {
        const prior = beforeActivation.get(state.definition.id)!;
        if (prior !== "STOWED" || state.lifecycle === "STOWED") continue;
        this.eventJournal.emit({
          localKey: `entity-entered:${state.definition.id}`,
          tick,
          modelTimeSeconds: eventTime,
          phase: "LIFECYCLE",
          producer: {
            subsystem: "ENTITY_LIFECYCLE",
            entityId: state.definition.id,
          },
          knowledgeScope: "WORLD",
          participants: [{ entityId: state.definition.id, role: "SUBJECT" }],
          causes: [],
          payload: {
            kind: "ENTITY_ENTERED_WORLD",
            schemaVersion: SIMULATION_EVENT_PAYLOAD_SCHEMAS.ENTITY_ENTERED_WORLD,
            entityKind: state.definition.kind,
            lifecycle: state.lifecycle as Exclude<typeof state.lifecycle, "STOWED" | "TERMINATED">,
          },
        });
      }
      for (const payload of storeTransferEvents) {
        this.eventJournal.emit({
          localKey: `airborne-store-transfer:${payload.transferId}`,
          tick,
          modelTimeSeconds: eventTime,
          phase: "WEAPON",
          producer: { subsystem: "AIRCRAFT_DYNAMICS", entityId: payload.launcherId },
          knowledgeScope: "WORLD",
          participants: [
            { entityId: payload.launcherId, role: "LAUNCHER" },
            { entityId: payload.storeId, role: "WEAPON" },
          ],
          causes: [],
          payload,
        });
      }
      this.updateObserverState(tick, eventTime);
      const relativePosition = subtract(primaryTarget.position, primaryWeapon.position);
      const separationM = magnitude(relativePosition);
      this.closestApproachM = primaryWeaponActivatedThisTick
        ? separationM
        : Math.min(this.closestApproachM, separationM);
      this.peakCommandG = Math.max(this.peakCommandG, primaryWeapon.commandedG);
      const dryMass = primaryWeapon.definition.weapon?.dryMassKg ?? 0;
      this.minimumMassMarginKg = Math.min(
        this.minimumMassMarginKg,
        primaryWeapon.massKg - dryMass,
      );
      for (const state of this.states.values()) {
        const values = [
          state.position.x,
          state.position.y,
          state.position.z,
          state.velocity.x,
          state.velocity.y,
          state.velocity.z,
          state.massKg,
        ];
        if (values.some((value) => !Number.isFinite(value)))
          this.nonFiniteStateCount += 1;
      }

      if (tick >= this.terminalTick) {
        this.termination = "time_limit";
        this.completed = true;
      }
      const nextTick = tick + 1;
      const nextTime = modelTimeAtTick(nextTick, scenario.fixedStepSeconds);
      if (this.completed) {
        this.eventJournal.emit({
          localKey: "run-completed",
          tick,
          modelTimeSeconds: eventTime,
          phase: "TERMINATION",
          producer: { subsystem: "RUN_COORDINATOR" },
          knowledgeScope: "WORLD",
          participants: [],
          causes: [],
          payload: {
            kind: "RUN_COMPLETED",
            schemaVersion: SIMULATION_EVENT_PAYLOAD_SCHEMAS.RUN_COMPLETED,
            termination: this.termination,
          },
        });
      }
      if (
        tick === 0 ||
        this.eventJournal.hasPending()
      ) {
        const { frameIndex } = this.captureFrame(eventTime);
        if (this.eventJournal.hasPending()) {
          this.eventJournal.commitTick(tick, eventTime, frameIndex);
        }
      }
      if (this.completed) break;

      const beforeUpdates = new Map(
        [...this.states.values()].map((state) => [state.definition.id, state.lifecycle]),
      );
      const beforeOperationalUpdates = new Map(
        [...this.states.values()].map((state) => [state.definition.id, state.aircraftOperationalState]),
      );
      const priorWeaponFlightState = primaryWeapon.weaponFlightState;
      const hasPreTerminationBoundary = Boolean(
        primaryWeapon.definition.weapon && primaryWeapon.lifecycle !== "STOWED",
      );
      let snapshotIndex = 0;
      for (const state of this.states.values()) {
        if (hasPreTerminationBoundary) {
          refreshRuntimeStateSnapshot(this.preStepStates[snapshotIndex]!, state);
        }
        snapshotIndex += 1;
        updateKinematicEntity(state, scenario, time, scenario.fixedStepSeconds, this.environmentSampler);
      }
      for (const state of this.states.values())
        updateWeapon(state, this.states, scenario, time, scenario.fixedStepSeconds, this.environmentSampler);
      this.integratedSteps = nextTick;
      batchSteps += 1;
      const nextEventTime = recordedModelTimeAtTick(nextTick, scenario.fixedStepSeconds);
      const postRelativePosition = subtract(primaryTarget.position, primaryWeapon.position);
      const postSeparationM = magnitude(postRelativePosition);
      const activeStepFraction = weaponActiveStepFraction(
        primaryWeapon,
        time,
        scenario.fixedStepSeconds,
      );
      const admittedPostRelativePosition = relativePositionAtFraction(
        relativePosition,
        postRelativePosition,
        activeStepFraction,
      );
      const stepClosestApproach = closestApproachOnRelativeSegment(
        relativePosition,
        admittedPostRelativePosition,
      );
      const establishesClosestApproach = primaryWeapon.lifecycle !== "STOWED" &&
        (primaryWeaponActivatedThisTick ||
          stepClosestApproach.distanceM < this.closestApproachM);
      this.closestApproachM = Math.min(this.closestApproachM, stepClosestApproach.distanceM);
      const closestApproachWitness: readonly [number, number] = establishesClosestApproach
        ? [eventTime, nextEventTime]
        : this.closestEvidenceSnapshots
          ? [
              this.closestEvidenceSnapshots[0].modelTimeSeconds,
              this.closestEvidenceSnapshots[1].modelTimeSeconds,
            ]
          : [eventTime, nextEventTime];
      const weaponTermination = evaluateWeaponTermination(
        primaryWeapon,
        primaryTarget,
        priorWeaponFlightState,
        relativePosition,
        postRelativePosition,
        this.closestApproachM,
        closestApproachWitness,
        time,
        scenario.fixedStepSeconds,
        this.environmentSampler,
      );
      if (weaponTermination) {
        this.termination = weaponTermination.runTermination;
        this.completed = true;
      }
      let targetEffectEvaluation: TargetEffectEvaluation | undefined;
      if (weaponTermination && scenario.targetEffectAuthority) {
        let model: ReturnType<typeof resolveTargetEffectAuthority>["model"] | null = null;
        try {
          model = resolveTargetEffectAuthority(
            scenario.targetEffectAuthority,
            primaryWeapon.definition,
            primaryTarget.definition,
          ).model;
        } catch {
          // A well-formed authority that has no exact weapon/target binding is
          // recorded as unavailable. It must never fall back to a nearby model.
          model = null;
        }
        const weaponEventLocalKey = `weapon-terminated:${weaponTermination.payload.weaponId}`;
        targetEffectEvaluation = evaluateTargetEffect({
          modelPackDigest: scenario.targetEffectAuthority.digest,
          model,
          weaponId: primaryWeapon.definition.id,
          termination: {
            receipt: {
              tick: this.integratedSteps,
              localKey: weaponEventLocalKey,
            },
            cause: weaponTermination.payload.cause,
            closestApproachM: weaponTermination.payload.closestApproachM,
            modelTimeSeconds: nextEventTime,
          },
          target: {
            entityId: primaryTarget.definition.id,
            kind: primaryTarget.definition.kind,
            lifecycle: primaryTarget.lifecycle,
            massKg: primaryTarget.massKg,
            speedMps: magnitude(primaryTarget.velocity),
            altitudeMslM: primaryTarget.position.z,
          },
        });
        primaryTarget.targetEffect = {
          commitId: targetEffectEvaluation.commitId,
          state: targetEffectEvaluation.result,
        };
        primaryTarget.lifecycle = targetEffectEvaluation.targetLifecycleAfter;
      }
      for (const state of this.states.values()) {
        const prior = beforeUpdates.get(state.definition.id)!;
        if (prior === state.lifecycle) continue;
        if (
          targetEffectEvaluation &&
          state.definition.id === targetEffectEvaluation.targetId &&
          targetEffectEvaluation.targetLifecycleBefore !==
            targetEffectEvaluation.targetLifecycleAfter
        ) continue;
        this.eventJournal.emit({
          localKey: `entity-lifecycle:${state.definition.id}:${prior}:${state.lifecycle}`,
          tick: this.integratedSteps,
          modelTimeSeconds: nextEventTime,
          phase: state.lifecycle === "TERMINATED" ? "TERMINATION" : "LIFECYCLE",
          producer: { subsystem: "ENTITY_LIFECYCLE", entityId: state.definition.id },
          knowledgeScope: "WORLD",
          participants: [{ entityId: state.definition.id, role: "SUBJECT" }],
          causes: [],
          payload: {
            kind: "ENTITY_LIFECYCLE_CHANGED",
            schemaVersion: SIMULATION_EVENT_PAYLOAD_SCHEMAS.ENTITY_LIFECYCLE_CHANGED,
            entityKind: state.definition.kind,
            from: prior,
            to: state.lifecycle,
          },
        });
      }
      for (const state of this.states.values()) {
        const prior = beforeOperationalUpdates.get(state.definition.id);
        const next = state.aircraftOperationalState;
        if (!prior || !next || prior === next || !state.definition.groundOperation) continue;
        this.eventJournal.emit({
          localKey: `aircraft-operational:${state.definition.id}:${prior}:${next}`,
          tick: this.integratedSteps,
          modelTimeSeconds: nextEventTime,
          phase: "MISSION",
          producer: { subsystem: "AIRCRAFT_DYNAMICS", entityId: state.definition.id },
          knowledgeScope: "WORLD",
          participants: [{ entityId: state.definition.id, role: "SUBJECT" }],
          causes: [],
          payload: {
            kind: "AIRCRAFT_OPERATIONAL_STATE_CHANGED",
            schemaVersion: SIMULATION_EVENT_PAYLOAD_SCHEMAS.AIRCRAFT_OPERATIONAL_STATE_CHANGED,
            from: prior,
            to: next,
            movementValueState: state.lifecycle === "TERMINATED" ? "TERMINATED" : "VALID",
            groundDynamicsDigest: state.definition.groundOperation.groundDynamicsDigest,
          },
        });
      }
      if (weaponTermination) {
        const payload = weaponTermination.payload;
        const terminationReceipt = this.eventJournal.emit({
          localKey: `weapon-terminated:${payload.weaponId}`,
          tick: this.integratedSteps,
          modelTimeSeconds: nextEventTime,
          phase: "TERMINATION",
          producer: { subsystem: "WEAPON_DYNAMICS", entityId: payload.weaponId },
          knowledgeScope: "WORLD",
          participants: [
            { entityId: payload.weaponId, role: "WEAPON" },
            { entityId: payload.targetId, role: "TARGET" },
          ],
          causes: [],
          payload,
        });
        if (targetEffectEvaluation && scenario.targetEffectAuthority) {
          if (
            terminationReceipt.tick !== targetEffectEvaluation.terminationReceipt.tick ||
            terminationReceipt.localKey !== targetEffectEvaluation.terminationReceipt.localKey
          ) {
            throw new Error("Target-effect commit lost its exact weapon-termination receipt.");
          }
          this.eventJournal.emit({
            localKey: `target-effect:${targetEffectEvaluation.commitId}`,
            tick: this.integratedSteps,
            modelTimeSeconds: nextEventTime,
            phase: "TERMINATION",
            producer: { subsystem: "WEAPON_DYNAMICS", entityId: payload.weaponId },
            knowledgeScope: "WORLD",
            participants: [
              { entityId: payload.weaponId, role: "WEAPON" },
              { entityId: payload.targetId, role: "TARGET" },
            ],
            causes: [{ kind: "EVENT_RECEIPT", receipt: terminationReceipt }],
            payload: {
              kind: "TARGET_EFFECT_COMMITTED",
              schemaVersion: SIMULATION_EVENT_PAYLOAD_SCHEMAS.TARGET_EFFECT_COMMITTED,
              authorityId: scenario.targetEffectAuthority.id,
              authorityVersion: scenario.targetEffectAuthority.version,
              commit: targetEffectEvaluation,
            },
          });
        }
      } else {
        const speed = magnitude(primaryWeapon.velocity);
        const weapon = primaryWeapon.definition.weapon!;
        const sinceLaunch = nextTime - achievedWeaponLaunchTimeSeconds(
          weapon,
          scenario.fixedStepSeconds,
        );
        if (weapon.storeTransfer?.operation === "JETTISON" && primaryWeapon.lifecycle !== "STOWED" && (
          (sinceLaunch > weapon.burnSeconds + 2 && speed < 80 && postSeparationM > 1000) ||
          (primaryWeapon.position.z <= terrainElevation(this.environmentSampler, primaryWeapon.position) && nextTime > 1)
        )) {
          this.termination = "energy_depleted";
          this.completed = true;
        } else if (nextTick >= this.terminalTick) {
          this.termination = "time_limit";
          this.completed = true;
        }
      }
      if (this.completed) {
        this.eventJournal.emit({
          localKey: "run-completed",
          tick: this.integratedSteps,
          modelTimeSeconds: nextEventTime,
          phase: "TERMINATION",
          producer: { subsystem: "RUN_COORDINATOR" },
          knowledgeScope: "WORLD",
          participants: [],
          causes: [],
          payload: {
            kind: "RUN_COMPLETED",
            schemaVersion: SIMULATION_EVENT_PAYLOAD_SCHEMAS.RUN_COMPLETED,
            termination: this.termination,
          },
        });
      }
      if (!this.completed) {
        this.updateObserverState(this.integratedSteps, nextEventTime);
      }
      if (establishesClosestApproach) {
        this.closestEvidenceSnapshots = [
          this.weaponEvidenceSnapshot(
            this.closestEvidenceSnapshots?.[0],
            eventTime,
            this.preStepStates,
          ),
          this.weaponEvidenceSnapshot(
            this.closestEvidenceSnapshots?.[1],
            nextEventTime,
            [...this.states.values()],
          ),
        ];
      }
      if (
        this.completed &&
        primaryWeapon.definition.weapon?.termination &&
        primaryWeapon.definition.weapon.storeTransfer?.operation !== "JETTISON" &&
        primaryWeapon.lifecycle !== "STOWED"
      ) {
        this.terminalPriorEvidenceSnapshot = this.closestEvidenceSnapshots?.[0].modelTimeSeconds === eventTime
          ? this.closestEvidenceSnapshots[0]
          : this.weaponEvidenceSnapshot(
              this.terminalPriorEvidenceSnapshot,
              eventTime,
              this.preStepStates,
            );
      }
      const activationAtNextBoundary = [...this.states.values()].some((state) => {
        const launchTimeSeconds = state.definition.weapon?.launchTimeSeconds;
        return state.lifecycle === "STOWED" &&
          launchTimeSeconds !== null &&
          launchTimeSeconds !== undefined &&
          firstFixedStepTickAtOrAfter(
            launchTimeSeconds,
            scenario.fixedStepSeconds,
          ) < this.terminalTick &&
          firstFixedStepTickAtOrAfter(
            launchTimeSeconds,
            scenario.fixedStepSeconds,
          ) === this.integratedSteps;
      });
      if (
        this.eventJournal.hasPending() ||
        this.integratedSteps === 1 ||
        (this.integratedSteps % this.sampleEvery === 0 && !activationAtNextBoundary)
      ) {
        const { frameIndex } = this.captureFrame(nextEventTime);
        if (this.eventJournal.hasPending()) {
          this.eventJournal.commitTick(this.integratedSteps, nextEventTime, frameIndex);
        }
      }
    }

    const modelTimeSeconds = recordedModelTimeAtTick(
      this.integratedSteps,
      this.scenario.fixedStepSeconds,
    );
    return {
      completed: this.completed,
      integratedSteps: this.integratedSteps,
      modelTimeSeconds,
      progress:
        this.scenario.durationSeconds > 0
          ? Math.min(1, modelTimeSeconds / this.scenario.durationSeconds)
          : 1,
    };
  }

  isCompleted() {
    return this.completed;
  }

  result(): EngineRun {
    if (!this.completed) throw new Error("The engine session is not complete.");
    const hasWeaponTermination = [
      "weapon_intercept",
      "weapon_miss",
      "weapon_expired",
      "weapon_failed",
      "target_unavailable",
    ].includes(this.termination);
    const evidenceSnapshots = [
      ...(hasWeaponTermination ? (this.closestEvidenceSnapshots ?? []) : []),
      ...(this.terminalPriorEvidenceSnapshot ? [this.terminalPriorEvidenceSnapshot] : []),
    ];
    const evidenceFrames = evidenceSnapshots.map((snapshot) => this.projectFrame(
      snapshot.modelTimeSeconds,
      snapshot.states,
      snapshot.observerStates,
    ));
    const compacted = mergeWeaponEvidenceFrames(
      this.frames,
      this.eventJournal.items(),
      evidenceFrames,
    );
    const events = compacted.events;
    const run: EngineRun = {
      scenario: this.scenario,
      frames: compacted.frames,
      events: {
        state: "AVAILABLE",
        schemaVersion: SIMULATION_EVENT_SCHEMA,
        items: events,
      },
      envelopes: buildEnvelopes(this.scenario),
      primaryWeaponId: this.primaryWeapon?.definition.id ?? "",
      primaryTargetId: this.primaryTarget?.definition.id ?? "",
      termination: this.termination,
      closestApproachM: this.closestApproachM,
      peakCommandG: this.peakCommandG,
      diagnostics: {
        backend: "typescript",
        fixedStepSeconds: this.scenario.fixedStepSeconds,
        integratedSteps: this.integratedSteps,
        nonFiniteStateCount: this.nonFiniteStateCount,
        minimumMassMarginKg: Number.isFinite(this.minimumMassMarginKg)
          ? this.minimumMassMarginKg
          : 0,
      },
    };
    assertSimulationEventStream(
      events,
      run.frames,
      run.scenario,
      run.termination,
      run.closestApproachM,
      {
        primaryWeaponId: run.primaryWeaponId,
        primaryTargetId: run.primaryTargetId,
      },
    );
    return run;
  }
}

export function runEngine(
  scenario: EngineScenario,
  verificationPack?: Readonly<CompiledModelPack>,
): EngineRun {
  const session = new EngineSession(scenario, verificationPack);
  while (!session.isCompleted()) session.runTicks(2_048);
  return session.result();
}
