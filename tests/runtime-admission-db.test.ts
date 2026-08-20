import assert from "node:assert/strict";
import { test } from "node:test";

import { withDatabase } from "../db";
import { enforceRateLimit, PUBLIC_API_ADMISSION_POLICY, requestActorHash } from "../lib/security/runtime";
import { admitSavedRun, releaseSavedRunAdmission } from "../lib/security/saved-run-admission";
import { SAVED_RUN_LIFECYCLE_POLICY } from "../lib/security/admission-policy";

const hasDatabase = Boolean(process.env.DATABASE_URL);

test("Node adapter enforces the declared public limit in the durable database", { skip: !hasDatabase }, async () => {
  const previousRuntime = process.env.VECTOR_RUNTIME;
  process.env.VECTOR_RUNTIME = "node";
  const policy = PUBLIC_API_ADMISSION_POLICY.PUBLIC_API_RATE_LIMITER;
  const request = new Request("https://labs.reachdefence.com/api/catalog", {
    headers: { "cf-connecting-ip": "must-not-change-node-anonymous-admission" },
  });
  const now = Date.now();
  const windowStartMs = Math.floor(now / (policy.periodSeconds * 1000)) * policy.periodSeconds * 1000;
  try {
    const actorHash = await requestActorHash(request);
    await withDatabase((sql) => sql`
      DELETE FROM public_api_rate_windows
      WHERE policy_id = 'PUBLIC_API_RATE_LIMITER'
        AND window_started_at = to_timestamp(${windowStartMs} / 1000.0)
    `);
    await withDatabase((sql) => sql`
      INSERT INTO public_api_rate_windows
        (policy_id, actor_hash, window_started_at, request_count)
      VALUES ('PUBLIC_API_RATE_LIMITER', ${actorHash}, to_timestamp(${windowStartMs} / 1000.0), ${policy.limit - 1})
    `);
    await enforceRateLimit(request, "PUBLIC_API_RATE_LIMITER");
    await assert.rejects(
      () => enforceRateLimit(request, "PUBLIC_API_RATE_LIMITER"),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, "rate_limit_exceeded");
        assert.ok(new Headers((error as { headers?: HeadersInit }).headers).get("retry-after"));
        return true;
      },
    );
  } finally {
    await withDatabase((sql) => sql`
      DELETE FROM public_api_rate_windows
      WHERE policy_id = 'PUBLIC_API_RATE_LIMITER'
        AND window_started_at = to_timestamp(${windowStartMs} / 1000.0)
    `);
    if (previousRuntime === undefined) delete process.env.VECTOR_RUNTIME;
    else process.env.VECTOR_RUNTIME = previousRuntime;
  }
});

test("saved-run admission bounds global leases and releases capacity", { skip: !hasDatabase }, async () => {
  const previousRuntime = process.env.VECTOR_RUNTIME;
  process.env.VECTOR_RUNTIME = "node";
  const request = new Request("https://labs.reachdefence.com/api/runs", { method: "POST" });
  try {
    await withDatabase((sql) => sql`UPDATE saved_run_admission_slots SET lease_id = NULL, leased_until = NULL`);
    await withDatabase((sql) => sql`DELETE FROM anonymous_saved_run_usage WHERE usage_day = CURRENT_DATE`);
    const first = await admitSavedRun(request);
    const second = await admitSavedRun(request);
    await assert.rejects(
      () => admitSavedRun(request),
      { code: "saved_run_capacity_exhausted" },
    );
    await releaseSavedRunAdmission(first);
    const replacement = await admitSavedRun(request);
    await releaseSavedRunAdmission(second);
    await releaseSavedRunAdmission(replacement);
  } finally {
    await withDatabase((sql) => sql`UPDATE saved_run_admission_slots SET lease_id = NULL, leased_until = NULL`);
    await withDatabase((sql) => sql`DELETE FROM anonymous_saved_run_usage WHERE usage_day = CURRENT_DATE`);
    if (previousRuntime === undefined) delete process.env.VECTOR_RUNTIME;
    else process.env.VECTOR_RUNTIME = previousRuntime;
  }
});

test("saved-run admission enforces the durable daily anonymous write quota", { skip: !hasDatabase }, async () => {
  const previousRuntime = process.env.VECTOR_RUNTIME;
  process.env.VECTOR_RUNTIME = "node";
  const request = new Request("https://labs.reachdefence.com/api/runs", { method: "POST" });
  try {
    const actorHash = await requestActorHash(request);
    await withDatabase((sql) => sql`UPDATE saved_run_admission_slots SET lease_id = NULL, leased_until = NULL`);
    await withDatabase((sql) => sql`
      INSERT INTO anonymous_saved_run_usage (actor_hash, usage_day, accepted_runs)
      VALUES (${actorHash}, CURRENT_DATE, ${SAVED_RUN_LIFECYCLE_POLICY.maxAnonymousRunsPerDay - 1})
      ON CONFLICT (actor_hash, usage_day)
      DO UPDATE SET accepted_runs = EXCLUDED.accepted_runs
    `);
    const finalAllowed = await admitSavedRun(request);
    await releaseSavedRunAdmission(finalAllowed);
    await assert.rejects(() => admitSavedRun(request), { code: "saved_run_quota_exceeded" });
  } finally {
    await withDatabase((sql) => sql`UPDATE saved_run_admission_slots SET lease_id = NULL, leased_until = NULL`);
    await withDatabase((sql) => sql`DELETE FROM anonymous_saved_run_usage WHERE usage_day = CURRENT_DATE`);
    if (previousRuntime === undefined) delete process.env.VECTOR_RUNTIME;
    else process.env.VECTOR_RUNTIME = previousRuntime;
  }
});
