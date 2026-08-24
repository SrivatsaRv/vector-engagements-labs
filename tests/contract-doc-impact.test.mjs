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
import { declarationTemplate, resolvePolicyBootstrap, resolvePushDeclaration, runRegisteredFreshness, runRegisteredProbe } from "../scripts/verify-contract-doc-impact.mjs";

const sha = (character) => character.repeat(64);
const commitSha = (character) => character.repeat(40);
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
  for (const [path, content] of Object.entries(files)) {
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

test("the classifier identity probe detects a decision outside the former canned matrix", async (t) => {
  const classifierSource = await readFile(resolve("scripts/classify-ci-changes.mjs"), "utf8");
  const helperSource = await readFile(resolve("scripts/lib/contract-doc-impact.mjs"), "utf8");
  const root = await governanceProbeFixture({
    "scripts/classify-ci-changes.mjs": classifierSource,
    "scripts/lib/contract-doc-impact.mjs": helperSource,
    "custom/unregistered-boundary.ts": "export const boundary = true;\n",
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const baseSha = await commit(root, "classifier base");
  await writeFile(
    join(root, "scripts", "classify-ci-changes.mjs"),
    classifierSource.replace("const POLICY_ONLY = [", "const POLICY_ONLY = [\n  /^custom\\//,"),
  );
  const headSha = await commit(root, "silently change an unenumerated classifier boundary");
  const output = execFileSync("node", [
    resolve("scripts/contract-doc-probes/classifier-decision-identity.v1.mjs"),
    "vector.contract-doc-probe.v1",
    root,
    baseSha,
    headSha,
    "DELIVERY_CONTRACT_GOVERNANCE",
    "DELIVERY_CLASSIFIER_DECISION_IDENTITY_V1",
    "INTERNAL_REFACTOR",
  ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const result = JSON.parse(output);
  assert.equal(result.assertions[0].status, "FAIL");
  assert.notEqual(result.assertions[0].beforeSha256, result.assertions[0].afterSha256);
});

test("the required-gate invariant probe detects relaxed review-kind admission", async (t) => {
  const gateSource = await readFile(resolve("scripts/verify-required-gates.mjs"), "utf8");
  const root = await governanceProbeFixture({ "scripts/verify-required-gates.mjs": gateSource });
  t.after(() => rm(root, { recursive: true, force: true }));
  const baseSha = await commit(root, "required gate base");
  await writeFile(
    join(root, "scripts", "verify-required-gates.mjs"),
    gateSource.replace('["slice", "completion-review", "not-applicable"]', '["slice", "completion-review", "not-applicable", "partial"]'),
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
