import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  loadMigrationManifest,
  verifyMigrationLedger,
} from "./lib/migration-ledger.mjs";

const requireFromWorkspace = createRequire(resolve("package.json"));
const postgres = requireFromWorkspace("postgres");

export async function readAppliedMigrationLedger(sql) {
  return sql.begin("isolation level repeatable read read only", async (transaction) => {
    const [transactionState] = await transaction`
      SELECT current_setting('transaction_read_only') AS transaction_read_only
    `;
    if (transactionState?.transaction_read_only !== "on") {
      throw new Error("Production migration preflight did not enter a read-only transaction.");
    }
    const catalog = await transaction`
      SELECT
        c.relkind AS relation_kind,
        a.attname AS column_name,
        format_type(a.atttypid, a.atttypmod) AS data_type,
        a.attnotnull AS not_null,
        EXISTS (
          SELECT 1
          FROM pg_index i
          WHERE i.indrelid=c.oid
            AND i.indisprimary
            AND a.attnum=ANY(i.indkey)
        ) AS primary_key
      FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid
      WHERE n.nspname='public'
        AND c.relname='schema_migrations'
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND a.attname IN ('name', 'checksum', 'applied_at')
      ORDER BY a.attname
    `;
    if (catalog.length === 0) {
      throw new Error("Production migration preflight requires the existing public.schema_migrations ledger.");
    }
    if (catalog.some(({ relation_kind: relationKind }) => relationKind !== "r")) {
      throw new Error("Production migration preflight requires public.schema_migrations to be an ordinary table.");
    }
    const columns = new Map(catalog.map((column) => [column.column_name, column]));
    const name = columns.get("name");
    const checksum = columns.get("checksum");
    const appliedAt = columns.get("applied_at");
    if (name?.data_type !== "text" || name.not_null !== true || name.primary_key !== true) {
      throw new Error("Production migration ledger column name must be a non-null text primary key.");
    }
    if (checksum?.data_type !== "text" || checksum.not_null !== true) {
      throw new Error("Production migration ledger column checksum must be non-null text.");
    }
    if (appliedAt?.data_type !== "timestamp with time zone" || appliedAt.not_null !== true) {
      throw new Error("Production migration ledger column applied_at must be a non-null timestamp with time zone.");
    }
    return transaction`
      SELECT name, checksum
      FROM public.schema_migrations
      ORDER BY name
    `;
  });
}

export async function verifyDatabaseMigrationLedger({
  connectionString,
  migrationsDirectory = resolve("db/migrations"),
  createClient = postgres,
}) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const expectedMigrations = await loadMigrationManifest(migrationsDirectory);
  const sql = createClient(connectionString, { max: 1 });
  try {
    const appliedMigrations = await readAppliedMigrationLedger(sql);
    return verifyMigrationLedger(expectedMigrations, appliedMigrations);
  } finally {
    await sql.end();
  }
}

async function run() {
  const report = await verifyDatabaseMigrationLedger({
    connectionString: process.env.DATABASE_URL,
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await run();
}
