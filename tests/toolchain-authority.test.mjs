import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  inspectToolchain,
  readToolchainAuthority,
  validateToolchain,
} from "../scripts/lib/toolchain-authority.mjs";

test("toolchain authority is exact and shared by package metadata", async () => {
  const authority = readToolchainAuthority();
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(authority, {
    node: "22.18.0",
    npm: "10.9.3",
    rust: "1.97.1",
    poppler: "26.05.0",
    wasmTarget: "wasm32-unknown-unknown",
  });
  assert.equal(manifest.engines.node, authority.node);
  assert.equal(manifest.engines.npm, authority.npm);
  assert.equal(manifest.packageManager, `npm@${authority.npm}`);
});

test("toolchain inspection records executable versions without shell parsing", () => {
  const responses = new Map([
    ["npm --version", "10.9.3"],
    ["rustc --version", "rustc 1.97.1 (fixture)"],
    ["pdftoppm -v", "pdftoppm version 26.05.0"],
    ["rustup target list --installed", "wasm32-unknown-unknown\nx86_64-unknown-linux-gnu\n"],
  ]);
  const actual = inspectToolchain({
    nodeVersion: "22.18.0",
    run: (command, arguments_) => responses.get(`${command} ${arguments_.join(" ")}`),
  });
  assert.deepEqual(actual, {
    node: "22.18.0",
    npm: "10.9.3",
    rust: "1.97.1",
    poppler: "26.05.0",
    rustTargets: ["wasm32-unknown-unknown", "x86_64-unknown-linux-gnu"],
  });
});

test("toolchain admission reports every mismatch in one fast failure", () => {
  assert.throws(
    () => validateToolchain(
      { node: "22.18.0", npm: "10.9.3", rust: "1.97.1", poppler: "26.05.0", wasmTarget: "wasm32-unknown-unknown" },
      { node: "24.3.0", npm: "11.4.2", rust: "1.96.0", poppler: "25.0.0", rustTargets: [] },
    ),
    (error) => {
      assert.match(error.message, /node: required 22\.18\.0, found 24\.3\.0/u);
      assert.match(error.message, /npm: required 10\.9\.3, found 11\.4\.2/u);
      assert.match(error.message, /rust: required 1\.97\.1, found 1\.96\.0/u);
      assert.match(error.message, /poppler: required 26\.05\.0, found 25\.0\.0/u);
      assert.match(error.message, /Rust target: required wasm32-unknown-unknown, found none/u);
      return true;
    },
  );
});

test("local macOS preflight may omit the hosted-only pinned renderer", () => {
  const responses = new Map([
    ["npm --version", "10.9.3"],
    ["rustc --version", "rustc 1.97.1 (fixture)"],
    ["rustup target list --installed", "wasm32-unknown-unknown\n"],
  ]);
  const actual = inspectToolchain({
    nodeVersion: "22.18.0",
    allowMissingPoppler: true,
    run: (command, arguments_) => {
      const key = `${command} ${arguments_.join(" ")}`;
      if (key === "pdftoppm -v") throw new Error("pdftoppm is unavailable.");
      return responses.get(key);
    },
  });
  assert.equal(actual.poppler, null);
  assert.doesNotThrow(() => validateToolchain(
    { node: "22.18.0", npm: "10.9.3", rust: "1.97.1", poppler: "26.05.0", wasmTarget: "wasm32-unknown-unknown" },
    actual,
    { allowMissingPoppler: true },
  ));
});

test("Make and hosted workflows consume the same bounded gate commands", async () => {
  const [makefile, ci, release, deploy] = await Promise.all([
    readFile(new URL("../Makefile", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/deploy-cloudflare.yml", import.meta.url), "utf8"),
  ]);
  const dryRun = spawnSync("make", ["--dry-run", "ci-local"], { encoding: "utf8" });
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.ok(
    dryRun.stdout.indexOf("npm run toolchain:verify") < dryRun.stdout.indexOf("npm run policy:runtime-stubs:verify"),
    "toolchain admission must fail before expensive verification starts",
  );
  assert.doesNotMatch(dryRun.stdout, /policy:contract-docs:verify/u);
  assert.match(makefile, /^ci-quality-core:[\s\S]*?npm run environment:migration:verify[\s\S]*?npm run air-combat-studies:migration:verify/mu);
  assert.match(ci, /name: "Stage 1A: Web Quality"[\s\S]*?run: make ci-quality-core/u);

  for (const workflow of [ci, release, deploy]) {
    for (const match of workflow.matchAll(/node-version:\s*([^\s]+)/gu)) {
      assert.equal(match[1], "22.18.0");
    }
  }

  const releaseVerify = release.split(/^  verify:/mu)[1]?.split(/^  publish:/mu)[0];
  assert.ok(releaseVerify, "release verification job is missing");
  assert.match(releaseVerify, /make ci-local/u);
  assert.doesNotMatch(releaseVerify, /install-pinned-poppler-ubuntu/u);
  assert.match(ci, /name: "Stage 2E: Source Evidence Reproduction"[\s\S]*?scripts\/install-pinned-poppler-ubuntu\.sh[\s\S]*?npm run source-evidence:render-verify/u);
  assert.match(ci, /name: "Stage 2C: Rust Dependency Audit"[\s\S]*?run: make rust-audit-local/u);
  assert.match(releaseVerify, /cargo install cargo-audit[\s\S]*?make rust-audit-local/u);
  const rustAudit = makefile.split(/^rust-audit-local:/mu)[1]?.split(/^db-up:/mu)[0];
  assert.ok(rustAudit, "shared Rust audit target is missing");
  for (const lockfile of [
    "engine-rust/Cargo.lock",
    "verification-rust/generic-aam/Cargo.lock",
    "verification-rust/tp1538-aero/Cargo.lock",
  ]) {
    assert.match(rustAudit, new RegExp(lockfile.replaceAll("/", "\\/"), "u"));
  }
});
