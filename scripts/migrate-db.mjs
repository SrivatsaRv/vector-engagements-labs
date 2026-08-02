import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const sql = postgres(connectionString, { max: 1 });
try {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;
  const directory = resolve("db/migrations");
  const migrations = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  for (const migration of migrations) {
    const body = await readFile(resolve(directory, migration), "utf8");
    const checksum = createHash("sha256").update(body).digest("hex");
    const existing = await sql`SELECT checksum FROM schema_migrations WHERE name=${migration}`;
    if (existing[0]) {
      if (existing[0].checksum !== checksum) {
        throw new Error(`Applied migration ${migration} has changed`);
      }
      process.stdout.write(`verified ${migration}\n`);
      continue;
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (name,checksum) VALUES (${migration},${checksum})`;
    });
    process.stdout.write(`applied ${migration}\n`);
  }
} finally {
  await sql.end();
}
