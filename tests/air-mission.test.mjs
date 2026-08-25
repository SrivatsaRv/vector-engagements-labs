import assert from "node:assert/strict";
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
import { DEFAULT_SCENARIO, prepareSimulation, simulate } from "../lib/simulation.ts";
import { getStudyArea } from "../lib/study-areas.ts";
import { admitEnvironmentPack } from "../lib/geospatial/environment-pack.ts";
import { DEFAULT_SCENARIO_DEFINITION, SCENARIO_LIBRARY } from "../lib/scenarios.ts";
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
import { enginePositionToGeographic } from "../lib/scenario-spatial.ts";
import { VECTOR_ENGINE_WASM_BASE64 } from "../lib/engine/generated/vector-engine-wasm.ts";

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
  for (const definition of SCENARIO_LIBRARY) {
    const tag = `vector_environment_${definition.id.replaceAll("-", "_")}`;
    assert.ok(environmentMigration.includes(`package=$${tag}$${canonicalJson(definition)}$${tag}$::jsonb`), definition.id);
    assert.ok(environmentMigration.includes(`content_hash='${sha256HexSync(definition)}' WHERE id='${definition.id}' AND version='${definition.version}' AND schema_version='vector.scenario.v4'`), definition.id);
  }
  assert.match(airMigration, /WHERE schema_version <> 'vector\.scenario\.v4'/);
  assert.match(environmentMigration, /package->>'environment' NOT LIKE 'Sourced regional terrain and atmosphere%'/);
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
  for (const sample of samples) {
    assert.equal(sample.aircraftOperationalState, "PARKED");
    assert.equal(sample.aircraftOperationalStateValueState, "VALID");
    assert.equal(sample.aircraftMovementValueState, "UNAVAILABLE");
    assert.equal(sample.aircraftMovementUnavailableReason, "GROUND_DYNAMICS_MODEL_UNAVAILABLE");
    assert.equal(sample.speedMps, 0);
    assert.deepEqual(sample.velocity, { x: 0, y: 0, z: 0 });
    assert.deepEqual(sample.position, aircraft.initial.position);
    assert.equal(sample.fuelKg, aircraft.initial.fuelKg);
    assert.equal(sample.massKg, aircraft.initial.massKg);
    assert.equal(sample.aircraftControl, undefined);
  }
  const replayed = decodeColumnarFrames(encodeColumnarFrames(run.frames));
  assert.deepEqual(
    replayed.map((frame) => frame.entities.find((entity) => entity.id === aircraft.id)),
    samples,
  );
  const rust = runEngineBackend({ ...structuredClone(prepared), durationSeconds: 1 }, "rust-wasm");
  assert.deepEqual(
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
    ["unknown authority", (ground) => { ground.hiddenTakeoffSpeedMps = 75; }],
  ];
  for (const [name, mutate] of cases) {
    const scenario = structuredClone(base);
    const aircraft = scenario.entities.find((entity) => entity.id === "blue-platform-1");
    mutate(aircraft.groundOperation);
    for (const backend of ["typescript", "rust-wasm"]) {
      assert.throws(
        () => runEngineBackend(structuredClone(scenario), backend),
        /ground-operation|groundOperation|unknown field/i,
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

test("released ground alert advances only to hold-short while movement authority is unavailable", () => {
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
    assert.ok(samples.slice(1).every((sample) => sample.aircraftOperationalState === "HOLD_SHORT"));
    assert.ok(samples.every((sample) => sample.aircraftMovementValueState === "UNAVAILABLE"));
    assert.ok(samples.every((sample) => sample.speedMps === 0));
    assert.ok(samples.every((sample) => sample.massKg === aircraft.initial.massKg));
    assert.ok(samples.every((sample) => sample.installedStoreIds.length > 0));
  }
  assert.deepEqual(
    runs[1].frames.map((frame) => frame.entities.find((entity) => entity.id === aircraft.id)),
    runs[0].frames.map((frame) => frame.entities.find((entity) => entity.id === aircraft.id)),
  );
});

test("ground-held runway state survives the complete VSR write and read boundary", async () => {
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
    assert.ok(projected.frames.every((frame) => frame.primaryEntityRole === "GROUND_HELD_AIRCRAFT"));
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
  assert.ok(samples.every((sample) => sample.aircraftOperationalState === "HOLD_SHORT"));
  assert.ok(samples.every((sample) => sample.aircraftMovementValueState === "UNAVAILABLE"));
  assert.ok(samples.every((sample) => sample.aircraftMovementUnavailableReason === "GROUND_DYNAMICS_MODEL_UNAVAILABLE"));
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
    [(scenario) => { scenario.wind = 8; }, "MISSION_RUNWAY_INVALID", "start.runway.headingDeg"],
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
