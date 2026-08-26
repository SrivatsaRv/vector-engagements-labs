import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  AIR_MISSION_SCHEMA_VERSION,
  AirMissionAdmissionError,
  bindAdmittedEnvironmentRunway,
  bindRunwayEvidence,
  compileAirMissionDefinition,
  createDefaultAirMissionDefinition,
  synchronizeScenarioAirMission,
  updateScenarioAirMissionRoutePoint,
} from "../lib/air-mission.ts";
import { CURRENT_COMPILED_MODEL_PACK } from "../lib/engine/weapon-admission.ts";
import { canonicalJson } from "../lib/canonical-json.ts";
import { sha256HexSync } from "../lib/geospatial/digest.ts";
import { createDefaultSpatialPlan } from "../lib/scenario-spatial.ts";
import {
  DEFAULT_SCENARIO,
  prepareSimulation,
  simulate,
  simulateWithCapabilitiesForVerification,
} from "../lib/simulation.ts";
import { getStudyArea } from "../lib/study-areas.ts";
import { admitEnvironmentPack, createEnvironmentSampler } from "../lib/geospatial/environment-pack.ts";
import {
  DEFAULT_SCENARIO_DEFINITION,
  HIGH_ENERGY_CROSSING_CHALLENGE_ID,
  SCENARIO_LIBRARY,
} from "../lib/scenarios.ts";
import { validateSavedScenario } from "../lib/security/saved-run.ts";
import {
  createVectorSimulationRecord,
  decodeColumnarFrames,
  encodeColumnarFrames,
  openVectorSimulationRecord,
  serializeVectorRecord,
} from "../lib/record/vector-record.ts";
import {
  adaptPreparedSimulation,
  admitRuntimeModelPack,
} from "../lib/runtime/model-pack-adapter.ts";
import { runEngine } from "../lib/engine/core.ts";
import { runEngineBackend } from "../lib/engine/backend.ts";
import { createVerificationDeploymentCapabilities } from "../lib/runtime/deployment-capabilities.ts";
import { assertSimulationEventStream } from "../lib/engine/simulation-events.ts";
import { enginePositionToGeographic } from "../lib/scenario-spatial.ts";
import { VECTOR_ENGINE_WASM_BASE64 } from "../lib/engine/generated/vector-engine-wasm.ts";
import {
  GENERIC_TAKEOFF_PERFORMANCE_PROFILE,
  createGenericTakeoffPerformanceScenario,
  nearestRankIndex,
} from "../lib/validation/generic-takeoff-performance.ts";

function runRawRustWasm(scenario) {
  const bytes = Buffer.from(VECTOR_ENGINE_WASM_BASE64, "base64");
  const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes));
  const engine = instance.exports;
  const input = new TextEncoder().encode(JSON.stringify(scenario));
  const pointer = engine.vector_input_reserve(input.byteLength);
  new Uint8Array(engine.memory.buffer, pointer, input.byteLength).set(input);
  const accepted = engine.vector_run_json() === 1;
  const output = new TextDecoder().decode(new Uint8Array(
    engine.memory.buffer,
    engine.vector_output_ptr(),
    engine.vector_output_len(),
  ));
  return { accepted, output };
}

function assertContractParity(actual, expected, path = "root") {
  if (typeof actual === "number" && typeof expected === "number") {
    const tolerance = Math.max(1e-9, Math.max(Math.abs(actual), Math.abs(expected)) * 1e-12);
    assert.ok(
      Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= tolerance,
      `${path}: ${actual} differs from ${expected} beyond ${tolerance}`,
    );
    return;
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    assert.ok(Array.isArray(actual) && Array.isArray(expected), `${path}: array shape mismatch`);
    assert.equal(actual.length, expected.length, `${path}: array length mismatch`);
    actual.forEach((value, index) => assertContractParity(value, expected[index], `${path}[${index}]`));
    return;
  }
  if (actual && expected && typeof actual === "object" && typeof expected === "object") {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${path}: object keys mismatch`);
    for (const key of Object.keys(actual)) {
      assertContractParity(actual[key], expected[key], `${path}.${key}`);
    }
    return;
  }
  assert.deepEqual(actual, expected, path);
}

function interpolateOracle(table, input) {
  if (input <= table.axis[0]) return table.values[0];
  if (input >= table.axis.at(-1)) return table.values.at(-1);
  const upper = table.axis.findIndex((value) => value >= input);
  const lower = upper - 1;
  const fraction = (input - table.axis[lower]) / (table.axis[upper] - table.axis[lower]);
  return table.values[lower] + (table.values[upper] - table.values[lower]) * fraction;
}

function fixture(missionClass = "TACTICAL_INTERCEPT") {
  const scenario = structuredClone(DEFAULT_SCENARIO);
  const area = getStudyArea(scenario.studyAreaId);
  scenario.spatialPlan = createDefaultSpatialPlan({
    studyArea: area,
    rangeM: scenario.range,
    blueAltitudeM: scenario.altitude,
    redAltitudeM: scenario.altitude + scenario.targetDelta,
    blueSpeedMps: scenario.launcherSpeed,
    redSpeedMps: scenario.targetSpeed,
    crossingAngleDeg: scenario.aspect,
  });
  scenario.airMission = createDefaultAirMissionDefinition({
    scenario,
    missionClass,
    modelPack: CURRENT_COMPILED_MODEL_PACK,
  });
  return scenario;
}

const highEnergyCrossingChallenge = SCENARIO_LIBRARY.find(
  (definition) => definition.id === HIGH_ENERGY_CROSSING_CHALLENGE_ID,
);

function highEnergyCrossingCapabilities(backend) {
  return createVerificationDeploymentCapabilities(backend, ["A2A"]);
}

function highEnergyCrossingControl() {
  const scenario = structuredClone(highEnergyCrossingChallenge.scenario);
  scenario.range = 46_000;
  scenario.spatialPlan = createDefaultSpatialPlan({
    studyArea: getStudyArea(scenario.studyAreaId),
    rangeM: scenario.range,
    blueAltitudeM: scenario.altitude,
    redAltitudeM: scenario.altitude + scenario.targetDelta,
    blueSpeedMps: scenario.launcherSpeed,
    redSpeedMps: scenario.targetSpeed,
    crossingAngleDeg: scenario.aspect,
  });
  return synchronizeScenarioAirMission(scenario, CURRENT_COMPILED_MODEL_PACK);
}

function admittedGroundFixture(posture = "RUNWAY") {
  let scenario = fixture("COMBAT_AIR_PATROL");
  const area = getStudyArea("rajasthan-desert");
  scenario = synchronizeScenarioAirMission({
    ...scenario,
    studyAreaId: area.id,
    weatherPresetId: area.defaultWeatherPresetId,
    spatialPlan: createDefaultSpatialPlan({
      studyArea: area,
      rangeM: scenario.range,
      blueAltitudeM: scenario.altitude,
      redAltitudeM: scenario.altitude + scenario.targetDelta,
      blueSpeedMps: scenario.launcherSpeed,
      redSpeedMps: scenario.targetSpeed,
      crossingAngleDeg: scenario.aspect,
    }),
  }, CURRENT_COMPILED_MODEL_PACK);
  const runway = bindAdmittedEnvironmentRunway({
    environmentPack: admitEnvironmentPack({
      studyAreaId: scenario.studyAreaId,
      weatherPresetId: scenario.weatherPresetId,
    }).pack,
    installationId: "iaf-jodhpur",
    runwayId: "runway:iaf-jodhpur:236786",
  });
  const threshold = runway.threshold;
  scenario.airMission.start = {
    posture,
    installationId: "iaf-jodhpur",
    installationSourceId: "iaf-stations-wikipedia",
    runway,
    readinessDelaySeconds: posture === "GROUND_ALERT_QRA" ? 300 : 0,
    taxiFidelity: "ABSTRACTED",
    takeoffCondition: "Runway open and readiness delay elapsed.",
    rejectedTakeoffCondition: "Ground envelope violation before release.",
  };
  scenario.spatialPlan.blue.position = {
    longitude: threshold.longitude,
    latitude: threshold.latitude,
    altitudeM: threshold.elevation.valueM,
    verticalDatum: "MSL",
  };
  scenario.spatialPlan.blue.route[0] = structuredClone(scenario.spatialPlan.blue.position);
  scenario.airMission.flightPlans[0].routePoints[0].position = {
    longitude: threshold.longitude,
    latitude: threshold.latitude,
    altitude: structuredClone(threshold.elevation),
  };
  return scenario;
}

function editRunway(scenario, patch) {
  const { evidence, ...material } = scenario.airMission.start.runway;
  scenario.airMission.start.runway = bindRunwayEvidence(
    { ...material, ...patch },
    { state: evidence.state, sourceId: evidence.sourceId },
  );
}

function resealCompiledGroundDynamics(engineScenario, mutate) {
  const mission = engineScenario.airMission;
  const groundEnvelope = mission.assignment.groundEnvelope;
  const groundDynamics = groundEnvelope.groundDynamics;
  mutate(groundDynamics);
  const groundContent = structuredClone(groundDynamics);
  delete groundContent.digest;
  groundDynamics.digest = sha256HexSync(groundContent);
  const envelopeContent = structuredClone(groundEnvelope);
  delete envelopeContent.digest;
  groundEnvelope.digest = sha256HexSync(envelopeContent);
  mission.authored.assignments[0].groundCompatibility.envelopeDigest = groundEnvelope.digest;
  mission.authoredDigest = sha256HexSync(mission.authored);
  const missionContent = structuredClone(mission);
  delete missionContent.compiledDigest;
  mission.compiledDigest = sha256HexSync(missionContent);
  for (const binding of [
    engineScenario.airMissionRuntime,
    engineScenario.entities.find((entity) => entity.groundOperation).groundOperation,
  ]) {
    binding.missionDigest = mission.compiledDigest;
    binding.groundDynamicsDigest = groundDynamics.digest;
    for (const key of [
      "maximumTakeoffMassKg", "minimumTakeoffFuelKg", "rollingResistanceCoefficient",
      "rotationSpeedMps", "liftoffSpeedMps", "takeoffLiftCoefficient",
      "climboutSpeedMps", "climboutFlightPathAngleRad",
      "enrouteTransitionHeightM",
      "maximumTailwindMps", "maximumCrosswindMps",
    ]) binding[key] = groundDynamics[key];
  }
  return engineScenario;
}

test("all Air mission classes and engagement overlays compile through one content-addressed schema", () => {
  for (const missionClass of ["TACTICAL_INTERCEPT", "COMBAT_AIR_PATROL", "FIGHTER_SWEEP", "ESCORT"]) {
    for (const regime of ["BVR", "WVR_BFM", "UNRESTRICTED_TRANSITION"]) {
      const scenario = fixture(missionClass);
      scenario.airMission.regime = regime;
      const first = prepareSimulation(scenario).engineScenario.airMission;
      const second = prepareSimulation(structuredClone(scenario)).engineScenario.airMission;
      assert.equal(first.schemaVersion, "vector.compiled-air-mission.v1");
      assert.equal(first.authored.schemaVersion, AIR_MISSION_SCHEMA_VERSION);
      assert.equal(first.compiledDigest, second.compiledDigest);
      assert.match(first.authoredDigest, /^[0-9a-f]{64}$/);
    }
  }
});

test("every Air mission class rejects a missing or impossible class-owned field", () => {
  const cases = [
    ["TACTICAL_INTERCEPT", (tasks) => { tasks.initialTrackUncertaintyM = -1; }],
    ["COMBAT_AIR_PATROL", (tasks) => { tasks.onStationCount = tasks.flightSize + 1; }],
    ["FIGHTER_SWEEP", (tasks) => { tasks.targetWindow.endsSeconds = tasks.targetWindow.startsSeconds; }],
    ["ESCORT", (tasks) => { tasks.threatResponseRadiusM = 0; }],
  ];
  for (const [missionClass, mutate] of cases) {
    const scenario = fixture(missionClass);
    mutate(scenario.airMission.tasks);
    assert.throws(
      () => prepareSimulation(scenario),
      (error) => error instanceof AirMissionAdmissionError
        && error.code === "MISSION_CLASS_FIELDS_MISMATCH"
        && error.fieldPath === "tasks",
      missionClass,
    );
  }
});

test("current Air mission v1 rejects unsupported side and unresolved task references", () => {
  const cases = [
    [(mission) => { mission.side = "RED"; }, "MISSION_SIDE_UNSUPPORTED", "side"],
    [(mission) => { mission.flightPlans[0].routePoints[0].taskRef = "deleted-start"; }, "MISSION_REFERENCE_UNKNOWN", "flightPlans[0].routePoints[0].taskRef"],
    [(mission) => { mission.flightPlans[0].routePoints[1].taskRef = "deleted-task"; }, "MISSION_REFERENCE_UNKNOWN", "flightPlans[0].routePoints[1].taskRef"],
  ];
  for (const [mutate, code, fieldPath] of cases) {
    const scenario = fixture("COMBAT_AIR_PATROL");
    mutate(scenario.airMission);
    assert.throws(
      () => prepareSimulation(scenario),
      (error) => error instanceof AirMissionAdmissionError
        && error.code === code
        && error.fieldPath === fieldPath,
      `${code} ${fieldPath}`,
    );
  }
});

test("one flight-plan adapter controls compiled and runtime geometry, transitions, and radii", () => {
  let scenario = fixture("COMBAT_AIR_PATROL");
  const routePoint = scenario.airMission.flightPlans[0].routePoints[1];
  assert.equal(routePoint.taskRef, "COMBAT_AIR_PATROL");
  assert.equal(routePoint.acceptanceRadiusM, scenario.spatialPlan.blue.routeAcceptanceRadiiM[1]);

  const editedLongitude = routePoint.position.longitude + 0.02;
  scenario = updateScenarioAirMissionRoutePoint(scenario, 1, {
    position: { ...routePoint.position, longitude: editedLongitude },
    turnMethod: "FLY_OVER",
  });

  const prepared = prepareSimulation(scenario);
  const runtimeAircraft = prepared.engineScenario.entities.find((entity) => entity.id === "blue-platform-1");
  const recordedRoutePoint = enginePositionToGeographic(
    runtimeAircraft.route[1],
    prepared.engineScenario.geospatial.origin,
  );
  assert.equal(prepared.engineScenario.airMission.flightPlan.routePoints[1].position.longitude, editedLongitude);
  assert.equal(scenario.spatialPlan.blue.route[1].longitude, editedLongitude);
  assert.equal(runtimeAircraft.routePlan.schemaVersion, "vector.route-plan.v2");
  assert.equal(runtimeAircraft.routePlan.waypointTransitions[1], "FLY_OVER");
  assert.equal(runtimeAircraft.routePlan.waypointAcceptanceRadiiM[1], 1);
  assert.ok(Math.abs(recordedRoutePoint.longitudeDeg - editedLongitude) < 1e-9);
});

test("spatial and Air-mission altitude authoring share the three-decimal contract", () => {
  let scenario = fixture();
  scenario.spatialPlan.blue.position.altitudeM = 8_500.123;
  scenario.spatialPlan.blue.route[0].altitudeM = 8_500.123;
  scenario.altitude = 8_500.123;
  scenario = synchronizeScenarioAirMission(scenario, CURRENT_COMPILED_MODEL_PACK);

  assert.equal(
    scenario.airMission.flightPlans[0].routePoints[0].position.altitude.valueM,
    8_500.123,
  );
  assert.doesNotThrow(() => prepareSimulation(scenario));
});

test("compiled model-pack admission rejects unknown stations, rules, and quantities above immutable capacity", () => {
  const cases = [
    [(store) => { store.stationId = "deleted-station"; }, "assignments[0].loadout.stores[0].stationId"],
    [(store) => { store.compatibilityRuleId = "deleted-rule"; }, "assignments[0].loadout.stores[0].compatibilityRuleId"],
    [(store) => { store.quantity = 3; }, "assignments[0].loadout.stores[0]"],
  ];
  for (const [mutate, fieldPath] of cases) {
    const scenario = fixture();
    mutate(scenario.airMission.assignments[0].loadout.stores[0]);
    if (scenario.airMission.assignments[0].loadout.stores[0].quantity === 3) scenario.blueWeaponQuantity = 3;
    assert.throws(
      () => prepareSimulation(scenario),
      (error) => error instanceof AirMissionAdmissionError && error.code === "MISSION_LOADOUT_INVALID" && error.fieldPath === fieldPath,
      fieldPath,
    );
  }
});

test("environment resynchronization regenerates location-owned task geometry and preserves policy", () => {
  let scenario = fixture("COMBAT_AIR_PATROL");
  scenario.airMission.tasks.onStationMinutes = 47;
  scenario.airMission.policies.emission = "SILENT";
  const nextArea = getStudyArea("rajasthan-desert");
  scenario = {
    ...scenario,
    studyAreaId: nextArea.id,
    weatherPresetId: nextArea.defaultWeatherPresetId,
    spatialPlan: createDefaultSpatialPlan({
      studyArea: nextArea,
      rangeM: scenario.range,
      blueAltitudeM: scenario.altitude,
      redAltitudeM: scenario.altitude + scenario.targetDelta,
      blueSpeedMps: scenario.launcherSpeed,
      redSpeedMps: scenario.targetSpeed,
      crossingAngleDeg: scenario.aspect,
    }),
  };
  const synchronized = synchronizeScenarioAirMission(scenario, CURRENT_COMPILED_MODEL_PACK);
  assert.equal(synchronized.airMission.tasks.onStationMinutes, 47);
  assert.equal(synchronized.airMission.policies.emission, "SILENT");
  assert.notDeepEqual(synchronized.airMission.tasks.patrolArea, scenario.airMission.tasks.patrolArea);
  assert.doesNotThrow(() => prepareSimulation(synchronized));
});

test("template, new visible draft, and JSON import compile through the identical adapter", () => {
  const template = structuredClone(DEFAULT_SCENARIO_DEFINITION.scenario);
  const draft = fixture();
  const imported = JSON.parse(JSON.stringify(draft));
  assert.equal(
    prepareSimulation(imported).engineScenario.airMission.compiledDigest,
    prepareSimulation(draft).engineScenario.airMission.compiledDigest,
  );
  assert.equal(
    prepareSimulation(template).engineScenario.airMission.schemaVersion,
    prepareSimulation(draft).engineScenario.airMission.schemaVersion,
  );
});

test("forward migrations freeze every canonical v4 template and exact EnvironmentPack content hash", () => {
  const airMigration = readFileSync(new URL("../db/migrations/013_air_mission_contract.sql", import.meta.url), "utf8");
  const environmentMigration = readFileSync(new URL("../db/migrations/014_environment_pack_runways.sql", import.meta.url), "utf8");
  const groundDynamicsMigration = readFileSync(new URL("../db/migrations/015_generic_ground_dynamics.sql", import.meta.url), "utf8");
  const challengeMigration = readFileSync(new URL("../db/migrations/016_high_energy_crossing_challenge.sql", import.meta.url), "utf8");
  const terminationMigration = readFileSync(new URL("../db/migrations/017_weapon_termination_model.sql", import.meta.url), "utf8");
  assert.equal(
    createHash("sha256").update(environmentMigration).digest("hex"),
    "c40e91b0fbbf2ee5110ae601dba676d2feec1957ebb440db81703c1696cbd227",
    "migration 014 remains the frozen historical EnvironmentPack/runway snapshot",
  );
  assert.equal(
    createHash("sha256").update(groundDynamicsMigration).digest("hex"),
    "ed5a04b32ae3f634c28394a17c98232474a737ce466fca58fc0bca21235fe35b",
    "migration 015 remains the frozen historical ground-dynamics snapshot",
  );
  assert.equal(
    createHash("sha256").update(challengeMigration).digest("hex"),
    "c7105993b3e56b9bee8bac5f71d2133e40bf998b36b99d7066caec50c6f72553",
    "migration 016 remains the frozen historical challenge snapshot",
  );
  for (const definition of SCENARIO_LIBRARY) {
    const migration = terminationMigration;
    const tag = `vector_weapon_termination_${definition.id.replaceAll("-", "_")}`;
    assert.ok(migration.includes(`$${tag}$${canonicalJson(definition)}$${tag}$::jsonb`), definition.id);
    assert.ok(
      migration.includes("INSERT INTO scenario_templates")
        && migration.includes(`'${definition.id}','${definition.version}'`),
      `${definition.id} self-sufficient immutable publication`,
    );
    assert.ok(migration.includes(`$${tag}$::jsonb,'vector.scenario.v4','${sha256HexSync(definition)}'`), definition.id);
    assert.ok(
      migration.includes(`('${definition.id}','${definition.version}','${sha256HexSync(definition)}','${definition.intendedUse.version}','${definition.modelPack.version}','${definition.modelPack.digest}')`),
      `${definition.id} exact readback identity`,
    );
  }
  assert.ok(
    SCENARIO_LIBRARY.every((definition) => definition.version === "1.1.0"),
    "termination authority is published only under new scenario identities",
  );
  assert.match(terminationMigration, /ON CONFLICT \(id,version\) DO NOTHING/);
  assert.doesNotMatch(
    terminationMigration,
    /ON CONFLICT \(id,version\) DO UPDATE/,
    "migration 017 must never overwrite an immutable scenario identity",
  );
  assert.match(airMigration, /WHERE schema_version <> 'vector\.scenario\.v4'/);
  assert.match(environmentMigration, /package->>'environment' NOT LIKE 'Sourced regional terrain and atmosphere%'/);
  assert.match(groundDynamicsMigration, /Generic ground-dynamics migration exact scenario identity\/hash readback failed/);
  assert.match(challengeMigration, /High-energy crossing challenge exact identity\/hash readback failed/);
  assert.match(terminationMigration, /Weapon termination model-pack exact identity readback failed/);
  assert.match(terminationMigration, /Weapon termination scenario exact identity readback failed/);
});

test("the governed high-energy crossing challenge owns exact non-default inputs and explicit nonclaims", () => {
  assert.ok(highEnergyCrossingChallenge, "challenge scenario is missing");
  assert.deepEqual(
    {
      rangeM: highEnergyCrossingChallenge.scenario.range,
      crossingAngleDeg: highEnergyCrossingChallenge.scenario.aspect,
      blueAltitudeMslM: highEnergyCrossingChallenge.scenario.altitude,
      redAltitudeMslM: highEnergyCrossingChallenge.scenario.altitude + highEnergyCrossingChallenge.scenario.targetDelta,
      blueTasMps: highEnergyCrossingChallenge.scenario.launcherSpeed,
      redTasMps: highEnergyCrossingChallenge.scenario.targetSpeed,
      blueFuelPercent: highEnergyCrossingChallenge.scenario.blueFuelPercent,
      redFuelPercent: highEnergyCrossingChallenge.scenario.redFuelPercent,
      blueStores: highEnergyCrossingChallenge.scenario.blueWeaponQuantity,
      redStores: highEnergyCrossingChallenge.scenario.redWeaponQuantity,
      guidance: highEnergyCrossingChallenge.scenario.guidance,
      seed: highEnergyCrossingChallenge.scenario.seed,
      studyAreaId: highEnergyCrossingChallenge.scenario.studyAreaId,
      weatherPresetId: highEnergyCrossingChallenge.scenario.weatherPresetId,
    },
    {
      rangeM: 44_000,
      crossingAngleDeg: 105,
      blueAltitudeMslM: 8_500,
      redAltitudeMslM: 10_000,
      blueTasMps: 270,
      redTasMps: 250,
      blueFuelPercent: 70,
      redFuelPercent: 70,
      blueStores: 2,
      redStores: 2,
      guidance: "direct",
      seed: 42,
      studyAreaId: "north-punjab",
      weatherPresetId: "north-punjab-clear",
    },
  );
  assert.equal(highEnergyCrossingChallenge.intendedUse.id, "vector.intended-use.geometry-teaching");
  assert.equal(highEnergyCrossingChallenge.scenario.airMission.intendedUse, "PUBLIC_EDUCATIONAL");
  assert.equal(highEnergyCrossingChallenge.scenario.airMission.provenance.valueState, "MODEL_ASSUMPTION");
  assert.match(highEnergyCrossingChallenge.scope, /not a target-damage or kill claim/i);
  assert.match(highEnergyCrossingChallenge.presetRationale.conditions, /Sensor, EW, damage, fuze, tactics, and probability of kill remain unavailable/i);
});

test("the challenge completes late with TypeScript/Rust terminal and causal-event parity while the harder control fails", () => {
  assert.ok(highEnergyCrossingChallenge, "challenge scenario is missing");
  const typescript = simulateWithCapabilitiesForVerification(
    highEnergyCrossingChallenge.scenario,
    highEnergyCrossingCapabilities("typescript"),
  );
  const repeated = simulateWithCapabilitiesForVerification(
    highEnergyCrossingChallenge.scenario,
    highEnergyCrossingCapabilities("typescript"),
  );
  const rust = simulateWithCapabilitiesForVerification(
    highEnergyCrossingChallenge.scenario,
    highEnergyCrossingCapabilities("rust-wasm"),
  );
  const control = simulateWithCapabilitiesForVerification(
    highEnergyCrossingControl(),
    highEnergyCrossingCapabilities("typescript"),
  );

  assert.equal(typescript.termination, "weapon_intercept");
  assert.equal(typescript.successful, true);
  assert.ok(typescript.timeOfFlight > 120 && typescript.timeOfFlight < 140);
  assert.ok(typescript.closestApproach > 20 && typescript.closestApproach <= 25);
  assert.ok(typescript.endSpeed > 200);
  assert.equal(typescript.engineRun.diagnostics.nonFiniteStateCount, 0);
  assert.deepEqual(repeated, typescript, "the exact authored seed and package must replay deterministically");

  assert.equal(rust.termination, typescript.termination);
  assert.equal(rust.frames.length, typescript.frames.length);
  assert.deepEqual(rust.engineRun.events, typescript.engineRun.events);
  assertContractParity(rust.engineRun.frames.at(-1), typescript.engineRun.frames.at(-1), "terminalFrame");
  assertContractParity(rust.closestApproach, typescript.closestApproach, "closestApproachM");
  assertContractParity(rust.timeOfFlight, typescript.timeOfFlight, "timeOfFlightSeconds");
  assert.equal(typescript.engineRun.events.items.at(-1)?.payload.termination, "weapon_intercept");
  const terminal = typescript.engineRun.events.items.at(-2)?.payload;
  assert.equal(terminal?.kind, "WEAPON_TERMINATED");
  assert.equal(terminal?.to, "INTERCEPT");
  assert.equal(terminal?.targetEffect, "NOT_MODELLED");

  assert.ok(typescript.pictures.length > 0);
  assert.ok(typescript.pictures.every((picture) =>
    picture.sensorState === "UNSUPPORTED"
      && picture.trackState === "UNSUPPORTED"
      && picture.visible === false
      && !("position" in picture)
  ));

  assert.equal(control.termination, "time_limit");
  assert.equal(control.successful, false);
  assert.equal(control.timeOfFlight, 140);
  assert.ok(control.closestApproach > 25);
});

test("CAP defaults are visible, editable, and causally change compiled patrol and fuel state", () => {
  const scenario = fixture("COMBAT_AIR_PATROL");
  assert.equal(scenario.airMission.tasks.kind, "COMBAT_AIR_PATROL");
  assert.ok(scenario.airMission.tasks.patrolArea.vertices.length >= 3);
  assert.ok(scenario.airMission.tasks.onStationMinutes > 0);
  assert.equal(scenario.airMission.fuel.reservePercent, 20);

  const baseline = prepareSimulation(scenario).engineScenario;
  scenario.airMission.tasks.onStationMinutes += 15;
  scenario.airMission.fuel.reservePercent += 5;
  const changed = prepareSimulation(scenario).engineScenario;
  assert.notEqual(changed.airMission.compiledDigest, baseline.airMission.compiledDigest);
  assert.equal(changed.airMission.authored.fuel.reservePercent, 25);
});

test("route, fuel, loadout and model identities must agree with the authored mission", () => {
  const cases = [
    ["route point", (scenario) => { scenario.airMission.flightPlans[0].routePoints[0].position.longitude += 0.1; }, "MISSION_ROUTE_START_MISMATCH", "flightPlans[0].routePoints[0].position"],
    ["fuel", (scenario) => { scenario.airMission.assignments[0].initialFuelPercent = 101; }, "MISSION_FUEL_INVALID", "assignments[0].initialFuelPercent"],
    ["loadout", (scenario) => { scenario.airMission.assignments[0].loadout.stores[0].quantity = 0; }, "MISSION_LOADOUT_INVALID", "assignments[0].loadout.stores[0].quantity"],
    ["model", (scenario) => { scenario.airMission.assignments[0].aircraftModelPackDigest = "0".repeat(64); }, "MISSION_MODEL_PACK_MISMATCH", "assignments[0].aircraftModelPackDigest"],
  ];
  for (const [name, mutate, code, fieldPath] of cases) {
    const scenario = fixture();
    mutate(scenario);
    assert.throws(
      () => prepareSimulation(scenario),
      (error) => error instanceof AirMissionAdmissionError && error.code === code && error.fieldPath === fieldPath,
      name,
    );
  }
});

test("admitted fuel and loadout edits change compiled fuel, mass, store state, and recorded fuel history", () => {
  const baseline = fixture();
  const baselinePrepared = prepareSimulation(baseline);
  const baselineAircraft = baselinePrepared.engineScenario.entities.find((entity) => entity.id === "blue-platform-1");

  const fuelChanged = structuredClone(baseline);
  fuelChanged.blueFuelPercent = 30;
  fuelChanged.airMission.assignments[0].initialFuelPercent = 30;
  const fuelPrepared = prepareSimulation(fuelChanged);
  const fuelAircraft = fuelPrepared.engineScenario.entities.find((entity) => entity.id === "blue-platform-1");
  assert.ok(fuelAircraft.initial.fuelKg < baselineAircraft.initial.fuelKg);
  assert.ok(fuelAircraft.initial.massKg < baselineAircraft.initial.massKg);
  const fuelResult = simulate(fuelChanged);
  const firstFuel = fuelResult.engineRun.frames[0].entities.find((entity) => entity.id === "blue-platform-1").fuelKg;
  const lastFuel = fuelResult.engineRun.frames.at(-1).entities.find((entity) => entity.id === "blue-platform-1").fuelKg;
  assert.ok(lastFuel < firstFuel);

  const loadoutChanged = structuredClone(baseline);
  loadoutChanged.blueWeaponQuantity = 1;
  loadoutChanged.airMission.assignments[0].loadout.stores[0].quantity = 1;
  const loadoutPrepared = prepareSimulation(loadoutChanged);
  const loadoutAircraft = loadoutPrepared.engineScenario.entities.find((entity) => entity.id === "blue-platform-1");
  assert.equal(loadoutPrepared.engineScenario.entities.filter((entity) => entity.weapon?.launchPlatformId === "blue-platform-1").length, 1);
  assert.ok(loadoutAircraft.initial.massKg < baselineAircraft.initial.massKg);
});

test("airborne and ground/runway starts are first-class and unsupported evidence fails closed", () => {
  const airborne = fixture();
  const compiledAirborne = prepareSimulation(airborne).engineScenario.airMission;
  assert.equal(compiledAirborne.start.entryState, "AIRBORNE");

  const runway = admittedGroundFixture();
  const admitted = structuredClone(runway.airMission.start.runway);
  runway.airMission.start.runway.evidence = { state: "UNKNOWN", sourceId: "UNKNOWN", digest: "UNKNOWN" };
  assert.throws(
    () => prepareSimulation(runway),
    (error) => error instanceof AirMissionAdmissionError && error.code === "MISSION_RUNWAY_EVIDENCE_MISSING" && error.fieldPath === "start.runway.evidence",
  );

  runway.airMission.start.runway = admitted;
  const threshold = runway.airMission.start.runway.threshold;
  runway.spatialPlan.blue.position = {
    longitude: threshold.longitude,
    latitude: threshold.latitude,
    altitudeM: threshold.elevation.valueM,
    verticalDatum: "MSL",
  };
  runway.spatialPlan.blue.route[0] = structuredClone(runway.spatialPlan.blue.position);
  runway.airMission.flightPlans[0].routePoints[0].position = {
    longitude: threshold.longitude,
    latitude: threshold.latitude,
    altitude: structuredClone(threshold.elevation),
  };
  const ground = prepareSimulation(runway).engineScenario;
  assert.equal(ground.airMission.start.entryState, "GROUND");
  assert.deepEqual(
    ground.entities.find((entity) => entity.id === "blue-platform-1").initial.velocity,
    { x: 0, y: 0, z: 0 },
  );
  const groundRun = runEngine({ ...ground, durationSeconds: ground.fixedStepSeconds });
  const firstGroundFrame = groundRun.frames[0].entities.find((entity) => entity.id === "blue-platform-1");
  assert.equal(firstGroundFrame.speedMps, 0);
  const firstGroundGeographic = groundRun.frames[0].geographicPositions.find((item) => item.entityId === "blue-platform-1").position;
  assert.ok(Math.abs(firstGroundGeographic.longitudeDeg - threshold.longitude) < 1e-9);
  assert.ok(Math.abs(firstGroundGeographic.latitudeDeg - threshold.latitude) < 1e-9);
  assert.ok(firstGroundGeographic.altitude.valueM >= threshold.elevation.valueM);
  assert.ok(Math.abs(firstGroundGeographic.altitude.valueM - firstGroundFrame.position.z) < 1e-9);
  const digests = new Set();
  for (const posture of ["PARKING", "RUNWAY", "GROUND_ALERT_QRA"]) {
    const variant = structuredClone(runway);
    variant.airMission.start.posture = posture;
    const compiled = prepareSimulation(variant).engineScenario.airMission;
    assert.equal(compiled.start.posture, posture);
    assert.equal(compiled.start.entryState, "GROUND");
    digests.add(compiled.compiledDigest);
  }
  assert.equal(digests.size, 3);

  const reciprocalScenario = admittedGroundFixture();
  const reciprocal = bindAdmittedEnvironmentRunway({
    environmentPack: admitEnvironmentPack({
      studyAreaId: reciprocalScenario.studyAreaId,
      weatherPresetId: reciprocalScenario.weatherPresetId,
    }).pack,
    installationId: "iaf-jodhpur",
    runwayId: "runway:iaf-jodhpur:236786",
    direction: "RECIPROCAL",
  });
  assert.deepEqual(reciprocal.threshold, admitted.end);
  assert.deepEqual(reciprocal.end, admitted.threshold);
  assert.equal(reciprocal.headingDeg, 224.8);
  reciprocalScenario.airMission.start.runway = reciprocal;
  reciprocalScenario.spatialPlan.blue.position = {
    longitude: reciprocal.threshold.longitude,
    latitude: reciprocal.threshold.latitude,
    altitudeM: reciprocal.threshold.elevation.valueM,
    verticalDatum: "MSL",
  };
  reciprocalScenario.spatialPlan.blue.route[0] = structuredClone(
    reciprocalScenario.spatialPlan.blue.position,
  );
  reciprocalScenario.airMission.flightPlans[0].routePoints[0].position = {
    longitude: reciprocal.threshold.longitude,
    latitude: reciprocal.threshold.latitude,
    altitude: structuredClone(reciprocal.threshold.elevation),
  };
  reciprocalScenario.wind = 0;
  reciprocalScenario.windNorth = 0;
  assert.throws(
    () => prepareSimulation(reciprocalScenario),
    /Runway threshold and admitted DEM elevations conflict outside the declared reconciliation envelope/,
  );
});

test("ground-alert readiness remains causally parked before the admitted release boundary", () => {
  const scenario = admittedGroundFixture("GROUND_ALERT_QRA");
  const prepared = prepareSimulation(scenario).engineScenario;
  const aircraft = prepared.entities.find((entity) => entity.id === "blue-platform-1");
  const run = runEngine({ ...prepared, durationSeconds: 1 });
  const samples = run.frames.map((frame) =>
    frame.entities.find((entity) => entity.id === aircraft.id));

  assert.ok(samples.length > 1, "the causal hold must be observed beyond the initial frame");
  for (const [sampleIndex, sample] of samples.entries()) {
    assert.equal(sample.aircraftOperationalState, "PARKED");
    assert.equal(sample.aircraftOperationalStateValueState, "VALID");
    assert.equal(sample.aircraftMovementValueState, "VALID");
    assert.equal(sample.aircraftMovementUnavailableReason, undefined);
    assert.equal(sample.speedMps, 0);
    assert.deepEqual(sample.velocity, { x: 0, y: 0, z: 0 });
    assert.deepEqual(sample.position, aircraft.initial.position);
    assert.equal(sample.fuelKg, aircraft.initial.fuelKg);
    assert.equal(sample.massKg, aircraft.initial.massKg);
    if (sampleIndex === 0) {
      assert.equal(sample.aircraftControl, undefined);
    } else {
      assert.equal(sample.aircraftControl.limiter, "GROUND_HOLD");
      assert.deepEqual(sample.aircraftControl.requestedVelocityMps, { x: 0, y: 0, z: 0 });
      assert.deepEqual(sample.aircraftControl.acceptedSteeringAccelerationMps2, { x: 0, y: 0, z: 0 });
    }
  }
  const replayed = decodeColumnarFrames(encodeColumnarFrames(run.frames));
  assert.deepEqual(
    replayed.map((frame) => frame.entities.find((entity) => entity.id === aircraft.id)),
    samples,
  );
  const rust = runEngineBackend({ ...structuredClone(prepared), durationSeconds: 1 }, "rust-wasm");
  assertContractParity(
    rust.frames.map((frame) => frame.entities.find((entity) => entity.id === aircraft.id)),
    samples,
  );
});

test("ground-operation admission fails closed with TypeScript and Rust parity", () => {
  const base = prepareSimulation(admittedGroundFixture("GROUND_ALERT_QRA")).engineScenario;
  const cases = [
    ["mission digest", (ground) => { ground.missionDigest = "0".repeat(64); }],
    ["forged release", (ground) => { ground.releaseTimeSeconds += 1; }],
    ["runway digest", (ground) => { ground.runwayEvidenceDigest = "0".repeat(64); }],
    ["start posture", (ground) => { ground.posture = "RUNWAY"; }],
    ["ground dynamics digest", (ground) => { ground.groundDynamicsDigest = "f".repeat(64); }],
    ["nonphysical mass", (ground) => { ground.maximumTakeoffMassKg = 0; }],
    ["nonphysical fuel", (ground) => { ground.minimumTakeoffFuelKg = -1; }],
    ["non-finite rolling force", (ground) => { ground.rollingResistanceCoefficient = Number.NaN; }],
    ["rotation exceeds liftoff", (ground) => { ground.rotationSpeedMps = ground.liftoffSpeedMps + 1; }],
    ["nonphysical lift", (ground) => { ground.takeoffLiftCoefficient = 0; }],
    ["nonphysical climb", (ground) => { ground.climboutFlightPathAngleRad = 0; }],
    ["nonphysical enroute boundary", (ground) => { ground.enrouteTransitionHeightM = 0; }],
    ["nonphysical tailwind", (ground) => { ground.maximumTailwindMps = 0; }],
    ["nonphysical crosswind", (ground) => { ground.maximumCrosswindMps = 0; }],
    ["nonphysical runway", (ground) => { ground.runwayLengthM = 0; }],
    ["unknown authority", (ground) => { ground.hiddenTakeoffSpeedMps = 75; }],
  ];
  for (const [name, mutate] of cases) {
    const scenario = structuredClone(base);
    const aircraft = scenario.entities.find((entity) => entity.id === "blue-platform-1");
    mutate(aircraft.groundOperation);
    for (const backend of ["typescript", "rust-wasm"]) {
      assert.throws(
        () => runEngineBackend(structuredClone(scenario), backend),
        /ground-operation|groundOperation|unknown field|invalid scenario JSON/i,
        `${name} ${backend}`,
      );
    }
  }

  const missingEntityBinding = structuredClone(base);
  delete missingEntityBinding.entities.find(
    (entity) => entity.id === "blue-platform-1",
  ).groundOperation;
  const missingRuntimeBinding = structuredClone(base);
  delete missingRuntimeBinding.airMissionRuntime;
  const hostileScenarios = [
    ["missing entity binding", missingEntityBinding],
    ["missing runtime binding", missingRuntimeBinding],
  ];
  for (const [name, mutate] of [
    ["mission digest", (binding) => { binding.missionDigest = "a".repeat(64); }],
    ["runway digest", (binding) => { binding.runwayEvidenceDigest = "b".repeat(64); }],
    ["posture", (binding) => { binding.posture = "RUNWAY"; }],
    ["release", (binding) => { binding.releaseTimeSeconds += 3; }],
    ["ground dynamics", (binding) => {
      binding.rotationSpeedMps += 2;
      binding.groundDynamicsDigest = "c".repeat(64);
    }],
    ["runway length", (binding) => { binding.runwayLengthM += 1; }],
    ["runway heading", (binding) => { binding.runwayHeadingDegTrue += 1; }],
    ["runway elevation", (binding) => { binding.runwayEndElevationM += 1; }],
  ]) {
    const forgedCompactCopies = structuredClone(base);
    for (const binding of [
      forgedCompactCopies.airMissionRuntime,
      forgedCompactCopies.entities.find(
        (entity) => entity.id === "blue-platform-1",
      ).groundOperation,
    ]) {
      mutate(binding);
    }
    hostileScenarios.push([
      `compact ${name} copies diverge from authoritative Air mission`,
      forgedCompactCopies,
    ]);
  }
  const rawCompactGroundForgery = structuredClone(base);
  for (const binding of [
    rawCompactGroundForgery.airMissionRuntime,
    rawCompactGroundForgery.entities.find((entity) => entity.id === "blue-platform-1").groundOperation,
  ]) {
    binding.rotationSpeedMps += 2;
    binding.groundDynamicsDigest = "c".repeat(64);
  }
  const rawCompactGroundResult = runRawRustWasm(rawCompactGroundForgery);
  assert.equal(rawCompactGroundResult.accepted, false);
  assert.match(rawCompactGroundResult.output, /ground-operation|authoritative/i);
  const forgedMissionAircraft = structuredClone(base);
  forgedMissionAircraft.airMission.assignment.aircraftId = "forged-aircraft";
  hostileScenarios.push([
    "authoritative mission aircraft diverges from runtime source identity",
    forgedMissionAircraft,
  ]);
  const callerSuppliedSeal = structuredClone(base);
  for (const binding of [
    callerSuppliedSeal.airMissionRuntime,
    callerSuppliedSeal.entities.find(
      (entity) => entity.id === "blue-platform-1",
    ).groundOperation,
  ]) {
    binding.posture = "RUNWAY";
    binding.releaseTimeSeconds += 3;
  }
  callerSuppliedSeal.airMission.authoredDigest = sha256HexSync(
    callerSuppliedSeal.airMission.authored,
  );
  const callerMissionContent = structuredClone(callerSuppliedSeal.airMission);
  delete callerMissionContent.compiledDigest;
  callerSuppliedSeal.airMission.compiledDigest = sha256HexSync(callerMissionContent);
  for (const binding of [
    callerSuppliedSeal.airMissionRuntime,
    callerSuppliedSeal.entities.find(
      (entity) => entity.id === "blue-platform-1",
    ).groundOperation,
  ]) {
    binding.missionDigest = callerSuppliedSeal.airMission.compiledDigest;
  }
  callerSuppliedSeal.airMissionAuthority = structuredClone(
    callerSuppliedSeal.airMissionRuntime,
  );
  callerSuppliedSeal.airMissionAircraftSourceObjectId =
    callerSuppliedSeal.airMission.assignment.aircraftId;
  hostileScenarios.push([
    "caller-supplied compact seal cannot replace full mission lineage",
    callerSuppliedSeal,
  ]);
  const rawForgery = runRawRustWasm(callerSuppliedSeal);
  assert.equal(rawForgery.accepted, false);
  assert.match(rawForgery.output, /ground-operation|authoritative/i);
  for (const compiledDigest of ["wrong", "a".repeat(64)]) {
    const digestAttack = structuredClone(base);
    digestAttack.airMission.compiledDigest = compiledDigest;
    const rawDigestAttack = runRawRustWasm(digestAttack);
    assert.equal(rawDigestAttack.accepted, false);
    assert.match(rawDigestAttack.output, /digest|ground-operation/i);
  }
  for (const [name, mutate] of [
    ["schema", (ground) => { ground.schemaVersion = "vector.compiled-aircraft-ground-dynamics.v0"; }],
    ["unknown key", (ground) => { ground.callerAssertedAuthority = true; }],
    ["authority", (ground) => { ground.authority = "CALLER_ASSERTED"; }],
    ["value state", (ground) => { ground.valueState = "UNAVAILABLE"; }],
    ["validity", (ground) => { ground.validity.mechanism = "CALLER_ASSERTED"; }],
    ["evidence", (ground) => { ground.evidenceRefIds = []; }],
    ["limitations", (ground) => { ground.limitationIds = []; }],
    ["crosswind", (ground) => { ground.maximumCrosswindMps = 0; }],
  ]) {
    const fullAuthorityAttack = resealCompiledGroundDynamics(structuredClone(base), mutate);
    const rawFullAuthorityResult = runRawRustWasm(fullAuthorityAttack);
    assert.equal(rawFullAuthorityResult.accepted, false, `raw Rust accepted unsupported ${name}`);
    assert.match(rawFullAuthorityResult.output, /ground-dynamics|Air mission|invalid scenario/i);
    for (const backend of ["typescript", "rust-wasm"]) {
      assert.throws(
        () => runEngineBackend(structuredClone(fullAuthorityAttack), backend),
        /ground-operation|ground dynamics|Air mission|invalid scenario/i,
        `${backend} accepted unsupported ${name}`,
      );
    }
  }
  for (const [name, scenario] of hostileScenarios) {
    for (const backend of ["typescript", "rust-wasm"]) {
      assert.throws(
        () => runEngineBackend(structuredClone(scenario), backend),
        /ground-operation|ground operation|authoritative|Air mission/i,
        `${name} ${backend}`,
      );
    }
  }
});

test("released ground alert enters the admitted runway roll without skipping hold-short", () => {
  const scenario = admittedGroundFixture("GROUND_ALERT_QRA");
  scenario.airMission.start.readinessDelaySeconds = 0;
  const prepared = prepareSimulation(scenario).engineScenario;
  const aircraft = prepared.entities.find((entity) => entity.id === "blue-platform-1");
  const runs = ["typescript", "rust-wasm"].map((backend) =>
    runEngineBackend({ ...structuredClone(prepared), durationSeconds: 1 }, backend));

  for (const run of runs) {
    const samples = run.frames.map((frame) =>
      frame.entities.find((entity) => entity.id === aircraft.id));
    assert.equal(samples[0].aircraftOperationalState, "PARKED");
    assert.ok(samples.slice(1).every((sample) => sample.aircraftOperationalState === "TAKEOFF_ROLL"));
    assert.ok(samples.every((sample) => sample.aircraftMovementValueState === "VALID"));
    assert.ok(samples.slice(1).every((sample) => sample.speedMps > 0));
    assert.ok(samples.slice(1).every((sample) => sample.massKg < aircraft.initial.massKg));
    assert.ok(samples.every((sample) => sample.installedStoreIds.length > 0));
  }
  assertContractParity(
    runs[1].frames.map((frame) => frame.entities.find((entity) => entity.id === aircraft.id)),
    runs[0].frames.map((frame) => frame.entities.find((entity) => entity.id === aircraft.id)),
  );
});

test("fixed-step takeoff transition precedence cannot skip roll or rotation", () => {
  const scenario = structuredClone(
    prepareSimulation(admittedGroundFixture("RUNWAY")).engineScenario,
  );
  resealCompiledGroundDynamics(scenario, (ground) => {
    ground.rotationSpeedMps = 1;
    ground.liftoffSpeedMps = 1;
    ground.climboutSpeedMps = 2;
  });
  const operation = scenario.entities.find((entity) => entity.groundOperation).groundOperation;
  const runwayHeadingRad = (90 - operation.runwayHeadingDegTrue) * Math.PI / 180;
  scenario.events.push({
    id: "transition-precedence-headwind",
    type: "WIND_SHIFT",
    startSeconds: 0,
    durationSeconds: 1,
    vectorMps: {
      x: -120 * Math.cos(runwayHeadingRad),
      y: -120 * Math.sin(runwayHeadingRad),
      z: 0,
    },
  });
  const expected = [
    ["HOLD_SHORT", "TAKEOFF_ROLL"],
    ["TAKEOFF_ROLL", "ROTATE"],
    ["ROTATE", "CLIMBOUT"],
  ];
  for (const backend of ["typescript", "rust-wasm"]) {
    const run = runEngineBackend({ ...structuredClone(scenario), durationSeconds: 1 }, backend);
    const transitions = run.events.items
      .filter((event) => event.payload.kind === "AIRCRAFT_OPERATIONAL_STATE_CHANGED")
      .map((event) => [event.payload.from, event.payload.to]);
    assert.deepEqual(transitions.slice(0, expected.length), expected, backend);
  }
});

test("governed generic runway authority drives causal roll, rotation, and climbout", () => {
  const scenario = admittedGroundFixture("RUNWAY");
  const prepared = prepareSimulation(scenario).engineScenario;
  const aircraft = prepared.entities.find((entity) => entity.id === "blue-platform-1");

  assert.equal(aircraft.groundOperation.schemaVersion, "vector.aircraft-ground-operation.v2");
  assert.equal(aircraft.groundOperation.executionAuthority, "ADMITTED_GENERIC_EDUCATIONAL");
  assert.match(aircraft.groundOperation.groundDynamicsDigest, /^[0-9a-f]{64}$/);

  const runs = ["typescript", "rust-wasm"].map((backend) =>
    runEngineBackend({ ...structuredClone(prepared), durationSeconds: 50 }, backend));
  const histories = runs.map((run) => run.frames.map((frame) =>
    frame.entities.find((entity) => entity.id === aircraft.id)));
  const transitions = runs.map((run) => run.events.items
    .filter((event) => event.payload.kind === "AIRCRAFT_OPERATIONAL_STATE_CHANGED")
    .map((event) => ({
      tick: event.tick,
      frameIndex: event.frameIndex,
      from: event.payload.from,
      to: event.payload.to,
      movementValueState: event.payload.movementValueState,
      groundDynamicsDigest: event.payload.groundDynamicsDigest,
    })));
  const expectedTransitions = [
    { tick: 1, frameIndex: 1, from: "HOLD_SHORT", to: "TAKEOFF_ROLL" },
    { tick: 134, frameIndex: 28, from: "TAKEOFF_ROLL", to: "ROTATE" },
    { tick: 168, frameIndex: 36, from: "ROTATE", to: "CLIMBOUT" },
    { tick: 290, frameIndex: 61, from: "CLIMBOUT", to: "ENROUTE" },
  ].map((transition) => ({
    ...transition,
    movementValueState: "VALID",
    groundDynamicsDigest: aircraft.groundOperation.groundDynamicsDigest,
  }));
  assert.deepEqual(transitions[0], expectedTransitions);
  assert.deepEqual(transitions[1], expectedTransitions);
  const tamperedEvents = structuredClone(runs[0].events.items);
  const rotateEvent = tamperedEvents.find((event) =>
    event.payload.kind === "AIRCRAFT_OPERATIONAL_STATE_CHANGED" && event.payload.to === "ROTATE");
  rotateEvent.payload.to = "CLIMBOUT";
  assert.throws(
    () => assertSimulationEventStream(tamperedEvents, runs[0].frames, runs[0].scenario, runs[0].termination, runs[0].closestApproachM),
    /aircraft operational transition|frame state|duplicate transition/i,
  );

  for (const [historyIndex, samples] of histories.entries()) {
    const states = samples.map((sample) => sample.aircraftOperationalState);
    assert.equal(states[0], "HOLD_SHORT");
    assert.ok(states.includes("TAKEOFF_ROLL"));
    assert.ok(states.includes("ROTATE"));
    assert.ok(states.includes("CLIMBOUT"));
    assert.ok(states.includes("ENROUTE"), `backend ${historyIndex} never reached ENROUTE`);
    assert.ok(samples.slice(1).every((sample) => sample.aircraftMovementValueState === "VALID"));
    assert.ok(samples.at(-1).position.z > samples[0].position.z);
    assert.ok(samples.at(-1).fuelKg < samples[0].fuelKg);
    assert.ok(samples.at(-1).massKg < samples[0].massKg);
    const takeoffSamples = samples.filter((sample) => sample.aircraftOperationalState !== "ENROUTE");
    assert.ok(takeoffSamples.every((sample) =>
      sample.installedStoreIds.length === samples[0].installedStoreIds.length));
    assert.ok(samples.every((sample) =>
      Math.abs(sample.massKg - (aircraft.aircraft.emptyMassKg + sample.fuelKg + sample.storeMassKg)) < 1e-6));
  }
  assertContractParity(histories[1], histories[0]);
  assertContractParity(runs[1].events, runs[0].events);
});

test("generic takeoff has independent force, energy, fuel, climb, convergence, and contrast evidence", () => {
  const authored = admittedGroundFixture("RUNWAY");
  const prepared = prepareSimulation(authored).engineScenario;
  const aircraft = prepared.entities.find((entity) => entity.id === "blue-platform-1");
  const runs = [0.1, 0.05, 0.025].map((fixedStepSeconds) => {
    const run = runEngine({ ...structuredClone(prepared), fixedStepSeconds, durationSeconds: 50 });
    const transitions = run.events.items.filter((event) =>
      event.payload.kind === "AIRCRAFT_OPERATIONAL_STATE_CHANGED");
    const samples = run.frames.map((frame) => frame.entities.find((entity) => entity.id === aircraft.id));
    const climbout = transitions.find((event) => event.payload.to === "CLIMBOUT");
    const enroute = transitions.find((event) => event.payload.to === "ENROUTE");
    assert.ok(climbout && enroute);
    const liftoff = run.frames[climbout.frameIndex].entities.find((entity) => entity.id === aircraft.id);
    const enrouteState = run.frames[enroute.frameIndex].entities.find((entity) => entity.id === aircraft.id);
    const horizontalClimb = Math.hypot(
      enrouteState.position.x - liftoff.position.x,
      enrouteState.position.y - liftoff.position.y,
    );
    const climbGradient = (enrouteState.position.z - liftoff.position.z) / horizontalClimb;
    assert.ok(liftoff.speedMps >= aircraft.groundOperation.liftoffSpeedMps - 1);
    const achievedEnergyJ = 0.5 * liftoff.massKg * liftoff.speedMps ** 2;
    const declaredLiftoffEnergyJ = 0.5 * liftoff.massKg * (aircraft.groundOperation.liftoffSpeedMps - 1) ** 2;
    assert.ok(achievedEnergyJ >= declaredLiftoffEnergyJ);
    assert.ok(Math.abs(climbGradient - Math.tan(aircraft.groundOperation.climboutFlightPathAngleRad)) < 0.002);
    assert.ok(samples.every((sample) =>
      Math.abs(sample.massKg - (aircraft.aircraft.emptyMassKg + sample.fuelKg + sample.storeMassKg)) < 1e-6));
    return {
      fixedStepSeconds,
      liftoffTimeSeconds: climbout.tick * fixedStepSeconds,
      liftoffDistanceM: Math.hypot(
        liftoff.position.x - aircraft.initial.position.x,
        liftoff.position.y - aircraft.initial.position.y,
      ),
    };
  });
  assert.ok(Math.max(...runs.map((run) => run.liftoffTimeSeconds)) - Math.min(...runs.map((run) => run.liftoffTimeSeconds)) <= 0.2);
  assert.ok(Math.max(...runs.map((run) => run.liftoffDistanceM)) - Math.min(...runs.map((run) => run.liftoffDistanceM)) <= 15);

  const baseline = runEngine({ ...structuredClone(prepared), durationSeconds: 20 });
  const first = baseline.frames[1].entities.find((entity) => entity.id === aircraft.id);
  const firstDistance = Math.hypot(
    first.position.x - aircraft.initial.position.x,
    first.position.y - aircraft.initial.position.y,
  );
  const environment = createEnvironmentSampler(admitEnvironmentPack({
    studyAreaId: authored.studyAreaId,
    weatherPresetId: authored.weatherPresetId,
    effectiveWeather: {
      temperatureOffsetC: authored.temperatureOffset,
      windEastMps: authored.wind,
      windNorthMps: authored.windNorth,
    },
  }).pack).sample({
    eastM: aircraft.initial.position.x,
    northM: aircraft.initial.position.y,
    upM: aircraft.initial.position.z,
    modelTimeSeconds: 0,
  });
  const dt = prepared.fixedStepSeconds;
  const thrustN = interpolateOracle(aircraft.aircraft.thrustByThrottle, 1);
  const fuelCoefficient = interpolateOracle(aircraft.aircraft.fuelFlowByThrottle, 1);
  const expectedFuelDeltaKg = thrustN * fuelCoefficient * dt;
  const expectedMassKg = aircraft.initial.massKg - expectedFuelDeltaKg;
  const initialAirspeedMps = Math.hypot(environment.windEnuMps.x, environment.windEnuMps.y);
  const liftN = 0.5 * environment.atmosphere.densityKgM3 * initialAirspeedMps ** 2
    * aircraft.aircraft.referenceAreaM2 * aircraft.groundOperation.takeoffLiftCoefficient;
  const dragCoefficient = interpolateOracle(
    aircraft.aircraft.zeroLiftDragByMach,
    initialAirspeedMps / environment.atmosphere.speedOfSoundMps,
  ) + interpolateOracle(aircraft.aircraft.inducedDragByAngleOfAttackRad, 0)
    * aircraft.groundOperation.takeoffLiftCoefficient ** 2;
  const dragN = 0.5 * environment.atmosphere.densityKgM3 * initialAirspeedMps ** 2
    * aircraft.aircraft.referenceAreaM2 * dragCoefficient;
  const rollingResistanceN = aircraft.groundOperation.rollingResistanceCoefficient
    * Math.max(0, expectedMassKg * prepared.environment.gravityMps2 - liftN);
  const expectedAccelerationMps2 = (thrustN - dragN - rollingResistanceN) / expectedMassKg;
  const expectedSpeedMps = expectedAccelerationMps2 * dt;
  assert.ok(Math.abs((aircraft.initial.fuelKg - first.fuelKg) - expectedFuelDeltaKg) < 1e-12);
  assert.ok(Math.abs(first.massKg - expectedMassKg) < 1e-9);
  assert.ok(Math.abs(first.speedMps - expectedSpeedMps) < 1e-9);
  assert.ok(Math.abs(firstDistance - expectedSpeedMps * dt) < 1e-9);

  const contrastScenarios = [
    ["lower fuel mass", (scenario) => {
      scenario.blueFuelPercent = 60;
      scenario.airMission.assignments[0].initialFuelPercent = 60;
    }],
    ["one installed store", (scenario) => {
      scenario.blueWeaponQuantity = 1;
      scenario.airMission.assignments[0].loadout.stores[0].quantity = 1;
      scenario.airMission.fuel.weaponRtbThreshold = 1;
    }],
    ["effective wind", (scenario) => {
      scenario.wind = 2;
      scenario.windNorth = -1;
    }],
  ];
  const baselineRotateTick = baseline.events.items.find((event) =>
    event.payload.kind === "AIRCRAFT_OPERATIONAL_STATE_CHANGED" && event.payload.to === "ROTATE").tick;
  for (const [name, mutate] of contrastScenarios) {
    const scenario = admittedGroundFixture("RUNWAY");
    mutate(scenario);
    const run = runEngine({ ...prepareSimulation(scenario).engineScenario, durationSeconds: 20 });
    const rotateTick = run.events.items.find((event) =>
      event.payload.kind === "AIRCRAFT_OPERATIONAL_STATE_CHANGED" && event.payload.to === "ROTATE").tick;
    assert.notEqual(rotateTick, baselineRotateTick, name);
  }
});

test("governed takeoff failures have stable TS and direct Rust causes", () => {
  const cases = [
    ["fuel exhaustion", (ground, scenario) => {
      const aircraft = scenario.entities.find((entity) => entity.id === "blue-platform-1");
      ground.minimumTakeoffFuelKg = aircraft.initial.fuelKg - 0.1;
    }, /GROUND_TAKEOFF_FUEL_EXHAUSTED/],
    ["insufficient force", (ground) => {
      ground.rollingResistanceCoefficient = 0.99;
    }, /GROUND_TAKEOFF_FORCE_INSUFFICIENT/],
    ["runway overrun", (ground) => {
      ground.takeoffLiftCoefficient = 0.00001;
    }, /GROUND_RUNWAY_OVERRUN/],
    ["effective adverse wind", (ground) => {
      ground.maximumTailwindMps = 0.001;
      ground.maximumCrosswindMps = 0.001;
    }, /GROUND_WIND_ENVELOPE_EXCEEDED/],
  ];
  for (const [name, mutate, expected] of cases) {
    const scenario = structuredClone(prepareSimulation(admittedGroundFixture("RUNWAY")).engineScenario);
    resealCompiledGroundDynamics(scenario, (ground) => mutate(ground, scenario));
    for (const backend of ["typescript", "rust-wasm"]) {
      assert.throws(
        () => runEngineBackend(structuredClone(scenario), backend),
        expected,
        `${name} ${backend}`,
      );
    }
    const raw = runRawRustWasm(scenario);
    assert.equal(raw.accepted, false, `${name} raw Rust acceptance`);
    assert.match(raw.output, expected, `${name} raw Rust cause`);
  }
});

test("generic takeoff performance profile keeps warmup, sampling, percentile, and isolation semantics", () => {
  const profile = GENERIC_TAKEOFF_PERFORMANCE_PROFILE;
  assert.equal(Object.isFrozen(profile), true);
  assert.equal(Object.isFrozen(profile.backends), true);
  assert.equal(profile.warmupRunsPerBackend, 3);
  assert.equal(profile.measuredRunsPerBackend, 20);
  assert.equal(nearestRankIndex(profile.measuredRunsPerBackend, profile.percentile), 18);
  assert.equal(profile.maximumP95Ms, 100);
  assert.equal(profile.maximumFramesPerRun, 300);
  assert.deepEqual(profile.backends, ["typescript", "rust-wasm"]);
  assert.equal(profile.durationSeconds, 50);
  assert.equal(createGenericTakeoffPerformanceScenario().airMission.start.posture, "RUNWAY");
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(
    packageJson.scripts["performance:generic-takeoff:verify"],
    "tsx scripts/benchmark-generic-takeoff.ts",
  );
  const makefile = readFileSync(new URL("../Makefile", import.meta.url), "utf8");
  assert.match(
    makefile,
    /performance-local:\n\tnpm run reference-aam:performance\n\tnpm run performance:generic-takeoff:verify\n/,
  );
});

test("governed runway lifecycle survives the complete VSR write and read boundary", async () => {
  const scenario = admittedGroundFixture("RUNWAY");
  const prepared = prepareSimulation(scenario);
  const result = simulate(scenario);
  const record = await createVectorSimulationRecord(
    prepared,
    result,
    "2026-08-26T00:00:00.000Z",
  );
  const serialized = serializeVectorRecord(record);
  const opened = await openVectorSimulationRecord(
    serialized.buffer,
    serialized.byteLength,
  );
  const aircraftId = prepared.engineScenario.entities.find(
    (entity) => entity.groundOperation,
  ).id;
  const samples = opened.result.engineRun.frames.map((frame) =>
    frame.entities.find((entity) => entity.id === aircraftId),
  );
  for (const projected of [result, opened.result]) {
    assert.ok(projected.frames.length > 1);
    assert.ok(projected.frames.every((frame) => frame.primaryEntityId === aircraftId));
    assert.ok(projected.frames.every((frame) => frame.primaryEntityRole === "AIRCRAFT"));
    assert.ok(projected.frames.every((frame) =>
      frame.entities.every((entity) => entity.id !== projected.engineRun.primaryWeaponId)));
    assert.ok(projected.frames.every((frame) => {
      const heldAircraft = frame.entities.find((entity) => entity.id === aircraftId);
      return frame.interceptor.x === heldAircraft.position.x &&
        frame.interceptor.y === heldAircraft.position.y &&
        frame.interceptor.z === heldAircraft.position.z &&
        frame.speed === heldAircraft.speedMps;
    }));
  }
  assert.ok(["HOLD_SHORT", "TAKEOFF_ROLL", "ROTATE", "CLIMBOUT", "ENROUTE"].every((state) =>
    samples.some((sample) => sample.aircraftOperationalState === state)));
  assert.ok(samples.every((sample) => sample.aircraftMovementValueState === "VALID"));
  assert.ok(samples.every((sample) => sample.aircraftMovementUnavailableReason === undefined));
  assertContractParity(opened.result.engineRun.frames, result.engineRun.frames);
  assert.deepEqual(opened.result.engineRun.events, result.engineRun.events);
  assert.deepEqual(
    opened.result.engineRun.events.items
      .filter((event) => event.payload.kind === "AIRCRAFT_OPERATIONAL_STATE_CHANGED")
      .map((event) => [event.tick, event.frameIndex, event.payload.from, event.payload.to]),
    [[1, 1, "HOLD_SHORT", "TAKEOFF_ROLL"], [134, 28, "TAKEOFF_ROLL", "ROTATE"], [168, 36, "ROTATE", "CLIMBOUT"], [290, 61, "CLIMBOUT", "ENROUTE"]],
  );
});

test("unknown schema, dangling references, AGL without terrain, impossible time and reserve fail closed", () => {
  const cases = [
    [(mission) => { mission.schemaVersion = "vector.air-mission.v0"; }, "MISSION_SCHEMA_UNSUPPORTED"],
    [(mission) => { mission.flightPlans[0].legs[0].toPointId = "missing"; }, "MISSION_REFERENCE_UNKNOWN"],
    [(mission) => { mission.flightPlans[0].routePoints[1].position.altitude.datum = "AGL"; }, "MISSION_TERRAIN_REQUIRED"],
    [(mission) => { mission.flightPlans[0].routePoints[1].constraint.etaSeconds = 1; }, "MISSION_TIME_CONSTRAINT_IMPOSSIBLE"],
    [(mission) => { mission.fuel.reservePercent = mission.assignments[0].initialFuelPercent + 1; }, "MISSION_FUEL_RESERVE_INSUFFICIENT"],
  ];
  for (const [mutate, code] of cases) {
    const scenario = fixture();
    mutate(scenario.airMission);
    assert.throws(
      () => prepareSimulation(scenario),
      (error) => error instanceof AirMissionAdmissionError && error.code === code,
      code,
    );
  }
});

test("strict schema and geographic boundaries reject nested authority, duplicate/zero legs, and invalid coordinates", () => {
  const cases = [
    [(mission) => { mission.flightPlans[0].routePoints[0].constraint.decorativeAuthority = true; }, "MISSION_SCHEMA_INVALID", "flightPlans[0].routePoints[0].constraint"],
    [(mission) => { mission.flightPlans[0].routePoints[0].position.longitude = Number.NaN; }, "MISSION_ROUTE_INVALID", "flightPlans[0].routePoints[0].position"],
    [(mission) => { mission.flightPlans[0].routePoints[1].position.longitude = 181; }, "MISSION_ROUTE_INVALID", "flightPlans[0].routePoints[1].position"],
    [(mission) => { mission.flightPlans[0].routePoints[1].position = structuredClone(mission.flightPlans[0].routePoints[0].position); }, "MISSION_ROUTE_INVALID", "flightPlans[0].routePoints[1].position"],
    [(mission) => { mission.flightPlans[0].legs = []; }, "MISSION_ROUTE_INVALID", "flightPlans[0].legs"],
    [(mission) => { mission.assignedTargetIds = ["red-object-1", "red-object-1"]; }, "MISSION_REFERENCE_UNKNOWN", "assignedTargetIds"],
    [(mission) => { mission.tasks.defendedArea.vertices[2] = structuredClone(mission.tasks.defendedArea.vertices[1]); mission.tasks.defendedArea.vertices[3] = structuredClone(mission.tasks.defendedArea.vertices[0]); }, "MISSION_AREA_INVALID", "tasks.defendedArea"],
  ];
  for (const [mutate, code, fieldPath] of cases) {
    const scenario = fixture();
    mutate(scenario.airMission);
    assert.throws(
      () => prepareSimulation(scenario),
      (error) => error instanceof AirMissionAdmissionError && error.code === code && error.fieldPath === fieldPath,
      `${code} ${fieldPath}`,
    );
  }
});

test("Mach constraints compile deterministically into a causal airborne entry speed", () => {
  const scenario = fixture();
  const point = scenario.airMission.flightPlans[0].routePoints[0];
  const altitudeM = point.position.altitude.valueM;
  const temperatureK = altitudeM <= 11_000 ? 288.15 - 0.0065 * altitudeM : 216.65;
  const mach = 0.82;
  const tasMps = mach * Math.sqrt(1.4 * 287.05 * temperatureK);
  scenario.spatialPlan.blue.speedMps = tasMps;
  scenario.launcherSpeed = tasMps;
  for (const routePoint of scenario.airMission.flightPlans[0].routePoints) {
    const routeAltitudeM = routePoint.position.altitude.valueM;
    const routeTemperatureK = routeAltitudeM <= 11_000 ? 288.15 - 0.0065 * routeAltitudeM : 216.65;
    routePoint.constraint.speed = { kind: "MACH", value: tasMps / Math.sqrt(1.4 * 287.05 * routeTemperatureK) };
  }
  const compiled = prepareSimulation(scenario).engineScenario;
  assert.ok(Math.abs(compiled.airMission.start.initialSpeedMps - tasMps) < 1e-9);
  const velocity = compiled.entities.find((entity) => entity.id === "blue-platform-1").initial.velocity;
  assert.ok(Math.abs(Math.hypot(velocity.x, velocity.y, velocity.z) - tasMps) < 1e-9);
});

test("runway identity, evidence, state, dimensions, surface, heading, and wind fail closed", () => {
  const cases = [
    [(scenario) => { scenario.airMission.start.runway.evidence.digest = "0".repeat(64); }, "MISSION_RUNWAY_EVIDENCE_MISSING", "start.runway.evidence.digest"],
    [(scenario) => { editRunway(scenario, { operationalState: "CLOSED" }); }, "MISSION_RUNWAY_INVALID", "start.runway.operationalState"],
    [(scenario) => { scenario.airMission.assignments[0].groundCompatibility.envelopeDigest = "0".repeat(64); }, "MISSION_RUNWAY_INVALID", "assignments[0].groundCompatibility"],
    [(scenario) => { editRunway(scenario, { surface: "UNPAVED" }); }, "MISSION_RUNWAY_INVALID", "start.runway.surface"],
    [(scenario) => { editRunway(scenario, { headingDeg: 180 }); }, "MISSION_RUNWAY_INVALID", "start.runway.headingDeg"],
    [(scenario) => {
      const heading = scenario.airMission.start.runway.headingDeg * Math.PI / 180;
      scenario.wind = Math.round(50 * Math.sin(heading) * 1_000) / 1_000;
      scenario.windNorth = Math.round(50 * Math.cos(heading) * 1_000) / 1_000;
    }, "MISSION_RUNWAY_INVALID", "start.runway.headingDeg"],
    [(scenario) => {
      const heading = scenario.airMission.start.runway.headingDeg * Math.PI / 180;
      scenario.wind = Math.round(50 * Math.cos(heading) * 1_000) / 1_000;
      scenario.windNorth = Math.round(-50 * Math.sin(heading) * 1_000) / 1_000;
    }, "MISSION_RUNWAY_INVALID", "start.runway.headingDeg"],
  ];
  for (const [mutate, code, fieldPath] of cases) {
    const scenario = admittedGroundFixture();
    mutate(scenario);
    assert.throws(
      () => prepareSimulation(scenario),
      (error) => error instanceof AirMissionAdmissionError && error.code === code && error.fieldPath === fieldPath,
      `${code} ${fieldPath}`,
    );
  }

  const crossInstallation = admittedGroundFixture();
  const runway = crossInstallation.airMission.start.runway;
  const material = { ...runway, threshold: { ...runway.threshold, longitude: runway.threshold.longitude + 0.01 } };
  delete material.evidence;
  crossInstallation.airMission.start.runway = bindRunwayEvidence(material, { state: runway.evidence.state, sourceId: runway.evidence.sourceId });
  crossInstallation.spatialPlan.blue.position.longitude += 0.01;
  crossInstallation.spatialPlan.blue.route[0].longitude += 0.01;
  crossInstallation.airMission.flightPlans[0].routePoints[0].position.longitude += 0.01;
  assert.throws(
    () => prepareSimulation(crossInstallation),
    (error) => error instanceof AirMissionAdmissionError && error.code === "MISSION_RUNWAY_INVALID" && ["start.runway", "start.runway.lengthM"].includes(error.fieldPath),
  );
});

test("ground-start tailwind combines sourced atmosphere wind with authored modifiers", () => {
  const scenario = admittedGroundFixture();
  scenario.wind = 2;
  scenario.windNorth = 2;
  const headingRad = scenario.airMission.start.runway.headingDeg * Math.PI / 180;
  const authoredOnlyTailwind = scenario.wind * Math.sin(headingRad)
    + scenario.windNorth * Math.cos(headingRad);
  assert.ok(authoredOnlyTailwind < 5, "the authored modifier alone must remain inside the envelope");
  assert.throws(
    () => prepareSimulation(scenario),
    (error) => error instanceof AirMissionAdmissionError
      && error.code === "MISSION_RUNWAY_INVALID"
      && error.fieldPath === "start.runway.headingDeg"
      && /Tailwind exceeds/u.test(error.message),
    "the sourced grid plus authored modifier must reject at the runway admission boundary",
  );
});

test("compilation is pure and does not accept a decorative UI-only mission object", () => {
  const scenario = fixture();
  const mission = structuredClone(scenario.airMission);
  const context = {
    scenario,
    modelPack: CURRENT_COMPILED_MODEL_PACK,
    environmentPackDigest: prepareSimulation({ ...scenario, airMission: undefined }).engineScenario.geospatial.environmentPack.digest,
  };
  const compiled = compileAirMissionDefinition(mission, context);
  mission.label = "decorative mutation";
  assert.equal(compiled.compiledDigest, compileAirMissionDefinition(scenario.airMission, context).compiledDigest);
  assert.throws(
    () => compileAirMissionDefinition(mission, context),
    (error) => error instanceof AirMissionAdmissionError && error.code === "MISSION_SCHEMA_INVALID",
  );
});

test("missions without a transfer plan retain the exact legacy v1 digest shape", () => {
  const prepared = prepareSimulation(structuredClone(DEFAULT_SCENARIO_DEFINITION.scenario));
  const compiled = prepared.engineScenario.airMission;
  assert.equal(Object.hasOwn(compiled.assignment, "storeTransfers"), false);
  assert.equal(Object.hasOwn(compiled.assignment, "storeTransferAuthorityDigest"), false);
  assert.equal(
    compiled.compiledDigest,
    "1e02ba55a111bd4fad3cda1df39142e78222efe831d84fdfc9fb858a3560036f",
  );
});

test("saved-run admission preserves mission identity and never invents missing mission intent", () => {
  const scenario = structuredClone(DEFAULT_SCENARIO_DEFINITION.scenario);
  const admitted = validateSavedScenario(scenario, DEFAULT_SCENARIO_DEFINITION);
  assert.deepEqual(admitted.airMission, scenario.airMission);
  delete scenario.airMission;
  assert.throws(
    () => validateSavedScenario(scenario, DEFAULT_SCENARIO_DEFINITION),
    (error) => error.code === "MISSION_SCHEMA_INVALID" && error.fieldPath === "airMission",
  );
});

test("Worker and server admission return the same stable Air mission error", async () => {
  const invalid = fixture();
  invalid.airMission.assignments[0].initialFuelPercent = 101;
  assert.throws(
    () => validateSavedScenario(invalid, DEFAULT_SCENARIO_DEFINITION),
    (error) => error.code === "MISSION_FUEL_INVALID" && error.fieldPath === "assignments[0].initialFuelPercent",
  );

  const prepared = prepareSimulation(fixture());
  prepared.scenario.airMission.assignments[0].initialFuelPercent = 101;
  const workerPack = await adaptPreparedSimulation(prepared);
  await assert.rejects(
    () => admitRuntimeModelPack(workerPack),
    (error) => error instanceof AirMissionAdmissionError && error.code === "MISSION_FUEL_INVALID" && error.fieldPath === "assignments[0].initialFuelPercent",
  );
});

test("frontend-derived mission input and server/Worker admission share the three-decimal scalar ceiling", async () => {
  const invalid = fixture();
  invalid.airMission.fuel.reservePercent = 12.3456;
  assert.throws(
    () => validateSavedScenario(invalid, DEFAULT_SCENARIO_DEFINITION),
    (error) => error.code === "MISSION_NUMERIC_PRECISION_INVALID"
      && error.fieldPath === "fuel.reservePercent",
  );

  const prepared = prepareSimulation(fixture());
  prepared.scenario.airMission.fuel.reservePercent = 12.3456;
  const workerPack = await adaptPreparedSimulation(prepared);
  await assert.rejects(
    () => admitRuntimeModelPack(workerPack),
    (error) => error instanceof AirMissionAdmissionError
      && error.code === "MISSION_NUMERIC_PRECISION_INVALID"
      && error.fieldPath === "fuel.reservePercent",
  );
});

test("VSR and report bind exact authored and compiled mission lineage on readback", async () => {
  const scenario = fixture("COMBAT_AIR_PATROL");
  const prepared = prepareSimulation(scenario);
  const result = simulate(scenario);
  const record = await createVectorSimulationRecord(prepared, result, "2026-08-25T00:00:00.000Z");
  assert.equal(record.manifest.airMission.compiledDigest, prepared.engineScenario.airMission.compiledDigest);
  const serialized = serializeVectorRecord(record);
  const opened = await openVectorSimulationRecord(serialized.buffer, serialized.byteLength);
  assert.equal(opened.manifest.airMission.authoredDigest, prepared.engineScenario.airMission.authoredDigest);
  assert.equal(opened.result.engineRun.scenario.airMission.compiledDigest, prepared.engineScenario.airMission.compiledDigest);
  assert.equal(opened.report.airMission.compiledDigest, prepared.engineScenario.airMission.compiledDigest);
});
