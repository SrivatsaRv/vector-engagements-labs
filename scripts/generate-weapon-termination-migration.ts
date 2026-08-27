import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { canonicalJson } from "../lib/canonical-json.ts";
import { ENGINE_VERSION } from "../lib/engine/version.ts";
import { sha256HexSync } from "../lib/geospatial/digest.ts";
import { compileModelPack } from "../lib/model-pack.ts";
import { createCurrentModelPackSource } from "../lib/reference-model-pack.ts";
import { SCENARIO_PACKAGE_SCHEMA_VERSION } from "../lib/scenario-package.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";

const checkOnly = process.argv.includes("--check");
const write = process.argv.includes("--write");
if (checkOnly === write) throw new Error("Pass exactly one of --write or --check.");
if (process.argv.slice(2).some((argument) => !["--check", "--write"].includes(argument))) throw new Error("Unknown argument.");

const escapeSql = (value: string) => value.replaceAll("'", "''");
const sqlText = (value: string) => `'${escapeSql(value)}'`;
const dollarJson = (tag: string, value: unknown) => {
  const json = canonicalJson(value);
  if (json.includes(`$${tag}$`)) throw new Error(`Dollar-quote collision for ${tag}.`);
  return `$${tag}$${json}$${tag}$::jsonb`;
};

const source = createCurrentModelPackSource();
const bundle = await compileModelPack(source);
const intendedUse = source.intendedUses[0]!;
const manifest = bundle.credibilityManifest;
const sourceHash = createHash("sha256").update(canonicalJson(source)).digest("hex");
const historicalFixture = JSON.parse(
  readFileSync(resolve("fixtures/model-packs/vector-scalar-study-v0.8.compiled.json"), "utf8"),
) as { pack: Record<string, unknown>; credibilityManifest: Record<string, unknown> };
const historicalSource = structuredClone(source);
historicalSource.version = "0.8.0";
historicalSource.intendedUses[0]!.version = "1.0.0";
historicalSource.intendedUses[0]!.unsupportedInterpretations = historicalSource.intendedUses[0]!
  .unsupportedInterpretations.filter(
    (value) => value !== "target damage, destruction, or kill from a geometric weapon intercept",
  );
historicalSource.credibility.version = "1.2.0";
historicalSource.credibility.intendedUseRefs[0]!.version = "1.0.0";
for (const weapon of historicalSource.weapons) {
  delete (weapon as unknown as Record<string, unknown>).termination;
}
const historicalSourceHash = createHash("sha256")
  .update(canonicalJson(historicalSource))
  .digest("hex");
if (historicalSourceHash !== "01bf4211dc40c6c3055be2afc2ed69d82782731627cef9fea67cac003be4bfed") {
  throw new Error(`Historical model-pack 0.8.0 source identity drifted: ${historicalSourceHash}.`);
}
if (
  historicalFixture.pack.id !== source.id ||
  historicalFixture.pack.version !== "0.8.0" ||
  historicalFixture.pack.digest !== "199356d524d6b3c85205ca9f16f701b6b7c8f5a7026918d9c6fd8ce6ad52fc73" ||
  historicalFixture.credibilityManifest.id !== manifest.id ||
  historicalFixture.credibilityManifest.version !== "1.2.0"
) {
  throw new Error("Historical model-pack 0.8.0 fixture identity drifted.");
}
const historicalIntendedUse = historicalSource.intendedUses[0]!;
const migrationPath = resolve("db/migrations/017_weapon_termination_model.sql");
const startMarker = "-- BEGIN GENERATED WEAPON TERMINATION MODEL";
const endMarker = "-- END GENERATED WEAPON TERMINATION MODEL";

const scenarioStatements = SCENARIO_LIBRARY.map((definition) => {
  const tag = `vector_weapon_termination_${definition.id.replaceAll("-", "_")}`;
  return `INSERT INTO scenario_templates (id,version,domain,title,status,package,schema_version,content_hash,engine_version,study_area_id,intended_use_id,intended_use_version,model_pack_id,model_pack_version,model_pack_digest) VALUES (${sqlText(definition.id)},${sqlText(definition.version)},${sqlText(definition.domain)},${sqlText(definition.title)},'VALIDATED',${dollarJson(tag, definition)},${sqlText(SCENARIO_PACKAGE_SCHEMA_VERSION)},${sqlText(sha256HexSync(definition))},${sqlText(ENGINE_VERSION)},${sqlText(definition.scenario.studyAreaId)},${sqlText(definition.intendedUse.id)},${sqlText(definition.intendedUse.version)},${sqlText(definition.modelPack.id)},${sqlText(definition.modelPack.version)},${sqlText(definition.modelPack.digest)}) ON CONFLICT (id,version) DO NOTHING;`;
}).join("\n");

const expectedRows = SCENARIO_LIBRARY.map((definition) =>
  `(${sqlText(definition.id)},${sqlText(definition.version)},${sqlText(sha256HexSync(definition))},${sqlText(definition.intendedUse.version)},${sqlText(definition.modelPack.version)},${sqlText(definition.modelPack.digest)})`,
).join(",\n      ");

const generated = `${startMarker}
-- Immutable verification-only geometric weapon-termination authority owned by issue #28.
-- Retain the complete 0.8.0 authority chain required by immutable scenario@1.0.0 rows.
INSERT INTO intended_use_contracts (id,version,schema_version,definition,content_hash)
VALUES (${sqlText(historicalIntendedUse.id)},${sqlText(historicalIntendedUse.version)},${sqlText(historicalIntendedUse.schemaVersion)},${dollarJson("vector_weapon_termination_historical_intended_use", historicalIntendedUse)},${sqlText(sha256HexSync(historicalIntendedUse))})
ON CONFLICT (id,version) DO NOTHING;

INSERT INTO model_pack_sources (id,version,schema_version,definition,content_hash,lifecycle_status)
VALUES (${sqlText(historicalSource.id)},${sqlText(historicalSource.version)},${sqlText(historicalSource.schemaVersion)},${dollarJson("vector_weapon_termination_historical_source", historicalSource)},${sqlText(historicalSourceHash)},'PUBLISHED')
ON CONFLICT (id,version) DO NOTHING;

INSERT INTO credibility_manifests (id,version,schema_version,subject_kind,subject_id,subject_digest,manifest,content_hash,approval_state)
VALUES (${sqlText(String(historicalFixture.credibilityManifest.id))},${sqlText(String(historicalFixture.credibilityManifest.version))},${sqlText(String(historicalFixture.credibilityManifest.schemaVersion))},'MODEL_PACK',${sqlText(String(historicalFixture.pack.id))},${sqlText(String(historicalFixture.pack.digest))},${dollarJson("vector_weapon_termination_historical_manifest", historicalFixture.credibilityManifest)},${sqlText(String(historicalFixture.credibilityManifest.contentDigest))},${sqlText(String(historicalFixture.credibilityManifest.approvalState))})
ON CONFLICT (id,version) DO NOTHING;

INSERT INTO compiled_model_packs (id,version,schema_version,source_id,source_version,source_hash,digest,payload,credibility_manifest_id,credibility_manifest_version)
VALUES (${sqlText(String(historicalFixture.pack.id))},${sqlText(String(historicalFixture.pack.version))},${sqlText(String(historicalFixture.pack.schemaVersion))},${sqlText(historicalSource.id)},${sqlText(historicalSource.version)},${sqlText(historicalSourceHash)},${sqlText(String(historicalFixture.pack.digest))},${dollarJson("vector_weapon_termination_historical_pack", historicalFixture.pack)},${sqlText(String(historicalFixture.credibilityManifest.id))},${sqlText(String(historicalFixture.credibilityManifest.version))})
ON CONFLICT (id,version) DO NOTHING;

INSERT INTO intended_use_contracts (id,version,schema_version,definition,content_hash)
VALUES (${sqlText(intendedUse.id)},${sqlText(intendedUse.version)},${sqlText(intendedUse.schemaVersion)},${dollarJson("vector_weapon_termination_intended_use", intendedUse)},${sqlText(sha256HexSync(intendedUse))})
ON CONFLICT (id,version) DO NOTHING;

INSERT INTO model_pack_sources (id,version,schema_version,definition,content_hash,lifecycle_status)
VALUES (${sqlText(source.id)},${sqlText(source.version)},${sqlText(source.schemaVersion)},${dollarJson("vector_weapon_termination_source", source)},${sqlText(sourceHash)},'PUBLISHED')
ON CONFLICT (id,version) DO NOTHING;

INSERT INTO credibility_manifests (id,version,schema_version,subject_kind,subject_id,subject_digest,manifest,content_hash,approval_state)
VALUES (${sqlText(manifest.id)},${sqlText(manifest.version)},${sqlText(manifest.schemaVersion)},'MODEL_PACK',${sqlText(manifest.subject.id)},${sqlText(manifest.subject.digest)},${dollarJson("vector_weapon_termination_manifest", manifest)},${sqlText(manifest.contentDigest)},${sqlText(manifest.approvalState)})
ON CONFLICT (id,version) DO NOTHING;

INSERT INTO compiled_model_packs (id,version,schema_version,source_id,source_version,source_hash,digest,payload,credibility_manifest_id,credibility_manifest_version)
VALUES (${sqlText(bundle.pack.id)},${sqlText(bundle.pack.version)},${sqlText(bundle.pack.schemaVersion)},${sqlText(source.id)},${sqlText(source.version)},${sqlText(sourceHash)},${sqlText(bundle.pack.digest)},${dollarJson("vector_weapon_termination_pack", bundle.pack)},${sqlText(manifest.id)},${sqlText(manifest.version)})
ON CONFLICT (id,version) DO NOTHING;

${scenarioStatements}

-- Historical 1.0.0 packages remain immutable and independently resolvable for
-- audit/replay, but their 0.8.0 pack has no weapon-termination authority and
-- therefore cannot be offered as executable input to the current engine.
UPDATE scenario_templates
SET status='RETIRED'
WHERE version='1.0.0'
  AND id IN (${SCENARIO_LIBRARY.map((definition) => sqlText(definition.id)).join(",")})
  AND intended_use_id=${sqlText(historicalIntendedUse.id)}
  AND intended_use_version=${sqlText(historicalIntendedUse.version)}
  AND model_pack_id=${sqlText(String(historicalFixture.pack.id))}
  AND model_pack_version=${sqlText(String(historicalFixture.pack.version))}
  AND model_pack_digest=${sqlText(String(historicalFixture.pack.digest))};

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM intended_use_contracts
    WHERE id=${sqlText(historicalIntendedUse.id)} AND version=${sqlText(historicalIntendedUse.version)}
      AND schema_version=${sqlText(historicalIntendedUse.schemaVersion)}
      AND definition=${dollarJson("vector_weapon_termination_historical_intended_use", historicalIntendedUse)}
      AND content_hash=${sqlText(sha256HexSync(historicalIntendedUse))}
  ) THEN
    RAISE EXCEPTION 'Historical intended-use exact identity readback failed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM model_pack_sources
    WHERE id=${sqlText(historicalSource.id)} AND version=${sqlText(historicalSource.version)}
      AND schema_version=${sqlText(historicalSource.schemaVersion)}
      AND definition=${dollarJson("vector_weapon_termination_historical_source", historicalSource)}
      AND content_hash=${sqlText(historicalSourceHash)} AND lifecycle_status='PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'Historical model-pack source exact identity readback failed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM credibility_manifests
    WHERE id=${sqlText(String(historicalFixture.credibilityManifest.id))}
      AND version=${sqlText(String(historicalFixture.credibilityManifest.version))}
      AND schema_version=${sqlText(String(historicalFixture.credibilityManifest.schemaVersion))}
      AND subject_kind='MODEL_PACK'
      AND subject_id=${sqlText(String(historicalFixture.pack.id))}
      AND subject_digest=${sqlText(String(historicalFixture.pack.digest))}
      AND manifest=${dollarJson("vector_weapon_termination_historical_manifest", historicalFixture.credibilityManifest)}
      AND content_hash=${sqlText(String(historicalFixture.credibilityManifest.contentDigest))}
      AND approval_state=${sqlText(String(historicalFixture.credibilityManifest.approvalState))}
  ) THEN
    RAISE EXCEPTION 'Historical credibility-manifest exact identity readback failed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM compiled_model_packs
    WHERE id=${sqlText(String(historicalFixture.pack.id))} AND version=${sqlText(String(historicalFixture.pack.version))}
      AND schema_version=${sqlText(String(historicalFixture.pack.schemaVersion))}
      AND source_id=${sqlText(historicalSource.id)} AND source_version=${sqlText(historicalSource.version)}
      AND source_hash=${sqlText(historicalSourceHash)} AND digest=${sqlText(String(historicalFixture.pack.digest))}
      AND payload=${dollarJson("vector_weapon_termination_historical_pack", historicalFixture.pack)}
      AND credibility_manifest_id=${sqlText(String(historicalFixture.credibilityManifest.id))}
      AND credibility_manifest_version=${sqlText(String(historicalFixture.credibilityManifest.version))}
  ) THEN
    RAISE EXCEPTION 'Historical model-pack 0.8.0 exact identity readback failed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM intended_use_contracts
    WHERE id=${sqlText(intendedUse.id)} AND version=${sqlText(intendedUse.version)}
      AND schema_version=${sqlText(intendedUse.schemaVersion)}
      AND definition=${dollarJson("vector_weapon_termination_intended_use", intendedUse)}
      AND content_hash=${sqlText(sha256HexSync(intendedUse))}
  ) THEN
    RAISE EXCEPTION 'Weapon termination intended-use exact identity readback failed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM model_pack_sources
    WHERE id=${sqlText(source.id)} AND version=${sqlText(source.version)}
      AND schema_version=${sqlText(source.schemaVersion)}
      AND definition=${dollarJson("vector_weapon_termination_source", source)}
      AND content_hash=${sqlText(sourceHash)} AND lifecycle_status='PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'Weapon termination model-pack source exact identity readback failed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM credibility_manifests
    WHERE id=${sqlText(manifest.id)} AND version=${sqlText(manifest.version)}
      AND schema_version=${sqlText(manifest.schemaVersion)} AND subject_kind='MODEL_PACK'
      AND subject_id=${sqlText(manifest.subject.id)} AND subject_digest=${sqlText(manifest.subject.digest)}
      AND manifest=${dollarJson("vector_weapon_termination_manifest", manifest)}
      AND content_hash=${sqlText(manifest.contentDigest)}
      AND approval_state=${sqlText(manifest.approvalState)}
  ) THEN
    RAISE EXCEPTION 'Weapon termination credibility-manifest exact identity readback failed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM compiled_model_packs
    WHERE id=${sqlText(bundle.pack.id)} AND version=${sqlText(bundle.pack.version)}
      AND schema_version=${sqlText(bundle.pack.schemaVersion)}
      AND source_id=${sqlText(source.id)} AND source_version=${sqlText(source.version)}
      AND source_hash=${sqlText(sourceHash)} AND digest=${sqlText(bundle.pack.digest)}
      AND payload=${dollarJson("vector_weapon_termination_pack", bundle.pack)}
      AND credibility_manifest_id=${sqlText(manifest.id)}
      AND credibility_manifest_version=${sqlText(manifest.version)}
  ) THEN
    RAISE EXCEPTION 'Weapon termination model-pack exact identity readback failed';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ${expectedRows}
    ) AS expected(id,version,content_hash,intended_use_version,model_pack_version,model_pack_digest)
    LEFT JOIN scenario_templates current ON current.id=expected.id AND current.version=expected.version
    WHERE current.id IS NULL OR current.content_hash<>expected.content_hash
       OR current.intended_use_version<>expected.intended_use_version
       OR current.model_pack_version<>expected.model_pack_version
       OR current.model_pack_digest<>expected.model_pack_digest
  ) THEN
    RAISE EXCEPTION 'Weapon termination scenario exact identity readback failed';
  END IF;
  IF (
    SELECT count(*) FROM scenario_templates
    WHERE version='1.0.0'
      AND id IN (${SCENARIO_LIBRARY.map((definition) => sqlText(definition.id)).join(",")})
      AND status='RETIRED'
      AND intended_use_id=${sqlText(historicalIntendedUse.id)}
      AND intended_use_version=${sqlText(historicalIntendedUse.version)}
      AND model_pack_id=${sqlText(String(historicalFixture.pack.id))}
      AND model_pack_version=${sqlText(String(historicalFixture.pack.version))}
      AND model_pack_digest=${sqlText(String(historicalFixture.pack.digest))}
  ) <> ${SCENARIO_LIBRARY.length} THEN
    RAISE EXCEPTION 'Historical scenario 1.0.0 authority retention failed';
  END IF;
END $$;
${endMarker}`;

const existing = readFileSync(migrationPath, "utf8");
const start = existing.indexOf(startMarker);
const end = existing.indexOf(endMarker);
if (start < 0 || end < start) throw new Error("Weapon termination migration markers are missing.");
const expected = `${existing.slice(0, start)}${generated}${existing.slice(end + endMarker.length)}`;
if (checkOnly) {
  if (existing !== expected) throw new Error("Weapon termination migration is stale.");
} else {
  writeFileSync(migrationPath, expected);
}
process.stdout.write(`${checkOnly ? "verified" : "generated"} weapon termination migration ${bundle.pack.digest}\n`);
