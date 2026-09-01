import assert from "node:assert/strict";
import test from "node:test";

import { CURRENT_COMPILED_MODEL_PACK } from "../lib/engine/weapon-admission.ts";
import { runtimeObserverSensors } from "../lib/engine/runtime-model-pack.ts";
import { projectRunInformationCapabilities } from "../lib/frontend/information-capability.ts";
import {
  createVerificationDeploymentCapabilities,
  DEPLOYMENT_CAPABILITIES,
} from "../lib/runtime/deployment-capabilities.ts";

test("deployment flags cannot promote missing production sensor, EW, data-link, or pilot models", () => {
  const projected = projectRunInformationCapabilities({
    manifest: DEPLOYMENT_CAPABILITIES,
    observerSensors: runtimeObserverSensors(CURRENT_COMPILED_MODEL_PACK),
  });

  assert.deepEqual(
    Object.fromEntries(Object.entries(projected).map(([key, value]) => [key, value.state])),
    {
      sensors: "UNAVAILABLE",
      datalink: "UNAVAILABLE",
      ew: "UNAVAILABLE",
      virtualPilot: "UNAVAILABLE",
    },
  );
  assert.match(projected.sensors.reason, /no positive-range sensor model/i);
  assert.match(projected.ew.reason, /no compiled EW model/i);
  assert.match(projected.virtualPilot.reason, /authored routes.*Red does not autonomously launch/i);
});

test("a deployment-disabled capability remains unavailable even beside runtime-shaped data", () => {
  const manifest = structuredClone(createVerificationDeploymentCapabilities("typescript", ["A2A"]));
  manifest.optionalCapabilities.sensors = {
    state: "DISABLED_BY_DEPLOYMENT",
    reason: "Disabled for this deployment.",
    operatorGuidance: "Choose another deployment.",
  };
  const projected = projectRunInformationCapabilities({
    manifest,
    observerSensors: [{
      modelId: "positive-study-sensor",
      modelVersion: "1.0.0",
      evidenceRefIds: [],
      sensorKind: "RADAR",
      detectionRangeM: 20_000,
      minimumRangeM: 100,
      scanPeriodS: 1,
      azimuthFieldOfViewRad: Math.PI,
      elevationFieldOfViewRad: Math.PI / 2,
    }],
    datalinkModelAdmitted: true,
    ewModelAdmitted: true,
    virtualPilotModelAdmitted: true,
  });

  assert.deepEqual(projected.sensors, {
    state: "UNAVAILABLE",
    reason: "Disabled for this deployment.",
  });
  assert.equal(projected.datalink.state, "UNAVAILABLE");
  assert.equal(projected.ew.state, "AVAILABLE");
  assert.equal(projected.virtualPilot.state, "AVAILABLE");
});

test("positive compiled sensor authority is reported only when deployment also admits it", () => {
  const manifest = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const projected = projectRunInformationCapabilities({
    manifest,
    observerSensors: [{
      modelId: "positive-study-sensor",
      modelVersion: "1.0.0",
      evidenceRefIds: ["independent-study-evidence"],
      sensorKind: "RADAR",
      detectionRangeM: 20_000,
      minimumRangeM: 100,
      scanPeriodS: 1,
      azimuthFieldOfViewRad: Math.PI,
      elevationFieldOfViewRad: Math.PI / 2,
    }],
  });

  assert.equal(projected.sensors.state, "AVAILABLE");
  assert.match(projected.sensors.reason, /positive-study-sensor@1\.0\.0/);
});
