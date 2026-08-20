import assert from "node:assert/strict";
import { test } from "node:test";

import { PUBLIC_API_ADMISSION_POLICY, PUBLIC_API_ADMISSION_POLICY_VERSION, enforceRateLimit } from "../lib/security/runtime";
import { PublicApiError, publicApiError } from "../lib/security/public-api";

test("admission policy gives every configured limiter an explicit positive window", () => {
  assert.equal(PUBLIC_API_ADMISSION_POLICY_VERSION, "public-api-admission.v1");
  for (const policy of Object.values(PUBLIC_API_ADMISSION_POLICY)) {
    assert.ok(Number.isSafeInteger(policy.limit) && policy.limit > 0);
    assert.ok(Number.isSafeInteger(policy.periodSeconds) && policy.periodSeconds > 0);
  }
});

test("Node refuses public API work when its durable limiter is unavailable", async () => {
  const previousRuntime = process.env.VECTOR_RUNTIME;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.VECTOR_RUNTIME = "node";
  delete process.env.DATABASE_URL;
  try {
    await assert.rejects(
      () => enforceRateLimit(new Request("https://labs.reachdefence.com/api/catalog"), "PUBLIC_API_RATE_LIMITER"),
      { code: "rate_limit_unavailable" },
    );
  } finally {
    if (previousRuntime === undefined) delete process.env.VECTOR_RUNTIME;
    else process.env.VECTOR_RUNTIME = previousRuntime;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});

test("rate-limit rejection has a stable retry contract", async () => {
  const response = publicApiError(new PublicApiError(
    429,
    "rate_limit_exceeded",
    "rate limit exceeded",
    { "retry-after": "12" },
  ));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "12");
  assert.deepEqual(await response.json(), { error: "rate_limit_exceeded" });
});
