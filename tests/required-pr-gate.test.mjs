import assert from "node:assert/strict";
import test from "node:test";

import { REQUIRED_GATES, verifyRequiredGates } from "../scripts/verify-required-gates.mjs";

const successfulEnvironment = () => {
  const environment = { CLASSIFY_RESULT: "success", POLICY_RESULT: "success" };
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
