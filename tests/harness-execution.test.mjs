import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
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

test("selected browser contracts verify the built Worker artifact", async () => {
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");
  const browser = workflow.split(/^  browser_tests:/m)[1]?.split(/^  rust_audit:/m)[0];
  assert.ok(browser, "Browser Contract job is missing");
  const browserContracts = browser.indexOf("npm run test:browser");
  const workerVerification = browser.indexOf("npm run worker:verify");
  assert.ok(browserContracts >= 0, "Browser Contract does not execute browser tests");
  assert.ok(
    workerVerification > browserContracts,
    "Browser Contract does not verify the production-built Worker after browser tests",
  );
});
