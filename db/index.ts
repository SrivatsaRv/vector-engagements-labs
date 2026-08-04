import postgres, { type Sql } from "postgres";
import { observeDatabaseOperation } from "@/lib/observability/server";

type RuntimeEnv = Cloudflare.Env & {
  HYPERDRIVE?: Hyperdrive;
  DATABASE_URL?: string;
};

async function connectionString() {
  // Vinext inlines server-only process.env values during the production build.
  // Docker supplies DATABASE_URL as a build argument; Workers fall through to
  // the Hyperdrive binding below when that value is absent.
  const nodeDatabaseUrl = process.env.DATABASE_URL;
  if (nodeDatabaseUrl) return nodeDatabaseUrl;
  // Keep the Workers-only module out of the Node production bundle. A literal
  // dynamic import is still statically followed by Vinext and makes Docker's
  // Node loader attempt to resolve the `cloudflare:` protocol at startup.
  const workersModule = `cloudflare:${"workers"}`;
  const { env } = await import(/* @vite-ignore */ workersModule);
  const runtime = env as RuntimeEnv;
  const value = runtime.HYPERDRIVE?.connectionString ?? runtime.DATABASE_URL;
  if (!value) {
    throw new Error(
      "PostgreSQL is unavailable. Configure the HYPERDRIVE binding or DATABASE_URL.",
    );
  }
  return value;
}

export async function withDatabase<T>(operation: (sql: Sql) => Promise<T>) {
  const sql = postgres(await connectionString(), {
    max: 2,
    fetch_types: false,
    prepare: true,
    connect_timeout: 5,
    idle_timeout: 20,
    max_lifetime: 300,
    connection: {
      application_name: "vector-engagement-labs",
      statement_timeout: 5000,
      lock_timeout: 2000,
    },
  });
  try {
    return await observeDatabaseOperation(() => operation(sql));
  } finally {
    await sql.end({ timeout: 1 });
  }
}
