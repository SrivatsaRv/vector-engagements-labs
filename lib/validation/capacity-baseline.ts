import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { EngineBackendId, EngineEntityDefinition, EngineRun, EngineScenario } from "../engine/contracts.ts";
import { runEngineBackend } from "../engine/backend.ts";
import { enginePositionToGeographic } from "../scenario-spatial.ts";
import { simulateWithCapabilitiesForVerification } from "../simulation.ts";
import { SCENARIO_LIBRARY } from "../scenarios.ts";
import { createVerificationDeploymentCapabilities } from "../runtime/deployment-capabilities.ts";

export const CAPACITY_BASELINE_WORKLOAD_ID = "vector.air-capacity-baseline.v1";
export const CAPACITY_BASELINE_ENTITY_COUNT = 100;
export const CAPACITY_BASELINE_DURATION_SECONDS = 5;
export const CAPACITY_BASELINE_FIXED_STEP_SECONDS = 0.05;

export type CapacityBaselineUnsupportedCapability = {
  state: "UNAVAILABLE";
  reason: string;
};

export type CapacityBaselineManifest = {
  schemaVersion: "vector.capacity-baseline-manifest.v1";
  id: typeof CAPACITY_BASELINE_WORKLOAD_ID;
  entityCount: typeof CAPACITY_BASELINE_ENTITY_COUNT;
  entityMix: {
    activeAircraft: number;
    launchedGuidedVehicle: number;
    stowedGuidedVehicle: number;
  };
  fixedStepSeconds: typeof CAPACITY_BASELINE_FIXED_STEP_SECONDS;
  durationSeconds: typeof CAPACITY_BASELINE_DURATION_SECONDS;
  admittedCapabilities: readonly ["AIRCRAFT_ROUTE_EXECUTION", "GUIDED_VEHICLE_FLIGHT"];
  unavailableCapabilities: {
    sensorTrack: CapacityBaselineUnsupportedCapability;
    weaponSupport: CapacityBaselineUnsupportedCapability;
    virtualPilot: CapacityBaselineUnsupportedCapability;
    browserScenarioInjection: CapacityBaselineUnsupportedCapability;
    rustWasmCooperativeCancellation: CapacityBaselineUnsupportedCapability;
  };
};

export const CAPACITY_BASELINE_MANIFEST: CapacityBaselineManifest = {
  schemaVersion: "vector.capacity-baseline-manifest.v1",
  id: CAPACITY_BASELINE_WORKLOAD_ID,
  entityCount: CAPACITY_BASELINE_ENTITY_COUNT,
  entityMix: { activeAircraft: 98, launchedGuidedVehicle: 1, stowedGuidedVehicle: 1 },
  fixedStepSeconds: CAPACITY_BASELINE_FIXED_STEP_SECONDS,
  durationSeconds: CAPACITY_BASELINE_DURATION_SECONDS,
  admittedCapabilities: ["AIRCRAFT_ROUTE_EXECUTION", "GUIDED_VEHICLE_FLIGHT"],
  unavailableCapabilities: {
    sensorTrack: {
      state: "UNAVAILABLE",
      reason: "No complete admitted sensor/track model is available to this workload.",
    },
    weaponSupport: {
      state: "UNAVAILABLE",
      reason: "The guided vehicle has no admitted seeker or support chain in this workload.",
    },
    virtualPilot: {
      state: "UNAVAILABLE",
      reason: "Aircraft execute authored routes; no tactical decision policy is admitted.",
    },
    browserScenarioInjection: {
      state: "UNAVAILABLE",
      reason: "The browser Worker protocol does not accept an arbitrary capacity scenario package.",
    },
    rustWasmCooperativeCancellation: {
      state: "UNAVAILABLE",
      reason: "The current Rust/WASM ABI executes one whole run and has no batch cancellation boundary.",
    },
  },
};

function movingAircraft(
  blueprint: EngineEntityDefinition,
  affiliation: "BLUE" | "RED",
  index: number,
): EngineEntityDefinition {
  const column = index % 12;
  const row = Math.floor(index / 12);
  const side = affiliation === "BLUE" ? 1 : -1;
  const position = {
    x: blueprint.initial.position.x + side * (3_000 + column * 850),
    y: blueprint.initial.position.y + (row - 2) * 1_000,
    z: blueprint.initial.position.z + (index % 5) * 125,
  };
  const route = [
    position,
    { x: position.x + side * 1_200, y: position.y + 1_600, z: position.z + 350 },
    { x: position.x + side * 3_200, y: position.y - 300, z: position.z + 150 },
  ];
  return {
    ...structuredClone(blueprint),
    id: `capacity-${affiliation.toLowerCase()}-aircraft-${String(index + 1).padStart(2, "0")}`,
    rddfId: `rddf://capacity-baseline/${affiliation.toLowerCase()}/aircraft/${index + 1}`,
    designation: `${blueprint.designation} capacity route ${index + 1}`,
    callsign: `${affiliation} CAP ${index + 1}`,
    affiliation,
    lifecycle: "ACTIVE",
    weapon: undefined,
    initial: {
      ...blueprint.initial,
      position,
      headingRad: affiliation === "BLUE" ? 0 : Math.PI,
      massKg: blueprint.aircraft!.emptyMassKg + blueprint.initial.fuelKg,
    },
    route,
    routePlan: {
      schemaVersion: "vector.route-plan.v2",
      waypointAcceptanceRadiiM: [1, 180, 180],
      waypointTransitions: ["START", "FLY_BY", "FLY_BY"],
    },
  };
}

/**
 * A deterministic 100-entity workload that exercises only currently admitted
 * route execution and guided-vehicle flight. It intentionally does not model
 * sensor tracks, weapon support, or tactical decisions.
 */
export function createCapacityBaselineScenario(): EngineScenario {
  const base = structuredClone(
    simulateWithCapabilitiesForVerification(
      SCENARIO_LIBRARY[0].scenario,
      createVerificationDeploymentCapabilities("typescript", ["A2A"]),
    ).engineRun.scenario,
  );
  const blue = base.entities.find(
    (entity) => entity.kind === "AIRCRAFT" && entity.affiliation === "BLUE",
  );
  const red = base.entities.find(
    (entity) => entity.kind === "AIRCRAFT" && entity.affiliation === "RED",
  );
  if (!blue?.aircraft || !red?.aircraft) {
    throw new Error("Capacity baseline requires the admitted A2A aircraft blueprints.");
  }
  const guidedVehicles = base.entities.filter((entity) => entity.kind === "GUIDED_WEAPON");
  const launched = guidedVehicles.find((entity) => entity.weapon?.launchTimeSeconds === 0);
  const stowed = guidedVehicles.find((entity) => entity.weapon?.launchTimeSeconds === null);
  if (!launched?.weapon || !stowed?.weapon) {
    throw new Error("Capacity baseline requires one launched and one stowed guided-vehicle blueprint.");
  }
  const added = [
    ...Array.from({ length: 48 }, (_, index) => movingAircraft(blue, "BLUE", index)),
    ...Array.from({ length: 48 }, (_, index) => movingAircraft(red, "RED", index)),
  ];
  // This verification-only workload owns an exact 98-aircraft/two-vehicle mix;
  // it must not inherit the template's mission loadout quantity or mission
  // authority merely because the admitted blueprints came from an Air template.
  const redWithoutStores = structuredClone(red);
  redWithoutStores.initial.massKg = redWithoutStores.aircraft!.emptyMassKg
    + redWithoutStores.initial.fuelKg;
  const entities = [blue, launched, stowed, redWithoutStores, ...added];
  if (entities.length !== CAPACITY_BASELINE_ENTITY_COUNT) {
    throw new Error(`Capacity baseline must contain ${CAPACITY_BASELINE_ENTITY_COUNT} entities.`);
  }
  delete base.airMission;
  return {
    ...base,
    id: CAPACITY_BASELINE_WORKLOAD_ID,
    version: "1.0.0",
    name: "100-entity admitted air-route capacity baseline",
    durationSeconds: CAPACITY_BASELINE_DURATION_SECONDS,
    fixedStepSeconds: CAPACITY_BASELINE_FIXED_STEP_SECONDS,
    entities,
    geospatial: {
      ...base.geospatial,
      initialPositions: entities.map((entity) => ({
        entityId: entity.id,
        position: enginePositionToGeographic(entity.initial.position, base.geospatial.origin),
      })),
    },
  };
}

function digestRun(run: EngineRun) {
  return createHash("sha256")
    .update(JSON.stringify({
      termination: run.termination,
      frames: run.frames.map((frame) => ({
        t: frame.t,
        entities: frame.entities.map((entity) => [
          entity.id,
          entity.lifecycle,
          entity.position.x,
          entity.position.y,
          entity.position.z,
          entity.velocity.x,
          entity.velocity.y,
          entity.velocity.z,
        ]),
        observerStates: frame.observerStates,
      })),
    }))
    .digest("hex");
}

function percentile(values: readonly number[], percentileValue: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1)]!;
}

export type CapacityBaselineMeasurement = {
  backend: EngineBackendId;
  runs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  maxHeapDeltaBytes: number;
  deterministicDigest: string;
  integratedSteps: number;
  sampledFrames: number;
  movedAircraft: number;
  observerState: "UNSUPPORTED";
};

export function measureCapacityBaseline(
  backend: EngineBackendId,
  runs = 5,
): CapacityBaselineMeasurement {
  if (!Number.isSafeInteger(runs) || runs < 2) {
    throw new Error("Capacity baseline requires at least two measured runs for determinism.");
  }
  const scenario = createCapacityBaselineScenario();
  runEngineBackend(structuredClone(scenario), backend); // one warm-up, never measured
  const durations: number[] = [];
  const heapDeltas: number[] = [];
  const digests: string[] = [];
  let firstRun: EngineRun | undefined;
  for (let index = 0; index < runs; index += 1) {
    const before = process.memoryUsage().heapUsed;
    const started = performance.now();
    const run = runEngineBackend(structuredClone(scenario), backend);
    durations.push(performance.now() - started);
    heapDeltas.push(Math.max(0, process.memoryUsage().heapUsed - before));
    const digest = digestRun(run);
    digests.push(digest);
    firstRun ??= run;
  }
  if (!digests.every((digest) => digest === digests[0])) {
    throw new Error(`${backend} capacity workload was not deterministic across repeated runs.`);
  }
  const last = firstRun!.frames.at(-1)!;
  const first = firstRun!.frames[0]!;
  const movedAircraft = last.entities.filter((entity) => {
    if (entity.kind !== "AIRCRAFT") return false;
    const start = first.entities.find((candidate) => candidate.id === entity.id)!;
    return Math.hypot(
      entity.position.x - start.position.x,
      entity.position.y - start.position.y,
      entity.position.z - start.position.z,
    ) > 1;
  }).length;
  if (movedAircraft !== CAPACITY_BASELINE_MANIFEST.entityMix.activeAircraft) {
    throw new Error(`${backend} capacity workload has ${movedAircraft} moving aircraft; expected ${CAPACITY_BASELINE_MANIFEST.entityMix.activeAircraft}.`);
  }
  if (!last.observerStates.every((state) => state.sensorState === "UNSUPPORTED" && state.trackState === "UNSUPPORTED")) {
    throw new Error(`${backend} capacity workload fabricated a sensor/track state.`);
  }
  return {
    backend,
    runs,
    p50Ms: Number(percentile(durations, 0.5).toFixed(3)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(3)),
    p99Ms: Number(percentile(durations, 0.99).toFixed(3)),
    maxMs: Number(Math.max(...durations).toFixed(3)),
    maxHeapDeltaBytes: Math.max(...heapDeltas),
    deterministicDigest: digests[0]!,
    integratedSteps: firstRun!.diagnostics.integratedSteps,
    sampledFrames: firstRun!.frames.length,
    movedAircraft,
    observerState: "UNSUPPORTED",
  };
}
