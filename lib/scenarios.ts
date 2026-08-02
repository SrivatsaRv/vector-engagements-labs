import { DEFAULT_SCENARIO, type Scenario } from "@/lib/simulation";

export type EngagementDomain = "A2A" | "A2G" | "G2A" | "G2G";
export type ScenarioComplexity = "Foundation" | "Intermediate" | "Advanced";

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
  scenario: Scenario;
};

export const DOMAIN_DETAILS: Record<EngagementDomain, { label: string; description: string }> = {
  A2A: { label: "Air to air", description: "Airborne intercept geometry, timing and energy." },
  A2G: { label: "Air to ground", description: "Approach geometry against synthetic fixed ground objectives." },
  G2A: { label: "Ground to air", description: "Point and layered air-defence training problems." },
  G2G: { label: "Ground to ground", description: "Abstract trajectory and defended-corridor comparisons." },
};

const scenario = (patch: Partial<Scenario>): Scenario => ({ ...DEFAULT_SCENARIO, ...patch });

export const SCENARIO_LIBRARY: ScenarioDefinition[] = [
  {
    id: "a2a-crossing-intercept",
    version: "1.0.0",
    domain: "A2A",
    title: "Crossing intercept",
    summary: "Compare closure, aspect and terminal energy against a crossing airborne track.",
    blue: "Blue fighter",
    red: "Red fighter",
    targetProfile: "Fighter-sized airborne track",
    theatre: "Open training airspace",
    complexity: "Foundation",
    scope: "One launcher, one manoeuvring target and one interceptor.",
    tags: ["fighter vs fighter", "crossing geometry", "energy"],
    scenario: scenario({ name: "Crossing intercept", objective: "Understand how launch geometry and target manoeuvre affect the result" }),
  },
  {
    id: "a2a-defensive-break",
    version: "1.0.0",
    domain: "A2A",
    title: "Defensive break",
    summary: "Observe how a late defensive turn changes pursuit demand and the remaining intercept window.",
    blue: "Blue patrol",
    red: "Red airborne track",
    targetProfile: "High-agility airborne track",
    theatre: "Synthetic border sector",
    complexity: "Intermediate",
    scope: "Single engagement with a prepared target manoeuvre.",
    tags: ["fighter vs fighter", "defensive manoeuvre", "timing"],
    scenario: scenario({ name: "Defensive break", objective: "Assess how a late defensive break changes the intercept window", profile: "short", guidance: "direct", range: 19000, aspect: 120, maneuver: "break", targetG: 7 }),
  },
  {
    id: "a2g-emitter-corridor",
    version: "1.0.0",
    domain: "A2G",
    title: "Emitter corridor",
    summary: "Explore approach geometry against a synthetic fixed emitting sensor without modelling a named weapon.",
    blue: "Blue airborne element",
    red: "Red emitting sensor",
    targetProfile: "Fixed radar-like emitter",
    theatre: "Generalized western sector",
    complexity: "Intermediate",
    scope: "One airborne launch point and one fixed synthetic emitter; no electronic-order-of-battle claim.",
    tags: ["aircraft vs sensor", "fixed target", "approach"],
    scenario: scenario({ name: "Emitter corridor", objective: "Compare direct and lofted approach geometry against a fixed emitting sensor", profile: "medium", altitude: 7800, targetDelta: -7750, range: 44000, aspect: 180, launcherSpeed: 250, targetSpeed: 0, maneuver: "steady", targetG: 0 }),
  },
  {
    id: "a2g-protected-node",
    version: "1.0.0",
    domain: "A2G",
    title: "Protected ground node",
    summary: "Test route timing against a synthetic protected objective and one abstract defensive response.",
    blue: "Blue strike element",
    red: "Red protected node",
    targetProfile: "Fixed support-infrastructure node",
    theatre: "Synthetic regional terrain",
    complexity: "Advanced",
    scope: "One attack path and one abstract defensive branch; no real installation geometry.",
    tags: ["aircraft vs ground", "protected objective", "route timing"],
    scenario: scenario({ name: "Protected ground node", objective: "Understand how range and flight profile alter exposure time against a protected fixed objective", profile: "sustained", altitude: 9200, targetDelta: -9150, range: 76000, aspect: 180, launcherSpeed: 265, targetSpeed: 0, maneuver: "steady", targetG: 0 }),
  },
  {
    id: "g2a-point-defence",
    version: "1.0.0",
    domain: "G2A",
    title: "Point-defence intercept",
    summary: "Examine the engagement window as an airborne track crosses a defended point.",
    blue: "Blue air-defence unit",
    red: "Red airborne track",
    targetProfile: "Medium-speed airborne track",
    theatre: "Synthetic defended sector",
    complexity: "Foundation",
    scope: "One ground launcher, one sensor-quality assumption and one airborne target.",
    tags: ["SAM scenario", "point defence", "crossing target"],
    scenario: scenario({ name: "Point-defence intercept", objective: "Identify how track aspect and range shape a ground-to-air engagement window", profile: "medium", guidance: "loft", altitude: 80, targetDelta: 7920, range: 48000, aspect: 135, launcherSpeed: 0, targetSpeed: 245, maneuver: "weave", targetG: 3 }),
  },
  {
    id: "g2a-layered-screen",
    version: "1.0.0",
    domain: "G2A",
    title: "Layered defence sequence",
    summary: "Rehearse detection, hand-off and one active intercept inside a synthetic layered screen.",
    blue: "Blue layered defence",
    red: "Red penetrating track",
    targetProfile: "High-altitude airborne track",
    theatre: "Generalized South Asian theatre",
    complexity: "Advanced",
    scope: "Layer sequencing is represented in the run plan; the current physics run resolves one active layer at a time.",
    tags: ["layered SAM", "sensor hand-off", "run files"],
    scenario: scenario({ name: "Layered defence sequence", objective: "Practice layer selection and reassessment during a high-altitude transit", profile: "sustained", altitude: 100, targetDelta: 11900, range: 92000, aspect: 155, launcherSpeed: 0, targetSpeed: 305, maneuver: "weave", targetG: 4 }),
  },
  {
    id: "g2g-supersonic-corridor",
    version: "1.0.0",
    domain: "G2G",
    title: "Supersonic strike corridor",
    summary: "Compare direct and lofted abstract trajectories toward a synthetic fixed objective.",
    blue: "Blue ground launcher",
    red: "Red fixed objective",
    targetProfile: "Fixed strategic-size objective",
    theatre: "Generalized coastal corridor",
    complexity: "Intermediate",
    scope: "Public-data conceptual trajectory only; no named system, precise site or operational route.",
    tags: ["ground strike", "supersonic class", "trajectory"],
    scenario: scenario({ name: "Supersonic strike corridor", objective: "Compare direct and lofted trajectory assumptions for a synthetic fixed objective", profile: "sustained", altitude: 50, targetDelta: 0, range: 105000, aspect: 180, launcherSpeed: 0, targetSpeed: 0, maneuver: "steady", targetG: 0 }),
  },
  {
    id: "g2g-defended-route",
    version: "1.0.0",
    domain: "G2G",
    title: "Defended-route comparison",
    summary: "Run repeatable trajectory variants through a synthetic defended corridor and compare outcomes.",
    blue: "Blue ground fires unit",
    red: "Red defended area",
    targetProfile: "Fixed area objective",
    theatre: "Synthetic regional terrain",
    complexity: "Advanced",
    scope: "Trajectory sensitivity and run comparison only; defence interaction remains an abstract event branch.",
    tags: ["ground to ground", "defended corridor", "comparison"],
    scenario: scenario({ name: "Defended-route comparison", objective: "Test how trajectory choice and assumed environmental loss affect a repeatable fixed-target run", profile: "sustained", altitude: 50, targetDelta: 0, range: 118000, aspect: 180, launcherSpeed: 0, targetSpeed: 0, maneuver: "steady", targetG: 0, wind: 22 }),
  },
];

export const DEFAULT_SCENARIO_DEFINITION = SCENARIO_LIBRARY[0];

export function getScenarioDefinition(id: string | null | undefined) {
  return SCENARIO_LIBRARY.find((item) => item.id === id) ?? DEFAULT_SCENARIO_DEFINITION;
}
