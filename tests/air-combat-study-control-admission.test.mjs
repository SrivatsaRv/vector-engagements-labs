import assert from "node:assert/strict";
import test from "node:test";

import {
  AIR_COMBAT_STUDY_ENUM_AUTHORITIES,
  AUTHORED_CAP_AIRCRAFT_COUNT_AUTHORITY,
  AUTHORED_CAP_DISTANCE_LIMIT_AUTHORITY,
  AUTHORED_CROSSING_ANGLE_AUTHORITY,
  AUTHORED_GROUND_START_DELAY_AUTHORITY,
  AUTHORED_INSTALLED_DRAG_AREA_AUTHORITY,
  AUTHORED_ROUTE_ACCEPTANCE_RADIUS_AUTHORITY,
  AUTHORED_ROUTE_ALTITUDE_MSL_AUTHORITY,
  AUTHORED_ROUTE_TIME_CONSTRAINT_AUTHORITY,
  AUTHORED_STORE_TRANSFER_TIME_AUTHORITY,
  AUTHORED_TRUE_HEADING_AUTHORITY,
  AUTHORED_WEAPON_RTB_THRESHOLD_AUTHORITY,
  AUTHORED_WGS84_LATITUDE_AUTHORITY,
  AUTHORED_WGS84_LONGITUDE_AUTHORITY,
  ScenarioControlAdmissionError,
  ScenarioEnumAdmissionError,
  ScenarioSpatialAdmissionError,
  admitsAirCombatStudyEnum,
  admitRawNumber,
  admitStructuredNumber,
  authoritiesEqual,
  resolveScenarioNumericControlAuthority,
} from "../lib/scenario-control-authority.ts";
import {
  createVectorSimulationRecord,
  openVectorSimulationRecord,
  serializeVectorRecord,
} from "../lib/record/vector-record.ts";
import {
  adaptPreparedSimulation,
  admitRuntimeModelPack,
} from "../lib/runtime/model-pack-adapter.ts";
import {
  prepareSimulation,
  simulate,
} from "../lib/simulation.ts";
import { getScenarioDefinition } from "../lib/scenarios.ts";
import { retainedScenarioPackageReference } from "../lib/scenario-package-reference.ts";
import { withSpatialAspectDeg } from "../lib/scenario-spatial.ts";
import { getStudyArea } from "../lib/study-areas.ts";
import { validateSavedScenario } from "../lib/security/saved-run.ts";

const scalarAuthorities = [
  ["longitude", AUTHORED_WGS84_LONGITUDE_AUTHORITY, "1.1234567890123456"],
  ["latitude", AUTHORED_WGS84_LATITUDE_AUTHORITY, "1.1234567890123456"],
  ["altitude", AUTHORED_ROUTE_ALTITUDE_MSL_AUTHORITY, "1.0001"],
  ["heading", AUTHORED_TRUE_HEADING_AUTHORITY, "1.0001"],
  ["crossing", AUTHORED_CROSSING_ANGLE_AUTHORITY, "1.0001"],
  ["radius", AUTHORED_ROUTE_ACCEPTANCE_RADIUS_AUTHORITY, "1.0001"],
  ["release time", AUTHORED_STORE_TRANSFER_TIME_AUTHORITY, "1.0001"],
  ["installed drag", AUTHORED_INSTALLED_DRAG_AREA_AUTHORITY, "0.0011"],
];

test("#197 shared numeric authorities reject malformed, nonfinite, precision, range, and structured bypasses", () => {
  for (const [name, authority, overPrecision] of scalarAuthorities) {
    for (const raw of [" ", "+", "NaN", "Infinity", "1e", "1,5", "12 unit"]) {
      assert.equal(admitRawNumber(raw, authority).ok, false, `${name} admitted ${raw}`);
    }
    assert.deepEqual(admitRawNumber("1e999", authority), {
      ok: false,
      code: "CONTROL_NUMBER_NONFINITE",
    }, name);
    assert.deepEqual(admitRawNumber(overPrecision, authority), {
      ok: false,
      code: "CONTROL_NUMBER_PRECISION",
    }, name);
    assert.equal(admitRawNumber(String(authority.minimum), authority).ok, true, name);
    assert.equal(admitRawNumber(String(authority.maximum), authority).ok, true, name);
    assert.equal(admitRawNumber(String(authority.minimum - 0.001), authority).ok, false, name);
    assert.equal(admitRawNumber(String(authority.maximum + 0.001), authority).ok, false, name);
    assert.deepEqual(admitStructuredNumber("1", authority), {
      ok: false,
      code: "CONTROL_NUMBER_TYPE",
    }, name);
    assert.deepEqual(admitStructuredNumber(Number.NaN, authority), {
      ok: false,
      code: "CONTROL_NUMBER_NONFINITE",
    }, name);
    assert.equal(admitStructuredNumber(authority.maximum + 0.001, authority).ok, false, name);
  }
  assert.deepEqual(admitStructuredNumber(1.0001, AUTHORED_TRUE_HEADING_AUTHORITY), {
    ok: false,
    code: "CONTROL_NUMBER_PRECISION",
  });
  assert.deepEqual(admitStructuredNumber(105.123, AUTHORED_CROSSING_ANGLE_AUTHORITY), {
    ok: true,
    value: 105.123,
  });
  assert.deepEqual(admitStructuredNumber(105.1234, AUTHORED_CROSSING_ANGLE_AUTHORITY), {
    ok: false,
    code: "CONTROL_NUMBER_PRECISION",
  });
});

test("#197 live raw text control IDs resolve to their exact shared numeric authority", () => {
  const bindings = [
    ["scenario.runDurationSeconds", { minimum: 0.001, maximum: 3_600, precision: 3 }],
    ["scenario.seed", { minimum: 0, maximum: 2_147_483_647, precision: 0 }],
    ["spatial.blue.start.longitude", AUTHORED_WGS84_LONGITUDE_AUTHORITY],
    ["spatial.red.start.latitude", AUTHORED_WGS84_LATITUDE_AUTHORITY],
    ["spatial.blue.start.altitude", AUTHORED_ROUTE_ALTITUDE_MSL_AUTHORITY],
    ["spatial.red.start.heading", AUTHORED_TRUE_HEADING_AUTHORITY],
    ["spatial.blue.start.speed", { minimum: 0, maximum: 450, precision: 3 }],
    ["spatial.blue.route[*].longitude", AUTHORED_WGS84_LONGITUDE_AUTHORITY],
    ["spatial.red.route[*].latitude", AUTHORED_WGS84_LATITUDE_AUTHORITY],
    ["spatial.blue.route[*].altitudeM", AUTHORED_ROUTE_ALTITUDE_MSL_AUTHORITY],
    ["spatial.red.route[*].acceptanceRadiusM", AUTHORED_ROUTE_ACCEPTANCE_RADIUS_AUTHORITY],
    ["airMission.flightPlans[0].routePoints[3].longitude", AUTHORED_WGS84_LONGITUDE_AUTHORITY],
    ["airMission.flightPlans[0].routePoints[3].latitude", AUTHORED_WGS84_LATITUDE_AUTHORITY],
    ["airMission.flightPlans[0].routePoints[3].altitudeMslM", AUTHORED_ROUTE_ALTITUDE_MSL_AUTHORITY],
    ["airMission.flightPlans[0].routePoints[3].acceptanceRadiusM", AUTHORED_ROUTE_ACCEPTANCE_RADIUS_AUTHORITY],
    ["airMission.assignments[0].storeTransfer.requests[0].requestedTimeSeconds", AUTHORED_STORE_TRANSFER_TIME_AUTHORITY],
    ["airMission.assignments[0].storeTransfer.requests[0].installedDragAreaM2", AUTHORED_INSTALLED_DRAG_AREA_AUTHORITY],
    ["airMission.tasks.cap.onStationCount", AUTHORED_CAP_AIRCRAFT_COUNT_AUTHORITY],
    ["airMission.tasks.cap.flightSize", AUTHORED_CAP_AIRCRAFT_COUNT_AUTHORITY],
    ["airMission.tasks.cap.investigationLimitM", AUTHORED_CAP_DISTANCE_LIMIT_AUTHORITY],
    ["airMission.tasks.cap.prosecutionLimitM", AUTHORED_CAP_DISTANCE_LIMIT_AUTHORITY],
    ["airMission.tasks.cap.patrolArea.vertices[2].longitude", AUTHORED_WGS84_LONGITUDE_AUTHORITY],
    ["airMission.tasks.cap.prosecutionArea.vertices[1].latitude", AUTHORED_WGS84_LATITUDE_AUTHORITY],
    ["airMission.fuel.weaponRtbThreshold", AUTHORED_WEAPON_RTB_THRESHOLD_AUTHORITY],
    ["airMission.start.readinessDelaySeconds", AUTHORED_GROUND_START_DELAY_AUTHORITY],
    ["airMission.flightPlans[0].routePoints[2].etaSeconds", AUTHORED_ROUTE_TIME_CONSTRAINT_AUTHORITY],
    ["airMission.flightPlans[0].routePoints[2].totalTimeOnTargetSeconds", AUTHORED_ROUTE_TIME_CONSTRAINT_AUTHORITY],
  ];
  for (const [controlId, expected] of bindings) {
    const actual = resolveScenarioNumericControlAuthority(controlId);
    assert.ok(actual, controlId);
    if ("kind" in expected) {
      assert.equal(authoritiesEqual(actual, expected), true, controlId);
    } else {
      assert.equal(actual.minimum, expected.minimum, controlId);
      assert.equal(actual.maximum, expected.maximum, controlId);
      assert.equal(actual.precision, expected.precision, controlId);
    }
  }
  assert.equal(resolveScenarioNumericControlAuthority("airMission.tasks.cap.unregistered"), null);
});

test("#193 static dropdown authorities exhaust every admitted option", () => {
  assert.deepEqual(AIR_COMBAT_STUDY_ENUM_AUTHORITIES, {
    guidance: ["direct", "loft"],
    missionClass: ["TACTICAL_INTERCEPT", "COMBAT_AIR_PATROL", "FIGHTER_SWEEP", "ESCORT"],
    engagementRegime: ["BVR", "WVR_BFM", "UNRESTRICTED_TRANSITION"],
    startPosture: ["AIRBORNE", "PARKING", "RUNWAY", "GROUND_ALERT_QRA"],
    routeTransition: ["START", "FLY_BY", "FLY_OVER"],
    flightLegRole: [
      "DEPARTURE", "TRANSIT", "INGRESS", "INTERCEPT_ATTACK", "ON_STATION_PATROL",
      "REFUEL", "EGRESS", "RECOVERY", "DIVERT",
    ],
    patrolPattern: ["RACETRACK"],
    emissionPolicy: ["ACTIVE", "SILENT"],
    weaponPolicy: ["HOLD", "TIGHT", "FREE_WITHIN_BOUNDARY"],
    storeOperation: ["RELEASE", "JETTISON"],
  });
  for (const [authority, values] of Object.entries(AIR_COMBAT_STUDY_ENUM_AUTHORITIES)) {
    assert.ok(values.length > 0, `${authority} has no options`);
    assert.equal(new Set(values).size, values.length, `${authority} repeats an option`);
    for (const value of values) {
      assert.equal(admitsAirCombatStudyEnum(authority, value), true, `${authority} rejected ${value}`);
    }
    for (const value of ["UNKNOWN", "RETIRED_V0", "", 42, null]) {
      assert.equal(admitsAirCombatStudyEnum(authority, value), false, `${authority} admitted ${JSON.stringify(value)}`);
    }
  }
});

test("#197 enum authorities reject unknown, stale, and unsupported guidance, regime, turn, and leg values", () => {
  const definition = getScenarioDefinition("a2a-crossing-intercept");
  assert.ok(definition?.scenario.airMission);
  assert.ok(definition.scenario.airMission.assignments[0].storeTransferPlan?.requests[0]);
  const cases = [
    ["guidance", "$.guidance", (scenario, value) => { scenario.guidance = value; }],
    ["missionClass", "$.airMission.missionClass", (scenario, value) => { scenario.airMission.missionClass = value; }],
    ["engagementRegime", "$.airMission.regime", (scenario, value) => { scenario.airMission.regime = value; }],
    ["startPosture", "$.airMission.start.posture", (scenario, value) => { scenario.airMission.start.posture = value; }],
    ["emissionPolicy", "$.airMission.policies.emission", (scenario, value) => { scenario.airMission.policies.emission = value; }],
    ["weaponPolicy", "$.airMission.policies.weapon", (scenario, value) => { scenario.airMission.policies.weapon = value; }],
    ["storeOperation", "$.airMission.assignments[0].storeTransferPlan.requests[0].operation", (scenario, value) => { scenario.airMission.assignments[0].storeTransferPlan.requests[0].operation = value; }],
    ["routeTransition", "$.airMission.flightPlans[0].routePoints[1].turnMethod", (scenario, value) => { scenario.airMission.flightPlans[0].routePoints[1].turnMethod = value; }],
    ["flightLegRole", "$.airMission.flightPlans[0].legs[0].role", (scenario, value) => { scenario.airMission.flightPlans[0].legs[0].role = value; }],
  ];
  for (const [authority, fieldPath, mutate] of cases) {
    for (const value of ["UNKNOWN", "RETIRED_V0", "", 42, null]) {
      const scenario = structuredClone(definition.scenario);
      mutate(scenario, value);
      assert.throws(
        () => prepareSimulation(scenario),
        (error) => error instanceof ScenarioEnumAdmissionError && error.fieldPath === fieldPath,
        `${authority} admitted ${JSON.stringify(value)}`,
      );
    }
  }

  const cap = structuredClone(definition.scenario);
  cap.airMission.missionClass = "COMBAT_AIR_PATROL";
  cap.airMission.tasks = {
    kind: "COMBAT_AIR_PATROL",
    patrolArea: structuredClone(cap.airMission.tasks.defendedArea),
    prosecutionArea: null,
    onStationCount: 2,
    flightSize: 2,
    patrolPattern: "INVALID_PATTERN",
    onStationMinutes: 30,
    relief: "FUEL_OR_TIME",
    investigationLimitM: 50_000,
    prosecutionLimitM: 100_000,
    completionCondition: "Complete after the authored station period.",
  };
  assert.throws(
    () => prepareSimulation(cap),
    (error) => error instanceof ScenarioEnumAdmissionError
      && error.fieldPath === "$.airMission.tasks.patrolPattern",
  );
});

test("#197 saved-run repeats spatial precision and guidance admission before recomputation", () => {
  const definition = getScenarioDefinition("a2a-crossing-intercept");
  assert.ok(definition?.scenario.spatialPlan);
  assert.doesNotThrow(() => validateSavedScenario(definition.scenario, definition));

  const heading = structuredClone(definition.scenario);
  heading.spatialPlan.blue.headingDeg = 54.4623;
  assert.throws(
    () => validateSavedScenario(heading, definition),
    { code: "invalid_blue_heading_control_number_precision" },
  );

  const radius = structuredClone(definition.scenario);
  radius.spatialPlan.blue.routeAcceptanceRadiiM[1] = 500.0001;
  assert.throws(
    () => validateSavedScenario(radius, definition),
    { code: "invalid_blue_route_acceptance_radius_1_control_number_precision" },
  );

  const guidance = structuredClone(definition.scenario);
  guidance.guidance = "RETIRED_GUIDANCE";
  assert.throws(() => validateSavedScenario(guidance, definition), { code: "invalid_guidance" });
});

test("#197 prepare admission validates every governed Blue and Red spatial control", () => {
  const definition = getScenarioDefinition("a2a-crossing-intercept");
  assert.ok(definition?.scenario.spatialPlan);
  const cases = [
    ["position longitude", (side) => { side.position.longitude = 181; }, ScenarioControlAdmissionError, "position.longitude"],
    ["position latitude", (side) => { side.position.latitude = Number.NaN; }, ScenarioControlAdmissionError, "position.latitude"],
    ["position altitude precision", (side) => { side.position.altitudeM = 8_500.0001; }, ScenarioControlAdmissionError, "position.altitudeM"],
    ["speed precision", (side) => { side.speedMps = 250.0001; }, ScenarioControlAdmissionError, "speedMps"],
    ["heading precision", (side) => { side.headingDeg = 90.0001; }, ScenarioControlAdmissionError, "headingDeg"],
    ["route longitude", (side) => { side.route[1].longitude = -181; }, ScenarioControlAdmissionError, "route[1].longitude"],
    ["route latitude", (side) => { side.route[1].latitude = 91; }, ScenarioControlAdmissionError, "route[1].latitude"],
    ["route altitude precision", (side) => { side.route[1].altitudeM = 8_500.0001; }, ScenarioControlAdmissionError, "route[1].altitudeM"],
    ["route radius precision", (side) => { side.routeAcceptanceRadiiM[1] = 500.0001; }, ScenarioControlAdmissionError, "routeAcceptanceRadiiM[1]"],
    ["route minimum cardinality", (side) => { side.route = []; side.routeAcceptanceRadiiM = []; side.routeWaypointTransitions = []; }, ScenarioSpatialAdmissionError, "route"],
    ["route radius cardinality", (side) => { side.routeAcceptanceRadiiM.pop(); }, ScenarioSpatialAdmissionError, "routeAcceptanceRadiiM"],
    ["route transition", (side) => { side.routeWaypointTransitions[1] = "RETIRED_V0"; }, ScenarioEnumAdmissionError, "routeWaypointTransitions[1]"],
    ["route transition cardinality", (side) => { side.routeWaypointTransitions.pop(); }, ScenarioSpatialAdmissionError, "routeWaypointTransitions"],
  ];

  for (const sideName of ["blue", "red"]) {
    for (const [name, mutate, ErrorType, pathSuffix] of cases) {
      const scenario = structuredClone(definition.scenario);
      mutate(scenario.spatialPlan[sideName]);
      assert.throws(
        () => prepareSimulation(scenario),
        (error) => error instanceof ErrorType
          && error.fieldPath === `$.spatialPlan.${sideName}.${pathSuffix}`,
        `${sideName} ${name} bypassed structured admission`,
      );
    }
  }
});

test("#197 Worker admission rejects a coherently resealed Red spatial-control bypass", async () => {
  const definition = getScenarioDefinition("a2a-crossing-intercept");
  assert.ok(definition?.scenario.spatialPlan);
  const prepared = prepareSimulation(structuredClone(definition.scenario));
  prepared.scenario.spatialPlan.red.speedMps = 250.0001;
  const resealed = await adaptPreparedSimulation(prepared);

  await assert.rejects(
    () => admitRuntimeModelPack(resealed),
    (error) => error instanceof ScenarioControlAdmissionError
      && error.code === "CONTROL_NUMBER_PRECISION"
      && error.fieldPath === "$.spatialPlan.red.speedMps",
  );
});

test("#197 direct start heading is projection-only while the crossing control changes runtime geometry", () => {
  const definition = getScenarioDefinition("a2a-crossing-intercept");
  assert.ok(definition?.scenario.spatialPlan);
  const baseline = simulate(definition.scenario);
  const baselineBlue = baseline.engineRun.frames[0].entities.find((entity) => entity.id === "blue-platform-1");
  const baselineRed = baseline.engineRun.frames[0].entities.find((entity) => entity.id === "red-object-1");
  assert.ok(baselineBlue && baselineRed);

  const heading = structuredClone(definition.scenario);
  heading.spatialPlan.blue.headingDeg = (heading.spatialPlan.blue.headingDeg + 1) % 360;
  const headingResult = simulate(heading);
  const headingBlue = headingResult.engineRun.frames[0].entities.find((entity) => entity.id === "blue-platform-1");
  assert.ok(headingBlue);
  assert.deepEqual(headingResult.engineRun.frames, baseline.engineRun.frames);
  assert.deepEqual(headingBlue.velocity, baselineBlue.velocity);

  const crossing = structuredClone(definition.scenario);
  crossing.aspect = 105.123;
  crossing.spatialPlan = withSpatialAspectDeg(
    crossing.spatialPlan,
    getStudyArea(crossing.studyAreaId),
    crossing.aspect,
  );
  const crossingResult = simulate(crossing);
  const crossingRed = crossingResult.engineRun.frames[0].entities.find((entity) => entity.id === "red-object-1");
  assert.ok(crossingRed);
  assert.notDeepEqual(crossingRed.velocity, baselineRed.velocity);
  assert.equal(crossingResult.engineRun.scenario.entities.find((entity) => entity.id === "red-object-1")?.initial.velocity.x, crossingRed.velocity.x);
});

test("#197 regime is projection-only: mutation changes mission identity but not canonical dynamics", () => {
  const definition = getScenarioDefinition("a2a-crossing-intercept");
  assert.ok(definition?.scenario.airMission);
  const baseline = simulate(definition.scenario);
  const changed = structuredClone(definition.scenario);
  changed.airMission.regime = "WVR_BFM";
  const projected = simulate(changed);
  assert.notEqual(
    projected.engineRun.scenario.airMission.authoredDigest,
    baseline.engineRun.scenario.airMission.authoredDigest,
  );
  assert.deepEqual(projected.engineRun.frames, baseline.engineRun.frames);
  assert.deepEqual(projected.engineRun.events, baseline.engineRun.events);
});

test("#197 seed changes replay/VSR identity while canonical dynamics remain identical", async () => {
  const definition = getScenarioDefinition("a2a-crossing-intercept");
  assert.ok(definition);
  const changed = structuredClone(definition.scenario);
  changed.seed += 1;
  const baselineResult = simulate(definition.scenario);
  const changedResult = simulate(changed);
  assert.deepEqual(changedResult.engineRun.frames, baselineResult.engineRun.frames);
  assert.deepEqual(changedResult.engineRun.events, baselineResult.engineRun.events);

  const baselinePrepared = prepareSimulation(definition.scenario);
  const changedPrepared = prepareSimulation(changed);
  baselinePrepared.packageReference = retainedScenarioPackageReference(definition);
  changedPrepared.packageReference = retainedScenarioPackageReference(definition);
  const createdAt = "2026-08-31T00:00:00.000Z";
  const baselineRecord = await createVectorSimulationRecord(baselinePrepared, baselineResult, createdAt);
  const changedRecord = await createVectorSimulationRecord(changedPrepared, changedResult, createdAt);
  assert.notEqual(changedRecord.manifest.recordId, baselineRecord.manifest.recordId);
  const serialized = serializeVectorRecord(changedRecord);
  const opened = await openVectorSimulationRecord(serialized.buffer, serialized.byteLength);
  assert.equal(opened.result.engineRun.scenario.seed, changed.seed);
});
