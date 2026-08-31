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
    "generic-sensor-sources-local",
    "clean-clone-local",
  ]) {
    assert.match(makefile, new RegExp(`^${target}:`, "m"), `${target} is not declared`);
    const dryRun = run("make", ["--dry-run", target]);
    assert.equal(dryRun.status, 0, `${target}: ${dryRun.stderr}`);
    assert.ok(dryRun.stdout.trim(), `${target} has no executable command contract`);
  }
});

test("the generic sensor generator and verifier are mandatory quality gates", async () => {
  const makefile = await readFile("Makefile", "utf8");
  const quality = makefile.split(/^ci-quality:/m)[1]?.split(/^ci-tests:/m)[0];
  assert.ok(quality, "ci-quality is not declared");
  assert.match(quality, /npm run generic-sensor:sources:verify/);

  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  assert.match(packageJson.scripts["generic-sensor:sources:verify"], /generate-generic-sensor-source-manifest\.mjs/);
  assert.match(packageJson.scripts["generic-sensor:sources:verify"], /verify-generic-sensor-source-bundle\.mjs/);
  assert.match(packageJson.scripts["generic-sensor:sources:verify"], /generic-sensor-network-deny\.cjs/);
  assert.match(packageJson.scripts["generic-sensor:sources:verify"], /generic-sensor-source-bundle\.test\.mjs/);

  const worker = makefile.split(/^worker-local:/m)[1]?.split(/^frontend-local:/m)[0];
  assert.ok(worker, "worker-local is not declared");
  assert.match(worker, /npm run build[\s\S]*npm run generic-sensor:sources:verify/);
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
  assert.match(template, /vector-contract-doc-impact/);
  assert.match(template, /vector\.contract-doc-impact-declaration\.v1/);
  assert.match(template, /contract-document ownership policy.*governance\/contract-doc-ownership\.v1\.json/i);
  assert.match(template, /npm run --silent policy:contract-docs:template/);
  assert.match(template, /DELIVERY_CONTINUOUS_INTEGRATION/);
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
  assert.match(gate, /CONTRACT_DOC_IMPACT_STATE/);
});

test("local, hosted, and clean-clone gates execute the same documentation-impact validator", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(packageJson.scripts["policy:contract-docs:verify"], "node scripts/verify-contract-doc-impact.mjs");
  assert.equal(packageJson.scripts["policy:contract-docs:template"], "node scripts/verify-contract-doc-impact.mjs --print-template");
  const makefile = await readFile("Makefile", "utf8");
  assert.match(makefile, /npm run policy:contract-docs:verify/);
  assert.match(makefile, /VECTOR_CONTRACT_DOC_DECLARATION_FILE/);
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");
  const contractDocs = workflow.split(/^  contract_docs:/m)[1]?.split(/^  quality:/m)[0];
  assert.ok(contractDocs, "contract documentation job is missing");
  assert.match(contractDocs, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(contractDocs, /actions-rust-lang\/setup-rust-toolchain@/);
  assert.match(contractDocs, /target: wasm32-unknown-unknown/);
  assert.match(contractDocs, /Swatinem\/rust-cache@/);
  assert.match(contractDocs, /workspaces: engine-rust/);
  const nodeInstall = contractDocs.indexOf("run: npm ci --ignore-scripts");
  assert.ok(nodeInstall > contractDocs.indexOf("uses: actions/setup-node@"), "contract documentation dependencies install before Node is pinned");
  assert.ok(nodeInstall < contractDocs.indexOf("node scripts/verify-contract-doc-impact.mjs --github-event"), "contract documentation validator runs before locked dependencies are installed");
  assert.ok(contractDocs.indexOf("target: wasm32-unknown-unknown") < contractDocs.indexOf("node scripts/verify-contract-doc-impact.mjs --github-event"));
  assert.match(contractDocs, /node scripts\/verify-contract-doc-impact\.mjs --github-event/);
  assert.match(workflow, /contract_docs_state/);
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
  const evidencePolicy = await readFile("scripts/air-combat-evidence-policy.ts", "utf8");
  assert.match(verifier, /VECTOR_CHROME_PATH\s*\?\?\s*chromium\.executablePath\(\)/);
  assert.doesNotMatch(verifier, /\/Applications\/Google Chrome\.app/);
  assert.match(verifier, /fixtures\/vector-record\/issue-197/);
  assert.match(verifier, /trackedAirCombatEvidenceSignature/);
  assert.match(verifier, /nonManifestMembers/);
  assert.match(verifier, /publishOrVerifyAirCombatEvidence/);
  assert.match(evidencePolicy, /Tracked issue #197 evidence .* semantically stale/);
  assert.match(evidencePolicy, /Write mode requires an explicit staging directory/);
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
