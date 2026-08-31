import {
  DEFAULT_SCENARIO,
  type EngagementDomain,
  type Scenario,
} from "./simulation.ts";
import { getStudyArea, getWeatherPreset } from "./study-areas.ts";
import {
  CURRENT_INTENDED_USE_ID,
  CURRENT_INTENDED_USE_VERSION,
  CURRENT_MODEL_PACK_DIGEST,
  CURRENT_MODEL_PACK_ID,
  CURRENT_MODEL_PACK_VERSION,
} from "./reference-model-pack.ts";
import {
  authorGenericAirborneStoreTransfer,
  createDefaultAirMissionDefinition,
  type EngagementRegime,
  type FlightLegRole,
} from "./air-mission.ts";
import { CURRENT_COMPILED_MODEL_PACK } from "./engine/weapon-admission.ts";
import {
  createDefaultSpatialPlan,
  localToGeographic,
  normalizeHeading,
  spatialAspectDeg,
  spatialHorizontalSeparationM,
  type ScenarioSpatialPlan,
} from "./scenario-spatial.ts";

export type { EngagementDomain } from "./simulation.ts";
export type ScenarioComplexity = "Foundation" | "Intermediate" | "Advanced";
export type FocusOption = {
  title: string;
  description: string;
  objective: string;
};
export type RunVariant = { title: string; description: string };

export const AUTHORED_ROUTE_PROFILE_SCHEMA_VERSION =
  "vector.authored-route-profile.v1" as const;
export type AuthoredRouteProfileId =
  | "bvr-offset-and-support"
  | "wvr-one-circle-defensive-break"
  | "beam-drag-extend-recommit";
export type AuthoredRouteLegIntent =
  | "MERGE"
  | "OFFSET"
  | "SUPPORT"
  | "BEAM"
  | "DRAG"
  | "DEFENSIVE_BREAK"
  | "ONE_CIRCLE"
  | "EXTEND"
  | "INTERCEPT"
  | "RECOMMIT";
export type AuthoredRouteProfile = {
  schemaVersion: typeof AUTHORED_ROUTE_PROFILE_SCHEMA_VERSION;
  id: AuthoredRouteProfileId;
  label: string;
  authority: "AUTHORED_ROUTE";
  blue: { legs: AuthoredRouteLegIntent[] };
  red: { legs: AuthoredRouteLegIntent[] };
  limitations: string[];
};

export type ScenarioDefinition = {
  id: string;
  version: string;
  intendedUse: { id: typeof CURRENT_INTENDED_USE_ID; version: string };
  modelPack: { id: string; version: string; digest: string };
  domain: EngagementDomain;
  title: string;
  summary: string;
  blue: string;
  red: string;
  targetProfile: string;
  theatre: string;
  complexity: ScenarioComplexity;
  scope: string;
  tags: string[];
  targetMotion: "moving" | "fixed";
  environment: string;
  focusOptions: FocusOption[];
  runVariants: [RunVariant, RunVariant, RunVariant];
  presetRationale: { profile: string; geometry: string; conditions: string };
  /** Descriptive authored-route intent. Runtime behavior comes only from scenario routes. */
  authoredProfile?: AuthoredRouteProfile;
  scenario: Scenario;
};

const PACKAGE_GOVERNANCE = {
  intendedUse: {
    id: CURRENT_INTENDED_USE_ID,
    version: CURRENT_INTENDED_USE_VERSION,
  },
  modelPack: {
    id: CURRENT_MODEL_PACK_ID,
    version: CURRENT_MODEL_PACK_VERSION,
    digest: CURRENT_MODEL_PACK_DIGEST,
  },
} as const;

export const DOMAIN_DETAILS: Record<
  EngagementDomain,
  { label: string; description: string }
> = {
  A2A: {
    label: "Air intercept",
    description:
      "Airborne intercept geometry, timing, and energy-state sensitivity.",
  },
  A2G: {
    label: "Air-to-surface",
    description: "Air-launched flight paths against fixed ground objects.",
  },
  G2A: {
    label: "Surface-to-air defence",
    description:
      "Ground-based air-defence engagements against airborne objects.",
  },
  G2G: {
    label: "Surface strike",
    description: "Surface-launched flight paths against fixed ground objects.",
  },
};

const scenario = (patch: Partial<Scenario>): Scenario => {
  const configured = { ...DEFAULT_SCENARIO, ...patch };
  const area = getStudyArea(configured.studyAreaId);
  const weatherPreset = getWeatherPreset(area, configured.weatherPresetId);
  const authored: Scenario = {
    ...configured,
    wind: patch.wind ?? weatherPreset.windEastMps,
    windNorth: patch.windNorth ?? weatherPreset.windNorthMps,
    visibilityKm: patch.visibilityKm ?? weatherPreset.visibilityKm,
    humidityPercent: patch.humidityPercent ?? weatherPreset.humidityPercent,
    temperatureOffset:
      patch.temperatureOffset ?? weatherPreset.temperatureOffsetC,
  };
  if (authored.domain !== "A2A") return authored;
  const withSpatialPlan: Scenario = {
    ...authored,
    spatialPlan: authored.spatialPlan ?? createDefaultSpatialPlan({
      studyArea: area,
      rangeM: authored.range,
      blueAltitudeM: authored.altitude,
      redAltitudeM: authored.altitude + authored.targetDelta,
      blueSpeedMps: authored.launcherSpeed,
      redSpeedMps: authored.targetSpeed,
      crossingAngleDeg: authored.aspect,
    }),
  };
  return {
    ...withSpatialPlan,
    airMission: withSpatialPlan.airMission ?? createDefaultAirMissionDefinition({
      scenario: withSpatialPlan,
      modelPack: CURRENT_COMPILED_MODEL_PACK,
    }),
  };
};

type LocalRoutePoint = readonly [eastM: number, northM: number, altitudeMslM: number];

const roundThree = (value: number) => Number(value.toFixed(3));

function trueHeadingForLeg(route: readonly LocalRoutePoint[]) {
  const [start, next] = route;
  return roundThree(normalizeHeading(
    (Math.atan2(next[0] - start[0], next[1] - start[1]) * 180) / Math.PI,
  ));
}

function authoredSpatialPlan(input: {
  areaId: string;
  blueRoute: readonly LocalRoutePoint[];
  redRoute: readonly LocalRoutePoint[];
  blueSpeedMps: number;
  redSpeedMps: number;
}): ScenarioSpatialPlan {
  const area = getStudyArea(input.areaId);
  const project = (point: LocalRoutePoint) => ({
    ...localToGeographic({ x: point[0], y: point[1], z: point[2] }, area),
    // The authored MSL altitude is scenario authority. Do not retain inverse-
    // transform floating-point residue in a content-addressed package.
    altitudeM: point[2],
  });
  const side = (
    route: readonly LocalRoutePoint[],
    speedMps: number,
  ) => {
    const projected = route.map(project);
    return {
      position: projected[0],
      headingDeg: trueHeadingForLeg(route),
      speedMps,
      route: projected,
      routeAcceptanceRadiiM: projected.map((_, index) => index === 0 ? 1 : 500),
      routeWaypointTransitions: projected.map((_, index) => index === 0 ? "START" as const : "FLY_BY" as const),
    };
  };
  return {
    blue: side(input.blueRoute, input.blueSpeedMps),
    red: side(input.redRoute, input.redSpeedMps),
  };
}

function authoredAirCombatScenario(input: {
  name: string;
  objective: string;
  guidance: Scenario["guidance"];
  regime: EngagementRegime;
  durationSeconds: number;
  releaseTimeSeconds: number;
  blueRoute: readonly LocalRoutePoint[];
  redRoute: readonly LocalRoutePoint[];
  blueSpeedMps: number;
  redSpeedMps: number;
  blueLegRoles: readonly [FlightLegRole, FlightLegRole, FlightLegRole];
}): Scenario {
  const studyAreaId = "north-punjab";
  const spatialPlan = authoredSpatialPlan({
    areaId: studyAreaId,
    blueRoute: input.blueRoute,
    redRoute: input.redRoute,
    blueSpeedMps: input.blueSpeedMps,
    redSpeedMps: input.redSpeedMps,
  });
  const area = getStudyArea(studyAreaId);
  let configured = scenario({
    domain: "A2A",
    name: input.name,
    objective: input.objective,
    bluePlatformId: "su-30mki",
    blueSystemId: "astra-mk1",
    redObjectId: "f-16c-block52-paf",
    redSystemId: "aim-120c5",
    studyAreaId,
    weatherPresetId: "north-punjab-clear",
    profile: "medium",
    guidance: input.guidance,
    altitude: input.blueRoute[0][2],
    cruiseAltitude: input.blueRoute[0][2],
    targetDelta: input.redRoute[0][2] - input.blueRoute[0][2],
    range: roundThree(spatialHorizontalSeparationM(spatialPlan, area)),
    aspect: roundThree(spatialAspectDeg(spatialPlan, area)),
    launcherSpeed: input.blueSpeedMps,
    targetSpeed: input.redSpeedMps,
    blueFuelPercent: 70,
    redFuelPercent: 70,
    blueWeaponQuantity: 2,
    redWeaponQuantity: 2,
    seed: 42,
    runDurationSeconds: input.durationSeconds,
    spatialPlan,
  });
  const airMission = structuredClone(configured.airMission!);
  airMission.regime = input.regime;
  airMission.flightPlans[0].legs = airMission.flightPlans[0].legs.map(
    (leg, index) => ({ ...leg, role: input.blueLegRoles[index] }),
  );
  configured = {
    ...configured,
    airMission: authorGenericAirborneStoreTransfer({
      mission: airMission,
      modelPack: CURRENT_COMPILED_MODEL_PACK,
      storeOrdinal: 1,
      operation: "RELEASE",
      requestedTimeSeconds: input.releaseTimeSeconds,
      installedDragAreaM2: 0.03,
      valueState: "MODEL_ASSUMPTION",
    }),
  };
  return configured;
}

const movingFocus: FocusOption[] = [
  {
    title: "Launch window",
    description:
      "Compare how starting distance and aspect change the intercept opportunity.",
    objective:
      "Compare how starting distance and aspect change the intercept opportunity.",
  },
  {
    title: "Target maneuver",
    description:
      "Measure how a turn changes closing distance, demand, and completion time.",
    objective:
      "Measure how target maneuver changes closing distance and intercept demand.",
  },
  {
    title: "Route contrast",
    description:
      "Compare how an authored route changes aircraft position and intercept geometry.",
    objective:
      "Measure how an authored route changes aircraft position and intercept geometry.",
  },
];
const fixedFocus: FocusOption[] = [
  {
    title: "Flight path",
    description: "Compare direct and lofted paths to the same fixed objective.",
    objective: "Compare direct and lofted paths to the same fixed objective.",
  },
  {
    title: "Range margin",
    description:
      "Check whether the selected flight model can complete the run from the chosen starting distance.",
    objective:
      "Check whether the selected flight model covers the starting distance with margin.",
  },
  {
    title: "Wind sensitivity",
    description:
      "Measure how an east–west wind changes flight time and terminal speed.",
    objective:
      "Measure how an east–west wind changes flight time and terminal speed.",
  },
];
const movingRuns: [RunVariant, RunVariant, RunVariant] = [
  { title: "Baseline", description: "Configured geometry and target behavior" },
  {
    title: "Short-range profile",
    description: "Repeat the run with the short-range study profile",
  },
  {
    title: "Higher target demand",
    description: "Increased target turn demand",
  },
];
const fixedRuns: [RunVariant, RunVariant, RunVariant] = [
  {
    title: "Baseline",
    description: "Configured flight path and loss assumption",
  },
  {
    title: "Direct-path comparison",
    description: "Same objective using a direct path",
  },
  {
    title: "Higher-loss comparison",
    description: "Environmental-loss index increased",
  },
];

export const HIGH_ENERGY_CROSSING_CHALLENGE_ID =
  "a2a-high-energy-crossing-challenge";
export const CURRENT_AIR_COMBAT_STUDY_IDS = [
  "a2a-crossing-intercept",
  "a2a-defensive-break",
  HIGH_ENERGY_CROSSING_CHALLENGE_ID,
] as const;

export const SCENARIO_LIBRARY: ScenarioDefinition[] = [
  {
    ...PACKAGE_GOVERNANCE,
    id: "a2a-crossing-intercept",
    version: "1.2.0",
    domain: "A2A",
    title: "BVR offset and support: Su-30MKI versus F-16C",
    summary:
      "Compare an authored Blue offset/support route with a Red beam/drag route in a long-range generic Air-combat study.",
    blue: "Su-30MKI carrying Astra Mk 1",
    red: "PAF F-16C Block 52 carrying AIM-120C-5",
    targetProfile: "PAF F-16C Block 52",
    theatre: "Open training airspace",
    complexity: "Advanced",
    scope: "Generic assumption-backed BVR route and target-effect study; not named-aircraft, weapon, sensor, support, or pilot performance.",
    tags: ["fighter vs fighter", "BVR", "authored offset", "authored beam drag"],
    targetMotion: "moving",
    environment:
      "Sourced regional terrain and atmosphere · exact EnvironmentPack identity recorded",
    focusOptions: movingFocus,
    runVariants: movingRuns,
    presetRationale: {
      profile:
        "A deterministic generic BVR authored-route profile under the current public-educational model pack.",
      geometry:
        "Blue offsets after its explicit release while Red beams, drags, and extends through four exact WGS84/MSL points.",
      conditions:
        "The route geometry is causal. Tactical labels, sensor state, adaptive support, and autonomous pilot decisions do not alter runtime behavior.",
    },
    authoredProfile: {
      schemaVersion: AUTHORED_ROUTE_PROFILE_SCHEMA_VERSION,
      id: "bvr-offset-and-support",
      label: "BVR offset and support",
      authority: "AUTHORED_ROUTE",
      blue: { legs: ["OFFSET", "SUPPORT", "RECOMMIT"] },
      red: { legs: ["BEAM", "DRAG", "EXTEND"] },
      limitations: ["The autonomous pilot and adaptive tactic-selection policy are not modelled."],
    },
    scenario: authoredAirCombatScenario({
      name: "BVR offset and support: Su-30MKI versus PAF F-16C Block 52",
      objective:
        "Compare the canonical trajectory and generic target effect produced by explicit offset, support, beam, drag, and extension routes.",
      guidance: "direct",
      regime: "BVR",
      durationSeconds: 100,
      releaseTimeSeconds: 4,
      blueSpeedMps: 275,
      redSpeedMps: 250,
      blueRoute: [
        [-18_200, -5_600, 9_500],
        [-8_400, 1_400, 9_500],
        [2_800, 8_400, 9_500],
        [12_600, 8_400, 9_500],
      ],
      redRoute: [
        [18_200, 5_600, 8_200],
        [18_200, -4_200, 8_200],
        [25_200, -11_200, 8_200],
        [36_400, -11_200, 8_200],
      ],
      blueLegRoles: ["INGRESS", "INTERCEPT_ATTACK", "EGRESS"],
    }),
  },
  {
    ...PACKAGE_GOVERNANCE,
    id: "a2a-defensive-break",
    version: "1.2.0",
    domain: "A2A",
    title: "WVR one-circle defensive break: Su-30MKI versus F-16C",
    summary:
      "Observe a close authored one-circle turn against a defensive break and extension with an explicit generic store release.",
    blue: "Su-30MKI carrying Astra Mk 1",
    red: "PAF F-16C Block 52 carrying AIM-120C-5",
    targetProfile: "PAF F-16C Block 52",
    theatre: "Open training airspace",
    complexity: "Advanced",
    scope: "Generic assumption-backed WVR route and target-effect study; not named-aircraft, weapon, visual-sensor, or pilot performance.",
    tags: ["fighter vs fighter", "WVR", "authored one circle", "authored defensive break"],
    targetMotion: "moving",
    environment:
      "Sourced regional terrain and atmosphere · exact EnvironmentPack identity recorded",
    focusOptions: movingFocus,
    runVariants: movingRuns,
    presetRationale: {
      profile:
        "A deterministic generic WVR authored-route profile with a short, scenario-owned run duration.",
      geometry:
        "Opposed starts merge into a Blue one-circle route and a Red break/extension route with unequal altitude and TAS.",
      conditions:
        "An explicit release at 20 model seconds is part of the content-addressed mission; no visual detection or pilot decision is inferred.",
    },
    authoredProfile: {
      schemaVersion: AUTHORED_ROUTE_PROFILE_SCHEMA_VERSION,
      id: "wvr-one-circle-defensive-break",
      label: "WVR one-circle defensive break",
      authority: "AUTHORED_ROUTE",
      blue: { legs: ["MERGE", "ONE_CIRCLE", "EXTEND"] },
      red: { legs: ["MERGE", "DEFENSIVE_BREAK", "EXTEND"] },
      limitations: ["The autonomous pilot and adaptive tactic-selection policy are not modelled."],
    },
    scenario: authoredAirCombatScenario({
      name: "WVR one-circle defensive break: Su-30MKI versus PAF F-16C Block 52",
      objective:
        "Compare the canonical merge, turn, energy, route transition, and generic target effect of explicit one-circle and defensive-break routes.",
      guidance: "loft",
      regime: "WVR_BFM",
      durationSeconds: 45,
      releaseTimeSeconds: 20,
      blueSpeedMps: 260,
      redSpeedMps: 235,
      blueRoute: [
        [-9_000, 0, 6_200],
        [-2_000, 0, 6_200],
        [2_000, 5_000, 6_200],
        [-3_000, 10_000, 6_200],
      ],
      redRoute: [
        [9_000, 0, 7_000],
        [2_000, 0, 7_000],
        [5_500, -5_000, 7_000],
        [15_000, -5_000, 7_000],
      ],
      blueLegRoles: ["INGRESS", "INTERCEPT_ATTACK", "EGRESS"],
    }),
  },
  {
    ...PACKAGE_GOVERNANCE,
    id: "a2g-emitter-corridor",
    version: "1.1.0",
    domain: "A2G",
    title: "Radar suppression: fixed P-18 site",
    summary:
      "Compare direct and lofted Kh-31P flight paths from a Su-30MKI to a fixed P-18 radar site.",
    blue: "Su-30MKI carrying Kh-31P",
    red: "P-18 early-warning radar site",
    targetProfile: "P-18 fixed radar",
    theatre: "Generalized western sector",
    complexity: "Intermediate",
    scope:
      "One Su-30MKI, one Kh-31P model object, and one fixed P-18 radar object. Radar detection and air-defence response are not calculated.",
    tags: ["aircraft vs sensor", "fixed target", "approach"],
    targetMotion: "fixed",
    environment:
      "Sourced regional terrain and atmosphere · fixed objective · geometric LOS only",
    focusOptions: fixedFocus,
    runVariants: fixedRuns,
    presetRationale: {
      profile:
        "The medium standoff study model places the 44 km start inside its 80 km setup boundary.",
      geometry:
        "The airborne start is 7,800 m above the fixed objective and uses a direct comparison line.",
      conditions:
        "The objective is fixed; target speed and maneuver are locked to zero.",
    },
    scenario: scenario({
      domain: "A2G",
      name: "Radar suppression: fixed P-18 site",
      objective:
        "Compare direct and lofted Kh-31P flight paths to the same fixed P-18 radar site.",
      bluePlatformId: "su-30mki",
      blueSystemId: "kh-31p",
      redObjectId: "p-18-radar",
      studyAreaId: "rajasthan-desert",
      weatherPresetId: "rajasthan-hot-dry",
      profile: "medium",
      guidance: "direct",
      altitude: 7800,
      targetDelta: -7750,
      range: 44000,
      aspect: 180,
      launcherSpeed: 250,
      targetSpeed: 0,
    }),
  },
  {
    ...PACKAGE_GOVERNANCE,
    id: "a2g-protected-node",
    version: "1.1.0",
    domain: "A2G",
    title: "Air strike: hardened aircraft shelters",
    summary:
      "Compare direct and lofted SPICE 2000 flight paths from a Mirage 2000H to a fixed shelter complex.",
    blue: "Mirage 2000H carrying SPICE 2000",
    red: "Hardened aircraft shelter complex",
    targetProfile: "Fixed shelter complex",
    theatre: "Synthetic regional terrain",
    complexity: "Advanced",
    scope:
      "One attack path and one simplified defensive branch; no real installation geometry.",
    tags: ["aircraft vs ground", "protected objective", "route timing"],
    targetMotion: "fixed",
    environment:
      "Sourced regional terrain and atmosphere · fixed objective · air-defence response not calculated",
    focusOptions: fixedFocus,
    runVariants: fixedRuns,
    presetRationale: {
      profile:
        "The medium standoff study profile is used for the 50 km baseline while the glide-specific engine is being validated.",
      geometry:
        "The airborne start is 9,000 m above a fixed surface objective; the baseline uses a direct path that completes in the current engine.",
      conditions:
        "Defence interaction is contextual only and does not alter the point-mass physics.",
    },
    scenario: scenario({
      domain: "A2G",
      name: "Air strike: hardened aircraft shelters",
      objective:
        "Compare direct and lofted SPICE 2000 flight paths to a fixed shelter complex.",
      bluePlatformId: "mirage-2000h",
      blueSystemId: "spice-2000",
      redObjectId: "aircraft-shelter-site",
      studyAreaId: "ladakh-high-altitude",
      weatherPresetId: "ladakh-cold-clear",
      profile: "medium",
      guidance: "direct",
      altitude: 9000,
      targetDelta: -8950,
      range: 50000,
      aspect: 180,
      launcherSpeed: 265,
      targetSpeed: 0,
    }),
  },
  {
    ...PACKAGE_GOVERNANCE,
    id: "g2a-point-defence",
    version: "1.1.0",
    domain: "G2A",
    title: "Akash versus crossing F-16C Block 52",
    summary:
      "Fly an F-16C across an Akash-defended point and see when detection, tracking, and engagement become possible.",
    blue: "Akash air-defence system",
    red: "F-16C Fighting Falcon",
    targetProfile: "F-16C airborne target",
    theatre: "Synthetic defended sector",
    complexity: "Foundation",
    scope:
      "One ground launcher, one sensor-quality assumption and one airborne target.",
    tags: ["SAM scenario", "point defence", "crossing target"],
    targetMotion: "moving",
    environment:
      "Sourced regional terrain and atmosphere · one active air-defence layer",
    focusOptions: movingFocus,
    runVariants: movingRuns,
    presetRationale: {
      profile:
        "The area-defence study model places the 48 km start inside its 85 km setup boundary.",
      geometry:
        "A ground launch against a target 7,920 m higher creates the vertical geometry for this run.",
      conditions:
        "The target uses a three-g weaving turn after five model seconds.",
    },
    scenario: scenario({
      domain: "G2A",
      name: "Akash intercept: crossing F-16C",
      objective:
        "Compare how target aspect and starting distance change the Akash engagement window.",
      bluePlatformId: "akash",
      blueSystemId: "akash",
      redObjectId: "f-16c-block52-paf",
      studyAreaId: "north-punjab",
      weatherPresetId: "north-punjab-clear",
      profile: "medium",
      guidance: "loft",
      altitude: 80,
      targetDelta: 7920,
      range: 35000,
      aspect: 135,
      launcherSpeed: 0,
      targetSpeed: 245,
    }),
  },
  {
    ...PACKAGE_GOVERNANCE,
    id: "g2a-layered-screen",
    version: "1.1.0",
    domain: "G2A",
    title: "S-200 track hand-off and intercept",
    summary:
      "Examine detection, track hand-off, and one selected S-200 engagement against a high-altitude JF-17 track.",
    blue: "S-200 air-defence system",
    red: "JF-17 Thunder",
    targetProfile: "JF-17 high-altitude target",
    theatre: "Generalized South Asian theatre",
    complexity: "Advanced",
    scope:
      "Layer sequencing is represented in the run plan; the current physics run resolves one active layer at a time.",
    tags: ["layered SAM", "sensor hand-off", "run files"],
    targetMotion: "moving",
    environment:
      "Sourced regional terrain and atmosphere · one active layer resolved per run",
    focusOptions: movingFocus,
    runVariants: movingRuns,
    presetRationale: {
      profile:
        "The extended-area profile provides range margin for the 85 km starting distance.",
      geometry:
        "A ground start and 11,900 m altitude difference represent a high-altitude transit.",
      conditions:
        "Layer hand-off remains a run-plan decision; the physics resolves one selected layer.",
    },
    scenario: scenario({
      domain: "G2A",
      name: "S-200 intercept: high-altitude JF-17",
      objective:
        "Compare starting distance and target movement during a high-altitude S-200 engagement.",
      bluePlatformId: "s-200",
      blueSystemId: "s-200",
      redObjectId: "jf-17",
      studyAreaId: "north-east-mountains",
      weatherPresetId: "north-east-humid",
      profile: "sustained",
      guidance: "direct",
      altitude: 100,
      targetDelta: 11900,
      range: 60000,
      aspect: 155,
      launcherSpeed: 0,
      targetSpeed: 305,
    }),
  },
  {
    ...PACKAGE_GOVERNANCE,
    id: "g2g-supersonic-corridor",
    version: "1.1.0",
    domain: "G2G",
    title: "BrahMos flight path to a fixed P-18 site",
    summary:
      "Launch from a mobile platform toward a fixed P-18 site. Compare a direct path with a lofted path.",
    blue: "BrahMos mobile launcher",
    red: "P-18 early-warning radar site",
    targetProfile: "P-18 fixed radar",
    theatre: "Generalized coastal corridor",
    complexity: "Intermediate",
    scope:
      "Public-data conceptual trajectory only; no named system, precise site or operational route.",
    tags: ["ground strike", "supersonic class", "trajectory"],
    targetMotion: "fixed",
    environment:
      "Sourced regional terrain and atmosphere · fixed objective",
    focusOptions: fixedFocus,
    runVariants: fixedRuns,
    presetRationale: {
      profile:
        "The extended-range surface-strike study model places the 105 km start inside its 170 km setup boundary.",
      geometry:
        "Both launcher and objective are fixed near the reference surface; the baseline uses a direct path.",
      conditions:
        "Target motion and evasive maneuver do not apply to a fixed objective.",
    },
    scenario: scenario({
      domain: "G2G",
      name: "BrahMos strike: fixed P-18 radar",
      objective:
        "Compare direct and lofted BrahMos flight paths to the same fixed P-18 radar site.",
      bluePlatformId: "brahmos-mal",
      blueSystemId: "brahmos-block-i",
      redObjectId: "p-18-radar",
      studyAreaId: "coastal-gujarat",
      weatherPresetId: "coastal-gujarat-fair",
      profile: "sustained",
      guidance: "direct",
      altitude: 50,
      cruiseAltitude: 250,
      targetDelta: 0,
      range: 105000,
      aspect: 180,
      launcherSpeed: 0,
      targetSpeed: 0,
    }),
  },
  {
    ...PACKAGE_GOVERNANCE,
    id: "g2g-defended-route",
    version: "1.1.0",
    domain: "G2G",
    title: "BrahMos route to a fixed command site",
    summary:
      "Compare repeatable route and wind variants to a user-positioned fixed command site.",
    blue: "BrahMos mobile launcher",
    red: "Fixed command-and-control site",
    targetProfile: "User-positioned command site",
    theatre: "Synthetic regional terrain",
    complexity: "Advanced",
    scope:
      "Trajectory sensitivity and run comparison only; defence interaction remains a simplified event branch.",
    tags: ["ground to ground", "defended corridor", "comparison"],
    targetMotion: "fixed",
    environment:
      "Sourced regional terrain and atmosphere · fixed objective · defence interaction not modeled",
    focusOptions: fixedFocus,
    runVariants: fixedRuns,
    presetRationale: {
      profile:
        "The extended-range surface-strike study model was selected because the 118 km start exceeds the medium model's 100 km setup boundary.",
      geometry:
        "The launcher and objective are fixed at the reference surface; the baseline direct path is the completion case.",
      conditions:
        "The eastward wind component is set to 22 m/s for this sensitivity run. Defence interaction is not part of the physics.",
    },
    scenario: scenario({
      domain: "G2G",
      name: "BrahMos flight path: fixed command site",
      objective:
        "Measure how flight path and east–west wind change time and terminal speed at a fixed command site.",
      bluePlatformId: "brahmos-mal",
      blueSystemId: "brahmos-block-i",
      redObjectId: "command-site",
      studyAreaId: "rajasthan-desert",
      weatherPresetId: "rajasthan-hot-dry",
      profile: "sustained",
      guidance: "direct",
      altitude: 50,
      cruiseAltitude: 500,
      targetDelta: 0,
      range: 118000,
      aspect: 180,
      launcherSpeed: 0,
      targetSpeed: 0,
      wind: 22,
    }),
  },
  {
    ...PACKAGE_GOVERNANCE,
    id: HIGH_ENERGY_CROSSING_CHALLENGE_ID,
    version: "1.2.0",
    domain: "A2A",
    title: "Beam, drag, extend and recommit: Su-30MKI versus F-16C",
    summary:
      "Compare an authored Red beam/drag/extend route with a Blue intercept and recommit route in a medium-range transition study.",
    blue: "Su-30MKI carrying Astra Mk 1",
    red: "PAF F-16C Block 52 carrying AIM-120C-5",
    targetProfile: "PAF F-16C Block 52",
    theatre: "Open training airspace",
    complexity: "Advanced",
    scope:
      "Generic assumption-backed transition route and target-effect study; not named-aircraft, weapon, sensor, support, or pilot performance.",
    tags: ["fighter vs fighter", "transition", "authored beam drag", "authored recommit"],
    targetMotion: "moving",
    environment:
      "Sourced regional terrain and atmosphere · exact EnvironmentPack identity recorded",
    focusOptions: movingFocus,
    runVariants: movingRuns,
    presetRationale: {
      profile:
        "A deterministic generic unrestricted-transition authored-route profile under the current public-educational model pack.",
      geometry:
        "Red beams, drags, and extends while Blue flies an intercept, offset, and recommit through four exact WGS84/MSL points.",
      conditions:
        "The route geometry and explicit 50-second release are causal. Tactical labels, sensors, EW, and autonomous decisions remain unavailable.",
    },
    authoredProfile: {
      schemaVersion: AUTHORED_ROUTE_PROFILE_SCHEMA_VERSION,
      id: "beam-drag-extend-recommit",
      label: "Beam, drag, extend and recommit",
      authority: "AUTHORED_ROUTE",
      blue: { legs: ["INTERCEPT", "OFFSET", "RECOMMIT"] },
      red: { legs: ["BEAM", "DRAG", "EXTEND"] },
      limitations: ["The autonomous pilot and adaptive tactic-selection policy are not modelled."],
    },
    scenario: authoredAirCombatScenario({
      name: "Beam, drag, extend and recommit: Su-30MKI versus PAF F-16C Block 52",
      objective:
        "Compare canonical initial commit, beam/drag extension, recommit, closure, fuel, stores, termination, and generic target effect.",
      guidance: "direct",
      regime: "UNRESTRICTED_TRANSITION",
      durationSeconds: 140,
      releaseTimeSeconds: 50,
      blueSpeedMps: 268,
      redSpeedMps: 245,
      blueRoute: [
        [-16_000, -5_000, 7_800],
        [-3_000, 0, 7_800],
        [7_000, -6_000, 7_800],
        [18_000, -2_000, 7_800],
      ],
      redRoute: [
        [16_000, 5_000, 9_000],
        [16_000, -5_000, 9_000],
        [28_000, -9_000, 9_000],
        [40_000, -9_000, 9_000],
      ],
      blueLegRoles: ["INTERCEPT_ATTACK", "EGRESS", "INTERCEPT_ATTACK"],
    }),
  },
];

export const DEFAULT_SCENARIO_DEFINITION = SCENARIO_LIBRARY[0];

export function getScenarioDefinition(id: string | null | undefined) {
  return SCENARIO_LIBRARY.find((item) => item.id === id);
}
