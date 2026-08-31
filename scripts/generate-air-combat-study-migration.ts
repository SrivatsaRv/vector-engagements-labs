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

const escapeSql = (value: string) => value.replaceAll("'", "''");
const sqlText = (value: string) => `'${escapeSql(value)}'`;
const dollarJson = (tag: string, value: unknown) => {
  const json = canonicalJson(value);
  if (json.includes(`$${tag}$`)) throw new Error(`Dollar-quote collision for ${tag}.`);
  return `$${tag}$${json}$${tag}$::jsonb`;
};

const currentIds = new Set<string>(CURRENT_AIR_COMBAT_STUDY_IDS);
const studies = SCENARIO_LIBRARY.filter(({ id }) => currentIds.has(id));
if (
  studies.length !== CURRENT_AIR_COMBAT_STUDY_IDS.length
  || studies.some(({ version, authoredProfile }) =>
    version !== "1.2.0" || authoredProfile?.schemaVersion !== "vector.authored-route-profile.v1"
  )
) {
  throw new Error("The current Air-combat study set is incomplete or not governed at 1.2.0.");
}

const insertStatements = studies.map((definition) => {
  const tag = `vector_air_combat_018_${definition.id.replaceAll("-", "_")}`;
  return `INSERT INTO scenario_templates (id,version,domain,title,status,package,schema_version,content_hash,engine_version,study_area_id,intended_use_id,intended_use_version,model_pack_id,model_pack_version,model_pack_digest) VALUES (${sqlText(definition.id)},${sqlText(definition.version)},${sqlText(definition.domain)},${sqlText(definition.title)},'VALIDATED',${dollarJson(tag, definition)},${sqlText(SCENARIO_PACKAGE_SCHEMA_VERSION)},${sqlText(sha256HexSync(definition))},${sqlText(ENGINE_VERSION)},${sqlText(definition.scenario.studyAreaId)},${sqlText(definition.intendedUse.id)},${sqlText(definition.intendedUse.version)},${sqlText(definition.modelPack.id)},${sqlText(definition.modelPack.version)},${sqlText(definition.modelPack.digest)}) ON CONFLICT (id,version) DO NOTHING;`;
}).join("\n");

const expectedRows = studies.map((definition) =>
  `(${sqlText(definition.id)},${sqlText(definition.version)},${sqlText(definition.domain)},${sqlText(definition.title)},'VALIDATED',${dollarJson(`vector_air_combat_018_expected_${definition.id.replaceAll("-", "_")}`, definition)},${sqlText(SCENARIO_PACKAGE_SCHEMA_VERSION)},${sqlText(sha256HexSync(definition))},${sqlText(ENGINE_VERSION)},${sqlText(definition.scenario.studyAreaId)},${sqlText(definition.intendedUse.id)},${sqlText(definition.intendedUse.version)},${sqlText(definition.modelPack.id)},${sqlText(definition.modelPack.version)},${sqlText(definition.modelPack.digest)})`,
).join(",\n      ");

const idList = studies.map(({ id }) => sqlText(id)).join(",");
const generated = `-- Forward-only publication of the three governed Air-combat studies owned by issue #197.
BEGIN;

${insertStatements}

-- Superseded packages remain immutable and independently addressable, but
-- only the authored-route 1.2.0 versions are offered as current inputs.
UPDATE scenario_templates
SET status='RETIRED'
WHERE version='1.1.0'
  AND id IN (${idList})
  AND status='VALIDATED';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ${expectedRows}
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
    RAISE EXCEPTION 'Air-combat study exact identity readback failed';
  END IF;
  IF (
    SELECT count(*) FROM scenario_templates
    WHERE version='1.1.0' AND id IN (${idList}) AND status='RETIRED'
  ) <> ${studies.length} THEN
    RAISE EXCEPTION 'Superseded Air-combat study retention failed';
  END IF;
END $$;

COMMIT;
`;

const migrationPath = resolve("db/migrations/018_three_air_combat_studies.sql");
if (checkOnly) {
  const existing = readFileSync(migrationPath, "utf8");
  if (existing !== generated) throw new Error("Air-combat study migration is stale.");
} else {
  writeFileSync(migrationPath, generated);
}
process.stdout.write(`${checkOnly ? "verified" : "generated"} three Air-combat study migration\n`);
