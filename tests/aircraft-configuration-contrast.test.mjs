import assert from "node:assert/strict";
import test from "node:test";
import { runEngineBackend } from "../lib/engine/backend.ts";
import {
  createVerificationDeploymentCapabilities,
} from "../lib/runtime/deployment-capabilities.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { simulateWithCapabilitiesForVerification } from "../lib/simulation.ts";

const G0 = 9.80665;

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} differed from ${expected} by more than ${tolerance}`,
  );
}

// Deliberately local: this regression must not call the engine table evaluator.
function interpolateOracle(axis, values, input) {
  if (input < axis[0] || input > axis.at(-1)) throw new RangeError("outside coverage");
  for (let index = 1; index < axis.length; index += 1) {
    if (input <= axis[index]) {
      const fraction = (input - axis[index - 1]) / (axis[index] - axis[index - 1]);
      return values[index - 1] + (values[index] - values[index - 1]) * fraction;
    }
  }
  return values.at(-1);
}

function baseScenario() {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const scenario = structuredClone(
    simulateWithCapabilitiesForVerification(
      SCENARIO_LIBRARY[0].scenario,
      capabilities,
    ).engineRun.scenario,
  );
  scenario.durationSeconds = 24;
  scenario.events = [];
  const red = scenario.entities.find((entity) => entity.affiliation === "RED" && entity.kind === "AIRCRAFT");
  const carriedWeapons = scenario.entities.filter((entity) => entity.weapon?.launchPlatformId === red.id);
  for (const weapon of carriedWeapons) weapon.weapon.launchTimeSeconds = null;
  red.initial.velocity = { x: 255, y: 0, z: 0 };
  red.initial.headingRad = 0;
  red.route = [
    { ...red.initial.position },
    {
      x: red.initial.position.x + 2_000,
      y: red.initial.position.y + 13_000,
      z: red.initial.position.z + 2_500,
    },
  ];
  red.routePlan = {
    schemaVersion: "vector.route-plan.v1",
    waypointAcceptanceRadiiM: [1, 25],
  };
  return { scenario, aircraftId: red.id };
}

const CONFIGURATIONS = [
  {
    id: "generic-conservative-v1",
    maximumCommandG: 2.5,
    thrust: [0, 120_000],
    fuelFlow: [0.000008, 0.000012],
    drag: [0.034, 0.050],
  },
  {
    id: "generic-balanced-v1",
    maximumCommandG: 5,
    thrust: [0, 180_000],
    fuelFlow: [0.000012, 0.000020],
    drag: [0.028, 0.042],
  },
  {
    id: "generic-responsive-v1",
    maximumCommandG: 8,
    thrust: [0, 260_000],
    fuelFlow: [0.000018, 0.000034],
    drag: [0.022, 0.035],
  },
];

function applyConfiguration(scenario, aircraftId, configuration) {
  const aircraft = scenario.entities.find((entity) => entity.id === aircraftId);
  aircraft.aircraft = {
    ...aircraft.aircraft,
    maximumCommandG: configuration.maximumCommandG,
    zeroLiftDragByMach: {
      id: `${configuration.id}-zero-lift-drag`,
      axis: [0, 2],
      values: configuration.drag,
    },
    inducedDragByAngleOfAttackRad: {
      id: `${configuration.id}-induced-drag`,
      axis: [-0.2, 0.4],
      values: [0.045, 0.045],
    },
    thrustByThrottle: {
      id: `${configuration.id}-thrust`,
      axis: [0, 1],
      values: configuration.thrust,
    },
    fuelFlowByThrottle: {
      id: `${configuration.id}-fuel-flow`,
      axis: [0, 1],
      values: configuration.fuelFlow,
    },
  };
}

function summarize(run, aircraftId) {
  const frames = run.frames.map((frame) => frame.entities.find((entity) => entity.id === aircraftId));
  const first = frames[0];
  const last = frames.at(-1);
  return {
    headingChangeRad: Math.abs(last.headingRad - first.headingRad),
    lateralDistanceM: last.position.y - first.position.y,
    climbM: last.position.z - first.position.z,
    speedChangeMps: Math.hypot(last.velocity.x, last.velocity.y, last.velocity.z) -
      Math.hypot(first.velocity.x, first.velocity.y, first.velocity.z),
    fuelBurnKg: first.fuelKg - last.fuelKg,
    maximumAcceptedAccelerationMps2: Math.max(...frames
      .filter((frame) => frame.aircraftControl)
      .map((frame) => Math.hypot(
      frame.aircraftControl.acceptedSteeringAccelerationMps2.x,
      frame.aircraftControl.acceptedSteeringAccelerationMps2.y,
      frame.aircraftControl.acceptedSteeringAccelerationMps2.z,
    ))),
    position: last.position,
  };
}

test("three admitted generic aircraft configurations causally contrast turn, climb, acceleration, and fuel histories in both engines", () => {
  const results = CONFIGURATIONS.map((configuration) => {
    const { scenario, aircraftId } = baseScenario();
    applyConfiguration(scenario, aircraftId, configuration);
    const typescript = runEngineBackend(structuredClone(scenario), "typescript");
    const rust = runEngineBackend(structuredClone(scenario), "rust-wasm");
    const typescriptSummary = summarize(typescript, aircraftId);
    const rustSummary = summarize(rust, aircraftId);

    // This is independent table arithmetic, not a copied flight integrator.
    assert.equal(
      interpolateOracle([0, 1], configuration.thrust, 1),
      configuration.thrust[1],
      `${configuration.id} full-throttle source table`,
    );
    assert.equal(
      interpolateOracle([0, 1], configuration.fuelFlow, 0),
      configuration.fuelFlow[0],
      `${configuration.id} idle fuel-flow source table`,
    );
    assert.ok(
      typescriptSummary.maximumAcceptedAccelerationMps2 <= configuration.maximumCommandG * G0 + 1e-8,
      `${configuration.id} accepts no steering acceleration above its admitted limit`,
    );
    for (const metric of [
      "headingChangeRad",
      "lateralDistanceM",
      "climbM",
      "speedChangeMps",
      "fuelBurnKg",
      "maximumAcceptedAccelerationMps2",
    ]) {
      close(rustSummary[metric], typescriptSummary[metric], 1e-6, `${configuration.id} ${metric} parity`);
    }
    for (const axis of ["x", "y", "z"]) {
      close(rustSummary.position[axis], typescriptSummary.position[axis], 1e-6, `${configuration.id} ${axis} trajectory parity`);
    }
    return { configuration, summary: typescriptSummary };
  });

  const [conservative, balanced, responsive] = results;
  const materiallyDifferent = (first, second, metric) =>
    Math.abs(first.summary[metric] - second.summary[metric]) > 0.1;
  assert.ok(
    conservative.summary.maximumAcceptedAccelerationMps2 < balanced.summary.maximumAcceptedAccelerationMps2 &&
      balanced.summary.maximumAcceptedAccelerationMps2 < responsive.summary.maximumAcceptedAccelerationMps2,
    "admitted control limits cause distinct achieved turn authority",
  );
  assert.ok(
    conservative.summary.lateralDistanceM < balanced.summary.lateralDistanceM &&
      balanced.summary.lateralDistanceM < responsive.summary.lateralDistanceM,
    "the same route yields a distinct recorded turn trajectory",
  );
  assert.ok(
    conservative.summary.climbM < balanced.summary.climbM &&
      balanced.summary.climbM < responsive.summary.climbM,
    "the same climb request yields a distinct recorded vertical history",
  );
  assert.ok(
    materiallyDifferent(conservative, balanced, "speedChangeMps") &&
      materiallyDifferent(balanced, responsive, "speedChangeMps") &&
      materiallyDifferent(conservative, responsive, "speedChangeMps"),
    "admitted propulsion and drag tables cause three distinct acceleration histories",
  );
  assert.ok(
    conservative.summary.fuelBurnKg < balanced.summary.fuelBurnKg &&
      balanced.summary.fuelBurnKg < responsive.summary.fuelBurnKg,
    "admitted fuel-flow tables cause distinct fuel histories",
  );
  assert.notDeepEqual(conservative.summary.position, responsive.summary.position);
});
