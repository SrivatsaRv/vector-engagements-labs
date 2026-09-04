import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  loadMigrationManifest,
  verifyMigrationLedger,
} from "../scripts/lib/migration-ledger.mjs";
import {
  readAppliedMigrationLedger,
  verifyDatabaseMigrationLedger,
} from "../scripts/verify-db-migration-ledger.mjs";
import {
  assertAdmittedModelCatalogLineage,
  parseDatabaseVerificationMode,
  runDatabaseVerification,
} from "../scripts/verify-db.mjs";

const checksum = (value) => createHash("sha256").update(value).digest("hex");
const expected = [
  { name: "001_catalog.sql", checksum: checksum("one") },
  { name: "002_saved_runs.sql", checksum: checksum("two") },
  { name: "003_provenance.sql", checksum: checksum("three") },
];
const ledgerCatalog = [
  { relation_kind: "r", column_name: "applied_at", data_type: "timestamp with time zone", not_null: true, primary_key: false },
  { relation_kind: "r", column_name: "checksum", data_type: "text", not_null: true, primary_key: false },
  { relation_kind: "r", column_name: "name", data_type: "text", not_null: true, primary_key: true },
];
const freshModelCatalog = {
  compiledModelPacks: [
    {
      id: "vector-scalar-study-models",
      version: "0.8.0",
      schema_version: "vector.compiled-model-pack.v1",
      digest: "199356d524d6b3c85205ca9f16f701b6b7c8f5a7026918d9c6fd8ce6ad52fc73",
      credibility_manifest_id: "vector-scalar-study-credibility",
      credibility_manifest_version: "1.2.0",
    },
    {
      id: "vector-scalar-study-models",
      version: "0.9.0",
      schema_version: "vector.compiled-model-pack.v1",
      digest: "aecedbb6868395bb6ee2b46c4867c032d358210b1aa5a719cb5a868b24f5917c",
      credibility_manifest_id: "vector-scalar-study-credibility",
      credibility_manifest_version: "1.3.0",
    },
  ],
  credibilityManifests: [
    {
      id: "browser-point-mass-engine-credibility",
      version: "0.7.0",
      schema_version: "vector.credibility-manifest.v1",
      subject_kind: "ENGINE",
      subject_id: "browser-point-mass-v0.5",
      subject_digest: "c59104464d75fa910f8ba79114d50a9ffae31c92875ab9ac6e65f62679ddc4aa",
      content_hash: "7473759b423b19947592d9cf085365215bbbb73679221e7c16e1f76c72aa9b83",
      approval_state: "DRAFT",
    },
    {
      id: "vector-scalar-study-credibility",
      version: "1.2.0",
      schema_version: "vector.credibility-manifest.v1",
      subject_kind: "MODEL_PACK",
      subject_id: "vector-scalar-study-models",
      subject_digest: "199356d524d6b3c85205ca9f16f701b6b7c8f5a7026918d9c6fd8ce6ad52fc73",
      content_hash: "9337bea52bea7c9d96ec3978e179f0af3f309892f6e779533dc6fce80325a22d",
      approval_state: "DRAFT",
    },
    {
      id: "vector-scalar-study-credibility",
      version: "1.3.0",
      schema_version: "vector.credibility-manifest.v1",
      subject_kind: "MODEL_PACK",
      subject_id: "vector-scalar-study-models",
      subject_digest: "aecedbb6868395bb6ee2b46c4867c032d358210b1aa5a719cb5a868b24f5917c",
      content_hash: "c57aa54fc4765c4cf8d2ce30c32b67476395914df14cacd5e55a28d2b2719795",
      approval_state: "DRAFT",
    },
  ],
};
const retainedProductionModelCatalog = {
  compiledModelPacks: [
    {
      id: "vector-scalar-study-models",
      version: "0.5.0",
      schema_version: "vector.compiled-model-pack.v1",
      digest: "181379ad76df8cdbf08666788bf1aace54b05651ce1d2e852487d651c6fb0e1d",
      credibility_manifest_id: "vector-scalar-study-credibility",
      credibility_manifest_version: "1.0.0",
    },
    ...freshModelCatalog.compiledModelPacks,
  ],
  credibilityManifests: [
    {
      id: "browser-point-mass-engine-credibility",
      version: "0.5.0",
      schema_version: "vector.credibility-manifest.v1",
      subject_kind: "ENGINE",
      subject_id: "browser-point-mass-v0.5",
      subject_digest: "c59104464d75fa910f8ba79114d50a9ffae31c92875ab9ac6e65f62679ddc4aa",
      content_hash: "cdb990dbd81e0ae3e946bb5defd1d128e8a91e94a957485f971ec57f638bb626",
      approval_state: "DRAFT",
    },
    {
      id: "vector-scalar-study-credibility",
      version: "1.0.0",
      schema_version: "vector.credibility-manifest.v1",
      subject_kind: "MODEL_PACK",
      subject_id: "vector-scalar-study-models",
      subject_digest: "181379ad76df8cdbf08666788bf1aace54b05651ce1d2e852487d651c6fb0e1d",
      content_hash: "9d9d06dc4fc27fb87a8f49a1b675d5956436e847820c902ac3a7513ad2becb36",
      approval_state: "DRAFT",
    },
    ...freshModelCatalog.credibilityManifests.slice(1),
  ],
};

test("migration ledger admits only an exact checksum-bound prefix", () => {
  assert.deepEqual(verifyMigrationLedger(expected, expected.slice(0, 2)), {
    state: "COMPATIBLE",
    appliedCount: 2,
    pendingCount: 1,
    lastApplied: "002_saved_runs.sql",
    nextPending: "003_provenance.sql",
  });
  assert.deepEqual(verifyMigrationLedger(expected, []), {
    state: "COMPATIBLE",
    appliedCount: 0,
    pendingCount: 3,
    lastApplied: null,
    nextPending: "001_catalog.sql",
  });
});

test("database verifier admits only the two exact repository-produced model catalog histories", () => {
  assert.equal(
    assertAdmittedModelCatalogLineage(
      freshModelCatalog.compiledModelPacks,
      freshModelCatalog.credibilityManifests,
    ),
    "fresh-migrations",
  );
  assert.equal(
    assertAdmittedModelCatalogLineage(
      retainedProductionModelCatalog.compiledModelPacks,
      retainedProductionModelCatalog.credibilityManifests,
    ),
    "retained-production-seed",
  );
  assert.equal(
    assertAdmittedModelCatalogLineage(
      freshModelCatalog.compiledModelPacks.map((row) => Object.assign(Object.create(null), row)),
      freshModelCatalog.credibilityManifests.map((row) => Object.assign(Object.create(null), row)),
    ),
    "fresh-migrations",
  );
});

test("database verifier rejects unknown, altered, missing, and incorrectly bound model history", () => {
  const falsifiers = [
    (catalog) => catalog.compiledModelPacks.push({
      ...catalog.compiledModelPacks.at(-1),
      version: "9.9.9",
    }),
    (catalog) => { catalog.compiledModelPacks[0].digest = "0".repeat(64); },
    (catalog) => { catalog.compiledModelPacks[0].credibility_manifest_version = "1.3.0"; },
    (catalog) => { catalog.compiledModelPacks.splice(0, 1); },
    (catalog) => { catalog.credibilityManifests[0].content_hash = "f".repeat(64); },
    (catalog) => { catalog.credibilityManifests.splice(0, 1); },
    (catalog) => catalog.credibilityManifests.push({
      ...catalog.credibilityManifests.at(-1),
      version: "9.9.9",
    }),
  ];

  for (const falsify of falsifiers) {
    const catalog = structuredClone(retainedProductionModelCatalog);
    falsify(catalog);
    assert.throws(
      () => assertAdmittedModelCatalogLineage(
        catalog.compiledModelPacks,
        catalog.credibilityManifests,
      ),
      /Unrecognized immutable model catalog lineage/u,
    );
  }
});

test("migration ledger rejects gaps, unknown rows, altered checksums, and a database ahead of source", () => {
  assert.throws(
    () => verifyMigrationLedger(expected, [expected[0], expected[2]]),
    /not a contiguous prefix.*002_saved_runs\.sql.*003_provenance\.sql/u,
  );
  assert.throws(
    () => verifyMigrationLedger(expected, [expected[0], { name: "999_unknown.sql", checksum: checksum("unknown") }]),
    /unknown migration 999_unknown\.sql/u,
  );
  assert.throws(
    () => verifyMigrationLedger(expected, [{ ...expected[0], checksum: checksum("altered") }]),
    /001_catalog\.sql checksum does not match/u,
  );
  assert.throws(
    () => verifyMigrationLedger(expected, [...expected, { name: "004_future.sql", checksum: checksum("future") }]),
    /has 4 entries.*knows only 3/u,
  );
  assert.throws(
    () => verifyMigrationLedger([expected[1], expected[0], expected[2]], []),
    /002_saved_runs\.sql is out of sequence/u,
  );
});

test("repository migration manifest is byte-hashed and requires contiguous numbered files", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "vector-migration-ledger-test-"));
  t.after(() => rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 }));
  await writeFile(join(directory, "001_first.sql"), "SELECT 1;\n");
  await writeFile(join(directory, "002_second.sql"), "SELECT 2;\n");
  assert.deepEqual(await loadMigrationManifest(directory), [
    { name: "001_first.sql", checksum: checksum("SELECT 1;\n") },
    { name: "002_second.sql", checksum: checksum("SELECT 2;\n") },
  ]);

  await writeFile(join(directory, "004_gap.sql"), "SELECT 4;\n");
  await assert.rejects(() => loadMigrationManifest(directory), /out of sequence; expected ordinal 003/u);
});

test("deployed 008 and production 020 ledgers are compatible prefixes of the current 021 manifest", async () => {
  const manifest = await loadMigrationManifest(fileURLToPath(new URL("../db/migrations", import.meta.url)));
  assert.equal(manifest.length, 21);
  assert.deepEqual(verifyMigrationLedger(manifest, manifest.slice(0, 8)), {
    state: "COMPATIBLE",
    appliedCount: 8,
    pendingCount: 13,
    lastApplied: "008_blog_post_comments.sql",
    nextPending: "009_governed_study_area_catalog.sql",
  });
  assert.deepEqual(verifyMigrationLedger(manifest, manifest.slice(0, 20)), {
    state: "COMPATIBLE",
    appliedCount: 20,
    pendingCount: 1,
    lastApplied: "020_browser_telemetry_admission.sql",
    nextPending: "021_aircraft_catalog_reconciliation.sql",
  });
});

test("database ledger is read only at the PostgreSQL transaction boundary", async () => {
  const statements = [];
  const transaction = async (strings) => {
    const statement = strings.join(" ").replace(/\s+/gu, " ").trim();
    statements.push(statement);
    if (statement.includes("transaction_read_only")) return [{ transaction_read_only: "on" }];
    if (statement.includes("FROM pg_class")) return ledgerCatalog;
    return expected.slice(0, 2);
  };
  const sql = {
    begin: async (mode, callback) => {
      assert.equal(mode, "isolation level repeatable read read only");
      return callback(transaction);
    },
  };

  assert.deepEqual(await readAppliedMigrationLedger(sql), expected.slice(0, 2));
  assert.equal(statements.length, 3);
  assert.ok(statements.every((statement) => statement.startsWith("SELECT ")));
  assert.match(statements[2], /ORDER BY name/u);
});

test("database ledger preflight rejects a writable transaction or invalid ledger relation", async () => {
  await assert.rejects(
    () => readAppliedMigrationLedger({
      begin: async (_mode, callback) => callback(async () => [{ transaction_read_only: "off" }]),
    }),
    /did not enter a read-only transaction/u,
  );

  await assert.rejects(
    () => readAppliedMigrationLedger({
      begin: async (_mode, callback) => callback(async (strings) => {
        const statement = strings.join(" ");
        if (statement.includes("transaction_read_only")) return [{ transaction_read_only: "on" }];
        return ledgerCatalog.map((column) => ({ ...column, relation_kind: "v" }));
      }),
    }),
    /ordinary table/u,
  );
});

test("database ledger preflight fails closed when the ledger is absent and closes its client", async () => {
  let ended = false;
  const sql = {
    begin: async (mode, callback) => {
      assert.equal(mode, "isolation level repeatable read read only");
      return callback(async (strings) => {
        const statement = strings.join(" ");
        return statement.includes("transaction_read_only")
          ? [{ transaction_read_only: "on" }]
          : [];
      });
    },
    end: async () => {
      ended = true;
    },
  };

  await assert.rejects(
    () => verifyDatabaseMigrationLedger({
      connectionString: "postgres://preflight.invalid/vector",
      migrationsDirectory: fileURLToPath(new URL("../db/migrations", import.meta.url)),
      createClient: () => sql,
    }),
    /requires the existing public\.schema_migrations ledger/u,
  );
  assert.equal(ended, true);
});

test("production full verification uses one repeatable-read read-only snapshot without mutation probes", async () => {
  const transaction = Symbol("read-only transaction");
  let ended = false;
  let verified = false;
  const database = {
    begin: async (mode, verification) => {
      assert.equal(mode, "isolation level repeatable read read only");
      return verification(transaction);
    },
    end: async () => {
      ended = true;
    },
  };

  await runDatabaseVerification({
    connectionString: "postgres://production-read-only.invalid/vector",
    args: ["--production-read-only"],
    createClient: () => database,
    verifyState: async (sql, options) => {
      assert.equal(sql, transaction);
      assert.deepEqual(options, {
        environmentUpgradeOnly: false,
        mutationProbes: false,
      });
      verified = true;
    },
  });
  assert.equal(verified, true);
  assert.equal(ended, true);
  assert.deepEqual(parseDatabaseVerificationMode([]), {
    environmentUpgradeOnly: false,
    productionReadOnly: false,
  });
  assert.throws(
    () => parseDatabaseVerificationMode(["--environment-upgrade-only", "--production-read-only"]),
    /cannot be combined/u,
  );
});
