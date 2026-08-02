export type ProfileId = "short" | "medium" | "sustained";
export type Guidance = "direct" | "loft";
export type Maneuver = "steady" | "break" | "weave";
export type Vec3 = { x: number; y: number; z: number };

export type Scenario = {
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

export type SimulationResult = {
  frames: Frame[];
  outcome: "Intercept" | "Miss" | "Guidance lost";
  closestApproach: number;
  timeOfFlight: number;
  endSpeed: number;
  peakDemand: number;
  reason: string;
};

export const PROFILES = {
  short: { name: "Short-range infrared", short: "SR–IR", motor: "Boost", burn: 5, maxSpeed: 860, maxRange: 22, turnG: 34, color: 0xc8842c },
  medium: { name: "Medium-range radar", short: "MR–AR", motor: "Boost–sustain", burn: 10, maxSpeed: 1180, maxRange: 68, turnG: 30, color: 0x2f6fb5 },
  sustained: { name: "Long-range sustained", short: "LR–S", motor: "Sustained", burn: 25, maxSpeed: 1420, maxRange: 125, turnG: 24, color: 0x715c9a },
} as const;

export const DEFAULT_SCENARIO: Scenario = {
  name: "Crossing-air-target intercept",
  objective: "Understand how launch geometry and target manoeuvre affect the result",
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
  const profile = PROFILES[profileId];
  const dt = 0.1;
  const gravity = 9.81;
  const frames: Frame[] = [];
  let ix = 0;
  let iy = 0;
  let iz = input.altitude;
  let interceptorHeading = 0;
  let interceptorSpeed = input.launcherSpeed;
  let tx = input.range;
  let ty = 0;
  const tz = input.altitude + input.targetDelta;
  let targetHeading = ((180 - input.aspect) * Math.PI) / 180;
  const targetSpeed = input.targetSpeed;
  let previousLosAngle = Math.atan2(ty - iy, tx - ix);
  let peakDemand = 0;
  let closestApproach = Number.POSITIVE_INFINITY;
  let outcome: SimulationResult["outcome"] = "Miss";
  let reason = "No intercept within the model time and range limits.";

  for (let time = 0; time <= 100; time += dt) {
    if (input.maneuver !== "steady" && time > 5) {
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
    const desiredHeading = Math.atan2(dy, dx);
    const losRate = Math.abs(angularDifference(desiredHeading, previousLosAngle)) / dt;
    previousLosAngle = desiredHeading;
    const availableG = Math.max(5, profile.turnG * (0.45 + 0.55 * Math.min(interceptorSpeed / profile.maxSpeed, 1)));
    const previousHeading = interceptorHeading;
    interceptorHeading = rotateToward(interceptorHeading, desiredHeading, (availableG * gravity * dt) / Math.max(interceptorSpeed, 100));
    peakDemand = Math.max(peakDemand, (Math.abs(interceptorHeading - previousHeading) / dt) * interceptorSpeed / gravity);

    if (time < profile.burn) {
      interceptorSpeed = Math.min(profile.maxSpeed, interceptorSpeed + ((profile.maxSpeed - input.launcherSpeed) / profile.burn) * dt);
    } else {
      interceptorSpeed = Math.max(210, interceptorSpeed - (profileId === "sustained" ? 4.2 : 8.5) * dt - input.wind * 0.025);
    }

    const progress = Math.max(0, Math.min(1, 1 - Math.hypot(dx, dy) / Math.max(input.range, 1)));
    const loft = input.guidance === "loft"
      ? Math.sin(progress * Math.PI) * Math.min(7000, input.range * 0.08)
      : 0;
    const desiredAltitude = input.altitude + (tz - input.altitude) * progress + loft;
    iz += Math.max(-140, Math.min(140, (desiredAltitude - iz) * 0.35)) * dt;
    ix += Math.cos(interceptorHeading) * interceptorSpeed * dt;
    iy += Math.sin(interceptorHeading) * interceptorSpeed * dt;

    const energy = Math.max(0, Math.min(100, ((interceptorSpeed - 210) / (profile.maxSpeed - 210)) * 100));
    const phase = time < profile.burn ? "Motor burn" : energy > 30 ? "Midcourse" : "Terminal";
    if (Math.round(time * 10) % 5 === 0) {
      frames.push({
        t: time,
        interceptor: { x: ix, y: iy, z: iz },
        target: { x: tx, y: ty, z: tz },
        speed: interceptorSpeed,
        range,
        energy,
        phase,
        losRate,
      });
    }

    if (range < 180) {
      outcome = "Intercept";
      reason = "The intercept threshold was reached in the educational model.";
      break;
    }
    if (time > (profile.maxRange * 1000 / Math.max(interceptorSpeed, 1)) * 1.35 || ix > input.range * 2.2) break;
    if (energy < 2 && range > 1500) {
      outcome = "Guidance lost";
      reason = "The profile no longer retained enough energy to continue commanded pursuit.";
      break;
    }
  }

  const last = frames.at(-1);
  return {
    frames,
    outcome,
    closestApproach: outcome === "Intercept" ? Math.min(closestApproach, 180) : closestApproach,
    timeOfFlight: last?.t ?? 0,
    endSpeed: last?.speed ?? 0,
    peakDemand,
    reason,
  };
}

export function getFrameAt(result: SimulationResult, time: number) {
  return result.frames.reduce(
    (best, frame) => Math.abs(frame.t - time) < Math.abs(best.t - time) ? frame : best,
    result.frames[0],
  );
}
