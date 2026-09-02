import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("database-backed public APIs invoke the shared rate limiter", async () => {
  const runs = await read("app/api/runs/route.ts");
  const catalog = await read("app/api/catalog/route.ts");
  const telemetry = await read("app/api/telemetry/route.ts");
  const telemetryMigration = await read("db/migrations/020_browser_telemetry_admission.sql");
  assert.match(runs, /enforceRateLimit\(request, "PUBLIC_API_RATE_LIMITER"\)/);
  assert.match(catalog, /enforceRateLimit\(request, "PUBLIC_API_RATE_LIMITER"\)/);
  assert.match(telemetry, /enforceRateLimit\(request, "BROWSER_TELEMETRY_RATE_LIMITER"\)/);
  assert.doesNotMatch(telemetry, /enforceRateLimit\(request, "PUBLIC_API_RATE_LIMITER"\)/);
  assert.match(telemetryMigration, /BROWSER_TELEMETRY_RATE_LIMITER/);
  assert.match(telemetryMigration, /public_api_rate_windows_policy_id_check/);
  assert.match(runs, /MAX_SAVED_RUN_REQUEST_BYTES/);
});

test("Compose publishes development services on loopback only", async () => {
  const compose = await read("compose.yaml");
  const published = [...compose.matchAll(/- "([^"]+:[0-9]+)"/g)].map((match) => match[1]);
  assert.ok(published.length >= 6);
  assert.ok(published.every((entry) => entry.startsWith("127.0.0.1:")));
});

test("local Worker image includes a trusted TLS root store", async () => {
  const dockerfile = await read("Dockerfile");
  assert.match(dockerfile, /ca-certificates/);
});

test("release and deployment workflows admit reviewed, CI-green main history", async () => {
  const release = await read(".github/workflows/release.yml");
  const deploy = await read(".github/workflows/deploy-cloudflare.yml");
  assert.match(release, /workflow_dispatch:/);
  assert.doesNotMatch(release, /push:\s*\n\s*tags:/);
  assert.match(release, /merge-base --is-ancestor/);
  assert.match(release, /Generate SBOM/);
  assert.match(release, /Attest release archive/);
  assert.match(release, /make integration-ci/);
  assert.match(release, /Stage 4: Required PR Gate/);
  assert.match(deploy, /github\.ref == 'refs\/heads\/main'/);
  assert.match(deploy, /merge-base --is-ancestor/);
  assert.match(deploy, /Stage 4: Required PR Gate/);
  const verifyJob = deploy.match(/\n  verify:\n([\s\S]*?)\n  migrate:/)?.[1];
  assert.ok(verifyJob, "protected production verification job must exist");
  assert.match(verifyJob, /ref: \$\{\{ needs\.admit\.outputs\.sha \}\}/);
  assert.match(verifyJob, /VECTOR_CONTRACT_DOC_BASE_SHA: \$\{\{ needs\.admit\.outputs\.sha \}\}[\s\S]*?run: make ci-local/);
  assert.doesNotMatch(deploy, /npm run db:seed/);
});

test("pull-request validation is change-aware with one stable required gate", async () => {
  const [ci, scheduledCodeql] = await Promise.all([
    read(".github/workflows/ci.yml"),
    read(".github/workflows/codeql.yml"),
  ]);
  assert.match(ci, /classify:/);
  assert.match(ci, /classify-ci-changes\.mjs/);
  assert.match(ci, /name: "Stage 4: Required PR Gate"/);
  assert.match(ci, /if: always\(\)/);
  assert.match(ci, /needs:\s*\n\s*- classify/);
  assert.match(ci, /npm run audit:production/);
  assert.match(ci, /cargo audit/);
  assert.match(ci, /make integration-ci/);
  assert.match(ci, /name: "Stage 2D: Browser Contract"/);
  assert.match(ci, /npx playwright install --with-deps chromium/);
  assert.match(ci, /npm run test:component/);
  assert.match(ci, /npm run test:browser/);
  assert.match(ci, /npm run environment:sources:verify/);
  assert.match(ci, /npm run generic-sensor:sources:verify/);
  assert.match(ci, /npm run build[\s\S]*npm run generic-sensor:sources:verify/);
  assert.match(ci, /npm run policy:aircraft-evidence:verify/);
  assert.match(ci, /npm run reference-aircraft:verify/);
  assert.doesNotMatch(ci, /performance-local|benchmark-engine/);
  assert.doesNotMatch(scheduledCodeql, /pull_request:|branches: \[main\]/);
});

test("Cloudflare toolchain is pinned to the governed proxy-regression compatibility set", async () => {
  const manifest = JSON.parse(await read("package.json"));
  const lock = JSON.parse(await read("package-lock.json"));
  const dependabot = await read(".github/dependabot.yml");
  const compatibility = JSON.parse(
    await read("governance/browser-toolchain-compatibility.v1.json"),
  );

  assert.deepEqual(Object.keys(compatibility).sort(), [
    "affectedRegression",
    "decisionId",
    "dependabotIgnore",
    "issue",
    "pins",
    "prohibitedWorkarounds",
    "revalidationRequirements",
    "reviewTrigger",
    "reviewedOn",
    "schemaVersion",
    "securityOverrides",
    "status",
  ]);
  assert.equal(compatibility.schemaVersion, "vector.browser-toolchain-compatibility.v1");
  assert.equal(compatibility.decisionId, "WRANGLER_PROXY_NETWORK_LOSS_2026_08_24");
  assert.equal(compatibility.issue, "#63");
  assert.equal(compatibility.status, "TEMPORARY_UPSTREAM_REGRESSION_PIN");
  assert.equal(compatibility.reviewedOn, "2026-08-24");
  assert.deepEqual(compatibility.affectedRegression, {
    upstreamIssue: "https://github.com/cloudflare/workers-sdk/issues/14926",
    upstreamFixPullRequest: "https://github.com/cloudflare/workers-sdk/pull/15252",
    upstreamFixState: "OPEN_UNRELEASED",
    affectedFrom: "4.114.0",
    lastKnownGood: "4.113.0",
  });
  assert.deepEqual(compatibility.pins, {
    "@cloudflare/vite-plugin": "1.46.0",
    "@cloudflare/workers-types": "5.20260721.1",
    wrangler: "4.113.0",
  });
  assert.deepEqual(compatibility.dependabotIgnore, [
    "@cloudflare/vite-plugin",
    "@cloudflare/workers-types",
    "wrangler",
  ]);
  assert.equal(
    compatibility.reviewTrigger,
    "UPSTREAM_FIX_RELEASED_AND_EXACT_VERSION_PROVEN_IN_HOSTED_BROWSER_CONTRACT",
  );
  assert.deepEqual(compatibility.revalidationRequirements, [
    "EXACT_FIVE_PROJECT_BROWSER_CONTRACT_ZERO_RETRIES",
    "THREE_HOSTED_EXACT_HEAD_REPEATS",
    "PROCESS_GROUP_AND_PORT_RELEASE",
    "MAKE_CI_LOCAL",
    "MAKE_CLEAN_CLONE_LOCAL",
    "INDEPENDENT_REVIEW",
  ]);
  assert.deepEqual(compatibility.prohibitedWorkarounds, [
    "INCREASE_BROWSER_RETRIES",
    "SKIP_FULL_HD_PROJECT",
    "WEAKEN_EVIDENCE_ADMISSION",
    "IGNORE_SERVER_EXIT",
  ]);
  assert.deepEqual(compatibility.securityOverrides, {
    undici: {
      version: "7.29.0",
      replaces: "7.28.0",
      reason: "PATCH_KNOWN_HIGH_SEVERITY_DEV_SERVER_ADVISORIES",
      scope: "LOCAL_AND_CI_TOOLCHAIN_ONLY",
    },
  });
  assert.equal(manifest.overrides.undici, "7.29.0");

  for (const [dependency, version] of Object.entries(compatibility.pins)) {
    assert.equal(manifest.devDependencies[dependency], version);
    assert.match(
      dependabot,
      new RegExp(`dependency-name: "${dependency.replaceAll("/", "\\/")}"`),
    );
  }
  assert.equal(lock.packages["node_modules/@cloudflare/vite-plugin"].version, "1.46.0");
  assert.equal(lock.packages["node_modules/@cloudflare/vite-plugin"].dependencies.wrangler, "4.113.0");
  assert.equal(lock.packages["node_modules/@cloudflare/vite-plugin"].dependencies.miniflare, "4.20260721.0");
  assert.equal(lock.packages["node_modules/@cloudflare/vite-plugin"].dependencies.workerd, "1.20260721.1");
  assert.equal(lock.packages["node_modules/@cloudflare/workers-types"].version, "5.20260721.1");
  assert.equal(lock.packages["node_modules/wrangler"].version, "4.113.0");
  assert.equal(lock.packages["node_modules/wrangler"].dependencies.miniflare, "4.20260721.0");
  assert.equal(lock.packages["node_modules/miniflare"].version, "4.20260721.0");
  assert.equal(lock.packages["node_modules/miniflare/node_modules/undici"], undefined);
  assert.equal(lock.packages["node_modules/undici"].version, "7.29.0");
});
