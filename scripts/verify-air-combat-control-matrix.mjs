import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const matrixPath = resolve(repoRoot, "governance/air-combat-study-control-matrix.v1.json");

export function readControlMatrix() {
  return JSON.parse(readFileSync(matrixPath, "utf8"));
}

export function validateControlMatrix(matrix) {
  assert.deepEqual(Object.keys(matrix).sort(), ["gapOwnerIssue", "ownerIssue", "rows", "schemaVersion", "scope"]);
  assert.equal(matrix.schemaVersion, "vector.air-combat-study-control-matrix.v1");
  assert.equal(matrix.scope, "ISSUE_197_THREE_GOVERNED_STUDIES_ONLY");
  assert.equal(matrix.ownerIssue, 197);
  assert.equal(matrix.gapOwnerIssue, 193);
  assert.equal(matrix.rows.length, 14, "#197 owns exactly fourteen scoped control-family rows");

  const rowIds = new Set();
  const caseIds = new Set();
  for (const row of matrix.rows) {
    assert.deepEqual(
      Object.keys(row).sort(),
      ["admission", "causality", "controls", "evidence", ...(row.status === "GAP" ? ["gap"] : []), "id", "kind", "projection", "status"].sort(),
      `${row.id} has an unknown or missing field`,
    );
    assert.match(row.id, /^I197-CTRL-[A-Z0-9-]+$/);
    assert.equal(rowIds.has(row.id), false, `duplicate row ${row.id}`);
    rowIds.add(row.id);
    assert.ok(Array.isArray(row.controls) && row.controls.length > 0, `${row.id} has no controls`);
    assert.equal(new Set(row.controls).size, row.controls.length, `${row.id} repeats a control`);
    assert.ok(["NUMERIC", "ENUM_IDENTITY", "MIXED"].includes(row.kind), `${row.id} has an unknown kind`);
    assert.ok(["PROVED", "GAP"].includes(row.admission), `${row.id} has an unknown admission state`);
    assert.ok(["RUNTIME_EFFECT", "PROJECTION_ONLY", "NO_RUNTIME_EFFECT", "MIXED_CAUSALITY", "N_A", "GAP"].includes(row.causality), `${row.id} has an unknown causal state`);
    assert.equal(row.projection, "PROVED", `${row.id} cannot claim completion without projection evidence`);
    assert.ok(["COVERED", "GAP"].includes(row.status), `${row.id} has an unknown completion state`);
    if (row.status === "COVERED") {
      assert.notEqual(row.admission, "GAP", `${row.id} launders an admission gap`);
      assert.notEqual(row.causality, "GAP", `${row.id} launders a causal gap`);
      assert.equal("gap" in row, false, `${row.id} retains a gap reason while covered`);
    } else {
      assert.equal(typeof row.gap, "string", `${row.id} needs a gap reason`);
      assert.ok(row.gap.length >= 40, `${row.id} gap reason is not actionable`);
      assert.ok(row.admission === "GAP" || row.causality === "GAP", `${row.id} gap has no failing layer`);
    }
    assert.ok(Array.isArray(row.evidence) && row.evidence.length > 0, `${row.id} has no executable evidence`);
    for (const evidence of row.evidence) {
      assert.deepEqual(Object.keys(evidence).sort(), ["caseId", "file", "layers", "runner", "testName"]);
      assert.match(evidence.caseId, /^I197-[A-Z0-9-]+$/);
      assert.equal(caseIds.has(evidence.caseId), false, `duplicate case ${evidence.caseId}`);
      caseIds.add(evidence.caseId);
      assert.ok(["NODE_TEST", "VITEST"].includes(evidence.runner), `${evidence.caseId} has an unsupported runner`);
      assert.match(evidence.file, /^tests\/.+\.(?:mjs|ts|tsx)$/);
      assert.ok(evidence.testName.length > 10, `${evidence.caseId} lacks an exact executable test name`);
      assert.ok(Array.isArray(evidence.layers) && evidence.layers.length > 0, `${evidence.caseId} lacks layers`);
    }
  }
  return {
    rowCount: matrix.rows.length,
    coveredCount: matrix.rows.filter((row) => row.status === "COVERED").length,
    gapCount: matrix.rows.filter((row) => row.status === "GAP").length,
    caseCount: caseIds.size,
    completionReady: matrix.rows.every((row) => row.status === "COVERED"),
  };
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function commandFor(runner, file, names) {
  const exactPattern = `^(?:${names.map(escapeRegex).join("|")})$`;
  if (runner === "NODE_TEST") {
    return {
      executable: process.execPath,
      args: ["--import", "tsx", "--test", "--test-reporter=spec", "--test-name-pattern", exactPattern, file],
    };
  }
  return {
    executable: resolve(repoRoot, "node_modules/.bin/vitest"),
    args: ["run", file, "--reporter=verbose", "--testNamePattern", `(?:${names.map(escapeRegex).join("|")})`],
  };
}

export function executeControlMatrixEvidence(matrix) {
  const groups = new Map();
  for (const row of matrix.rows) {
    for (const evidence of row.evidence) {
      const key = `${evidence.runner}:${evidence.file}`;
      const group = groups.get(key) ?? { runner: evidence.runner, file: evidence.file, evidence: [] };
      group.evidence.push(evidence);
      groups.set(key, group);
    }
  }

  for (const group of groups.values()) {
    const names = [...new Set(group.evidence.map((item) => item.testName))];
    const command = commandFor(group.runner, group.file, names);
    const childEnvironment = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };
    delete childEnvironment.NODE_TEST_CONTEXT;
    const result = spawnSync(command.executable, command.args, {
      cwd: repoRoot,
      encoding: "utf8",
      env: childEnvironment,
      maxBuffer: 20 * 1024 * 1024,
    });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    assert.equal(result.status, 0, `${group.file} evidence failed:\n${output}`);
    for (const name of names) {
      assert.match(
        output,
        new RegExp(`(?:✔|✓).*${escapeRegex(name)}`),
        `${group.file} did not execute exact case ${JSON.stringify(name)}:\n${output}`,
      );
    }
  }
}

export function assertControlMatrixComplete(matrix) {
  const summary = validateControlMatrix(matrix);
  assert.equal(
    summary.completionReady,
    true,
    `#197 control matrix is incomplete: ${matrix.rows.filter((row) => row.status === "GAP").map((row) => row.id).join(", ")}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const matrix = readControlMatrix();
  const summary = validateControlMatrix(matrix);
  executeControlMatrixEvidence(matrix);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!process.argv.includes("--allow-gaps")) assertControlMatrixComplete(matrix);
}
