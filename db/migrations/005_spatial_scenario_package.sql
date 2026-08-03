-- The v2 scenario package makes study-area and weather-preset identities
-- mandatory authored inputs. The idempotent seed job that follows migration
-- refreshes canonical packages and their content hashes.
UPDATE scenario_templates
SET schema_version = 'vector.scenario.v2';
