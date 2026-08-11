-- Intended-use, executable model, and credibility records are content-bearing
-- release artifacts. Corrections publish a new version; they never rewrite or
-- delete an identity already referenced by a scenario or saved run.
CREATE OR REPLACE FUNCTION validate_governed_catalog_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'intended_use_contracts' THEN
    IF NEW.definition->>'id' IS DISTINCT FROM NEW.id
      OR NEW.definition->>'version' IS DISTINCT FROM NEW.version
      OR NEW.definition->>'schemaVersion' IS DISTINCT FROM NEW.schema_version THEN
      RAISE EXCEPTION 'intended-use payload identity does not match row identity';
    END IF;
  ELSIF TG_TABLE_NAME = 'model_pack_sources' THEN
    IF NEW.definition->>'id' IS DISTINCT FROM NEW.id
      OR NEW.definition->>'version' IS DISTINCT FROM NEW.version
      OR NEW.definition->>'schemaVersion' IS DISTINCT FROM NEW.schema_version THEN
      RAISE EXCEPTION 'model-pack source payload identity does not match row identity';
    END IF;
  ELSIF TG_TABLE_NAME = 'compiled_model_packs' THEN
    IF NEW.payload->>'id' IS DISTINCT FROM NEW.id
      OR NEW.payload->>'version' IS DISTINCT FROM NEW.version
      OR NEW.payload->>'schemaVersion' IS DISTINCT FROM NEW.schema_version
      OR NEW.payload->>'digest' IS DISTINCT FROM NEW.digest
      OR NEW.payload->>'unitSystem' IS DISTINCT FROM 'SI'
      OR NEW.payload->'credibilityManifestRef'->>'id' IS DISTINCT FROM NEW.credibility_manifest_id
      OR NEW.payload->'credibilityManifestRef'->>'version' IS DISTINCT FROM NEW.credibility_manifest_version THEN
      RAISE EXCEPTION 'compiled model-pack payload is not an identity-consistent SI artifact';
    END IF;
  ELSIF TG_TABLE_NAME = 'credibility_manifests' THEN
    IF NEW.manifest->>'id' IS DISTINCT FROM NEW.id
      OR NEW.manifest->>'version' IS DISTINCT FROM NEW.version
      OR NEW.manifest->>'schemaVersion' IS DISTINCT FROM NEW.schema_version
      OR NEW.manifest->>'contentDigest' IS DISTINCT FROM NEW.content_hash
      OR NEW.manifest->>'approvalState' IS DISTINCT FROM NEW.approval_state
      OR NEW.manifest->'subject'->>'kind' IS DISTINCT FROM NEW.subject_kind
      OR NEW.manifest->'subject'->>'id' IS DISTINCT FROM NEW.subject_id
      OR NEW.manifest->'subject'->>'digest' IS DISTINCT FROM NEW.subject_digest THEN
      RAISE EXCEPTION 'credibility-manifest payload identity does not match row identity';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION reject_governed_catalog_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% %.% is immutable; publish a new version',
    TG_TABLE_NAME, OLD.id, OLD.version;
END;
$$;

CREATE TRIGGER intended_use_contract_validate_insert
  BEFORE INSERT ON intended_use_contracts
  FOR EACH ROW EXECUTE FUNCTION validate_governed_catalog_insert();
CREATE TRIGGER model_pack_source_validate_insert
  BEFORE INSERT ON model_pack_sources
  FOR EACH ROW EXECUTE FUNCTION validate_governed_catalog_insert();
CREATE TRIGGER compiled_model_pack_validate_insert
  BEFORE INSERT ON compiled_model_packs
  FOR EACH ROW EXECUTE FUNCTION validate_governed_catalog_insert();
CREATE TRIGGER credibility_manifest_validate_insert
  BEFORE INSERT ON credibility_manifests
  FOR EACH ROW EXECUTE FUNCTION validate_governed_catalog_insert();

CREATE TRIGGER intended_use_contract_immutable
  BEFORE UPDATE OR DELETE ON intended_use_contracts
  FOR EACH ROW EXECUTE FUNCTION reject_governed_catalog_mutation();
CREATE TRIGGER model_pack_source_immutable
  BEFORE UPDATE OR DELETE ON model_pack_sources
  FOR EACH ROW EXECUTE FUNCTION reject_governed_catalog_mutation();
CREATE TRIGGER compiled_model_pack_immutable
  BEFORE UPDATE OR DELETE ON compiled_model_packs
  FOR EACH ROW EXECUTE FUNCTION reject_governed_catalog_mutation();
CREATE TRIGGER credibility_manifest_immutable
  BEFORE UPDATE OR DELETE ON credibility_manifests
  FOR EACH ROW EXECUTE FUNCTION reject_governed_catalog_mutation();
