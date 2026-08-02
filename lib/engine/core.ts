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

function updateKinematicEntity(state: RuntimeState, time: number, dt: number) {
  if (state.lifecycle !== "ACTIVE" && state.lifecycle !== "TRACKING") return;
  const { behavior, kind } = state.definition;
  if (kind !== "AIRCRAFT") return;
  const speed = Math.max(1, magnitude(state.velocity));
  let turnDemand = 0;
  if (behavior.maneuver !== "steady" && time >= 5) {
    turnDemand =
      behavior.maneuver === "break"
        ? behavior.commandedG
        : behavior.commandedG * Math.sin(time * 0.55);
  }
  const turnRate = (turnDemand * G0) / speed;
  state.headingRad += turnRate * dt;
  const horizontalSpeed = Math.hypot(state.velocity.x, state.velocity.y);
  state.velocity = {
    x: Math.cos(state.headingRad) * horizontalSpeed,
    y: Math.sin(state.headingRad) * horizontalSpeed,
    z: state.velocity.z,
  };
  state.position = add(state.position, scale(state.velocity, dt));
  state.commandedG = Math.abs(turnDemand);
  state.phase = turnDemand === 0 ? "Steady flight" : "Commanded maneuver";
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
  const thrust = burning ? weapon.thrustNewtons : 0;
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
  if (weapon.guidance === "loft") {
    const desiredHeight = Math.min(9000, Math.max(800, separation * 0.06));
    const altitudeError = target.position.z + desiredHeight - state.position.z;
    loftAcceleration = {
      x: 0,
      y: 0,
      z: Math.max(-18, Math.min(18, altitudeError * 0.0025)),
    };
  }
  const maximumAcceleration = weapon.maximumCommandG * G0;
  const unclampedGuidance = add(nominalGuidance, loftAcceleration);
  const guidanceAcceleration = guidanceHeld(
    scenario,
    state.definition.id,
    time,
  )
    ? state.lastGuidanceAcceleration
    : clampMagnitude(unclampedGuidance, maximumAcceleration);
  if (!guidanceHeld(scenario, state.definition.id, time)) {
    state.lastGuidanceAcceleration = guidanceAcceleration;
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
    : separation <= weapon.seekerActivationRangeM
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
      },
      {
        ...shared,
        id: `${entity.id}-tracking`,
        kind: "TRACKING" as const,
        radiusM: sensor.trackingRadiusM,
        label: `${entity.designation} tracking study volume`,
      },
    ];
  });
}

export function runEngine(scenario: EngineScenario): EngineRun {
  const states = new Map(
    scenario.entities.map((definition) => [definition.id, initialState(definition)]),
  );
  const primaryWeapon = states.get(
    scenario.entities.find(
      (entity) =>
        entity.kind === "GUIDED_WEAPON" && entity.weapon?.launchTimeSeconds !== null,
    )?.id ?? "",
  );
  const primaryTarget = primaryWeapon?.definition.weapon
    ? states.get(primaryWeapon.definition.weapon.targetEntityId)
    : undefined;
  if (!primaryWeapon || !primaryTarget) {
    return {
      scenario,
      frames: [],
      envelopes: buildEnvelopes(scenario),
      primaryWeaponId: "",
      primaryTargetId: "",
      termination: "invalid_scenario",
      closestApproachM: Number.POSITIVE_INFINITY,
      peakCommandG: 0,
      diagnostics: {
        fixedStepSeconds: scenario.fixedStepSeconds,
        integratedSteps: 0,
        nonFiniteStateCount: 0,
        minimumMassMarginKg: 0,
      },
    };
  }

  const frames: EngineRun["frames"] = [];
  let termination: EngineRun["termination"] = "time_limit";
  let closestApproachM = Number.POSITIVE_INFINITY;
  let peakCommandG = 0;
  let integratedSteps = 0;
  let nonFiniteStateCount = 0;
  let minimumMassMarginKg = Number.POSITIVE_INFINITY;
  const sampleEvery = Math.max(1, Math.round(0.25 / scenario.fixedStepSeconds));

  for (
    let time = 0;
    time <= scenario.durationSeconds + 1e-9;
    time += scenario.fixedStepSeconds
  ) {
    for (const state of states.values()) activateWeapon(state, states, time);
    for (const state of states.values())
      updateKinematicEntity(state, time, scenario.fixedStepSeconds);
    for (const state of states.values())
      updateWeapon(state, states, scenario, time, scenario.fixedStepSeconds);
    integratedSteps += 1;

    const relativePosition = subtract(primaryTarget.position, primaryWeapon.position);
    const relativeVelocity = subtract(primaryTarget.velocity, primaryWeapon.velocity);
    const separationM = magnitude(relativePosition);
    const los = normalize(relativePosition);
    const closureRateMps = -dot(relativeVelocity, los);
    const lineOfSightRateRadS =
      magnitude(cross(relativePosition, relativeVelocity)) /
      Math.max(1, separationM * separationM);
    closestApproachM = Math.min(closestApproachM, separationM);
    peakCommandG = Math.max(peakCommandG, primaryWeapon.commandedG);
    const dryMass = primaryWeapon.definition.weapon?.dryMassKg ?? 0;
    minimumMassMarginKg = Math.min(
      minimumMassMarginKg,
      primaryWeapon.massKg - dryMass,
    );
    for (const state of states.values()) {
      const values = [
        state.position.x,
        state.position.y,
        state.position.z,
        state.velocity.x,
        state.velocity.y,
        state.velocity.z,
        state.massKg,
      ];
      if (values.some((value) => !Number.isFinite(value))) nonFiniteStateCount += 1;
    }

    if (integratedSteps % sampleEvery === 1 || integratedSteps === 1) {
      frames.push({
        t: Number(time.toFixed(6)),
        entities: [...states.values()].map((state) => toFrame(state, scenario)),
        primaryWeaponId: primaryWeapon.definition.id,
        primaryTargetId: primaryTarget.definition.id,
        separationM,
        closureRateMps,
        lineOfSightRateRadS,
      });
    }

    if (separationM <= scenario.completion.distanceMeters) {
      termination = "threshold_reached";
      break;
    }
    const speed = magnitude(primaryWeapon.velocity);
    const weapon = primaryWeapon.definition.weapon!;
    const sinceLaunch = time - (weapon.launchTimeSeconds ?? 0);
    if (sinceLaunch > weapon.burnSeconds + 2 && speed < 80 && separationM > 1000) {
      termination = "energy_depleted";
      break;
    }
    if (primaryWeapon.position.z <= 0 && time > 1) {
      termination = "energy_depleted";
      break;
    }
  }

  return {
    scenario,
    frames,
    envelopes: buildEnvelopes(scenario),
    primaryWeaponId: primaryWeapon.definition.id,
    primaryTargetId: primaryTarget.definition.id,
    termination,
    closestApproachM,
    peakCommandG,
    diagnostics: {
      fixedStepSeconds: scenario.fixedStepSeconds,
      integratedSteps,
      nonFiniteStateCount,
      minimumMassMarginKg: Number.isFinite(minimumMassMarginKg)
        ? minimumMassMarginKg
        : 0,
    },
  };
}
