import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { canonicalJson } from "../lib/canonical-json.ts";
import { ENGINE_VERSION } from "../lib/engine/version.ts";
import { sha256HexSync } from "../lib/geospatial/digest.ts";
import { SCENARIO_PACKAGE_SCHEMA_VERSION } from "../lib/scenario-package.ts";
import {
  HIGH_ENERGY_CROSSING_CHALLENGE_ID,
  SCENARIO_LIBRARY,
} from "../lib/scenarios.ts";

const checkOnly = process.argv.includes("--check");
const write = process.argv.includes("--write");
const knownArguments = new Set(["--check", "--write"]);
for (const argument of process.argv.slice(2)) {
  if (!knownArguments.has(argument)) throw new Error(`Unknown argument: ${argument}`);
}
if (checkOnly === write) throw new Error("Pass exactly one of --write or --check.");

const escapeSqlLiteral = (value: string) => value.replaceAll("'", "''");
const sqlText = (value: string) => `'${escapeSqlLiteral(value)}'`;

function verifyOrWriteMigration(input: {
  migrationPath: string;
  startMarker: string;
  endMarker: string;
  generated: string;
  staleMessage: string;
  successMessage: string;
}) {
  const existing = readFileSync(input.migrationPath, "utf8");
  const start = existing.indexOf(input.startMarker);
  const end = existing.indexOf(input.endMarker);
  if (start < 0 || end < start) throw new Error("Scenario migration markers are missing or out of order.");
  const expected = `${existing.slice(0, start)}${input.generated}${existing.slice(end + input.endMarker.length)}`;

  if (checkOnly) {
    if (existing !== expected) throw new Error(input.staleMessage);
  } else {
    writeFileSync(input.migrationPath, expected);
  }
  process.stdout.write(`${checkOnly ? "verified" : "generated"} ${input.successMessage}\n`);
}

function historicalMigration() {
  const definitions = SCENARIO_LIBRARY.filter(
    (definition) => definition.id !== HIGH_ENERGY_CROSSING_CHALLENGE_ID,
  );
  const migrationPath = resolve("db/migrations/015_generic_ground_dynamics.sql");
  const startMarker = "-- BEGIN GENERATED GENERIC-GROUND-DYNAMICS SCENARIO PACKAGES";
  const endMarker = "-- END GENERATED GENERIC-GROUND-DYNAMICS SCENARIO PACKAGES";
  const scenarioStatements = definitions.map((definition) => {
    const tag = `vector_ground_dynamics_${definition.id.replaceAll("-", "_")}`;
    const packageJson = canonicalJson(definition);
    if (packageJson.includes(`$${tag}$`)) throw new Error(`Dollar-quote collision for ${definition.id}.`);
    return `INSERT INTO scenario_templates (id,version,domain,title,status,package,schema_version,content_hash,engine_version,study_area_id,intended_use_id,intended_use_version,model_pack_id,model_pack_version,model_pack_digest) VALUES (${sqlText(definition.id)},${sqlText(definition.version)},${sqlText(definition.domain)},${sqlText(definition.title)},'VALIDATED',$${tag}$${packageJson}$${tag}$::jsonb,'vector.scenario.v4','${sha256HexSync(definition)}','browser-point-mass-v0.5',${sqlText(definition.scenario.studyAreaId)},${sqlText(definition.intendedUse.id)},${sqlText(definition.intendedUse.version)},${sqlText(definition.modelPack.id)},${sqlText(definition.modelPack.version)},${sqlText(definition.modelPack.digest)}) ON CONFLICT (id,version) DO UPDATE SET domain=EXCLUDED.domain,title=EXCLUDED.title,status=EXCLUDED.status,package=EXCLUDED.package,schema_version=EXCLUDED.schema_version,content_hash=EXCLUDED.content_hash,engine_version=EXCLUDED.engine_version,study_area_id=EXCLUDED.study_area_id,intended_use_id=EXCLUDED.intended_use_id,intended_use_version=EXCLUDED.intended_use_version,model_pack_id=EXCLUDED.model_pack_id,model_pack_version=EXCLUDED.model_pack_version,model_pack_digest=EXCLUDED.model_pack_digest;`;
  }).join("\n");
  const expectedScenarioRows = definitions.map((definition) =>
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
  verifyOrWriteMigration({
    migrationPath,
    startMarker,
    endMarker,
    generated,
    staleMessage: "Ground-dynamics scenario migration is stale; run npm run ground-dynamics:migration:generate.",
    successMessage: `${definitions.length} historical scenario packages`,
  });
}

function challengeMigration() {
  const definitions = SCENARIO_LIBRARY.filter(
    (definition) => definition.id === HIGH_ENERGY_CROSSING_CHALLENGE_ID,
  );
  if (definitions.length !== 1) {
    throw new Error("The high-energy crossing challenge must have one exact scenario definition.");
  }
  const [definition] = definitions;
  const migrationPath = resolve("db/migrations/016_high_energy_crossing_challenge.sql");
  const startMarker = "-- BEGIN GENERATED HIGH-ENERGY CROSSING CHALLENGE";
  const endMarker = "-- END GENERATED HIGH-ENERGY CROSSING CHALLENGE";
  const tag = "vector_high_energy_crossing_challenge";
  const packageJson = canonicalJson(definition);
  if (packageJson.includes(`$${tag}$`)) throw new Error("High-energy crossing challenge dollar-quote collision.");
  const contentHash = sha256HexSync(definition);
  const packageSql = `$${tag}$${packageJson}$${tag}$::jsonb`;
  const generated = `${startMarker}
-- Run \`npm run ground-dynamics:migration:generate\` after changing the governed challenge package.
INSERT INTO scenario_templates
  (id,version,domain,title,status,package,schema_version,content_hash,engine_version,study_area_id,
   intended_use_id,intended_use_version,model_pack_id,model_pack_version,model_pack_digest)
VALUES (
  ${sqlText(definition.id)},${sqlText(definition.version)},${sqlText(definition.domain)},${sqlText(definition.title)},'VALIDATED',
  ${packageSql},${sqlText(SCENARIO_PACKAGE_SCHEMA_VERSION)},${sqlText(contentHash)},${sqlText(ENGINE_VERSION)},
  ${sqlText(definition.scenario.studyAreaId)},${sqlText(definition.intendedUse.id)},${sqlText(definition.intendedUse.version)},
  ${sqlText(definition.modelPack.id)},${sqlText(definition.modelPack.version)},${sqlText(definition.modelPack.digest)}
)
ON CONFLICT (id,version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM scenario_templates current
    WHERE current.id=${sqlText(definition.id)}
      AND current.version=${sqlText(definition.version)}
      AND current.domain=${sqlText(definition.domain)}
      AND current.title=${sqlText(definition.title)}
      AND current.status='VALIDATED'
      AND current.package=${packageSql}
      AND current.schema_version=${sqlText(SCENARIO_PACKAGE_SCHEMA_VERSION)}
      AND current.content_hash=${sqlText(contentHash)}
      AND current.engine_version=${sqlText(ENGINE_VERSION)}
      AND current.study_area_id=${sqlText(definition.scenario.studyAreaId)}
      AND current.intended_use_id=${sqlText(definition.intendedUse.id)}
      AND current.intended_use_version=${sqlText(definition.intendedUse.version)}
      AND current.model_pack_id=${sqlText(definition.modelPack.id)}
      AND current.model_pack_version=${sqlText(definition.modelPack.version)}
      AND current.model_pack_digest=${sqlText(definition.modelPack.digest)}
  ) THEN
    RAISE EXCEPTION 'High-energy crossing challenge exact identity/hash readback failed';
  END IF;
END $$;
${endMarker}`;
  verifyOrWriteMigration({
    migrationPath,
    startMarker,
    endMarker,
    generated,
    staleMessage: "High-energy crossing challenge migration is stale; run npm run high-energy-crossing:migration:generate.",
    successMessage: `${definition.id}@${definition.version} ${contentHash}`,
  });
}

historicalMigration();
challengeMigration();
