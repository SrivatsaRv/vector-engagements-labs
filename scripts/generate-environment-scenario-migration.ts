import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { canonicalJson } from "../lib/canonical-json.ts";
import { sha256HexSync } from "../lib/geospatial/digest.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";

const migrationPath = resolve("db/migrations/014_environment_pack_runways.sql");
const startMarker = "-- BEGIN GENERATED ENVIRONMENT-PACK SCENARIO PACKAGES";
const endMarker = "-- END GENERATED ENVIRONMENT-PACK SCENARIO PACKAGES";
const checkOnly = process.argv.includes("--check");
const knownArguments = new Set(["--check", "--write"]);
for (const argument of process.argv.slice(2)) {
  if (!knownArguments.has(argument)) throw new Error(`Unknown argument: ${argument}`);
}
if (!checkOnly && !process.argv.includes("--write")) {
  throw new Error("Pass --write to regenerate the migration or --check to verify it.");
}

const escapeSqlLiteral = (value: string) => value.replaceAll("'", "''");
const statements = SCENARIO_LIBRARY.map((definition) => {
  const tag = `vector_environment_${definition.id.replaceAll("-", "_")}`;
  const packageJson = canonicalJson(definition);
  if (packageJson.includes(`$${tag}$`)) throw new Error(`Dollar-quote collision for ${definition.id}.`);
  return `UPDATE scenario_templates SET package=$${tag}$${packageJson}$${tag}$::jsonb, content_hash='${sha256HexSync(definition)}' WHERE id='${escapeSqlLiteral(definition.id)}' AND version='${escapeSqlLiteral(definition.version)}' AND schema_version='vector.scenario.v4';`;
}).join("\n");
const generated = `${startMarker}\n-- Run \`npm run environment:migration:generate\` after changing a governed scenario package.\n${statements}\n\nDO $$\nBEGIN\n  IF EXISTS (\n    SELECT 1 FROM scenario_templates\n    WHERE schema_version <> 'vector.scenario.v4'\n       OR package->>'environment' NOT LIKE 'Sourced regional terrain and atmosphere%'\n       OR package::text LIKE '%terrain and runway fidelity is synthetic or unavailable%'\n  ) THEN\n    RAISE EXCEPTION 'EnvironmentPack migration did not update every governed scenario package';\n  END IF;\nEND $$;\n${endMarker}`;
const existing = readFileSync(migrationPath, "utf8");
const start = existing.indexOf(startMarker);
const end = existing.indexOf(endMarker);
if (start < 0 || end < start) throw new Error("Environment scenario migration markers are missing or out of order.");
const expected = `${existing.slice(0, start)}${generated}${existing.slice(end + endMarker.length)}`;

if (checkOnly) {
  if (existing !== expected) throw new Error("Environment scenario migration is stale; run npm run environment:migration:generate.");
  process.stdout.write(`verified ${SCENARIO_LIBRARY.length} EnvironmentPack scenario packages\n`);
} else {
  writeFileSync(migrationPath, expected);
  process.stdout.write(`generated ${SCENARIO_LIBRARY.length} EnvironmentPack scenario packages\n`);
}
