import assert from "node:assert/strict";
import test from "node:test";

import { PUBLIC_INSTALLATIONS } from "../lib/installations.ts";
import { simulate, DEFAULT_SCENARIO } from "../lib/simulation.ts";
import { createDefaultSpatialPlan } from "../lib/scenario-spatial.ts";
import { getStudyArea } from "../lib/study-areas.ts";

function planWithBlueOrigin(reference) {
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
  plan.blue.originReference = reference;
  return plan;
}

function validOrigin() {
  const installation = PUBLIC_INSTALLATIONS.find((item) => item.id === "iaf-pathankot");
  assert.ok(installation);
  return {
    schemaVersion: "vector.installation-origin.v1",
    installationId: installation.id,
    sourceId: installation.sourceId,
    environment: {
      studyAreaId: DEFAULT_SCENARIO.studyAreaId,
      weatherPresetId: DEFAULT_SCENARIO.weatherPresetId,
    },
  };
}

test("an admitted selected installation survives authoring through compiled engine state", () => {
  const reference = validOrigin();
  const result = simulate({
    ...DEFAULT_SCENARIO,
    spatialPlan: planWithBlueOrigin(reference),
  });
  assert.deepEqual(result.engineRun.scenario.geospatial.originReferences, [
    { entityId: "blue-platform-1", reference },
  ]);
  assert.match(
    result.engineRun.scenario.geospatial.syntheticEnvironment.missionOrigins.digest,
    /^sha256:[0-9a-f]{64}$/,
  );
  const manual = simulate({
    ...DEFAULT_SCENARIO,
    spatialPlan: planWithBlueOrigin(undefined),
  });
  assert.notEqual(
    result.engineRun.scenario.geospatial.syntheticEnvironment.missionOrigins.digest,
    manual.engineRun.scenario.geospatial.syntheticEnvironment.missionOrigins.digest,
    "the frozen environment identity must change when an admitted base reference changes",
  );
});

test("manual airborne placement remains runnable without an installation reference", () => {
  const result = simulate({
    ...DEFAULT_SCENARIO,
    spatialPlan: planWithBlueOrigin(undefined),
  });
  assert.deepEqual(result.engineRun.scenario.geospatial.originReferences, []);
});

for (const fixture of [
  ["deleted installation", { ...validOrigin(), installationId: "deleted-installation" }, "MISSION_INSTALLATION_UNKNOWN", "placement.blue.originReference.installationId"],
  ["stale installation source", { ...validOrigin(), sourceId: "retired-source" }, "MISSION_INSTALLATION_SOURCE_MISMATCH", "placement.blue.originReference.sourceId"],
  ["cross-area installation package", { ...validOrigin(), environment: { ...validOrigin().environment, studyAreaId: "rajasthan-desert" } }, "MISSION_INSTALLATION_ENVIRONMENT_MISMATCH", "placement.blue.originReference.environment.studyAreaId"],
  ["cross-weather installation package", { ...validOrigin(), environment: { ...validOrigin().environment, weatherPresetId: "north-punjab-hot" } }, "MISSION_INSTALLATION_ENVIRONMENT_MISMATCH", "placement.blue.originReference.environment.weatherPresetId"],
  ["unadmitted runway", { ...validOrigin(), runwayId: "rwy-09" }, "MISSION_RUNWAY_UNAVAILABLE", "placement.blue.originReference.runwayId"],
]) {
  test(`${fixture[0]} fails closed before an engine scenario exists`, () => {
    assert.throws(
      () => simulate({ ...DEFAULT_SCENARIO, spatialPlan: planWithBlueOrigin(fixture[1]) }),
      { code: fixture[2], fieldPath: fixture[3] },
    );
  });
}
