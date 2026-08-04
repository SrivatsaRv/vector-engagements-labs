import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("map relay uses TLS, rate limiting, caching, and image validation", async () => {
  const source = await read("app/api/map-tile/route.ts");
  assert.doesNotMatch(source, /http:\/\/a\.basemaps\.cartocdn\.com/);
  assert.match(source, /TILE_RATE_LIMITER/);
  assert.match(source, /caches as CacheStorage/);
  assert.match(source, /headers: new Headers\(cached\.headers\)/);
  assert.match(source, /contentType\.startsWith\("image\/"\)/);
});

test("database-backed public APIs invoke the shared rate limiter", async () => {
  const runs = await read("app/api/runs/route.ts");
  const catalog = await read("app/api/catalog/route.ts");
  assert.match(runs, /enforceRateLimit\(request, "PUBLIC_API_RATE_LIMITER"\)/);
  assert.match(catalog, /enforceRateLimit\(request, "PUBLIC_API_RATE_LIMITER"\)/);
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

test("release and deployment workflows admit reviewed main history", async () => {
  const release = await read(".github/workflows/release.yml");
  const deploy = await read(".github/workflows/deploy-cloudflare.yml");
  assert.match(release, /workflow_dispatch:/);
  assert.doesNotMatch(release, /push:\s*\n\s*tags:/);
  assert.match(release, /merge-base --is-ancestor/);
  assert.match(release, /Generate SBOM/);
  assert.match(release, /Attest release archive/);
  assert.match(deploy, /github\.ref == 'refs\/heads\/main'/);
  assert.match(deploy, /merge-base --is-ancestor/);
});

test("pull-request validation is causal and excludes browser and benchmark jobs", async () => {
  const [ci, scheduledCodeql] = await Promise.all([
    read(".github/workflows/ci.yml"),
    read(".github/workflows/codeql.yml"),
  ]);
  assert.match(ci, /needs: quality/);
  assert.match(ci, /needs: security/);
  assert.match(ci, /needs: tests/);
  assert.match(ci, /needs: integration/);
  assert.match(ci, /make ci-quality/);
  assert.match(ci, /make ci-tests/);
  assert.match(ci, /make integration-ci/);
  assert.doesNotMatch(ci, /ui:responsive|playwright|performance-local|benchmark-engine/);
  assert.doesNotMatch(scheduledCodeql, /pull_request:|branches: \[main\]/);
});

test("Cloudflare toolchain is current and no longer dependency-ignored", async () => {
  const manifest = JSON.parse(await read("package.json"));
  const dependabot = await read(".github/dependabot.yml");
  assert.equal(manifest.devDependencies["@cloudflare/vite-plugin"], "1.50.0");
  assert.equal(manifest.devDependencies.wrangler, "4.118.0");
  assert.doesNotMatch(dependabot, /dependency-name: "wrangler"/);
  assert.doesNotMatch(dependabot, /dependency-name: "@cloudflare\/vite-plugin"/);
});
