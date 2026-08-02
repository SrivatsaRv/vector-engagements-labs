export type EngagementDomain = "A2A" | "A2G" | "G2A" | "G2G";
export type ProfileId = "short" | "medium" | "sustained";
export type Guidance = "direct" | "loft";
export type Maneuver = "steady" | "break" | "weave";
export type RadarMode = "ACTIVE" | "SILENT";
export type TrackSource =
  | "ONBOARD_RADAR"
  | "DATALINK"
  | "AIRBORNE_EARLY_WARNING"
  | "VISUAL";
export type TacticalDecision =
  | "PRESS"
  | "SUPPORT_WEAPON"
  | "CRANK"
  | "DEFEND"
  | "DISENGAGE";
export type Vec3 = { x: number; y: number; z: number };

export type Scenario = {
  domain: EngagementDomain;
  name: string;
  objective: string;
  bluePlatformId: string;
  blueSystemId: string;
  redObjectId: string;
  redSystemId: string;
  blueWeaponQuantity: number;
  redWeaponQuantity: number;
  blueFuelPercent: number;
  redFuelPercent: number;
  blueRadarMode: RadarMode;
  redRadarMode: RadarMode;
  blueTrackSource: TrackSource;
  redTrackSource: TrackSource;
  blueDatalink: boolean;
  redDatalink: boolean;
  blueJammer: boolean;
  redJammer: boolean;
  blueDecision: TacticalDecision;
  redDecision: TacticalDecision;
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
  temperatureOffset: number;
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
  airDensity: number;
  mach: number;
};

export type AtmosphereState = {
  temperatureK: number;
  pressureKpa: number;
  densityKgM3: number;
  speedOfSoundMps: number;
};

export type RaspTrack = {
  perspective: "IAF" | "PAF";
  trackId: string;
  classification: string;
  identification: "FRIEND" | "HOSTILE" | "SUSPECT" | "UNKNOWN";
  source: string;
  lastUpdateSeconds: number;
  ageSeconds: number;
  confidence: number;
  uncertaintyMeters: number;
  position: Vec3;
  truthPosition: Vec3;
  status: "TRACKING" | "DEGRADED" | "COASTING";
};

export type TerminationCode =
  | "threshold_reached"
  | "energy_depleted"
  | "profile_range_limit"
  | "time_limit";

export type SimulationResult = {
  frames: Frame[];
  outcome:
    | "Intercept"
    | "Objective reached"
    | "Energy depleted"
    | "Modeled distance exhausted"
    | "Time limit reached";
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

export const PROFILE_CATALOGS: Record<
  EngagementDomain,
  Record<ProfileId, VehicleProfile>
> = {
  A2A: {
    short: profile({
      name: "Short-range air interceptor",
      short: "AIR–S",
      description: "Short engagement window; highest modeled turn authority.",
      motor: "Boost",
      burn: 5,
      maxSpeed: 860,
      maxRange: 22,
      turnG: 34,
      color: 0xc8842c,
    }),
    medium: profile({
      name: "Medium-range air interceptor",
      short: "AIR–M",
      description: "Balanced reach, powered flight, and maneuver authority.",
      motor: "Boost–sustain",
      burn: 10,
      maxSpeed: 1180,
      maxRange: 68,
      turnG: 30,
      color: 0x2f6fb5,
    }),
    sustained: profile({
      name: "Extended-range air interceptor",
      short: "AIR–L",
      description: "Longer modeled powered flight with lower turn authority.",
      motor: "Sustained",
      burn: 25,
      maxSpeed: 1420,
      maxRange: 125,
      turnG: 24,
      color: 0x715c9a,
    }),
  },
  A2G: {
    short: profile({
      name: "Direct-attack flight profile",
      short: "A/S–S",
      description: "Short airborne approach to a fixed surface objective.",
      motor: "Powered",
      burn: 8,
      maxSpeed: 720,
      maxRange: 30,
      turnG: 12,
      color: 0xc8842c,
    }),
    medium: profile({
      name: "Medium standoff flight profile",
      short: "A/S–M",
      description:
        "Moderate standoff distance with a simplified glide or powered path.",
      motor: "Boost–sustain",
      burn: 18,
      maxSpeed: 920,
      maxRange: 80,
      turnG: 10,
      color: 0x2f6fb5,
    }),
    sustained: profile({
      name: "Extended standoff flight profile",
      short: "A/S–L",
      description:
        "Longer approach envelope for fixed-objective sensitivity studies.",
      motor: "Sustained",
      burn: 32,
      maxSpeed: 1120,
      maxRange: 140,
      turnG: 8,
      color: 0x715c9a,
    }),
  },
  G2A: {
    short: profile({
      name: "Point-defence interceptor",
      short: "AD–S",
      description: "Short defended radius and high modeled maneuver authority.",
      motor: "Boost",
      burn: 7,
      maxSpeed: 900,
      maxRange: 32,
      turnG: 32,
      color: 0xc8842c,
    }),
    medium: profile({
      name: "Area-defence interceptor",
      short: "AD–M",
      description:
        "Medium defended radius for a single active engagement layer.",
      motor: "Boost–sustain",
      burn: 15,
      maxSpeed: 1220,
      maxRange: 85,
      turnG: 27,
      color: 0x2f6fb5,
    }),
    sustained: profile({
      name: "Extended-area interceptor",
      short: "AD–L",
      description: "Longer modeled reach for one active layer at a time.",
      motor: "Sustained",
      burn: 28,
      maxSpeed: 1480,
      maxRange: 150,
      turnG: 22,
      color: 0x715c9a,
    }),
  },
  G2G: {
    short: profile({
      name: "Short-range surface-strike profile",
      short: "SS–S",
      description: "Surface-launched trajectory for objectives inside 45 km.",
      motor: "Powered",
      burn: 14,
      maxSpeed: 760,
      maxRange: 45,
      turnG: 8,
      color: 0xc8842c,
    }),
    medium: profile({
      name: "Medium-range surface-strike profile",
      short: "SS–M",
      description: "Surface-launched trajectory for objectives inside 100 km.",
      motor: "Sustained",
      burn: 27,
      maxSpeed: 1040,
      maxRange: 100,
      turnG: 7,
      color: 0x2f6fb5,
    }),
    sustained: profile({
      name: "Extended-range surface-strike profile",
      short: "SS–L",
      description: "Surface-launched trajectory for objectives inside 170 km.",
      motor: "Sustained",
      burn: 42,
      maxSpeed: 1380,
      maxRange: 170,
      turnG: 6,
      color: 0x715c9a,
    }),
  },
};

export const PROFILES = PROFILE_CATALOGS.A2A;
export const getProfiles = (domain: EngagementDomain) =>
  PROFILE_CATALOGS[domain];
export const getProfile = (
  scenario: Scenario,
  id: ProfileId = scenario.profile,
) => resolveProfile(scenario, id);

export const DEFAULT_SCENARIO: Scenario = {
  domain: "A2A",
  name: "Crossing-air-target intercept",
  objective:
    "Compare launch timing and target maneuver in a crossing intercept.",
  bluePlatformId: "su-30mki",
  blueSystemId: "astra-mk1",
  redObjectId: "f-16c-block52-paf",
  redSystemId: "aim-120c5",
  blueWeaponQuantity: 2,
  redWeaponQuantity: 2,
  blueFuelPercent: 70,
  redFuelPercent: 70,
  blueRadarMode: "ACTIVE",
  redRadarMode: "ACTIVE",
  blueTrackSource: "ONBOARD_RADAR",
  redTrackSource: "ONBOARD_RADAR",
  blueDatalink: true,
  redDatalink: true,
  blueJammer: false,
  redJammer: false,
  blueDecision: "SUPPORT_WEAPON",
  redDecision: "DEFEND",
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
  temperatureOffset: 0,
  guidanceInterruptionAt: null,
  guidanceInterruptionDuration: 8,
  lossIncreaseAt: null,
  lossIncreaseAmount: 8,
  seed: 42,
};

export function standardAtmosphere(
  altitudeMeters: number,
  temperatureOffsetC = 0,
): AtmosphereState {
  const altitude = Math.max(0, Math.min(25000, altitudeMeters));
  let temperatureC: number;
  let pressureKpa: number;
  if (altitude <= 11000) {
    temperatureC = 15.04 - 0.00649 * altitude;
    pressureKpa = 101.29 * Math.pow((temperatureC + 273.1) / 288.08, 5.256);
  } else {
    temperatureC = -56.46;
    pressureKpa = 22.65 * Math.exp(1.73 - 0.000157 * altitude);
  }
  temperatureC += temperatureOffsetC;
  const temperatureK = temperatureC + 273.15;
  const densityKgM3 = pressureKpa / (0.2869 * temperatureK);
  return {
    temperatureK,
    pressureKpa,
    densityKgM3,
    speedOfSoundMps: Math.sqrt(1.4 * 287.05 * temperatureK),
  };
}

function resolveProfile(input: Scenario, profileId: ProfileId): VehicleProfile {
  if (input.domain !== "A2A") return PROFILE_CATALOGS[input.domain][profileId];
  // Imported lazily through this local map so published weapon facts and model
  // assumptions remain different contracts without making the engine async.
  const profiles: Record<string, VehicleProfile> = {
    "astra-mk1": {
      name: "Astra Mk-I public-study profile",
      short: "ASTRA",
      description:
        "Public-study comparison curve; not verified weapon performance.",
      motor: "Modeled boost–sustain",
      burn: 10,
      maxSpeed: 1120,
      maxRange: 65,
      turnG: 28,
      color: 0x2f6fb5,
    },
    "aim-120c5": {
      name: "AIM-120C-5 public-study profile",
      short: "AMRAAM",
      description:
        "Public-study comparison curve; not verified weapon performance.",
      motor: "Modeled boost–sustain",
      burn: 9,
      maxSpeed: 1080,
      maxRange: 60,
      turnG: 27,
      color: 0xb1493f,
    },
    "mica-ir": {
      name: "MICA IR public-study profile",
      short: "MICA",
      description: "Teaching-only short-range comparison profile.",
      motor: "Modeled boost",
      burn: 5,
      maxSpeed: 850,
      maxRange: 20,
      turnG: 34,
      color: 0xc8842c,
    },
  };
  return profiles[input.blueSystemId] ?? PROFILE_CATALOGS.A2A[profileId];
}

function rotateToward(current: number, target: number, maximum: number) {
  let delta = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
  delta = Math.max(-maximum, Math.min(maximum, delta));
  return current + delta;
}

function angularDifference(current: number, previous: number) {
  return Math.atan2(Math.sin(current - previous), Math.cos(current - previous));
}

export function simulate(
  input: Scenario,
  profileId: ProfileId = input.profile,
): SimulationResult {
  const profile = resolveProfile(input, profileId);
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
  let lastGuidanceUpdate = -Infinity;
  let peakDemand = 0;
  let closestApproach = Number.POSITIVE_INFINITY;
  let termination: TerminationCode = "time_limit";
  const redDecisionFactor =
    input.redDecision === "DEFEND"
      ? 1
      : input.redDecision === "CRANK"
        ? 0.65
        : input.redDecision === "DISENGAGE"
          ? 0.55
          : 0.2;
  const guidanceUpdateInterval =
    input.domain !== "A2A" || input.blueDecision === "SUPPORT_WEAPON"
      ? dt
      : input.blueDecision === "PRESS"
        ? 0.25
        : input.blueDecision === "CRANK"
          ? 0.5
          : input.blueDecision === "DEFEND"
            ? 1.5
            : 4;

  for (let time = 0; time <= maxTime; time += dt) {
    if (
      !fixedObjective &&
      input.maneuver !== "steady" &&
      input.targetG > 0 &&
      time > 5
    ) {
      const direction = input.maneuver === "break" ? 1 : Math.sin(time * 0.55);
      targetHeading +=
        direction *
        ((input.targetG * redDecisionFactor * gravity) /
          Math.max(targetSpeed, 1)) *
        dt *
        0.18;
    }
    tx += Math.cos(targetHeading) * targetSpeed * dt;
    ty += Math.sin(targetHeading) * targetSpeed * dt;

    const dx = tx - ix;
    const dy = ty - iy;
    const dz = tz - iz;
    const range = Math.hypot(dx, dy, dz);
    closestApproach = Math.min(closestApproach, range);
    const lineOfSightHeading = Math.atan2(dy, dx);
    const losRate =
      Math.abs(angularDifference(lineOfSightHeading, previousLosAngle)) / dt;
    previousLosAngle = lineOfSightHeading;
    const guidanceInterrupted =
      input.guidanceInterruptionAt !== null &&
      time >= input.guidanceInterruptionAt &&
      time < input.guidanceInterruptionAt + input.guidanceInterruptionDuration;
    if (
      !guidanceInterrupted &&
      time - lastGuidanceUpdate >= guidanceUpdateInterval
    ) {
      guidanceHeading = lineOfSightHeading;
      lastGuidanceUpdate = time;
    }
    const desiredHeading = guidanceHeading;
    const availableG = Math.max(
      3,
      profile.turnG *
        (0.45 + 0.55 * Math.min(interceptorSpeed / profile.maxSpeed, 1)),
    );
    const previousHeading = interceptorHeading;
    interceptorHeading = rotateToward(
      interceptorHeading,
      desiredHeading,
      (availableG * gravity * dt) / Math.max(interceptorSpeed, 100),
    );
    peakDemand = Math.max(
      peakDemand,
      ((Math.abs(interceptorHeading - previousHeading) / dt) *
        interceptorSpeed) /
        gravity,
    );

    const atmosphere = standardAtmosphere(iz, input.temperatureOffset);
    if (time < profile.burn) {
      interceptorSpeed = Math.min(
        profile.maxSpeed,
        interceptorSpeed +
          ((profile.maxSpeed - input.launcherSpeed) / profile.burn) * dt,
      );
    } else {
      const baseLoss =
        profileId === "sustained" ? 3.8 : profileId === "medium" ? 6.2 : 8.5;
      const injectedLoss =
        input.lossIncreaseAt !== null && time >= input.lossIncreaseAt
          ? input.lossIncreaseAmount
          : 0;
      const densityRatio = atmosphere.densityKgM3 / 1.225;
      const loadoutFactor =
        1 + Math.max(0, input.blueWeaponQuantity - 1) * 0.015;
      interceptorSpeed = Math.max(
        0,
        interceptorSpeed -
          baseLoss * densityRatio * loadoutFactor * dt -
          (input.wind + injectedLoss) * 0.025,
      );
    }

    const progress = Math.max(
      0,
      Math.min(1, 1 - Math.hypot(dx, dy) / Math.max(input.range, 1)),
    );
    const loft =
      input.guidance === "loft"
        ? Math.sin(progress * Math.PI) * Math.min(7000, input.range * 0.08)
        : 0;
    const desiredAltitude =
      input.altitude + (tz - input.altitude) * progress + loft;
    iz += Math.max(-140, Math.min(140, (desiredAltitude - iz) * 0.35)) * dt;
    ix += Math.cos(interceptorHeading) * interceptorSpeed * dt;
    iy += Math.sin(interceptorHeading) * interceptorSpeed * dt;
    travelledDistance += interceptorSpeed * dt;

    const energy = Math.max(
      0,
      Math.min(
        100,
        ((interceptorSpeed - 150) / Math.max(profile.maxSpeed - 150, 1)) * 100,
      ),
    );
    const phase =
      time < profile.burn
        ? "Powered flight"
        : progress < 0.72
          ? "Midcourse"
          : "Terminal";
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
        airDensity: atmosphere.densityKgM3,
        mach: interceptorSpeed / atmosphere.speedOfSoundMps,
      });
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
    ? fixedObjective
      ? "Objective reached"
      : "Intercept"
    : termination === "energy_depleted"
      ? "Energy depleted"
      : termination === "profile_range_limit"
        ? "Modeled distance exhausted"
        : "Time limit reached";
  const reason =
    termination === "threshold_reached"
      ? fixedObjective
        ? "The modeled vehicle reached the fixed-objective completion threshold."
        : "The modeled interceptor reached the airborne-target completion threshold."
      : termination === "energy_depleted"
        ? "Modeled speed fell below the continuation threshold after powered flight."
        : termination === "profile_range_limit"
          ? `The weapon traveled the selected study model's ${profile.maxRange} km path-distance allowance without reaching the completion threshold.`
          : `The run did not reach the completion threshold within ${maxTime} model seconds.`;
  const last = frames.at(-1);

  return {
    frames,
    outcome,
    successful,
    termination,
    closestApproach: successful
      ? Math.min(closestApproach, 180)
      : closestApproach,
    timeOfFlight: last?.t ?? 0,
    endSpeed: last?.speed ?? 0,
    peakDemand,
    reason,
  };
}

export function explainResult(scenario: Scenario, result: SimulationResult) {
  const profile = resolveProfile(scenario, scenario.profile);
  if (result.termination === "threshold_reached") {
    return `${profile.name} covered the ${scenario.range / 1000} km starting distance and reached the model's 180 m completion threshold in ${result.timeOfFlight.toFixed(1)} seconds.`;
  }
  if (result.termination === "profile_range_limit") {
    if (scenario.range > profile.maxRange * 1000) {
      return `The ${scenario.range / 1000} km starting distance exceeds this study model's ${profile.maxRange} km setup boundary. Reduce the distance before treating the comparison as in scope.`;
    }
    return `The start was inside the ${profile.maxRange} km setup boundary, but the curved pursuit path used the model's distance allowance before reaching the 180 m completion threshold. Closest separation was ${Math.round(result.closestApproach)} m. Change one input—distance, crossing angle, target maneuver, or path—and run again.`;
  }
  if (result.termination === "energy_depleted") {
    return `After ${profile.burn} seconds of powered flight, modeled speed fell below the continuation threshold with ${Math.round(result.closestApproach / 1000)} km still separating the vehicle and objective.`;
  }
  return `The run reached its model-time limit before the 180 m completion threshold. Review distance, flight path, and environmental-loss assumptions.`;
}

export function buildRaspTrack(
  scenario: Scenario,
  frame: Frame,
  perspective: "IAF" | "PAF",
): RaspTrack {
  const isBlue = perspective === "IAF";
  const radarMode = isBlue ? scenario.blueRadarMode : scenario.redRadarMode;
  const trackSource = isBlue
    ? scenario.blueTrackSource
    : scenario.redTrackSource;
  const datalink = isBlue ? scenario.blueDatalink : scenario.redDatalink;
  const opposingJammer = isBlue ? scenario.redJammer : scenario.blueJammer;
  const truthPosition = isBlue ? frame.target : frame.interceptor;
  const rangeKm = frame.range / 1000;
  const sourceBase: Record<TrackSource, number> = {
    ONBOARD_RADAR: 82,
    DATALINK: 78,
    AIRBORNE_EARLY_WARNING: 90,
    VISUAL: 72,
  };
  let confidence = sourceBase[trackSource];
  if (trackSource === "ONBOARD_RADAR" && radarMode === "SILENT")
    confidence -= 52;
  if (
    (trackSource === "DATALINK" || trackSource === "AIRBORNE_EARLY_WARNING") &&
    !datalink
  )
    confidence -= 48;
  confidence -= Math.max(0, rangeKm - 25) * 0.32;
  if (opposingJammer) confidence -= 17;
  const interrupted =
    scenario.guidanceInterruptionAt !== null &&
    frame.t >= scenario.guidanceInterruptionAt &&
    frame.t <
      scenario.guidanceInterruptionAt + scenario.guidanceInterruptionDuration;
  if (interrupted && isBlue) confidence -= 34;
  confidence = Math.round(Math.max(5, Math.min(98, confidence)));
  const uncertaintyMeters = Math.round(
    120 + Math.pow(100 - confidence, 1.55) * 11,
  );
  const phase = scenario.seed * 0.37 + frame.t * 0.13 + (isBlue ? 0 : 1.9);
  const position = {
    x: truthPosition.x + Math.cos(phase) * uncertaintyMeters * 0.46,
    y: truthPosition.y + Math.sin(phase) * uncertaintyMeters * 0.46,
    z: truthPosition.z + Math.sin(phase * 0.7) * uncertaintyMeters * 0.18,
  };
  const status =
    confidence < 30 ? "COASTING" : confidence < 60 ? "DEGRADED" : "TRACKING";
  return {
    perspective,
    trackId: isBlue ? "R-021" : "B-014",
    classification: isBlue
      ? "Fighter-sized airborne track"
      : "Fighter / weapon-support track",
    identification:
      confidence >= 70 ? "HOSTILE" : confidence >= 45 ? "SUSPECT" : "UNKNOWN",
    source:
      trackSource === "ONBOARD_RADAR"
        ? "Onboard fire-control radar"
        : trackSource === "AIRBORNE_EARLY_WARNING"
          ? "Airborne early-warning support"
          : trackSource === "DATALINK"
            ? "Tactical data link"
            : "Visual observation",
    lastUpdateSeconds:
      interrupted && isBlue
        ? Math.max(0, frame.t - (scenario.guidanceInterruptionAt ?? 0))
        : 0.1,
    ageSeconds:
      interrupted && isBlue
        ? Math.max(0, frame.t - (scenario.guidanceInterruptionAt ?? 0))
        : 0.1,
    confidence,
    uncertaintyMeters,
    position,
    truthPosition,
    status,
  };
}

export function getFrameAt(result: SimulationResult, time: number) {
  return result.frames.reduce(
    (best, frame) =>
      Math.abs(frame.t - time) < Math.abs(best.t - time) ? frame : best,
    result.frames[0],
  );
}
