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

function unavailableObserverStates(scenario: EngineScenario): EngineObserverState[] {
  if (scenario.domain !== "A2A") return [];
  return ["IAF", "PAF"].map((perspective) => ({
    schemaVersion: "vector.observer-state.v1",
    perspective: perspective as EngineObserverState["perspective"],
    sensorState: "UNSUPPORTED",
    observationCount: 0,
    trackState: "UNSUPPORTED",
    visible: false,
    availabilityReason: "SENSOR_MODEL_UNAVAILABLE",
    effectScope: "AIR_PICTURE_ONLY",
    stateExplanation: "No admitted sensor model pack is bound to this run.",
  }));
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
  const captureRadiusM = Math.max(1, speed * dt * 2);
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
    const dragCoefficient =
      model.zeroLiftDragCoefficient +
      model.inducedDragFactor * liftCoefficient * liftCoefficient;
    const drag = dynamicPressure * model.referenceAreaM2 * dragCoefficient;
    const thrustDemand = Math.min(
      model.maximumThrustNewtons,
      drag * (steeringG === 0 ? 1.02 : 1.18),
    );
    const fuelFlow =
      state.fuelKg > 0
        ? thrustDemand * model.specificFuelConsumptionKgPerNewtonSecond
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

function activateWeapon(
  state: RuntimeState,
  states: Map<string, RuntimeState>,
  time: number,
) {
  const weapon = state.definition.weapon;
  if (!weapon || weapon.launchTimeSeconds === null) return;
  if (state.lifecycle !== "STOWED" || time < weapon.launchTimeSeconds) return;
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
  private readonly sampleEvery: number;
  private readonly recordingOrigin: EngineScenario["geospatial"]["origin"];
  private time = 0;
  private termination: EngineRun["termination"] = "time_limit";
  private closestApproachM = Number.POSITIVE_INFINITY;
  private peakCommandG = 0;
  private integratedSteps = 0;
  private nonFiniteStateCount = 0;
  private minimumMassMarginKg = Number.POSITIVE_INFINITY;
  private completed = false;

  constructor(scenario: EngineScenario) {
    this.scenario = scenario;
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

  runTicks(maximumTicks: number): EngineBatch {
    if (!Number.isSafeInteger(maximumTicks) || maximumTicks < 1) {
      throw new Error("Engine tick batches must contain a positive safe integer.");
    }
    let batchSteps = 0;
    while (!this.completed && batchSteps < maximumTicks) {
      const primaryWeapon = this.primaryWeapon!;
      const primaryTarget = this.primaryTarget!;
      const time = this.time;
      const scenario = this.scenario;
      for (const state of this.states.values())
        activateWeapon(state, this.states, time);
      for (const state of this.states.values())
        updateKinematicEntity(state, scenario, time, scenario.fixedStepSeconds);
      for (const state of this.states.values())
        updateWeapon(
          state,
          this.states,
          scenario,
          time,
          scenario.fixedStepSeconds,
        );
      this.integratedSteps += 1;
      batchSteps += 1;

      const relativePosition = subtract(primaryTarget.position, primaryWeapon.position);
      const relativeVelocity = subtract(primaryTarget.velocity, primaryWeapon.velocity);
      const separationM = magnitude(relativePosition);
      const los = normalize(relativePosition);
      const closureRateMps = -dot(relativeVelocity, los);
      const lineOfSightRateRadS =
        magnitude(cross(relativePosition, relativeVelocity)) /
        Math.max(1, separationM * separationM);
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

      if (
        this.integratedSteps % this.sampleEvery === 1 ||
        this.integratedSteps === 1
      ) {
        this.frames.push({
          t: Number(time.toFixed(6)),
          // Carried inventory is part of the scenario package, not yet a world
          // track. It enters the observable frame only when its launch event
          // activates it and gives it inherited launcher state.
          entities: [...this.states.values()]
            .filter((state) => state.lifecycle !== "STOWED")
            .map((state) => toFrame(state, scenario)),
          geographicPositions: [...this.states.values()]
            .filter((state) => state.lifecycle !== "STOWED")
            .map((state) => ({
              entityId: state.definition.id,
              position: localFrameToGeographic(
                state.position,
                this.recordingOrigin,
              ),
            })),
          primaryWeaponId: primaryWeapon.definition.id,
          primaryTargetId: primaryTarget.definition.id,
          separationM,
          closureRateMps,
          lineOfSightRateRadS,
          observerStates: unavailableObserverStates(scenario),
        });
      }

      if (primaryWeapon.weaponFlightState === "TARGET_UNAVAILABLE") {
        this.termination = "target_unavailable";
        this.completed = true;
      } else if (separationM <= scenario.completion.distanceMeters) {
        this.termination = "threshold_reached";
        this.completed = true;
      } else {
        const speed = magnitude(primaryWeapon.velocity);
        const weapon = primaryWeapon.definition.weapon!;
        const sinceLaunch = time - (weapon.launchTimeSeconds ?? 0);
        if (
          sinceLaunch > weapon.burnSeconds + 2 &&
          speed < 80 &&
          separationM > 1000
        ) {
          this.termination = "energy_depleted";
          this.completed = true;
        } else if (primaryWeapon.position.z <= 0 && time > 1) {
          this.termination = "energy_depleted";
          this.completed = true;
        }
      }
      this.time = time + scenario.fixedStepSeconds;
      if (this.time > scenario.durationSeconds + 1e-9) this.completed = true;
    }

    return {
      completed: this.completed,
      integratedSteps: this.integratedSteps,
      modelTimeSeconds: Math.min(this.time, this.scenario.durationSeconds),
      progress:
        this.scenario.durationSeconds > 0
          ? Math.min(1, this.time / this.scenario.durationSeconds)
          : 1,
    };
  }

  isCompleted() {
    return this.completed;
  }

  result(): EngineRun {
    if (!this.completed) throw new Error("The engine session is not complete.");
    return {
      scenario: this.scenario,
      frames: this.frames,
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
  }
}

export function runEngine(scenario: EngineScenario): EngineRun {
  const session = new EngineSession(scenario);
  while (!session.isCompleted()) session.runTicks(2_048);
  return session.result();
}
