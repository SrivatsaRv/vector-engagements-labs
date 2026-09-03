import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import test from "node:test";

import binaryen from "binaryen";

const repositoryRoot = resolve(import.meta.dirname, "..");

function validEngineWasm(extraExport = "") {
  const wasmModule = binaryen.parseText(`
    (module
      (memory (export "memory") 1)
      (func (export "vector_abi_version") (result i32) (i32.const 1))
      (func (export "vector_input_reserve") (param i32) (result i32) (i32.const 0))
      (func (export "vector_max_input_len") (result i32) (i32.const 1024))
      (func (export "vector_output_len") (result i32) (i32.const 0))
      (func (export "vector_output_ptr") (result i32) (i32.const 0))
      (func (export "vector_reference_run_json") (result i32) (i32.const 1))
      (func (export "vector_run_json") (result i32) (i32.const 1))
      ${extraExport}
    )
  `);
  assert.equal(wasmModule.validate(), 1);
  const bytes = Buffer.from(wasmModule.emitBinary());
  wasmModule.dispose();
  return bytes;
}

async function createBuilderFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "vector-rust-engine-freshness-"));
  t.after(() => rm(root, { force: true, recursive: true, maxRetries: 5, retryDelay: 100 }));
  await Promise.all([
    mkdir(join(root, "scripts"), { recursive: true }),
    mkdir(join(root, "engine-rust", "src"), { recursive: true }),
    mkdir(join(root, "lib", "engine", "generated"), { recursive: true }),
    mkdir(join(root, "bin"), { recursive: true }),
  ]);
  await Promise.all([
    copyFile(
      join(repositoryRoot, "scripts", "build-rust-engine.mjs"),
      join(root, "scripts", "build-rust-engine.mjs"),
    ),
    writeFile(join(root, "engine-rust", "Cargo.toml"), "[package]\nname='vector-engine'\nversion='0.0.0'\n"),
    writeFile(join(root, "engine-rust", "Cargo.lock"), "version = 3\n"),
    writeFile(join(root, "engine-rust", "src", "lib.rs"), "pub fn fixture() {}\n"),
    symlink(join(repositoryRoot, "node_modules"), join(root, "node_modules"), "dir"),
  ]);

  const cargoPath = join(root, "bin", "cargo");
  await writeFile(cargoPath, `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
const manifestIndex = args.indexOf("--manifest-path");
const targetIndex = args.indexOf("--target-dir");
if (!args.includes("build") || manifestIndex < 0 || targetIndex < 0) process.exit(64);
const manifest = args[manifestIndex + 1];
const target = args[targetIndex + 1];
if (!manifest || !target || !process.env.VECTOR_TEST_WASM_BASE64) process.exit(65);
const output = join(target, "wasm32-unknown-unknown", "release", "vector_engine.wasm");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, Buffer.from(process.env.VECTOR_TEST_WASM_BASE64, "base64"));
if (process.env.VECTOR_TEST_CAPTURE_ENV) {
  writeFileSync(process.env.VECTOR_TEST_CAPTURE_ENV, JSON.stringify(process.env));
}
`);
  await chmod(cargoPath, 0o755);
  return {
    builder: join(root, "scripts", "build-rust-engine.mjs"),
    capture: join(root, "cargo-environment.json"),
    generated: join(root, "lib", "engine", "generated", "vector-engine-wasm.ts"),
    root,
  };
}

function runBuilder(fixture, wasm, args = []) {
  return spawnSync(process.execPath, [fixture.builder, ...args], {
    cwd: fixture.root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${join(fixture.root, "bin")}${delimiter}${process.env.PATH ?? ""}`,
      VECTOR_TEST_CAPTURE_ENV: fixture.capture,
      VECTOR_TEST_WASM_BASE64: wasm.toString("base64"),
      CARGO: "/ambient/cargo-must-not-run",
      CARGO_BUILD_RUSTFLAGS: "--cfg ambient_build_flags_must_not_survive",
      CARGO_BUILD_TARGET: "ambient-target-must-not-survive",
      CARGO_ENCODED_RUSTFLAGS: "ambient encoded flags must not survive",
      CARGO_INCREMENTAL: "1",
      CARGO_PROFILE_RELEASE_OPT_LEVEL: "0",
      CARGO_TARGET_DIR: "/ambient/target-must-not-survive",
      CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUSTFLAGS: "--cfg ambient_target_flags_must_not_survive",
      RUSTC: "/ambient/rustc-must-not-run",
      RUSTC_BOOTSTRAP: "1",
      RUSTC_WRAPPER: "/ambient/wrapper-must-not-run",
      RUSTC_WORKSPACE_WRAPPER: "/ambient/workspace-wrapper-must-not-run",
      RUSTDOC: "/ambient/rustdoc-must-not-run",
      RUSTDOCFLAGS: "--cfg ambient_rustdoc_flags_must_not_survive",
      RUSTFLAGS: "--cfg ambient_rustflags_must_not_survive",
      RUSTUP_TOOLCHAIN: "ambient-toolchain-must-not-survive",
    },
  });
}

test("Rust engine freshness executes under a scrubbed build environment and rejects noncanonical metadata", async (t) => {
  const fixture = await createBuilderFixture(t);
  const admitted = validEngineWasm();

  const generated = runBuilder(fixture, admitted);
  assert.equal(generated.status, 0, generated.stderr);
  const cargoEnvironment = JSON.parse(await readFile(fixture.capture, "utf8"));
  for (const key of [
    "CARGO",
    "CARGO_BUILD_RUSTFLAGS",
    "CARGO_BUILD_TARGET",
    "CARGO_ENCODED_RUSTFLAGS",
    "CARGO_PROFILE_RELEASE_OPT_LEVEL",
    "CARGO_TARGET_DIR",
    "CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUSTFLAGS",
    "RUSTC",
    "RUSTC_BOOTSTRAP",
    "RUSTC_WRAPPER",
    "RUSTC_WORKSPACE_WRAPPER",
    "RUSTDOC",
    "RUSTDOCFLAGS",
    "RUSTFLAGS",
    "RUSTUP_TOOLCHAIN",
  ]) {
    assert.equal(cargoEnvironment[key], undefined, `${key} reached Cargo`);
  }
  assert.equal(cargoEnvironment.CARGO_INCREMENTAL, "0");
  assert.equal(cargoEnvironment.LANG, "C");
  assert.equal(cargoEnvironment.LC_ALL, "C");
  assert.equal(cargoEnvironment.TZ, "UTC");

  const exact = runBuilder(fixture, admitted, ["--check"]);
  assert.equal(exact.status, 0, exact.stderr);

  const committedSource = await readFile(fixture.generated, "utf8");
  await writeFile(fixture.generated, committedSource.replace(/VECTOR_ENGINE_SOURCE_SHA256 = "[a-f0-9]{64}"/u, 'VECTOR_ENGINE_SOURCE_SHA256 = "0000000000000000000000000000000000000000000000000000000000000000"'));
  const noncanonical = runBuilder(fixture, admitted, ["--check"]);
  assert.notEqual(noncanonical.status, 0);
  assert.match(noncanonical.stderr, /does not match the current Rust source/u);
  await writeFile(fixture.generated, committedSource);

});
