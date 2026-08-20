import workerPostgres, { type Sql } from "postgres";
import { observeDatabaseOperation } from "@/lib/observability/server";

type RuntimeEnv = Cloudflare.Env & {
  HYPERDRIVE?: Hyperdrive;
  DATABASE_URL?: string;
};

type PostgresFactory = typeof workerPostgres;

async function databaseRuntime(): Promise<{
  connectionString: string;
  postgres: PostgresFactory;
}> {
  if (process.env.VECTOR_RUNTIME === "node") {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required by the Node runtime.");
    }
    // Vinext resolves the static import above for workerd. Docker places this
    // Node-specific adapter beside the server bundle, keeping credentials as
    // runtime configuration rather than build inputs.
    // Vinext places this module in dist/server/_next/static at runtime, while
    // the generated Node adapter is emitted at dist/server/node-postgres.mjs.
    // Resolve from the emitted module location, not process.cwd(), so a
    // production Node container cannot fall through to the Worker adapter.
    const nodeAdapter = new URL("../../node-postgres.mjs", import.meta.url).href;
    let postgres = workerPostgres;
    try {
      ({ default: postgres } = await import(/* @vite-ignore */ nodeAdapter) as {
        default: PostgresFactory;
      });
    } catch (error) {
      // The generated adapter is copied beside the production bundle. Source
      // mode (including real Node/Postgres integration tests) uses the same
      // already-imported client rather than requiring a build artifact.
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ERR_MODULE_NOT_FOUND") {
        throw error;
      }
    }
    return { connectionString, postgres };
  }

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
  return { connectionString: value, postgres: workerPostgres };
}

export async function withDatabase<T>(operation: (sql: Sql) => Promise<T>) {
  const runtime = await databaseRuntime();
  const sql = runtime.postgres(runtime.connectionString, {
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
