#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  DECLARATION_SCHEMA,
  extractDeclarationFromPullRequestBody,
  parseStrictJson,
  validateDeclaration,
  verifyContractDocImpact,
} from "./lib/contract-doc-impact.mjs";

const POLICY_PATH = "governance/contract-doc-ownership.v1.json";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function git(root, args, options = {}) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: options.encoding ?? "utf8",
    env: options.env ?? process.env,
    maxBuffer: 64 * 1024 * 1024,
    stdio: options.stdio,
  });
}

function exactCommit(root, value, label) {
  invariant(typeof value === "string" && value.length > 0, `${label} is required.`);
  const resolved = git(root, ["rev-parse", "--verify", `${value}^{commit}`]).trim();
  invariant(/^[0-9a-f]{40}$/u.test(resolved), `${label} did not resolve to a full commit.`);
  return resolved;
}

function fileAt(root, commit, path) {
  try {
    const entry = git(root, ["ls-tree", "-z", commit, "--", path], { stdio: ["ignore", "pipe", "ignore"] });
    invariant(/^(?:100644|100755) blob [0-9a-f]{40}\t/u.test(entry), `${path} at ${commit} is not a regular Git blob.`);
    return git(root, ["show", `${commit}:${path}`], { stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function readPolicyAt(root, commit) {
  const raw = fileAt(root, commit, POLICY_PATH);
  return raw === null ? null : parseStrictJson(raw, `${POLICY_PATH} at ${commit}`);
}

export function resolvePolicyBootstrap({ baseSha, mergeBaseSha, baseTipPolicy, mergeBasePolicy, headPolicy }) {
  const bootstrap = baseTipPolicy === null && mergeBasePolicy === null;
  if (bootstrap) {
    invariant(baseSha === mergeBaseSha, "Policy bootstrap requires the exact integration base, not a stale branch merge base.");
    invariant(headPolicy.bootstrapBaseSha === baseSha, "Policy bootstrap is not bound to the registered base commit.");
    return true;
  }
  invariant(baseTipPolicy && mergeBasePolicy, "A branch whose integration tip has policy but merge base does not must rebase before verification.");
  invariant(baseTipPolicy.canonicalSha256 === mergeBasePolicy.canonicalSha256, "Integration-tip policy differs from merge-base policy; rebase before verification.");
  return false;
}

function emptyDeclaration() {
  return { schemaVersion: DECLARATION_SCHEMA, families: [] };
}

export function declarationTemplate(policy) {
  const family = policy.families[0];
  return {
    schemaVersion: DECLARATION_SCHEMA,
    families: [{
      familyId: family.id,
      disposition: "SEMANTIC",
      owningSections: [family.owningSections[0]],
      rationale: "Replace this text with the exact contract behavior changed by this pull request.",
      evidence: [{ kind: "TEST", value: "Replace with the exact verification command and result." }],
      migration: {
        state: "NOT_APPLICABLE",
        documents: [],
        rationale: "Replace with the exact persistence, migration, and changelog impact.",
      },
      exemptionEvidence: null,
    }],
  };
}

function localDeclaration(policy) {
  const declarationFile = process.env.VECTOR_CONTRACT_DOC_DECLARATION_FILE;
  const declarationJson = process.env.VECTOR_CONTRACT_DOC_DECLARATION_JSON;
  invariant(!(declarationFile && declarationJson), "Set only one local contract-doc declaration input.");
  if (!declarationFile && !declarationJson) return emptyDeclaration();
  const raw = declarationFile ? readFileSync(resolve(declarationFile), "utf8") : declarationJson;
  return validateDeclaration(parseStrictJson(raw, "local contract documentation declaration"), policy);
}

function createWorktreeSnapshot(root) {
  const snapshotDirectory = mkdtempSync(join(tmpdir(), "vector-contract-doc-index-"));
  const indexPath = join(snapshotDirectory, "index");
  const environment = {
    ...process.env,
    GIT_INDEX_FILE: indexPath,
    GIT_AUTHOR_NAME: "VECTOR contract verifier",
    GIT_AUTHOR_EMAIL: "contract-verifier@vector.invalid",
    GIT_COMMITTER_NAME: "VECTOR contract verifier",
    GIT_COMMITTER_EMAIL: "contract-verifier@vector.invalid",
    GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
    GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
  };
  try {
    git(root, ["read-tree", "HEAD"], { env: environment });
    git(root, ["add", "-A", "--", "."], { env: environment });
    const tree = git(root, ["write-tree"], { env: environment }).trim();
    const parent = exactCommit(root, "HEAD", "local HEAD");
    return git(root, ["commit-tree", tree, "-p", parent, "-m", "VECTOR contract-doc worktree snapshot"], { env: environment }).trim();
  } finally {
    rmSync(snapshotDirectory, { recursive: true, force: true });
  }
}

export async function resolvePushDeclaration(event, policy, {
  fetchImpl = fetch,
  repository = process.env.GITHUB_REPOSITORY,
  token = process.env.GITHUB_TOKEN,
} = {}) {
  invariant(repository && token, "Push verification requires GITHUB_REPOSITORY and GITHUB_TOKEN.");
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/commits/${event.after}/pulls`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "vector-contract-doc-verifier",
    },
  });
  invariant(response.ok, `Associated pull-request lookup failed with HTTP ${response.status}.`);
  const pullRequests = await response.json();
  const merged = pullRequests.filter((pullRequest) => (
    pullRequest.merged_at
    && pullRequest.base?.ref === "main"
    && pullRequest.merge_commit_sha === event.after
    && pullRequest.base?.sha === event.before
    && /^[0-9a-f]{40}$/u.test(pullRequest.head?.sha ?? "")
  ));
  invariant(merged.length === 1, `Push commit must resolve to exactly one merged main pull request; found ${merged.length}.`);
  return extractDeclarationFromPullRequestBody(merged[0].body ?? "", policy);
}

function writeOutput(report) {
  const rendered = `${JSON.stringify(report, null, 2)}\n`;
  process.stdout.write(rendered);
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    writeFileSync(outputPath, `contract_docs_state=${report.state}\npolicy_bootstrap=${report.policyBootstrap ? "true" : "false"}\n`, { flag: "a" });
  }
}

function trackedFileIdentity(root, commit, materializedRoot) {
  const paths = git(root, ["ls-tree", "-r", "--name-only", "-z", commit]).split("\0").filter(Boolean);
  return paths.map((path) => {
    const absolute = resolve(materializedRoot, path);
    invariant(absolute.startsWith(`${resolve(materializedRoot)}/`), `Tracked freshness path escapes materialized head: ${path}.`);
    return [path, sha256(readFileSync(absolute))];
  });
}

export function runRegisteredFreshness(root, { group, headSha }) {
  invariant(group && typeof group === "object", "Registered freshness group is invalid.");
  const { toolchainId, freshnessArgv: argv } = group;
  invariant(["NODE", "NODE_RUST_WASM32"].includes(toolchainId), `Unsupported freshness toolchain ${toolchainId}.`);
  invariant(Array.isArray(argv) && argv.length > 1, "Registered freshness argv is invalid.");
  invariant(argv[0] === "node", `Unsupported freshness executable ${argv[0]}.`);
  execFileSync("node", ["--version"], { cwd: root, stdio: "ignore", timeout: 10_000 });
  if (toolchainId === "NODE_RUST_WASM32") {
    execFileSync("cargo", ["--version"], { cwd: root, stdio: "ignore", timeout: 10_000 });
    const targets = execFileSync("rustup", ["target", "list", "--installed"], { cwd: root, encoding: "utf8", timeout: 10_000 });
    invariant(targets.split(/\r?\n/u).includes("wasm32-unknown-unknown"), "Registered Rust freshness toolchain lacks wasm32-unknown-unknown.");
  }
  const freshnessRoot = mkdtempSync(join(tmpdir(), "vector-contract-doc-freshness-"));
  try {
    const archive = execFileSync("git", ["archive", "--format=tar", headSha], { cwd: root, encoding: "buffer", maxBuffer: 256 * 1024 * 1024 });
    execFileSync("tar", ["-xf", "-", "-C", freshnessRoot], { input: archive, maxBuffer: 256 * 1024 * 1024 });
    const before = trackedFileIdentity(root, headSha, freshnessRoot);
    const environment = {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      TMPDIR: process.env.TMPDIR ?? tmpdir(),
      LANG: "C",
      LC_ALL: "C",
    };
    execFileSync(argv[0], argv.slice(1), { cwd: freshnessRoot, stdio: "inherit", env: environment, timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });
    invariant(JSON.stringify(trackedFileIdentity(root, headSha, freshnessRoot)) === JSON.stringify(before), `Registered freshness group ${group.id} modified tracked head content.`);
  } finally {
    rmSync(freshnessRoot, { recursive: true, force: true });
  }
}

export function runRegisteredProbe(root, { probe, familyId, disposition, mergeBaseSha, headSha }) {
  invariant(probe && typeof probe === "object", "Registered non-semantic probe is invalid.");
  invariant(probe.familyId === familyId && probe.disposition === disposition, `Registered probe ${probe.id} authority mismatch.`);
  const baseAdapter = fileAt(root, mergeBaseSha, probe.adapterPath);
  const headAdapter = fileAt(root, headSha, probe.adapterPath);
  invariant(baseAdapter !== null && headAdapter !== null, `Registered probe ${probe.id} adapter is unavailable at both revisions.`);
  invariant(sha256(baseAdapter) === probe.adapterSha256 && sha256(headAdapter) === probe.adapterSha256, `Registered probe ${probe.id} adapter digest mismatch.`);
  const adapterRoot = mkdtempSync(join(tmpdir(), "vector-contract-doc-probe-"));
  try {
    const adapterPath = join(adapterRoot, "adapter.mjs");
    writeFileSync(adapterPath, baseAdapter, { mode: 0o600 });
    const arguments_ = [
      adapterPath,
      "vector.contract-doc-probe.v1",
      root,
      mergeBaseSha,
      headSha,
      familyId,
      probe.id,
      disposition,
    ];
    const environment = {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      TMPDIR: process.env.TMPDIR ?? tmpdir(),
      LANG: "C",
      LC_ALL: "C",
    };
    const execute = () => execFileSync("node", arguments_, {
      cwd: adapterRoot,
      encoding: "utf8",
      env: environment,
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const first = execute();
    const second = execute();
    invariant(first === second, `Registered probe ${probe.id} produced nondeterministic evidence.`);
    return parseStrictJson(first, `registered probe ${probe.id} result`);
  } finally {
    rmSync(adapterRoot, { recursive: true, force: true });
  }
}

async function main() {
  const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
  if (process.argv.includes("--print-template")) {
    const policy = parseStrictJson(readFileSync(resolve(root, POLICY_PATH), "utf8"), "contract documentation ownership policy");
    process.stdout.write(`${JSON.stringify(declarationTemplate(policy), null, 2)}\n`);
    return;
  }
  const githubMode = process.argv.includes("--github-event");
  let base;
  let head;
  let declaration;

  if (githubMode) {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    invariant(eventPath, "GITHUB_EVENT_PATH is required in hosted mode.");
    const event = parseStrictJson(readFileSync(eventPath, "utf8"), "GitHub event");
    if (event.pull_request) {
      base = exactCommit(root, event.pull_request.base.sha, "pull request base SHA");
      head = exactCommit(root, event.pull_request.head.sha, "pull request head SHA");
      const headPolicy = readPolicyAt(root, head);
      invariant(headPolicy, `Head commit is missing ${POLICY_PATH}.`);
      declaration = extractDeclarationFromPullRequestBody(event.pull_request.body ?? "", headPolicy);
    } else {
      invariant(event.after && !/^0{40}$/u.test(event.after), "Push event has no usable head commit.");
      head = exactCommit(root, event.after, "push head SHA");
      base = exactCommit(root, event.before, "push base SHA");
      const headPolicy = readPolicyAt(root, head);
      invariant(headPolicy, `Push head is missing ${POLICY_PATH}.`);
      declaration = await resolvePushDeclaration(event, headPolicy);
    }
  } else {
    const dirty = git(root, ["status", "--porcelain=v1", "-z"]).length > 0;
    head = dirty ? createWorktreeSnapshot(root) : exactCommit(root, "HEAD", "local head SHA");
    const requestedBase = process.env.VECTOR_CONTRACT_DOC_BASE_SHA || undefined;
    base = exactCommit(root, requestedBase ?? "origin/main", "local integration-tip SHA");
    const headPolicy = readPolicyAt(root, head);
    invariant(headPolicy, `Local head is missing ${POLICY_PATH}.`);
    declaration = localDeclaration(headPolicy);
  }

  const mergeBase = git(root, ["merge-base", base, head]).trim();
  const headPolicy = readPolicyAt(root, head);
  const baseTipPolicy = readPolicyAt(root, base);
  const basePolicy = readPolicyAt(root, mergeBase);
  const policyBootstrap = resolvePolicyBootstrap({ baseSha: base, mergeBaseSha: mergeBase, baseTipPolicy, mergeBasePolicy: basePolicy, headPolicy });
  if (policyBootstrap) {
    invariant(fileAt(root, mergeBase, POLICY_PATH) === null, "Policy bootstrap requires an absent base policy.");
    invariant(fileAt(root, head, POLICY_PATH) !== null, "Policy bootstrap requires the head policy artifact.");
  }
  const report = verifyContractDocImpact({
    rootDirectory: root,
    baseSha: base,
    headSha: head,
    mergeBaseSha: mergeBase,
    declaration,
    basePolicy: basePolicy ?? headPolicy,
    headPolicy,
    policyBootstrap,
    freshnessRunner: (group) => runRegisteredFreshness(root, { group, headSha: head }),
    probeRunner: (request) => runRegisteredProbe(root, request),
  });
  writeOutput(report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Contract documentation impact verification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
