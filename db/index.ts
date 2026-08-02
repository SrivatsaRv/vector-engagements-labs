import postgres, { type Sql } from "postgres";

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
    max: 5,
    fetch_types: false,
    prepare: true,
  });
  try {
    return await operation(sql);
  } finally {
    await sql.end();
  }
}
