import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildCanonicalRustWasm,
  canonicalTargetOwnershipCommand,
} from "../scripts/lib/canonical-rust-wasm-builder.mjs";

test("canonical target ownership is restored to a non-root host without widening the path", () => {
  assert.equal(
    canonicalTargetOwnershipCommand({ uid: 1001, gid: 121 }),
    "chown -R -- 1001:121 /target",
  );
  assert.equal(canonicalTargetOwnershipCommand({ uid: undefined, gid: undefined }), ":");
  for (const identity of [
    { uid: -1, gid: 121 },
    { uid: 1001, gid: -1 },
    { uid: "1001", gid: 121 },
    { uid: 1001, gid: undefined },
  ]) {
    assert.throws(() => canonicalTargetOwnershipCommand(identity), /host uid\/gid/i);
  }
});

test("canonical builder restores ownership on success and removes its entire temporary target", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "vector-canonical-builder-test-"));
  const output = "wasm32-unknown-unknown/release/test.wasm";
  let shellCommand = "";
  try {
    const bytes = buildCanonicalRustWasm({
      root: process.cwd(),
      manifestPath: "verification-rust/generic-aam/Cargo.toml",
      outputPath: output,
      temporaryRoot,
      temporaryPrefix: "nonroot-success-",
      hostIdentity: { uid: 1001, gid: 121 },
      execute(_command, arguments_) {
        shellCommand = arguments_.at(-1);
        const volume = arguments_.find((entry) => entry.endsWith(":/target"));
        const target = volume.slice(0, -":/target".length);
        mkdirSync(join(target, "wasm32-unknown-unknown/release"), { recursive: true });
        writeFileSync(join(target, output), Buffer.from("canonical-wasm"));
      },
      read: readFileSync,
    });
    assert.deepEqual(bytes, Buffer.from("canonical-wasm"));
    assert.match(shellCommand, /trap restore_target_ownership EXIT/);
    assert.match(shellCommand, /chown -R -- 1001:121 \/target/);
    assert.doesNotMatch(shellCommand, /chown[^\n]*\/work/);
    assert.deepEqual(readdirSync(temporaryRoot), []);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("canonical builder removes its temporary target after a failed container build", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "vector-canonical-builder-test-"));
  try {
    assert.throws(() => buildCanonicalRustWasm({
      root: process.cwd(),
      manifestPath: "verification-rust/sixdof-foundation/Cargo.toml",
      outputPath: "wasm32-unknown-unknown/release/test.wasm",
      temporaryRoot,
      temporaryPrefix: "nonroot-failure-",
      hostIdentity: { uid: 1001, gid: 121 },
      execute(_command, arguments_) {
        const volume = arguments_.find((entry) => entry.endsWith(":/target"));
        const target = volume.slice(0, -":/target".length);
        mkdirSync(join(target, "release"), { recursive: true });
        writeFileSync(join(target, "release/.cargo-artifact-lock"), "locked");
        throw new Error("simulated container failure");
      },
    }), /simulated container failure/);
    assert.deepEqual(readdirSync(temporaryRoot), []);
    assert.equal(existsSync(join(temporaryRoot, "nonroot-failure-")), false);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("canonical builder rejects paths that could escape its read-only repo and target mounts", () => {
  for (const [field, value] of [
    ["manifestPath", "../outside/Cargo.toml"],
    ["manifestPath", "/tmp/Cargo.toml"],
    ["manifestPath", "verification-rust/generic-aam/Cargo.toml;chown -R 0:0 /work"],
    ["outputPath", "../outside.wasm"],
    ["outputPath", "/tmp/outside.wasm"],
  ]) {
    assert.throws(() => buildCanonicalRustWasm({
      root: process.cwd(),
      manifestPath: "verification-rust/generic-aam/Cargo.toml",
      outputPath: "wasm32-unknown-unknown/release/test.wasm",
      temporaryPrefix: "confined-",
      [field]: value,
      execute() {
        assert.fail("invalid paths must reject before Docker execution");
      },
    }), /confined repository-relative path/);
  }
});
