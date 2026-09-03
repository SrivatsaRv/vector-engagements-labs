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

test("the last deployed 008 ledger is a compatible prefix of the current 020 manifest", async () => {
  const manifest = await loadMigrationManifest(fileURLToPath(new URL("../db/migrations", import.meta.url)));
  assert.equal(manifest.length, 20);
  assert.deepEqual(verifyMigrationLedger(manifest, manifest.slice(0, 8)), {
    state: "COMPATIBLE",
    appliedCount: 8,
    pendingCount: 12,
    lastApplied: "008_blog_post_comments.sql",
    nextPending: "009_governed_study_area_catalog.sql",
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
