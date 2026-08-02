import { DEFAULT_SCENARIO, type EngagementDomain, type Scenario } from "@/lib/simulation";

export type { EngagementDomain } from "@/lib/simulation";
export type ScenarioComplexity = "Foundation" | "Intermediate" | "Advanced";
export type FocusOption = { title: string; description: string; objective: string };
export type PreparedEvent = { title: string; description: string; duration: number; physicsEffect: "guidance-hold" | "loss-increase" };
export type RunVariant = { title: string; description: string };

export type ScenarioDefinition = {
  id: string;
  version: string;
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
  preparedEvent: PreparedEvent;
  runVariants: [RunVariant, RunVariant, RunVariant];
  presetRationale: { profile: string; geometry: string; conditions: string };
  scenario: Scenario;
};

export const DOMAIN_DETAILS: Record<EngagementDomain, { label: string; description: string }> = {
  A2A: { label: "Air intercept", description: "Airborne intercept geometry, timing, and energy-state sensitivity." },
  A2G: { label: "Air-to-surface", description: "Airborne approach geometry against synthetic surface objectives." },
  G2A: { label: "Surface-to-air defence", description: "Point and layered air-defence training problems." },
  G2G: { label: "Surface strike", description: "Abstract surface-to-surface trajectory comparisons." },
};

const scenario = (patch: Partial<Scenario>): Scenario => ({ ...DEFAULT_SCENARIO, ...patch });

const movingFocus: FocusOption[] = [
  { title: "Launch window", description: "Compare how starting distance and aspect change the intercept opportunity.", objective: "Compare how starting distance and aspect change the intercept opportunity." },
  { title: "Target maneuver", description: "Measure how a turn changes closing distance, demand, and completion time.", objective: "Measure how target maneuver changes closing distance and intercept demand." },
  { title: "Tracking interruption", description: "Mark how an instructor-provided information gap changes the trainee decision.", objective: "Assess the trainee decision when track information is temporarily degraded." },
];
const fixedFocus: FocusOption[] = [
  { title: "Flight path", description: "Compare direct and lofted paths to the same fixed objective.", objective: "Compare direct and lofted paths to the same fixed objective." },
  { title: "Range margin", description: "Check whether the selected profile covers the starting distance with margin.", objective: "Check whether the selected flight profile covers the starting distance with margin." },
  { title: "Environmental loss", description: "Measure how the loss assumption changes flight time and terminal speed.", objective: "Measure how the environmental-loss assumption changes flight time and terminal speed." },
];
const trackEvent: PreparedEvent = { title: "Track-information interruption", description: "For eight model seconds, guidance holds the last available line-of-sight command instead of receiving updates.", duration: 8, physicsEffect: "guidance-hold" };
const navigationEvent: PreparedEvent = { title: "Environmental-loss increase", description: "From the selected model time onward, the environmental-loss index increases by eight points.", duration: 0, physicsEffect: "loss-increase" };
const movingRuns: [RunVariant, RunVariant, RunVariant] = [
  { title: "Baseline", description: "Configured geometry and target behavior" },
  { title: "Information interruption", description: "Same physics with an instructor decision cue" },
  { title: "Higher target demand", description: "Increased target turn demand" },
];
const fixedRuns: [RunVariant, RunVariant, RunVariant] = [
  { title: "Baseline", description: "Configured flight path and loss assumption" },
  { title: "Direct-path comparison", description: "Same objective using a direct path" },
  { title: "Higher-loss comparison", description: "Environmental-loss index increased" },
];

export const SCENARIO_LIBRARY: ScenarioDefinition[] = [
  {
    id: "a2a-crossing-intercept",
    version: "1.0.0",
    domain: "A2A",
    title: "Crossing-air-target intercept",
    summary: "Compare closure, aspect and terminal energy against a crossing airborne track.",
    blue: "Fighter element",
    red: "Airborne track",
    targetProfile: "Fighter-sized airborne track",
    theatre: "Open training airspace",
    complexity: "Foundation",
    scope: "One launcher, one manoeuvring target and one interceptor.",
    tags: ["fighter vs fighter", "crossing geometry", "energy"],
    targetMotion: "moving",
    environment: "Standard atmosphere · no terrain model",
    focusOptions: movingFocus,
    preparedEvent: trackEvent,
    runVariants: movingRuns,
    presetRationale: { profile: "The medium-range air-interceptor profile covers the 52 km starting distance inside its 68 km model envelope.", geometry: "A 145° crossing aspect and 1,500 m altitude difference create a crossing-target training problem.", conditions: "A four-g defensive break begins after five model seconds; environmental loss is set to the library baseline." },
    scenario: scenario({ domain: "A2A", name: "Crossing-air-target intercept", objective: "Compare how starting distance and target maneuver change the intercept opportunity." }),
  },
  {
    id: "a2a-defensive-break",
    version: "1.0.0",
    domain: "A2A",
    title: "Defensive-break intercept",
    summary: "Observe how a late defensive turn changes pursuit demand and the remaining intercept window.",
    blue: "Patrol element",
    red: "Airborne track",
    targetProfile: "High-agility airborne track",
    theatre: "Synthetic border sector",
    complexity: "Intermediate",
    scope: "Single engagement with a prepared target manoeuvre.",
    tags: ["fighter vs fighter", "defensive manoeuvre", "timing"],
    targetMotion: "moving",
    environment: "Standard atmosphere · no terrain model",
    focusOptions: movingFocus,
    preparedEvent: trackEvent,
    runVariants: movingRuns,
    presetRationale: { profile: "The short-range air-interceptor profile keeps the 19 km run inside its 22 km model envelope.", geometry: "A 120° aspect creates a crossing engagement rather than a head-on or tail-chase case.", conditions: "A seven-g target break creates the primary comparison against the baseline run." },
    scenario: scenario({ domain: "A2A", name: "Defensive-break intercept", objective: "Measure how a late target break changes the intercept window.", profile: "short", guidance: "direct", range: 19000, aspect: 120, maneuver: "break", targetG: 7 }),
  },
  {
    id: "a2g-emitter-corridor",
    version: "1.0.0",
    domain: "A2G",
    title: "Emitter-approach study",
    summary: "Explore approach geometry against a synthetic fixed emitting sensor without modelling a named weapon.",
    blue: "Airborne element",
    red: "Emitting sensor",
    targetProfile: "Fixed radar-like emitter",
    theatre: "Generalized western sector",
    complexity: "Intermediate",
    scope: "One airborne launch point and one fixed synthetic emitter; no electronic-order-of-battle claim.",
    tags: ["aircraft vs sensor", "fixed target", "approach"],
    targetMotion: "fixed",
    environment: "Standard atmosphere · fixed objective · no terrain masking",
    focusOptions: fixedFocus,
    preparedEvent: navigationEvent,
    runVariants: fixedRuns,
    presetRationale: { profile: "The medium standoff profile covers the 44 km starting distance inside its 80 km model envelope.", geometry: "The airborne start is 7,800 m above the fixed objective and uses a direct comparison line.", conditions: "The objective is fixed; target speed and maneuver are locked to zero." },
    scenario: scenario({ domain: "A2G", name: "Emitter-approach study", objective: "Compare direct and lofted paths to the same fixed emitting objective.", profile: "medium", altitude: 7800, targetDelta: -7750, range: 44000, aspect: 180, launcherSpeed: 250, targetSpeed: 0, maneuver: "steady", targetG: 0 }),
  },
  {
    id: "a2g-protected-node",
    version: "1.0.0",
    domain: "A2G",
    title: "Protected-node approach",
    summary: "Test route timing against a synthetic protected objective and one abstract defensive response.",
    blue: "Airborne element",
    red: "Protected node",
    targetProfile: "Fixed support-infrastructure node",
    theatre: "Synthetic regional terrain",
    complexity: "Advanced",
    scope: "One attack path and one abstract defensive branch; no real installation geometry.",
    tags: ["aircraft vs ground", "protected objective", "route timing"],
    targetMotion: "fixed",
    environment: "Standard atmosphere · fixed objective · defence represented as instructor context",
    focusOptions: fixedFocus,
    preparedEvent: navigationEvent,
    runVariants: fixedRuns,
    presetRationale: { profile: "The extended standoff profile provides range margin for the 76 km starting distance.", geometry: "The airborne start is 9,200 m above a fixed surface objective; the baseline uses a lofted path.", conditions: "Defence interaction is contextual only and does not alter the point-mass physics." },
    scenario: scenario({ domain: "A2G", name: "Protected-node approach", objective: "Compare path choice and exposure time against a fixed protected objective.", profile: "sustained", altitude: 9200, targetDelta: -9150, range: 76000, aspect: 180, launcherSpeed: 265, targetSpeed: 0, maneuver: "steady", targetG: 0 }),
  },
  {
    id: "g2a-point-defence",
    version: "1.0.0",
    domain: "G2A",
    title: "Point air-defence intercept",
    summary: "Examine the engagement window as an airborne track crosses a defended point.",
    blue: "Air-defence unit",
    red: "Airborne track",
    targetProfile: "Medium-speed airborne track",
    theatre: "Synthetic defended sector",
    complexity: "Foundation",
    scope: "One ground launcher, one sensor-quality assumption and one airborne target.",
    tags: ["SAM scenario", "point defence", "crossing target"],
    targetMotion: "moving",
    environment: "Standard atmosphere · one active air-defence layer",
    focusOptions: movingFocus,
    preparedEvent: trackEvent,
    runVariants: movingRuns,
    presetRationale: { profile: "The area-defence profile covers the 48 km starting distance inside its 85 km model envelope.", geometry: "A ground launch against a target 7,920 m higher creates the vertical geometry for this run.", conditions: "The target uses a three-g weaving turn after five model seconds." },
    scenario: scenario({ domain: "G2A", name: "Point air-defence intercept", objective: "Compare how track aspect and distance change the air-defence engagement window.", profile: "medium", guidance: "loft", altitude: 80, targetDelta: 7920, range: 48000, aspect: 135, launcherSpeed: 0, targetSpeed: 245, maneuver: "weave", targetG: 3 }),
  },
  {
    id: "g2a-layered-screen",
    version: "1.0.0",
    domain: "G2A",
    title: "Layered air-defence sequence",
    summary: "Rehearse detection, hand-off and one active intercept inside a synthetic layered screen.",
    blue: "Layered air defence",
    red: "Penetrating track",
    targetProfile: "High-altitude airborne track",
    theatre: "Generalized South Asian theatre",
    complexity: "Advanced",
    scope: "Layer sequencing is represented in the run plan; the current physics run resolves one active layer at a time.",
    tags: ["layered SAM", "sensor hand-off", "run files"],
    targetMotion: "moving",
    environment: "Standard atmosphere · one active layer resolved per run",
    focusOptions: movingFocus,
    preparedEvent: trackEvent,
    runVariants: movingRuns,
    presetRationale: { profile: "The extended-area profile provides range margin for the 92 km starting distance.", geometry: "A ground start and 11,900 m altitude difference represent a high-altitude transit.", conditions: "Layer hand-off remains a run-plan decision; the physics resolves one selected layer." },
    scenario: scenario({ domain: "G2A", name: "Layered air-defence sequence", objective: "Compare layer selection and reassessment during a high-altitude transit.", profile: "sustained", altitude: 100, targetDelta: 11900, range: 92000, aspect: 155, launcherSpeed: 0, targetSpeed: 305, maneuver: "weave", targetG: 4 }),
  },
  {
    id: "g2g-supersonic-corridor",
    version: "1.0.0",
    domain: "G2G",
    title: "Surface-strike trajectory",
    summary: "Compare direct and lofted abstract trajectories toward a synthetic fixed objective.",
    blue: "Surface launcher",
    red: "Fixed objective",
    targetProfile: "Fixed strategic-size objective",
    theatre: "Generalized coastal corridor",
    complexity: "Intermediate",
    scope: "Public-data conceptual trajectory only; no named system, precise site or operational route.",
    tags: ["ground strike", "supersonic class", "trajectory"],
    targetMotion: "fixed",
    environment: "Standard atmosphere · fixed objective · no terrain model",
    focusOptions: fixedFocus,
    preparedEvent: navigationEvent,
    runVariants: fixedRuns,
    presetRationale: { profile: "The extended-range surface-strike profile covers the 105 km starting distance inside its 170 km model envelope.", geometry: "Both launcher and objective are fixed near the reference surface; the baseline uses a lofted path.", conditions: "Target motion and evasive maneuver do not apply to a fixed objective." },
    scenario: scenario({ domain: "G2G", name: "Surface-strike trajectory", objective: "Compare direct and lofted paths to the same fixed objective.", profile: "sustained", altitude: 50, targetDelta: 0, range: 105000, aspect: 180, launcherSpeed: 0, targetSpeed: 0, maneuver: "steady", targetG: 0 }),
  },
  {
    id: "g2g-defended-route",
    version: "1.0.0",
    domain: "G2G",
    title: "Defended-corridor comparison",
    summary: "Run repeatable trajectory variants through a synthetic defended corridor and compare outcomes.",
    blue: "Surface launcher",
    red: "Defended area",
    targetProfile: "Fixed area objective",
    theatre: "Synthetic regional terrain",
    complexity: "Advanced",
    scope: "Trajectory sensitivity and run comparison only; defence interaction remains an abstract event branch.",
    tags: ["ground to ground", "defended corridor", "comparison"],
    targetMotion: "fixed",
    environment: "Standard atmosphere · fixed objective · defence interaction not modeled",
    focusOptions: fixedFocus,
    preparedEvent: navigationEvent,
    runVariants: fixedRuns,
    presetRationale: { profile: "The extended-range surface-strike profile was selected because 118 km exceeds the medium profile's 100 km envelope.", geometry: "The launcher and objective are fixed at the reference surface; the baseline lofted path is the comparison case.", conditions: "Environmental loss is set to 22 for this sensitivity run. Defence interaction is not part of the physics." },
    scenario: scenario({ domain: "G2G", name: "Defended-corridor comparison", objective: "Measure how flight path and environmental loss change time and terminal speed at a fixed objective.", profile: "sustained", altitude: 50, targetDelta: 0, range: 118000, aspect: 180, launcherSpeed: 0, targetSpeed: 0, maneuver: "steady", targetG: 0, wind: 22 }),
  },
];

export const DEFAULT_SCENARIO_DEFINITION = SCENARIO_LIBRARY[0];

export function getScenarioDefinition(id: string | null | undefined) {
  return SCENARIO_LIBRARY.find((item) => item.id === id) ?? DEFAULT_SCENARIO_DEFINITION;
}
