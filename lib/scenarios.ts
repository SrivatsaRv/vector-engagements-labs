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
import { createDefaultAirMissionDefinition } from "./air-mission.ts";
import { createDefaultSpatialPlan } from "./scenario-spatial.ts";

export type { EngagementDomain } from "./simulation.ts";
export type ScenarioComplexity = "Foundation" | "Intermediate" | "Advanced";
export type FocusOption = {
  title: string;
  description: string;
  objective: string;
};
export type RunVariant = { title: string; description: string };

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
      modelPackDigest: CURRENT_MODEL_PACK_DIGEST,
    }),
  };
};

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

export const SCENARIO_LIBRARY: ScenarioDefinition[] = [
  {
    ...PACKAGE_GOVERNANCE,
    id: "a2a-crossing-intercept",
    version: "1.0.0",
    domain: "A2A",
    title: "Su-30MKI / Astra versus F-16C Block 52",
    summary:
      "Put a Su-30MKI and F-16C into a crossing study. Change the authored distance, angle, and routes.",
    blue: "Su-30MKI carrying Astra Mk 1",
    red: "PAF F-16C Block 52 carrying AIM-120C-5",
    targetProfile: "PAF F-16C Block 52",
    theatre: "Open training airspace",
    complexity: "Foundation",
    scope: "One launcher, one manoeuvring target and one interceptor.",
    tags: ["fighter vs fighter", "crossing geometry", "energy"],
    targetMotion: "moving",
    environment: "Standard atmosphere · no terrain model",
    focusOptions: movingFocus,
    runVariants: movingRuns,
    presetRationale: {
      profile:
        "The 46 km baseline is regression-tested against VECTOR's current Astra coefficient set and the selected North Punjab weather preset. It is a reproducible model setup, not a published engagement-range claim.",
      geometry:
        "A 145° crossing angle and 1,500 m altitude difference create a crossing intercept rather than a head-on pass or tail chase.",
      conditions:
        "Both aircraft use their admitted starting states and authored routes. Sensor, data-link, EW, and tactical-policy behavior are unavailable in this deployment.",
    },
    scenario: scenario({
      domain: "A2A",
      name: "IAF Su-30MKI versus PAF F-16C Block 52",
      objective:
        "Compare how starting distance, crossing angle, and authored routes change the Astra intercept opportunity.",
      bluePlatformId: "su-30mki",
      blueSystemId: "astra-mk1",
      redObjectId: "f-16c-block52-paf",
      redSystemId: "aim-120c5",
      studyAreaId: "north-punjab",
      weatherPresetId: "north-punjab-clear",
      guidance: "direct",
      range: 46000,
    }),
  },
  {
    ...PACKAGE_GOVERNANCE,
    id: "a2a-defensive-break",
    version: "1.0.0",
    domain: "A2A",
    title: "Mirage 2000H / MICA IR versus F-16C Block 52",
    summary:
      "Observe how a late defensive turn changes a short-range intercept and the remaining maneuver margin.",
    blue: "Mirage 2000H carrying MICA IR",
    red: "PAF F-16C Block 52 carrying AIM-120C-5",
    targetProfile: "PAF F-16C Block 52",
    theatre: "Synthetic border sector",
    complexity: "Intermediate",
    scope: "Single engagement with a prepared target manoeuvre.",
    tags: ["fighter vs fighter", "defensive manoeuvre", "timing"],
    targetMotion: "moving",
    environment: "Standard atmosphere · no terrain model",
    focusOptions: movingFocus,
    runVariants: movingRuns,
    presetRationale: {
      profile:
        "The 19 km start is inside VECTOR's 20 km MICA IR study boundary. Detailed variant source work remains incomplete and is marked in the catalog.",
      geometry:
        "A 120° crossing angle creates a crossing engagement rather than a head-on pass or tail chase.",
      conditions:
        "A seven-g Red Team break creates the primary comparison against the steady-course baseline.",
    },
    scenario: scenario({
      domain: "A2A",
      name: "Mirage 2000H / MICA IR versus F-16C Block 52",
      objective:
        "Measure how a late defensive turn changes the short-range intercept window.",
      bluePlatformId: "mirage-2000h",
      blueSystemId: "mica-ir",
      redObjectId: "f-16c-block52-paf",
      redSystemId: "aim-120c5",
      studyAreaId: "north-punjab",
      weatherPresetId: "north-punjab-hot",
      profile: "short",
      guidance: "direct",
      range: 19000,
      aspect: 120,
    }),
  },
  {
    ...PACKAGE_GOVERNANCE,
    id: "a2g-emitter-corridor",
    version: "1.0.0",
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
    environment: "Standard atmosphere · fixed objective · no terrain masking",
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
    version: "1.0.0",
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
      "Standard atmosphere · fixed objective · air-defence response not calculated",
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
    version: "1.0.0",
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
    environment: "Standard atmosphere · one active air-defence layer",
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
    version: "1.0.0",
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
    environment: "Standard atmosphere · one active layer resolved per run",
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
    version: "1.0.0",
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
    environment: "Standard atmosphere · fixed objective · no terrain model",
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
    version: "1.0.0",
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
      "Standard atmosphere · fixed objective · defence interaction not modeled",
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
];

export const DEFAULT_SCENARIO_DEFINITION = SCENARIO_LIBRARY[0];

export function getScenarioDefinition(id: string | null | undefined) {
  return SCENARIO_LIBRARY.find((item) => item.id === id);
}
