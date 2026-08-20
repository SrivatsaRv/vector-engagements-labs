import assert from "node:assert/strict";
import test from "node:test";
import { sha256Hex } from "../lib/canonical-json.ts";
import {
  CapabilityAdmissionError,
  DEPLOYMENT_CAPABILITIES,
  admitScenarioCapabilities,
  admitWorkerCapabilityManifest,
  capabilityManifestIdentity,
  createDeploymentCapabilityManifest,
  createVerificationDeploymentCapabilities,
  domainCapability,
  isOptionalCapabilityEnabled,
  verifyCapabilityManifest,
} from "../lib/runtime/deployment-capabilities.ts";
import {
  adaptPreparedSimulation,
  admitRuntimeModelPack,
} from "../lib/runtime/model-pack-adapter.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { prepareSimulation } from "../lib/simulation.ts";

test("deployment capability identity is deterministic and content addressed", () => {
  const first = createVerificationDeploymentCapabilities("rust-wasm");
  const second = createVerificationDeploymentCapabilities("rust-wasm");
  assert.equal(first.digest, second.digest);
  assert.match(first.digest, /^[a-f0-9]{64}$/);
  assert.equal(first.engine.id, "rust-wasm");
});

test("the deployment admits A2A and fails closed for every other domain", () => {
  assert.equal(domainCapability("A2A").state, "ENABLED");
  for (const domain of ["A2G", "G2A", "G2G"]) {
    const decision = domainCapability(domain);
    assert.equal(decision.state, "DISABLED_BY_DEPLOYMENT");
    assert.ok(decision.reason.length > 0);
    assert.ok(decision.operatorGuidance.length > 0);
  }
  assert.throws(
    () => admitScenarioCapabilities(SCENARIO_LIBRARY.find((item) => item.domain === "A2G").scenario),
    (error) =>
      error instanceof CapabilityAdmissionError && error.code === "DOMAIN_DISABLED",
  );
});

test("deployment configuration rejects incomplete or unknown capability maps", () => {
  const incompleteDomains = structuredClone(DEPLOYMENT_CAPABILITIES);
  delete incompleteDomains.domains.G2G;
  assert.throws(
    () => createDeploymentCapabilityManifest(incompleteDomains),
    (error) =>
      error instanceof CapabilityAdmissionError &&
      error.code === "CAPABILITY_CONFIG_INVALID",
  );

  const unknownOptionalCapability = structuredClone(DEPLOYMENT_CAPABILITIES);
  unknownOptionalCapability.optionalCapabilities.unreviewed = {
    state: "ENABLED",
    reason: "invalid fixture",
    operatorGuidance: "invalid fixture",
  };
  assert.throws(
    () => createDeploymentCapabilityManifest(unknownOptionalCapability),
    (error) =>
      error instanceof CapabilityAdmissionError &&
      error.code === "CAPABILITY_CONFIG_INVALID",
  );
  assert.equal(isOptionalCapabilityEnabled("sensors"), true);
  assert.equal(isOptionalCapabilityEnabled("ew"), true);
  assert.equal(isOptionalCapabilityEnabled("datalink"), false);

  const unknownSchema = structuredClone(DEPLOYMENT_CAPABILITIES);
  unknownSchema.schemaVersion = "vector.deployment-capabilities.v99";
  assert.throws(
    () => createDeploymentCapabilityManifest(unknownSchema),
    (error) =>
      error instanceof CapabilityAdmissionError &&
      error.code === "CAPABILITY_CONFIG_INVALID",
  );
});

test("a scenario cannot select or override the deployment engine", () => {
  const scenario = {
    ...SCENARIO_LIBRARY[0].scenario,
    engineBackend: "typescript",
  };
  assert.throws(
    () => prepareSimulation(scenario),
    (error) =>
      error instanceof CapabilityAdmissionError &&
      error.code === "SCENARIO_ENGINE_FORBIDDEN",
  );
  assert.equal(DEPLOYMENT_CAPABILITIES.engine.id, "typescript");
});

test("a changed deployment manifest cannot be admitted after a Worker boundary", async () => {
  const stale = structuredClone(DEPLOYMENT_CAPABILITIES);
  stale.buildIdentity = "old-deployment";
  assert.throws(
    () => verifyCapabilityManifest(stale),
    (error) =>
      error instanceof CapabilityAdmissionError &&
      error.code === "CAPABILITY_MANIFEST_STALE",
  );

  const validButDifferentDeployment = createVerificationDeploymentCapabilities(
    "rust-wasm",
  );
  assert.throws(
    () => admitWorkerCapabilityManifest(validButDifferentDeployment),
    (error) =>
      error instanceof CapabilityAdmissionError &&
      error.code === "CAPABILITY_MANIFEST_STALE",
  );

  const prepared = prepareSimulation(SCENARIO_LIBRARY[0].scenario);
  const pack = await adaptPreparedSimulation(prepared);
  pack.prepared.capabilityManifest = validButDifferentDeployment;
  pack.digest = await sha256Hex({
    schemaVersion: pack.schemaVersion,
    scenarioRef: pack.scenarioRef,
    prepared: pack.prepared,
  });
  await assert.rejects(
    () => admitRuntimeModelPack(pack),
    (error) =>
      error instanceof CapabilityAdmissionError &&
      error.code === "CAPABILITY_MANIFEST_STALE",
  );
});

test("a valid compiled pack admits the exact deployment identity without scenario data", async () => {
  const pack = await adaptPreparedSimulation(
    prepareSimulation(SCENARIO_LIBRARY[0].scenario),
  );
  const identity = await admitRuntimeModelPack(pack);
  assert.deepEqual(identity, capabilityManifestIdentity(DEPLOYMENT_CAPABILITIES));
  assert.equal(admitWorkerCapabilityManifest(DEPLOYMENT_CAPABILITIES).digest, identity.digest);
  assert.deepEqual(Object.keys(identity).sort(), ["digest", "engineId", "schemaVersion"]);
});
