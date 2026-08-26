import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SCENARIO,
  buildRaspTrack,
  getFrameAt,
  simulate,
  simulateWithCapabilitiesForVerification,
  standardAtmosphere,
} from "../lib/simulation.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { canConduct, validateScenario } from "../lib/scenario-validation.ts";
import { getStudyArea, getWeatherPreset } from "../lib/study-areas.ts";
import {
  createDefaultSpatialPlan,
  geographicToLocal,
  localToGeographic,
  spatialAspectDeg,
  spatialHorizontalSeparationM,
  withSpatialRangeM,
} from "../lib/scenario-spatial.ts";
import { createVerificationDeploymentCapabilities } from "../lib/runtime/deployment-capabilities.ts";
import { runEngine } from "../lib/engine/core.ts";

const allDomainCapabilities = createVerificationDeploymentCapabilities(
  "rust-wasm",
  ["A2A", "A2G", "G2A", "G2G"],
);

test("standard atmosphere produces credible sea-level reference values", () => {
  const atmosphere = standardAtmosphere(0, 0);
  assert.ok(Math.abs(atmosphere.temperatureK - 288.15) < 0.1);
  assert.ok(Math.abs(atmosphere.pressureKpa - 101.325) < 0.2);
  assert.ok(Math.abs(atmosphere.densityKgM3 - 1.225) < 0.01);
  assert.ok(Math.abs(atmosphere.speedOfSoundMps - 340.3) < 0.5);
});

test("every configured study area carries its selected weather state into the scenario", () => {
  for (const definition of SCENARIO_LIBRARY) {
    const area = getStudyArea(definition.scenario.studyAreaId);
    const preset = getWeatherPreset(area, definition.scenario.weatherPresetId);
    assert.equal(definition.scenario.windNorth, preset.windNorthMps);
    assert.equal(definition.scenario.visibilityKm, preset.visibilityKm);
    assert.equal(definition.scenario.humidityPercent, preset.humidityPercent);
    assert.equal(definition.scenario.temperatureOffset, preset.temperatureOffsetC);
  }
});

test("simulation fails closed for unknown environment identities", () => {
  assert.throws(
    () => simulate({ ...DEFAULT_SCENARIO, studyAreaId: "unknown-area" }),
    {
      code: "ENVIRONMENT_STUDY_AREA_UNKNOWN",
      fieldPath: "studyAreaId",
    },
  );
  assert.throws(
    () => simulate({ ...DEFAULT_SCENARIO, weatherPresetId: "unknown-weather" }),
    {
      code: "ENVIRONMENT_WEATHER_PRESET_UNKNOWN",
      fieldPath: "weatherPresetId",
    },
  );
});

test("engine rejects a stale or tampered environment pack instead of resolving a catalog default", () => {
  const compiled = structuredClone(simulate(DEFAULT_SCENARIO).engineRun.scenario);
  compiled.geospatial.environmentPack.content.weather.windEastMps += 1;
  assert.throws(
    () => runEngine(compiled),
    /environment-pack digest does not match its canonical content/i,
  );

  const mismatchedBinding = structuredClone(simulate(DEFAULT_SCENARIO).engineRun.scenario);
  mismatchedBinding.environment.environmentPack.digest = `sha256:${"0".repeat(64)}`;
  assert.throws(
    () => runEngine(mismatchedBinding),
    /binding does not match the admitted pack/,
  );
});

test("both horizontal wind components reach the compiled physics environment", () => {
  const scenario = { ...DEFAULT_SCENARIO, wind: 11, windNorth: -13 };
  const result = simulate(scenario);
  assert.deepEqual(result.engineRun.scenario.environment.windMps, {
    x: 11,
    y: -13,
    z: 0,
  });
  const changed = simulate({ ...scenario, windNorth: 13 });
  assert.notDeepEqual(changed.frames, result.frames);
});

test("map-authored start positions, headings, speeds and routes compile into engine state", () => {
  const area = getStudyArea(DEFAULT_SCENARIO.studyAreaId);
  const plan = createDefaultSpatialPlan({
    studyArea: area,
    rangeM: DEFAULT_SCENARIO.range,
    blueAltitudeM: DEFAULT_SCENARIO.altitude,
    redAltitudeM: DEFAULT_SCENARIO.altitude + DEFAULT_SCENARIO.targetDelta,
    blueSpeedMps: DEFAULT_SCENARIO.launcherSpeed,
    redSpeedMps: DEFAULT_SCENARIO.targetSpeed,
    crossingAngleDeg: DEFAULT_SCENARIO.aspect,
  });
  assert.ok(
    Math.abs(spatialHorizontalSeparationM(plan, area) - DEFAULT_SCENARIO.range) <
      1,
  );
  assert.ok(Math.abs(spatialAspectDeg(plan, area) - DEFAULT_SCENARIO.aspect) < 0.01);
  plan.blue.route[1] = { ...plan.blue.route[1], altitudeM: 9_200 };

  const result = simulate({ ...DEFAULT_SCENARIO, spatialPlan: plan });
  const scenario = result.engineRun.scenario;
  const blue = scenario.entities.find((entity) => entity.id === "blue-platform-1");
  const red = scenario.entities.find((entity) => entity.id === "red-object-1");
  assert.equal(blue.route.length, plan.blue.route.length);
  assert.equal(red.route.length, plan.red.route.length);
  assert.ok(
    blue.route[1].z > blue.route[0].z + 500,
    "the edited waypoint altitude must reach the compiled three-dimensional route",
  );
  assert.equal(Math.round(blue.initial.position.z), DEFAULT_SCENARIO.altitude);
  assert.equal(
    Math.round(red.initial.position.z),
    DEFAULT_SCENARIO.altitude + DEFAULT_SCENARIO.targetDelta,
  );
  assert.equal(Math.round(Math.hypot(blue.initial.velocity.x, blue.initial.velocity.y)), DEFAULT_SCENARIO.launcherSpeed);
  assert.equal(Math.round(Math.hypot(red.initial.velocity.x, red.initial.velocity.y)), DEFAULT_SCENARIO.targetSpeed);
  assert.ok(Math.abs(blue.initial.velocity.y) < 1e-9);
  assert.ok(red.initial.velocity.y > 0);
});

test("an authored waypoint acceptance radius is compiled and changes the flown route", () => {
  const area = getStudyArea(DEFAULT_SCENARIO.studyAreaId);
  const tightPlan = createDefaultSpatialPlan({
    studyArea: area,
    rangeM: DEFAULT_SCENARIO.range,
    blueAltitudeM: DEFAULT_SCENARIO.altitude,
    redAltitudeM: DEFAULT_SCENARIO.altitude + DEFAULT_SCENARIO.targetDelta,
    blueSpeedMps: DEFAULT_SCENARIO.launcherSpeed,
    redSpeedMps: DEFAULT_SCENARIO.targetSpeed,
    crossingAngleDeg: DEFAULT_SCENARIO.aspect,
  });
  const widePlan = structuredClone(tightPlan);
  const redStart = geographicToLocal(tightPlan.red.position, area);
  const corner = localToGeographic({
    x: redStart.x + 5_000,
    y: redStart.y,
    z: redStart.z,
  }, area);
  const exit = localToGeographic({
    x: redStart.x + 5_000,
    y: redStart.y + 8_000,
    z: redStart.z + 1_000,
  }, area);
  tightPlan.red.route = [tightPlan.red.position, corner, exit];
  widePlan.red.route = [widePlan.red.position, corner, exit];
  tightPlan.red.routeAcceptanceRadiiM = [1, 25, 25];
  widePlan.red.routeAcceptanceRadiiM = [1, 4_000, 25];
  // A persisted v1 plan had radii only. Its all-fly-by semantics must remain
  // executable after v2 introduces explicit transition modes.
  delete tightPlan.red.routeWaypointTransitions;
  delete widePlan.red.routeWaypointTransitions;

  const tight = simulate({ ...DEFAULT_SCENARIO, spatialPlan: tightPlan });
  const wide = simulate({ ...DEFAULT_SCENARIO, spatialPlan: widePlan });
  const tightRed = tight.engineRun.scenario.entities.find((entity) => entity.id === "red-object-1");
  const wideRed = wide.engineRun.scenario.entities.find((entity) => entity.id === "red-object-1");
  assert.deepEqual(tightRed.routePlan, {
    schemaVersion: "vector.route-plan.v1",
    waypointAcceptanceRadiiM: [1, 25, 25],
    waypointTransitions: undefined,
  });
  assert.deepEqual(wideRed.routePlan.waypointAcceptanceRadiiM, [1, 4_000, 25]);
  assert.notDeepEqual(
    wide.frames.at(-1).entities.find((entity) => entity.id === "red-object-1").position,
    tight.frames.at(-1).entities.find((entity) => entity.id === "red-object-1").position,
    "a changed admitted acceptance radius must change achieved trajectory",
  );
});

test("numeric distance edits and map placement share one spatial plan", () => {
  const area = getStudyArea(DEFAULT_SCENARIO.studyAreaId);
  const initial = createDefaultSpatialPlan({
    studyArea: area,
    rangeM: 52000,
    blueAltitudeM: 8500,
    redAltitudeM: 10000,
    blueSpeedMps: 270,
    redSpeedMps: 250,
    crossingAngleDeg: 145,
  });
  const changed = withSpatialRangeM(initial, area, 38000);
  assert.ok(Math.abs(spatialHorizontalSeparationM(changed, area) - 38000) < 1);
  assert.deepEqual(changed.blue, initial.blue);
  assert.notDeepEqual(changed.red.position, initial.red.position);
});

test("validation blocks authored points outside the preset study area", () => {
  const definition = SCENARIO_LIBRARY.find(
    (item) => item.id === "a2a-crossing-intercept",
  );
  const area = getStudyArea(definition.scenario.studyAreaId);
  const plan = createDefaultSpatialPlan({
    studyArea: area,
    rangeM: definition.scenario.range,
    blueAltitudeM: definition.scenario.altitude,
    redAltitudeM: definition.scenario.altitude + definition.scenario.targetDelta,
    blueSpeedMps: definition.scenario.launcherSpeed,
    redSpeedMps: definition.scenario.targetSpeed,
    crossingAngleDeg: definition.scenario.aspect,
  });
  plan.red.position.longitude = area.bounds[1][0] + 2;
  const checks = validateScenario(definition, {
    ...definition.scenario,
    spatialPlan: plan,
  });
  assert.equal(
    checks.find((item) => item.id === "authored-placement")?.state,
    "error",
  );
  assert.equal(canConduct(checks), false);
});

test("validation blocks malformed authored headings, speeds and route origins", () => {
  const definition = SCENARIO_LIBRARY.find(
    (item) => item.id === "a2a-crossing-intercept",
  );
  const area = getStudyArea(definition.scenario.studyAreaId);
  const plan = createDefaultSpatialPlan({
    studyArea: area,
    rangeM: definition.scenario.range,
    blueAltitudeM: definition.scenario.altitude,
    redAltitudeM: definition.scenario.altitude + definition.scenario.targetDelta,
    blueSpeedMps: definition.scenario.launcherSpeed,
    redSpeedMps: definition.scenario.targetSpeed,
    crossingAngleDeg: definition.scenario.aspect,
  });
  plan.blue.headingDeg = 360;
  plan.red.speedMps = -1;
  plan.blue.route[0] = { ...plan.blue.route[0], latitude: plan.blue.route[0].latitude + 0.01 };
  const checks = validateScenario(definition, {
    ...definition.scenario,
    spatialPlan: plan,
  });
  assert.equal(checks.find((item) => item.id === "authored-placement")?.state, "error");
  assert.equal(canConduct(checks), false);
});

test("validation blocks a zero-length authored route leg", () => {
  const definition = SCENARIO_LIBRARY.find(
    (item) => item.id === "a2a-crossing-intercept",
  );
  const area = getStudyArea(definition.scenario.studyAreaId);
  const plan = createDefaultSpatialPlan({
    studyArea: area,
    rangeM: definition.scenario.range,
    blueAltitudeM: definition.scenario.altitude,
    redAltitudeM: definition.scenario.altitude + definition.scenario.targetDelta,
    blueSpeedMps: definition.scenario.launcherSpeed,
    redSpeedMps: definition.scenario.targetSpeed,
    crossingAngleDeg: definition.scenario.aspect,
  });
  plan.blue.route[1] = { ...plan.blue.route[0] };
  const checks = validateScenario(definition, {
    ...definition.scenario,
    spatialPlan: plan,
  });
  assert.equal(checks.find((item) => item.id === "authored-placement")?.state, "error");
  assert.equal(canConduct(checks), false);
});

test("observer state is unavailable until an admitted sensor model is compiled", () => {
  const result = simulate(DEFAULT_SCENARIO);
  const frame = getFrameAt(result, 5);
  for (const perspective of ["IAF", "PAF"]) {
    const track = buildRaspTrack(DEFAULT_SCENARIO, frame, perspective);
    assert.equal(track.visible, false);
    assert.equal(track.trackState, "UNSUPPORTED");
    assert.equal(track.availabilityReason, "SENSOR_MODEL_UNAVAILABLE");
    assert.equal("position" in track, false);
    assert.equal("observedEntityId" in track, false);
  }
});

test("simulation is deterministic for an admitted authored route", () => {
  const first = simulate(DEFAULT_SCENARIO);
  const second = simulate(DEFAULT_SCENARIO);
  assert.equal(first.outcome, second.outcome);
  assert.equal(first.closestApproach, second.closestApproach);
  assert.deepEqual(first.frames, second.frames);
});

test("compiled route-only entities carry no retired tactical behavior contract", () => {
  const result = simulate(DEFAULT_SCENARIO);
  for (const entity of result.engineRun.scenario.entities) {
    assert.equal(
      "behavior" in entity,
      false,
      `${entity.id} must not carry a tactical label that the runtime cannot consume`,
    );
  }
  const aircraft = result.engineRun.scenario.entities.filter(
    (entity) => entity.kind === "AIRCRAFT",
  );
  assert.ok(aircraft.every((entity) => entity.route && entity.route.length >= 2));
});

test("retired source, radar, data-link, EW, and visual scenario controls cannot fabricate a track", () => {
  const result = simulate(DEFAULT_SCENARIO);
  const farFrame = getFrameAt(result, 10);
  for (const perspective of ["IAF", "PAF"]) {
    const sourceKey = perspective === "IAF" ? "blueTrackSource" : "redTrackSource";
    const radarKey = perspective === "IAF" ? "blueRadarMode" : "redRadarMode";
    const linkKey = perspective === "IAF" ? "blueDatalink" : "redDatalink";
    const jammerKey = perspective === "IAF" ? "redJammer" : "blueJammer";
    const track = buildRaspTrack({ ...DEFAULT_SCENARIO, [sourceKey]: "VISUAL", [radarKey]: "SILENT", [linkKey]: false, [jammerKey]: true }, farFrame, perspective);
    assert.equal(track.trackState, "UNSUPPORTED");
    assert.equal(track.visible, false);
    assert.equal(track.availabilityReason, "SENSOR_MODEL_UNAVAILABLE");
  }
});

test("runtime does not terminate on the legacy profile-distance allowance", () => {
  const result = simulate({ ...DEFAULT_SCENARIO, range: 90000 });
  assert.doesNotMatch(result.reason, /distance allowance|study boundary/i);
  assert.ok(result.timeOfFlight > 0);
});

test("every configured library baseline remains valid and numerically finite", () => {
  for (const definition of SCENARIO_LIBRARY) {
    const checks = validateScenario(definition, definition.scenario);
    assert.equal(
      canConduct(checks),
      true,
      `${definition.id} has blocking setup checks: ${checks
        .filter((item) => item.state === "error")
        .map((item) => item.label)
        .join(", ")}`,
    );
    const result = simulateWithCapabilitiesForVerification(
      definition.scenario,
      allDomainCapabilities,
    );
    assert.equal(result.successful, result.termination === "threshold_reached");
    assert.ok(
      ["threshold_reached", "energy_depleted", "time_limit"].includes(
        result.termination,
      ),
    );
    assert.ok(result.frames.length > 1);
    assert.equal(result.engineRun.diagnostics.nonFiniteStateCount, 0);
    assert.ok(result.engineRun.diagnostics.minimumMassMarginKg >= -1e-8);
    const expectedEntityCount = 2
      + definition.scenario.blueWeaponQuantity
      + (definition.domain === "A2A" ? definition.scenario.redWeaponQuantity : 0);
    assert.equal(result.entityManifest.length, expectedEntityCount);
    for (let index = 1; index < result.frames.length; index += 1) {
      assert.ok(result.frames[index].t > result.frames[index - 1].t);
    }
    for (const frame of result.frames) {
      assert.ok(Number.isFinite(frame.range));
      assert.ok(Number.isFinite(frame.closureRate));
      assert.ok(Number.isFinite(frame.specificEnergy));
      for (const entity of frame.entities) {
        assert.ok(entity.position.z >= 0);
        assert.ok(entity.massKg >= 0);
        assert.ok(entity.fuelKg >= -1e-8);
        assert.ok(Number.isFinite(entity.speedMps));
      }
    }
  }
});

test("surface-strike runs honor the declared cruise altitude", () => {
  const definition = SCENARIO_LIBRARY.find(
    (item) => item.id === "g2g-defended-route",
  );
  assert.ok(definition);
  const direct = simulateWithCapabilitiesForVerification(
    definition.scenario,
    allDomainCapabilities,
  );
  const lofted = simulateWithCapabilitiesForVerification(
    { ...definition.scenario, guidance: "loft" },
    allDomainCapabilities,
  );
  const weaponAltitudes = (result) =>
    result.frames
      .flatMap((frame) => frame.entities)
      .filter((entity) => entity.id === "blue-weapon-1")
      .map((entity) => entity.position.z);
  const directAltitudes = weaponAltitudes(direct);
  const loftedAltitudes = weaponAltitudes(lofted);

  assert.ok(Math.max(...directAltitudes) >= definition.scenario.cruiseAltitude - 80);
  assert.ok(Math.max(...loftedAltitudes) > Math.max(...directAltitudes) + 200);
  assert.ok(directAltitudes.at(-1) < definition.scenario.cruiseAltitude);
});

test("surface-strike validation blocks a zero cruise altitude", () => {
  const definition = SCENARIO_LIBRARY.find(
    (item) => item.id === "g2g-defended-route",
  );
  assert.ok(definition);
  const checks = validateScenario(definition, {
    ...definition.scenario,
    cruiseAltitude: 0,
  });
  const flightState = checks.find((item) => item.id === "flight-state");
  assert.equal(flightState?.state, "error");
  assert.equal(canConduct(checks), false);
});

test("extreme declared conditions remain finite and deterministic", () => {
  const scenario = {
    ...DEFAULT_SCENARIO,
    wind: 40,
    temperatureOffset: 20,
    seed: 999,
  };
  const first = simulate(scenario);
  const second = simulate(scenario);
  assert.deepEqual(first, second);
  assert.equal(first.engineRun.diagnostics.nonFiniteStateCount, 0);
  assert.ok(first.frames.every((frame) => Number.isFinite(frame.range)));
});
