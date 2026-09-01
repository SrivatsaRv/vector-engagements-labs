import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { canonicalJson } from "../lib/canonical-json.ts";
import { ENGINE_VERSION } from "../lib/engine/version.ts";
import { sha256HexSync } from "../lib/geospatial/digest.ts";
import { SCENARIO_PACKAGE_SCHEMA_VERSION } from "../lib/scenario-package.ts";
import {
  CURRENT_AIR_COMBAT_STUDY_IDS,
  SCENARIO_LIBRARY,
} from "../lib/scenarios.ts";

const checkOnly = process.argv.includes("--check");
const write = process.argv.includes("--write");
if (checkOnly === write) throw new Error("Pass exactly one of --write or --check.");
if (process.argv.slice(2).some((argument) => !["--check", "--write"].includes(argument))) {
  throw new Error("Unknown argument.");
}

const frozen018Path = resolve("db/migrations/018_three_air_combat_studies.sql");
const frozen018 = readFileSync(frozen018Path, "utf8");
const frozen018Digest = createHash("sha256").update(frozen018).digest("hex");
if (frozen018Digest !== "278da504c99c5e02a0f2de1ac188de8477afb48782a062e4a2697b08ec9b6da2") {
  throw new Error("Historical Air-combat migration 018 is not immutable.");
}

const currentIds = new Set<string>(CURRENT_AIR_COMBAT_STUDY_IDS);
const studies = SCENARIO_LIBRARY.filter(({ id }) => currentIds.has(id));
const definition = studies.find(({ id }) => id === "a2a-crossing-intercept");
if (
  studies.length !== CURRENT_AIR_COMBAT_STUDY_IDS.length
  || !definition
  || definition.version !== "1.3.0"
  || definition.authoredProfile?.id !== "bvr-mutual-offset-defensive-turn"
  || studies.filter(({ version }) => version === "1.2.0").length !== 2
) {
  throw new Error("The current Air-combat study versions are incomplete or not governed.");
}

const escapeSql = (value: string) => value.replaceAll("'", "''");
const sqlText = (value: string) => `'${escapeSql(value)}'`;
const dollarJson = (tag: string, value: unknown) => {
  const json = canonicalJson(value);
  if (json.includes(`$${tag}$`)) throw new Error(`Dollar-quote collision for ${tag}.`);
  return `$${tag}$${json}$${tag}$::jsonb`;
};

const tag = "vector_bvr_kill_019_a2a_crossing_intercept";
const expectedTag = "vector_bvr_kill_019_expected_a2a_crossing_intercept";
const generated = `-- Forward-only publication of the issue #207 BVR KILL demonstration.
-- Migration 018 remains immutable and independently addressable.
BEGIN;

INSERT INTO scenario_templates (id,version,domain,title,status,package,schema_version,content_hash,engine_version,study_area_id,intended_use_id,intended_use_version,model_pack_id,model_pack_version,model_pack_digest) VALUES (${sqlText(definition.id)},${sqlText(definition.version)},${sqlText(definition.domain)},${sqlText(definition.title)},'VALIDATED',${dollarJson(tag, definition)},${sqlText(SCENARIO_PACKAGE_SCHEMA_VERSION)},${sqlText(sha256HexSync(definition))},${sqlText(ENGINE_VERSION)},${sqlText(definition.scenario.studyAreaId)},${sqlText(definition.intendedUse.id)},${sqlText(definition.intendedUse.version)},${sqlText(definition.modelPack.id)},${sqlText(definition.modelPack.version)},${sqlText(definition.modelPack.digest)}) ON CONFLICT (id,version) DO NOTHING;

UPDATE scenario_templates
SET status='RETIRED'
WHERE id=${sqlText(definition.id)}
  AND version='1.2.0'
  AND status='VALIDATED';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      (${sqlText(definition.id)},${sqlText(definition.version)},${sqlText(definition.domain)},${sqlText(definition.title)},'VALIDATED',${dollarJson(expectedTag, definition)},${sqlText(SCENARIO_PACKAGE_SCHEMA_VERSION)},${sqlText(sha256HexSync(definition))},${sqlText(ENGINE_VERSION)},${sqlText(definition.scenario.studyAreaId)},${sqlText(definition.intendedUse.id)},${sqlText(definition.intendedUse.version)},${sqlText(definition.modelPack.id)},${sqlText(definition.modelPack.version)},${sqlText(definition.modelPack.digest)})
    ) AS expected(id,version,domain,title,status,package,schema_version,content_hash,engine_version,study_area_id,intended_use_id,intended_use_version,model_pack_id,model_pack_version,model_pack_digest)
    LEFT JOIN scenario_templates current ON current.id=expected.id AND current.version=expected.version
    WHERE current.id IS NULL OR current.domain IS DISTINCT FROM expected.domain
       OR current.title IS DISTINCT FROM expected.title
       OR current.status IS DISTINCT FROM expected.status
       OR current.package IS DISTINCT FROM expected.package
       OR current.schema_version IS DISTINCT FROM expected.schema_version
       OR current.content_hash IS DISTINCT FROM expected.content_hash
       OR current.engine_version IS DISTINCT FROM expected.engine_version
       OR current.study_area_id IS DISTINCT FROM expected.study_area_id
       OR current.intended_use_id IS DISTINCT FROM expected.intended_use_id
       OR current.intended_use_version IS DISTINCT FROM expected.intended_use_version
       OR current.model_pack_id IS DISTINCT FROM expected.model_pack_id
       OR current.model_pack_version IS DISTINCT FROM expected.model_pack_version
       OR current.model_pack_digest IS DISTINCT FROM expected.model_pack_digest
  ) THEN
    RAISE EXCEPTION 'BVR KILL demonstration exact identity readback failed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM scenario_templates
    WHERE id=${sqlText(definition.id)} AND version='1.2.0' AND status='RETIRED'
  ) THEN
    RAISE EXCEPTION 'Historical BVR 1.2.0 retention failed';
  END IF;
END $$;

COMMIT;
`;

const migrationPath = resolve("db/migrations/019_bvr_kill_demonstration.sql");
if (checkOnly) {
  const existing = readFileSync(migrationPath, "utf8");
  if (existing !== generated) throw new Error("BVR KILL demonstration migration is stale.");
} else {
  writeFileSync(migrationPath, generated);
}
process.stdout.write(`${checkOnly ? "verified" : "generated"} frozen 018 and BVR KILL migration 019\n`);
