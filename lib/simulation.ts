import { compileScenario } from "./engine/compiler.ts";
import { runEngineBackend } from "./engine/backend.ts";
import {
  standardAtmosphere,
} from "./engine/atmosphere.ts";
import type {
  CoverageEnvelope,
  EngineEntityDefinition,
  EngineEntityFrame,
  EngineObserverState,
  EngineObserverStateV2,
  EngineObserverStateV3,
  EngineRun,
  EngineScenario,
} from "./engine/contracts.ts";
import type { AirMissionDefinition } from "./air-mission.ts";
import {
  admitScenarioCapabilities,
  createVerificationDeploymentCapabilities,
  DEPLOYMENT_CAPABILITIES,
  type DeploymentCapabilityManifest,
} from "./runtime/deployment-capabilities.ts";
import type { RecordedGeographicPosition } from "./geospatial/contracts.ts";
import type {
  EngagementDomain,
  Guidance,
  ProfileId,
  Vec3,
} from "./engine/primitives.ts";
import type { ScenarioSpatialPlan } from "./scenario-spatial.ts";
import { geographicToLocal } from "./scenario-spatial.ts";
import { getStudyArea } from "./study-areas.ts";
import {
  assertRecordedSidePictures,
  projectObserverStates,
} from "./information-state.ts";

export { standardAtmosphere } from "./engine/atmosphere.ts";
export type { AtmosphereState } from "./engine/atmosphere.ts";
export type {
  EngagementDomain,
  Guidance,
  ProfileId,
  Vec3,
} from "./engine/primitives.ts";
export type RadarMode = "ACTIVE" | "SILENT";
export type TrackSource =
  | "ONBOARD_RADAR"
  | "DATALINK"
  | "AIRBORNE_EARLY_WARNING"
  | "VISUAL";
export type RaspAvailabilityReason =
  | EngineObserverStateV2["availabilityReason"]
  | EngineObserverStateV3["scanReason"];

export const RASP_SOURCE_CONTRACTS: Record<
  TrackSource,
  {
    label: string;
    requirement: string;
    pictureEffect: string;
    physicsEffect: string;
    limitation?: string;
  }
> = {
  ONBOARD_RADAR: {
    label: "Onboard radar",
    requirement: "A selected aircraft must have a compiled positive-range RADAR model with evidence, an admitted mode, and a due scan inside its declared field of view.",
    pictureEffect: "The deployed reference pack has no such model. A future admitted scan can create only a non-positional plot in this slice.",
    physicsEffect: "RASP only. It does not change weapon guidance or aircraft motion.",
  },
  DATALINK: {
    label: "Data link",
    requirement: "The observing side's tactical data link must be available.",
    pictureEffect: "Unavailable until an admitted sender-side observation and typed delivery message are present.",
    physicsEffect: "RASP only. It does not currently change weapon guidance or aircraft motion.",
  },
  AIRBORNE_EARLY_WARNING: {
    label: "Airborne early warning",
    requirement: "The observing side's tactical data link must be available.",
    pictureEffect: "Unavailable until an admitted AEW source, sender-side track, and typed delivery message are present.",
    physicsEffect: "RASP only. It does not currently change weapon guidance or aircraft motion.",
    limitation: "No AEW aircraft or sensor-volume entity is spawned yet; this is a declared external track source.",
  },
  VISUAL: {
    label: "Visual contact",
    requirement: "A selected aircraft must have a compiled positive-range VISUAL model with evidence and a due scan inside its declared field of view.",
    pictureEffect: "Unavailable until that model and a visibility/measurement contract are admitted.",
    physicsEffect: "RASP only. It does not change weapon guidance or aircraft motion.",
  },
};

export type Scenario = {
  domain: EngagementDomain;
  name: string;
  objective: string;
  bluePlatformId: string;
  blueSystemId: string;
  redObjectId: string;
  redSystemId: string;
  studyAreaId: string;
  weatherPresetId: string;
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
  profile: ProfileId;
  guidance: Guidance;
  altitude: number;
  cruiseAltitude: number;
  targetDelta: number;
  range: number;
  aspect: number;
  launcherSpeed: number;
  targetSpeed: number;
  wind: number;
  windNorth: number;
  visibilityKm: number;
  humidityPercent: number;
  temperatureOffset: number;
  spatialPlan?: ScenarioSpatialPlan;
  /** The single authored Air mission contract. Legacy non-Air fixtures may omit it. */
  airMission?: AirMissionDefinition;
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
  geographicPositions: RecordedGeographicPosition[];
  closureRate: number;
  specificEnergy: number;
  massKg: number;
  fuelKg: number;
  commandedG: number;
  availableG: number;
  thrustNewtons: number;
  dragNewtons: number;
  observerStates: EngineObserverState[];
};

type LegacyRaspPicture = EngineObserverStateV2 & {
  perspective: "IAF" | "PAF";
  /** Model-clock identity of this observer-picture sample. */
  modelTimeSeconds: number;
  trackId: string;
  classification: "UNAVAILABLE" | "UNKNOWN";
  identification: "UNKNOWN";
  source: string;
  lastUpdateSeconds: number;
  ageSeconds: number;
  confidence: number | null;
  uncertaintyMeters: number | null;
  status: "NO_TRACK" | "PLOT" | "TENTATIVE" | "CONFIRMED" | "COASTING" | "LOST";
};

export type RaspTrack = LegacyRaspPicture | (EngineObserverStateV3 & {
  perspective: "IAF" | "PAF";
  /** Model-clock identity of this complete side-owned picture sample. */
  modelTimeSeconds: number;
});

export type TerminationCode =
  | "threshold_reached"
  | "energy_depleted"
  | "target_unavailable"
  | "time_limit"
  | "invalid_scenario";

export type SimulationResult = {
  frames: Frame[];
  outcome:
    | "Intercept"
    | "Objective reached"
    | "Energy depleted"
    | "Target unavailable"
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
  /** Immutable side-owned observer-picture samples for this completed run. */
  pictures: RaspTrack[];
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

export type PreparedSimulation = {
  scenario: Scenario;
  capabilityManifest: DeploymentCapabilityManifest;
  profileId: ProfileId;
  profile: VehicleProfile;
  engineScenario: EngineScenario;
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
  studyAreaId: "north-punjab",
  weatherPresetId: "north-punjab-clear",
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
  profile: "medium",
  guidance: "loft",
  altitude: 8500,
  cruiseAltitude: 8500,
  targetDelta: 1500,
  range: 52000,
  aspect: 145,
  launcherSpeed: 270,
  targetSpeed: 250,
  wind: -4,
  windNorth: 1,
  visibilityKm: 25,
  humidityPercent: 35,
  temperatureOffset: 0,
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

export function prepareSimulation(
  input: Scenario,
  profileId: ProfileId = input.profile,
  capabilityManifest = DEPLOYMENT_CAPABILITIES,
): PreparedSimulation {
  admitScenarioCapabilities(
    input as Scenario & Record<string, unknown>,
    capabilityManifest,
  );
  const profile = resolveProfile(input, profileId);
  const studyArea = getStudyArea(input.studyAreaId);
  const placement = input.spatialPlan
    ? {
        blueStart: geographicToLocal(
          input.spatialPlan.blue.position,
          studyArea,
        ),
        redStart: geographicToLocal(
          input.spatialPlan.red.position,
          studyArea,
        ),
        blueHeadingRad:
          ((90 - input.spatialPlan.blue.headingDeg) * Math.PI) / 180,
        redHeadingRad:
          ((90 - input.spatialPlan.red.headingDeg) * Math.PI) / 180,
        blueRoute: input.spatialPlan.blue.route.map((point) =>
          geographicToLocal(point, studyArea),
        ),
        blueRouteAcceptanceRadiiM: [...input.spatialPlan.blue.routeAcceptanceRadiiM],
        blueRouteWaypointTransitions: input.spatialPlan.blue.routeWaypointTransitions
          ? [...input.spatialPlan.blue.routeWaypointTransitions]
          : undefined,
        redRoute: input.spatialPlan.red.route.map((point) =>
          geographicToLocal(point, studyArea),
        ),
        redRouteAcceptanceRadiiM: [...input.spatialPlan.red.routeAcceptanceRadiiM],
        redRouteWaypointTransitions: input.spatialPlan.red.routeWaypointTransitions
          ? [...input.spatialPlan.red.routeWaypointTransitions]
          : undefined,
        blueOriginReference: input.spatialPlan.blue.originReference,
        redOriginReference: input.spatialPlan.red.originReference,
      }
    : undefined;
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
      studyAreaId: input.studyAreaId,
      weatherPresetId: input.weatherPresetId,
      profile: profileId,
      guidance: input.guidance,
      altitude: input.altitude,
      cruiseAltitude: input.cruiseAltitude,
      targetDelta: input.targetDelta,
      range: input.range,
      aspect: input.aspect,
      launcherSpeed: input.launcherSpeed,
      targetSpeed: input.targetSpeed,
      blueFuelPercent: input.blueFuelPercent,
      redFuelPercent: input.redFuelPercent,
      blueWeaponQuantity: input.blueWeaponQuantity,
      redWeaponQuantity: input.redWeaponQuantity,
      blueRadarMode: input.blueRadarMode,
      redRadarMode: input.redRadarMode,
      windEastMps: input.wind,
      windNorthMps: input.windNorth,
      temperatureOffset: input.temperatureOffset,
      windShiftAt: input.lossIncreaseAt,
      windShiftEastMps: input.lossIncreaseAmount,
      windShiftNorthMps: 0,
      seed: input.seed,
      placement,
      airMission: input.airMission,
      authoredScenario: input,
    },
    profile,
  );
  return {
    scenario: input,
    capabilityManifest,
    profileId,
    profile,
    engineScenario,
  };
}

export function buildSimulationResult(
  prepared: PreparedSimulation,
  engineRun: EngineRun,
  recordedPictures?: RaspTrack[],
): SimulationResult {
  const { scenario: input, profile, engineScenario } = prepared;
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
      geographicPositions: engineFrame.geographicPositions,
      closureRate: engineFrame.closureRateMps,
      specificEnergy: weapon.specificEnergyJkg,
      massKg: weapon.massKg,
      fuelKg: weapon.fuelKg,
      commandedG: weapon.commandedG,
      availableG: weapon.availableG,
      thrustNewtons: weapon.thrustNewtons,
      dragNewtons: weapon.dragNewtons,
      observerStates: engineFrame.observerStates,
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
      : engineRun.termination === "target_unavailable"
        ? "Target unavailable"
      : "Time limit reached";
  const reason = successful
    ? fixedObjective
      ? "The guided vehicle reached the configured objective-completion distance."
      : "The guided vehicle reached the configured intercept-completion distance."
    : engineRun.termination === "energy_depleted"
      ? "The vehicle reached the reference surface or fell below the continuation-speed condition after powered flight."
      : engineRun.termination === "target_unavailable"
        ? "The assigned target became unavailable. The engine terminated the guided vehicle without using a substitute target state."
      : engineRun.termination === "invalid_scenario"
        ? "The scenario did not contain an active guided vehicle and a valid assigned objective."
        : `The run reached ${engineScenario.durationSeconds} model seconds before the completion distance.`;
  const last = frames.at(-1);
  const pictures = recordedPictures ?? projectObserverStates(engineRun.frames);
  assertRecordedSidePictures(engineRun.frames, pictures);
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
    pictures,
  };
}

export function simulate(
  input: Scenario,
  profileId: ProfileId = input.profile,
): SimulationResult {
  const prepared = prepareSimulation(input, profileId);
  const engineRun = runEngineBackend(
    prepared.engineScenario,
    prepared.capabilityManifest.engine.id,
  );
  return buildSimulationResult(prepared, engineRun);
}

export function simulateWithCapabilitiesForVerification(
  input: Scenario,
  capabilityManifest: DeploymentCapabilityManifest,
  profileId: ProfileId = input.profile,
): SimulationResult {
  const prepared = prepareSimulation(input, profileId, capabilityManifest);
  return buildSimulationResult(
    prepared,
    runEngineBackend(prepared.engineScenario, capabilityManifest.engine.id),
  );
}

/**
 * Produces non-authoritative frames for server rendering where the deployment
 * Rust/WASM backend cannot be instantiated. Conducted runs never use this path.
 */
export function createReferencePreview(input: Scenario): SimulationResult {
  return simulateWithCapabilitiesForVerification(
    input,
    createVerificationDeploymentCapabilities("typescript"),
  );
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
  if (result.termination === "target_unavailable") {
    return "The assigned target became unavailable. The engine terminated the guided vehicle without using a substitute target state.";
  }
  return `The run reached its model-time limit before the 180 m completion threshold. Review distance, flight path, and wind assumptions.`;
}

export function evaluateRaspSourceAvailability(
  _scenario: Scenario,
  frame: Frame,
  perspective: "IAF" | "PAF",
): { available: boolean; reason: RaspAvailabilityReason; explanation: string } {
  const state = frame.observerStates.find((item) => item.perspective === perspective);
  return state?.schemaVersion === "vector.observer-state.v3"
    ? {
        available: state.visibleTrackCount > 0,
        reason: state.scanReason,
        explanation: state.stateExplanation ?? "No observer-state explanation was recorded.",
      }
    : state
    ? { available: false, reason: state.availabilityReason, explanation: state.stateExplanation ?? "No observer-state explanation was recorded." }
    : { available: false, reason: "SENSOR_MODEL_UNAVAILABLE", explanation: "No observer state was recorded for this frame." };
}

export function buildRaspTrack(
  _scenario: Scenario,
  frame: Frame,
  perspective: "IAF" | "PAF",
): RaspTrack {
  const state = frame.observerStates.find((item) => item.perspective === perspective);
  if (!state) throw new Error("No observer state was recorded for this perspective.");
  return projectObserverStates([{ ...frame, observerStates: [state] } as Frame])[0];
}

export function getFrameAt(result: SimulationResult, time: number) {
  return result.frames.reduce(
    (best, frame) =>
      Math.abs(frame.t - time) < Math.abs(best.t - time) ? frame : best,
    result.frames[0],
  );
}
