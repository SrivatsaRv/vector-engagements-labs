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
  spatialAspectDeg,
  spatialHorizontalSeparationM,
  withSpatialRangeM,
} from "../lib/scenario-spatial.ts";
import { createVerificationDeploymentCapabilities } from "../lib/runtime/deployment-capabilities.ts";

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

test("visual acquisition obeys the declared visibility limit", () => {
  const result = simulate(DEFAULT_SCENARIO);
  const frame = result.frames.find((item) => item.range <= 15000) ?? result.frames.at(-1);
  const visible = buildRaspTrack(
    { ...DEFAULT_SCENARIO, blueTrackSource: "VISUAL", visibilityKm: 18 },
    frame,
    "IAF",
  );
  const obscured = buildRaspTrack(
    { ...DEFAULT_SCENARIO, blueTrackSource: "VISUAL", visibilityKm: 2 },
    frame,
    "IAF",
  );
  assert.equal(visible.visible, true);
  assert.equal(obscured.visible, false);
});

test("simulation is deterministic and intent labels do not invent aircraft motion", () => {
  const first = simulate(DEFAULT_SCENARIO);
  const second = simulate(DEFAULT_SCENARIO);
  assert.equal(first.outcome, second.outcome);
  assert.equal(first.closestApproach, second.closestApproach);
  assert.deepEqual(first.frames, second.frames);

  const press = simulate({ ...DEFAULT_SCENARIO, redDecision: "PRESS" });
  const redTrail = (result) =>
    result.frames.map(
      (frame) => frame.entities.find((entity) => entity.id === "red-object-1").position,
    );
  assert.deepEqual(redTrail(press), redTrail(first));
});

test("RASP returns no visible track when its admitted sensor is unavailable", () => {
  const result = simulate(DEFAULT_SCENARIO);
  const frame = getFrameAt(result, 30);
  const nominal = buildRaspTrack(DEFAULT_SCENARIO, frame, "IAF");
  const degraded = buildRaspTrack(
    {
      ...DEFAULT_SCENARIO,
      blueRadarMode: "SILENT",
      blueDatalink: false,
      redJammer: true,
    },
    frame,
    "IAF",
  );
  assert.equal(nominal.status, "DEGRADED");
  assert.equal(degraded.status, "NO_TRACK");
  assert.equal(degraded.visible, false);
  assert.ok(degraded.confidence < nominal.confidence);
  assert.equal(degraded.trackState, "NONE");
  assert.ok(!("truthPosition" in degraded));
});

test("RASP source controls have explicit availability behavior for both sides", () => {
  const result = simulate(DEFAULT_SCENARIO);
  const farFrame = getFrameAt(result, 10);
  const nearFrame = result.frames.find((item) => item.range <= 17000) ?? result.frames.at(-1);

  for (const perspective of ["IAF", "PAF"]) {
    const sourceKey = perspective === "IAF" ? "blueTrackSource" : "redTrackSource";
    const radarKey = perspective === "IAF" ? "blueRadarMode" : "redRadarMode";
    const linkKey = perspective === "IAF" ? "blueDatalink" : "redDatalink";
    const jammerKey = perspective === "IAF" ? "redJammer" : "blueJammer";

    const radarTrack = buildRaspTrack(
      { ...DEFAULT_SCENARIO, [sourceKey]: "ONBOARD_RADAR", [radarKey]: "ACTIVE" },
      farFrame,
      perspective,
    );
    const silentRadar = buildRaspTrack(
      { ...DEFAULT_SCENARIO, [sourceKey]: "ONBOARD_RADAR", [radarKey]: "SILENT" },
      farFrame,
      perspective,
    );
    assert.equal(radarTrack.visible, true);
    assert.equal(silentRadar.status, "NO_TRACK");

    for (const source of ["DATALINK", "AIRBORNE_EARLY_WARNING"]) {
      assert.equal(
        buildRaspTrack(
          { ...DEFAULT_SCENARIO, [sourceKey]: source, [linkKey]: true },
          farFrame,
          perspective,
        ).availabilityReason,
        "DATALINK_SOURCE_UNAVAILABLE",
      );
      assert.equal(
        buildRaspTrack(
          { ...DEFAULT_SCENARIO, [sourceKey]: source, [linkKey]: false },
          farFrame,
          perspective,
        ).status,
        "NO_TRACK",
      );
    }

    assert.equal(
      buildRaspTrack(
        { ...DEFAULT_SCENARIO, [sourceKey]: "VISUAL" },
        farFrame,
        perspective,
      ).status,
      "NO_TRACK",
    );
    assert.equal(
      buildRaspTrack(
        { ...DEFAULT_SCENARIO, [sourceKey]: "VISUAL" },
        nearFrame,
        perspective,
      ).visible,
      true,
    );

    const jammed = buildRaspTrack(
      { ...DEFAULT_SCENARIO, [sourceKey]: "ONBOARD_RADAR", [jammerKey]: true },
      farFrame,
      perspective,
    );
    assert.equal(jammed.trackState, "NONE");
  }
});

test("Blue Team intent labels do not bypass the authored route controller", () => {
  const support = simulate({ ...DEFAULT_SCENARIO, blueDecision: "SUPPORT_WEAPON" });
  const crank = simulate({ ...DEFAULT_SCENARIO, blueDecision: "CRANK" });
  const defend = simulate({ ...DEFAULT_SCENARIO, blueDecision: "DEFEND" });
  const disengage = simulate({ ...DEFAULT_SCENARIO, blueDecision: "DISENGAGE" });
  const bluePlatform = (result) =>
    result.frames.at(-1).entities.find((item) => item.id === "blue-platform-1");

  assert.deepEqual(bluePlatform(crank).position, bluePlatform(support).position);
  assert.deepEqual(bluePlatform(defend).position, bluePlatform(support).position);
  assert.deepEqual(bluePlatform(disengage).position, bluePlatform(support).position);
  assert.equal(bluePlatform(support).phase, "Following route");
  assert.ok(bluePlatform(support).aircraftControl);
});

test("Red Team intent labels do not create fixed maneuver demands", () => {
  const runs = Object.fromEntries(
    ["PRESS", "CRANK", "DEFEND", "DISENGAGE"].map((decision) => [
      decision,
      simulate({ ...DEFAULT_SCENARIO, redDecision: decision }),
    ]),
  );
  const targetAt = (decision) =>
    runs[decision].frames
      .at(-1)
      .entities.find((entity) => entity.id === "red-object-1");

  assert.deepEqual(targetAt("PRESS").position, targetAt("CRANK").position);
  assert.deepEqual(targetAt("PRESS").position, targetAt("DEFEND").position);
  assert.deepEqual(targetAt("PRESS").position, targetAt("DISENGAGE").position);
  assert.ok(targetAt("PRESS").aircraftControl);
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
    assert.equal(
      result.entityManifest.length,
      definition.domain === "A2A" ? 4 : 3,
    );
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
    wind: 60,
    temperatureOffset: 25,
    targetG: 9,
    seed: 999,
  };
  const first = simulate(scenario);
  const second = simulate(scenario);
  assert.deepEqual(first, second);
  assert.equal(first.engineRun.diagnostics.nonFiniteStateCount, 0);
  assert.ok(first.frames.every((frame) => Number.isFinite(frame.range)));
});
