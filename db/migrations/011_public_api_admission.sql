-- Runtime-neutral anonymous API admission. Node/container mode uses these
-- durable windows instead of silently disabling Cloudflare edge bindings.
CREATE TABLE IF NOT EXISTS public_api_rate_windows (
  policy_id text NOT NULL CHECK (policy_id IN ('PUBLIC_API_RATE_LIMITER', 'TILE_RATE_LIMITER')),
  actor_hash text NOT NULL CHECK (actor_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (policy_id, actor_hash, window_started_at)
);

CREATE INDEX IF NOT EXISTS public_api_rate_windows_expiry_idx
  ON public_api_rate_windows (window_started_at);
