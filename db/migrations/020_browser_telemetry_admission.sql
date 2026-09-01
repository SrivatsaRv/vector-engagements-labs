-- Keep best-effort browser instrumentation outside the anonymous catalog and
-- saved-run budget. Migration 011 remains immutable; this forward-only change
-- extends its closed policy identity set for public-api-admission.v2.
ALTER TABLE public_api_rate_windows
  DROP CONSTRAINT IF EXISTS public_api_rate_windows_policy_id_check;

ALTER TABLE public_api_rate_windows
  ADD CONSTRAINT public_api_rate_windows_policy_id_check
  CHECK (policy_id IN (
    'PUBLIC_API_RATE_LIMITER',
    'BROWSER_TELEMETRY_RATE_LIMITER',
    'TILE_RATE_LIMITER'
  ));
