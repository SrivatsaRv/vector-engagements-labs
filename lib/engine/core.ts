import { standardAtmosphere } from "./atmosphere.ts";
import type {
  CoverageEnvelope,
  EngineEntityDefinition,
  EngineEntityFrame,
  EngineObserverState,
  EngineRun,
  EngineScenario,
  WeaponFlightState,
} from "./contracts.ts";
import { SIMULATION_EVENT_PAYLOAD_SCHEMAS } from "./contracts.ts";
import { SIMULATION_EVENT_SCHEMA } from "./contracts.ts";
import {
  assertSimulationEventStream,
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
import { localFrameToGeographic } from "../geospatial/geodesy.ts";
import {
  assertPhaseAEnvironmentPack,
  environmentPackBinding,
} from "../geospatial/environment-pack.ts";

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
  dragNewtons: number;
  thrustNewtons: number;
  phase: string;
  weaponFlightState?: WeaponFlightState;
  routePointIndex: number;
  aircraftControl?: NonNullable<EngineEntityFrame["aircraftControl"]>;
  lastGuidanceAcceleration: Vec3;
  lastGuidanceUpdateSeconds: number;
};

const G0 = 9.80665;

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
  const sameEvidence = sensor !== undefined &&
    sensor.evidenceRefIds.length === admission.evidenceRefIds.length &&
    sensor.evidenceRefIds.every((id, index) => id === admission.evidenceRefIds[index]);
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
    admission.elevationFieldOfViewRad !== sensor.elevationFieldOfViewRad
  ) {
    throw new Error(`Observer sensor ${entity.id} is not bound to an admitted compiled sensor model.`);
  }
}

function observerStates(
  states: readonly RuntimeState[],
  scenario: EngineScenario,
  time: number,
  dt: number,
): EngineObserverState[] {
  if (scenario.domain !== "A2A") return [];
  return ([
    ["IAF", "BLUE"],
    ["PAF", "RED"],
  ] as const).map(([perspective, affiliation]) => {
    const observer = states.find((state) =>
      state.definition.affiliation === affiliation &&
      state.definition.kind === "AIRCRAFT" &&
      state.lifecycle === "ACTIVE",
    );
    const target = states.find((state) =>
      state.definition.affiliation !== affiliation &&
      state.definition.kind === "AIRCRAFT" &&
      state.lifecycle === "ACTIVE",
    );
    const sensor = observer?.definition.observerSensor;
    if (!observer || !target || !sensor) return unavailableObserverState(perspective);
    if (
      sensor.modelPackDigest !== scenario.modelPack.digest ||
      sensor.schemaVersion !== "vector.observer-sensor-admission.v1" ||
      !sensor.modelId || !sensor.modelVersion || !sensor.evidenceRefIds.length ||
      !Number.isFinite(sensor.detectionRangeM) || sensor.detectionRangeM <= 0 ||
      !Number.isFinite(sensor.minimumRangeM) || sensor.minimumRangeM < 0 ||
      sensor.minimumRangeM > sensor.detectionRangeM ||
      !Number.isFinite(sensor.scanPeriodS) || sensor.scanPeriodS <= 0 ||
      !Number.isFinite(sensor.azimuthFieldOfViewRad) || sensor.azimuthFieldOfViewRad <= 0 || sensor.azimuthFieldOfViewRad > Math.PI * 2 ||
      !Number.isFinite(sensor.elevationFieldOfViewRad) || sensor.elevationFieldOfViewRad <= 0 || sensor.elevationFieldOfViewRad > Math.PI
    ) return unavailableObserverState(perspective, "The admitted sensor inputs are incomplete or inconsistent with the compiled model pack.");
    if (sensor.mode === "OFF") return {
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
    };
    const due = Math.abs(time / sensor.scanPeriodS - Math.round(time / sensor.scanPeriodS)) <= dt / sensor.scanPeriodS / 2 + 1e-9;
    if (!due) return {
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
    };
    const relative = subtract(target.position, observer.position);
    const range = magnitude(relative);
    const horizontal = Math.hypot(relative.x, relative.y);
    const forward = { x: Math.cos(observer.headingRad), y: Math.sin(observer.headingRad), z: 0 };
    const azimuth = horizontal > 0
      ? Math.acos(Math.max(-1, Math.min(1, (relative.x * forward.x + relative.y * forward.y) / horizontal)))
      : 0;
    const elevation = range > 0 ? Math.asin(Math.max(-1, Math.min(1, relative.z / range))) : 0;
    const detected = range >= sensor.minimumRangeM && range <= sensor.detectionRangeM &&
      azimuth <= sensor.azimuthFieldOfViewRad / 2 && Math.abs(elevation) <= sensor.elevationFieldOfViewRad / 2;
    if (!detected) return {
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
    };
    return {
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
    };
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
    dragNewtons: 0,
    thrustNewtons: 0,
    phase: definition.lifecycle === "STOWED" ? "Stowed" : "Initial state",
    weaponFlightState:
      definition.kind === "GUIDED_WEAPON" ? "STOWED" : undefined,
    routePointIndex: startsAtFirstRoutePoint ? 1 : 0,
    lastGuidanceAcceleration: { x: 0, y: 0, z: 0 },
    lastGuidanceUpdateSeconds: Number.NEGATIVE_INFINITY,
  };
}

function activeWind(scenario: EngineScenario, time: number) {
  return scenario.events.reduce(
    (wind, event) =>
      event.type === "WIND_SHIFT" &&
      time >= event.startSeconds &&
      time < event.startSeconds + event.durationSeconds &&
      event.vectorMps
        ? add(wind, event.vectorMps)
        : wind,
    scenario.environment.windMps,
  );
}

function updateKinematicEntity(
  state: RuntimeState,
  scenario: EngineScenario,
  time: number,
  dt: number,
) {
  if (state.lifecycle !== "ACTIVE" && state.lifecycle !== "TRACKING") return;
  const { kind } = state.definition;
  if (kind !== "AIRCRAFT") return;
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
  const atmosphere = standardAtmosphere(
    state.position.z,
    scenario.environment.temperatureOffsetC,
  );
  const airRelative = subtract(state.velocity, activeWind(scenario, time));
  const airspeed = Math.max(1, magnitude(airRelative));
  let longitudinalAcceleration = 0;
  {
    const dynamicPressure = Math.max(1, 0.5 * atmosphere.densityKgM3 * airspeed * airspeed);
    const steeringG = magnitude(acceptedSteeringAcceleration) / G0;
    const loadFactor = Math.sqrt(1 + steeringG * steeringG);
    const liftCoefficient =
      (state.massKg * G0 * loadFactor) /
      (dynamicPressure * model.referenceAreaM2);
    const mach = airspeed / atmosphere.speedOfSoundMps;
    const dragCoefficient =
      interpolateTable(model.zeroLiftDragByMach, mach) +
      interpolateTable(model.inducedDragByAngleOfAttackRad, 0) * liftCoefficient * liftCoefficient;
    const drag = dynamicPressure * model.referenceAreaM2 * dragCoefficient;
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
    state.dragNewtons = drag;
    state.thrustNewtons = state.fuelKg > 0 ? thrustDemand : 0;
    longitudinalAcceleration =
      (state.thrustNewtons - state.dragNewtons) / state.massKg;
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
  state.commandedG = magnitude(acceptedSteeringAcceleration) / G0;
  state.phase = routePoint ? "Following route" : "Route complete";
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
) {
  const weapon = state.definition.weapon;
  if (!weapon || weapon.launchTimeSeconds === null) return;
  const activationTick = firstFixedStepTickAtOrAfter(
    weapon.launchTimeSeconds,
    scenario.fixedStepSeconds,
  );
  if (
    state.lifecycle !== "STOWED" ||
    weapon.launchTimeSeconds > scenario.durationSeconds ||
    activationTick >= terminalTick ||
    tick < activationTick
  ) return;
  const launcher = states.get(weapon.launchPlatformId);
  if (launcher) {
    if (launcher.definition.kind === "AIRCRAFT") {
      if (!launcher.installedStoreIds.delete(state.definition.id)) {
        throw new Error(
          `Aircraft ${launcher.definition.id} does not carry store ${state.definition.id}.`,
        );
      }
      launcher.storeMassKg -= weapon.launchMassKg;
      launcher.massKg -= weapon.launchMassKg;
    }
    state.position = { ...launcher.position };
    state.velocity = { ...launcher.velocity };
    state.headingRad = launcher.headingRad;
  }
  state.lifecycle = "ACTIVE";
  state.phase = "Launched";
  state.weaponFlightState = "BOOST";
}

function updateWeapon(
  state: RuntimeState,
  states: Map<string, RuntimeState>,
  scenario: EngineScenario,
  time: number,
  dt: number,
) {
  const weapon = state.definition.weapon;
  if (!weapon || state.lifecycle !== "ACTIVE") return;
  const target = states.get(weapon.targetEntityId);
  if (!target || target.lifecycle === "TERMINATED") {
    state.lifecycle = "TERMINATED";
    state.phase = "Target unavailable";
    state.weaponFlightState = "TARGET_UNAVAILABLE";
    return;
  }

  const sinceLaunch = time - (weapon.launchTimeSeconds ?? 0);
  const relativePosition = subtract(target.position, state.position);
  const separation = Math.max(1, magnitude(relativePosition));
  const los = normalize(relativePosition);
  const relativeVelocity = subtract(target.velocity, state.velocity);
  const closingRate = Math.max(0, -dot(relativeVelocity, los));
  const losRateVector = scale(
    cross(relativePosition, relativeVelocity),
    1 / (separation * separation),
  );

  const atmosphere = standardAtmosphere(
    state.position.z,
    scenario.environment.temperatureOffsetC,
  );
  const wind = activeWind(scenario, time);
  const airRelativeVelocity = subtract(state.velocity, wind);
  const airspeed = Math.max(1, magnitude(airRelativeVelocity));
  const direction = normalize(state.velocity);
  const dynamicPressure = 0.5 * atmosphere.densityKgM3 * airspeed * airspeed;
  const drag =
    dynamicPressure * weapon.dragCoefficient * weapon.referenceAreaM2;
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
  state.position.z = Math.max(0, state.position.z);
  state.headingRad = Math.atan2(state.velocity.y, state.velocity.x);
  state.commandedG = magnitude(guidanceAcceleration) / G0;
  state.availableG = weapon.maximumCommandG;
  state.dragNewtons = drag;
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

function toFrame(
  state: RuntimeState,
  scenario: EngineScenario,
): EngineEntityFrame {
  const speed = magnitude(state.velocity);
  const atmosphere = standardAtmosphere(
    state.position.z,
    scenario.environment.temperatureOffsetC,
  );
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
    valueState: state.definition.provenance.valueState,
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
  private readonly primaryWeapon?: RuntimeState;
  private readonly primaryTarget?: RuntimeState;
  private readonly frames: EngineRun["frames"] = [];
  private readonly eventJournal = new SimulationEventJournal();
  private readonly sampleEvery: number;
  private readonly terminalTick: number;
  private readonly recordingOrigin: EngineScenario["geospatial"]["origin"];
  private termination: EngineRun["termination"] = "time_limit";
  private closestApproachM = Number.POSITIVE_INFINITY;
  private peakCommandG = 0;
  private integratedSteps = 0;
  private nonFiniteStateCount = 0;
  private minimumMassMarginKg = Number.POSITIVE_INFINITY;
  private completed = false;
  private recordedEntityStates = 0;

  constructor(scenario: EngineScenario) {
    this.scenario = scenario;
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
      assertPhaseAEnvironmentPack(admittedPack);
      const environmentBinding = environmentPackBinding(admittedPack);
      if (
        recordedBinding.schemaVersion !== environmentBinding.schemaVersion ||
        recordedBinding.id !== environmentBinding.id ||
        recordedBinding.version !== environmentBinding.version ||
        recordedBinding.digest !== environmentBinding.digest
      ) {
        throw new Error("Engine environment-pack binding does not match the admitted pack.");
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
    for (const entity of scenario.entities) {
      if (!entity.weapon) continue;
      const launchTimeSeconds = entity.weapon.launchTimeSeconds;
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
    }
    for (const entity of scenario.entities) {
      const sensor = entity.observerSensor;
      if (!sensor) continue;
      assertObserverSensorBoundToModelPack(entity, scenario);
      if (
        sensor.schemaVersion !== "vector.observer-sensor-admission.v1" ||
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
    }
    for (const aircraft of scenario.entities.filter(
      (entity) => entity.kind === "AIRCRAFT",
    )) {
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
    }
    this.primaryWeapon = this.states.get(
      scenario.entities.find(
        (entity) =>
          entity.kind === "GUIDED_WEAPON" && entity.weapon?.launchTimeSeconds !== null,
      )?.id ?? "",
    );
    this.primaryTarget = this.primaryWeapon?.definition.weapon
      ? this.states.get(this.primaryWeapon.definition.weapon.targetEntityId)
      : undefined;
    this.sampleEvery = Math.max(1, Math.round(0.25 / scenario.fixedStepSeconds));
    if (!this.primaryWeapon || !this.primaryTarget) {
      this.termination = "invalid_scenario";
      this.completed = true;
    }
  }

  private captureFrame(modelTimeSeconds: number) {
    const primaryWeapon = this.primaryWeapon!;
    const primaryTarget = this.primaryTarget!;
    const relativePosition = subtract(primaryTarget.position, primaryWeapon.position);
    const relativeVelocity = subtract(primaryTarget.velocity, primaryWeapon.velocity);
    const separationM = magnitude(relativePosition);
    const los = normalize(relativePosition);
    const closureRateMps = -dot(relativeVelocity, los);
    const lineOfSightRateRadS =
      magnitude(cross(relativePosition, relativeVelocity)) /
      Math.max(1, separationM * separationM);
    const visibleStates = [...this.states.values()].filter(
      (state) => state.lifecycle !== "STOWED",
    );
    if (this.recordedEntityStates + visibleStates.length > 1_000_000) {
      throw new Error("Event-preserving frames exceed 1000000 recorded entity states.");
    }
    const frameIndex = this.frames.length;
    this.frames.push({
      t: modelTimeSeconds,
      entities: visibleStates.map((state) => toFrame(state, this.scenario)),
      geographicPositions: visibleStates.map((state) => ({
        entityId: state.definition.id,
        position: localFrameToGeographic(state.position, this.recordingOrigin),
      })),
      primaryWeaponId: primaryWeapon.definition.id,
      primaryTargetId: primaryTarget.definition.id,
      separationM,
      closureRateMps,
      lineOfSightRateRadS,
      observerStates: observerStates(
        [...this.states.values()],
        this.scenario,
        modelTimeSeconds,
        this.scenario.fixedStepSeconds,
      ),
    });
    this.recordedEntityStates += visibleStates.length;
    return { frameIndex, separationM };
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
      for (const state of this.states.values())
        activateWeapon(state, this.states, tick, scenario, this.terminalTick);
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
      const relativePosition = subtract(primaryTarget.position, primaryWeapon.position);
      const separationM = magnitude(relativePosition);
      this.closestApproachM = Math.min(this.closestApproachM, separationM);
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

      if (primaryWeapon.weaponFlightState === "TARGET_UNAVAILABLE") {
        this.termination = "target_unavailable";
        this.completed = true;
      } else if (separationM <= scenario.completion.distanceMeters) {
        this.termination = "threshold_reached";
        this.completed = true;
      } else if (tick >= this.terminalTick) {
        this.termination = "time_limit";
        this.completed = true;
      } else {
        const speed = magnitude(primaryWeapon.velocity);
        const weapon = primaryWeapon.definition.weapon!;
        const sinceLaunch = time - (weapon.launchTimeSeconds ?? 0);
        if (
          (sinceLaunch > weapon.burnSeconds + 2 &&
            speed < 80 &&
            separationM > 1000) ||
          (primaryWeapon.position.z <= 0 && time > 1)
        ) {
          this.termination = "energy_depleted";
          this.completed = true;
        }
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
      for (const state of this.states.values())
        updateKinematicEntity(state, scenario, time, scenario.fixedStepSeconds);
      for (const state of this.states.values())
        updateWeapon(state, this.states, scenario, time, scenario.fixedStepSeconds);
      this.integratedSteps = nextTick;
      batchSteps += 1;
      const nextEventTime = recordedModelTimeAtTick(nextTick, scenario.fixedStepSeconds);
      for (const state of this.states.values()) {
        const prior = beforeUpdates.get(state.definition.id)!;
        if (prior === state.lifecycle) continue;
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
      const postRelativePosition = subtract(primaryTarget.position, primaryWeapon.position);
      const postSeparationM = magnitude(postRelativePosition);
      this.closestApproachM = Math.min(this.closestApproachM, postSeparationM);
      if (primaryWeapon.weaponFlightState === "TARGET_UNAVAILABLE") {
        this.termination = "target_unavailable";
        this.completed = true;
      } else if (postSeparationM <= scenario.completion.distanceMeters) {
        this.termination = "threshold_reached";
        this.completed = true;
      } else {
        const speed = magnitude(primaryWeapon.velocity);
        const weapon = primaryWeapon.definition.weapon!;
        const sinceLaunch = nextTime - (weapon.launchTimeSeconds ?? 0);
        if (
          (sinceLaunch > weapon.burnSeconds + 2 && speed < 80 && postSeparationM > 1000) ||
          (primaryWeapon.position.z <= 0 && nextTime > 1)
        ) {
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

    const modelTimeSeconds = modelTimeAtTick(
      this.integratedSteps,
      this.scenario.fixedStepSeconds,
    );
    return {
      completed: this.completed,
      integratedSteps: this.integratedSteps,
      modelTimeSeconds: Math.min(modelTimeSeconds, this.scenario.durationSeconds),
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
    const events = this.eventJournal.items();
    const run: EngineRun = {
      scenario: this.scenario,
      frames: this.frames,
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
    assertSimulationEventStream(events, run.frames, run.scenario, run.termination);
    return run;
  }
}

export function runEngine(scenario: EngineScenario): EngineRun {
  const session = new EngineSession(scenario);
  while (!session.isCompleted()) session.runTicks(2_048);
  return session.result();
}
