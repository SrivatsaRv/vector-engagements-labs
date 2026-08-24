#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const RESULT_SCHEMA = "vector.contract-doc-probe-result.v1";
const PROTOCOL = "vector.contract-doc-probe.v1";
const ASSERTION_ID = "CI_CLASSIFIER_DECISION_MATRIX";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
}

function trackedPaths(root, commit) {
  const output = execFileSync("git", ["ls-tree", "-r", "--name-only", "-z", commit], {
    cwd: root,
    maxBuffer: 16 * 1024 * 1024,
  });
  return new TextDecoder("utf-8", { fatal: true }).decode(output).split("\0").filter(Boolean);
}

function materialize(root, commit, directory) {
  const classifierPath = join(directory, "scripts", "classify-ci-changes.mjs");
  const helperPath = join(directory, "scripts", "lib", "contract-doc-impact.mjs");
  mkdirSync(join(directory, "scripts", "lib"), { recursive: true });
  writeFileSync(classifierPath, git(root, ["show", `${commit}:scripts/classify-ci-changes.mjs`]));
  writeFileSync(helperPath, git(root, ["show", `${commit}:scripts/lib/contract-doc-impact.mjs`]));
  return realpathSync(classifierPath);
}

const boundaryPaths = [
  ".github/workflows/__vector_contract_boundary__.yml",
  "Makefile",
  "app/__vector_contract_boundary__.tsx",
  "components/__vector_contract_boundary__.tsx",
  "config/__vector_contract_boundary__.json",
  "db/__vector_contract_boundary__.ts",
  "docs/__vector_contract_boundary__.md",
  "drizzle/__vector_contract_boundary__.sql",
  "engine-rust/src/__vector_contract_boundary__.rs",
  "fixtures/environment/__vector_contract_boundary__.json",
  "fixtures/model-packs/__vector_contract_boundary__.json",
  "governance/__vector_contract_boundary__.json",
  "lib/engine/__vector_contract_boundary__.ts",
  "lib/frontend/__vector_contract_boundary__.ts",
  "lib/record/__vector_contract_boundary__.ts",
  "lib/runtime/__vector_contract_boundary__.ts",
  "public/__vector_contract_boundary__.bin",
  "scripts/__vector_contract_boundary__.mjs",
  "scripts/contract-doc-probes/__vector_contract_boundary__.mjs",
  "tests/browser/__vector_contract_boundary__.test.ts",
  "tests/component/__vector_contract_boundary__.test.tsx",
  "tests/__vector_contract_boundary__.test.mjs",
  "verification-rust/__vector_contract_boundary__/src/lib.rs",
  "worker/__vector_contract_boundary__.ts",
  "unknown-contract-root/__vector_contract_boundary__.bin",
  " leading-space.ts",
  "trailing-space.ts ",
  "unicode-é.ts",
  "line\nbreak.ts",
];

const parserCases = [
  { id: "ADD", input: "A\0scripts/new.mjs\0", expected: "ACCEPT" },
  { id: "MODIFY", input: "M\0lib/model-pack.ts\0", expected: "ACCEPT" },
  { id: "DELETE", input: "D\0docs/testing-strategy.md\0", expected: "ACCEPT" },
  { id: "RENAME", input: "R100\0lib/model-pack.ts\0lib/model-pack-renamed.ts\0", expected: "ACCEPT" },
  { id: "COPY", input: "C100\0docs/testing-strategy.md\0docs/testing-strategy-copy.md\0", expected: "ACCEPT" },
  { id: "MIXED", input: "A\0new.ts\0M\0old.ts\0D\0gone.ts\0R087\0a.ts\0b.ts\0C100\0c.ts\0d.ts\0", expected: "ACCEPT" },
  { id: "GIT_UNKNOWN_TYPE", input: "X\0git-unknown.ts\0", expected: "ACCEPT" },
  { id: "UNSUPPORTED_STATUS", input: "Z\0bad.ts\0", expected: "REJECT" },
  { id: "MISSING_PATH", input: "M\0", expected: "REJECT" },
  { id: "MISSING_RENAME_TARGET", input: "R100\0old.ts\0", expected: "REJECT" },
  { id: "EMPTY", input: "", expected: "ACCEPT" },
];

function runParserCase(classifierPath, testCase) {
  try {
    const output = execFileSync("node", [classifierPath, "--name-status0"], {
      input: Buffer.from(testCase.input),
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", TMPDIR: process.env.TMPDIR ?? tmpdir() },
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { id: testCase.id, expected: testCase.expected, outcome: "ACCEPT", result: JSON.parse(output) };
  } catch {
    return { id: testCase.id, expected: testCase.expected, outcome: "REJECT", result: null };
  }
}

async function matrix(classifierPath, paths, revision) {
  const implementation = await import(`${pathToFileURL(classifierPath).href}?revision=${revision}`);
  const decisions = paths.map((path) => ({ path, result: implementation.classifyChanges([path]) }));
  const parser = parserCases.map((testCase) => runParserCase(classifierPath, testCase));
  return {
    moduleSourceSha256: sha256(readFileSync(classifierPath)),
    decisionContract: implementation.CLASSIFIER_DECISION_CONTRACT,
    decisionImplementationSha256: sha256(`${implementation.classifyChanges.toString()}\n${implementation.runClassifierCli.toString()}`),
    paths,
    decisions,
    parser,
    parserExpectationsSatisfied: parser.every(({ expected, outcome }) => expected === outcome),
  };
}

async function main() {
  const [protocol, root, baseSha, headSha, familyId, probeId, disposition] = process.argv.slice(2);
  invariant(process.argv.slice(2).length === 7, "Probe request must contain exactly seven arguments.");
  invariant(protocol === PROTOCOL, "Unsupported probe protocol.");
  invariant(/^[0-9a-f]{40}$/u.test(baseSha) && /^[0-9a-f]{40}$/u.test(headSha), "Probe revisions must be exact commits.");
  invariant(familyId === "DELIVERY_CONTRACT_GOVERNANCE", "Classifier probe family mismatch.");
  invariant(probeId === "DELIVERY_CLASSIFIER_DECISION_IDENTITY_V1", "Classifier probe identity mismatch.");
  invariant(disposition === "INTERNAL_REFACTOR", "Classifier probe disposition mismatch.");
  const probeRoot = mkdtempSync(join(tmpdir(), "vector-contract-classifier-probe-"));
  try {
    const paths = [...new Set([...trackedPaths(root, baseSha), ...trackedPaths(root, headSha), ...boundaryPaths])].sort();
    const before = await matrix(materialize(root, baseSha, join(probeRoot, "base")), paths, baseSha);
    const after = await matrix(materialize(root, headSha, join(probeRoot, "head")), paths, headSha);
    const beforeSha256 = sha256(canonicalJson(before));
    const afterSha256 = sha256(canonicalJson(after));
    const expectedPass = before.parserExpectationsSatisfied && after.parserExpectationsSatisfied;
    const result = {
      schemaVersion: RESULT_SCHEMA,
      probeId,
      familyId,
      disposition,
      baseSha,
      headSha,
      assertions: [{
        id: ASSERTION_ID,
        status: expectedPass && beforeSha256 === afterSha256 ? "PASS" : "FAIL",
        beforeSha256,
        afterSha256,
        evidenceSha256: sha256(canonicalJson({ before, after })),
      }],
    };
    process.stdout.write(`${canonicalJson(result)}\n`);
  } finally {
    rmSync(probeRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
