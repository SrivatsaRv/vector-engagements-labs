#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

function materialize(root, commit, directory) {
  const classifierPath = join(directory, "scripts", "classify-ci-changes.mjs");
  const helperPath = join(directory, "scripts", "lib", "contract-doc-impact.mjs");
  mkdirSync(join(directory, "scripts", "lib"), { recursive: true });
  writeFileSync(classifierPath, git(root, ["show", `${commit}:scripts/classify-ci-changes.mjs`]));
  writeFileSync(helperPath, git(root, ["show", `${commit}:scripts/lib/contract-doc-impact.mjs`]));
  return realpathSync(classifierPath);
}

const cases = [
  { id: "DOCS", input: "M\0docs/testing-strategy.md\0" },
  { id: "FRONTEND", input: "M\0components/SimulationScene.tsx\0" },
  { id: "RUST", input: "M\0engine-rust/src/lib.rs\0" },
  { id: "DATABASE", input: "M\0db/schema.ts\0" },
  { id: "WORKFLOW", input: "M\0.github/workflows/ci.yml\0" },
  { id: "RENAME_COPY", input: "R100\0lib/model-pack.ts\0lib/model-pack-renamed.ts\0C100\0docs/testing-strategy.md\0docs/testing-strategy-copy.md\0" },
];

function matrix(classifierPath) {
  return cases.map(({ id, input }) => {
    const output = execFileSync("node", [classifierPath, "--name-status0"], {
      input: Buffer.from(input),
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", TMPDIR: process.env.TMPDIR ?? tmpdir() },
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    return { id, result: JSON.parse(output) };
  });
}

function main() {
  const [protocol, root, baseSha, headSha, familyId, probeId, disposition] = process.argv.slice(2);
  invariant(process.argv.slice(2).length === 7, "Probe request must contain exactly seven arguments.");
  invariant(protocol === PROTOCOL, "Unsupported probe protocol.");
  invariant(/^[0-9a-f]{40}$/u.test(baseSha) && /^[0-9a-f]{40}$/u.test(headSha), "Probe revisions must be exact commits.");
  invariant(familyId === "DELIVERY_CONTRACT_GOVERNANCE", "Classifier probe family mismatch.");
  invariant(probeId === "DELIVERY_CLASSIFIER_DECISION_IDENTITY_V1", "Classifier probe identity mismatch.");
  invariant(disposition === "INTERNAL_REFACTOR", "Classifier probe disposition mismatch.");
  const probeRoot = mkdtempSync(join(tmpdir(), "vector-contract-classifier-probe-"));
  try {
    const before = matrix(materialize(root, baseSha, join(probeRoot, "base")));
    const after = matrix(materialize(root, headSha, join(probeRoot, "head")));
    const beforeSha256 = sha256(canonicalJson(before));
    const afterSha256 = sha256(canonicalJson(after));
    const result = {
      schemaVersion: RESULT_SCHEMA,
      probeId,
      familyId,
      disposition,
      baseSha,
      headSha,
      assertions: [{
        id: ASSERTION_ID,
        status: beforeSha256 === afterSha256 ? "PASS" : "FAIL",
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

main();
