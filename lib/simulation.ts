import { compileScenario } from "./engine/compiler.ts";
import { runEngine } from "./engine/core.ts";
import {
  standardAtmosphere,
} from "./engine/atmosphere.ts";
import type {
  CoverageEnvelope,
  EngineEntityDefinition,
  EngineEntityFrame,
  EngineRun,
} from "./engine/contracts.ts";
import type {
  EngagementDomain,
  Guidance,
  Maneuver,
  ProfileId,
  Vec3,
} from "./engine/primitives.ts";

export { standardAtmosphere } from "./engine/atmosphere.ts";
export type { AtmosphereState } from "./engine/atmosphere.ts";
export type {
  EngagementDomain,
  Guidance,
  Maneuver,
  ProfileId,
  Vec3,
} from "./engine/primitives.ts";
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
  cruiseAltitude: number;
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
  entities: EngineEntityFrame[];
  closureRate: number;
  specificEnergy: number;
  massKg: number;
  fuelKg: number;
  commandedG: number;
  availableG: number;
  thrustNewtons: number;
  dragNewtons: number;
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
  observedEntityId: string;
  visible: boolean;
  status: "TRACKING" | "DEGRADED" | "COASTING" | "NO_TRACK";
};

export type TerminationCode =
  | "threshold_reached"
  | "energy_depleted"
  | "time_limit"
  | "invalid_scenario";

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
  engineRun: EngineRun;
  entityManifest: EngineEntityDefinition[];
  envelopes: CoverageEnvelope[];
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
  cruiseAltitude: 8500,
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

export function simulate(
  input: Scenario,
  profileId: ProfileId = input.profile,
): SimulationResult {
  const profile = resolveProfile(input, profileId);
  const engineScenario = compileScenario(
    {
      id: `configured-${input.domain.toLowerCase()}`,
      version: "0.5.0",
      domain: input.domain,
      name: input.name,
      bluePlatformId: input.bluePlatformId,
      blueSystemId: input.blueSystemId,
      redObjectId: input.redObjectId,
      redSystemId: input.redSystemId,
      profile: profileId,
      guidance: input.guidance,
      altitude: input.altitude,
      cruiseAltitude: input.cruiseAltitude,
      targetDelta: input.targetDelta,
      range: input.range,
      aspect: input.aspect,
      launcherSpeed: input.launcherSpeed,
      targetSpeed: input.targetSpeed,
      maneuver: input.maneuver,
      targetG: input.targetG,
      blueFuelPercent: input.blueFuelPercent,
      redFuelPercent: input.redFuelPercent,
      blueDecision: input.blueDecision,
      redDecision: input.redDecision,
      windEastMps: input.wind,
      windNorthMps: 0,
      temperatureOffset: input.temperatureOffset,
      guidanceInterruptionAt: input.guidanceInterruptionAt,
      guidanceInterruptionDuration: input.guidanceInterruptionDuration,
      windShiftAt: input.lossIncreaseAt,
      windShiftEastMps: input.lossIncreaseAmount,
      windShiftNorthMps: 0,
      seed: input.seed,
    },
    profile,
  );
  const engineRun = runEngine(engineScenario);
  const frames: Frame[] = engineRun.frames.map((engineFrame) => {
    const weapon = engineFrame.entities.find(
      (entity) => entity.id === engineRun.primaryWeaponId,
    )!;
    const target = engineFrame.entities.find(
      (entity) => entity.id === engineRun.primaryTargetId,
    )!;
    const atmosphere = standardAtmosphere(
      weapon.position.z,
      input.temperatureOffset,
    );
    return {
      t: engineFrame.t,
      interceptor: weapon.position,
      target: target.position,
      speed: weapon.speedMps,
      range: engineFrame.separationM,
      energy: Math.max(
        0,
        Math.min(100, (weapon.speedMps / Math.max(1, profile.maxSpeed)) * 100),
      ),
      phase: weapon.phase,
      losRate: engineFrame.lineOfSightRateRadS,
      airDensity: atmosphere.densityKgM3,
      mach: weapon.mach,
      entities: engineFrame.entities,
      closureRate: engineFrame.closureRateMps,
      specificEnergy: weapon.specificEnergyJkg,
      massKg: weapon.massKg,
      fuelKg: weapon.fuelKg,
      commandedG: weapon.commandedG,
      availableG: weapon.availableG,
      thrustNewtons: weapon.thrustNewtons,
      dragNewtons: weapon.dragNewtons,
    };
  });
  const successful = engineRun.termination === "threshold_reached";
  const fixedObjective = input.domain === "A2G" || input.domain === "G2G";
  const outcome = successful
    ? fixedObjective
      ? "Objective reached"
      : "Intercept"
    : engineRun.termination === "energy_depleted"
      ? "Energy depleted"
      : "Time limit reached";
  const reason = successful
    ? fixedObjective
      ? "The guided vehicle reached the configured objective-completion distance."
      : "The guided vehicle reached the configured intercept-completion distance."
    : engineRun.termination === "energy_depleted"
      ? "The vehicle reached the reference surface or fell below the continuation-speed condition after powered flight."
      : engineRun.termination === "invalid_scenario"
        ? "The scenario did not contain an active guided vehicle and a valid assigned objective."
        : `The run reached ${engineScenario.durationSeconds} model seconds before the completion distance.`;
  const last = frames.at(-1);
  return {
    frames,
    outcome,
    successful,
    termination: engineRun.termination,
    closestApproach: engineRun.closestApproachM,
    timeOfFlight: last?.t ?? 0,
    endSpeed: last?.speed ?? 0,
    peakDemand: engineRun.peakCommandG,
    reason,
    engineRun,
    entityManifest: engineRun.scenario.entities,
    envelopes: engineRun.envelopes,
  };
}

export function explainResult(scenario: Scenario, result: SimulationResult) {
  const weapon = result.entityManifest.find(
    (entity) => entity.id === result.engineRun.primaryWeaponId,
  );
  if (result.termination === "threshold_reached") {
    return `The simulated ${weapon?.designation ?? "guided vehicle"} reached the configured 180 m completion threshold from a ${scenario.range / 1000} km start in ${result.timeOfFlight.toFixed(1)} seconds.`;
  }
  if (result.termination === "energy_depleted") {
    return `After ${weapon?.weapon?.burnSeconds ?? 0} seconds of powered flight, modeled speed fell below the continuation threshold with ${Math.round(result.closestApproach / 1000)} km still separating the vehicle and objective.`;
  }
  return `The run reached its model-time limit before the 180 m completion threshold. Review distance, flight path, and wind assumptions.`;
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
  // Each national RASP presents its estimate of the opposing aircraft track.
  // Guided weapons remain separate lifecycle entities and can be added later as
  // missile-warning tracks without replacing the aircraft picture.
  const observedEntityId = isBlue ? "red-object-1" : "blue-platform-1";
  const observedEntity = frame.entities.find((entity) => entity.id === observedEntityId);
  const truthPosition = observedEntity?.position ?? (isBlue ? frame.target : frame.interceptor);
  const rangeKm = frame.range / 1000;
  const sourceBase: Record<TrackSource, number> = {
    ONBOARD_RADAR: 82,
    DATALINK: 78,
    AIRBORNE_EARLY_WARNING: 90,
    VISUAL: 72,
  };
  const sourceAvailable =
    observedEntity !== undefined &&
    (trackSource === "ONBOARD_RADAR"
      ? radarMode === "ACTIVE" && rangeKm <= 120
      : trackSource === "DATALINK" || trackSource === "AIRBORNE_EARLY_WARNING"
        ? datalink
        : rangeKm <= 18);
  let confidence = sourceBase[trackSource];
  if (!sourceAvailable) confidence = 0;
  confidence -= Math.max(0, rangeKm - 25) * 0.32;
  if (opposingJammer) confidence -= 17;
  const interrupted =
    scenario.guidanceInterruptionAt !== null &&
    frame.t >= scenario.guidanceInterruptionAt &&
    frame.t <
      scenario.guidanceInterruptionAt + scenario.guidanceInterruptionDuration;
  if (interrupted && isBlue) confidence -= 34;
  confidence = Math.round(Math.max(0, Math.min(98, confidence)));
  const uncertaintyMeters = Math.round(
    sourceAvailable
      ? 120 + Math.pow(100 - confidence, 1.55) * 11
      : 25000,
  );
  const phase = scenario.seed * 0.37 + frame.t * 0.13 + (isBlue ? 0 : 1.9);
  const position = {
    x: truthPosition.x + Math.cos(phase) * uncertaintyMeters * 0.46,
    y: truthPosition.y + Math.sin(phase) * uncertaintyMeters * 0.46,
    z: truthPosition.z + Math.sin(phase * 0.7) * uncertaintyMeters * 0.18,
  };
  const status = !sourceAvailable
    ? "NO_TRACK"
    : confidence < 30
      ? "COASTING"
      : confidence < 60
        ? "DEGRADED"
        : "TRACKING";
  return {
    perspective,
    trackId: isBlue ? "R-021" : "B-014",
    classification: "Fighter-sized airborne track",
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
      !sourceAvailable
        ? frame.t
        : interrupted && isBlue
        ? Math.max(0, frame.t - (scenario.guidanceInterruptionAt ?? 0))
        : 0.1,
    ageSeconds:
      !sourceAvailable
        ? frame.t
        : interrupted && isBlue
        ? Math.max(0, frame.t - (scenario.guidanceInterruptionAt ?? 0))
        : 0.1,
    confidence,
    uncertaintyMeters,
    position,
    truthPosition,
    observedEntityId,
    visible: sourceAvailable,
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
