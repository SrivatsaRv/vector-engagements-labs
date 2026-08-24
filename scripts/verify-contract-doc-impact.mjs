#!/usr/bin/env node

import { execFileSync } from "node:child_process";
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

function emptyDeclaration() {
  return { schemaVersion: DECLARATION_SCHEMA, families: [] };
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
  const merged = pullRequests.filter((pullRequest) => pullRequest.merged_at && pullRequest.base?.ref === "main");
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

function runRegisteredFreshness(root, command) {
  const match = /^npm run ([a-z0-9:-]+)$/u.exec(command);
  invariant(match, `Unsupported freshness command ${command}.`);
  execFileSync("npm", ["run", match[1]], { cwd: root, stdio: "inherit", env: process.env });
}

async function main() {
  const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
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
    base = exactCommit(root, requestedBase ?? git(root, ["merge-base", "origin/main", head]).trim(), "local base SHA");
    const headPolicy = readPolicyAt(root, head);
    invariant(headPolicy, `Local head is missing ${POLICY_PATH}.`);
    declaration = localDeclaration(headPolicy);
  }

  const mergeBase = git(root, ["merge-base", base, head]).trim();
  const headPolicy = readPolicyAt(root, head);
  const basePolicy = readPolicyAt(root, mergeBase);
  const policyBootstrap = basePolicy === null;
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
    freshnessRunner: (command) => runRegisteredFreshness(root, command),
  });
  writeOutput(report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Contract documentation impact verification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
