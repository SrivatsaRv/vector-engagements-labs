import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
};

await Promise.all([
  build({
    ...common,
    entryPoints: ["scripts/start-production.mjs"],
    outfile: "dist/runtime/start-production.mjs",
  }),
  build({
    ...common,
    entryPoints: ["scripts/migrate-db.mjs"],
    outfile: "dist/admin/migrate-db.mjs",
  }),
  build({
    ...common,
    entryPoints: ["scripts/seed-db.ts"],
    outfile: "dist/admin/seed-db.mjs",
  }),
  build({
    ...common,
    entryPoints: ["scripts/node-postgres-adapter.mjs"],
    outfile: "dist/server/node-postgres.mjs",
  }),
]);
