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

test("production publish requires an immutable commit and Hyperdrive verification", async () => {
  const workflow = await read(".github/workflows/deploy-cloudflare.yml");

  assert.match(workflow, /inputs\.operation == 'deploy'/);
  assert.match(workflow, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(workflow, /wrangler hyperdrive get/);
  assert.match(workflow, /npm run db:migrate/);
  assert.match(workflow, /npm run db:verify/);
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
