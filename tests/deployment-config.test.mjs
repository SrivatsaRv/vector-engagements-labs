import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("production workflow keeps credentials secret and binding IDs non-secret", async () => {
  const workflow = await read(".github/workflows/deploy-cloudflare.yml");

  assert.match(workflow, /DATABASE_URL: \$\{\{ secrets\.DATABASE_ORIGIN_URL \}\}/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ vars\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  assert.match(workflow, /CLOUDFLARE_HYPERDRIVE_ID: \$\{\{ vars\.CLOUDFLARE_HYPERDRIVE_ID \}\}/);
  assert.match(workflow, /VECTOR_PRODUCTION_HOST: \$\{\{ vars\.VECTOR_PRODUCTION_HOST \}\}/);
  assert.doesNotMatch(workflow, /secrets\.CLOUDFLARE_(?:ACCOUNT_ID|HYPERDRIVE_ID)/);
});

test("production operations admit one immutable reviewed commit and never seed production", async () => {
  const workflow = await read(".github/workflows/deploy-cloudflare.yml");
  const verifyJob = workflow.match(/\n  verify:\n([\s\S]*?)\n  migrate:/)?.[1];
  const migrateJob = workflow.match(/\n  migrate:\n([\s\S]*?)\n  deploy:/)?.[1];

  assert.ok(verifyJob, "verify job must exist");
  assert.ok(migrateJob, "migrate job must exist");
  assert.match(workflow, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(workflow, /Stage 4: Required PR Gate/);
  assert.match(workflow, /check-runs/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ inputs\.ref \}\}/);
  assert.match(workflow, /wrangler hyperdrive get/);
  assert.match(workflow, /npm run db:migrate/);
  assert.match(workflow, /npm run db:verify/);
  assert.doesNotMatch(workflow, /npm run db:seed/);
  assert.doesNotMatch(verifyJob, /npm run db:migrate|npm run db:seed/);
  assert.match(migrateJob, /if: inputs\.operation == 'deploy'/);
  assert.match(workflow, /Verify deployed health/);
});

test("governed study areas are migration data and local Compose keeps migration and fixture seeding separate", async () => {
  const [migration, compose, makefile, packageJson, dockerignore] = await Promise.all([
    read("db/migrations/009_governed_study_area_catalog.sql"),
    read("compose.yaml"),
    read("Makefile"),
    read("package.json"),
    read(".dockerignore"),
  ]);

  for (const id of [
    "north-punjab",
    "rajasthan-desert",
    "ladakh-high-altitude",
    "north-east-mountains",
    "arabian-sea",
    "coastal-gujarat",
  ]) {
    assert.match(migration, new RegExp(`'${id}'`));
  }
  assert.match(migration, /ON CONFLICT \(id\) DO UPDATE SET/);
  assert.match(compose, /migrate:[\s\S]*command: \["npm", "run", "db:migrate"\]/);
  assert.match(compose, /seed:[\s\S]*command: \["npm", "run", "db:seed"\]/);
  assert.match(compose, /VECTOR_IMAGE_TAG:-0\.1\.0-dev/);
  assert.doesNotMatch(compose, /:latest(?:\s|$)/m);
  assert.match(makefile, /npm run db:governed-data:verify\n\tnpm run db:seed/);
  assert.match(packageJson, /"db:governed-data:verify"/);
  assert.match(dockerignore, /^engine-rust\/target$/m);
  assert.match(dockerignore, /^outputs$/m);
});

test("the Place and flight workspace exposes all governed choices and blocks an incomplete catalog", async () => {
  const workspace = await read("app/lab/page.tsx");

  assert.match(workspace, /useState\(true\)/);
  assert.match(workspace, /Governed study areas are unavailable\./);
  assert.match(workspace, /Simulation is blocked because the PostGIS catalog/);
  assert.match(workspace, /studyAreas\.map\(\(area\) =>/);
  assert.match(workspace, /catalogState !== "POSTGIS"/);
});

test("catalog credibility is admitted as one immutable database/API/UI chain", async () => {
  const [migration, api, workspace, makefile] = await Promise.all([
    read("db/migrations/010_immutable_credibility_catalog.sql"),
    read("app/api/catalog/route.ts"),
    read("app/lab/page.tsx"),
    read("Makefile"),
  ]);

  assert.match(migration, /reject_governed_catalog_mutation/);
  assert.match(migration, /validate_governed_catalog_insert/);
  assert.match(migration, /compiled model-pack payload is not an identity-consistent SI artifact/);
  assert.match(api, /admitCatalogCredibility/);
  assert.match(workspace, /MODEL CREDIBILITY/);
  assert.match(workspace, /Catalog credibility not admitted/);
  assert.match(makefile, /npm run db:credibility:verify/);
});

test("Worker database adapter consumes the generated Hyperdrive binding", async () => {
  const [viteConfig, databaseAdapter] = await Promise.all([
    read("vite.config.ts"),
    read("db/index.ts"),
  ]);

  assert.match(viteConfig, /binding: "HYPERDRIVE"/);
  assert.match(viteConfig, /process\.env\.CLOUDFLARE_HYPERDRIVE_ID/);
  assert.match(viteConfig, /process\.env\.VECTOR_PRODUCTION_HOST/);
  assert.match(viteConfig, /custom_domain: true/);
  const compatibilityDate = viteConfig.match(/compatibility_date: "([0-9-]+)"/)?.[1];
  assert.ok(compatibilityDate, "Cloudflare compatibility date must be explicit");
  assert.ok(
    compatibilityDate <= new Date().toISOString().slice(0, 10),
    "Cloudflare compatibility date cannot be in the future in UTC",
  );
  assert.equal(
    compatibilityDate,
    "2026-05-22",
    "Compatibility date must match the pinned Wrangler/workerd support boundary",
  );
  assert.match(viteConfig, /process\.env\.npm_lifecycle_event === "deploy"/);
  assert.match(
    viteConfig,
    /isVinextDeploy \? \{\} : \{ compatibility_flags: \["nodejs_compat"\] \}/,
    "local builds need nodejs_compat while vinext deploy must not duplicate it",
  );
  assert.match(databaseAdapter, /runtime\.HYPERDRIVE\?\.connectionString/);
});

test("public environment example contains placeholders, not production values", async () => {
  const example = await read(".env.example");

  assert.match(example, /^PROD_DATABASE_ORIGIN_URL=$/m);
  assert.match(example, /^CLOUDFLARE_HYPERDRIVE_ID=$/m);
  assert.match(example, /^VECTOR_PRODUCTION_HOST=$/m);
  assert.doesNotMatch(example, /a58922f3bf554c36bb758b89950c467d/);
  assert.doesNotMatch(example, /postgres(?:ql)?:\/\/[^\s]+@[^\s]+\.neon\.tech/);
});
