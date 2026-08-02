CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE scenario_templates
  ADD COLUMN IF NOT EXISTS schema_version text,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS engine_version text;

UPDATE scenario_templates
SET schema_version = COALESCE(schema_version, 'vector.scenario.v1'),
    content_hash = COALESCE(
      content_hash,
      encode(digest(convert_to(package::text, 'UTF8'), 'sha256'), 'hex')
    ),
    engine_version = COALESCE(engine_version, 'browser-point-mass-v0.5');

ALTER TABLE scenario_templates
  ALTER COLUMN schema_version SET NOT NULL,
  ALTER COLUMN content_hash SET NOT NULL,
  ALTER COLUMN engine_version SET NOT NULL;

ALTER TABLE saved_run_snapshots
  ADD COLUMN IF NOT EXISTS scenario_schema_version text,
  ADD COLUMN IF NOT EXISTS scenario_content_hash text,
  ADD COLUMN IF NOT EXISTS compiled_scenario jsonb,
  ADD COLUMN IF NOT EXISTS frame_hash text,
  ADD COLUMN IF NOT EXISTS draft_revision integer;

UPDATE saved_run_snapshots AS saved
SET scenario_schema_version = COALESCE(saved.scenario_schema_version, template.schema_version),
    scenario_content_hash = COALESCE(saved.scenario_content_hash, template.content_hash),
    compiled_scenario = COALESCE(saved.compiled_scenario, '{}'::jsonb),
    frame_hash = COALESCE(saved.frame_hash, repeat('0', 64)),
    draft_revision = COALESCE(saved.draft_revision, 0)
FROM scenario_templates AS template
WHERE template.id = saved.scenario_id
  AND template.version = saved.scenario_version;

ALTER TABLE saved_run_snapshots
  ALTER COLUMN scenario_schema_version SET NOT NULL,
  ALTER COLUMN scenario_content_hash SET NOT NULL,
  ALTER COLUMN compiled_scenario SET NOT NULL,
  ALTER COLUMN frame_hash SET NOT NULL,
  ALTER COLUMN draft_revision SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'saved_run_hash_format'
  ) THEN
    ALTER TABLE saved_run_snapshots
      ADD CONSTRAINT saved_run_hash_format
      CHECK (
        scenario_content_hash ~ '^[0-9a-f]{64}$'
        AND frame_hash ~ '^[0-9a-f]{64}$'
        AND draft_revision >= 0
      );
  END IF;
END $$;
