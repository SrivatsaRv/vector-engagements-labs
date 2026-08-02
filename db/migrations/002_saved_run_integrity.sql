DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'saved_run_scenario_fk'
  ) THEN
    ALTER TABLE saved_run_snapshots
      ADD CONSTRAINT saved_run_scenario_fk
      FOREIGN KEY (scenario_id, scenario_version)
      REFERENCES scenario_templates(id, version);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'saved_run_report_required'
  ) THEN
    ALTER TABLE saved_run_snapshots
      ADD CONSTRAINT saved_run_report_required
      CHECK (
        model_assumptions ? 'report'
        AND jsonb_typeof(model_assumptions -> 'report') = 'object'
      );
  END IF;
END $$;
