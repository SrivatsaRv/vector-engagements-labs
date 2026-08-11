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
    const nodeAdapter = "./node-postgres.mjs";
    const { default: postgres } = await import(/* @vite-ignore */ nodeAdapter) as {
      default: PostgresFactory;
    };
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
