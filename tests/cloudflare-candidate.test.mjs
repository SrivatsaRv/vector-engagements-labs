import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  createCloudflareCandidate,
  prepareCloudflareDeployment,
  verifyCloudflareCandidate,
} from "../scripts/lib/cloudflare-candidate.mjs";

const SHA = "1".repeat(40);

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "vector-cloudflare-candidate-"));
  const file = (path, body = path) => {
    const absolute = resolve(root, path);
    mkdirSync(resolve(absolute, ".."), { recursive: true });
    writeFileSync(absolute, body);
  };
  file("dist/server/index.js", "export default { fetch() {} };\n");
  file("dist/server/.vite/manifest.json", "{}\n");
  file("dist/server/.dev.vars", "DATABASE_URL=must-not-ship\n");
  file("dist/server/wrangler.json", JSON.stringify({
    configPath: `${root}/wrangler.jsonc`,
    userConfigPath: `${root}/wrangler.jsonc`,
    name: "vector-engagement-labs",
    main: "index.js",
    routes: [{ pattern: "old.invalid", custom_domain: true }],
    assets: { directory: "../client", binding: "ASSETS", not_found_handling: "none" },
    vars: { METRICS_BEARER_TOKEN: "must-not-ship" },
    hyperdrive: [{ binding: "HYPERDRIVE", id: "f".repeat(32), localConnectionString: "postgres://local" }],
    no_bundle: true,
  }));
  file("dist/client/vendor/maplibre/maplibre-gl-worker.mjs");
  file("dist/client/vendor/maplibre/maplibre-gl-shared.mjs");
  file("dist/admin/migrate-db.mjs");
  file("dist/admin/verify-db-migration-ledger.mjs");
  file("dist/admin/verify-db.mjs");
  file("db/migrations/001_initial.sql", "SELECT 1;\n");
  return { root, output: resolve(root, "outputs/cloudflare-candidate") };
}

test("the reusable Cloudflare candidate is environment-neutral and complete", () => {
  const { root, output } = fixture();
  try {
    const manifest = createCloudflareCandidate({ projectRoot: root, outputRoot: output, sourceSha: SHA });
    assert.equal(manifest.sourceSha, SHA);
    assert.doesNotThrow(() => verifyCloudflareCandidate({ candidateRoot: output, expectedSourceSha: SHA }));
    assert.equal(manifest.files.some(({ path }) => path.endsWith(".dev.vars")), false);
    assert.equal(manifest.files.some(({ path }) => path.includes("node_modules")), false);
    const config = JSON.parse(readFileSync(resolve(output, "dist/server/wrangler.json"), "utf8"));
    assert.deepEqual(config.routes, []);
    assert.equal(config.vars, undefined);
    assert.equal(config.hyperdrive[0].localConnectionString, undefined);
    assert.equal(JSON.stringify(config).includes(root), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("candidate verification rejects wrong revisions, tampering, extras, and links", () => {
  const cases = [
    ["wrong revision", (output) => assert.throws(() => verifyCloudflareCandidate({ candidateRoot: output, expectedSourceSha: "2".repeat(40) }), /source SHA/)],
    ["changed bytes", (output) => { writeFileSync(resolve(output, "dist/server/index.js"), "changed\n"); assert.throws(() => verifyCloudflareCandidate({ candidateRoot: output, expectedSourceSha: SHA }), /digest|byte length/); }],
    ["extra file", (output) => { writeFileSync(resolve(output, "extra.txt"), "extra\n"); assert.throws(() => verifyCloudflareCandidate({ candidateRoot: output, expectedSourceSha: SHA }), /inventory differs/); }],
    ["symbolic link", (output) => { symlinkSync(resolve(output, "dist/server/index.js"), resolve(output, "linked.js")); assert.throws(() => verifyCloudflareCandidate({ candidateRoot: output, expectedSourceSha: SHA }), /symbolic link/); }],
  ];
  for (const [name, attack] of cases) {
    const { root, output } = fixture();
    try {
      createCloudflareCandidate({ projectRoot: root, outputRoot: output, sourceSha: SHA });
      attack(output);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    assert.ok(name);
  }
});

test("production configuration is derived only after candidate verification", () => {
  const { root, output } = fixture();
  try {
    createCloudflareCandidate({ projectRoot: root, outputRoot: output, sourceSha: SHA });
    const configPath = resolve(root, "release/wrangler.json");
    const config = prepareCloudflareDeployment({
      candidateRoot: output,
      outputPath: configPath,
      expectedSourceSha: SHA,
      hyperdriveId: "a".repeat(32),
      productionHost: "labs.example.test",
    });
    assert.deepEqual(config.routes, [{ pattern: "labs.example.test", custom_domain: true }]);
    assert.equal(config.hyperdrive[0].id, "a".repeat(32));
    assert.equal(config.no_bundle, true);
    assert.equal(config.vars.VECTOR_SOURCE_REVISION, SHA);
    assert.match(config.main, /cloudflare-candidate\/dist\/server\/index\.js$/u);
    assert.match(config.assets.directory, /cloudflare-candidate\/dist\/client$/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
