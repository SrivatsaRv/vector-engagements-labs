import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PUBLIC_API_ADMISSION_POLICY,
  PUBLIC_API_ADMISSION_POLICY_VERSION,
  enforceRateLimit,
  publicApiAdmissionStatus,
  requirePublicApiAdmissionReady,
} from "../lib/security/runtime";
import { PublicApiError, publicApiError } from "../lib/security/public-api";
import { GET as healthGet } from "../app/api/health/route";

test("admission policy gives every configured limiter an explicit positive window", () => {
  assert.equal(PUBLIC_API_ADMISSION_POLICY_VERSION, "public-api-admission.v2");
  for (const policy of Object.values(PUBLIC_API_ADMISSION_POLICY)) {
    assert.ok(Number.isSafeInteger(policy.limit) && policy.limit > 0);
    assert.ok(
      Number.isSafeInteger(policy.periodSeconds) && policy.periodSeconds > 0,
    );
  }
});

test("Node refuses public API work when its durable limiter is unavailable", async () => {
  const previousRuntime = process.env.VECTOR_RUNTIME;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.VECTOR_RUNTIME = "node";
  delete process.env.DATABASE_URL;
  try {
    await assert.rejects(
      () =>
        enforceRateLimit(
          new Request("https://labs.reachdefence.com/api/catalog"),
          "PUBLIC_API_RATE_LIMITER",
        ),
      { code: "rate_limit_unavailable" },
    );
  } finally {
    if (previousRuntime === undefined) delete process.env.VECTOR_RUNTIME;
    else process.env.VECTOR_RUNTIME = previousRuntime;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});

test("readiness fails closed when the Node limiter store is not configured", async () => {
  const previousRuntime = process.env.VECTOR_RUNTIME;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.VECTOR_RUNTIME = "node";
  delete process.env.DATABASE_URL;
  try {
    assert.deepEqual(await publicApiAdmissionStatus(), {
      policyVersion: "public-api-admission.v2",
      runtime: "node",
      limiter: "unavailable",
      ready: false,
    });
    await assert.rejects(() => requirePublicApiAdmissionReady(), {
      code: "rate_limit_unavailable",
    });
  } finally {
    if (previousRuntime === undefined) delete process.env.VECTOR_RUNTIME;
    else process.env.VECTOR_RUNTIME = previousRuntime;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});

test("readiness fails closed when the Cloudflare limiter bindings are absent", async () => {
  const previousRuntime = process.env.VECTOR_RUNTIME;
  delete process.env.VECTOR_RUNTIME;
  try {
    assert.deepEqual(await publicApiAdmissionStatus(), {
      policyVersion: "public-api-admission.v2",
      runtime: "cloudflare",
      limiter: "unavailable",
      ready: false,
    });
    await assert.rejects(() => requirePublicApiAdmissionReady(), {
      code: "rate_limit_unavailable",
    });
  } finally {
    if (previousRuntime === undefined) delete process.env.VECTOR_RUNTIME;
    else process.env.VECTOR_RUNTIME = previousRuntime;
  }
});

test("health endpoint does not report ready when anonymous admission is unavailable", async () => {
  const previousRuntime = process.env.VECTOR_RUNTIME;
  delete process.env.VECTOR_RUNTIME;
  try {
    const response = await healthGet(
      new Request("https://labs.reachdefence.com/api/health"),
    );
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: "rate_limit_unavailable",
    });
  } finally {
    if (previousRuntime === undefined) delete process.env.VECTOR_RUNTIME;
    else process.env.VECTOR_RUNTIME = previousRuntime;
  }
});

test("rate-limit rejection has a stable retry contract", async () => {
  const response = publicApiError(
    new PublicApiError(429, "rate_limit_exceeded", "rate limit exceeded", {
      "retry-after": "12",
    }),
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "12");
  assert.deepEqual(await response.json(), { error: "rate_limit_exceeded" });
});

test("unexpected public API failures emit a bounded structured log without exposing details", async () => {
  const recorded: unknown[][] = [];
  const originalError = console.error;
  console.error = (...values: unknown[]) => recorded.push(values);
  try {
    const response = publicApiError(new Error("postgres://secret@example.test/vector"));
    assert.equal(response.status, 500);
    const body = await response.json() as { error: string; requestId: string };
    assert.equal(body.error, "service_unavailable");
    assert.match(body.requestId, /^[0-9a-f-]{36}$/);
    assert.equal(recorded.length, 1);
    const event = JSON.parse(String(recorded[0]?.[0]));
    assert.deepEqual(event, {
      event: "public_api_request_failed",
      requestId: body.requestId,
      errorType: "Error",
    });
    assert.doesNotMatch(String(recorded[0]?.[0]), /secret@example/);
  } finally {
    console.error = originalError;
  }
});
