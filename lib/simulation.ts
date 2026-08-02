export type EngagementDomain = "A2A" | "A2G" | "G2A" | "G2G";
export type ProfileId = "short" | "medium" | "sustained";
export type Guidance = "direct" | "loft";
export type Maneuver = "steady" | "break" | "weave";
export type Vec3 = { x: number; y: number; z: number };

export type Scenario = {
  domain: EngagementDomain;
  name: string;
  objective: string;
  profile: ProfileId;
  guidance: Guidance;
  altitude: number;
  targetDelta: number;
  range: number;
  aspect: number;
  launcherSpeed: number;
  targetSpeed: number;
  maneuver: Maneuver;
  targetG: number;
  wind: number;
  guidanceInterruptionAt: number | null;
  guidanceInterruptionDuration: number;
  lossIncreaseAt: number | null;
  lossIncreaseAmount: number;
  seed: number;
};

export type Frame = {
  t: number;
  interceptor: Vec3;
  target: Vec3;
  speed: number;
  range: number;
  energy: number;
  phase: string;
  losRate: number;
};

export type TerminationCode = "threshold_reached" | "energy_depleted" | "profile_range_limit" | "time_limit";

export type SimulationResult = {
  frames: Frame[];
  outcome: "Intercept" | "Objective reached" | "Energy depleted" | "Outside profile envelope" | "Time limit reached";
  successful: boolean;
  termination: TerminationCode;
  closestApproach: number;
  timeOfFlight: number;
  endSpeed: number;
  peakDemand: number;
  reason: string;
};

export type VehicleProfile = {
  name: string;
  short: string;
  description: string;
  motor: string;
  burn: number;
  maxSpeed: number;
  maxRange: number;
  turnG: number;
  color: number;
};

const profile = (value: VehicleProfile) => value;

export const PROFILE_CATALOGS: Record<EngagementDomain, Record<ProfileId, VehicleProfile>> = {
  A2A: {
    short: profile({ name: "Short-range air interceptor", short: "AIR–S", description: "Short engagement window; highest modeled turn authority.", motor: "Boost", burn: 5, maxSpeed: 860, maxRange: 22, turnG: 34, color: 0xc8842c }),
    medium: profile({ name: "Medium-range air interceptor", short: "AIR–M", description: "Balanced reach, powered flight, and maneuver authority.", motor: "Boost–sustain", burn: 10, maxSpeed: 1180, maxRange: 68, turnG: 30, color: 0x2f6fb5 }),
    sustained: profile({ name: "Extended-range air interceptor", short: "AIR–L", description: "Longer modeled powered flight with lower turn authority.", motor: "Sustained", burn: 25, maxSpeed: 1420, maxRange: 125, turnG: 24, color: 0x715c9a }),
  },
  A2G: {
    short: profile({ name: "Direct-attack flight profile", short: "A/S–S", description: "Short airborne approach to a fixed surface objective.", motor: "Powered", burn: 8, maxSpeed: 720, maxRange: 30, turnG: 12, color: 0xc8842c }),
    medium: profile({ name: "Medium standoff flight profile", short: "A/S–M", description: "Moderate standoff distance with a simplified glide or powered path.", motor: "Boost–sustain", burn: 18, maxSpeed: 920, maxRange: 80, turnG: 10, color: 0x2f6fb5 }),
    sustained: profile({ name: "Extended standoff flight profile", short: "A/S–L", description: "Longer approach envelope for fixed-objective sensitivity studies.", motor: "Sustained", burn: 32, maxSpeed: 1120, maxRange: 140, turnG: 8, color: 0x715c9a }),
  },
  G2A: {
    short: profile({ name: "Point-defence interceptor", short: "AD–S", description: "Short defended radius and high modeled maneuver authority.", motor: "Boost", burn: 7, maxSpeed: 900, maxRange: 32, turnG: 32, color: 0xc8842c }),
    medium: profile({ name: "Area-defence interceptor", short: "AD–M", description: "Medium defended radius for a single active engagement layer.", motor: "Boost–sustain", burn: 15, maxSpeed: 1220, maxRange: 85, turnG: 27, color: 0x2f6fb5 }),
    sustained: profile({ name: "Extended-area interceptor", short: "AD–L", description: "Longer modeled reach for one active layer at a time.", motor: "Sustained", burn: 28, maxSpeed: 1480, maxRange: 150, turnG: 22, color: 0x715c9a }),
  },
  G2G: {
    short: profile({ name: "Short-range surface-strike profile", short: "SS–S", description: "Surface-launched trajectory for objectives inside 45 km.", motor: "Powered", burn: 14, maxSpeed: 760, maxRange: 45, turnG: 8, color: 0xc8842c }),
    medium: profile({ name: "Medium-range surface-strike profile", short: "SS–M", description: "Surface-launched trajectory for objectives inside 100 km.", motor: "Sustained", burn: 27, maxSpeed: 1040, maxRange: 100, turnG: 7, color: 0x2f6fb5 }),
    sustained: profile({ name: "Extended-range surface-strike profile", short: "SS–L", description: "Surface-launched trajectory for objectives inside 170 km.", motor: "Sustained", burn: 42, maxSpeed: 1380, maxRange: 170, turnG: 6, color: 0x715c9a }),
  },
};

export const PROFILES = PROFILE_CATALOGS.A2A;
export const getProfiles = (domain: EngagementDomain) => PROFILE_CATALOGS[domain];
export const getProfile = (scenario: Scenario, id: ProfileId = scenario.profile) => PROFILE_CATALOGS[scenario.domain][id];

export const DEFAULT_SCENARIO: Scenario = {
  domain: "A2A",
  name: "Crossing-air-target intercept",
  objective: "Compare launch timing and target maneuver in a crossing intercept.",
  profile: "medium",
  guidance: "loft",
  altitude: 8500,
  targetDelta: 1500,
  range: 52000,
  aspect: 145,
  launcherSpeed: 270,
  targetSpeed: 250,
  maneuver: "break",
  targetG: 4,
  wind: 12,
  guidanceInterruptionAt: null,
  guidanceInterruptionDuration: 8,
  lossIncreaseAt: null,
  lossIncreaseAmount: 8,
  seed: 42,
};

function rotateToward(current: number, target: number, maximum: number) {
  let delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  delta = Math.max(-maximum, Math.min(maximum, delta));
  return current + delta;
}

function angularDifference(current: number, previous: number) {
  return Math.atan2(Math.sin(current - previous), Math.cos(current - previous));
}

export function simulate(input: Scenario, profileId: ProfileId = input.profile): SimulationResult {
  const profile = getProfiles(input.domain)[profileId];
  const dt = 0.1;
  const gravity = 9.81;
  const frames: Frame[] = [];
  const fixedObjective = input.domain === "A2G" || input.domain === "G2G";
  const maxTime = input.domain === "G2G" ? 180 : 120;
  let ix = 0;
  let iy = 0;
  let iz = input.altitude;
  let interceptorHeading = 0;
  let interceptorSpeed = Math.max(0, input.launcherSpeed);
  let travelledDistance = 0;
  let tx = input.range;
  let ty = 0;
  const tz = input.altitude + input.targetDelta;
  let targetHeading = ((180 - input.aspect) * Math.PI) / 180;
  const targetSpeed = fixedObjective ? 0 : input.targetSpeed;
  let previousLosAngle = Math.atan2(ty - iy, tx - ix);
  let guidanceHeading = previousLosAngle;
  let peakDemand = 0;
  let closestApproach = Number.POSITIVE_INFINITY;
  let termination: TerminationCode = "time_limit";

  for (let time = 0; time <= maxTime; time += dt) {
    if (!fixedObjective && input.maneuver !== "steady" && input.targetG > 0 && time > 5) {
      const direction = input.maneuver === "break" ? 1 : Math.sin(time * 0.55);
      targetHeading += direction * ((input.targetG * gravity) / Math.max(targetSpeed, 1)) * dt * 0.18;
    }
    tx += Math.cos(targetHeading) * targetSpeed * dt;
    ty += Math.sin(targetHeading) * targetSpeed * dt;

    const dx = tx - ix;
    const dy = ty - iy;
    const dz = tz - iz;
    const range = Math.hypot(dx, dy, dz);
    closestApproach = Math.min(closestApproach, range);
    const lineOfSightHeading = Math.atan2(dy, dx);
    const losRate = Math.abs(angularDifference(lineOfSightHeading, previousLosAngle)) / dt;
    previousLosAngle = lineOfSightHeading;
    const guidanceInterrupted = input.guidanceInterruptionAt !== null && time >= input.guidanceInterruptionAt && time < input.guidanceInterruptionAt + input.guidanceInterruptionDuration;
    if (!guidanceInterrupted) guidanceHeading = lineOfSightHeading;
    const desiredHeading = guidanceHeading;
    const availableG = Math.max(3, profile.turnG * (0.45 + 0.55 * Math.min(interceptorSpeed / profile.maxSpeed, 1)));
    const previousHeading = interceptorHeading;
    interceptorHeading = rotateToward(interceptorHeading, desiredHeading, (availableG * gravity * dt) / Math.max(interceptorSpeed, 100));
    peakDemand = Math.max(peakDemand, (Math.abs(interceptorHeading - previousHeading) / dt) * interceptorSpeed / gravity);

    if (time < profile.burn) {
      interceptorSpeed = Math.min(profile.maxSpeed, interceptorSpeed + ((profile.maxSpeed - input.launcherSpeed) / profile.burn) * dt);
    } else {
      const baseLoss = profileId === "sustained" ? 3.8 : profileId === "medium" ? 6.2 : 8.5;
      const injectedLoss = input.lossIncreaseAt !== null && time >= input.lossIncreaseAt ? input.lossIncreaseAmount : 0;
      interceptorSpeed = Math.max(0, interceptorSpeed - baseLoss * dt - (input.wind + injectedLoss) * 0.025);
    }

    const progress = Math.max(0, Math.min(1, 1 - Math.hypot(dx, dy) / Math.max(input.range, 1)));
    const loft = input.guidance === "loft" ? Math.sin(progress * Math.PI) * Math.min(7000, input.range * 0.08) : 0;
    const desiredAltitude = input.altitude + (tz - input.altitude) * progress + loft;
    iz += Math.max(-140, Math.min(140, (desiredAltitude - iz) * 0.35)) * dt;
    ix += Math.cos(interceptorHeading) * interceptorSpeed * dt;
    iy += Math.sin(interceptorHeading) * interceptorSpeed * dt;
    travelledDistance += interceptorSpeed * dt;

    const energy = Math.max(0, Math.min(100, ((interceptorSpeed - 150) / Math.max(profile.maxSpeed - 150, 1)) * 100));
    const phase = time < profile.burn ? "Powered flight" : progress < .72 ? "Midcourse" : "Terminal";
    if (Math.round(time * 10) % 5 === 0) {
      frames.push({ t: time, interceptor: { x: ix, y: iy, z: iz }, target: { x: tx, y: ty, z: tz }, speed: interceptorSpeed, range, energy, phase, losRate });
    }

    if (range < 180) {
      termination = "threshold_reached";
      break;
    }
    if (travelledDistance > profile.maxRange * 1000 * 1.08) {
      termination = "profile_range_limit";
      break;
    }
    if (time > profile.burn && energy < 2 && range > 1500) {
      termination = "energy_depleted";
      break;
    }
  }

  const successful = termination === "threshold_reached";
  const outcome = successful
    ? fixedObjective ? "Objective reached" : "Intercept"
    : termination === "energy_depleted" ? "Energy depleted"
      : termination === "profile_range_limit" ? "Outside profile envelope" : "Time limit reached";
  const reason = termination === "threshold_reached"
    ? fixedObjective ? "The modeled vehicle reached the fixed-objective completion threshold." : "The modeled interceptor reached the airborne-target completion threshold."
    : termination === "energy_depleted" ? "Modeled speed fell below the continuation threshold after powered flight."
      : termination === "profile_range_limit" ? `The run exceeded the selected profile's ${profile.maxRange} km modeled distance envelope.`
        : `The run did not reach the completion threshold within ${maxTime} model seconds.`;
  const last = frames.at(-1);

  return {
    frames,
    outcome,
    successful,
    termination,
    closestApproach: successful ? Math.min(closestApproach, 180) : closestApproach,
    timeOfFlight: last?.t ?? 0,
    endSpeed: last?.speed ?? 0,
    peakDemand,
    reason,
  };
}

export function explainResult(scenario: Scenario, result: SimulationResult) {
  const profile = getProfile(scenario);
  if (result.termination === "threshold_reached") {
    return `${profile.name} covered the ${scenario.range / 1000} km starting distance and reached the model's 180 m completion threshold in ${result.timeOfFlight.toFixed(1)} seconds.`;
  }
  if (result.termination === "profile_range_limit") {
    return `The ${scenario.range / 1000} km starting distance is beyond the selected ${profile.maxRange} km profile envelope. Choose a longer-range profile or reduce the distance.`;
  }
  if (result.termination === "energy_depleted") {
    return `After ${profile.burn} seconds of powered flight, modeled speed fell below the continuation threshold with ${Math.round(result.closestApproach / 1000)} km still separating the vehicle and objective.`;
  }
  return `The run reached its model-time limit before the 180 m completion threshold. Review distance, flight path, and environmental-loss assumptions.`;
}

export function getFrameAt(result: SimulationResult, time: number) {
  return result.frames.reduce((best, frame) => Math.abs(frame.t - time) < Math.abs(best.t - time) ? frame : best, result.frames[0]);
}
