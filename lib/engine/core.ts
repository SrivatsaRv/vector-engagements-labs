import { standardAtmosphere } from "./atmosphere.ts";
import type {
  CoverageEnvelope,
  EngineEntityDefinition,
  EngineEntityFrame,
  EngineRun,
  EngineScenario,
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
  dragNewtons: number;
  thrustNewtons: number;
  phase: string;
  lastGuidanceAcceleration: Vec3;
  lastGuidanceUpdateSeconds: number;
};

const G0 = 9.80665;

function initialState(definition: EngineEntityDefinition): RuntimeState {
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
    dragNewtons: 0,
    thrustNewtons: 0,
    phase: definition.lifecycle === "STOWED" ? "Stowed" : "Initial state",
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

function guidanceHeld(
  scenario: EngineScenario,
  entityId: string,
  time: number,
) {
  return scenario.events.some(
    (event) =>
      event.type === "GUIDANCE_HOLD" &&
      (!event.entityId || event.entityId === entityId) &&
      time >= event.startSeconds &&
      time < event.startSeconds + event.durationSeconds,
  );
}

function wrapAngleRadians(value: number) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function headingTo(from: Vec3, to: Vec3) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function commandedTurnForHeading(
  state: RuntimeState,
  desiredHeadingRad: number,
  maximumCommandG: number,
) {
  const speed = Math.max(60, magnitude(state.velocity));
  const error = wrapAngleRadians(desiredHeadingRad - state.headingRad);
  const desiredTurnRate = Math.max(-0.18, Math.min(0.18, error * 0.75));
  return Math.max(
    -maximumCommandG,
    Math.min(maximumCommandG, (desiredTurnRate * speed) / G0),
  );
}

function intentTurnDemand(
  state: RuntimeState,
  states: Map<string, RuntimeState>,
  time: number,
) {
  const { behavior } = state.definition;
  const model = state.definition.aircraft;
  const maximumCommandG = model?.maximumCommandG ?? Math.max(1, Math.abs(behavior.commandedG));
  const target =
    behavior.targetEntityId === undefined
      ? undefined
      : states.get(behavior.targetEntityId);
  const activation = behavior.activateAfterSeconds ?? 0;
  if (!behavior.intent || !target) return undefined;
  if (time < activation) {
    state.phase = "Awaiting warning";
    return 0;
  }

  const relativePosition = subtract(target.position, state.position);
  const separation = Math.max(1, magnitude(relativePosition));
  const targetHeading = headingTo(state.position, target.position);
  const awayHeading = headingTo(target.position, state.position);
  const speed = Math.max(60, magnitude(state.velocity));
  const leadSeconds = Math.max(4, Math.min(42, separation / speed));
  const predictedTarget = add(target.position, scale(target.velocity, leadSeconds));

  if (behavior.intent === "PURE_PURSUIT") {
    state.phase = "Pure pursuit";
    return commandedTurnForHeading(state, targetHeading, maximumCommandG);
  }
  if (behavior.intent === "LEAD_PURSUIT") {
    state.phase = "Lead pursuit";
    return commandedTurnForHeading(state, headingTo(state.position, predictedTarget), maximumCommandG);
  }
  if (behavior.intent === "STERN_CONVERSION") {
    const sternPoint = subtract(target.position, scale(normalize(target.velocity), 9000));
    state.phase = "Stern conversion";
    return commandedTurnForHeading(state, headingTo(state.position, sternPoint), maximumCommandG * 0.82);
  }
  if (behavior.intent === "SUPPORT_HOLD") {
    state.phase = "Radar support hold";
    return commandedTurnForHeading(state, headingTo(state.position, predictedTarget), maximumCommandG * 0.45);
  }
  if (behavior.intent === "EXTEND") {
    state.phase = "Extending";
    return commandedTurnForHeading(state, awayHeading, maximumCommandG * 0.72);
  }
  if (behavior.intent === "UNAWARE_TRANSIT") {
    state.phase = "Unaware transit";
    return 0;
  }
  if (behavior.intent === "BEAM") {
    const side = cross(relativePosition, state.velocity).z >= 0 ? 1 : -1;
    state.phase = "Beaming threat";
    return commandedTurnForHeading(state, targetHeading + side * Math.PI / 2, maximumCommandG);
  }
  if (behavior.intent === "DEFENSIVE_BREAK") {
    state.phase = "Defensive break";
    return Math.max(-maximumCommandG, Math.min(maximumCommandG, behavior.commandedG));
  }
  if (behavior.intent === "RECOMMIT") {
    state.phase = time - activation < 24 ? "Extending before recommit" : "Recommitting";
    const desired = time - activation < 24 ? awayHeading : targetHeading;
    return commandedTurnForHeading(state, desired, maximumCommandG * 0.85);
  }
  return undefined;
}

function updateKinematicEntity(
  state: RuntimeState,
  states: Map<string, RuntimeState>,
  scenario: EngineScenario,
  time: number,
  dt: number,
) {
  if (state.lifecycle !== "ACTIVE" && state.lifecycle !== "TRACKING") return;
  const { behavior, kind } = state.definition;
  if (kind !== "AIRCRAFT") return;
  const model = state.definition.aircraft;
  const speed = Math.max(1, magnitude(state.velocity));
  let turnDemand = intentTurnDemand(state, states, time);
  const usedIntent = turnDemand !== undefined;
  if (!usedIntent) {
    turnDemand = 0;
  }
  if (!usedIntent && turnDemand === 0 && behavior.maneuver !== "steady" && time >= 5) {
    turnDemand =
      behavior.maneuver === "break"
        ? behavior.commandedG
        : behavior.commandedG * Math.sin(time * 0.55);
  }
  const resolvedTurnDemand = turnDemand ?? 0;
  const limitedTurnDemand = model
    ? Math.max(-model.maximumCommandG, Math.min(model.maximumCommandG, resolvedTurnDemand))
    : resolvedTurnDemand;
  const atmosphere = standardAtmosphere(
    state.position.z,
    scenario.environment.temperatureOffsetC,
  );
  const airRelative = subtract(state.velocity, activeWind(scenario, time));
  const airspeed = Math.max(1, magnitude(airRelative));
  let longitudinalAcceleration = 0;
  if (model) {
    const dynamicPressure = Math.max(1, 0.5 * atmosphere.densityKgM3 * airspeed * airspeed);
    const loadFactor = Math.sqrt(1 + limitedTurnDemand * limitedTurnDemand);
    const liftCoefficient =
      (state.massKg * G0 * loadFactor) /
      (dynamicPressure * model.referenceAreaM2);
    const dragCoefficient =
      model.zeroLiftDragCoefficient +
      model.inducedDragFactor * liftCoefficient * liftCoefficient;
    const drag = dynamicPressure * model.referenceAreaM2 * dragCoefficient;
    const thrustDemand = Math.min(
      model.maximumThrustNewtons,
      drag * (limitedTurnDemand === 0 ? 1.02 : 1.18),
    );
    const fuelFlow =
      state.fuelKg > 0
        ? thrustDemand * model.specificFuelConsumptionKgPerNewtonSecond
        : 0;
    const consumed = Math.min(state.fuelKg, fuelFlow * dt);
    state.fuelKg -= consumed;
    state.massKg = Math.max(model.emptyMassKg, state.massKg - consumed);
    state.dragNewtons = drag;
    state.thrustNewtons = state.fuelKg > 0 ? thrustDemand : 0;
    longitudinalAcceleration =
      (state.thrustNewtons - state.dragNewtons) / state.massKg;
    state.availableG = model.maximumCommandG;
  }
  const nextSpeed = Math.max(60, speed + longitudinalAcceleration * dt);
  const turnRate = (limitedTurnDemand * G0) / nextSpeed;
  state.headingRad += turnRate * dt;
  state.velocity = {
    x: Math.cos(state.headingRad) * nextSpeed,
    y: Math.sin(state.headingRad) * nextSpeed,
    z: state.velocity.z,
  };
  state.position = add(state.position, scale(state.velocity, dt));
  state.commandedG = Math.abs(limitedTurnDemand);
  state.phase =
    usedIntent
      ? state.phase
      : limitedTurnDemand === 0
        ? "Steady flight"
        : "Commanded maneuver";
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
    state.position = { ...launcher.position };
    state.velocity = { ...launcher.velocity };
    state.headingRad = launcher.headingRad;
  }
  state.lifecycle = "ACTIVE";
  state.phase = "Launched";
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
  const supportAvailable =
    weapon.supportAvailable !== false ||
    terminalGuidance ||
    weapon.supportMode === "INFRARED_LOCK" ||
    weapon.supportMode === "PASSIVE_HOMING";
  const updateMultiplier =
    state.definition.behavior.decision === "CRANK"
      ? 1.5
      : state.definition.behavior.decision === "DEFEND"
        ? 3
        : state.definition.behavior.decision === "DISENGAGE"
          ? Number.POSITIVE_INFINITY
          : 1;
  const guidanceUpdateDue =
    terminalGuidance ||
    time - state.lastGuidanceUpdateSeconds >=
      weapon.datalinkUpdateSeconds * updateMultiplier;
  const holdGuidance = guidanceHeld(
    scenario,
    state.definition.id,
    time,
  );
  const guidanceAcceleration = holdGuidance || !supportAvailable || !guidanceUpdateDue
    ? state.lastGuidanceAcceleration
    : clampMagnitude(unclampedGuidance, maximumAcceleration);
  if (!holdGuidance && supportAvailable && guidanceUpdateDue) {
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
    : !supportAvailable
      ? "Support denied"
    : terminalGuidance
      ? "Terminal guidance"
      : "Midcourse guidance";
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
    phase: state.phase,
    valueState: state.definition.provenance.valueState,
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
    const launchedWeapon = scenario.entities.find(
      (entity) =>
        entity.kind === "GUIDED_WEAPON" && entity.weapon?.launchTimeSeconds !== null,
    );
    const bluePlatform = scenario.entities.find(
      (entity) => entity.id === "blue-platform-1",
    );
    this.primaryWeapon = this.states.get(
      launchedWeapon?.id ?? bluePlatform?.id ?? "",
    );
    this.primaryTarget = launchedWeapon?.weapon
      ? this.states.get(launchedWeapon.weapon.targetEntityId)
      : this.states.get("red-object-1");
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
        updateKinematicEntity(
          state,
          this.states,
          scenario,
          time,
          scenario.fixedStepSeconds,
        );
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
        });
      }

      if (separationM <= scenario.completion.distanceMeters) {
        this.termination = "threshold_reached";
        this.completed = true;
      } else {
        const speed = magnitude(primaryWeapon.velocity);
        const weapon = primaryWeapon.definition.weapon;
        const sinceLaunch = time - (weapon?.launchTimeSeconds ?? 0);
        if (
          weapon &&
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
