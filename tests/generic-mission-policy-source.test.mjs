import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  loadAndVerifyGenericMissionPolicyGovernance,
  verifyExactBytes,
  verifyGenericMissionPolicyManifest,
  verifyProductionIsolation,
} from "../scripts/lib/generic-mission-policy-source-verifier.mjs";

const governanceRoot = resolve("governance/generic-mission-policy-verification-source");

test("the Stage-0 manifest is canonical, fail-closed, and non-executable", () => {
  const result = loadAndVerifyGenericMissionPolicyGovernance(governanceRoot);
  assert.equal(result.manifest.schemaVersion, "vector.generic-mission-policy-verification-source-manifest.v1");
  assert.equal(result.manifest.intendedUse, "ENGINE_VERIFICATION_ONLY_SOURCE_FREEZE");
  assert.deepEqual(result.manifest.permissions, {
    referenceOnlyExternalVerification: true,
    redistribution: false,
    adaptation: false,
    execution: false,
    runtime: false,
    modelPack: false,
    production: false,
  });
  assert.equal(result.manifest.artifacts.length, 3);
  assert.equal(result.manifest.unresolvedAssumptionClasses.length, 13);
  assert.ok(result.manifest.unresolvedAssumptionClasses.every((entry) => entry.availability === "MODEL_ASSUMPTION" && entry.valuePresent === false));
});

test("all selected bytes are external and the exact-source command cannot skip them", () => {
  const manifest = JSON.parse(readFileSync(join(governanceRoot, "manifest.v1.json"), "utf8"));
  for (const artifact of manifest.artifacts) {
    assert.equal(artifact.pdf.repositoryPath, null);
    if (artifact.metadata) assert.equal(artifact.metadata.repositoryPath, null);
  }
  const result = spawnSync(process.execPath, ["--require", "./scripts/lib/generic-sensor-network-deny.cjs", "scripts/verify-generic-mission-policy-source.mjs"], {
    cwd: resolve("."),
    encoding: "utf8",
    env: { ...process.env, VECTOR_GENERIC_MISSION_POLICY_SOURCE_DIR: "" },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /VECTOR_GENERIC_MISSION_POLICY_SOURCE_DIR|--source-dir/u);
});

test("the source gate is deny-all and has no download path", () => {
  const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
  assert.match(packageJson.scripts["generic-mission-policy:sources:verify"], /generic-sensor-network-deny\.cjs/u);
  const commandSource = readFileSync(resolve("scripts/verify-generic-mission-policy-source.mjs"), "utf8");
  const verifierSource = readFileSync(resolve("scripts/lib/generic-mission-policy-source-verifier.mjs"), "utf8");
  assert.doesNotMatch(`${commandSource}\n${verifierSource}`, /(?:from\s+["']node:(?:http|https|net|dns)|\bfetch\s*\()/u);
  const guarded = spawnSync(process.execPath, [
    "--require",
    "./scripts/lib/generic-sensor-network-deny.cjs",
    "--input-type=module",
    "-e",
    "await fetch('https://example.invalid/source.pdf')",
  ], { cwd: resolve("."), encoding: "utf8" });
  assert.notEqual(guarded.status, 0);
  assert.match(guarded.stderr, /network|disabled|blocked|deny/i);
});

test("exact-byte admission rejects changed, truncated, swapped, and symlinked inputs", () => {
  const expected = { byteLength: 4, sha256: "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a" };
  assert.doesNotThrow(() => verifyExactBytes(Buffer.from([1, 2, 3, 4]), expected, "fixture"));
  assert.throws(() => verifyExactBytes(Buffer.from([1, 2, 3, 5]), expected, "fixture"), /SHA-256/u);
  assert.throws(() => verifyExactBytes(Buffer.from([4, 3, 2, 1]), expected, "swapped fixture"), /SHA-256/u);
  assert.throws(() => verifyExactBytes(Buffer.from([1, 2, 3]), expected, "fixture"), /byte length/u);

  const scratch = mkdtempSync(join(tmpdir(), "vector-mission-source-symlink-"));
  const outside = join(scratch, "outside.pdf");
  const linked = join(scratch, "linked.pdf");
  writeFileSync(outside, "outside");
  symlinkSync(outside, linked);
  assert.throws(() => verifyExactBytes(linked, { byteLength: 7, sha256: "31207eb20c7963fdec4e9bb8c5a78f2513c48377d276ec33b0f77b7bf3b69c93" }, "linked"), /non-symlink/u);
  rmSync(scratch, { recursive: true, force: true });
});

test("manifest tamper cannot forge roles, rights, decisions, or executable policy", () => {
  const manifest = JSON.parse(readFileSync(join(governanceRoot, "manifest.v1.json"), "utf8"));
  const cases = [
    [(candidate) => { candidate.artifacts[0].role = candidate.artifacts[1].role; }, /role/u],
    [(candidate) => { candidate.artifacts[0].rightsFacts.determinationType = "OPEN_SOURCE"; }, /rights/u],
    [(candidate) => { candidate.artifacts[0].decisions.redistributionDecision.value = "AUTHORIZED"; }, /decision|redistribution/u],
    [(candidate) => { candidate.artifacts[0].decisions.redistributionDecision.authorityKind = "LEGAL_APPROVAL"; }, /decision authority|decision/u],
    [(candidate) => { candidate.permissions.runtime = true; }, /permission/u],
    [(candidate) => { candidate.artifacts[0].pdf.sha256 = candidate.rejectedAlternates[0].sha256; }, /PDF identity/u],
    [(candidate) => { candidate.artifacts[0].pdf.pageCount = 15; }, /PDF identity/u],
    [(candidate) => { candidate.artifacts[0].pageMaps[0].pdfPage = 3; }, /page map/u],
    [(candidate) => { candidate.artifacts[2].pageMaps[0].printedPage = "7-1"; }, /page map/u],
    [(candidate) => { candidate.artifacts[0].pageMaps[0].eligibleClaim = "Combat engagement action policy"; }, /civil|prohibited|claim/u],
    [(candidate) => { candidate.artifacts[0].pageMaps[0].eligibleClaim = "F16_ACTION_POLICY"; }, /named-platform|action authority/u],
    [(candidate) => { candidate.excludedSources[2].availability = "REFERENCE_ONLY"; }, /permanently ineligible/u],
    [(candidate) => { candidate.executablePolicy = { cadenceSeconds: 3 }; }, /exact keys|executable/u],
  ];
  for (const [mutate, expected] of cases) {
    const candidate = structuredClone(manifest);
    mutate(candidate);
    candidate.canonicalDigest = "0".repeat(64);
    assert.throws(() => verifyGenericMissionPolicyManifest(candidate), expected);
  }
});

test("production and every runtime fixture subtree reject source promotion", () => {
  assert.ok(verifyProductionIsolation(resolve(".")) > 0);
  for (const path of [
    "app/forbidden.tsx",
    "components/forbidden.tsx",
    "lib/engine/forbidden.ts",
    "server/forbidden.ts",
    "worker/forbidden.ts",
    "engine-rust/src/forbidden.rs",
    "public/forbidden.js",
    "dist/forbidden.js",
    "fixtures/model-packs/forbidden.json",
    "fixtures/vector-record/forbidden.json",
    "fixtures/public-reference/forbidden.json",
    "fixtures/performance/forbidden.json",
  ]) {
    const scratch = mkdtempSync(join(tmpdir(), "vector-mission-source-isolation-"));
    mkdirSync(join(scratch, path, ".."), { recursive: true });
    writeFileSync(join(scratch, path), "vector.generic-mission-policy-verification-source-manifest.v1");
    assert.throws(() => verifyProductionIsolation(scratch), /production|runtime fixture|source-only/u, path);
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("governance contains no external source, render, crop, or derived-table bytes", () => {
  const entries = readdirSync(governanceRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
  assert.ok(entries.length > 0);
  assert.ok(entries.every((path) => /\.(?:json|md)$/u.test(path)), entries.join("\n"));
  assert.ok(entries.every((path) => !/(?:\.pdf|\.png|\.zip|\/raw\/|\/renders?\/|\/crops?\/|\/derived\/)/u.test(path)));
});
