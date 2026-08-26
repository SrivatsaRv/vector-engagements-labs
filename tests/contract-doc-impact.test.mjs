import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import {
  DECLARATION_SCHEMA,
  extractDeclarationFromPullRequestBody,
  parseNameStatusZ,
  parseStrictJson,
  validateDeclaration,
  validatePolicy,
  verifyContractDocImpact,
} from "../scripts/lib/contract-doc-impact.mjs";
import { declarationTemplate, resolvePolicyBootstrap, resolvePushDeclaration, runRegisteredFreshness, runRegisteredProbe, writeOutput } from "../scripts/verify-contract-doc-impact.mjs";

const sha = (character) => character.repeat(64);
const commitSha = (character) => character.repeat(40);
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};
const policySha256 = (value) => {
  const unsigned = structuredClone(value);
  delete unsigned.canonicalSha256;
  return createHash("sha256").update(canonicalJson(unsigned)).digest("hex");
};
const fixtureProbeSource = `#!/usr/bin/env node
const [protocol, root, baseSha, headSha, familyId, probeId, disposition] = process.argv.slice(2);
if (protocol !== "vector.contract-doc-probe.v1" || !root) process.exit(2);
const assertionId = probeId === "EXAMPLE_IDENTITY_V1" ? "PUBLIC_API_IDENTITY" : "BEHAVIOR_INVARIANT";
const digest = "a".repeat(64);
process.stdout.write(JSON.stringify({schemaVersion:"vector.contract-doc-probe-result.v1",probeId,familyId,disposition,baseSha,headSha,assertions:[{id:assertionId,status:"PASS",beforeSha256:digest,afterSha256:digest,evidenceSha256:digest}]}) + "\\n");
`;
const fixtureProbeSha256 = createHash("sha256").update(fixtureProbeSource).digest("hex");

const policy = {
  schemaVersion: "vector.contract-doc-ownership.v1",
  policyId: "VECTOR_CONTRACT_DOC_OWNERSHIP",
  issue: "#162",
  bootstrapBaseSha: commitSha("0"),
  maxDeclarationBytes: 32768,
  declarationBlockName: "vector-contract-doc-impact",
  allowedDispositions: [
    "SEMANTIC",
    "TEST_ONLY",
    "GENERATED_ARTIFACT_ONLY",
    "INTERNAL_REFACTOR",
    "NO_SEMANTIC_CHANGE",
    "DOCS_ALREADY_CURRENT",
  ],
  ruleRetirements: [],
  families: [
    {
      id: "EXAMPLE",
      workstream: "staff-architecture",
      implementationRules: [
        { kind: "EXACT", value: "lib/example.ts", facets: ["schema"] },
        { kind: "PREFIX", value: "scripts/contract-doc-probes/", facets: ["verification"] },
      ],
      testRules: [{ kind: "PREFIX", value: "tests/example/", facets: ["verification"] }],
      generatedGroups: [
        {
          id: "EXAMPLE_GENERATED",
          toolchainId: "NODE",
          outputRules: [{ kind: "PREFIX", value: "lib/generated/example/", facets: ["schema"] }],
          inputRules: [{ kind: "PREFIX", value: "fixtures/example/", facets: ["schema"] }],
          generatorRules: [{ kind: "EXACT", value: "scripts/generate-example.mjs", facets: ["schema"] }],
          freshnessArgv: ["node", "scripts/generate-example.mjs", "--check"],
        },
      ],
      owningSections: [{ sectionId: "EXAMPLE_CONTRACT", path: "docs/example.md", heading: "## Contract", facets: ["schema", "verification"] }],
      migrationSections: [],
    },
  ],
  nonSemanticProbes: [
    {
      id: "EXAMPLE_IDENTITY_V1",
      familyId: "EXAMPLE",
      disposition: "INTERNAL_REFACTOR",
      changedPathRules: [{ kind: "EXACT", value: "lib/example.ts", facets: ["schema"] }],
      adapterPath: "scripts/contract-doc-probes/example.v1.mjs",
      adapterSha256: fixtureProbeSha256,
      assertionIds: ["PUBLIC_API_IDENTITY"],
    },
    {
      id: "EXAMPLE_INVARIANT_V1",
      familyId: "EXAMPLE",
      disposition: "NO_SEMANTIC_CHANGE",
      changedPathRules: [{ kind: "EXACT", value: "lib/example.ts", facets: ["schema"] }],
      adapterPath: "scripts/contract-doc-probes/example.v1.mjs",
      adapterSha256: fixtureProbeSha256,
      assertionIds: ["BEHAVIOR_INVARIANT"],
    },
  ],
  allowedMultiFamilyPaths: [],
  nonContractRules: [
    { id: "ROOT_METADATA", kind: "EXACT", value: ".gitignore" },
  ],
  contractRoots: ["lib/", "scripts/", "tests/", "fixtures/"],
  canonicalSha256: undefined,
};

const section = { sectionId: "EXAMPLE_CONTRACT", path: "docs/example.md", heading: "## Contract", facets: ["schema", "verification"] };

function declaration(overrides = {}) {
  return {
    schemaVersion: DECLARATION_SCHEMA,
    families: [
      {
        familyId: "EXAMPLE",
        disposition: "SEMANTIC",
        owningSections: [section],
        rationale: "The public contract changed and the owning section records the new behavior.",
        evidence: [{ kind: "TEST", value: "node --test tests/example.test.mjs" }],
        migration: {
          state: "NOT_APPLICABLE",
          documents: [],
          rationale: "No persisted schema changes in this fixture.",
        },
        exemptionEvidence: null,
        ...overrides,
      },
    ],
  };
}

function passingProbeResult({ probe, familyId, disposition, mergeBaseSha, headSha }, overrides = {}) {
  const digest = sha("a");
  return {
    schemaVersion: "vector.contract-doc-probe-result.v1",
    probeId: probe.id,
    familyId,
    disposition,
    baseSha: mergeBaseSha,
    headSha,
    assertions: probe.assertionIds.map((id) => ({ id, status: "PASS", beforeSha256: digest, afterSha256: digest, evidenceSha256: digest })),
    ...overrides,
  };
}

function runGit(root, arguments_) {
  return execFileSync("git", arguments_, { cwd: root, encoding: "utf8" }).trim();
}

async function fixtureRepository() {
  const root = await mkdtemp(join(tmpdir(), "vector-doc-impact-test-"));
  runGit(root, ["init", "--quiet"]);
  runGit(root, ["config", "user.email", "tests@example.invalid"]);
  runGit(root, ["config", "user.name", "VECTOR tests"]);
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(root, "lib"), { recursive: true });
  await mkdir(join(root, "tests", "example"), { recursive: true });
  await mkdir(join(root, "lib", "generated", "example"), { recursive: true });
  await mkdir(join(root, "fixtures", "example"), { recursive: true });
  await mkdir(join(root, "scripts"), { recursive: true });
  await mkdir(join(root, "scripts", "contract-doc-probes"), { recursive: true });
  await writeFile(join(root, "docs", "example.md"), "# Example\n\n## Contract\n\nVersion one.\n\n## Other\n\nStable.\n");
  await writeFile(join(root, "lib", "example.ts"), "export const value = 1;\n");
  await writeFile(join(root, "tests", "example", "example.test.mjs"), "// fixture\n");
  await writeFile(join(root, "lib", "generated", "example", "value.ts"), "export const generated = 1;\n");
  await writeFile(join(root, "fixtures", "example", "input.json"), "{}\n");
  await writeFile(join(root, "scripts", "generate-example.mjs"), "// fixture\n");
  await writeFile(join(root, "scripts", "contract-doc-probes", "example.v1.mjs"), fixtureProbeSource);
  await writeFile(join(root, ".gitignore"), "node_modules\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "--quiet", "-m", "base"]);
  return { root, baseSha: runGit(root, ["rev-parse", "HEAD"]) };
}

async function commit(root, message) {
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "--quiet", "-m", message]);
  return runGit(root, ["rev-parse", "HEAD"]);
}

async function governanceProbeFixture(files) {
  const root = await mkdtemp(join(tmpdir(), "vector-doc-probe-adversary-"));
  runGit(root, ["init", "--quiet"]);
  runGit(root, ["config", "user.email", "tests@example.invalid"]);
  runGit(root, ["config", "user.name", "VECTOR tests"]);
  const materializedFiles = { ...files };
  if (Object.hasOwn(materializedFiles, "scripts/classify-ci-changes.mjs") && !Object.hasOwn(materializedFiles, "scripts/lib/git-name-status.mjs")) {
    materializedFiles["scripts/lib/git-name-status.mjs"] = await readFile(resolve("scripts/lib/git-name-status.mjs"), "utf8");
  }
  for (const [path, content] of Object.entries(materializedFiles)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}

test("strict JSON rejects duplicate and unknown keys", () => {
  assert.throws(
    () => parseStrictJson('{"schemaVersion":"x","schemaVersion":"y"}', "declaration"),
    /duplicate key schemaVersion/i,
  );
  assert.throws(
    () => validateDeclaration({ ...declaration(), surprise: true }, policy),
    /unknown key surprise/i,
  );
});

test("the PR adapter requires exactly one bounded declaration block", () => {
  const raw = JSON.stringify(declaration());
  const body = `Before\n<!-- vector-contract-doc-impact\n${raw}\n-->\nAfter`;
  assert.deepEqual(extractDeclarationFromPullRequestBody(body, policy), declaration());
  assert.throws(() => extractDeclarationFromPullRequestBody(`${body}\n${body}`, policy), /exactly one/i);
  assert.throws(
    () => extractDeclarationFromPullRequestBody(`<!-- vector-contract-doc-impact\n${" ".repeat(32769)}\n-->`, policy),
    /exceeds/i,
  );
});

test("the generated declaration template is structurally complete but cannot be submitted unchanged", () => {
  const generated = declarationTemplate(policy);
  assert.equal(generated.schemaVersion, DECLARATION_SCHEMA);
  assert.equal(generated.families.length, 1);
  assert.throws(() => validateDeclaration(generated, policy), /placeholder|specific evidence/i);
  assert.throws(
    () => validateDeclaration(declaration({ evidence: [{ kind: "TEST", value: "x" }] }), policy),
    /specific evidence|at least/i,
  );
});

test("the declaration template uses the exact diff-derived family and section inventory", () => {
  const requirements = [
    { familyId: "EXAMPLE", owningSections: [section], migrationSections: [] },
  ];
  const generated = declarationTemplate(policy, requirements);
  assert.deepEqual(generated.families.map((item) => item.familyId), ["EXAMPLE"]);
  assert.deepEqual(generated.families[0].owningSections, [section]);
  assert.equal(generated.families[0].migration.state, "NOT_APPLICABLE");
});

test("hosted output renders the exact validated declaration for reviewers", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "vector-doc-summary-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const summaryPath = join(directory, "summary.md");
  const previous = process.env.GITHUB_STEP_SUMMARY;
  process.env.GITHUB_STEP_SUMMARY = summaryPath;
  t.after(() => {
    if (previous === undefined) delete process.env.GITHUB_STEP_SUMMARY;
    else process.env.GITHUB_STEP_SUMMARY = previous;
  });
  const exactDeclaration = declaration();
  writeOutput({
    state: "VERIFIED",
    policyBootstrap: false,
    declaration: exactDeclaration,
    ruleRetirements: [{ retirementId: "EXAMPLE_IMPLEMENTATION_LIB_EXAMPLE_TS_V1" }],
  });
  const summary = await readFile(summaryPath, "utf8");
  assert.match(summary, /exact declaration validated/i);
  assert.match(summary, new RegExp(exactDeclaration.families[0].rationale.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.match(summary, /Governed rule retirements/u);
  assert.match(summary, /EXAMPLE_IMPLEMENTATION_LIB_EXAMPLE_TS_V1/u);
});

test("push verification requires exactly one revision-bound associated merged main pull request", async () => {
  const body = `<!-- vector-contract-doc-impact\n${JSON.stringify(declaration())}\n-->`;
  const response = (pullRequests) => async () => ({ ok: true, status: 200, json: async () => pullRequests });
  const options = { repository: "example/vector", token: "test-token" };
  await assert.rejects(
    resolvePushDeclaration({ before: commitSha("b"), after: commitSha("a") }, policy, { ...options, fetchImpl: response([]) }),
    /exactly one.*found 0/i,
  );
  await assert.rejects(
    resolvePushDeclaration({ before: commitSha("b"), after: commitSha("a") }, policy, {
      ...options,
      fetchImpl: response([
        { merged_at: "2026-08-24", merge_commit_sha: commitSha("a"), base: { ref: "main", sha: commitSha("b") }, head: { sha: commitSha("c") }, body },
        { merged_at: "2026-08-24", merge_commit_sha: commitSha("a"), base: { ref: "main", sha: commitSha("b") }, head: { sha: commitSha("d") }, body },
      ]),
    }),
    /exactly one.*found 2/i,
  );
  assert.deepEqual(
    await resolvePushDeclaration({ before: commitSha("b"), after: commitSha("a") }, policy, {
      ...options,
      fetchImpl: response([{ merged_at: "2026-08-24", merge_commit_sha: commitSha("a"), base: { ref: "main", sha: commitSha("b") }, head: { sha: commitSha("c") }, body }]),
    }),
    declaration(),
  );
  await assert.rejects(
    resolvePushDeclaration({ before: commitSha("b"), after: commitSha("a") }, policy, {
      ...options,
      fetchImpl: response([{ merged_at: "2026-08-24", merge_commit_sha: commitSha("f"), base: { ref: "main", sha: commitSha("b") }, head: { sha: commitSha("c") }, body }]),
    }),
    /exactly one.*found 0/i,
  );
});

test("name-status parsing retains both rename and copy endpoints", () => {
  assert.deepEqual(
    parseNameStatusZ("M\u0000lib/example.ts\u0000R100\u0000lib/old.ts\u0000lib/new.ts\u0000C090\u0000lib/source.ts\u0000lib/copy.ts\u0000"),
    [
      { status: "M", oldPath: null, path: "lib/example.ts" },
      { status: "R100", oldPath: "lib/old.ts", path: "lib/new.ts" },
      { status: "C090", oldPath: "lib/source.ts", path: "lib/copy.ts" },
    ],
  );
  assert.throws(() => parseNameStatusZ("R100\u0000lib/old.ts\u0000"), /truncated/i);
  assert.throws(() => parseNameStatusZ("M\u0000lib/bad\nname.ts\u0000"), /controls/i);
  assert.throws(() => parseNameStatusZ(Buffer.from([0x4d, 0, 0x6c, 0x69, 0x62, 0x2f, 0xff, 0])), /encoded data|utf-8/i);
});

test("name-status parsing covers add, modify, delete, rename, and copy", () => {
  const operations = parseNameStatusZ("A\u0000lib/add.ts\u0000M\u0000lib/modify.ts\u0000D\u0000lib/delete.ts\u0000R100\u0000lib/old.ts\u0000lib/new.ts\u0000C100\u0000lib/source.ts\u0000lib/copy.ts\u0000");
  assert.deepEqual(operations.map(({ status }) => status), ["A", "M", "D", "R100", "C100"]);
  assert.deepEqual(operations[3], { status: "R100", oldPath: "lib/old.ts", path: "lib/new.ts" });
  assert.deepEqual(operations[4], { status: "C100", oldPath: "lib/source.ts", path: "lib/copy.ts" });
});

test("bootstrap is exact-base-only and stale branches cannot self-bootstrap", () => {
  const headPolicy = { ...policy, bootstrapBaseSha: commitSha("a") };
  assert.equal(resolvePolicyBootstrap({ baseSha: commitSha("a"), mergeBaseSha: commitSha("a"), baseTipPolicy: null, mergeBasePolicy: null, headPolicy }), true);
  assert.throws(
    () => resolvePolicyBootstrap({ baseSha: commitSha("a"), mergeBaseSha: commitSha("b"), baseTipPolicy: policy, mergeBasePolicy: null, headPolicy }),
    /must rebase/i,
  );
  assert.throws(
    () => resolvePolicyBootstrap({ baseSha: commitSha("a"), mergeBaseSha: commitSha("b"), baseTipPolicy: null, mergeBasePolicy: null, headPolicy }),
    /exact integration base/i,
  );
});

test("policy validation rejects unsupported glob rules and accidental overlaps", () => {
  assert.throws(
    () => validatePolicy({ ...policy, nonContractRules: [{ id: "BAD", kind: "GLOB", value: "**" }] }, { trackedPaths: [] }),
    /match kind/i,
  );
  assert.throws(
    () => validatePolicy({ ...policy, nonContractRules: [{ id: "BAD", kind: "EXACT", value: "lib/example.ts" }] }, { trackedPaths: ["lib/example.ts"] }),
    /both contract and non-contract/i,
  );
  assert.throws(() => validatePolicy(policy, { trackedPaths: [
    "lib/example.ts",
    "tests/example/example.test.mjs",
    "lib/generated/example/value.ts",
    "fixtures/example/input.json",
    "scripts/generate-example.mjs",
    "scripts/contract-doc-probes/example.v1.mjs",
    ".gitignore",
    "unowned-root-file.xyz",
  ] }), /unclassified/i);
});

test("policy validation resolves every registered document and exact heading", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const missing = { ...policy, families: [{ ...policy.families[0], owningSections: [{ ...section, path: "docs/missing.md" }] }] };
  assert.throws(() => validatePolicy(missing, { rootDirectory: fixture.root, trackedPaths: runGit(fixture.root, ["ls-files"]).split("\n") }), /regular file/i);
  const wrongHeading = { ...policy, families: [{ ...policy.families[0], owningSections: [{ ...section, heading: "## Missing" }] }] };
  assert.throws(() => validatePolicy(wrongHeading, { rootDirectory: fixture.root, trackedPaths: runGit(fixture.root, ["ls-files"]).split("\n") }), /exactly once/i);
});

test("every governed rule facet resolves to a registered owning section", () => {
  const orphanFacetPolicy = {
    ...policy,
    families: [{
      ...policy.families[0],
      implementationRules: [
        ...policy.families[0].implementationRules,
        { kind: "EXACT", value: "lib/unmapped-semantic.ts", facets: ["validity"] },
      ],
    }],
  };
  assert.throws(
    () => validatePolicy(orphanFacetPolicy, { trackedPaths: [] }),
    /facet validity.*owning section/i,
  );
});

test("semantic changes require the exact owning section to change materially", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await writeFile(join(fixture.root, "lib", "example.ts"), "export const value = 2;\n");
  await writeFile(join(fixture.root, "docs", "example.md"), "# Example\n\n## Contract\n\nVersion two.\n\n## Other\n\nStable.\n");
  const headSha = await commit(fixture.root, "semantic");
  const report = verifyContractDocImpact({
    rootDirectory: fixture.root,
    baseSha: fixture.baseSha,
    headSha,
    declaration: declaration(),
    policy: { ...policy, canonicalSha256: undefined },
  });
  assert.equal(report.state, "VERIFIED");
  assert.deepEqual(report.families, ["EXAMPLE"]);

  runGit(fixture.root, ["reset", "--hard", fixture.baseSha]);
  await writeFile(join(fixture.root, "lib", "example.ts"), "export const value = 3;\n");
  await writeFile(join(fixture.root, "docs", "example.md"), "# Example\n\n## Contract\n\nVersion one.  \n\n## Other\n\nChanged elsewhere.\n");
  const unrelatedHead = await commit(fixture.root, "unrelated docs");
  assert.throws(
    () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha: unrelatedHead, declaration: declaration(), policy: { ...policy, canonicalSha256: undefined } }),
    /changed outside every registered owning section/i,
  );
});

test("post-bootstrap policy may introduce only revision-bound semantic owning sections", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const newSection = {
    sectionId: "NEW_CONTRACT",
    path: "docs/new-contract.md",
    heading: "## New contract",
    facets: ["runtime"],
  };
  const newFamily = {
    id: "NEW_FAMILY",
    workstream: "staff-architecture",
    implementationRules: [{ kind: "EXACT", value: "lib/new-contract.ts", facets: ["runtime"] }],
    testRules: [],
    generatedGroups: [],
    owningSections: [newSection],
    migrationSections: [],
  };
  const headPolicy = {
    ...policy,
    families: [...policy.families, newFamily],
    canonicalSha256: undefined,
  };
  const semanticDeclaration = {
    schemaVersion: DECLARATION_SCHEMA,
    families: [{
      familyId: "NEW_FAMILY",
      disposition: "SEMANTIC",
      owningSections: [newSection],
      rationale: "The new runtime contract and its first maintained owning section are introduced together.",
      evidence: [{ kind: "TEST", value: "node --test tests/new-contract.test.mjs" }],
      migration: {
        state: "NOT_APPLICABLE",
        documents: [],
        rationale: "The new contract adds no persisted representation or migration.",
      },
      exemptionEvidence: null,
    }],
  };

  await writeFile(join(fixture.root, "lib", "new-contract.ts"), "export const runtime = 1;\n");
  await writeFile(join(fixture.root, "docs", "new-contract.md"), "# New contract\n\n## New contract\n\nVersion one.\n");
  const headSha = await commit(fixture.root, "introduce governed contract section");

  assert.equal(verifyContractDocImpact({
    rootDirectory: fixture.root,
    baseSha: fixture.baseSha,
    headSha,
    declaration: semanticDeclaration,
    basePolicy: { ...policy, canonicalSha256: undefined },
    headPolicy,
  }).state, "VERIFIED");

  await writeFile(join(fixture.root, "docs", "new-contract.md"), "# New contract\n\n## New contract\n");
  const emptySectionHead = await commit(fixture.root, "empty governed contract section");
  assert.throws(
    () => verifyContractDocImpact({
      rootDirectory: fixture.root,
      baseSha: fixture.baseSha,
      headSha: emptySectionHead,
      declaration: semanticDeclaration,
      basePolicy: { ...policy, canonicalSha256: undefined },
      headPolicy,
    }),
    /newly registered.*material contract content/i,
  );

  await writeFile(join(fixture.root, "docs", "new-contract.md"), "# New contract\n\n## New contract\n\n<!-- TODO: document this contract -->\n");
  const commentOnlyHead = await commit(fixture.root, "placeholder-only governed contract section");
  assert.throws(
    () => verifyContractDocImpact({
      rootDirectory: fixture.root,
      baseSha: fixture.baseSha,
      headSha: commentOnlyHead,
      declaration: semanticDeclaration,
      basePolicy: { ...policy, canonicalSha256: undefined },
      headPolicy,
    }),
    /newly registered.*material contract content/i,
  );

  await writeFile(join(fixture.root, "docs", "new-contract.md"), "# New contract\n\n## New contract\n\n<!-- unfinished placeholder\n");
  const unclosedCommentHead = await commit(fixture.root, "unclosed comment-only governed contract section");
  assert.throws(
    () => verifyContractDocImpact({
      rootDirectory: fixture.root,
      baseSha: fixture.baseSha,
      headSha: unclosedCommentHead,
      declaration: semanticDeclaration,
      basePolicy: { ...policy, canonicalSha256: undefined },
      headPolicy,
    }),
    /newly registered.*material contract content/i,
  );

  await writeFile(join(fixture.root, "docs", "new-contract.md"), "# New contract\n\n## New contract\n\n<div></div>\n");
  const emptyHtmlHead = await commit(fixture.root, "empty raw HTML governed contract section");
  assert.throws(
    () => verifyContractDocImpact({
      rootDirectory: fixture.root,
      baseSha: fixture.baseSha,
      headSha: emptyHtmlHead,
      declaration: semanticDeclaration,
      basePolicy: { ...policy, canonicalSha256: undefined },
      headPolicy,
    }),
    /newly registered.*material contract content/i,
  );

  await writeFile(join(fixture.root, "docs", "new-contract.md"), "# New contract\n\n## New contract\n\n### Placeholder\n");
  const emptySubheadingHead = await commit(fixture.root, "empty subordinate governed contract heading");
  assert.throws(
    () => verifyContractDocImpact({
      rootDirectory: fixture.root,
      baseSha: fixture.baseSha,
      headSha: emptySubheadingHead,
      declaration: semanticDeclaration,
      basePolicy: { ...policy, canonicalSha256: undefined },
      headPolicy,
    }),
    /newly registered.*material contract content/i,
  );

  const renderedPlaceholderBodies = [
    ["&nbsp;", "named whitespace entity"],
    ["&#8203;", "numeric zero-width entity"],
    ["[placeholder]: https://example.invalid", "reference definition"],
    ["[](https://example.invalid)", "empty link"],
    ["<style>body { display: none; }</style>", "non-rendered style block"],
    ["<span hidden>TODO</span>", "hidden raw HTML content"],
    ["<span aria-hidden=\"true\">TODO</span>", "aria-hidden raw HTML content"],
    ["<span style=\"display: none\">TODO</span>", "styled hidden raw HTML content"],
    ["<title>TODO</title>", "non-rendered title content"],
    ["<dialog>TODO</dialog>", "closed dialog content"],
    ["<details><summary></summary>TODO</details>", "collapsed details content"],
    ["<style>.hidden { display: none; }</style>\n\n<span class=\"hidden\">TODO</span>", "class-hidden raw HTML content"],
    ["<div hidden>\n\nTODO\n\n</div>", "cross-block hidden raw HTML content"],
    ["<dialog>\n\nTODO\n\n</dialog>", "cross-block closed dialog content"],
    ["<details>\n\nTODO\n\n</details>", "cross-block collapsed details content"],
    ["<style>p { display: none; }</style>\n\nTODO", "cross-block stylesheet-hidden paragraph"],
    ["<style>li { display: none; }</style>\n\n- TODO", "cross-block stylesheet-hidden list"],
    ["<div\n title=\"contract\">\n</div>", "multiline empty raw HTML"],
    ["<div title=\">contract\"></div>", "quoted-angle empty raw HTML"],
    ["> ### Placeholder", "blockquoted empty heading"],
    ["- ### Placeholder", "list-contained empty heading"],
  ];
  for (const [body, label] of renderedPlaceholderBodies) {
    await writeFile(join(fixture.root, "docs", "new-contract.md"), `# New contract\n\n## New contract\n\n${body}\n`);
    const placeholderHead = await commit(fixture.root, `reject ${label}`);
    assert.throws(
      () => verifyContractDocImpact({
        rootDirectory: fixture.root,
        baseSha: fixture.baseSha,
        headSha: placeholderHead,
        declaration: semanticDeclaration,
        basePolicy: { ...policy, canonicalSha256: undefined },
        headPolicy,
      }),
      /newly registered.*material contract content/i,
      label,
    );
  }

  const materialBodies = [
    ["<https://example.invalid/contract>", "visible Markdown autolink"],
    ["```ts\ntype Contract = Readonly<Record<string, number>>;\n```", "visible fenced code"],
    ["- Contract requirement one", "visible list item"],
  ];
  for (const [body, label] of materialBodies) {
    await writeFile(join(fixture.root, "docs", "new-contract.md"), `# New contract\n\n## New contract\n\n${body}\n`);
    const materialHead = await commit(fixture.root, `admit ${label}`);
    assert.equal(verifyContractDocImpact({
      rootDirectory: fixture.root,
      baseSha: fixture.baseSha,
      headSha: materialHead,
      declaration: semanticDeclaration,
      basePolicy: { ...policy, canonicalSha256: undefined },
      headPolicy,
    }).state, "VERIFIED", label);
  }

  const docsCurrent = structuredClone(semanticDeclaration);
  docsCurrent.families[0].disposition = "DOCS_ALREADY_CURRENT";
  docsCurrent.families[0].exemptionEvidence = {
    kind: "DOCS_ALREADY_CURRENT",
    sections: [{ ...newSection, contentSha256: sha("a"), documentedAtCommit: fixture.baseSha }],
    migrationSections: [],
  };
  assert.throws(
    () => verifyContractDocImpact({
      rootDirectory: fixture.root,
      baseSha: fixture.baseSha,
      headSha,
      declaration: docsCurrent,
      basePolicy: { ...policy, canonicalSha256: undefined },
      headPolicy,
    }),
    /newly registered.*SEMANTIC/i,
  );
});

test("an existing family may add a new semantic section but cannot relabel an unchanged heading", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const runtimeSection = {
    sectionId: "EXAMPLE_NEW_RUNTIME",
    path: "docs/runtime-contract.md",
    heading: "## Runtime contract",
    facets: ["runtime"],
  };
  const headPolicy = {
    ...policy,
    families: [{
      ...policy.families[0],
      implementationRules: [
        ...policy.families[0].implementationRules,
        { kind: "EXACT", value: "lib/runtime-contract.ts", facets: ["runtime"] },
      ],
      owningSections: [...policy.families[0].owningSections, runtimeSection],
    }],
    canonicalSha256: undefined,
  };
  await writeFile(join(fixture.root, "lib", "runtime-contract.ts"), "export const runtime = 1;\n");
  await writeFile(join(fixture.root, "docs", "runtime-contract.md"), "# Runtime\n\n## Runtime contract\n\nVersion one.\n");
  const headSha = await commit(fixture.root, "add runtime section to existing family");
  assert.equal(verifyContractDocImpact({
    rootDirectory: fixture.root,
    baseSha: fixture.baseSha,
    headSha,
    declaration: declaration({ owningSections: [runtimeSection] }),
    basePolicy: { ...policy, canonicalSha256: undefined },
    headPolicy,
  }).state, "VERIFIED");

  const relabelSection = {
    sectionId: "RELABEL_OLD_HEADING",
    path: "docs/example.md",
    heading: "## Other",
    facets: ["schema"],
  };
  const relabelFamily = {
    id: "RELABEL_FAMILY",
    workstream: "staff-architecture",
    implementationRules: [{ kind: "EXACT", value: "lib/example.ts", facets: ["schema"] }],
    testRules: [],
    generatedGroups: [],
    owningSections: [relabelSection],
    migrationSections: [],
  };
  const relabelPolicy = {
    ...policy,
    families: [...policy.families, relabelFamily],
    allowedMultiFamilyPaths: ["docs/example.md", "lib/example.ts"],
    canonicalSha256: undefined,
  };
  await rm(join(fixture.root, "docs", "runtime-contract.md"));
  await rm(join(fixture.root, "lib", "runtime-contract.ts"));
  await writeFile(join(fixture.root, "docs", "example.md"), "# Example\n\n## Contract\n\nVersion two.\n\n## Other\n\nStable.\n");
  const relabelHeadSha = await commit(fixture.root, "change a different section while relabelling an old heading");
  assert.throws(
    () => verifyContractDocImpact({
      rootDirectory: fixture.root,
      baseSha: fixture.baseSha,
      headSha: relabelHeadSha,
      declaration: declaration(),
      basePolicy: { ...policy, canonicalSha256: undefined },
      headPolicy: relabelPolicy,
    }),
    /newly registered.*heading.*already exists at the merge base/i,
  );
});

test("semantic facets require only their registered owning sections", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const runtimeSection = { sectionId: "EXAMPLE_RUNTIME", path: "docs/example.md", heading: "## Other", facets: ["runtime"] };
  const facetPolicy = {
    ...policy,
    families: [{ ...policy.families[0], owningSections: [section, runtimeSection] }],
  };
  await writeFile(join(fixture.root, "lib", "example.ts"), "export const value = 2;\n");
  await writeFile(join(fixture.root, "docs", "example.md"), "# Example\n\n## Contract\n\nVersion two.\n\n## Other\n\nStable.\n");
  const headSha = await commit(fixture.root, "schema facet");
  assert.equal(verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: declaration(), policy: facetPolicy }).state, "VERIFIED");
  assert.throws(
    () => verifyContractDocImpact({
      rootDirectory: fixture.root,
      baseSha: fixture.baseSha,
      headSha,
      declaration: declaration({ owningSections: [section, runtimeSection] }),
      policy: facetPolicy,
    }),
    /owning sections does not match/i,
  );
});

test("migration sections are required only for their affected semantic facets", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await writeFile(join(fixture.root, "lib", "runtime.ts"), "export const runtime = 1;\n");
  await writeFile(join(fixture.root, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\nNo schema change.\n");
  const baseSha = await commit(fixture.root, "facet base");
  const runtimeSection = { sectionId: "EXAMPLE_RUNTIME", path: "docs/example.md", heading: "## Other", facets: ["runtime"] };
  const migrationSection = { sectionId: "EXAMPLE_CHANGELOG", path: "CHANGELOG.md", heading: "## Unreleased", facets: ["schema"] };
  const facetPolicy = {
    ...policy,
    families: [{
      ...policy.families[0],
      implementationRules: [...policy.families[0].implementationRules, { kind: "EXACT", value: "lib/runtime.ts", facets: ["runtime"] }],
      owningSections: [section, runtimeSection],
      migrationSections: [migrationSection],
    }],
  };

  await writeFile(join(fixture.root, "lib", "runtime.ts"), "export const runtime = 2;\n");
  await writeFile(join(fixture.root, "docs", "example.md"), "# Example\n\n## Contract\n\nVersion one.\n\n## Other\n\nRuntime two.\n");
  const runtimeHead = await commit(fixture.root, "runtime facet");
  const runtimeDeclaration = declaration({ owningSections: [runtimeSection] });
  assert.equal(verifyContractDocImpact({ rootDirectory: fixture.root, baseSha, headSha: runtimeHead, declaration: runtimeDeclaration, policy: facetPolicy }).state, "VERIFIED");

  runGit(fixture.root, ["reset", "--hard", baseSha]);
  await writeFile(join(fixture.root, "lib", "example.ts"), "export const value = 2;\n");
  await writeFile(join(fixture.root, "docs", "example.md"), "# Example\n\n## Contract\n\nVersion two.\n\n## Other\n\nStable.\n");
  const missingMigrationHead = await commit(fixture.root, "schema without migration");
  assert.throws(
    () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha, headSha: missingMigrationHead, declaration: declaration(), policy: facetPolicy }),
    /requires updated migration/i,
  );

  await writeFile(join(fixture.root, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\nSchema version two.\n");
  const completeHead = await commit(fixture.root, "schema migration evidence");
  const completeDeclaration = declaration({
    migration: {
      state: "UPDATED",
      documents: [migrationSection],
      rationale: "The Unreleased section records the exact schema transition for this fixture.",
    },
  });
  assert.equal(verifyContractDocImpact({ rootDirectory: fixture.root, baseSha, headSha: completeHead, declaration: completeDeclaration, policy: facetPolicy }).state, "VERIFIED");
});

test("the canonical diff detects copies from unmodified sources with both endpoints", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const copyPolicy = {
    ...policy,
    families: [{
      ...policy.families[0],
      implementationRules: [...policy.families[0].implementationRules, { kind: "EXACT", value: "lib/example-copy.ts", facets: ["schema"] }],
    }],
  };
  await writeFile(join(fixture.root, "lib", "example-copy.ts"), "export const value = 1;\n");
  await writeFile(join(fixture.root, "docs", "example.md"), "# Example\n\n## Contract\n\nVersion two.\n\n## Other\n\nStable.\n");
  const headSha = await commit(fixture.root, "copy unchanged source");
  const report = verifyContractDocImpact({
    rootDirectory: fixture.root,
    baseSha: fixture.baseSha,
    headSha,
    declaration: declaration(),
    basePolicy: policy,
    headPolicy: copyPolicy,
  });
  assert(report.operations.some((operation) => operation.status === "C100" && operation.oldPath === "lib/example.ts" && operation.path === "lib/example-copy.ts"));
});

test("multi-family changes require one complete declaration per family", () => {
  const second = { ...policy.families[0], id: "SECOND", implementationRules: [{ kind: "EXACT", value: "lib/second.ts", facets: ["schema"] }] };
  const twoFamilyPolicy = { ...policy, families: [...policy.families, second], canonicalSha256: undefined };
  assert.throws(
    () => validateDeclaration(declaration(), twoFamilyPolicy, { requiredFamilies: ["EXAMPLE", "SECOND"] }),
    /missing family SECOND/i,
  );
});

test("a shared document selects only the family whose registered section changed", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const second = {
    ...policy.families[0],
    id: "SECOND",
    implementationRules: [],
    testRules: [],
    generatedGroups: [],
    owningSections: [{ sectionId: "SECOND_CONTRACT", path: "docs/example.md", heading: "## Other", facets: ["schema"] }],
  };
  const twoFamilyPolicy = {
    ...policy,
    families: [...policy.families, second],
    allowedMultiFamilyPaths: ["docs/example.md"],
    canonicalSha256: undefined,
  };
  await writeFile(join(fixture.root, "docs", "example.md"), "# Example\n\n## Contract\n\nVersion two.\n\n## Other\n\nStable.\n");
  const headSha = await commit(fixture.root, "change one owned section");
  const report = verifyContractDocImpact({
    rootDirectory: fixture.root,
    baseSha: fixture.baseSha,
    headSha,
    declaration: declaration(),
    basePolicy: twoFamilyPolicy,
    headPolicy: twoFamilyPolicy,
  });
  assert.deepEqual(report.families, ["EXAMPLE"]);
});

test("an implementation change cannot mask an independently changed owning section", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const verificationSection = {
    sectionId: "EXAMPLE_VERIFICATION",
    path: "docs/example.md",
    heading: "## Contract",
    facets: ["schema", "verification"],
  };
  const persistenceSection = {
    sectionId: "EXAMPLE_PERSISTENCE",
    path: "docs/example.md",
    heading: "## Other",
    facets: ["storage"],
  };
  const facetPolicy = {
    ...policy,
    families: [{
      ...policy.families[0],
      owningSections: [verificationSection, persistenceSection],
    }],
    canonicalSha256: undefined,
  };
  await writeFile(join(fixture.root, "tests", "example", "example.test.mjs"), "// changed verification fixture\n");
  await writeFile(
    join(fixture.root, "docs", "example.md"),
    "# Example\n\n## Contract\n\nVerification version two.\n\n## Other\n\nPersistence version two.\n",
  );
  const headSha = await commit(fixture.root, "verification and independent persistence contract");
  const incomplete = declaration({ owningSections: [verificationSection] });
  assert.throws(
    () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: incomplete, policy: facetPolicy }),
    /owning sections does not match/i,
  );
  const complete = declaration({ owningSections: [verificationSection, persistenceSection] });
  assert.equal(
    verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: complete, policy: facetPolicy }).state,
    "VERIFIED",
  );
});

test("the head policy cannot remove ownership that the base policy used", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await writeFile(join(fixture.root, "lib", "example.ts"), "export const value = 2;\n");
  const headSha = await commit(fixture.root, "attempt policy weakening");
  const weakened = {
    ...policy,
    families: [{ ...policy.families[0], implementationRules: [] }],
    nonContractRules: [...policy.nonContractRules, { id: "WEAKENED", kind: "EXACT", value: "lib/example.ts" }],
    canonicalSha256: undefined,
  };
  assert.throws(
    () => verifyContractDocImpact({
      rootDirectory: fixture.root,
      baseSha: fixture.baseSha,
      headSha,
      declaration: declaration(),
      basePolicy: { ...policy, canonicalSha256: undefined },
      headPolicy: weakened,
    }),
    /removes (?:contract ownership|family ownership|EXAMPLE\.implementationRules)|covers path outside family/i,
  );

  const sectionWeakened = {
    ...policy,
    families: [{ ...policy.families[0], owningSections: [{ sectionId: "REPLACEMENT", path: "docs/example.md", heading: "## Other", facets: ["schema"] }] }],
    canonicalSha256: undefined,
  };
  assert.throws(
    () => verifyContractDocImpact({
      rootDirectory: fixture.root,
      baseSha: fixture.baseSha,
      headSha,
      declaration: declaration(),
      basePolicy: { ...policy, canonicalSha256: undefined },
      headPolicy: sectionWeakened,
    }),
    /removes EXAMPLE\.owningSections|rule facet verification.*owning section/i,
  );
});

test("an exact governed rule can retire only with a revision-bound deleted endpoint tombstone", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const basePolicy = {
    ...policy,
    canonicalSha256: undefined,
  };
  await rm(join(fixture.root, "lib", "example.ts"));
  await writeFile(join(fixture.root, "docs", "example.md"), "# Example\n\n## Contract\n\nThe exact implementation path was intentionally retired.\n\n## Other\n\nStable.\n");
  const headSha = await commit(fixture.root, "retire exact governed path");
  const retiredRule = basePolicy.families[0].implementationRules[0];
  assert.throws(
    () => verifyContractDocImpact({
      rootDirectory: fixture.root,
      baseSha: fixture.baseSha,
      headSha,
      declaration: declaration(),
      basePolicy,
      headPolicy: basePolicy,
    }),
    /matches no tracked path/i,
  );
  const removedWithoutRetirement = {
    ...basePolicy,
    families: [{
      ...basePolicy.families[0],
      implementationRules: basePolicy.families[0].implementationRules.slice(1),
    }],
  };
  assert.throws(
    () => verifyContractDocImpact({
      rootDirectory: fixture.root,
      baseSha: fixture.baseSha,
      headSha,
      declaration: declaration(),
      basePolicy,
      headPolicy: removedWithoutRetirement,
    }),
    /removes EXAMPLE\.implementationRules|changedPathRules\[0\] matches no tracked path/i,
  );
  const headPolicy = {
    ...basePolicy,
    families: [{
      ...basePolicy.families[0],
      implementationRules: basePolicy.families[0].implementationRules.slice(1),
    }],
    ruleRetirements: [{
      retirementId: "EXAMPLE_IMPLEMENTATION_LIB_EXAMPLE_TS_V1",
      familyId: "EXAMPLE",
      inventory: "IMPLEMENTATION",
      generatedGroupId: null,
      rule: retiredRule,
      retiredAtMergeBaseSha: fixture.baseSha,
      retiredFromPolicySha256: policySha256(basePolicy),
      replacementPath: null,
      rationale: "lib/example.ts was deleted and its old endpoint remains governed by the base policy.",
    }],
  };
  assert.equal(
    verifyContractDocImpact({
      rootDirectory: fixture.root,
      baseSha: fixture.baseSha,
      headSha,
      declaration: declaration(),
      basePolicy,
      headPolicy,
    }).state,
    "VERIFIED",
  );
  assert.throws(
    () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: declaration(), headPolicy, policyBootstrap: true }),
    /retirements are unavailable during policy bootstrap/i,
  );
  const wrongBase = structuredClone(headPolicy);
  wrongBase.ruleRetirements[0].retiredFromPolicySha256 = sha("f");
  assert.throws(
    () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: declaration(), basePolicy, headPolicy: wrongBase }),
    /not bound to the exact base policy/i,
  );
  const wrongMergeBase = structuredClone(headPolicy);
  wrongMergeBase.ruleRetirements[0].retiredAtMergeBaseSha = commitSha("f");
  assert.throws(
    () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: declaration(), basePolicy, headPolicy: wrongMergeBase }),
    /not bound to the exact merge-base commit/i,
  );
  const prefixRetirement = structuredClone(headPolicy);
  prefixRetirement.ruleRetirements[0].rule.kind = "PREFIX";
  prefixRetirement.ruleRetirements[0].rule.value = "lib/";
  assert.throws(
    () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: declaration(), basePolicy, headPolicy: prefixRetirement }),
    /may retire only an EXACT rule/i,
  );
  await writeFile(join(fixture.root, ".gitignore"), "node_modules\ncoverage\n");
  const laterHeadSha = await commit(fixture.root, "unrelated follow-up after retirement");
  const emptyDeclaration = { schemaVersion: DECLARATION_SCHEMA, families: [] };
  assert.equal(
    verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: headSha, headSha: laterHeadSha, declaration: emptyDeclaration, basePolicy: headPolicy, headPolicy }).state,
    "NO_RELEVANT_CHANGES",
  );
  const erasedTombstone = { ...headPolicy, ruleRetirements: [] };
  assert.throws(
    () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: headSha, headSha: laterHeadSha, declaration: emptyDeclaration, basePolicy: headPolicy, headPolicy: erasedTombstone }),
    /removes rule retirements|changedPathRules\[0\] matches no tracked path/i,
  );
});

test("an exact governed rename preserves family, inventory, and facet ownership", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const basePolicy = { ...policy, nonSemanticProbes: [], canonicalSha256: undefined };
  runGit(fixture.root, ["mv", "lib/example.ts", "lib/renamed-example.ts"]);
  await writeFile(join(fixture.root, "docs", "example.md"), "# Example\n\n## Contract\n\nThe implementation path was renamed without losing its contract owner.\n\n## Other\n\nStable.\n");
  const headSha = await commit(fixture.root, "rename exact governed path");
  const retiredRule = basePolicy.families[0].implementationRules[0];
  const replacementRule = { ...retiredRule, value: "lib/renamed-example.ts" };
  const headPolicy = {
    ...basePolicy,
    families: [{
      ...basePolicy.families[0],
      implementationRules: [replacementRule, ...basePolicy.families[0].implementationRules.slice(1)],
    }],
    ruleRetirements: [{
      retirementId: "EXAMPLE_IMPLEMENTATION_LIB_EXAMPLE_TS_RENAME_V1",
      familyId: "EXAMPLE",
      inventory: "IMPLEMENTATION",
      generatedGroupId: null,
      rule: retiredRule,
      retiredAtMergeBaseSha: fixture.baseSha,
      retiredFromPolicySha256: policySha256(basePolicy),
      replacementPath: "lib/renamed-example.ts",
      rationale: "The exact implementation endpoint moved while retaining the same family, inventory, and facets.",
    }],
    allowedMultiFamilyPaths: [],
  };
  assert.equal(
    verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: declaration(), basePolicy, headPolicy }).state,
    "VERIFIED",
  );
  const wrongInventory = structuredClone(headPolicy);
  wrongInventory.ruleRetirements[0].inventory = "TEST";
  assert.throws(
    () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: declaration(), basePolicy, headPolicy: wrongInventory }),
    /removes EXAMPLE\.implementationRules|rule remains active/i,
  );
  const wrongReplacement = structuredClone(headPolicy);
  wrongReplacement.ruleRetirements[0].replacementPath = "tests/example/example.test.mjs";
  assert.throws(
    () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: declaration(), basePolicy, headPolicy: wrongReplacement }),
    /not bound to exactly one declared rename endpoint/i,
  );
});

test("historical rename tombstones do not block a later governed rename", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const initialPolicy = structuredClone({ ...policy, nonSemanticProbes: [], canonicalSha256: undefined });
  const initialRule = initialPolicy.families[0].implementationRules[0];
  const secondRule = { ...initialRule, value: "lib/renamed-example.ts" };
  runGit(fixture.root, ["mv", initialRule.value, secondRule.value]);
  await writeFile(join(fixture.root, "docs", "example.md"), "# Example\n\n## Contract\n\nThe implementation endpoint moved to its second governed identity.\n\n## Other\n\nStable.\n");
  const secondSha = await commit(fixture.root, "rename governed endpoint to second identity");
  const secondPolicy = structuredClone(initialPolicy);
  secondPolicy.families[0].implementationRules = [secondRule, ...initialPolicy.families[0].implementationRules.slice(1)];
  secondPolicy.ruleRetirements = [{
    retirementId: "EXAMPLE_FIRST_RENAME_RETIREMENT_V1",
    familyId: "EXAMPLE",
    inventory: "IMPLEMENTATION",
    generatedGroupId: null,
    rule: initialRule,
    retiredAtMergeBaseSha: fixture.baseSha,
    retiredFromPolicySha256: policySha256(initialPolicy),
    replacementPath: secondRule.value,
    rationale: "The first exact endpoint moved to a same-family implementation rule with identical facets.",
  }];
  assert.equal(
    verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha: secondSha, declaration: declaration(), basePolicy: initialPolicy, headPolicy: secondPolicy }).state,
    "VERIFIED",
  );

  const thirdRule = { ...initialRule, value: "lib/final-example.ts" };
  runGit(fixture.root, ["mv", secondRule.value, thirdRule.value]);
  await writeFile(join(fixture.root, "docs", "example.md"), "# Example\n\n## Contract\n\nThe implementation endpoint moved again while preserving both historical tombstones.\n\n## Other\n\nStable.\n");
  const thirdSha = await commit(fixture.root, "rename governed endpoint to third identity");
  const thirdPolicy = structuredClone(secondPolicy);
  thirdPolicy.families[0].implementationRules = [thirdRule, ...initialPolicy.families[0].implementationRules.slice(1)];
  thirdPolicy.ruleRetirements.push({
    retirementId: "EXAMPLE_SECOND_RENAME_RETIREMENT_V1",
    familyId: "EXAMPLE",
    inventory: "IMPLEMENTATION",
    generatedGroupId: null,
    rule: secondRule,
    retiredAtMergeBaseSha: secondSha,
    retiredFromPolicySha256: policySha256(secondPolicy),
    replacementPath: thirdRule.value,
    rationale: "The second exact endpoint moved again while the first immutable tombstone remained historical evidence.",
  });
  assert.equal(
    verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: secondSha, headSha: thirdSha, declaration: declaration(), basePolicy: secondPolicy, headPolicy: thirdPolicy }).state,
    "VERIFIED",
  );
});

test("test and generated exact rules use the same audited retirement contract", async (t) => {
  for (const subject of [
    { inventory: "TEST", generatedGroupId: null, path: "tests/example/example.test.mjs", familyField: "testRules" },
    { inventory: "GENERATED_OUTPUT", generatedGroupId: "EXAMPLE_GENERATED", path: "lib/generated/example/value.ts", familyField: "generated" },
  ]) {
    await t.test(subject.inventory, async (t) => {
      const fixture = await fixtureRepository();
      t.after(() => rm(fixture.root, { recursive: true, force: true }));
      const basePolicy = structuredClone({ ...policy, nonSemanticProbes: [], canonicalSha256: undefined });
      let retiredRule;
      if (subject.familyField === "testRules") {
        retiredRule = { kind: "EXACT", value: subject.path, facets: ["verification"] };
        basePolicy.families[0].testRules = [retiredRule];
      } else {
        retiredRule = { kind: "EXACT", value: subject.path, facets: ["schema"] };
        basePolicy.families[0].generatedGroups[0].outputRules = [
          retiredRule,
          { kind: "EXACT", value: "scripts/generate-example.mjs", facets: ["schema"] },
        ];
      }
      await rm(join(fixture.root, subject.path));
      if (subject.inventory !== "TEST") {
        await writeFile(join(fixture.root, "docs", "example.md"), `# Example\n\n## Contract\n\nThe ${subject.inventory} endpoint was retired under the same closed contract.\n\n## Other\n\nStable.\n`);
      }
      const headSha = await commit(fixture.root, `retire ${subject.inventory}`);
      const headPolicy = structuredClone(basePolicy);
      if (subject.familyField === "testRules") headPolicy.families[0].testRules = [];
      else headPolicy.families[0].generatedGroups[0].outputRules = headPolicy.families[0].generatedGroups[0].outputRules.slice(1);
      headPolicy.ruleRetirements = [{
        retirementId: `EXAMPLE_${subject.inventory}_RETIREMENT_V1`,
        familyId: "EXAMPLE",
        inventory: subject.inventory,
        generatedGroupId: subject.generatedGroupId,
        rule: retiredRule,
        retiredAtMergeBaseSha: fixture.baseSha,
        retiredFromPolicySha256: policySha256(basePolicy),
        replacementPath: null,
        rationale: `The exact ${subject.inventory} endpoint was deleted while its base-policy ownership remains auditable.`,
      }];
      const retirementDeclaration = subject.inventory === "TEST"
        ? declaration({
          disposition: "TEST_ONLY",
          owningSections: [section],
          exemptionEvidence: { kind: "TEST_ONLY", paths: [subject.path] },
        })
        : declaration();
      assert.equal(
        verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: retirementDeclaration, basePolicy, headPolicy }).state,
        "VERIFIED",
      );
    });
  }
});

test("a deleted multi-family endpoint requires one retirement per exact owner", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await writeFile(join(fixture.root, "docs", "second.md"), "# Second\n\n## Contract\n\nVersion one.\n");
  const baseSha = await commit(fixture.root, "add second owner document");
  const secondSection = { sectionId: "SECOND_CONTRACT", path: "docs/second.md", heading: "## Contract", facets: ["schema"] };
  const sharedRule = { kind: "EXACT", value: "lib/example.ts", facets: ["schema"] };
  const secondFamily = {
    id: "SECOND",
    workstream: "staff-architecture",
    implementationRules: [sharedRule],
    testRules: [],
    generatedGroups: [],
    owningSections: [secondSection],
    migrationSections: [],
  };
  const basePolicy = structuredClone({
    ...policy,
    families: [policy.families[0], secondFamily],
    nonSemanticProbes: [],
    allowedMultiFamilyPaths: ["lib/example.ts"],
    canonicalSha256: undefined,
  });
  await rm(join(fixture.root, "lib", "example.ts"));
  await writeFile(join(fixture.root, "docs", "example.md"), "# Example\n\n## Contract\n\nThe shared endpoint was retired.\n\n## Other\n\nStable.\n");
  await writeFile(join(fixture.root, "docs", "second.md"), "# Second\n\n## Contract\n\nThe shared endpoint was retired.\n");
  const headSha = await commit(fixture.root, "retire shared endpoint");
  const headPolicy = structuredClone(basePolicy);
  headPolicy.families[0].implementationRules = headPolicy.families[0].implementationRules.slice(1);
  headPolicy.families[1].implementationRules = [];
  headPolicy.ruleRetirements = [
    {
      retirementId: "EXAMPLE_SHARED_ENDPOINT_RETIREMENT_V1",
      familyId: "EXAMPLE",
      inventory: "IMPLEMENTATION",
      generatedGroupId: null,
      rule: sharedRule,
      retiredAtMergeBaseSha: baseSha,
      retiredFromPolicySha256: policySha256(basePolicy),
      replacementPath: null,
      rationale: "The shared exact endpoint was deleted from the EXAMPLE family under the audited retirement contract.",
    },
    {
      retirementId: "SECOND_SHARED_ENDPOINT_RETIREMENT_V1",
      familyId: "SECOND",
      inventory: "IMPLEMENTATION",
      generatedGroupId: null,
      rule: sharedRule,
      retiredAtMergeBaseSha: baseSha,
      retiredFromPolicySha256: policySha256(basePolicy),
      replacementPath: null,
      rationale: "The shared exact endpoint was deleted from the SECOND family under the audited retirement contract.",
    },
  ];
  const multiDeclaration = {
    schemaVersion: DECLARATION_SCHEMA,
    families: [
      declaration().families[0],
      {
        familyId: "SECOND",
        disposition: "SEMANTIC",
        owningSections: [secondSection],
        rationale: "The second owner document records retirement of the shared exact implementation endpoint.",
        evidence: [{ kind: "TEST", value: "node --test tests/contract-doc-impact.test.mjs" }],
        migration: { state: "NOT_APPLICABLE", documents: [], rationale: "No persisted schema or migration is affected by path retirement." },
        exemptionEvidence: null,
      },
    ],
  };
  assert.equal(
    verifyContractDocImpact({ rootDirectory: fixture.root, baseSha, headSha, declaration: multiDeclaration, basePolicy, headPolicy }).state,
    "VERIFIED",
  );
  const partialRetirement = structuredClone(headPolicy);
  partialRetirement.ruleRetirements.pop();
  assert.throws(
    () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha, headSha, declaration: multiDeclaration, basePolicy, headPolicy: partialRetirement }),
    /removes SECOND\.implementationRules/i,
  );
});

test("rule retirements reject live endpoints, orphan records, and empty generated contracts", async (t) => {
  await t.test("a copied or still-tracked endpoint cannot be retired", async (t) => {
    const fixture = await fixtureRepository();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));
    const basePolicy = structuredClone({ ...policy, nonSemanticProbes: [], canonicalSha256: undefined });
    await writeFile(join(fixture.root, "lib", "copied-example.ts"), "export const value = 1;\n");
    const headSha = await commit(fixture.root, "copy governed endpoint without deleting its source");
    const retiredRule = basePolicy.families[0].implementationRules[0];
    const headPolicy = structuredClone(basePolicy);
    headPolicy.families[0].implementationRules = headPolicy.families[0].implementationRules.slice(1);
    headPolicy.ruleRetirements = [{
      retirementId: "EXAMPLE_LIVE_ENDPOINT_RETIREMENT_V1",
      familyId: "EXAMPLE",
      inventory: "IMPLEMENTATION",
      generatedGroupId: null,
      rule: retiredRule,
      retiredAtMergeBaseSha: fixture.baseSha,
      retiredFromPolicySha256: policySha256(basePolicy),
      replacementPath: null,
      rationale: "This hostile record attempts to retire an endpoint that remains tracked after a copy operation.",
    }];
    assert.throws(
      () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: declaration(), basePolicy, headPolicy }),
      /old path is still tracked|not bound to exactly one deleted endpoint/i,
    );
  });

  await t.test("a tombstone cannot be added without retiring a base rule", async (t) => {
    const fixture = await fixtureRepository();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));
    const basePolicy = structuredClone({ ...policy, nonSemanticProbes: [], canonicalSha256: undefined });
    await rm(join(fixture.root, ".gitignore"));
    const headSha = await commit(fixture.root, "delete a non-contract path");
    const headPolicy = structuredClone(basePolicy);
    headPolicy.nonContractRules = [];
    headPolicy.ruleRetirements = [{
      retirementId: "EXAMPLE_ORPHAN_RETIREMENT_V1",
      familyId: "EXAMPLE",
      inventory: "IMPLEMENTATION",
      generatedGroupId: null,
      rule: { kind: "EXACT", value: ".gitignore", facets: ["schema"] },
      retiredAtMergeBaseSha: fixture.baseSha,
      retiredFromPolicySha256: policySha256(basePolicy),
      replacementPath: null,
      rationale: "This hostile record names no implementation rule from the immutable base policy inventory.",
    }];
    assert.throws(
      () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: { schemaVersion: DECLARATION_SCHEMA, families: [] }, basePolicy, headPolicy }),
      /adds a rule retirement without retiring an exact base rule/i,
    );
  });

  await t.test("a generated group cannot retire its last output contract", async (t) => {
    const fixture = await fixtureRepository();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));
    const basePolicy = structuredClone({ ...policy, nonSemanticProbes: [], canonicalSha256: undefined });
    const retiredRule = { kind: "EXACT", value: "lib/generated/example/value.ts", facets: ["schema"] };
    basePolicy.families[0].generatedGroups[0].outputRules = [retiredRule];
    await rm(join(fixture.root, retiredRule.value));
    const headSha = await commit(fixture.root, "delete the last generated output");
    const headPolicy = structuredClone(basePolicy);
    headPolicy.families[0].generatedGroups[0].outputRules = [];
    headPolicy.ruleRetirements = [{
      retirementId: "EXAMPLE_LAST_GENERATED_OUTPUT_RETIREMENT_V1",
      familyId: "EXAMPLE",
      inventory: "GENERATED_OUTPUT",
      generatedGroupId: "EXAMPLE_GENERATED",
      rule: retiredRule,
      retiredAtMergeBaseSha: fixture.baseSha,
      retiredFromPolicySha256: policySha256(basePolicy),
      replacementPath: null,
      rationale: "This hostile record attempts to leave a registered freshness group without any generated outputs.",
    }];
    assert.throws(
      () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: declaration(), basePolicy, headPolicy }),
      /outputRules must be non-empty/i,
    );
  });

  await t.test("a tombstone in one inventory cannot excuse an identical stale active rule", async (t) => {
    const fixture = await fixtureRepository();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));
    const basePolicy = structuredClone({ ...policy, nonSemanticProbes: [], canonicalSha256: undefined });
    const retiredRule = basePolicy.families[0].implementationRules[0];
    basePolicy.families[0].testRules = [retiredRule, ...basePolicy.families[0].testRules];
    await rm(join(fixture.root, retiredRule.value));
    await writeFile(join(fixture.root, "docs", "example.md"), "# Example\n\n## Contract\n\nThe implementation endpoint was retired while a hostile identical test rule remained active.\n\n## Other\n\nStable.\n");
    const headSha = await commit(fixture.root, "attempt cross-inventory stale-rule escape");
    const headPolicy = structuredClone(basePolicy);
    headPolicy.families[0].implementationRules = headPolicy.families[0].implementationRules.slice(1);
    headPolicy.ruleRetirements = [{
      retirementId: "EXAMPLE_CROSS_INVENTORY_RETIREMENT_V1",
      familyId: "EXAMPLE",
      inventory: "IMPLEMENTATION",
      generatedGroupId: null,
      rule: retiredRule,
      retiredAtMergeBaseSha: fixture.baseSha,
      retiredFromPolicySha256: policySha256(basePolicy),
      replacementPath: null,
      rationale: "This hostile record retires only the implementation inventory while leaving an identical stale test rule active.",
    }];
    assert.throws(
      () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: declaration(), basePolicy, headPolicy }),
      /testRules\[0\] matches no tracked path/i,
    );
  });

  await t.test("a generated-output tombstone cannot excuse an identical active input rule", async (t) => {
    const fixture = await fixtureRepository();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));
    const basePolicy = structuredClone({ ...policy, nonSemanticProbes: [], canonicalSha256: undefined });
    const retiredRule = { kind: "EXACT", value: "lib/generated/example/value.ts", facets: ["schema"] };
    const retainedOutput = { kind: "EXACT", value: "scripts/generate-example.mjs", facets: ["schema"] };
    const group = basePolicy.families[0].generatedGroups[0];
    group.outputRules = [retiredRule, retainedOutput];
    group.inputRules = [retiredRule, ...group.inputRules];
    await rm(join(fixture.root, retiredRule.value));
    await writeFile(join(fixture.root, "docs", "example.md"), "# Example\n\n## Contract\n\nOne generated output endpoint was retired without authorizing a stale input rule.\n\n## Other\n\nStable.\n");
    const headSha = await commit(fixture.root, "attempt generated cross-inventory stale-rule escape");
    const headPolicy = structuredClone(basePolicy);
    headPolicy.families[0].generatedGroups[0].outputRules = [retainedOutput];
    headPolicy.ruleRetirements = [{
      retirementId: "EXAMPLE_GENERATED_CROSS_INVENTORY_RETIREMENT_V1",
      familyId: "EXAMPLE",
      inventory: "GENERATED_OUTPUT",
      generatedGroupId: "EXAMPLE_GENERATED",
      rule: retiredRule,
      retiredAtMergeBaseSha: fixture.baseSha,
      retiredFromPolicySha256: policySha256(basePolicy),
      replacementPath: null,
      rationale: "This hostile record retires an output while leaving the identical endpoint active in the input inventory.",
    }];
    assert.throws(
      () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: declaration(), basePolicy, headPolicy }),
      /inputRules\[0\] matches no tracked path/i,
    );
  });

  await t.test("a newly-added probe cannot use a tombstone as dormant path authority", async (t) => {
    const fixture = await fixtureRepository();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));
    const basePolicy = structuredClone({ ...policy, nonSemanticProbes: [], canonicalSha256: undefined });
    const retiredRule = basePolicy.families[0].implementationRules[0];
    await rm(join(fixture.root, retiredRule.value));
    await writeFile(join(fixture.root, "docs", "example.md"), "# Example\n\n## Contract\n\nThe implementation endpoint and its active ownership were retired.\n\n## Other\n\nStable.\n");
    const headSha = await commit(fixture.root, "attempt dormant probe authorization");
    const headPolicy = structuredClone(basePolicy);
    headPolicy.families[0].implementationRules = headPolicy.families[0].implementationRules.slice(1);
    headPolicy.ruleRetirements = [{
      retirementId: "EXAMPLE_DORMANT_PROBE_RETIREMENT_V1",
      familyId: "EXAMPLE",
      inventory: "IMPLEMENTATION",
      generatedGroupId: null,
      rule: retiredRule,
      retiredAtMergeBaseSha: fixture.baseSha,
      retiredFromPolicySha256: policySha256(basePolicy),
      replacementPath: null,
      rationale: "The implementation endpoint was deleted, but this record must not authorize a new dormant probe.",
    }];
    headPolicy.nonSemanticProbes = [{
      id: "EXAMPLE_DORMANT_PROBE_V1",
      familyId: "EXAMPLE",
      disposition: "INTERNAL_REFACTOR",
      changedPathRules: [retiredRule],
      adapterPath: "scripts/contract-doc-probes/example.v1.mjs",
      adapterSha256: fixtureProbeSha256,
      assertionIds: ["PUBLIC_API_IDENTITY"],
    }];
    assert.throws(
      () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: declaration(), basePolicy, headPolicy }),
      /new non-semantic probe.*retired endpoint|dormant probe/i,
    );
  });

  await t.test("a newly-added multi-family ledger path cannot be inert at creation", async (t) => {
    const fixture = await fixtureRepository();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));
    const basePolicy = structuredClone({ ...policy, nonSemanticProbes: [], canonicalSha256: undefined });
    const retiredRule = basePolicy.families[0].implementationRules[0];
    await rm(join(fixture.root, retiredRule.value));
    await writeFile(join(fixture.root, "docs", "example.md"), "# Example\n\n## Contract\n\nThe single-owner endpoint was retired without inventing multi-family history.\n\n## Other\n\nStable.\n");
    const headSha = await commit(fixture.root, "attempt inert multi-family ledger creation");
    const headPolicy = structuredClone(basePolicy);
    headPolicy.families[0].implementationRules = headPolicy.families[0].implementationRules.slice(1);
    headPolicy.allowedMultiFamilyPaths = [retiredRule.value];
    headPolicy.ruleRetirements = [{
      retirementId: "EXAMPLE_INERT_MULTI_FAMILY_RETIREMENT_V1",
      familyId: "EXAMPLE",
      inventory: "IMPLEMENTATION",
      generatedGroupId: null,
      rule: retiredRule,
      retiredAtMergeBaseSha: fixture.baseSha,
      retiredFromPolicySha256: policySha256(basePolicy),
      replacementPath: null,
      rationale: "The single-owner endpoint was deleted, but its tombstone must not fabricate a multi-family ledger entry.",
    }];
    assert.throws(
      () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: declaration(), basePolicy, headPolicy }),
      /cannot be added as an inert multi-family path/i,
    );
  });
});

test("a supplied merge base is exact and replay-bound", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await writeFile(join(fixture.root, "tests", "example", "example.test.mjs"), "// changed fixture\n");
  const headSha = await commit(fixture.root, "merge-base binding");
  const testOnly = declaration({
    disposition: "TEST_ONLY",
    exemptionEvidence: { kind: "TEST_ONLY", paths: ["tests/example/example.test.mjs"] },
  });
  assert.throws(
    () => verifyContractDocImpact({
      rootDirectory: fixture.root,
      baseSha: fixture.baseSha,
      headSha,
      mergeBaseSha: headSha,
      declaration: testOnly,
      policy: { ...policy, canonicalSha256: undefined },
    }),
    /does not match the computed merge base/i,
  );
});

test("TEST_ONLY is restricted to the registered test surface", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await writeFile(join(fixture.root, "tests", "example", "example.test.mjs"), "// changed fixture\n");
  const headSha = await commit(fixture.root, "test only");
  const testOnly = declaration({
    disposition: "TEST_ONLY",
    exemptionEvidence: { kind: "TEST_ONLY", paths: ["tests/example/example.test.mjs"] },
  });
  assert.equal(verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: testOnly, policy: { ...policy, canonicalSha256: undefined } }).state, "VERIFIED");
});

test("generated-only requires unchanged inputs and generator plus the policy-owned toolchain and freshness argv", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await writeFile(join(fixture.root, "lib", "generated", "example", "value.ts"), "export const generated = 2;\n");
  const headSha = await commit(fixture.root, "generated only");
  const generated = declaration({
    disposition: "GENERATED_ARTIFACT_ONLY",
    evidence: [{ kind: "TEST", value: "node scripts/generate-example.mjs --check" }],
    exemptionEvidence: { kind: "GENERATED_ARTIFACT_ONLY", groupId: "EXAMPLE_GENERATED" },
  });
  const groups = [];
  assert.equal(verifyContractDocImpact({
    rootDirectory: fixture.root,
    baseSha: fixture.baseSha,
    headSha,
    declaration: generated,
    policy: { ...policy, canonicalSha256: undefined },
    freshnessRunner: (group) => groups.push(group),
  }).state, "VERIFIED");
  assert.deepEqual(groups, [policy.families[0].generatedGroups[0]]);
  assert.throws(() => verifyContractDocImpact({
    rootDirectory: fixture.root,
    baseSha: fixture.baseSha,
    headSha,
    declaration: generated,
    policy: { ...policy, canonicalSha256: undefined },
    policyBootstrap: true,
    freshnessRunner: () => true,
  }), /unavailable during policy bootstrap/i);
  const headOnlyGroup = { ...policy.families[0].generatedGroups[0], id: "HEAD_ONLY_GENERATED" };
  const headOnlyPolicy = {
    ...policy,
    canonicalSha256: undefined,
    families: [{ ...policy.families[0], generatedGroups: [...policy.families[0].generatedGroups, headOnlyGroup] }],
  };
  const headOnlyDeclaration = structuredClone(generated);
  headOnlyDeclaration.families[0].exemptionEvidence.groupId = headOnlyGroup.id;
  assert.throws(() => verifyContractDocImpact({
    rootDirectory: fixture.root,
    baseSha: fixture.baseSha,
    headSha,
    declaration: headOnlyDeclaration,
    basePolicy: { ...policy, canonicalSha256: undefined },
    headPolicy: headOnlyPolicy,
    freshnessRunner: () => true,
  }), /not-yet-trusted generated group/i);
  assert.throws(
    () => validateDeclaration(declaration({
      disposition: "GENERATED_ARTIFACT_ONLY",
      evidence: [{ kind: "TEST", value: "node scripts/generate-example.mjs --check" }],
      exemptionEvidence: {
        kind: "GENERATED_ARTIFACT_ONLY",
        groupId: "EXAMPLE_GENERATED",
        freshnessArgv: ["node", "scripts/generate-example.mjs", "--check"],
      },
    }), policy),
    /unknown key freshnessArgv/i,
  );

  runGit(fixture.root, ["reset", "--hard", fixture.baseSha]);
  await writeFile(join(fixture.root, "lib", "generated", "example", "value.ts"), "export const generated = 3;\n");
  await writeFile(join(fixture.root, "fixtures", "example", "input.json"), "{\"changed\":true}\n");
  const taintedHead = await commit(fixture.root, "generated output and input");
  assert.throws(
    () => verifyContractDocImpact({
      rootDirectory: fixture.root,
      baseSha: fixture.baseSha,
      headSha: taintedHead,
      declaration: generated,
      policy,
      freshnessRunner: () => true,
    }),
    /input, generator, or non-output/i,
  );
});

test("GENERATED_ARTIFACT_ONLY cannot conceal retirement of a governed output", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const basePolicy = structuredClone({ ...policy, nonSemanticProbes: [], canonicalSha256: undefined });
  const retiredRule = { kind: "EXACT", value: "lib/generated/example/value.ts", facets: ["schema"] };
  const retainedRule = { kind: "EXACT", value: "scripts/generate-example.mjs", facets: ["schema"] };
  basePolicy.families[0].generatedGroups[0].outputRules = [retiredRule, retainedRule];
  await rm(join(fixture.root, retiredRule.value));
  const headSha = await commit(fixture.root, "retire generated output without contract documentation");
  const headPolicy = structuredClone(basePolicy);
  headPolicy.families[0].generatedGroups[0].outputRules = [retainedRule];
  headPolicy.ruleRetirements = [{
    retirementId: "EXAMPLE_GENERATED_ONLY_ESCAPE_RETIREMENT_V1",
    familyId: "EXAMPLE",
    inventory: "GENERATED_OUTPUT",
    generatedGroupId: "EXAMPLE_GENERATED",
    rule: retiredRule,
    retiredAtMergeBaseSha: fixture.baseSha,
    retiredFromPolicySha256: policySha256(basePolicy),
    replacementPath: null,
    rationale: "The governed output was deleted, which is a semantic contract change rather than routine regeneration.",
  }];
  const generatedOnly = declaration({
    disposition: "GENERATED_ARTIFACT_ONLY",
    evidence: [{ kind: "TEST", value: "node scripts/generate-example.mjs --check" }],
    exemptionEvidence: { kind: "GENERATED_ARTIFACT_ONLY", groupId: "EXAMPLE_GENERATED" },
  });
  assert.throws(
    () => verifyContractDocImpact({
      rootDirectory: fixture.root,
      baseSha: fixture.baseSha,
      headSha,
      declaration: generatedOnly,
      basePolicy,
      headPolicy,
      freshnessRunner: () => true,
    }),
    /generated output retirement requires SEMANTIC disposition/i,
  );

  for (const disposition of ["INTERNAL_REFACTOR", "NO_SEMANTIC_CHANGE"]) {
    const probeId = `EXAMPLE_GENERATED_OUTPUT_${disposition}_V1`;
    const probe = {
      id: probeId,
      familyId: "EXAMPLE",
      disposition,
      changedPathRules: [retiredRule],
      adapterPath: "scripts/contract-doc-probes/example.v1.mjs",
      adapterSha256: fixtureProbeSha256,
      assertionIds: [disposition === "INTERNAL_REFACTOR" ? "PUBLIC_API_IDENTITY" : "BEHAVIOR_INVARIANT"],
    };
    const trustedBasePolicy = structuredClone(basePolicy);
    trustedBasePolicy.nonSemanticProbes = [probe];
    const trustedHeadPolicy = structuredClone(headPolicy);
    trustedHeadPolicy.nonSemanticProbes = [probe];
    trustedHeadPolicy.ruleRetirements[0].retiredFromPolicySha256 = policySha256(trustedBasePolicy);
    const probeDeclaration = declaration({
      disposition,
      evidence: [{ kind: "TEST", value: "trusted generated-output retirement probe" }],
      exemptionEvidence: { kind: disposition, probeIds: [probeId] },
    });
    assert.throws(
      () => verifyContractDocImpact({
        rootDirectory: fixture.root,
        baseSha: fixture.baseSha,
        headSha,
        declaration: probeDeclaration,
        basePolicy: trustedBasePolicy,
        headPolicy: trustedHeadPolicy,
        probeRunner: passingProbeResult,
      }),
      /generated output retirement requires SEMANTIC disposition/i,
    );
  }
});

test("registered freshness uses an exact secret-free head archive and rejects tracked mutation", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await writeFile(join(fixture.root, "scripts", "check-freshness-env.mjs"), "if (process.env.GITHUB_TOKEN) throw new Error('secret exposed');\n");
  await writeFile(join(fixture.root, "scripts", "mutate-tracked.mjs"), "import { writeFileSync } from 'node:fs'; writeFileSync('lib/example.ts', 'mutated\\n');\n");
  const headSha = await commit(fixture.root, "freshness execution fixtures");
  const previousToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "must-not-reach-freshness";
  t.after(() => {
    if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousToken;
  });
  assert.doesNotThrow(() => runRegisteredFreshness(fixture.root, {
    headSha,
    group: { id: "ENVIRONMENT", toolchainId: "NODE", freshnessArgv: ["node", "scripts/check-freshness-env.mjs"] },
  }));
  assert.throws(() => runRegisteredFreshness(fixture.root, {
    headSha,
    group: { id: "MUTATOR", toolchainId: "NODE", freshnessArgv: ["node", "scripts/mutate-tracked.mjs"] },
  }), /modified tracked head content/i);
});

test("refactor, no-semantic-change, and docs-current evidence are discriminated", () => {
  assert.doesNotThrow(() => validateDeclaration(declaration({
    disposition: "INTERNAL_REFACTOR",
    exemptionEvidence: { kind: "INTERNAL_REFACTOR", probeIds: ["EXAMPLE_IDENTITY_V1"] },
  }), policy));
  assert.throws(() => validateDeclaration(declaration({
    disposition: "INTERNAL_REFACTOR",
    exemptionEvidence: { kind: "NO_SEMANTIC_CHANGE", probeIds: ["EXAMPLE_INVARIANT_V1"] },
  }), policy), /must match disposition/i);
  assert.doesNotThrow(() => validateDeclaration(declaration({
    disposition: "DOCS_ALREADY_CURRENT",
    exemptionEvidence: { kind: "DOCS_ALREADY_CURRENT", sections: [{ ...section, contentSha256: sha("c"), documentedAtCommit: commitSha("d") }], migrationSections: [] },
  }), policy));
});

test("refactor and no-semantic exemptions cannot trust declaration-only assertions", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await writeFile(join(fixture.root, "lib", "example.ts"), "export const value = 2;\n");
  const headSha = await commit(fixture.root, "exemption probes");
  const basePolicy = { ...policy, canonicalSha256: undefined };
  const refactor = declaration({
    disposition: "INTERNAL_REFACTOR",
    exemptionEvidence: { kind: "INTERNAL_REFACTOR", probeIds: ["EXAMPLE_IDENTITY_V1"] },
  });
  assert.throws(
    () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: refactor, policy: basePolicy }),
    /unavailable without the trusted probe runner/i,
  );
  assert.equal(verifyContractDocImpact({
    rootDirectory: fixture.root,
    baseSha: fixture.baseSha,
    headSha,
    declaration: refactor,
    policy: basePolicy,
    probeRunner: passingProbeResult,
  }).state, "VERIFIED");

  const noSemantic = declaration({
    disposition: "NO_SEMANTIC_CHANGE",
    exemptionEvidence: { kind: "NO_SEMANTIC_CHANGE", probeIds: ["EXAMPLE_INVARIANT_V1"] },
  });
  assert.throws(
    () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: noSemantic, policy: basePolicy }),
    /unavailable without the trusted probe runner/i,
  );
  assert.equal(verifyContractDocImpact({
    rootDirectory: fixture.root,
    baseSha: fixture.baseSha,
    headSha,
    declaration: noSemantic,
    policy: basePolicy,
    probeRunner: passingProbeResult,
  }).state, "VERIFIED");
});

test("non-semantic probes are base-policy authority with exact coverage and fail-closed results", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await writeFile(join(fixture.root, "lib", "example.ts"), "export const value = 2;\n");
  const headSha = await commit(fixture.root, "trusted probe contract");
  const trustedPolicy = { ...policy, canonicalSha256: undefined };
  const refactor = declaration({
    disposition: "INTERNAL_REFACTOR",
    exemptionEvidence: { kind: "INTERNAL_REFACTOR", probeIds: ["EXAMPLE_IDENTITY_V1"] },
  });
  const verify = (probeRunner, overrides = {}) => verifyContractDocImpact({
    rootDirectory: fixture.root,
    baseSha: fixture.baseSha,
    headSha,
    declaration: refactor,
    basePolicy: trustedPolicy,
    headPolicy: trustedPolicy,
    probeRunner,
    ...overrides,
  });
  assert.equal(verify(passingProbeResult).state, "VERIFIED");

  for (const [name, mutate, pattern] of [
    ["boolean", () => true, /result must be an object/i],
    ["wrong revision", (request) => passingProbeResult(request, { headSha: fixture.baseSha }), /revision identity/i],
    ["failed assertion", (request) => {
      const result = passingProbeResult(request);
      result.assertions[0].status = "FAIL";
      return result;
    }, /did not pass/i],
    ["changed identity", (request) => {
      const result = passingProbeResult(request);
      result.assertions[0].afterSha256 = sha("b");
      return result;
    }, /changed across revisions/i],
    ["extra assertion", (request) => {
      const result = passingProbeResult(request);
      result.assertions.push({ ...result.assertions[0], id: "UNREGISTERED" });
      return result;
    }, /assertion inventory/i],
  ]) {
    assert.throws(() => verify(mutate), pattern, name);
  }

  const wrongProbe = structuredClone(refactor);
  wrongProbe.families[0].exemptionEvidence.probeIds = ["EXAMPLE_INVARIANT_V1"];
  assert.throws(() => verifyContractDocImpact({
    rootDirectory: fixture.root,
    baseSha: fixture.baseSha,
    headSha,
    declaration: wrongProbe,
    policy: trustedPolicy,
    probeRunner: passingProbeResult,
  }), /not authorized for disposition/i);

  const addedProbe = {
    ...policy.nonSemanticProbes[0],
    id: "HEAD_ONLY_IDENTITY_V2",
    assertionIds: ["HEAD_ONLY_ASSERTION"],
  };
  const headPolicy = { ...trustedPolicy, nonSemanticProbes: [...trustedPolicy.nonSemanticProbes, addedProbe] };
  const headOnly = structuredClone(refactor);
  headOnly.families[0].exemptionEvidence.probeIds = [addedProbe.id];
  assert.throws(() => verifyContractDocImpact({
    rootDirectory: fixture.root,
    baseSha: fixture.baseSha,
    headSha,
    declaration: headOnly,
    basePolicy: trustedPolicy,
    headPolicy,
    probeRunner: passingProbeResult,
  }), /not-yet-trusted/i);

  assert.throws(() => verify(passingProbeResult, { policyBootstrap: true }), /unavailable during policy bootstrap/i);
});

test("the production probe adapter is digest-bound, deterministic, and revision-bound", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await writeFile(join(fixture.root, "lib", "example.ts"), "export const value = 2;\n");
  const headSha = await commit(fixture.root, "execute trusted probe");
  const probe = policy.nonSemanticProbes[0];
  const request = {
    probe,
    familyId: probe.familyId,
    disposition: probe.disposition,
    mergeBaseSha: fixture.baseSha,
    headSha,
  };
  assert.deepEqual(runRegisteredProbe(fixture.root, request), passingProbeResult(request));

  const forged = { ...probe, adapterSha256: sha("f") };
  assert.throws(() => runRegisteredProbe(fixture.root, { ...request, probe: forged }), /adapter digest mismatch/i);
});

test("the classifier identity probe binds a new rule even when no tracked path samples it", async (t) => {
  const classifierSource = await readFile(resolve("scripts/classify-ci-changes.mjs"), "utf8");
  const helperSource = await readFile(resolve("scripts/lib/contract-doc-impact.mjs"), "utf8");
  const root = await governanceProbeFixture({
    "scripts/classify-ci-changes.mjs": classifierSource,
    "scripts/lib/contract-doc-impact.mjs": helperSource,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const baseSha = await commit(root, "classifier base");
  await writeFile(
    join(root, "scripts", "classify-ci-changes.mjs"),
    classifierSource.replace(
      "patterns: patternInventory(\n        /^\\.codex\\//,",
      "patterns: patternInventory(\n        /^future-namespace\\//,\n        /^\\.codex\\//,",
    ),
  );
  const headSha = await commit(root, "silently change an unenumerated classifier boundary");
  const output = execFileSync("node", [
    resolve("scripts/contract-doc-probes/classifier-decision-identity.v2.mjs"),
    "vector.contract-doc-probe.v1",
    root,
    baseSha,
    headSha,
    "DELIVERY_CONTRACT_GOVERNANCE",
    "DELIVERY_CLASSIFIER_DECISION_IDENTITY_V2",
    "INTERNAL_REFACTOR",
  ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const result = JSON.parse(output);
  assert.equal(result.assertions[0].status, "FAIL");
  assert.notEqual(result.assertions[0].beforeSha256, result.assertions[0].afterSha256);
});

test("the V1 and V2 classifier probes admit an unchanged dependency-isolated name-status matrix", async (t) => {
  const classifierSource = await readFile(resolve("scripts/classify-ci-changes.mjs"), "utf8");
  const helperSource = await readFile(resolve("scripts/lib/contract-doc-impact.mjs"), "utf8");
  const root = await governanceProbeFixture({
    "scripts/classify-ci-changes.mjs": classifierSource,
    "scripts/lib/contract-doc-impact.mjs": helperSource,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const unchangedSha = await commit(root, "unchanged dependency-isolated classifier");
  for (const version of ["v1", "v2"]) {
    const probeId = `DELIVERY_CLASSIFIER_DECISION_IDENTITY_${version.toUpperCase()}`;
    const output = execFileSync("node", [
      resolve(`scripts/contract-doc-probes/classifier-decision-identity.${version}.mjs`),
      "vector.contract-doc-probe.v1",
      root,
      unchangedSha,
      unchangedSha,
      "DELIVERY_CONTRACT_GOVERNANCE",
      probeId,
      "INTERNAL_REFACTOR",
    ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const result = JSON.parse(output);
    assert.equal(result.assertions[0].status, "PASS", `${version} probe must remain executable`);
    assert.equal(result.assertions[0].beforeSha256, result.assertions[0].afterSha256);
  }
});

test("the classifier has no mutable post-snapshot rule authority", async (t) => {
  const classifierSource = await readFile(resolve("scripts/classify-ci-changes.mjs"), "utf8");
  const helperSource = await readFile(resolve("scripts/lib/contract-doc-impact.mjs"), "utf8");
  assert.doesNotMatch(classifierSource, /\bconst POLICY_ONLY\b/);

  for (const [name, injectedMutation] of [
    ["removed legacy rule array", "POLICY_ONLY.push(/^future-namespace\\//);"],
    [
      "deep-frozen rule inventory",
      "CLASSIFIER_DECISION_CONTRACT.groups[0].patterns.push({ source: '^future-namespace/', flags: '' });",
    ],
  ]) {
    const root = await governanceProbeFixture({
      "scripts/classify-ci-changes.mjs": classifierSource,
      "scripts/lib/contract-doc-impact.mjs": helperSource,
    });
    t.after(() => rm(root, { recursive: true, force: true }));
    const baseSha = await commit(root, `${name} base`);
    const mutatedSource = classifierSource.replace(
      "export function classifyChanges(inputFiles) {",
      `${injectedMutation}\n\nexport function classifyChanges(inputFiles) {`,
    );
    assert.notEqual(mutatedSource, classifierSource, `${name} mutation must be injected`);
    await writeFile(join(root, "scripts", "classify-ci-changes.mjs"), mutatedSource);
    const headSha = await commit(root, `${name} mutation`);
    assert.throws(() => execFileSync("node", [
      resolve("scripts/contract-doc-probes/classifier-decision-identity.v2.mjs"),
      "vector.contract-doc-probe.v1",
      root,
      baseSha,
      headSha,
      "DELIVERY_CONTRACT_GOVERNANCE",
      "DELIVERY_CLASSIFIER_DECISION_IDENTITY_V2",
      "INTERNAL_REFACTOR",
    ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }), undefined, name);
  }
});

test("the classifier rejects an unfrozen decision inventory", async (t) => {
  const classifierSource = await readFile(resolve("scripts/classify-ci-changes.mjs"), "utf8");
  const helperSource = await readFile(resolve("scripts/lib/contract-doc-impact.mjs"), "utf8");
  const root = await governanceProbeFixture({
    "scripts/classify-ci-changes.mjs": classifierSource,
    "scripts/lib/contract-doc-impact.mjs": helperSource,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const baseSha = await commit(root, "frozen classifier base");
  const mutableSource = classifierSource.replace(
    "const deepFreeze = (value) => {",
    "const deepFreeze = (value) => value;\n/*",
  ).replace(
    "  return value;\n};\n\nexport const CLASSIFIER_DECISION_CONTRACT",
    "  return value;\n};\n*/\n\nexport const CLASSIFIER_DECISION_CONTRACT",
  );
  assert.notEqual(mutableSource, classifierSource);
  await writeFile(join(root, "scripts", "classify-ci-changes.mjs"), mutableSource);
  const headSha = await commit(root, "remove classifier freeze");
  assert.throws(() => execFileSync("node", [
    resolve("scripts/contract-doc-probes/classifier-decision-identity.v2.mjs"),
    "vector.contract-doc-probe.v1",
    root,
    baseSha,
    headSha,
    "DELIVERY_CONTRACT_GOVERNANCE",
    "DELIVERY_CLASSIFIER_DECISION_IDENTITY_V2",
    "INTERNAL_REFACTOR",
  ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }));
});

test("the classifier probe binds complete module source outside exported decisions", async (t) => {
  const classifierSource = await readFile(resolve("scripts/classify-ci-changes.mjs"), "utf8");
  const helperSource = await readFile(resolve("scripts/lib/contract-doc-impact.mjs"), "utf8");
  const root = await governanceProbeFixture({
    "scripts/classify-ci-changes.mjs": classifierSource,
    "scripts/lib/contract-doc-impact.mjs": helperSource,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const baseSha = await commit(root, "classifier module source base");
  const monkeyPatchedSource = classifierSource.replace(
    "export function classifyChanges(inputFiles) {",
    "RegExp.prototype.test = function () { return this.source === '^future-namespace/' || false; };\n\nexport function classifyChanges(inputFiles) {",
  );
  assert.notEqual(monkeyPatchedSource, classifierSource);
  await writeFile(join(root, "scripts", "classify-ci-changes.mjs"), monkeyPatchedSource);
  const headSha = await commit(root, "inject unsampled top-level classifier authority");
  const output = execFileSync("node", [
    resolve("scripts/contract-doc-probes/classifier-decision-identity.v2.mjs"),
    "vector.contract-doc-probe.v1",
    root,
    baseSha,
    headSha,
    "DELIVERY_CONTRACT_GOVERNANCE",
    "DELIVERY_CLASSIFIER_DECISION_IDENTITY_V2",
    "INTERNAL_REFACTOR",
  ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const result = JSON.parse(output);
  assert.equal(result.assertions[0].status, "FAIL");
  assert.notEqual(result.assertions[0].beforeSha256, result.assertions[0].afterSha256);
});

test("the classifier probe rejects self-erasing import-time authority", async (t) => {
  const classifierSource = await readFile(resolve("scripts/classify-ci-changes.mjs"), "utf8");
  const helperSource = await readFile(resolve("scripts/lib/contract-doc-impact.mjs"), "utf8");
  const root = await governanceProbeFixture({
    "scripts/classify-ci-changes.mjs": classifierSource,
    "scripts/lib/contract-doc-impact.mjs": helperSource,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const baseSha = await commit(root, "self-erasing classifier base");
  const maliciousSource = classifierSource
    .replace(
      'import { appendFileSync, readFileSync } from "node:fs";',
      'import { appendFileSync, readFileSync, writeFileSync as eraseModuleSource } from "node:fs";',
    )
    .replace(
      "export function classifyChanges(inputFiles) {",
      `RegExp.prototype.test = function () { return this.source === '^future-namespace/' || false; };\neraseModuleSource(new URL(import.meta.url), ${JSON.stringify(classifierSource)});\n\nexport function classifyChanges(inputFiles) {`,
    );
  assert.notEqual(maliciousSource, classifierSource);
  await writeFile(join(root, "scripts", "classify-ci-changes.mjs"), maliciousSource);
  const headSha = await commit(root, "self-erasing import-time classifier authority");
  assert.throws(() => execFileSync("node", [
    resolve("scripts/contract-doc-probes/classifier-decision-identity.v2.mjs"),
    "vector.contract-doc-probe.v1",
    root,
    baseSha,
    headSha,
    "DELIVERY_CONTRACT_GOVERNANCE",
    "DELIVERY_CLASSIFIER_DECISION_IDENTITY_V2",
    "INTERNAL_REFACTOR",
  ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }), /Classifier module or name-status parser changed during execution/i);
});

test("the classifier probe keeps evidence hashing outside candidate module authority", async (t) => {
  const classifierSource = await readFile(resolve("scripts/classify-ci-changes.mjs"), "utf8");
  const helperSource = await readFile(resolve("scripts/lib/contract-doc-impact.mjs"), "utf8");
  const root = await governanceProbeFixture({
    "scripts/classify-ci-changes.mjs": classifierSource,
    "scripts/lib/contract-doc-impact.mjs": helperSource,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const baseSha = await commit(root, "classifier trusted hash base");
  const reboundHashSource = classifierSource
    .replace(
      'import { appendFileSync, readFileSync } from "node:fs";',
      'import crypto from "node:crypto";\nimport { appendFileSync, readFileSync } from "node:fs";\nimport { syncBuiltinESMExports } from "node:module";',
    )
    .replace(
      "export function classifyChanges(inputFiles) {",
      `const originalCreateHash = crypto.createHash.bind(crypto);\ncrypto.createHash = (...arguments_) => {\n  const hash = originalCreateHash(...arguments_);\n  const update = hash.update.bind(hash);\n  hash.update = (value, ...rest) => {\n    if (typeof value === "string") return { digest: () => "0".repeat(64) };\n    update(value, ...rest);\n    return hash;\n  };\n  return hash;\n};\nsyncBuiltinESMExports();\n\nexport function classifyChanges(inputFiles) {`,
    )
    .replace(
      "patterns: patternInventory(\n        /^\\.codex\\//,",
      "patterns: patternInventory(\n        /^future-namespace\\//,\n        /^\\.codex\\//,",
    );
  assert.notEqual(reboundHashSource, classifierSource);
  await writeFile(join(root, "scripts", "classify-ci-changes.mjs"), reboundHashSource);
  const headSha = await commit(root, "rebind candidate hash authority");
  const output = execFileSync("node", [
    resolve("scripts/contract-doc-probes/classifier-decision-identity.v2.mjs"),
    "vector.contract-doc-probe.v1",
    root,
    baseSha,
    headSha,
    "DELIVERY_CONTRACT_GOVERNANCE",
    "DELIVERY_CLASSIFIER_DECISION_IDENTITY_V2",
    "INTERNAL_REFACTOR",
  ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const result = JSON.parse(output);
  assert.equal(result.assertions[0].status, "FAIL");
  assert.notEqual(result.assertions[0].beforeSha256, result.assertions[0].afterSha256);
  assert.notEqual(result.assertions[0].beforeSha256, "0".repeat(64));
  assert.notEqual(result.assertions[0].afterSha256, "0".repeat(64));
});

test("the required-gate invariant probe binds a newly admitted review kind", async (t) => {
  const gateSource = await readFile(resolve("scripts/verify-required-gates.mjs"), "utf8");
  const root = await governanceProbeFixture({ "scripts/verify-required-gates.mjs": gateSource });
  t.after(() => rm(root, { recursive: true, force: true }));
  const baseSha = await commit(root, "required gate base");
  await writeFile(
    join(root, "scripts", "verify-required-gates.mjs"),
    gateSource.replace('["slice", "completion-review", "not-applicable"]', '["slice", "completion-review", "not-applicable", "shadow-review"]'),
  );
  const headSha = await commit(root, "silently admit a partial review kind");
  const output = execFileSync("node", [
    resolve("scripts/contract-doc-probes/required-gate-invariants.v1.mjs"),
    "vector.contract-doc-probe.v1",
    root,
    baseSha,
    headSha,
    "DELIVERY_CONTRACT_GOVERNANCE",
    "DELIVERY_REQUIRED_GATE_INVARIANTS_V1",
    "NO_SEMANTIC_CHANGE",
  ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const result = JSON.parse(output);
  assert.equal(result.assertions[0].status, "FAIL");
  assert.notEqual(result.assertions[0].beforeSha256, result.assertions[0].afterSha256);
});

test("the required-gate invariant probe rejects unselected success relaxation", async (t) => {
  const gateSource = await readFile(resolve("scripts/verify-required-gates.mjs"), "utf8");
  const root = await governanceProbeFixture({ "scripts/verify-required-gates.mjs": gateSource });
  t.after(() => rm(root, { recursive: true, force: true }));
  const baseSha = await commit(root, "required gate base");
  await writeFile(
    join(root, "scripts", "verify-required-gates.mjs"),
    gateSource.replace(
      "result !== REQUIRED_GATE_CONTRACT.unselectedTerminalResult",
      "![REQUIRED_GATE_CONTRACT.unselectedTerminalResult, REQUIRED_GATE_CONTRACT.selectedTerminalResult].includes(result)",
    ),
  );
  const headSha = await commit(root, "incorrectly admit success for an unselected gate");
  const output = execFileSync("node", [
    resolve("scripts/contract-doc-probes/required-gate-invariants.v1.mjs"),
    "vector.contract-doc-probe.v1",
    root,
    baseSha,
    headSha,
    "DELIVERY_CONTRACT_GOVERNANCE",
    "DELIVERY_REQUIRED_GATE_INVARIANTS_V1",
    "NO_SEMANTIC_CHANGE",
  ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const result = JSON.parse(output);
  assert.equal(result.assertions[0].status, "FAIL");
  assert.notEqual(result.assertions[0].beforeSha256, result.assertions[0].afterSha256);
});

test("the required-gate probe keeps evidence hashing outside candidate module authority", async (t) => {
  const gateSource = await readFile(resolve("scripts/verify-required-gates.mjs"), "utf8");
  const root = await governanceProbeFixture({ "scripts/verify-required-gates.mjs": gateSource });
  t.after(() => rm(root, { recursive: true, force: true }));
  const baseSha = await commit(root, "required gate trusted hash base");
  const reboundHashSource = gateSource
    .replace(
      'import { pathToFileURL } from "node:url";',
      'import crypto from "node:crypto";\nimport { syncBuiltinESMExports } from "node:module";\nimport { pathToFileURL } from "node:url";',
    )
    .replace(
      'reviewKinds: ["slice", "completion-review", "not-applicable"],',
      `reviewKinds: ["slice", "completion-review", "not-applicable", "shadow-review"],\n  trustedHashMutation: (() => {\n    const originalCreateHash = crypto.createHash.bind(crypto);\n    crypto.createHash = (...arguments_) => {\n      const hash = originalCreateHash(...arguments_);\n      hash.update = () => ({ digest: () => "0".repeat(64) });\n      return hash;\n    };\n    syncBuiltinESMExports();\n    return true;\n  })(),`,
    );
  assert.notEqual(reboundHashSource, gateSource);
  await writeFile(join(root, "scripts", "verify-required-gates.mjs"), reboundHashSource);
  const headSha = await commit(root, "rebind required gate hash authority");
  const output = execFileSync("node", [
    resolve("scripts/contract-doc-probes/required-gate-invariants.v1.mjs"),
    "vector.contract-doc-probe.v1",
    root,
    baseSha,
    headSha,
    "DELIVERY_CONTRACT_GOVERNANCE",
    "DELIVERY_REQUIRED_GATE_INVARIANTS_V1",
    "NO_SEMANTIC_CHANGE",
  ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const result = JSON.parse(output);
  assert.equal(result.assertions[0].status, "FAIL");
  assert.notEqual(result.assertions[0].beforeSha256, result.assertions[0].afterSha256);
  assert.notEqual(result.assertions[0].beforeSha256, "0".repeat(64));
  assert.notEqual(result.assertions[0].afterSha256, "0".repeat(64));
});

test("DOCS_ALREADY_CURRENT requires an exact earlier ancestor and section identity", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const documentedAtCommit = fixture.baseSha;
  await writeFile(join(fixture.root, ".gitignore"), "node_modules\noutputs\n");
  const baseSha = await commit(fixture.root, "later base without contract change");
  await writeFile(join(fixture.root, "lib", "example.ts"), "export const value = 2;\n");
  const headSha = await commit(fixture.root, "implementation already documented");
  const contentSha256 = createHash("sha256").update("## Contract\n\nVersion one.").digest("hex");
  const docsCurrent = declaration({
    disposition: "DOCS_ALREADY_CURRENT",
    exemptionEvidence: {
      kind: "DOCS_ALREADY_CURRENT",
      sections: [{ ...section, contentSha256, documentedAtCommit }],
      migrationSections: [],
    },
  });
  assert.equal(verifyContractDocImpact({ rootDirectory: fixture.root, baseSha, headSha, declaration: docsCurrent, policy }).state, "VERIFIED");
  assert.throws(
    () => verifyContractDocImpact({
      rootDirectory: fixture.root,
      baseSha,
      headSha,
      declaration: declaration({
        disposition: "DOCS_ALREADY_CURRENT",
        exemptionEvidence: { kind: "DOCS_ALREADY_CURRENT", sections: [{ ...section, contentSha256, documentedAtCommit: baseSha }], migrationSections: [] },
      }),
      policy,
    }),
    /not an earlier ancestor/i,
  );
});

test("DOCS_ALREADY_CURRENT cannot bypass an applicable migration or changelog identity", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await writeFile(join(fixture.root, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\nSchema contract already documented.\n");
  const documentedAtCommit = await commit(fixture.root, "document schema and migration");
  await writeFile(join(fixture.root, ".gitignore"), "node_modules\noutputs\n");
  const baseSha = await commit(fixture.root, "later integration base");
  await writeFile(join(fixture.root, "lib", "example.ts"), "export const value = 2;\n");
  const headSha = await commit(fixture.root, "implementation catches up with documentation");
  const migrationSection = { sectionId: "EXAMPLE_CHANGELOG", path: "CHANGELOG.md", heading: "## Unreleased", facets: ["schema"] };
  const migrationPolicy = {
    ...policy,
    families: [{ ...policy.families[0], migrationSections: [migrationSection] }],
  };
  const owningContentSha256 = createHash("sha256").update("## Contract\n\nVersion one.").digest("hex");
  const migrationContentSha256 = createHash("sha256").update("## Unreleased\n\nSchema contract already documented.").digest("hex");
  const bypass = declaration({
    disposition: "DOCS_ALREADY_CURRENT",
    migration: {
      state: "NOT_APPLICABLE",
      documents: [],
      rationale: "The declaration incorrectly attempts to omit an applicable migration record.",
    },
    exemptionEvidence: {
      kind: "DOCS_ALREADY_CURRENT",
      sections: [{ ...section, contentSha256: owningContentSha256, documentedAtCommit }],
      migrationSections: [],
    },
  });
  assert.throws(
    () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha, headSha, declaration: bypass, policy: migrationPolicy }),
    /migration.*DOCS_ALREADY_CURRENT|migration.*inventory/i,
  );

  const complete = declaration({
    disposition: "DOCS_ALREADY_CURRENT",
    migration: {
      state: "DOCS_ALREADY_CURRENT",
      documents: [migrationSection],
      rationale: "The earlier Unreleased section already records the exact schema migration obligation.",
    },
    exemptionEvidence: {
      kind: "DOCS_ALREADY_CURRENT",
      sections: [{ ...section, contentSha256: owningContentSha256, documentedAtCommit }],
      migrationSections: [{ ...migrationSection, contentSha256: migrationContentSha256, documentedAtCommit }],
    },
  });
  assert.equal(verifyContractDocImpact({ rootDirectory: fixture.root, baseSha, headSha, declaration: complete, policy: migrationPolicy }).state, "VERIFIED");

  await writeFile(join(fixture.root, ".gitignore"), "node_modules\noutputs\nprobe-cache\n");
  const differentEarlierCommit = await commit(fixture.root, "second historical snapshot with unchanged contract sections");
  await writeFile(join(fixture.root, ".gitignore"), "node_modules\noutputs\nprobe-cache\ntemporary\n");
  const laterBaseSha = await commit(fixture.root, "later base after second historical snapshot");
  await writeFile(join(fixture.root, "lib", "example.ts"), "export const value = 3;\n");
  const laterHeadSha = await commit(fixture.root, "implementation after mixed historical snapshots");
  const mixedHistoricalCommits = {
    ...complete,
    families: [{
      ...complete.families[0],
      exemptionEvidence: {
        ...complete.families[0].exemptionEvidence,
        migrationSections: [{ ...migrationSection, contentSha256: migrationContentSha256, documentedAtCommit: differentEarlierCommit }],
      },
    }],
  };
  assert.throws(
    () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: laterBaseSha, headSha: laterHeadSha, declaration: mixedHistoricalCommits, policy: migrationPolicy }),
    /same earlier ancestor/i,
  );
});

test("path normalization and symlink escape fail closed", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await symlink("/tmp", join(fixture.root, "lib", "escape"));
  assert.throws(
    () => validatePolicy({ ...policy, families: [{ ...policy.families[0], implementationRules: [{ kind: "EXACT", value: "lib/../outside.ts", facets: ["schema"] }] }] }, { trackedPaths: [] }),
    /normalized repository path/i,
  );
  assert.throws(
    () => validatePolicy({ ...policy, families: [{ ...policy.families[0], implementationRules: [{ kind: "PREFIX", value: "lib/escape/", facets: ["schema"] }] }] }, { trackedPaths: ["lib/escape/file.ts"], rootDirectory: fixture.root }),
    /symbolic link|escapes repository/i,
  );
});

test("the repository policy is closed and covers every tracked path", async () => {
  const raw = await readFile("governance/contract-doc-ownership.v1.json", "utf8");
  const repositoryPolicy = parseStrictJson(raw, "contract documentation ownership policy");
  const trackedPaths = runGit(process.cwd(), ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\u0000").filter(Boolean);
  const report = validatePolicy(repositoryPolicy, { rootDirectory: process.cwd(), trackedPaths });
  assert.equal(report.trackedPaths, trackedPaths.length);
  assert.equal(report.unclassifiedPaths.length, 0);
  assert.equal(report.blockedUnmappedPaths.length, 0);
});

test("the repository policy maps real simulation identities to their exact owners and facets", async () => {
  const repositoryPolicy = parseStrictJson(
    await readFile("governance/contract-doc-ownership.v1.json", "utf8"),
    "contract documentation ownership policy",
  );
  const family = (id) => repositoryPolicy.families.find((candidate) => candidate.id === id);
  const exactRule = (owner, path) => owner.implementationRules.find((rule) => rule.kind === "EXACT" && rule.value === path);
  const prefixRule = (owner, path) => owner.implementationRules.find((rule) => rule.kind === "PREFIX" && rule.value === path);
  const ruleMatches = (rule, path) => rule.kind === "EXACT" ? rule.value === path : path.startsWith(rule.value);
  const ownersOf = (path) => repositoryPolicy.families.filter((owner) => [
    ...owner.implementationRules,
    ...owner.testRules,
    ...owner.generatedGroups.flatMap((group) => [...group.outputRules, ...group.inputRules, ...group.generatorRules]),
  ].some((rule) => ruleMatches(rule, path)));
  const requiredSections = (owner, path) => {
    const facets = new Set([...owner.implementationRules, ...owner.testRules]
      .filter((rule) => ruleMatches(rule, path)).flatMap((rule) => rule.facets));
    return owner.owningSections.filter((section) => section.facets.some((facet) => facets.has(facet)))
      .map((section) => section.sectionId).sort();
  };
  const browserWorker = family("BROWSER_WORKER_PROTOCOL");
  const securitySavedRuns = family("SECURITY_SAVED_RUNS");
  const securityCatalog = family("SECURITY_CATALOG_BASEMAP");
  const securityResponse = family("SECURITY_BROWSER_RESPONSE");
  const securityDelivery = family("SECURITY_DELIVERY_RUNTIME");
  const delivery = family("DELIVERY_CONTRACT_GOVERNANCE");
  const modelPack = family("MODEL_PACK_COMPILER_RESOLVER");
  const engine = family("ENGINE_ABI_RUNTIME");
  const genericAam = family("GENERIC_AAM_VERIFICATION");
  const tp1538Aero = family("TP1538_AERO_VERIFICATION");
  const genericSensorSources = family("EVIDENCE_GENERIC_SENSOR_SOURCE_FREEZE");
  const physics = family("SIMULATION_PHYSICS_RUNTIME");
  const vsr = family("RECORD_VSR_PERSISTENCE");
  const geospatial = family("GEOSPATIAL_ENVIRONMENT");
  const scenarioKernel = family("SCENARIO_COMPOSITION_KERNEL");
  const mission = family("MISSION_SCENARIO_RUNTIME");
  const persistence = family("PERSISTENCE_DATABASE_SCHEMA");
  const capabilities = family("CAPABILITY_DESCRIPTORS_SELECTORS");
  const evidence = family("EVIDENCE_RAW_DERIVATIVE_STORAGE");
  const contentComments = family("CONTENT_COMMENTS");
  const uiAuthoring = family("UI_AUTHORING");
  const uiObserve = family("UI_OBSERVE");
  const uiPresentation = family("UI_PRESENTATION_SEMANTICS");
  const uiResponsive = family("UI_RESPONSIVE_INTERACTION");
  const observability = family("OBSERVABILITY_OPERATIONS");

  assert.equal(browserWorker.implementationRules.some((rule) => rule.kind === "PREFIX" && rule.value === "worker/"), false);
  assert.equal(securityDelivery.implementationRules.some((rule) => rule.kind === "PREFIX" && rule.value === "lib/security/"), false);
  assert.deepEqual(exactRule(securitySavedRuns, "lib/security/saved-run.ts").facets, ["admission", "digest", "storage", "validity"]);
  assert.deepEqual(exactRule(securitySavedRuns, "lib/security/saved-run-admission.ts").facets, ["admission", "storage", "validity"]);
  assert.deepEqual(requiredSections(securitySavedRuns, "lib/security/saved-run.ts"), ["SECURITY_SAVED_RUNS"]);
  assert.deepEqual(ownersOf("lib/security/saved-run.ts").map((owner) => owner.id), ["RECORD_VSR_PERSISTENCE", "SECURITY_SAVED_RUNS"]);
  assert.deepEqual(exactRule(securityCatalog, "lib/security/basemap-tiles.ts").facets, ["admission", "validity"]);
  assert.deepEqual(requiredSections(securityCatalog, "lib/security/basemap-tiles.ts"), ["SECURITY_CATALOG_BASEMAP_RELAY"]);
  assert.deepEqual(ownersOf("lib/security/admission-policy.ts").map((owner) => owner.id), ["SECURITY_SAVED_RUNS", "SECURITY_CATALOG_BASEMAP"]);
  assert.deepEqual(exactRule(securityResponse, "lib/security/browser-response.ts").facets, ["admission", "validity"]);
  assert.deepEqual(exactRule(securityResponse, "worker/index.ts").facets, ["admission", "validity"]);
  assert.deepEqual(requiredSections(securityResponse, "worker/index.ts"), ["SECURITY_RESPONSE_BASELINE"]);
  assert.deepEqual(requiredSections(securityDelivery, "scripts/start-production.mjs"), ["SECURITY_DELIVERY_TRUST"]);
  for (const path of ["app/api/runs/route.ts", "app/api/health/route.ts", "db/migrations/012_saved_run_lifecycle_admission.sql"]) {
    assert.notEqual(exactRule(securitySavedRuns, path), undefined, `${path} must own the saved-run security boundary`);
    assert.deepEqual(requiredSections(securitySavedRuns, path), ["SECURITY_SAVED_RUNS"]);
  }
  for (const path of ["app/api/catalog/route.ts", "db/migrations/011_public_api_admission.sql"]) {
    assert.notEqual(exactRule(securityCatalog, path), undefined, `${path} must own the catalog/basemap security boundary`);
    assert.deepEqual(requiredSections(securityCatalog, path), ["SECURITY_CATALOG_BASEMAP_RELAY"]);
  }
  assert.deepEqual(ownersOf("db/schema.ts").map((owner) => owner.id), ["PERSISTENCE_DATABASE_SCHEMA"]);
  assert.deepEqual(ownersOf("db/schema/model-pack.ts").map((owner) => owner.id), ["MODEL_PACK_COMPILER_RESOLVER", "PERSISTENCE_DATABASE_SCHEMA"]);
  assert.deepEqual(ownersOf("db/schema/vector-record.ts").map((owner) => owner.id), ["PERSISTENCE_DATABASE_SCHEMA", "RECORD_VSR_PERSISTENCE"]);
  assert.deepEqual(ownersOf("db/schema/saved-run-admission.ts").map((owner) => owner.id), ["PERSISTENCE_DATABASE_SCHEMA", "RECORD_VSR_PERSISTENCE", "SECURITY_SAVED_RUNS"]);
  assert.deepEqual(ownersOf("db/schema/public-api-admission.ts").map((owner) => owner.id), ["PERSISTENCE_DATABASE_SCHEMA", "SECURITY_CATALOG_BASEMAP"]);
  assert.deepEqual(ownersOf("db/schema/blog-comments.ts").map((owner) => owner.id), ["PERSISTENCE_DATABASE_SCHEMA", "CONTENT_COMMENTS"]);
  const changelogHeadings = repositoryPolicy.families.flatMap((owner) => owner.migrationSections)
    .filter((section) => section.path === "CHANGELOG.md")
    .map((section) => section.heading);
  assert.equal(new Set(changelogHeadings).size, changelogHeadings.length, "each changelog-owning family must have a distinct section");
  assert.deepEqual(exactRule(scenarioKernel, "lib/scenario-kernel.ts").facets, ["admission", "digest", "schema", "ui"]);
  assert.deepEqual(requiredSections(scenarioKernel, "lib/scenario-kernel.ts"), ["SCENARIO_COMPOSITION_KERNEL_CONTRACT"]);
  assert.deepEqual(ownersOf("lib/scenario-kernel.ts").map((owner) => owner.id), ["SCENARIO_COMPOSITION_KERNEL"]);
  assert.deepEqual(
    ownersOf("scripts/lib/generic-sensor-network-deny.cjs").map((owner) => owner.id),
    [genericSensorSources.id],
  );
  for (const rendererPath of [
    "scripts/install-pinned-poppler-ubuntu.sh",
    "scripts/pinned-pdftoppm-wrapper.sh.in",
    "scripts/pinned-poppler-ubuntu.Dockerfile",
  ]) {
    assert.deepEqual(ownersOf(rendererPath).map((owner) => owner.id), [genericSensorSources.id]);
  }
  assert.deepEqual(
    requiredSections(genericSensorSources, "scripts/lib/generic-sensor-network-deny.cjs"),
    [
      "GENERIC_SENSOR_SOURCE_CATALOG_BOUNDARY",
      "GENERIC_SENSOR_SOURCE_INFORMATION_BOUNDARY",
      "GENERIC_SENSOR_SOURCE_MODEL_PACK_BOUNDARY",
      "GENERIC_SENSOR_SOURCE_PHYSICS_BOUNDARY",
      "GENERIC_SENSOR_SOURCE_SECURITY_BOUNDARY",
      "GENERIC_SENSOR_SOURCE_TESTING_BOUNDARY",
    ],
  );
  assert.equal(exactRule(securitySavedRuns, "app/api/blog-comments/route.ts"), undefined);
  assert.deepEqual(exactRule(contentComments, "app/api/blog-comments/route.ts").facets, ["admission", "storage", "validity"]);
  assert.deepEqual(requiredSections(contentComments, "app/api/blog-comments/route.ts"), ["CONTENT_COMMENTS"]);
  assert.deepEqual(requiredSections(contentComments, "db/migrations/008_blog_post_comments.sql"), ["CONTENT_COMMENTS"]);
  assert.deepEqual(exactRule(contentComments, "db/schema/blog-comments.ts").facets, ["schema", "storage"]);
  assert.deepEqual(exactRule(contentComments, "components/BlogShareAndComments.tsx").facets, ["admission", "storage", "ui", "validity"]);
  assert.deepEqual(requiredSections(contentComments, "components/BlogShareAndComments.tsx"), ["CONTENT_COMMENTS"]);
  for (const path of ["scripts/build-runtime-bundles.mjs", "scripts/run-managed-server.mjs"]) {
    assert.equal(exactRule(browserWorker, path), undefined, `${path} is not simulation-Worker authority`);
  }
  assert.deepEqual(exactRule(delivery, "scripts/build-runtime-bundles.mjs").facets, ["delivery", "runtime"]);
  assert.deepEqual(exactRule(delivery, "scripts/run-managed-server.mjs").facets, ["delivery", "verification"]);
  assert.deepEqual(exactRule(modelPack, "lib/canonical-json.ts").facets, ["digest", "schema"]);
  for (const path of ["lib/model-pack.ts", "engine-rust/src/model_pack.rs"]) {
    assert.deepEqual(exactRule(modelPack, path).facets, ["admission", "datum", "digest", "evidence", "runtime", "schema", "unit", "validity"]);
  }
  for (const sectionId of [
    "MODEL_PACK_SOURCE_DEFINITION",
    "MODEL_PACK_SCHEMAS",
    "MODEL_PACK_COMPILATION",
    "MODEL_PACK_INTENDED_USE",
    "MODEL_PACK_BINDING",
    "MODEL_PACK_ARTIFACT_BOUNDARIES",
    "MODEL_PACK_LOADOUT_COMPATIBILITY",
    "MODEL_PACK_CURRENT_REFERENCE",
    "MODEL_PACK_CONSUMPTION_RULES",
  ]) {
    assert.equal(modelPack.owningSections.some((section) => section.sectionId === sectionId), true, `${sectionId} must remain owned`);
  }
  for (const registryPath of [
    "governance/aircraft-evidence-registry.v1.json",
    "governance/aircraft-evidence-registry.v2.json",
  ]) {
    assert.deepEqual(exactRule(evidence, registryPath).facets, ["admission", "evidence", "validity"]);
  }
  assert.deepEqual(exactRule(capabilities, "lib/runtime/deployment-capabilities.ts").facets, ["admission", "evidence"]);
  assert.deepEqual(exactRule(evidence, "lib/validation/public-aircraft-reference.ts").facets, ["admission", "verification"]);
  assert.deepEqual(exactRule(evidence, "scripts/verify-public-aircraft-reference.mjs").facets, ["admission", "verification"]);
  assert.deepEqual(exactRule(evidence, "fixtures/public-reference/nasa-nesc-2015-f16-case11.json").facets, ["evidence", "verification"]);
  assert.equal(prefixRule(evidence, "fixtures/public-reference/"), undefined);
  assert.deepEqual(exactRule(evidence, "lib/object-catalog.ts").facets, ["schema"]);
  assert.deepEqual(ownersOf("lib/object-catalog.ts").map((owner) => owner.id), ["EVIDENCE_RAW_DERIVATIVE_STORAGE", "MISSION_SCENARIO_RUNTIME"]);
  assert.deepEqual(requiredSections(evidence, "lib/object-catalog.ts"), ["EVIDENCE_FIXED_DEVELOPMENT_FIXTURE"]);
  assert.deepEqual(exactRule(evidence, "engine-rust/src/public_aircraft_reference.rs").facets, ["verification"]);

  assert.deepEqual(exactRule(vsr, "lib/runtime/digest.ts").facets, ["digest", "vsr"]);
  for (const path of ["lib/engine/simulation-events.ts", "engine-rust/src/simulation_events.rs"]) {
    assert.deepEqual(exactRule(vsr, path).facets, ["digest", "schema", "vsr"]);
  }
  for (const path of ["lib/engine/core.ts", "lib/engine/track-store.ts", "engine-rust/src/lib.rs"]) {
    assert.notEqual(exactRule(physics, path), undefined, `${path} must have a physics contract owner`);
  }
  assert.equal(
    physics.owningSections.some((section) => section.path === "docs/physics-model.md" && section.heading === "## Integrated model"),
    true,
  );

  assert.equal(engine.implementationRules.some((rule) => rule.kind === "PREFIX" && rule.value === "lib/validation/"), false);
  assert.equal(engine.implementationRules.some((rule) => rule.value.includes("generic-aam")), false);
  for (const path of [
    "lib/validation/generic-aam-verification.ts",
    "lib/validation/generic-aam-verification-wasm.ts",
  ]) {
    assert.deepEqual(exactRule(genericAam, path).facets, ["datum", "unit", "verification"]);
  }
  for (const path of ["lib/validation/capacity-baseline.ts", "lib/validation/track-store-capacity.ts"]) {
    assert.deepEqual(exactRule(engine, path).facets, ["verification"]);
  }
  assert.deepEqual(exactRule(genericAam, "lib/validation/generated/generic-aam-verifier-wasm.ts").facets, ["digest", "verification"]);
  assert.deepEqual(prefixRule(genericAam, "verification-rust/generic-aam/").facets, ["datum", "digest", "schema", "unit", "verification"]);
  assert.deepEqual(exactRule(genericAam, "scripts/lib/generic-aam-performance-evidence.mjs").facets, ["verification"]);
  assert.deepEqual(
    genericAam.testRules.find((rule) => rule.value === "tests/generic-aam-performance-evidence.test.mjs").facets,
    ["verification"],
  );
  assert.deepEqual(prefixRule(tp1538Aero, "verification-rust/tp1538-aero/").facets, ["datum", "digest", "schema", "unit", "validity", "verification"]);
  assert.deepEqual(exactRule(tp1538Aero, "scripts/finalize-tp1538-aero-corpus.mjs").facets, ["admission", "digest", "evidence", "schema", "verification"]);
  assert.deepEqual(exactRule(tp1538Aero, "scripts/apply-tp1538-manual-entries.mjs").facets, ["admission", "evidence", "schema", "verification"]);
  assert.deepEqual(exactRule(tp1538Aero, "scripts/freeze-tp1538-transcription.mjs").facets, ["admission", "digest", "evidence", "schema", "verification"]);
  assert.deepEqual(exactRule(tp1538Aero, "scripts/workers/tp1538-aero-verification.worker.ts").facets, ["admission", "schema", "verification"]);
  assert.deepEqual(exactRule(tp1538Aero, "scripts/lib/tp1538-aero-performance-evidence.mjs").facets, ["digest", "verification"]);
  assert.deepEqual(exactRule(tp1538Aero, "governance/nasa-tp1538-generic-f16-aero-verification-corpus.v1.json").facets, ["admission", "datum", "digest", "evidence", "schema", "unit", "validity", "verification"]);
  assert.deepEqual(exactRule(tp1538Aero, "fixtures/public-reference/nasa-tp1538-aero/workload.v1.json").facets, ["datum", "digest", "verification"]);
  assert.deepEqual(exactRule(tp1538Aero, "scripts/benchmark-tp1538-aero.mjs").facets, ["digest", "verification"]);
  assert.deepEqual(exactRule(tp1538Aero, "lib/validation/tp1538-aero-verification-wasm.ts").facets, ["datum", "digest", "schema", "unit", "validity", "verification"]);
  assert.deepEqual(tp1538Aero.testRules.find((rule) => rule.value === "tests/tp1538-aero-performance-evidence.test.mjs").facets, ["digest", "verification"]);
  assert.deepEqual(tp1538Aero.testRules.find((rule) => rule.value === "tests/tp1538-aero-reference.test.mjs").facets, ["admission", "datum", "digest", "evidence", "schema", "unit", "validity", "verification", "vsr"]);
  assert.deepEqual(
    tp1538Aero.generatedGroups.map(({ id }) => id),
    ["TP1538_RUST_SCHEMA", "TP1538_AERO_VERIFIER_WASM", "TP1538_AERO_PERFORMANCE_WORKLOAD"],
  );
  assert.equal(
    tp1538Aero.migrationSections.some((section) => section.sectionId === "TP1538_AERO_CHANGE_RECORD" && section.path === "docs/tp1538-aero-verification.md"),
    true,
  );

  const generated = genericAam.generatedGroups.find((group) => group.id === "GENERIC_AAM_VERIFIER_WASM");
  assert.deepEqual(generated.outputRules, [{
    kind: "EXACT",
    value: "lib/validation/generated/generic-aam-verifier-wasm.ts",
    facets: ["digest", "verification"],
  }]);
  assert.deepEqual(generated.inputRules, [{
    kind: "PREFIX",
    value: "verification-rust/generic-aam/",
    facets: ["datum", "digest", "schema", "unit", "verification"],
  }]);
  assert.deepEqual(generated.generatorRules, [{
    kind: "EXACT",
    value: "scripts/build-generic-aam-verifier.mjs",
    facets: ["datum", "digest", "schema", "unit", "verification"],
  }]);
  assert.deepEqual(generated.freshnessArgv, ["node", "scripts/build-generic-aam-verifier.mjs", "--check"]);

  assert.equal(geospatial.implementationRules.some((rule) => rule.kind === "PREFIX" && rule.value === "lib/geospatial/"), false);
  assert.deepEqual(exactRule(geospatial, "lib/geospatial/vertical-datums.ts").facets, ["datum"]);
  assert.deepEqual(exactRule(geospatial, "lib/geospatial/terrain.ts").facets, ["validity"]);
  assert.deepEqual(exactRule(geospatial, "lib/scenario-spatial.ts").facets, ["datum", "unit", "ui"]);
  assert.deepEqual(exactRule(geospatial, "lib/study-areas.ts").facets, ["runtime", "schema", "ui"]);
  assert.deepEqual(exactRule(geospatial, "lib/mission-admission.ts").facets, ["runtime", "storage"]);
  assert.deepEqual(exactRule(geospatial, "app/api/catalog/route.ts").facets, ["storage"]);
  for (const sectionId of [
    "GEOSPATIAL_VERTICAL_DATUMS",
    "GEOSPATIAL_SYNTHETIC_MANIFEST",
    "GEOSPATIAL_EXECUTABLE_PACK",
    "GEOSPATIAL_SOURCE_ADMISSION",
    "GEOSPATIAL_TERRAIN_LOS",
    "GEOSPATIAL_VERIFICATION",
    "GEOSPATIAL_SPATIAL_CONTRACT",
    "GEOSPATIAL_CATALOG_SYNTHETIC_IDENTITY",
  ]) assert.equal(geospatial.owningSections.some((section) => section.sectionId === sectionId), true, `${sectionId} must remain owned`);

  assert.deepEqual(exactRule(mission, "lib/information-state.ts").facets, ["runtime", "vsr"]);
  assert.deepEqual(exactRule(mission, "lib/object-catalog.ts").facets, ["schema", "ui"]);
  assert.deepEqual(exactRule(mission, "lib/scenario-spatial.ts").facets, ["schema", "ui"]);
  assert.deepEqual(exactRule(mission, "lib/simulation.ts").facets, ["runtime", "schema", "vsr"]);
  assert.deepEqual(exactRule(mission, "lib/air-mission.ts").facets, ["admission", "datum", "digest", "runtime", "schema", "ui", "unit", "vsr"]);
  assert.deepEqual(mission.testRules.find((rule) => rule.kind === "EXACT" && rule.value === "tests/air-mission.test.mjs").facets, ["admission", "datum", "digest", "runtime", "schema", "storage", "ui", "unit", "verification", "vsr"]);
  assert.deepEqual(requiredSections(mission, "lib/air-mission.ts"), ["MISSION_AIR_MISSION_CONTRACT", "MISSION_BUILDER_EXPANSION", "MISSION_CONTROL_ADMISSION_REGRESSION", "MISSION_RECORD_REPLAY", "MISSION_SCENARIO_ARTIFACT", "MISSION_STATE_MACHINE"]);
  assert.equal(mission.owningSections.some((section) => section.sectionId === "MISSION_INTEGRATED_MODEL"), false);
  assert.equal(mission.owningSections.some((section) => section.sectionId === "MISSION_SPATIAL_CONTRACT"), false);
  assert.deepEqual(requiredSections(mission, "lib/information-state.ts"), ["MISSION_RECORD_REPLAY", "MISSION_STATE_MACHINE"]);
  assert.deepEqual(requiredSections(mission, "lib/scenario-draft.ts"), ["MISSION_BUILDER_EXPANSION", "MISSION_CONTROL_ADMISSION_REGRESSION", "MISSION_SCENARIO_ARTIFACT"]);
  assert.deepEqual(requiredSections(mission, "lib/scenario-spatial.ts"), ["MISSION_BUILDER_EXPANSION", "MISSION_CONTROL_ADMISSION_REGRESSION", "MISSION_SCENARIO_ARTIFACT"]);

  assert.deepEqual(ownersOf("app/lab/page.tsx").map((owner) => owner.id), ["UI_AUTHORING", "UI_OBSERVE", "UI_RESPONSIVE_INTERACTION"]);
  assert.deepEqual(ownersOf("lib/frontend/selectors.ts").map((owner) => owner.id), ["UI_OBSERVE"]);
  assert.deepEqual(ownersOf("tests/frontend-selectors.test.mjs").map((owner) => owner.id), ["UI_OBSERVE"]);
  assert.deepEqual(ownersOf("components/BrowserTelemetry.tsx").map((owner) => owner.id), ["OBSERVABILITY_OPERATIONS"]);
  for (const path of ["components/EngagementMap.tsx", "components/SimulationScene.tsx"]) {
    assert.deepEqual(ownersOf(path).map((owner) => owner.id), ["UI_OBSERVE", "UI_PRESENTATION_SEMANTICS", "UI_RESPONSIVE_INTERACTION"]);
    assert.deepEqual(requiredSections(uiPresentation, path), ["UI_PRODUCT_LANGUAGE", "UI_TACVIEW_SUBSET"]);
    assert.deepEqual(requiredSections(uiResponsive, path), ["UI_RESPONSIVE_BEHAVIOR", "UI_RESPONSIVE_PROOF", "UI_SHARED_OVERLAYS"]);
  }
  assert.deepEqual(ownersOf("components/ui/OverlayPrimitives.tsx").map((owner) => owner.id), ["UI_RESPONSIVE_INTERACTION"]);
  assert.deepEqual(requiredSections(uiResponsive, "components/ui/OverlayPrimitives.tsx"), ["UI_RESPONSIVE_BEHAVIOR", "UI_RESPONSIVE_PROOF", "UI_SHARED_OVERLAYS"]);
  for (const path of ["tests/component/object-picker.test.tsx", "tests/component/overlay-primitives.test.tsx"]) {
    assert.deepEqual(ownersOf(path).map((owner) => owner.id), ["UI_RESPONSIVE_INTERACTION"]);
  }
  assert.deepEqual(requiredSections(uiObserve, "app/lab/page.tsx"), ["UI_OBSERVE_PROOF", "UI_OBSERVE_SHELL"]);
  assert.deepEqual(requiredSections(observability, "components/BrowserTelemetry.tsx"), ["OBSERVABILITY_CONTRACT"]);
  assert.notEqual(exactRule(uiAuthoring, "app/lab/page.tsx"), undefined);

  assert.deepEqual(exactRule(persistence, "db/schema.ts").facets, ["schema"]);
  assert.deepEqual(prefixRule(persistence, "db/schema/").facets, ["schema"]);
  assert.deepEqual(prefixRule(persistence, "db/migrations/").facets, ["schema"]);
  assert.equal(persistence.owningSections.some((section) => section.path === "docs/model-pack-contract.md"), false);
  assert.equal(persistence.owningSections.some((section) => section.path === "docs/security-boundaries.md"), false);
  assert.deepEqual(exactRule(modelPack, "db/migrations/007_model_pack_foundation.sql").facets, ["admission", "schema", "storage"]);
  assert.deepEqual(exactRule(modelPack, "lib/catalog-admission.ts").facets, ["admission", "digest", "schema", "storage"]);
  assert.deepEqual(exactRule(modelPack, "app/api/catalog/route.ts").facets, ["admission", "digest", "schema", "storage"]);
  assert.deepEqual(exactRule(evidence, "lib/catalog-admission.ts").facets, ["evidence"]);
  assert.deepEqual(exactRule(evidence, "app/api/catalog/route.ts").facets, ["evidence"]);
  assert.deepEqual(exactRule(mission, "app/api/catalog/route.ts").facets, ["schema"]);
  assert.equal(requiredSections(modelPack, "lib/catalog-admission.ts").includes("MODEL_PACK_PERSISTENCE"), true);
  assert.equal(exactRule(vsr, "db/migrations/011_public_api_admission.sql"), undefined);
  assert.deepEqual(exactRule(vsr, "db/migrations/012_saved_run_lifecycle_admission.sql").facets, ["admission"]);
  assert.deepEqual(exactRule(vsr, "lib/security/saved-run-admission.ts").facets, ["admission"]);
  assert.deepEqual(requiredSections(vsr, "lib/security/saved-run-admission.ts"), ["VSR_SAVED_RUNS"]);
  assert.deepEqual(vsr.testRules.find((rule) => rule.kind === "EXACT" && rule.value === "tests/runtime-admission-db.test.ts").facets, ["admission"]);
  assert.equal(prefixRule(modelPack, "drizzle/"), undefined);
  assert.equal(prefixRule(vsr, "drizzle/"), undefined);
  assert.deepEqual(ownersOf("fixtures/public-reference/nasa-tm-109057/workload.v5.json").map((owner) => owner.id), ["GENERIC_AAM_VERIFICATION"]);
  assert.deepEqual(ownersOf("governance/environment-sources/nasa-power-hourly-20200115/manifest.v1.json").map((owner) => owner.id), ["GEOSPATIAL_ENVIRONMENT"]);
});
