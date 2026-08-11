import assert from "node:assert/strict";
import postgres from "postgres";
import {
  CURRENT_MODEL_PACK_ID,
  CURRENT_MODEL_PACK_VERSION,
} from "../lib/reference-model-pack.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const sql = postgres(connectionString, { max: 1 });

async function expectRejectedTransaction(action, pattern) {
  await sql.unsafe("BEGIN");
  try {
    await assert.rejects(action(), pattern);
  } finally {
    await sql.unsafe("ROLLBACK");
  }
}

try {
  const triggers = await sql`SELECT tgname
    FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgname IN (
        'intended_use_contract_validate_insert',
        'model_pack_source_validate_insert',
        'compiled_model_pack_validate_insert',
        'credibility_manifest_validate_insert',
        'intended_use_contract_immutable',
        'model_pack_source_immutable',
        'compiled_model_pack_immutable',
        'credibility_manifest_immutable'
      )`;
  assert.equal(triggers.length, 8);

  await expectRejectedTransaction(
    () => sql`UPDATE compiled_model_packs
      SET payload=payload
      WHERE id=${CURRENT_MODEL_PACK_ID} AND version=${CURRENT_MODEL_PACK_VERSION}`,
    /immutable; publish a new version/,
  );

  await expectRejectedTransaction(
    () => sql`INSERT INTO compiled_model_packs
      (id,version,schema_version,source_id,source_version,source_hash,digest,payload,credibility_manifest_id,credibility_manifest_version)
      SELECT id,'invalid-admission-test',schema_version,source_id,source_version,source_hash,digest,payload,credibility_manifest_id,credibility_manifest_version
      FROM compiled_model_packs
      WHERE id=${CURRENT_MODEL_PACK_ID} AND version=${CURRENT_MODEL_PACK_VERSION}`,
    /payload is not an identity-consistent SI artifact/,
  );

  process.stdout.write("credibility catalog immutability and insert admission verified\n");
} finally {
  await sql.end();
}
