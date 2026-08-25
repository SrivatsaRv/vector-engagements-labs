import assert from "node:assert/strict";
import test from "node:test";
import { compileScenarioKernel } from "../lib/scenario-kernel.ts";
import {
  acceptScenarioKernelResponse,
  createScenarioKernelRequestToken,
  ScenarioKernelRequestError,
} from "../lib/scenario-kernel-requests.ts";

function fixture() {
  return {
    schemaVersion: "vector.scenario-kernel.v1",
    id: "request-study",
    version: "1.0.0",
    purpose: "Bind async work to draft and perspective",
    provenance: { source: "USER_AUTHORED", sourceId: "request-test" },
    intendedUse: { id: "vector.intended-use.geometry-teaching", version: "1.0.0" },
    affiliations: [{ id: "aff-a", displayName: "Force A", category: "FORCE" }],
    relationships: [],
    organizations: [{
      id: "org-a", displayName: "Organization A", kind: "ORGANIZATION", affiliationId: "aff-a",
    }],
    entities: [{
      id: "entity-a", displayName: "Entity A", domain: "AIR", kind: "PLATFORM",
      affiliationId: "aff-a", organizationId: "org-a", capabilityRefs: [],
    }],
    tasks: [],
    perspectives: [
      {
        id: "perspective-admin",
        kind: "AUTHORING_ADMIN",
        visibleAffiliationIds: ["aff-a"],
        exposeScenarioIdentity: true,
        exposeScenarioPurpose: true,
        capabilityVisibility: "VISIBLE_REFERENCES",
        surfaces: ["CONSTRUCT", "OBSERVE", "EXPLAIN", "COMPARE", "REPLAY", "EXPORT"],
      },
      {
        id: "perspective-public",
        kind: "REDACTED_PUBLIC",
        visibleAffiliationIds: ["aff-a"],
        exposeScenarioIdentity: false,
        exposeScenarioPurpose: false,
        capabilityVisibility: "NONE",
        surfaces: ["OBSERVE", "EXPLAIN", "COMPARE", "REPLAY", "EXPORT"],
      },
    ],
  };
}

function response(token, payload = { rows: [1, 2, 3] }) {
  return {
    schemaVersion: "vector.scenario-kernel-response.v1",
    requestId: token.requestId,
    tokenDigest: token.tokenDigest,
    payload,
  };
}

test("an async response is accepted only for its exact draft, perspective, surface and request", () => {
  const kernel = compileScenarioKernel(fixture());
  const token = createScenarioKernelRequestToken(kernel, "perspective-admin", "COMPARE", "compare-1");
  const accepted = acceptScenarioKernelResponse(
    kernel,
    "perspective-admin",
    "COMPARE",
    token,
    response(token),
  );
  assert.deepEqual(accepted.payload, { rows: [1, 2, 3] });
  assert.ok(Object.isFrozen(accepted));

  assert.throws(
    () => acceptScenarioKernelResponse(
      kernel,
      "perspective-admin",
      "COMPARE",
      token,
      { ...response(token), requestId: "compare-2" },
    ),
    (error) => error instanceof ScenarioKernelRequestError && error.code === "KERNEL_REQUEST_ID_MISMATCH",
  );
});

test("draft mutation rejects a response issued against stale canonical bytes", () => {
  const source = fixture();
  const before = compileScenarioKernel(source);
  const token = createScenarioKernelRequestToken(before, "perspective-admin", "EXPLAIN", "explain-1");
  const after = compileScenarioKernel({ ...source, purpose: "Changed while request was in flight" });
  assert.throws(
    () => acceptScenarioKernelResponse(after, "perspective-admin", "EXPLAIN", token, response(token)),
    (error) => error instanceof ScenarioKernelRequestError && error.code === "KERNEL_REQUEST_STALE_DRAFT",
  );
});

test("perspective or surface switches reject in-flight responses before payload consumption", () => {
  const kernel = compileScenarioKernel(fixture());
  const token = createScenarioKernelRequestToken(kernel, "perspective-admin", "REPLAY", "replay-1");
  let payloadReads = 0;
  const guardedResponse = {
    schemaVersion: "vector.scenario-kernel-response.v1",
    requestId: token.requestId,
    tokenDigest: token.tokenDigest,
    get payload() {
      payloadReads += 1;
      throw new Error("hidden response payload was consumed");
    },
  };
  assert.throws(
    () => acceptScenarioKernelResponse(kernel, "perspective-public", "REPLAY", token, guardedResponse),
    (error) => error instanceof ScenarioKernelRequestError && error.code === "KERNEL_REQUEST_STALE_PERSPECTIVE",
  );
  assert.throws(
    () => acceptScenarioKernelResponse(kernel, "perspective-admin", "OBSERVE", token, guardedResponse),
    (error) => error instanceof ScenarioKernelRequestError && error.code === "KERNEL_REQUEST_STALE_SURFACE",
  );
  assert.equal(payloadReads, 0);
});

test("request context is content-addressed and rejects tampering", () => {
  const kernel = compileScenarioKernel(fixture());
  const token = createScenarioKernelRequestToken(kernel, "perspective-admin", "EXPORT", "export-1");
  assert.throws(
    () => acceptScenarioKernelResponse(
      kernel,
      "perspective-admin",
      "EXPORT",
      { ...token, projectionDigest: "0".repeat(64) },
      response(token),
    ),
    (error) => error instanceof ScenarioKernelRequestError && error.code === "KERNEL_REQUEST_INVALID",
  );
});
