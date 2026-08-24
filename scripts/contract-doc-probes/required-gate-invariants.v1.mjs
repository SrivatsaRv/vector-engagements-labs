#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RESULT_SCHEMA = "vector.contract-doc-probe-result.v1";
const PROTOCOL = "vector.contract-doc-probe.v1";
const ASSERTION_ID = "REQUIRED_GATE_FAIL_CLOSED_MATRIX";
const OBSERVATION_SCHEMA = "vector.required-gate-observation.v1";

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

function exactKeys(value, keys, label) {
  invariant(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  invariant(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()), `${label} has unsupported fields.`);
}

function git(root, args, encoding = "utf8") {
  return execFileSync("git", args, { cwd: root, encoding, maxBuffer: 8 * 1024 * 1024 });
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

function requiredGateObservation(implementation) {
  const cases = [];
  const add = (id, mutate, expected) => cases.push({ id, mutate, expected });
  const terminalValues = [undefined, "", "success", "failure", "cancelled", "skipped", "timed_out", "action_required", "arbitrary"];
  const invalidSuccessValues = terminalValues.filter((value) => value !== "success");
  for (const state of ["VERIFIED", "NO_RELEVANT_CHANGES"]) {
    add(`VALID_DOC_STATE_${state}`, (env) => { env.CONTRACT_DOC_IMPACT_STATE = state; }, true);
  }
  for (const kind of ["slice", "completion-review", "not-applicable"]) {
    add(`VALID_REVIEW_KIND_${kind}`, (env) => { env.PR_REVIEW_KIND = kind; }, true);
  }
  for (const field of ["CLASSIFY_RESULT", "POLICY_RESULT", "CONTRACT_DOCS_RESULT"]) {
    for (const value of invalidSuccessValues) {
      add(`${field}_${value ?? "MISSING"}`, (env) => {
        if (value === undefined) delete env[field];
        else env[field] = value;
      }, false);
    }
  }
  for (const value of [undefined, "", "BYPASSED", "FAILED", "partial", "arbitrary"]) {
    add(`CONTRACT_DOC_IMPACT_STATE_${value ?? "MISSING"}`, (env) => {
      if (value === undefined) delete env.CONTRACT_DOC_IMPACT_STATE;
      else env.CONTRACT_DOC_IMPACT_STATE = value;
    }, false);
  }
  for (const value of [undefined, "", "unknown", "partial", "completion", "arbitrary"]) {
    add(`PR_REVIEW_KIND_${value ?? "MISSING"}`, (env) => {
      if (value === undefined) delete env.PR_REVIEW_KIND;
      else env.PR_REVIEW_KIND = value;
    }, false);
  }
  for (const gate of implementation.REQUIRED_GATES) {
    add(`${gate.key}_SELECTED_SUCCESS`, () => {}, true);
    add(`${gate.key}_UNSELECTED_SKIPPED`, (env) => { env[gate.selected] = "false"; env[gate.result] = "skipped"; }, true);
    for (const value of [undefined, "", "yes", "1", "arbitrary"]) {
      add(`${gate.key}_SELECTION_${value ?? "MISSING"}`, (env) => {
        if (value === undefined) delete env[gate.selected];
        else env[gate.selected] = value;
      }, false);
    }
    for (const value of invalidSuccessValues) {
      add(`${gate.key}_SELECTED_RESULT_${value ?? "MISSING"}`, (env) => {
        if (value === undefined) delete env[gate.result];
        else env[gate.result] = value;
      }, false);
    }
    for (const value of terminalValues) {
      add(`${gate.key}_UNSELECTED_RESULT_${value ?? "MISSING"}`, (env) => {
        env[gate.selected] = "false";
        if (value === undefined) delete env[gate.result];
        else env[gate.result] = value;
      }, value === "skipped");
    }
  }
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
  return {
    decisionContract: implementation.REQUIRED_GATE_CONTRACT,
    decisionImplementationSource: implementation.verifyRequiredGates.toString(),
    requiredGates: implementation.REQUIRED_GATES,
    results,
  };
}

const REQUIRED_GATE_OBSERVER_SOURCE = [
  "#!/usr/bin/env node",
  'import { pathToFileURL } from "node:url";',
  successfulEnvironment.toString(),
  requiredGateObservation.toString(),
  "const [modulePath, revision] = process.argv.slice(2);",
  'if (process.argv.slice(2).length !== 2 || !/^[0-9a-f]{40}$/u.test(revision)) throw new Error("Invalid required-gate observation request.");',
  'const implementation = await import(`${pathToFileURL(modulePath).href}?revision=${revision}`);',
  `const observation = { schemaVersion: ${JSON.stringify(OBSERVATION_SCHEMA)}, ...requiredGateObservation(implementation) };`,
  'process.stdout.write(`${JSON.stringify(observation)}\\n`);',
  "",
].join("\n");

function materialize(root, revision, modulePath) {
  const source = git(root, ["show", `${revision}:scripts/verify-required-gates.mjs`], "buffer");
  const moduleSourceSha256 = sha256(source);
  writeFileSync(modulePath, source, { mode: 0o400 });
  const realModulePath = realpathSync(modulePath);
  invariant(sha256(readFileSync(realModulePath)) === moduleSourceSha256, "Materialized required-gate module differs from its Git blob before execution.");
  return { modulePath: realModulePath, moduleSourceSha256 };
}

function matrix(materialized, revision, observerPath) {
  const output = execFileSync("node", [observerPath, materialized.modulePath, revision], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", TMPDIR: process.env.TMPDIR ?? tmpdir() },
    timeout: 10_000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const observation = JSON.parse(output);
  exactKeys(observation, ["schemaVersion", "decisionContract", "decisionImplementationSource", "requiredGates", "results"], "Required-gate observation");
  invariant(observation.schemaVersion === OBSERVATION_SCHEMA, "Required-gate observation schema mismatch.");
  invariant(typeof observation.decisionImplementationSource === "string", "Required-gate implementation observation is invalid.");
  invariant(Array.isArray(observation.requiredGates) && Array.isArray(observation.results), "Required-gate observation is incomplete.");
  invariant(sha256(readFileSync(materialized.modulePath)) === materialized.moduleSourceSha256, "Required-gate module changed during execution.");
  return {
    moduleSourceSha256: materialized.moduleSourceSha256,
    decisionContract: observation.decisionContract,
    decisionImplementationSha256: sha256(observation.decisionImplementationSource),
    requiredGates: observation.requiredGates,
    results: observation.results,
  };
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
    const observerPath = join(probeRoot, "required-gate-observer.mjs");
    writeFileSync(observerPath, REQUIRED_GATE_OBSERVER_SOURCE, { mode: 0o500 });
    const before = matrix(materialize(root, baseSha, basePath), baseSha, observerPath);
    const after = matrix(materialize(root, headSha, headPath), headSha, observerPath);
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
