import { withDatabase } from "@/db";
import { incrementCounter } from "@/lib/observability/metrics";
import { PublicApiError } from "./public-api";
import { requestActorHash } from "./runtime";
import { SAVED_RUN_LIFECYCLE_POLICY } from "./admission-policy";

type SavedRunLease = { slot: number; leaseId: string };

function retryAfter(seconds: number) {
  return { "retry-after": String(Math.max(1, Math.ceil(seconds))) };
}

/**
 * Acquire a durable, cross-process admission slot before server recomputation.
 * A lease is always released by the route finally block; expiry prevents a
 * crashed process from retaining capacity indefinitely.
 */
export async function admitSavedRun(request: Request): Promise<SavedRunLease> {
  const actorHash = await requestActorHash(request);
  const leaseId = crypto.randomUUID();
  try {
    const lease = await withDatabase((sql) => sql.begin(async (transaction) => {
      const usage = await transaction`
        INSERT INTO anonymous_saved_run_usage
          (actor_hash, usage_day, accepted_runs)
        VALUES (${actorHash}, CURRENT_DATE, 1)
        ON CONFLICT (actor_hash, usage_day)
        DO UPDATE SET accepted_runs = anonymous_saved_run_usage.accepted_runs + 1
        WHERE anonymous_saved_run_usage.accepted_runs < ${SAVED_RUN_LIFECYCLE_POLICY.maxAnonymousRunsPerDay}
        RETURNING accepted_runs
      `;
      if (!usage[0]) {
        throw new PublicApiError(429, "saved_run_quota_exceeded", "saved run quota exceeded", retryAfter(86_400));
      }

      const slots = await transaction`
        WITH candidate AS (
          SELECT slot
          FROM saved_run_admission_slots
          WHERE leased_until IS NULL OR leased_until < now()
          ORDER BY slot
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE saved_run_admission_slots AS slots
        SET lease_id = ${leaseId}::uuid,
            leased_until = now() + (${SAVED_RUN_LIFECYCLE_POLICY.leaseSeconds} * interval '1 second')
        FROM candidate
        WHERE slots.slot = candidate.slot
        RETURNING slots.slot
      `;
      if (!slots[0]) {
        throw new PublicApiError(503, "saved_run_capacity_exhausted", "saved run capacity exhausted", retryAfter(1));
      }
      return { slot: slots[0].slot as number, leaseId };
    }));
    incrementCounter("vector_saved_run_admission_total", { outcome: "admitted" });
    return lease;
  } catch (error) {
    if (error instanceof PublicApiError) {
      incrementCounter("vector_saved_run_admission_total", {
        outcome: error.code === "saved_run_quota_exceeded" ? "quota_rejected" : "capacity_rejected",
      });
      throw error;
    }
    incrementCounter("vector_saved_run_admission_total", { outcome: "unavailable" });
    throw new PublicApiError(503, "saved_run_admission_unavailable");
  }
}

export async function releaseSavedRunAdmission(lease: SavedRunLease) {
  try {
    const removed = await withDatabase((sql) => sql`
      WITH expired AS (
        SELECT id
        FROM saved_run_snapshots
        WHERE created_at < now() - (${SAVED_RUN_LIFECYCLE_POLICY.retentionDays} * interval '1 day')
        ORDER BY created_at
        LIMIT ${SAVED_RUN_LIFECYCLE_POLICY.cleanupBatchSize}
      ), deleted AS (
        DELETE FROM saved_run_snapshots
        WHERE id IN (SELECT id FROM expired)
        RETURNING id
      ), released AS (
        UPDATE saved_run_admission_slots
        SET lease_id = NULL, leased_until = NULL
        WHERE slot = ${lease.slot} AND lease_id = ${lease.leaseId}::uuid
        RETURNING slot
      )
      SELECT (SELECT count(*) FROM deleted)::int AS deleted_count,
             (SELECT count(*) FROM released)::int AS released_count
    `);
    if (removed[0]?.released_count !== 1) {
      throw new Error("saved-run admission lease was not held by this request");
    }
    incrementCounter("vector_saved_run_cleanup_total", {
      outcome: (removed[0]?.deleted_count ?? 0) > 0 ? "expired_records_deleted" : "no_expired_records",
    });
  } catch {
    // A short lease bounds capacity even if the release path is interrupted.
    console.error(JSON.stringify({ event: "saved_run_admission_release_failed", leaseSlot: lease.slot }));
    incrementCounter("vector_saved_run_cleanup_total", { outcome: "release_failed" });
  }
}
