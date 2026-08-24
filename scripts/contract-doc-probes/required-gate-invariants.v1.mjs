#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const RESULT_SCHEMA = "vector.contract-doc-probe-result.v1";
const PROTOCOL = "vector.contract-doc-probe.v1";
const ASSERTION_ID = "REQUIRED_GATE_FAIL_CLOSED_MATRIX";

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

function successfulEnvironment(requiredGates) {
  const environment = {
    CLASSIFY_RESULT: "success",
    POLICY_RESULT: "success",
    CONTRACT_DOCS_RESULT: "success",
    CONTRACT_DOC_IMPACT_STATE: "VERIFIED",
    PR_REVIEW_KIND: "slice",
  };
  for (const gate of requiredGates) {
    environment[gate.selected] = "true";
    environment[gate.result] = "success";
  }
  return environment;
}

async function matrix(modulePath, revision) {
  const implementation = await import(`${pathToFileURL(modulePath).href}?revision=${revision}`);
  const cases = [
    { id: "SUCCESS", mutate: () => {}, expected: true },
    { id: "UNSELECTED_SKIPPED", mutate: (env) => { env.CONTAINER_SELECTED = "false"; env.CONTAINER_RESULT = "skipped"; }, expected: true },
    { id: "CLASSIFIER_CANCELLED", mutate: (env) => { env.CLASSIFY_RESULT = "cancelled"; }, expected: false },
    { id: "DOCS_CANCELLED", mutate: (env) => { env.CONTRACT_DOCS_RESULT = "cancelled"; }, expected: false },
    { id: "DOCS_BYPASSED", mutate: (env) => { env.CONTRACT_DOC_IMPACT_STATE = "BYPASSED"; }, expected: false },
    { id: "SELECTED_FAILURE", mutate: (env) => { env.WEB_TESTS_RESULT = "failure"; }, expected: false },
    { id: "MISSING_SELECTION", mutate: (env) => { delete env.RUST_TESTS_SELECTED; }, expected: false },
    { id: "UNSELECTED_RAN", mutate: (env) => { env.QUALITY_SELECTED = "false"; }, expected: false },
  ];
  const results = cases.map(({ id, mutate, expected }) => {
    const environment = successfulEnvironment(implementation.REQUIRED_GATES);
    mutate(environment);
    let accepted = true;
    try {
      implementation.verifyRequiredGates(environment);
    } catch {
      accepted = false;
    }
    return { id, accepted, expected, pass: accepted === expected };
  });
  return { requiredGates: implementation.REQUIRED_GATES, results };
}

async function main() {
  const [protocol, root, baseSha, headSha, familyId, probeId, disposition] = process.argv.slice(2);
  invariant(process.argv.slice(2).length === 7, "Probe request must contain exactly seven arguments.");
  invariant(protocol === PROTOCOL, "Unsupported probe protocol.");
  invariant(/^[0-9a-f]{40}$/u.test(baseSha) && /^[0-9a-f]{40}$/u.test(headSha), "Probe revisions must be exact commits.");
  invariant(familyId === "DELIVERY_CONTRACT_GOVERNANCE", "Required-gate probe family mismatch.");
  invariant(probeId === "DELIVERY_REQUIRED_GATE_INVARIANTS_V1", "Required-gate probe identity mismatch.");
  invariant(disposition === "NO_SEMANTIC_CHANGE", "Required-gate probe disposition mismatch.");
  const probeRoot = mkdtempSync(join(tmpdir(), "vector-contract-required-gate-probe-"));
  try {
    const basePath = join(probeRoot, "required-gate-base.mjs");
    const headPath = join(probeRoot, "required-gate-head.mjs");
    writeFileSync(basePath, git(root, ["show", `${baseSha}:scripts/verify-required-gates.mjs`]));
    writeFileSync(headPath, git(root, ["show", `${headSha}:scripts/verify-required-gates.mjs`]));
    const before = await matrix(basePath, baseSha);
    const after = await matrix(headPath, headSha);
    const expectedPass = before.results.every(({ pass }) => pass) && after.results.every(({ pass }) => pass);
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
