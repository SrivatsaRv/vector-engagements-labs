import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { updateScenarioAirMissionRoutePoint } from "../lib/air-mission.ts";
import { createVerificationDeploymentCapabilities } from "../lib/runtime/deployment-capabilities.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import {
  prepareSimulation,
  simulateWithCapabilitiesForVerification,
} from "../lib/simulation.ts";

const ORACLE = JSON.parse(readFileSync(new URL(
  "../fixtures/scenarios/three-air-combat-geometry-oracle.v1.json",
  import.meta.url,
), "utf8"));

const capabilities = (backend) =>
  createVerificationDeploymentCapabilities(backend, ["A2A"]);

function definitionFor(study) {
  const definition = SCENARIO_LIBRARY.find(({ id }) => id === study.scenarioId);
  assert.ok(definition, `missing ${study.scenarioId}`);
  return definition;
}

function near(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ± ${tolerance}, received ${actual}`,
  );
}

function round(value, digits) {
  return Number(value.toFixed(digits));
}

function allNumbersFinite(value) {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(allNumbersFinite);
  }
  if (value && typeof value === "object") {
    return Object.values(value).every(allNumbersFinite);
  }
  return true;
}

function pointProjection(point) {
  return {
    eastM: point.x,
    northM: point.y,
    altitudeMslM: point.z,
  };
}

function assertLocalRoute(actual, expected, label) {
  assert.equal(actual.length, expected.points.length, `${label} point count`);
  actual.forEach((point, index) => {
    const projected = pointProjection(point);
    const expectedPoint = expected.points[index];
    const errorM = Math.hypot(
      projected.eastM - expectedPoint.eastM,
      projected.northM - expectedPoint.northM,
      projected.altitudeMslM - expectedPoint.altitudeMslM,
    );
    assert.ok(
      errorM <= ORACLE.projectionRoundTripToleranceM,
      `${label} point ${index} round-trip error ${errorM} m exceeds `
        + `${ORACLE.projectionRoundTripToleranceM} m`,
    );
  });
  const lengths = actual.slice(1).map((point, index) => {
    const prior = actual[index];
    return round(Math.hypot(
      point.x - prior.x,
      point.y - prior.y,
      point.z - prior.z,
    ), 6);
  });
  lengths.forEach((length, index) => near(
    length,
    expected.legLengthsM[index],
    ORACLE.projectionRoundTripToleranceM,
    `${label} leg ${index} length`,
  ));
}

function assertGeographicRoute(actual, expected, label) {
  assert.deepEqual(
    actual.map((point) => ({
      longitudeDeg: point.longitude,
      latitudeDeg: point.latitude,
      altitudeMslM: point.altitudeM,
    })),
    expected.geographicPoints,
    `${label} frozen WGS84/MSL route`,
  );
}

function effectEvent(result) {
  assert.equal(result.engineRun.events.state, "AVAILABLE");
  const committed = result.engineRun.events.items.filter(
    ({ payload }) => payload.kind === "TARGET_EFFECT_COMMITTED",
  );
  assert.equal(committed.length, 1, "target effect must commit exactly once");
  const [event] = committed;
  assert.equal(event.causeEventIds.length, 1, "target effect must have one causal receipt");
  const cause = result.engineRun.events.items.find(({ id }) => id === event.causeEventIds[0]);
  assert.ok(cause, "target-effect causal receipt is missing");
  assert.equal(cause.payload.kind, "WEAPON_TERMINATED");
  assert.equal(event.frameIndex, cause.frameIndex);
  assert.equal(event.modelTimeSeconds, cause.modelTimeSeconds);
  assert.equal(event.payload.commit.terminationReceipt.tick, cause.tick);
  assert.equal(event.payload.commit.terminationReceipt.localKey, cause.localKey);
  return event;
}

function entityAt(frame, id) {
  const entity = frame.entities.find((candidate) => candidate.id === id);
  assert.ok(entity, `${id} is missing at t=${frame.t}`);
  return entity;
}

function historySignature(result) {
  return [0, 0.25, 0.5, 0.75, 1].flatMap((fraction) => {
    const index = Math.min(
      result.engineRun.frames.length - 1,
      Math.round((result.engineRun.frames.length - 1) * fraction),
    );
    const frame = result.engineRun.frames[index];
    const blue = entityAt(frame, "blue-platform-1");
    const red = entityAt(frame, "red-object-1");
    return [
      frame.t,
      frame.separationM,
      blue.position.x,
      blue.position.y,
      blue.position.z,
      red.position.x,
      red.position.y,
      red.position.z,
      blue.activeRoutePointIndex ?? -1,
      red.activeRoutePointIndex ?? -1,
    ];
  });
}

function rootMeanSquareDifference(left, right) {
  assert.equal(left.length, right.length);
  const squares = left.map((value, index) => (value - right[index]) ** 2);
  return Math.sqrt(squares.reduce((sum, value) => sum + value, 0) / squares.length);
}

function firstParityDifference(actual, expected, path = "$") {
  if (Object.is(actual, expected)) {
    return undefined;
  }
  if (typeof actual === "number" && typeof expected === "number") {
    const tolerance = Math.max(
      1e-9,
      Math.max(Math.abs(actual), Math.abs(expected)) * 1e-12,
    );
    return Number.isFinite(actual) && Number.isFinite(expected) &&
        Math.abs(actual - expected) <= tolerance
      ? undefined
      : { path, actual, expected, tolerance };
  }
  if (typeof actual !== typeof expected || actual === null || expected === null) {
    return { path, actual, expected };
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) {
      return { path, actualLength: actual?.length, expectedLength: expected?.length };
    }
    for (let index = 0; index < actual.length; index += 1) {
      const difference = firstParityDifference(actual[index], expected[index], `${path}[${index}]`);
      if (difference) return difference;
    }
    return undefined;
  }
  if (typeof actual === "object") {
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    if (actualKeys.length !== expectedKeys.length
      || actualKeys.some((key, index) => key !== expectedKeys[index])) {
      return { path, actualKeys, expectedKeys };
    }
    for (const key of actualKeys) {
      const difference = firstParityDifference(actual[key], expected[key], `${path}.${key}`);
      if (difference) return difference;
    }
    return undefined;
  }
  return { path, actual, expected };
}

function assertGovernedParity(actual, expected, label) {
  const difference = firstParityDifference(actual, expected);
  assert.equal(
    difference,
    undefined,
    `${label} first parity mismatch: ${JSON.stringify(difference)}`,
  );
}

test("the independent Air-combat oracle is a closed literal authority", () => {
  assert.equal(ORACLE.schemaVersion, "vector.three-air-combat-geometry-oracle.v1");
  assert.equal(ORACLE.authority, "INDEPENDENT_LITERAL_VERIFICATION");
  assert.equal(ORACLE.studies.length, 3);
  assert.equal(new Set(ORACLE.studies.map(({ scenarioId }) => scenarioId)).size, 3);
  for (const study of ORACLE.studies) {
    assert.equal(study.blueRoute.points.length, 4, study.scenarioId);
    assert.equal(study.redRoute.points.length, 4, study.scenarioId);
    assert.equal(study.blueRoute.geographicPoints.length, 4, study.scenarioId);
    assert.equal(study.redRoute.geographicPoints.length, 4, study.scenarioId);
    assert.equal(study.blueRoute.legLengthsM.length, 3, study.scenarioId);
    assert.equal(study.redRoute.legLengthsM.length, 3, study.scenarioId);
    assert.ok(
      allNumbersFinite(study),
      `${study.scenarioId} contains a non-finite numeric literal`,
    );
  }
});

test("compiled routes reproduce the independent local geometry oracle", () => {
  for (const study of ORACLE.studies) {
    const definition = definitionFor(study);
    const { scenario } = definition;
    const prepared = prepareSimulation(
      scenario,
      scenario.profile,
      capabilities("typescript"),
    );
    const blue = prepared.engineScenario.entities.find(
      ({ id }) => id === "blue-platform-1",
    );
    const red = prepared.engineScenario.entities.find(
      ({ id }) => id === "red-object-1",
    );
    assert.ok(blue && red, `${study.scenarioId} aircraft identities`);

    assert.equal(definition.version, study.scenarioVersion);
    assert.equal(definition.authoredProfile?.id, study.profileId);
    assert.equal(scenario.airMission?.regime, study.regime);
    assert.equal(scenario.runDurationSeconds, study.durationSeconds);
    assert.equal(scenario.launcherSpeed, study.blueTasMps);
    assert.equal(scenario.targetSpeed, study.redTasMps);
    assert.equal(scenario.range, study.initialGeometry.horizontalSeparationM);
    assert.equal(scenario.aspect, study.initialGeometry.aspectDeg);
    assert.equal(
      scenario.altitude + scenario.targetDelta - scenario.altitude,
      study.initialGeometry.altitudeDifferenceM,
    );
    assert.equal(round(scenario.spatialPlan.blue.headingDeg, 3), study.initialGeometry.blueHeadingDeg);
    assert.equal(round(scenario.spatialPlan.red.headingDeg, 3), study.initialGeometry.redHeadingDeg);

    const request = scenario.airMission.assignments[0].storeTransferPlan.requests[0];
    assert.equal(request.requestedTimeSeconds, study.releaseTimeSeconds);
    assert.equal(request.installedDragAreaM2, study.installedDragAreaM2);
    assertLocalRoute(blue.route, study.blueRoute, `${study.scenarioId} blue`);
    assertLocalRoute(red.route, study.redRoute, `${study.scenarioId} red`);
    assertGeographicRoute(
      scenario.spatialPlan.blue.route,
      study.blueRoute,
      `${study.scenarioId} blue`,
    );
    assertGeographicRoute(
      scenario.spatialPlan.red.route,
      study.redRoute,
      `${study.scenarioId} red`,
    );
  }
});

test("all three canonical histories are deterministic, materially distinct, and match the frozen outcomes", () => {
  const histories = new Map();
  for (const study of ORACLE.studies) {
    const { scenario } = definitionFor(study);
    const first = simulateWithCapabilitiesForVerification(
      scenario,
      capabilities("typescript"),
    );
    const repeated = simulateWithCapabilitiesForVerification(
      scenario,
      capabilities("typescript"),
    );
    assert.deepEqual(repeated.engineRun.frames, first.engineRun.frames, `${study.scenarioId} repeat frames`);
    assert.deepEqual(repeated.engineRun.events, first.engineRun.events, `${study.scenarioId} repeat events`);
    assert.equal(first.termination, study.runtimeExpectation.termination);
    assert.equal(effectEvent(first).payload.commit.result, study.runtimeExpectation.effectClass);
    near(first.timeOfFlight, study.runtimeExpectation.timeOfFlightSeconds, 1e-9, `${study.scenarioId} time`);
    near(first.closestApproach, study.runtimeExpectation.closestApproachM, 1e-6, `${study.scenarioId} closest approach`);
    histories.set(study.scenarioId, historySignature(first));
  }

  const entries = [...histories.entries()];
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const [leftId, left] = entries[leftIndex];
      const [rightId, right] = entries[rightIndex];
      assert.ok(
        rootMeanSquareDifference(left, right)
          >= ORACLE.contrastPolicy.minimumPairwiseHistoryDistanceM,
        `${leftId} and ${rightId} histories are not materially distinct`,
      );
    }
  }
});

test("TypeScript and Rust/WASM retain full-frame semantic parity for every study", () => {
  for (const study of ORACLE.studies) {
    const { scenario } = definitionFor(study);
    const typescript = simulateWithCapabilitiesForVerification(
      scenario,
      capabilities("typescript"),
    );
    const rust = simulateWithCapabilitiesForVerification(
      scenario,
      capabilities("rust-wasm"),
    );
    assertGovernedParity(rust.engineRun.frames, typescript.engineRun.frames, `${study.scenarioId} frames`);
    assertGovernedParity(rust.engineRun.events, typescript.engineRun.events, `${study.scenarioId} events`);
    assert.equal(rust.termination, typescript.termination, `${study.scenarioId} termination`);
    near(
      rust.closestApproach,
      typescript.closestApproach,
      Math.max(
        1e-9,
        Math.max(Math.abs(rust.closestApproach), Math.abs(typescript.closestApproach)) * 1e-12,
      ),
      `${study.scenarioId} closest approach`,
    );
  }
});

test("one admitted route-coordinate change causally changes the canonical trajectory", () => {
  const policy = ORACLE.contrastPolicy;
  const definition = SCENARIO_LIBRARY.find(({ id }) => id === policy.routeMutationScenarioId);
  assert.ok(definition);
  const baselineScenario = structuredClone(definition.scenario);
  const point = baselineScenario.airMission.flightPlans[0].routePoints[policy.blueRoutePointIndex];
  const changedScenario = updateScenarioAirMissionRoutePoint(
    structuredClone(baselineScenario),
    policy.blueRoutePointIndex,
    {
      position: {
        ...point.position,
        longitude: point.position.longitude + policy.longitudeDeltaDeg,
      },
    },
  );
  const baseline = simulateWithCapabilitiesForVerification(
    baselineScenario,
    capabilities("typescript"),
  );
  const changed = simulateWithCapabilitiesForVerification(
    changedScenario,
    capabilities("typescript"),
  );
  const commonFrames = Math.min(
    baseline.engineRun.frames.length,
    changed.engineRun.frames.length,
  );
  let maximumPositionDeltaM = 0;
  for (let index = 0; index < commonFrames; index += 1) {
    const original = entityAt(baseline.engineRun.frames[index], "blue-platform-1");
    const edited = entityAt(changed.engineRun.frames[index], "blue-platform-1");
    maximumPositionDeltaM = Math.max(
      maximumPositionDeltaM,
      Math.hypot(
        original.position.x - edited.position.x,
        original.position.y - edited.position.y,
        original.position.z - edited.position.z,
      ),
    );
  }
  assert.ok(
    maximumPositionDeltaM >= policy.minimumCanonicalPositionDeltaM,
    `route edit changed the trajectory by only ${maximumPositionDeltaM} m`,
  );
});

test("every intended intercept/effect has a single-field nearby control with a different result", () => {
  for (const study of ORACLE.studies) {
    assert.ok(study.matchedControl, `${study.scenarioId} matched control`);
    assert.equal(
      study.matchedControl.changedField,
      "airMission.assignments[0].storeTransferPlan.requests[0].requestedTimeSeconds",
    );
    const { scenario } = definitionFor(study);
    const baseline = simulateWithCapabilitiesForVerification(
      scenario,
      capabilities("typescript"),
    );
    const controlScenario = structuredClone(scenario);
    const request = controlScenario.airMission.assignments[0].storeTransferPlan.requests[0];
    assert.equal(request.requestedTimeSeconds, study.releaseTimeSeconds);
    assert.ok(
      Math.abs(request.requestedTimeSeconds - study.matchedControl.value) <= 0.65,
      `${study.scenarioId} control is not nearby`,
    );
    request.requestedTimeSeconds = study.matchedControl.value;
    const control = simulateWithCapabilitiesForVerification(
      controlScenario,
      capabilities("typescript"),
    );

    assert.equal(effectEvent(baseline).payload.commit.result, study.runtimeExpectation.effectClass);
    assert.equal(effectEvent(control).payload.commit.result, study.matchedControl.effectClass);
    assert.notEqual(
      study.matchedControl.effectClass,
      study.runtimeExpectation.effectClass,
      `${study.scenarioId} control must change the effect class`,
    );
    assert.equal(control.termination, study.matchedControl.termination);
    near(
      control.timeOfFlight,
      study.matchedControl.timeOfFlightSeconds,
      1e-9,
      `${study.scenarioId} matched control time`,
    );
    near(
      control.closestApproach,
      study.matchedControl.closestApproachM,
      1e-6,
      `${study.scenarioId} matched control closest approach`,
    );
    if (study.runtimeExpectation.effectClass === "KILL") {
      assert.equal(entityAt(baseline.engineRun.frames.at(-1), "red-object-1").lifecycle, "TERMINATED");
      assert.equal(entityAt(control.engineRun.frames.at(-1), "red-object-1").lifecycle, "ACTIVE");
    }
  }
});
