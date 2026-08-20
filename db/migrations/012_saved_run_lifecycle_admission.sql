-- Saved-run execution is globally bounded across Node/container processes.
CREATE TABLE IF NOT EXISTS saved_run_admission_slots (
  slot smallint PRIMARY KEY CHECK (slot > 0),
  lease_id uuid,
  leased_until timestamptz,
  CHECK ((lease_id IS NULL) = (leased_until IS NULL))
);

INSERT INTO saved_run_admission_slots (slot) VALUES (1), (2)
ON CONFLICT (slot) DO NOTHING;

CREATE TABLE IF NOT EXISTS anonymous_saved_run_usage (
  actor_hash text NOT NULL CHECK (actor_hash ~ '^[0-9a-f]{64}$'),
  usage_day date NOT NULL,
  accepted_runs integer NOT NULL CHECK (accepted_runs > 0),
  PRIMARY KEY (actor_hash, usage_day)
);
