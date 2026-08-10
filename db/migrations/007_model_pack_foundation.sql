CREATE TABLE intended_use_contracts (
  id text NOT NULL,
  version text NOT NULL,
  schema_version text NOT NULL CHECK (schema_version = 'vector.intended-use.v1'),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, version)
);

CREATE TABLE model_pack_sources (
  id text NOT NULL,
  version text NOT NULL,
  schema_version text NOT NULL CHECK (schema_version = 'vector.model-pack-source.v1'),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  lifecycle_status text NOT NULL CHECK (lifecycle_status IN ('DRAFT','PUBLISHED','RETIRED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, version)
);

CREATE TABLE credibility_manifests (
  id text NOT NULL,
  version text NOT NULL,
  schema_version text NOT NULL CHECK (schema_version = 'vector.credibility-manifest.v1'),
  subject_kind text NOT NULL CHECK (subject_kind IN ('ENGINE','MODEL_PACK')),
  subject_id text NOT NULL,
  subject_digest text NOT NULL CHECK (subject_digest ~ '^[0-9a-f]{64}$'),
  manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  approval_state text NOT NULL CHECK (approval_state IN ('DRAFT','APPROVED_FOR_DECLARED_USE','RETIRED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, version)
);

CREATE TABLE compiled_model_packs (
  id text NOT NULL,
  version text NOT NULL,
  schema_version text NOT NULL CHECK (schema_version = 'vector.compiled-model-pack.v1'),
  source_id text NOT NULL,
  source_version text NOT NULL,
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  digest text NOT NULL UNIQUE CHECK (digest ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  credibility_manifest_id text NOT NULL,
  credibility_manifest_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, version),
  CONSTRAINT compiled_model_pack_source_fk
    FOREIGN KEY (source_id, source_version)
    REFERENCES model_pack_sources(id, version),
  CONSTRAINT compiled_model_pack_credibility_fk
    FOREIGN KEY (credibility_manifest_id, credibility_manifest_version)
    REFERENCES credibility_manifests(id, version)
);

CREATE INDEX compiled_model_packs_digest_idx ON compiled_model_packs(digest);
CREATE INDEX credibility_manifests_subject_idx
  ON credibility_manifests(subject_kind, subject_id, subject_digest);

INSERT INTO intended_use_contracts
  (id, version, schema_version, definition, content_hash)
VALUES (
  'vector.intended-use.geometry-teaching',
  '1.0.0',
  'vector.intended-use.v1',
  '{
    "schemaVersion":"vector.intended-use.v1",
    "id":"vector.intended-use.geometry-teaching",
    "version":"1.0.0",
    "question":"How do relative geometry, altitude, aspect, closure, and deterministic recorded state evolve in a bounded teaching scenario?",
    "requiredCapabilities":["coordinate-transform","fixed-step-integration","immutable-recording"],
    "supportedInterpretations":["geometry teaching","controlled comparison of declared inputs"],
    "unsupportedInterpretations":["named-system performance","weapon effectiveness","operational sensor performance"]
  }'::jsonb,
  encode(digest(convert_to('vector.intended-use.geometry-teaching@1.0.0', 'UTF8'), 'sha256'), 'hex')
)
ON CONFLICT (id, version) DO NOTHING;

ALTER TABLE scenario_templates
  ADD COLUMN intended_use_id text,
  ADD COLUMN intended_use_version text,
  ADD COLUMN model_pack_id text,
  ADD COLUMN model_pack_version text,
  ADD COLUMN model_pack_digest text;

UPDATE scenario_templates
SET schema_version = 'vector.scenario.v3';

UPDATE scenario_templates
SET intended_use_id = 'vector.intended-use.geometry-teaching',
    intended_use_version = '1.0.0',
    model_pack_id = 'vector-scalar-study-models',
    model_pack_version = '0.5.0',
    model_pack_digest = '181379ad76df8cdbf08666788bf1aace54b05651ce1d2e852487d651c6fb0e1d';

ALTER TABLE scenario_templates
  ALTER COLUMN intended_use_id SET NOT NULL,
  ALTER COLUMN intended_use_version SET NOT NULL,
  ALTER COLUMN model_pack_id SET NOT NULL,
  ALTER COLUMN model_pack_version SET NOT NULL,
  ALTER COLUMN model_pack_digest SET NOT NULL,
  ADD CONSTRAINT scenario_template_intended_use_fk
    FOREIGN KEY (intended_use_id, intended_use_version)
    REFERENCES intended_use_contracts(id, version),
  ADD CONSTRAINT scenario_template_model_pack_digest_format
    CHECK (model_pack_digest ~ '^[0-9a-f]{64}$');

ALTER TABLE saved_run_snapshots
  ADD COLUMN intended_use_id text,
  ADD COLUMN intended_use_version text,
  ADD COLUMN model_pack_id text,
  ADD COLUMN model_pack_version text,
  ADD COLUMN model_pack_digest text;

UPDATE saved_run_snapshots
SET intended_use_id = 'vector.intended-use.geometry-teaching',
    intended_use_version = '1.0.0',
    model_pack_id = 'vector-scalar-study-models',
    model_pack_version = '0.5.0',
    model_pack_digest = '181379ad76df8cdbf08666788bf1aace54b05651ce1d2e852487d651c6fb0e1d';

ALTER TABLE saved_run_snapshots
  ALTER COLUMN intended_use_id SET NOT NULL,
  ALTER COLUMN intended_use_version SET NOT NULL,
  ALTER COLUMN model_pack_id SET NOT NULL,
  ALTER COLUMN model_pack_version SET NOT NULL,
  ALTER COLUMN model_pack_digest SET NOT NULL,
  ADD CONSTRAINT saved_run_intended_use_fk
    FOREIGN KEY (intended_use_id, intended_use_version)
    REFERENCES intended_use_contracts(id, version),
  ADD CONSTRAINT saved_run_model_pack_digest_format
    CHECK (model_pack_digest ~ '^[0-9a-f]{64}$');
