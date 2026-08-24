import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const run = (command, arguments_) =>
  spawnSync(command, arguments_, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
  });

test("the documented context-slice command resolves in a clean checkout", async () => {
  await access("scripts/context-slice.sh", constants.X_OK);
  const result = run("scripts/context-slice.sh", ["release"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^STREAM: release$/m);
  assert.match(result.stdout, /OWNING GITHUB ISSUES:/);
  assert.match(result.stdout, /Makefile/);
});

test("the harness rejects an unknown context stream", () => {
  const result = run("scripts/context-slice.sh", ["not-a-stream"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown stream/i);
});

test("every declared verification layer has a named Make target", async () => {
  const makefile = await readFile("Makefile", "utf8");
  for (const target of [
    "ci-local",
    "worker-local",
    "frontend-local",
    "integration-local",
    "performance-local",
    "observability-local",
    "container-verify",
    "air-reference-local",
    "clean-clone-local",
  ]) {
    assert.match(makefile, new RegExp(`^${target}:`, "m"), `${target} is not declared`);
    const dryRun = run("make", ["--dry-run", target]);
    assert.equal(dryRun.status, 0, `${target}: ${dryRun.stderr}`);
    assert.ok(dryRun.stdout.trim(), `${target} has no executable command contract`);
  }
});

test("the load-sensitive generic-AAM baseline runs before other local performance workloads", async () => {
  const makefile = await readFile("Makefile", "utf8");
  const performance = makefile.split(/^performance-local:/m)[1]?.split(/^capacity-baseline-local:/m)[0];
  assert.ok(performance, "performance-local is not declared");
  assert.ok(
    performance.indexOf("npm run reference-aam:performance") < performance.indexOf("npm run performance:verify"),
    "the M5 generic-AAM baseline must run before other performance workloads contaminate its host context",
  );
});

test("the clean-clone gate executes the context slice and built Worker verifier", async () => {
  const makefile = await readFile("Makefile", "utf8");
  const cleanClone = makefile.split(/^clean-clone-local:/m)[1];
  assert.ok(cleanClone, "clean-clone-local is not declared");
  assert.match(cleanClone, /scripts\/context-slice\.sh release/);
  assert.match(cleanClone, /make ci-local worker-local/);
});

test("the integration target delegates server lifecycle and retains its log", async () => {
  const makefile = await readFile("Makefile", "utf8");
  const integration = makefile.split(/^integration-ci:/m)[1]?.split(/^observability-local:/m)[0];
  assert.ok(integration, "integration-ci is not declared");
  assert.match(integration, /node scripts\/run-managed-server\.mjs/);
  assert.doesNotMatch(integration, /&\s*\\|trap\s/);

  const workflow = await readFile(".github/workflows/ci.yml", "utf8");
  const integrationJob = workflow.split(/^  integration:/m)[1]?.split(/^  container:/m)[0];
  assert.ok(integrationJob, "integration job is missing");
  assert.match(integrationJob, /path: outputs\/integration\//);
});

test("the pull request template requires layer-specific evidence", async () => {
  const template = await readFile(".github/pull_request_template.md", "utf8");
  assert.match(template, /Owning issue/);
  assert.match(template, /Test layer/);
  assert.match(template, /Omitted layers and reasons/);
  assert.match(template, /pushed commit SHA/i);
  assert.match(template, /Closure classification/);
  assert.match(template, /Acceptance criteria addressed/);
  assert.match(template, /Closure verdict/);
});

test("the script-based Required PR Gate checks out the tested revision", async () => {
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");
  const gate = workflow.split(/^  gate:/m)[1];
  assert.ok(gate, "Required PR Gate job is missing");
  const checkout = gate.indexOf("uses: actions/checkout@");
  const nodeSetup = gate.indexOf("uses: actions/setup-node@");
  const verification = gate.indexOf("run: node scripts/verify-required-gates.mjs");
  assert.ok(checkout >= 0, "Required PR Gate does not check out source");
  assert.ok(nodeSetup > checkout, "Required PR Gate does not pin Node after checkout");
  assert.ok(verification > nodeSetup, "Required PR Gate runs before its source and runtime exist");
  assert.match(gate, /PR_REVIEW_KIND/);
});

test("selected browser contracts isolate every viewport before verifying the built Worker", async () => {
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");
  const browser = workflow.split(/^  browser_tests:/m)[1]?.split(/^  rust_audit:/m)[0];
  assert.ok(browser, "Browser Contract job is missing");
  const browserContracts = browser.indexOf("npm run test:browser:ci");
  const workerVerification = browser.indexOf("npm run worker:verify");
  assert.ok(browserContracts >= 0, "Browser Contract does not execute browser tests");
  assert.ok(
    workerVerification > browserContracts,
    "Browser Contract does not verify the production-built Worker after browser tests",
  );
});

test("hosted Rust stages own the complete private 6DOF verifier gate", async () => {
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");
  const rust = workflow.split(/^  rust_tests:/m)[1]?.split(/^  browser_tests:/m)[0];
  const audit = workflow.split(/^  rust_audit:/m)[1]?.split(/^  integration:/m)[0];
  assert.ok(rust, "Rust/WASM job is missing");
  assert.ok(audit, "Rust dependency-audit job is missing");

  assert.match(rust, /verification-rust\/sixdof-foundation\s*->\s*target/);
  for (const command of [
    "sixdof-foundation:rust:fmt",
    "sixdof-foundation:rust:clippy",
    "sixdof-foundation:rust:verify",
    "sixdof-foundation:rust:test",
    "sixdof-foundation:rust:doc",
    "sixdof-foundation:verify",
    "sixdof-foundation:performance",
  ]) {
    assert.match(rust, new RegExp(`npm run ${command.replaceAll(":", "\\:")}`), `${command} is not owned by Stage 2B`);
  }
  assert.match(
    audit,
    /cargo audit --file verification-rust\/sixdof-foundation\/Cargo\.lock/,
    "Stage 2C does not audit the private verifier lockfile",
  );
});

test("hosted Rust stages own the complete generic-AAM verifier gate", async () => {
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");
  const rust = workflow.split(/^  rust_tests:/m)[1]?.split(/^  browser_tests:/m)[0];
  const audit = workflow.split(/^  rust_audit:/m)[1]?.split(/^  integration:/m)[0];
  assert.ok(rust, "Rust/WASM job is missing");
  assert.ok(audit, "Rust dependency-audit job is missing");

  assert.match(rust, /verification-rust\/generic-aam\s*->\s*target/);
  for (const command of [
    "reference-aam:rust:fmt",
    "reference-aam:rust:clippy",
    "reference-aam:rust:verify",
    "reference-aam:rust:test",
    "reference-aam:rust:doc",
    "reference-aam:verify",
    "reference-aam:performance:hosted-linux-x64",
  ]) {
    assert.match(rust, new RegExp(`npm run ${command.replaceAll(":", "\\:")}`), `${command} is not owned by Stage 2B`);
  }
  assert.match(
    audit,
    /cargo audit --file verification-rust\/generic-aam\/Cargo\.lock/,
    "Stage 2C does not audit the generic-AAM verifier lockfile",
  );
});

test("Rust and private WASM builds use one exact cross-host toolchain", async () => {
  const toolchain = await readFile("rust-toolchain.toml", "utf8");
  assert.match(toolchain, /^channel = "1\.97\.1"$/m);
  assert.match(toolchain, /^profile = "minimal"$/m);
  assert.match(toolchain, /^components = \["clippy", "rustfmt"\]$/m);
  assert.match(toolchain, /^targets = \["wasm32-unknown-unknown"\]$/m);

  for (const workflowPath of [
    ".github/workflows/ci.yml",
    ".github/workflows/deploy-cloudflare.yml",
    ".github/workflows/release.yml",
  ]) {
    const workflow = await readFile(workflowPath, "utf8");
    assert.doesNotMatch(workflow, /toolchain:\s*stable/);
    assert.match(workflow, /toolchain:\s*1\.97\.1/);
  }

  const sharedBuilder = await readFile("scripts/lib/canonical-rust-wasm-builder.mjs", "utf8");
  assert.match(sharedBuilder, /rust:1\.97\.1-bookworm@sha256:408fe88047cef61a2087653b0c5255fa51c0f2d6d94ddedd7a2562a9b91a46f6/);
  assert.match(sharedBuilder, /linux\/amd64/);
  assert.match(sharedBuilder, /trap restore_target_ownership EXIT/);
  assert.match(sharedBuilder, /chown -R --.*\/target/);

  for (const builderPath of [
    "scripts/build-sixdof-foundation-verifier.mjs",
    "scripts/build-generic-aam-verifier.mjs",
  ]) {
    const builder = await readFile(builderPath, "utf8");
    assert.match(builder, /buildCanonicalRustWasm/);
    assert.match(builder, /freshSha256/);
    assert.match(builder, /committedSha256/);
  }
});

test("private 6DOF npm aliases resolve to the intended crate and verification commands", async () => {
  const manifest = JSON.parse(await readFile("package.json", "utf8"));
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(manifest.scripts).filter(([name]) => name.startsWith("sixdof-foundation:")),
    ),
    {
      "sixdof-foundation:verify":
        "node --import tsx --test tests/sixdof-foundation.test.mjs",
      "sixdof-foundation:performance": "tsx scripts/benchmark-sixdof-foundation.ts",
      "sixdof-foundation:rust:build":
        "node scripts/build-sixdof-foundation-verifier.mjs",
      "sixdof-foundation:rust:verify":
        "node scripts/build-sixdof-foundation-verifier.mjs --check",
      "sixdof-foundation:rust:fmt":
        "cargo fmt --manifest-path verification-rust/sixdof-foundation/Cargo.toml -- --check",
      "sixdof-foundation:rust:clippy":
        "cargo clippy --manifest-path verification-rust/sixdof-foundation/Cargo.toml --locked --all-targets -- -D warnings",
      "sixdof-foundation:rust:test":
        "cargo test --manifest-path verification-rust/sixdof-foundation/Cargo.toml --locked --all-targets",
      "sixdof-foundation:rust:doc":
        "RUSTDOCFLAGS='-D warnings' cargo doc --manifest-path verification-rust/sixdof-foundation/Cargo.toml --locked --no-deps",
    },
  );
});

test("generic-AAM npm aliases resolve to the intended crate and verification commands", async () => {
  const manifest = JSON.parse(await readFile("package.json", "utf8"));
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(manifest.scripts).filter(([name]) => name.startsWith("reference-aam:")),
    ),
    {
      "reference-aam:verify": "node --import tsx scripts/verify-nasa-generic-aam-reference.mjs",
      "reference-aam:performance": "tsx scripts/benchmark-generic-aam.ts --profile=APPLE_M5_NODE24",
      "reference-aam:performance:hosted-linux-x64":
        "tsx scripts/benchmark-generic-aam.ts --profile=GITHUB_HOSTED_UBUNTU24_X64_NODE22",
      "reference-aam:rust:build": "node scripts/build-generic-aam-verifier.mjs",
      "reference-aam:rust:verify": "node scripts/build-generic-aam-verifier.mjs --check",
      "reference-aam:rust:fmt":
        "cargo fmt --manifest-path verification-rust/generic-aam/Cargo.toml -- --check",
      "reference-aam:rust:clippy":
        "cargo clippy --manifest-path verification-rust/generic-aam/Cargo.toml --locked --all-targets -- -D warnings",
      "reference-aam:rust:test":
        "cargo test --manifest-path verification-rust/generic-aam/Cargo.toml --locked --all-targets",
      "reference-aam:rust:doc":
        "RUSTDOCFLAGS='-D warnings' cargo doc --manifest-path verification-rust/generic-aam/Cargo.toml --locked --no-deps",
    },
  );
});

test("backend docs distinguish canonical private bytes from host-native Rust checks", async () => {
  const docs = await readFile("docs/engine-backends.md", "utf8");
  assert.match(
    docs,
    /Both private\s+verifier modules require canonical Linux\/amd64 raw-byte artifact generation\./,
  );
  assert.match(
    docs,
    /Generic-AAM `:build` and `:verify` use that container, while `:fmt`, `:clippy`,\s+`:test`, and `:doc` run on the host with exact repository-pinned Rust 1\.97\.1\./,
  );
});

test("browser-local uses the governed isolated browser runner", async () => {
  const makefile = await readFile("Makefile", "utf8");
  const browserLocal = makefile.split(/^browser-local:/m)[1]?.split(/^air-reference-local:/m)[0];
  assert.ok(browserLocal, "browser-local is not declared");
  assert.match(browserLocal, /npm run test:browser:ci/);
  assert.doesNotMatch(browserLocal, /npm run test:browser\s*$/m);

  const runner = await readFile("scripts/run-browser-contracts.mjs", "utf8");
  assert.match(runner, /RUN_ALL_PROJECTS_ONCE/);
  assert.match(runner, /--retries=0/);
  assert.match(runner, /--workers=1/);
});

test("the Worker verifier uses the pinned Playwright browser outside local overrides", async () => {
  const verifier = await readFile("scripts/verify-browser-worker.ts", "utf8");
  assert.match(verifier, /VECTOR_CHROME_PATH\s*\?\?\s*chromium\.executablePath\(\)/);
  assert.doesNotMatch(verifier, /\/Applications\/Google Chrome\.app/);
});

async function unusedLocalPort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

test("managed live-target failure retains its server log and releases the port", async (t) => {
  const { runManagedServer } = await import("../scripts/run-managed-server.mjs");
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "vector-managed-server-"));
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const port = await unusedLocalPort();
  const logPath = join(temporaryDirectory, "application.log");
  const serverProgram = [
    "const http = require('node:http');",
    `const server = http.createServer((_request, response) => response.end('ready')).listen(${port}, '127.0.0.1', () => console.log('managed-server-ready'));`,
    "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
  ].join("");
  const taskProgram = [
    `fetch('http://127.0.0.1:${port}')`,
    ".then((response) => response.text())",
    ".then((body) => { if (body !== 'ready') process.exit(8); process.exit(7); })",
    ".catch(() => process.exit(9));",
  ].join("");

  const result = await runManagedServer({
    server: { command: process.execPath, args: ["-e", serverProgram] },
    task: { command: process.execPath, args: ["-e", taskProgram] },
    logPath,
    readyUrl: `http://127.0.0.1:${port}`,
    startupTimeoutMs: 2_000,
    shutdownTimeoutMs: 1_000,
  });
  assert.equal(result.taskExitCode, 7);
  assert.match(await readFile(logPath, "utf8"), /managed-server-ready/);

  const probe = createServer();
  probe.listen(port, "127.0.0.1");
  await once(probe, "listening");
  await new Promise((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
});

test("managed early server exit fails the task, retains diagnostics, and releases the port", async (t) => {
  const { runManagedServer } = await import("../scripts/run-managed-server.mjs");
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "vector-managed-server-exit-"));
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const port = await unusedLocalPort();
  const logPath = join(temporaryDirectory, "application.log");
  const serverProgram = [
    "const http = require('node:http');",
    `const server = http.createServer((_request, response) => response.end('ready')).listen(${port}, '127.0.0.1', () => { console.error('deliberate-server-exit'); setTimeout(() => server.close(() => process.exit(23)), 150); });`,
  ].join("");
  const taskProgram = "setTimeout(() => process.exit(0), 10000);";

  const result = await runManagedServer({
    server: { command: process.execPath, args: ["-e", serverProgram] },
    task: { command: process.execPath, args: ["-e", taskProgram] },
    logPath,
    readyUrl: `http://127.0.0.1:${port}`,
    startupTimeoutMs: 2_000,
    shutdownTimeoutMs: 1_000,
  });
  assert.deepEqual(result, {
    taskExitCode: 1,
    serverExitedEarly: true,
    interruptedBy: null,
  });
  assert.match(await readFile(logPath, "utf8"), /deliberate-server-exit/);

  const probe = createServer();
  probe.listen(port, "127.0.0.1");
  await once(probe, "listening");
  await new Promise((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
});

test("managed cleanup terminates descendants after their task leader exits", async (t) => {
  const { runManagedServer } = await import("../scripts/run-managed-server.mjs");
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "vector-managed-descendant-"));
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const serverPort = await unusedLocalPort();
  const descendantPort = await unusedLocalPort();
  const logPath = join(temporaryDirectory, "application.log");
  const serverProgram = [
    "const http = require('node:http');",
    `const server = http.createServer((_request, response) => response.end('ready')).listen(${serverPort}, '127.0.0.1');`,
    "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
  ].join("");
  const descendantProgram = [
    "const http = require('node:http');",
    `http.createServer((_request, response) => response.end('child')).listen(${descendantPort}, '127.0.0.1');`,
    "setTimeout(() => process.exit(0), 5000);",
  ].join("");
  const taskProgram = [
    "const { spawn } = require('node:child_process');",
    `const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendantProgram)}], { stdio: 'ignore' });`,
    "setTimeout(() => process.exit(child.pid ? 0 : 9), 100);",
  ].join("");

  const result = await runManagedServer({
    server: { command: process.execPath, args: ["-e", serverProgram] },
    task: { command: process.execPath, args: ["-e", taskProgram] },
    logPath,
    readyUrl: `http://127.0.0.1:${serverPort}`,
    startupTimeoutMs: 2_000,
    shutdownTimeoutMs: 1_000,
  });
  assert.equal(result.taskExitCode, 0);

  const probe = createServer();
  probe.listen(descendantPort, "127.0.0.1");
  await once(probe, "listening");
  await new Promise((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
});
