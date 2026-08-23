import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
if (process.env.VECTOR_DB_FIXTURE_MODE !== "aircraft-evidence-v1-upgrade") {
  throw new Error("VECTOR_DB_FIXTURE_MODE=aircraft-evidence-v1-upgrade is required");
}

function seedCurrentCatalog() {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/seed-db.ts"],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: connectionString },
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(`catalog seed failed during upgrade regression: ${result.stderr || result.stdout}`);
  }
}

seedCurrentCatalog();
const sql = postgres(connectionString, { max: 1 });
try {
  await sql.begin(async (tx) => {
    await tx`INSERT INTO subsystems
      (id,kind,designation,description,source_ids,data_status)
      VALUES (
        'alq-211v9','EW','AN/ALQ-211(V)9 AIDEWS',
        'Legacy proposed-package fit incorrectly retained by the v1 seed.',
        ${tx.json(["dsca-pakistan-15-80"])},'SOURCED'
      )
      ON CONFLICT (id) DO UPDATE SET
        kind=EXCLUDED.kind,designation=EXCLUDED.designation,description=EXCLUDED.description,
        source_ids=EXCLUDED.source_ids,data_status=EXCLUDED.data_status`;
    await tx`UPDATE platform_variants
      SET ew_id='alq-211v9',radar_id='apg-68v9',datalink_id='link-16'
      WHERE id='f-16c-block52-paf'`;
    await tx`INSERT INTO source_assertions
      (id,entity_type,entity_id,field_path,value_text,condition_text,source_id,confidence,review_state)
      VALUES
      ('f-16c-block52-paf-fact-2-dsca-pakistan-15-80','PLATFORM','f-16c-block52-paf','publicFacts.2','AN/APG-68(V)9','Radar','dsca-pakistan-15-80',0.95,'ACCEPTED'),
      ('f-16c-block52-paf-fact-3-dsca-pakistan-15-80','PLATFORM','f-16c-block52-paf','publicFacts.3','AN/ALQ-211(V)9 AIDEWS','Defensive EW','dsca-pakistan-15-80',0.95,'ACCEPTED'),
      ('f-16c-block52-paf-fact-4-dsca-pakistan-15-80','PLATFORM','f-16c-block52-paf','publicFacts.4','Link 16','Datalink','dsca-pakistan-15-80',0.95,'ACCEPTED')
      ON CONFLICT (id) DO UPDATE SET
        field_path=EXCLUDED.field_path,value_text=EXCLUDED.value_text,
        condition_text=EXCLUDED.condition_text,source_id=EXCLUDED.source_id,
        confidence=EXCLUDED.confidence,review_state=EXCLUDED.review_state`;
  });
  const [legacy] = await sql`SELECT
    (SELECT count(*)::int FROM subsystems WHERE id='alq-211v9') AS alq,
    (SELECT count(*)::int FROM source_assertions
      WHERE entity_id='f-16c-block52-paf' AND review_state='ACCEPTED'
        AND source_id='dsca-pakistan-15-80') AS accepted_dsca`;
  assert.deepEqual(legacy, { alq: 1, accepted_dsca: 3 });

  seedCurrentCatalog();

  const [reconciled] = await sql`SELECT
    (SELECT count(*)::int FROM subsystems WHERE id='alq-211v9') AS alq,
    (SELECT count(*)::int FROM source_assertions
      WHERE entity_id='f-16c-block52-paf'
        AND (source_id='dsca-pakistan-15-80' OR condition_text='Defensive EW'
          OR value_text ILIKE '%ALQ-211%')) AS retired_assertions,
    (SELECT count(*)::int FROM source_assertions
      WHERE entity_id='f-16c-block52-paf' AND review_state='CONTEXT_ONLY'
        AND condition_text IN ('Engine','Radar','Datalink','AIM-120C-5')) AS context_assertions,
    (SELECT count(*)::int FROM platform_variants
      WHERE id='f-16c-block52-paf' AND ew_id IS NULL AND radar_id IS NULL AND datalink_id IS NULL) AS cleared_fit`;
  assert.deepEqual(reconciled, {
    alq: 0,
    retired_assertions: 0,
    context_assertions: 5,
    cleared_fit: 1,
  });
  process.stdout.write(`aircraft evidence seed upgrade verified: ${JSON.stringify(reconciled)}\n`);
} finally {
  await sql.end();
}
