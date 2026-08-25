import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { canonicalJson } from "../lib/canonical-json.ts";
import { sha256HexSync } from "../lib/geospatial/digest.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";

const migrationPath = resolve("db/migrations/015_generic_ground_dynamics.sql");
const startMarker = "-- BEGIN GENERATED GENERIC-GROUND-DYNAMICS SCENARIO PACKAGES";
const endMarker = "-- END GENERATED GENERIC-GROUND-DYNAMICS SCENARIO PACKAGES";
const checkOnly = process.argv.includes("--check");
const knownArguments = new Set(["--check", "--write"]);
for (const argument of process.argv.slice(2)) {
  if (!knownArguments.has(argument)) throw new Error(`Unknown argument: ${argument}`);
}
if (!checkOnly && !process.argv.includes("--write")) {
  throw new Error("Pass --write to regenerate the migration or --check to verify it.");
}

const escapeSqlLiteral = (value: string) => value.replaceAll("'", "''");
const sqlText = (value: string) => `'${escapeSqlLiteral(value)}'`;
const scenarioStatements = SCENARIO_LIBRARY.map((definition) => {
  const tag = `vector_ground_dynamics_${definition.id.replaceAll("-", "_")}`;
  const packageJson = canonicalJson(definition);
  if (packageJson.includes(`$${tag}$`)) throw new Error(`Dollar-quote collision for ${definition.id}.`);
  return `INSERT INTO scenario_templates (id,version,domain,title,status,package,schema_version,content_hash,engine_version,study_area_id,intended_use_id,intended_use_version,model_pack_id,model_pack_version,model_pack_digest) VALUES (${sqlText(definition.id)},${sqlText(definition.version)},${sqlText(definition.domain)},${sqlText(definition.title)},'VALIDATED',$${tag}$${packageJson}$${tag}$::jsonb,'vector.scenario.v4','${sha256HexSync(definition)}','browser-point-mass-v0.5',${sqlText(definition.scenario.studyAreaId)},${sqlText(definition.intendedUse.id)},${sqlText(definition.intendedUse.version)},${sqlText(definition.modelPack.id)},${sqlText(definition.modelPack.version)},${sqlText(definition.modelPack.digest)}) ON CONFLICT (id,version) DO UPDATE SET domain=EXCLUDED.domain,title=EXCLUDED.title,status=EXCLUDED.status,package=EXCLUDED.package,schema_version=EXCLUDED.schema_version,content_hash=EXCLUDED.content_hash,engine_version=EXCLUDED.engine_version,study_area_id=EXCLUDED.study_area_id,intended_use_id=EXCLUDED.intended_use_id,intended_use_version=EXCLUDED.intended_use_version,model_pack_id=EXCLUDED.model_pack_id,model_pack_version=EXCLUDED.model_pack_version,model_pack_digest=EXCLUDED.model_pack_digest;`;
}).join("\n");
const expectedScenarioRows = SCENARIO_LIBRARY.map((definition) =>
  `(${sqlText(definition.id)},${sqlText(definition.version)},'vector.scenario.v4','${sha256HexSync(definition)}',${sqlText(definition.environment)})`,
).join(",\n      ");

const generated = `${startMarker}
-- Run \`npm run ground-dynamics:migration:generate\` after changing the governed projection or scenario package.
${scenarioStatements}

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ${expectedScenarioRows}
    ) AS expected(id, version, schema_version, content_hash, environment)
    LEFT JOIN scenario_templates current
      ON current.id=expected.id AND current.version=expected.version
    WHERE current.id IS NULL
       OR current.schema_version<>expected.schema_version
       OR current.content_hash<>expected.content_hash
       OR current.package->>'environment'<>expected.environment
  ) THEN
    RAISE EXCEPTION 'Generic ground-dynamics migration exact scenario identity/hash readback failed';
  END IF;
END $$;
${endMarker}`;
const existing = readFileSync(migrationPath, "utf8");
const start = existing.indexOf(startMarker);
const end = existing.indexOf(endMarker);
if (start < 0 || end < start) throw new Error("Ground-dynamics migration markers are missing or out of order.");
const expected = `${existing.slice(0, start)}${generated}${existing.slice(end + endMarker.length)}`;

if (checkOnly) {
  if (existing !== expected) throw new Error("Ground-dynamics scenario migration is stale; run npm run ground-dynamics:migration:generate.");
  process.stdout.write(`verified ${SCENARIO_LIBRARY.length} scenario packages\n`);
} else {
  writeFileSync(migrationPath, expected);
  process.stdout.write(`generated ${SCENARIO_LIBRARY.length} scenario packages\n`);
}
