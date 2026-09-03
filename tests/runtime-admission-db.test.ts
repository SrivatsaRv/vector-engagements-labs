import assert from "node:assert/strict";
import { test } from "node:test";
import postgres, { type Sql } from "postgres";

import { withDatabase } from "../db";
import { enforceRateLimit, PUBLIC_API_ADMISSION_POLICY, requestActorHash } from "../lib/security/runtime";
import { admitSavedRun, releaseSavedRunAdmission } from "../lib/security/saved-run-admission";
import { SAVED_RUN_LIFECYCLE_POLICY } from "../lib/security/admission-policy";
import { runProductionReadOnlySnapshot } from "../scripts/verify-db.mjs";

const hasDatabase = Boolean(process.env.DATABASE_URL);

test("production verification transaction rejects attempted database mutation", { skip: !hasDatabase }, async () => {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const before = await sql`SELECT id, variant FROM platform_variants ORDER BY id`;
    await assert.rejects(
      () => runProductionReadOnlySnapshot(
        sql,
        (transaction: Sql) => transaction`UPDATE platform_variants SET variant=variant`,
      ),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, "25006");
        return true;
      },
    );
    const after = await sql`SELECT id, variant FROM platform_variants ORDER BY id`;
    assert.deepEqual(after, before);
  } finally {
    await sql.end();
  }
});

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

test("browser telemetry cannot spend the durable public API budget", { skip: !hasDatabase }, async () => {
  const previousRuntime = process.env.VECTOR_RUNTIME;
  process.env.VECTOR_RUNTIME = "node";
  const telemetryPolicy = PUBLIC_API_ADMISSION_POLICY.BROWSER_TELEMETRY_RATE_LIMITER;
  const request = new Request("https://labs.reachdefence.com/api/telemetry");
  const now = Date.now();
  const windowStartMs = Math.floor(now / (telemetryPolicy.periodSeconds * 1000)) * telemetryPolicy.periodSeconds * 1000;
  const actorHash = await requestActorHash(request);
  try {
    await withDatabase((sql) => sql`
      DELETE FROM public_api_rate_windows
      WHERE actor_hash = ${actorHash}
        AND window_started_at = to_timestamp(${windowStartMs} / 1000.0)
        AND policy_id IN ('BROWSER_TELEMETRY_RATE_LIMITER', 'PUBLIC_API_RATE_LIMITER')
    `);
    await withDatabase((sql) => sql`
      INSERT INTO public_api_rate_windows
        (policy_id, actor_hash, window_started_at, request_count)
      VALUES ('BROWSER_TELEMETRY_RATE_LIMITER', ${actorHash}, to_timestamp(${windowStartMs} / 1000.0), ${telemetryPolicy.limit})
    `);

    await assert.rejects(
      () => enforceRateLimit(request, "BROWSER_TELEMETRY_RATE_LIMITER"),
      { code: "rate_limit_exceeded" },
    );
    await enforceRateLimit(request, "PUBLIC_API_RATE_LIMITER");

    const rows = await withDatabase((sql) => sql`
      SELECT policy_id, request_count
      FROM public_api_rate_windows
      WHERE actor_hash = ${actorHash}
        AND window_started_at = to_timestamp(${windowStartMs} / 1000.0)
        AND policy_id IN ('BROWSER_TELEMETRY_RATE_LIMITER', 'PUBLIC_API_RATE_LIMITER')
      ORDER BY policy_id
    `);
    assert.deepEqual(rows.map(({ policy_id, request_count }) => ({ policy_id, request_count })), [
      { policy_id: "BROWSER_TELEMETRY_RATE_LIMITER", request_count: telemetryPolicy.limit },
      { policy_id: "PUBLIC_API_RATE_LIMITER", request_count: 1 },
    ]);
  } finally {
    await withDatabase((sql) => sql`
      DELETE FROM public_api_rate_windows
      WHERE actor_hash = ${actorHash}
        AND window_started_at = to_timestamp(${windowStartMs} / 1000.0)
        AND policy_id IN ('BROWSER_TELEMETRY_RATE_LIMITER', 'PUBLIC_API_RATE_LIMITER')
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
    const actorHash = await requestActorHash(request);
    await withDatabase((sql) => sql`UPDATE saved_run_admission_slots SET lease_id = NULL, leased_until = NULL`);
    await withDatabase((sql) => sql`DELETE FROM anonymous_saved_run_usage WHERE usage_day = CURRENT_DATE`);
    const first = await admitSavedRun(request);
    const second = await admitSavedRun(request);
    await assert.rejects(
      () => admitSavedRun(request),
      { code: "saved_run_capacity_exhausted" },
    );
    const [usage] = await withDatabase((sql) => sql`
      SELECT accepted_runs
      FROM anonymous_saved_run_usage
      WHERE actor_hash = ${actorHash}
        AND usage_day = CURRENT_DATE
    `);
    assert.equal(
      usage?.accepted_runs,
      2,
      "a capacity-rejected request must not spend the durable write quota",
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

test("failed saved-run work refunds its durable quota reservation", { skip: !hasDatabase }, async () => {
  const previousRuntime = process.env.VECTOR_RUNTIME;
  process.env.VECTOR_RUNTIME = "node";
  const request = new Request("https://labs.reachdefence.com/api/runs", { method: "POST" });
  try {
    const actorHash = await requestActorHash(request);
    await withDatabase((sql) => sql`UPDATE saved_run_admission_slots SET lease_id = NULL, leased_until = NULL`);
    await withDatabase((sql) => sql`DELETE FROM anonymous_saved_run_usage WHERE usage_day = CURRENT_DATE`);
    const lease = await admitSavedRun(request);
    await releaseSavedRunAdmission(lease);
    const [usage] = await withDatabase((sql) => sql`
      SELECT accepted_runs
      FROM anonymous_saved_run_usage
      WHERE actor_hash = ${actorHash}
        AND usage_day = CURRENT_DATE
    `);
    assert.equal(usage, undefined);
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
    await releaseSavedRunAdmission(finalAllowed, { persisted: true });
    await assert.rejects(() => admitSavedRun(request), { code: "saved_run_quota_exceeded" });
  } finally {
    await withDatabase((sql) => sql`UPDATE saved_run_admission_slots SET lease_id = NULL, leased_until = NULL`);
    await withDatabase((sql) => sql`DELETE FROM anonymous_saved_run_usage WHERE usage_day = CURRENT_DATE`);
    if (previousRuntime === undefined) delete process.env.VECTOR_RUNTIME;
    else process.env.VECTOR_RUNTIME = previousRuntime;
  }
});
