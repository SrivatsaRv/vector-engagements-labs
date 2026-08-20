/** Public, non-secret runtime admission limits shared by every deployment adapter. */
export const PUBLIC_API_ADMISSION_POLICY_VERSION = "public-api-admission.v1";

export const PUBLIC_API_ADMISSION_POLICY = {
  PUBLIC_API_RATE_LIMITER: { limit: 120, periodSeconds: 60 },
  TILE_RATE_LIMITER: { limit: 600, periodSeconds: 60 },
} as const;

export const SAVED_RUN_LIFECYCLE_POLICY = {
  version: "saved-run-lifecycle.v1",
  maxConcurrentRecomputations: 2,
  maxAnonymousRunsPerDay: 20,
  maxServerResultBytes: 8 * 1024 * 1024,
  leaseSeconds: 120,
  retentionDays: 30,
  cleanupBatchSize: 100,
} as const;

export type RateLimitBinding = keyof typeof PUBLIC_API_ADMISSION_POLICY;
