import assert from "node:assert/strict";
import test from "node:test";
import {
  CapabilityAdmissionError,
  DEPLOYMENT_CAPABILITIES,
  admitScenarioCapabilities,
  createDeploymentCapabilityManifest,
  createVerificationDeploymentCapabilities,
  domainCapability,
  isOptionalCapabilityEnabled,
} from "../lib/runtime/deployment-capabilities.ts";
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
