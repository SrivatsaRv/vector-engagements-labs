import assert from "node:assert/strict";
import test from "node:test";

import { classifyChanges } from "../scripts/classify-ci-changes.mjs";
import { REQUIRED_GATES, verifyRequiredGates } from "../scripts/verify-required-gates.mjs";

const successfulEnvironment = () => {
  const environment = {
    CLASSIFY_RESULT: "success",
    POLICY_RESULT: "success",
    CONTRACT_DOCS_RESULT: "success",
    CONTRACT_DOC_IMPACT_STATE: "VERIFIED",
    PR_REVIEW_KIND: "slice",
  };
  for (const gate of REQUIRED_GATES) {
    environment[gate.selected] = "true";
    environment[gate.result] = "success";
  }
  return environment;
};

test("the required gate accepts selected success and unselected skipped jobs", () => {
  const environment = successfulEnvironment();
  environment.CONTAINER_SELECTED = "false";
  environment.CONTAINER_RESULT = "skipped";
  assert.doesNotThrow(() => verifyRequiredGates(environment));
});

for (const failedResult of ["failure", "cancelled", "skipped", "timed_out", "action_required"] ) {
  test(`the required gate rejects a selected ${failedResult} job`, () => {
    const environment = successfulEnvironment();
    environment.WEB_TESTS_RESULT = failedResult;
    assert.throws(() => verifyRequiredGates(environment), new RegExp(failedResult));
  });
}

test("the required gate rejects an unselected job that unexpectedly ran", () => {
  const environment = successfulEnvironment();
  environment.QUALITY_SELECTED = "false";
  assert.throws(() => verifyRequiredGates(environment), /expected skipped/);
});

test("the required gate rejects missing or invalid classifier outputs", () => {
  const missing = successfulEnvironment();
  delete missing.RUST_TESTS_SELECTED;
  assert.throws(() => verifyRequiredGates(missing), /must be true or false/);

  const invalid = successfulEnvironment();
  invalid.INTEGRATION_SELECTED = "yes";
  assert.throws(() => verifyRequiredGates(invalid), /must be true or false/);
});

test("the required gate rejects failed policy and classifier jobs", () => {
  const classifierFailed = successfulEnvironment();
  classifierFailed.CLASSIFY_RESULT = "cancelled";
  assert.throws(() => verifyRequiredGates(classifierFailed), /Classifier ended as cancelled/);

  const policyFailed = successfulEnvironment();
  policyFailed.POLICY_RESULT = "failure";
  assert.throws(() => verifyRequiredGates(policyFailed), /policy ended as failure/i);
});

for (const failedResult of ["failure", "cancelled", "skipped", "timed_out"]) {
  test(`the required gate rejects a ${failedResult} documentation-impact gate`, () => {
    const environment = successfulEnvironment();
    environment.CONTRACT_DOCS_RESULT = failedResult;
    assert.throws(() => verifyRequiredGates(environment), /documentation impact gate ended/i);
  });
}

test("the required gate rejects missing or invalid documentation-impact state", () => {
  const missing = successfulEnvironment();
  delete missing.CONTRACT_DOC_IMPACT_STATE;
  assert.throws(() => verifyRequiredGates(missing), /CONTRACT_DOC_IMPACT_STATE is missing/i);
  const invalid = successfulEnvironment();
  invalid.CONTRACT_DOC_IMPACT_STATE = "BYPASSED";
  assert.throws(() => verifyRequiredGates(invalid), /impact state is invalid/i);
});

test("the required gate rejects an invalid PR review classification", () => {
  const environment = successfulEnvironment();
  environment.PR_REVIEW_KIND = "unknown";
  assert.throws(() => verifyRequiredGates(environment), /PR review kind must be/i);
});

test("every change-selected job is owned by the Required PR Gate", () => {
  const classifierOutputs = Object.keys(classifyChanges(["unknown-runtime/input.bin"]))
    .filter((key) => key !== "files" && key !== "policy")
    .sort();
  const requiredOutputs = REQUIRED_GATES.map((gate) => gate.key.replaceAll("-", "_"))
    .sort();
  assert.deepEqual(requiredOutputs, classifierOutputs);
});
