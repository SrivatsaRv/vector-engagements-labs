import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { declarationTemplate, resolvePolicyBootstrap, resolvePushDeclaration } from "../scripts/verify-contract-doc-impact.mjs";

const sha = (character) => character.repeat(64);
const commitSha = (character) => character.repeat(40);

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
      implementationRules: [{ kind: "EXACT", value: "lib/example.ts", facets: ["schema"] }],
      testRules: [{ kind: "PREFIX", value: "tests/example/", facets: ["verification"] }],
      generatedGroups: [
        {
          id: "EXAMPLE_GENERATED",
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
  await writeFile(join(root, "docs", "example.md"), "# Example\n\n## Contract\n\nVersion one.\n\n## Other\n\nStable.\n");
  await writeFile(join(root, "lib", "example.ts"), "export const value = 1;\n");
  await writeFile(join(root, "tests", "example", "example.test.mjs"), "// fixture\n");
  await writeFile(join(root, "lib", "generated", "example", "value.ts"), "export const generated = 1;\n");
  await writeFile(join(root, "fixtures", "example", "input.json"), "{}\n");
  await writeFile(join(root, "scripts", "generate-example.mjs"), "// fixture\n");
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

test("the generated declaration template is strict and structurally complete", () => {
  assert.doesNotThrow(() => validateDeclaration(declarationTemplate(policy), policy));
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
    /removes (?:contract ownership|family ownership|EXAMPLE\.implementationRules)/i,
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
    /removes EXAMPLE\.owningSections/i,
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

test("generated-only requires unchanged inputs and generator plus the registered direct freshness argv", async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await writeFile(join(fixture.root, "lib", "generated", "example", "value.ts"), "export const generated = 2;\n");
  const headSha = await commit(fixture.root, "generated only");
  const generated = declaration({
    disposition: "GENERATED_ARTIFACT_ONLY",
    evidence: [{ kind: "TEST", value: "node scripts/generate-example.mjs --check" }],
    exemptionEvidence: { kind: "GENERATED_ARTIFACT_ONLY", groupId: "EXAMPLE_GENERATED", freshnessArgv: ["node", "scripts/generate-example.mjs", "--check"] },
  });
  const commands = [];
  assert.equal(verifyContractDocImpact({
    rootDirectory: fixture.root,
    baseSha: fixture.baseSha,
    headSha,
    declaration: generated,
    policy: { ...policy, canonicalSha256: undefined },
    freshnessRunner: (command) => commands.push(command),
  }).state, "VERIFIED");
  assert.deepEqual(commands, [["node", "scripts/generate-example.mjs", "--check"]]);

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

test("refactor, no-semantic-change, and docs-current evidence are discriminated", () => {
  assert.doesNotThrow(() => validateDeclaration(declaration({
    disposition: "INTERNAL_REFACTOR",
    exemptionEvidence: { kind: "INTERNAL_REFACTOR", identities: [{ name: "public-api", beforeSha256: sha("b"), afterSha256: sha("b") }] },
  }), policy));
  assert.throws(() => validateDeclaration(declaration({
    disposition: "INTERNAL_REFACTOR",
    exemptionEvidence: { kind: "NO_SEMANTIC_CHANGE", invariants: [{ name: "behavior", evidence: "focused regression" }] },
  }), policy), /must match disposition/i);
  assert.doesNotThrow(() => validateDeclaration(declaration({
    disposition: "DOCS_ALREADY_CURRENT",
    exemptionEvidence: { kind: "DOCS_ALREADY_CURRENT", sections: [{ ...section, contentSha256: sha("c"), documentedAtCommit: commitSha("d") }] },
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
    exemptionEvidence: { kind: "INTERNAL_REFACTOR", identities: [{ name: "public-api", beforeSha256: sha("b"), afterSha256: sha("b") }] },
  });
  assert.throws(
    () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: refactor, policy: basePolicy }),
    /unavailable without a registered identity probe/i,
  );
  assert.equal(verifyContractDocImpact({
    rootDirectory: fixture.root,
    baseSha: fixture.baseSha,
    headSha,
    declaration: refactor,
    policy: basePolicy,
    identityRunner: () => true,
  }).state, "VERIFIED");

  const noSemantic = declaration({
    disposition: "NO_SEMANTIC_CHANGE",
    exemptionEvidence: { kind: "NO_SEMANTIC_CHANGE", invariants: [{ name: "behavior", evidence: "registered invariant output is byte-identical" }] },
  });
  assert.throws(
    () => verifyContractDocImpact({ rootDirectory: fixture.root, baseSha: fixture.baseSha, headSha, declaration: noSemantic, policy: basePolicy }),
    /unavailable without a registered invariant probe/i,
  );
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
        exemptionEvidence: { kind: "DOCS_ALREADY_CURRENT", sections: [{ ...section, contentSha256, documentedAtCommit: baseSha }] },
      }),
      policy,
    }),
    /not an earlier ancestor/i,
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
