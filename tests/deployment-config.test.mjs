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
  const promoteJob = workflow.match(/\n  promote:\n([\s\S]*)$/)?.[1];

  assert.ok(promoteJob, "artifact promotion job must exist");
  assert.match(workflow, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(workflow, /actions\/workflows\/ci\.yml\/runs\?branch=main&event=push&head_sha=/);
  assert.match(workflow, /select\(\.conclusion == "success"\)/);
  assert.match(workflow, /cloudflare-worker-\$\{REQUESTED_REF\}/);
  assert.match(workflow, /artifact_count/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ inputs\.ref \}\}/);
  assert.match(promoteJob, /actions\/download-artifact@[0-9a-f]{40}/);
  assert.match(promoteJob, /run-id: \$\{\{ needs\.admit\.outputs\.ci_run_id \}\}/);
  assert.match(promoteJob, /name: cloudflare-worker-\$\{\{ needs\.admit\.outputs\.sha \}\}/);
  assert.match(promoteJob, /node \.trusted-release\/scripts\/verify-cloudflare-candidate\.mjs candidate/);
  assert.match(promoteJob, /node \.trusted-release\/scripts\/prepare-cloudflare-deployment\.mjs/);
  assert.match(promoteJob, /command: hyperdrive get/);
  assert.match(promoteJob, /command: deploy --config release\/wrangler\.json --no-bundle/);
  assert.doesNotMatch(promoteJob, /npm ci|npm run build|make ci-local|setup-rust-toolchain|install-pinned-poppler/);
  assert.doesNotMatch(
    promoteJob,
    /steps\.deploy\.outputs\.command-output|WRANGLER_OUTPUT|Record deployed Worker version/,
    "deployment must not copy Wrangler's unbounded module log into an environment variable",
  );
  assert.doesNotMatch(workflow, /npm run db:seed/);
  assert.match(promoteJob, /Verify production migration compatibility without mutation[\s\S]*?working-directory: candidate[\s\S]*?node dist\/admin\/verify-db-migration-ledger\.mjs/);
  const migratePreflightAt = promoteJob.indexOf("node dist/admin/verify-db-migration-ledger.mjs", promoteJob.indexOf("Apply forward-only migrations"));
  const migrateAt = promoteJob.indexOf("node dist/admin/migrate-db.mjs");
  const fullVerifyAt = promoteJob.indexOf("node dist/admin/verify-db.mjs --production-read-only");
  assert.ok(migratePreflightAt >= 0, "migration must repeat the trusted read-only preflight immediately before mutation");
  assert.ok(
    migratePreflightAt < migrateAt && migrateAt < fullVerifyAt,
    "production database order must be read-only preflight, migration, then full verification",
  );
  assert.match(workflow, /Verify deployed application and static assets/);
});

test("the main CI candidate uses a string-valued synthetic Hyperdrive identifier", async () => {
  const workflow = await read(".github/workflows/ci.yml");
  assert.match(
    workflow,
    /CLOUDFLARE_HYPERDRIVE_ID: ["']11111111111111111111111111111111["']/,
  );
  assert.doesNotMatch(
    workflow,
    /^\s*CLOUDFLARE_HYPERDRIVE_ID: 11111111111111111111111111111111\s*$/m,
  );
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
  assert.match(compose, /migrate:[\s\S]*command: \["node", "dist\/admin\/migrate-db\.mjs"\]/);
  assert.match(compose, /seed:[\s\S]*command: \["node", "dist\/admin\/seed-db\.mjs"\]/);
  assert.equal((compose.match(/\$\{VECTOR_IMAGE:-vector-engagement-lab:0\.1\.0-dev\}/g) ?? []).length, 3);
  assert.doesNotMatch(compose, /:latest(?:\s|$)/m);
  assert.match(makefile, /npm run db:governed-data:verify\n\tnpm run db:environment-upgrade:verify\n\tnpm run db:seed/);
  assert.match(packageJson, /"db:governed-data:verify"/);
  assert.match(packageJson, /"db:environment-upgrade:verify"/);
  assert.match(dockerignore, /^engine-rust\/target$/m);
  assert.match(dockerignore, /^blog$/m);
  assert.match(dockerignore, /^outputs$/m);
});

test("Compose waits for the final PostgreSQL server before migration", async () => {
  const compose = await read("compose.yaml");

  assert.match(compose, /cat \/proc\/1\/task\/1\/children/);
  assert.match(compose, /cat \/proc\/\$\$1\/comm/);
  assert.match(compose, /pg_isready -U vector -d vector/);
  assert.match(compose, /migrate:[\s\S]*database:[\s\S]*condition: service_healthy/);
});

test("Compose and release delivery admit one immutable production image", async () => {
  const [dockerfile, compose, release, packageJson, runtimeBuilder] = await Promise.all([
    read("Dockerfile"),
    read("compose.yaml"),
    read(".github/workflows/release.yml"),
    read("package.json"),
    read("scripts/build-runtime-bundles.mjs"),
  ]);

  assert.match(dockerfile, /FROM node:22\.18\.0-bookworm-slim@sha256:[0-9a-f]{64} AS base/);
  assert.match(dockerfile, /FROM dependencies AS build/);
  assert.match(dockerfile, /FROM base AS runtime/);
  assert.doesNotMatch(dockerfile, /ARG (?:DATABASE_URL|OTEL_EXPORTER_OTLP_ENDPOINT)/);
  assert.match(dockerfile, /org\.opencontainers\.image\.revision/);
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /CMD \["node", "dist\/runtime\/start-production\.mjs"\]/);
  assert.doesNotMatch(dockerfile, /wrangler dev|npm ci --omit=dev/);

  assert.match(compose, /VECTOR_RUNTIME: node/);
  assert.doesNotMatch(compose, /VECTOR_IMAGE_(?:REPOSITORY|TAG)/);
  assert.doesNotMatch(compose, /(?:DATABASE_URL|OTEL_EXPORTER_OTLP_ENDPOINT):[\s\S]{0,80}build:/);
  assert.doesNotMatch(compose, /vector_wrangler/);

  assert.match(release, /image=ghcr\.io\/\$\{GITHUB_REPOSITORY,,\}/);
  assert.match(release, /platforms: linux\/amd64,linux\/arm64/g);
  assert.match(release, /packages: write/);
  assert.match(release, /flavor: latest=false/);
  assert.match(release, /type=semver,pattern=\{\{version\}\}/);
  assert.match(release, /type=raw,value=sha-\$\{\{ needs\.verify\.outputs\.sha \}\}/);
  assert.doesNotMatch(release, /pattern=\{\{(?:major|minor)\}\}/);
  assert.match(release, /VECTOR_IMAGE: \$\{\{ needs\.verify\.outputs\.image \}\}@\$\{\{ steps\.image\.outputs\.digest \}\}/);
  assert.match(release, /Attest published image/);

  for (const line of release.matchAll(/uses: [^\n]+@([^\s]+)/g)) {
    assert.match(line[1], /^[0-9a-f]{40}$/, `release action must be SHA-pinned: ${line[0]}`);
  }
  assert.match(packageJson, /build-runtime-bundles\.mjs/);
  assert.match(runtimeBuilder, /dist\/server\/node-postgres\.mjs/);
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

test("Worker packaging has one static authority and an environment-derived binding overlay", async () => {
  const [
    wranglerSource,
    viteConfig,
    packageJson,
    makefile,
    gitignore,
    databaseAdapter,
    runtimeBuilder,
  ] = await Promise.all([
    read("wrangler.jsonc"),
    read("vite.config.ts"),
    read("package.json"),
    read("Makefile"),
    read(".gitignore"),
    read("db/index.ts"),
    read("scripts/build-runtime-bundles.mjs"),
  ]);

  const wrangler = JSON.parse(wranglerSource);
  assert.deepEqual(wrangler, {
    $schema: "node_modules/wrangler/config-schema.json",
    name: "vector-engagement-labs",
    main: "./worker/index.ts",
    compatibility_date: "2026-05-22",
    compatibility_flags: ["nodejs_compat"],
    assets: {
      directory: "dist/client",
      not_found_handling: "none",
      binding: "ASSETS",
    },
    observability: { enabled: true },
  });
  assert.doesNotMatch(gitignore, /^\/?wrangler\.jsonc$/m);
  assert.match(viteConfig, /import \{ cloudflare \} from "@cloudflare\/vite-plugin"/);
  assert.doesNotMatch(viteConfig, /await import\("@cloudflare\/vite-plugin"\)/);
  assert.match(viteConfig, /configPath: "\.\/wrangler\.jsonc"/);
  assert.doesNotMatch(viteConfig, /compatibility_(?:date|flags):/);
  assert.doesNotMatch(viteConfig, /name: "vector-engagement-labs"/);
  assert.doesNotMatch(viteConfig, /main: "\.\/worker\/index\.ts"/);
  assert.doesNotMatch(viteConfig, /observability:/);
  assert.match(viteConfig, /binding: "HYPERDRIVE"/);
  assert.match(viteConfig, /process\.env\.CLOUDFLARE_HYPERDRIVE_ID/);
  assert.match(viteConfig, /process\.env\.VECTOR_PRODUCTION_HOST/);
  assert.match(viteConfig, /custom_domain: true/);
  assert.ok(
    wrangler.compatibility_date <= new Date().toISOString().slice(0, 10),
    "Cloudflare compatibility date cannot be in the future in UTC",
  );
  assert.equal(
    wrangler.compatibility_date,
    "2026-05-22",
    "Compatibility date must match the pinned Wrangler/workerd support boundary",
  );
  assert.match(
    packageJson,
    /"deploy:verify": "WRANGLER_LOG_PATH=\.wrangler\/wrangler\.log vinext deploy --dry-run"/,
  );
  assert.match(
    packageJson,
    /"deploy:artifact:verify": "WRANGLER_LOG_PATH=\.wrangler\/wrangler\.log wrangler deploy --dry-run"/,
  );
  assert.match(
    packageJson,
    /"deploy:configuration:verify": "npm run map:assets:prepare && WRANGLER_LOG_PATH=\.wrangler\/wrangler\.log vinext build && node --test tests\/cloudflare-build-output\.test\.mjs && npm run deploy:artifact:verify"/,
  );
  assert.match(packageJson, /"predeploy": "npm run map:assets:prepare"/);
  assert.match(packageJson, /"test": "[^"]*npm run deploy:artifact:verify"/);
  assert.match(
    makefile,
    /ci-quality-core:\n\tnpm run deploy:verify\n\tCLOUDFLARE_HYPERDRIVE_ID=11111111111111111111111111111111 VECTOR_PRODUCTION_HOST=vector-ci\.invalid npm run deploy:configuration:verify/,
  );
  assert.match(databaseAdapter, /runtime\.HYPERDRIVE\?\.connectionString/);
  assert.match(
    databaseAdapter,
    /new URL\("\.\.\/\.\.\/node-postgres\.mjs", import\.meta\.url\)\.href/,
    "Node admission must resolve its generated adapter beside the built server bundle",
  );
  assert.match(runtimeBuilder, /dist\/server\/node-postgres\.mjs/);
});

test("public environment example contains placeholders, not production values", async () => {
  const example = await read(".env.example");

  assert.match(example, /^PROD_DATABASE_ORIGIN_URL=$/m);
  assert.match(example, /^CLOUDFLARE_HYPERDRIVE_ID=$/m);
  assert.match(example, /^VECTOR_PRODUCTION_HOST=$/m);
  assert.doesNotMatch(example, /a58922f3bf554c36bb758b89950c467d/);
  assert.doesNotMatch(example, /postgres(?:ql)?:\/\/[^\s]+@[^\s]+\.neon\.tech/);
});
