import assert from "node:assert/strict";
import test from "node:test";

import { PUBLIC_INSTALLATIONS, reconcileGroundStartElevation } from "../lib/installations.ts";
import { prepareSimulation, simulate, DEFAULT_SCENARIO } from "../lib/simulation.ts";
import { createDefaultSpatialPlan, withAirborneStart } from "../lib/scenario-spatial.ts";
import { getStudyArea } from "../lib/study-areas.ts";

const MISSION_SCENARIO = {
  ...DEFAULT_SCENARIO,
  airMission: undefined,
  studyAreaId: "rajasthan-desert",
  weatherPresetId: "rajasthan-hot-dry",
};

function planWithBlueOrigin(reference) {
  const area = getStudyArea(MISSION_SCENARIO.studyAreaId);
  const plan = createDefaultSpatialPlan({
    studyArea: area,
    rangeM: MISSION_SCENARIO.range,
    blueAltitudeM: MISSION_SCENARIO.altitude,
    redAltitudeM: MISSION_SCENARIO.altitude + MISSION_SCENARIO.targetDelta,
    blueSpeedMps: MISSION_SCENARIO.launcherSpeed,
    redSpeedMps: MISSION_SCENARIO.targetSpeed,
    crossingAngleDeg: MISSION_SCENARIO.aspect,
  });
  plan.blue.originReference = reference;
  return plan;
}

function validOrigin() {
  const installation = PUBLIC_INSTALLATIONS.find((item) => item.id === "iaf-jodhpur");
  assert.ok(installation);
  return {
    schemaVersion: "vector.installation-origin.v2",
    installationId: installation.id,
    sourceId: installation.sourceId,
    startKind: "RUNWAY",
    runwayId: "runway:iaf-jodhpur:236786",
    environment: {
      studyAreaId: MISSION_SCENARIO.studyAreaId,
      weatherPresetId: MISSION_SCENARIO.weatherPresetId,
    },
  };
}

test("an admitted selected installation survives authoring through compiled engine state", () => {
  const reference = validOrigin();
  const prepared = prepareSimulation({
    ...MISSION_SCENARIO,
    spatialPlan: planWithBlueOrigin(reference),
  });
  assert.deepEqual(prepared.engineScenario.geospatial.originReferences, [
    { entityId: "blue-platform-1", reference },
  ]);
  assert.match(
    prepared.engineScenario.geospatial.syntheticEnvironment.missionOrigins.digest,
    /^sha256:[0-9a-f]{64}$/,
  );
  const runway = prepared.engineScenario.entities.find((entity) => entity.id === "blue-platform-1");
  assert.ok(runway);
  assert.ok(runway.initial.position.z > 241.31 && runway.initial.position.z < 241.33);
  assert.deepEqual(runway.route[0], runway.initial.position);
  assert.ok(Math.abs(runway.initial.headingRad - ((90 - 44.8) * Math.PI) / 180) < 1e-12);
  const manual = prepareSimulation({
    ...MISSION_SCENARIO,
    spatialPlan: planWithBlueOrigin(undefined),
  });
  assert.notEqual(
    prepared.engineScenario.geospatial.syntheticEnvironment.missionOrigins.digest,
    manual.engineScenario.geospatial.syntheticEnvironment.missionOrigins.digest,
    "the frozen environment identity must change when an admitted base reference changes",
  );
});

test("runway/DEM disagreement is bounded by an explicit fail-closed model envelope", () => {
  assert.deepEqual(reconcileGroundStartElevation(100, 129), {
    valueM: 129.01,
    datum: "MSL",
    provenance: "MODEL_ASSUMPTION",
    runwayMslM: 100,
    terrainMslM: 129,
    maximumDisagreementM: 30,
  });
  assert.throws(() => reconcileGroundStartElevation(100, 130.01), /conflict outside/u);
});

test("manual airborne placement remains runnable without an installation reference", () => {
  const result = simulate({
    ...MISSION_SCENARIO,
    spatialPlan: planWithBlueOrigin(undefined),
  });
  assert.deepEqual(result.engineRun.scenario.geospatial.originReferences, []);
});

test("a numeric horizontal start edit clears installation identity before compilation", () => {
  const plan = planWithBlueOrigin(validOrigin());
  plan.blue = withAirborneStart(plan.blue, {
    ...plan.blue.position,
    longitude: plan.blue.position.longitude + 0.01,
  });

  assert.equal(plan.blue.originReference, undefined);
  const result = simulate({ ...MISSION_SCENARIO, spatialPlan: plan });
  assert.deepEqual(result.engineRun.scenario.geospatial.originReferences, []);
});

for (const fixture of [
  ["deleted installation", { ...validOrigin(), installationId: "deleted-installation" }, "MISSION_INSTALLATION_UNKNOWN", "placement.blue.originReference.installationId"],
  ["stale installation source", { ...validOrigin(), sourceId: "retired-source" }, "MISSION_INSTALLATION_SOURCE_MISMATCH", "placement.blue.originReference.sourceId"],
  ["cross-area installation package", { ...validOrigin(), environment: { ...validOrigin().environment, studyAreaId: "north-punjab" } }, "MISSION_INSTALLATION_ENVIRONMENT_MISMATCH", "placement.blue.originReference.environment.studyAreaId"],
  ["cross-weather installation package", { ...validOrigin(), environment: { ...validOrigin().environment, weatherPresetId: "rajasthan-dust" } }, "MISSION_INSTALLATION_ENVIRONMENT_MISMATCH", "placement.blue.originReference.environment.weatherPresetId"],
  ["unadmitted runway", { ...validOrigin(), runwayId: "rwy-09" }, "MISSION_RUNWAY_UNAVAILABLE", "placement.blue.originReference.runwayId"],
]) {
  test(`${fixture[0]} fails closed before an engine scenario exists`, () => {
    assert.throws(
      () => simulate({ ...MISSION_SCENARIO, spatialPlan: planWithBlueOrigin(fixture[1]) }),
      { code: fixture[2], fieldPath: fixture[3] },
    );
  });
}
