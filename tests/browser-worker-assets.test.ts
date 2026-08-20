import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  VINEXT_BROWSER_WORKER_ASSET_DIRECTORY,
  resolveBrowserWorkerAssets,
} from "../scripts/browser-worker-assets.ts";

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), "vector-browser-worker-assets-"));
  const assets = join(root, VINEXT_BROWSER_WORKER_ASSET_DIRECTORY);
  await mkdir(assets, { recursive: true });
  return { root, assets };
}

test("browser Worker verifier resolves the declared Vinext static asset directory", async () => {
  const { root, assets } = await fixtureRoot();
  try {
    await Promise.all([
      writeFile(join(assets, "simulation.worker-alpha_1.js"), "export {}"),
      writeFile(join(assets, "environment-sampler.worker-beta-2.js"), "export {}"),
    ]);
    assert.deepEqual(resolveBrowserWorkerAssets(root), {
      assetDirectory: assets,
      simulationWorkerName: "simulation.worker-alpha_1.js",
      environmentWorkerName: "environment-sampler.worker-beta-2.js",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("browser Worker verifier fails instead of guessing an old or ambiguous output", async () => {
  const { root, assets } = await fixtureRoot();
  try {
    await writeFile(join(assets, "simulation.worker-first.js"), "export {}");
    await writeFile(join(assets, "simulation.worker-second.js"), "export {}");
    await writeFile(join(assets, "environment-sampler.worker-one.js"), "export {}");
    assert.throws(
      () => resolveBrowserWorkerAssets(root),
      /Expected exactly one simulation Worker asset/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("browser Worker verifier fails when the declared Vinext output is absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "vector-browser-worker-assets-"));
  try {
    assert.throws(
      () => resolveBrowserWorkerAssets(root),
      /Build the production browser Workers before verification/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
