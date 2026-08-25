import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  AIR_MISSION_SCHEMA_VERSION,
  AirMissionAdmissionError,
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
import { localFrameToGeographic } from "../lib/geospatial/geodesy.ts";
import { DEFAULT_SCENARIO, prepareSimulation, simulate } from "../lib/simulation.ts";
import { getStudyArea } from "../lib/study-areas.ts";
import { DEFAULT_SCENARIO_DEFINITION, SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { validateSavedScenario } from "../lib/security/saved-run.ts";
import {
  createVectorSimulationRecord,
  openVectorSimulationRecord,
  serializeVectorRecord,
} from "../lib/record/vector-record.ts";
import {
  adaptPreparedSimulation,
  admitRuntimeModelPack,
} from "../lib/runtime/model-pack-adapter.ts";

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
  const scenario = fixture("COMBAT_AIR_PATROL");
  const threshold = { longitude: 75.633227, latitude: 32.236929, elevation: { valueM: 310, datum: "MSL" } };
  scenario.airMission.start = {
    posture,
    installationId: "iaf-pathankot",
    installationSourceId: "iaf-stations-wikipedia",
    runway: bindRunwayEvidence({
      id: "educational-runway-fixture",
      threshold,
      end: { longitude: 75.654427, latitude: 32.236929, elevation: { valueM: 310, datum: "MSL" } },
      headingDeg: 90,
      lengthM: 2_000,
      widthM: 40,
      surface: "PAVED",
      operationalState: "OPEN",
    }, { state: "MODEL_ASSUMPTION", sourceId: "educational-runway-fixture" }),
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
  const recordedRoutePoint = localFrameToGeographic(
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

test("forward migration freezes every canonical v4 template and exact content hash", () => {
  const migration = readFileSync(new URL("../db/migrations/013_air_mission_contract.sql", import.meta.url), "utf8");
  for (const definition of SCENARIO_LIBRARY) {
    const tag = `vector_${definition.id.replaceAll("-", "_")}`;
    assert.ok(migration.includes(`package=$${tag}$${canonicalJson(definition)}$${tag}$::jsonb`), definition.id);
    assert.ok(migration.includes(`content_hash='${sha256HexSync(definition)}' WHERE id='${definition.id}' AND version='${definition.version}' AND schema_version='vector.scenario.v3'`), definition.id);
  }
  assert.match(migration, /WHERE schema_version <> 'vector\.scenario\.v4'/);
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

  const runway = fixture();
  runway.airMission.start = {
    posture: "RUNWAY",
    installationId: "iaf-pathankot",
    installationSourceId: "iaf-stations-wikipedia",
    runway: {
      id: "unadmitted-runway",
      threshold: { longitude: 75.633227, latitude: 32.236929, elevation: { valueM: 310, datum: "MSL" } },
      end: { longitude: 75.654427, latitude: 32.236929, elevation: { valueM: 310, datum: "MSL" } },
      headingDeg: 90,
      lengthM: 2_000,
      widthM: 40,
      surface: "PAVED",
      operationalState: "OPEN",
      evidence: { state: "UNKNOWN", sourceId: "UNKNOWN", digest: "UNKNOWN" },
    },
    readinessDelaySeconds: 0,
    taxiFidelity: "ABSTRACTED",
    takeoffCondition: "Runway open and readiness delay elapsed.",
    rejectedTakeoffCondition: "Ground envelope violation before release.",
  };
  assert.throws(
    () => prepareSimulation(runway),
    (error) => error instanceof AirMissionAdmissionError && error.code === "MISSION_RUNWAY_EVIDENCE_MISSING" && error.fieldPath === "start.runway.evidence",
  );

  const runwayMaterial = structuredClone(runway.airMission.start.runway);
  delete runwayMaterial.evidence;
  runway.airMission.start.runway = bindRunwayEvidence(runwayMaterial, {
    state: "MODEL_ASSUMPTION",
    sourceId: "educational-runway-fixture",
  });
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
  const groundResult = simulate(runway);
  const firstGroundFrame = groundResult.engineRun.frames[0].entities.find((entity) => entity.id === "blue-platform-1");
  assert.equal(firstGroundFrame.speedMps, 0);
  const firstGroundGeographic = groundResult.engineRun.frames[0].geographicPositions.find((item) => item.entityId === "blue-platform-1").position;
  assert.ok(Math.abs(firstGroundGeographic.longitudeDeg - threshold.longitude) < 1e-9);
  assert.ok(Math.abs(firstGroundGeographic.latitudeDeg - threshold.latitude) < 1e-9);
  assert.ok(Math.abs(firstGroundGeographic.altitude.valueM - threshold.elevation.valueM) < 1e-3);
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
    (error) => error instanceof AirMissionAdmissionError && error.code === "MISSION_RUNWAY_INVALID" && error.fieldPath === "start.runway.threshold",
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
