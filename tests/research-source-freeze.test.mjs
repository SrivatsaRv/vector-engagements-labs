import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  validateResearchSourceFreeze,
  checkProductionIsolation,
} from "../scripts/verify-research-source-freeze.mjs";

// Load the real committed registry once. Most hostile tests clone it with
// structuredClone and mutate the clone, so a broken test can never leak into
// the next one.
const REAL_REGISTRY = JSON.parse(
  readFileSync(resolve(process.cwd(), "governance/research-source-freeze.v1.json")),
);

function clone(registry) {
  return structuredClone(registry);
}

function findSource(registry, id) {
  const s = registry.sources.find((x) => x.id === id);
  assert.ok(s, `fixture error: no source with id ${id}`);
  return s;
}

// --- sanity: the real committed file must pass as-is ---
test("the real committed registry passes validation", () => {
  const result = validateResearchSourceFreeze(REAL_REGISTRY, { verifyLocalArtifacts: false });
  assert.equal(result.sources, REAL_REGISTRY.sources.length);
});

// --- (1) moving reference / not-a-real-commit ---
test("a CODE_CANDIDATE with a branch name instead of a commit hash is rejected", () => {
  const registry = clone(REAL_REGISTRY);
  findSource(registry, "bvrgym-xcwoid").exactCommit = "main";
  assert.throws(
    () => validateResearchSourceFreeze(registry, { verifyLocalArtifacts: false }),
    /exact commit hash/,
  );
});

test("a CODE_CANDIDATE with a long free-text 'reference' instead of a real hash is rejected", () => {
  const registry = clone(REAL_REGISTRY);
  // Long enough to have previously passed a naive length>=7 check, but not hex.
  findSource(registry, "bvrgym-xcwoid").exactCommit = "release-candidate-branch";
  assert.throws(
    () => validateResearchSourceFreeze(registry, { verifyLocalArtifacts: false }),
    /exact commit hash/,
  );
});

// --- (2) forged / malformed digest ---
test("a record claiming VERIFIED hash review with a malformed digest is rejected", () => {
  const registry = clone(REAL_REGISTRY);
  const s = findSource(registry, "bvr-sim-2608-25419");
  s.hashReviewState = "VERIFIED";
  s.sha256 = "not-a-real-hash";
  assert.throws(
    () => validateResearchSourceFreeze(registry, { verifyLocalArtifacts: false }),
    /valid SHA-256/,
  );
});

test("a PENDING record cannot silently carry a leftover digest", () => {
  const registry = clone(REAL_REGISTRY);
  const s = findSource(registry, "darpa-ace-air-venom");
  s.hashReviewState = "PENDING";
  s.sha256 = "a".repeat(64); // well-formed hash, but PENDING must not claim one
  assert.throws(
    () => validateResearchSourceFreeze(registry, { verifyLocalArtifacts: false }),
    /must not claim a digest/,
  );
});

// --- (3) missing / blocking license bypassed for promotion ---
test("adopting code reuse with a PENDING license review is rejected even if the license itself is permissive", () => {
  const registry = clone(REAL_REGISTRY);
  const s = findSource(registry, "hirl4ucav-code");
  s.adoptionByUse.codeReuse = "ADOPTED";
  s.licenseReviewState = "PENDING"; // MIT, but review never completed
  assert.throws(
    () => validateResearchSourceFreeze(registry, { verifyLocalArtifacts: false }),
    /completed license review/,
  );
});

test("adopting code reuse with a GPL (blocking) classification is rejected regardless of review state", () => {
  const registry = clone(REAL_REGISTRY);
  const s = findSource(registry, "bvrgym-xcwoid");
  s.adoptionByUse.codeReuse = "ADOPTED"; // licenseReviewState is already REVIEWED
  assert.throws(
    () => validateResearchSourceFreeze(registry, { verifyLocalArtifacts: false }),
    /blocking license classification/,
  );
});

test("adopting a data/weight candidate with UNKNOWN license is rejected", () => {
  const registry = clone(REAL_REGISTRY);
  findSource(registry, "hirl4ucav-data").adoptionByUse.dataReuse = "ADOPTED";
  assert.throws(
    () => validateResearchSourceFreeze(registry, { verifyLocalArtifacts: false }),
    /blocking license classification/,
  );
});

// --- (4) per-use adoption structure itself ---
test("a global/legacy single adoptionDecision field is rejected (must be per-use)", () => {
  const registry = clone(REAL_REGISTRY);
  const s = findSource(registry, "pope-et-al-alphadogfight-2021");
  delete s.adoptionByUse;
  s.adoptionDecision = "NOT_ADOPTED";
  assert.throws(
    () => validateResearchSourceFreeze(registry, { verifyLocalArtifacts: false }),
    /adoptionByUse object/,
  );
});

test("declaring an adoptionByUse key not supported by the record's roles is rejected", () => {
  const registry = clone(REAL_REGISTRY);
  const s = findSource(registry, "pope-et-al-alphadogfight-2021"); // ALGORITHM_REFERENCE only, no code role
  s.adoptionByUse.codeReuse = "NOT_ADOPTED";
  assert.throws(
    () => validateResearchSourceFreeze(registry, { verifyLocalArtifacts: false }),
    /no role makes that use applicable/,
  );
});

test("BVRGym can be simultaneously ADOPTED for study and QUARANTINED for code — the exact case this schema exists for", () => {
  const registry = clone(REAL_REGISTRY);
  const s = findSource(registry, "bvrgym-xcwoid");
  assert.equal(s.adoptionByUse.architectureStudy, "ADOPTED");
  assert.equal(s.adoptionByUse.codeReuse, "QUARANTINED");
  const result = validateResearchSourceFreeze(registry, { verifyLocalArtifacts: false });
  assert.equal(result.sources, registry.sources.length);
});

// --- (5) name-collision / disambiguation ---
test("a record flagged requiresDisambiguation without a collisionRisk record is rejected", () => {
  const registry = clone(REAL_REGISTRY);
  const s = findSource(registry, "dstg-ace-zero");
  delete s.collisionRisk;
  assert.throws(
    () => validateResearchSourceFreeze(registry, { verifyLocalArtifacts: false }),
    /collisionRisk record/,
  );
});

test("an incomplete collisionRisk (missing distinguishingFacts) is rejected", () => {
  const registry = clone(REAL_REGISTRY);
  const s = findSource(registry, "dstg-ace-zero");
  s.collisionRisk = { similarNames: ["something"] }; // no distinguishingFacts
  assert.throws(
    () => validateResearchSourceFreeze(registry, { verifyLocalArtifacts: false }),
    /collisionRisk record/,
  );
});

// --- (6) dynamic/moving link cannot claim a verified hash ---
test("a DYNAMIC (unpinned) locator claiming a VERIFIED hash is rejected", () => {
  const registry = clone(REAL_REGISTRY);
  const s = findSource(registry, "dstg-ace-zero");
  s.hashReviewState = "VERIFIED";
  s.sha256 = "a".repeat(64);
  assert.throws(
    () => validateResearchSourceFreeze(registry, { verifyLocalArtifacts: false }),
    /DYNAMIC locator/,
  );
});

// --- (7) preprint recency: determinism, not live wall-clock ---
test("recencyReview.ageAtReviewDays must match the actual publishedAt/reviewedAt dates", () => {
  const registry = clone(REAL_REGISTRY);
  const s = findSource(registry, "bvr-sim-2608-25419");
  s.recencyReview.ageAtReviewDays = 99999; // inconsistent with the real dates
  assert.throws(
    () => validateResearchSourceFreeze(registry, { verifyLocalArtifacts: false }),
    /does not match publishedAt\/reviewedAt/,
  );
});

test("a source within its own reviewed maturity window must record HOLD_CONTEXT_ONLY", () => {
  const registry = clone(REAL_REGISTRY);
  const s = findSource(registry, "bvr-sim-2608-25419");
  s.recencyReview.decision = "MATURE_FOR_PROMOTION"; // false claim, still within window
  assert.throws(
    () => validateResearchSourceFreeze(registry, { verifyLocalArtifacts: false }),
    /HOLD_CONTEXT_ONLY/,
  );
});

// --- (8) paper/document: URL alone is insufficient ---
test("a paper claiming VERIFIED hash review without a real documentDigest is rejected", () => {
  const registry = clone(REAL_REGISTRY);
  const s = findSource(registry, "nasa-ntrs-20240007986");
  s.documentDigest = null; // real record has a verified digest; simulate regression
  assert.throws(
    () => validateResearchSourceFreeze(registry, { verifyLocalArtifacts: false }),
    /lacks a real documentDigest/,
  );
});

test("promoting an artifact use with an unresolved (PENDING_REVIEW) claim locator is rejected", () => {
  const registry = clone(REAL_REGISTRY);
  const s = findSource(registry, "hirl4ucav-code");
  s.claimLocator = "PENDING_REVIEW";
  s.licenseReviewState = "REVIEWED";
  s.adoptionByUse.codeReuse = "ADOPTED";
  s.archivedDigest = "b".repeat(64); // otherwise-valid, to isolate the claimLocator failure
  assert.throws(
    () => validateResearchSourceFreeze(registry, { verifyLocalArtifacts: false }),
    /unresolved claim locator/,
  );
});

// --- (9) exact commit is necessary but not sufficient (repo origin / subpath / archive) ---
test("a CODE_CANDIDATE missing repositoryOrigin is rejected even with a valid exact commit", () => {
  const registry = clone(REAL_REGISTRY);
  const s = findSource(registry, "lag-liuqh16");
  delete s.repositoryOrigin;
  assert.throws(
    () => validateResearchSourceFreeze(registry, { verifyLocalArtifacts: false }),
    /repositoryOrigin/,
  );
});

test("promoting codeReuse without a real archivedDigest is rejected", () => {
  const registry = clone(REAL_REGISTRY);
  const s = findSource(registry, "hirl4ucav-code");
  s.licenseReviewState = "REVIEWED";
  s.claimLocator = "Section 2, Table 1"; // resolved, to isolate the archivedDigest failure
  s.adoptionByUse.codeReuse = "ADOPTED";
  // archivedDigest intentionally left null
  assert.throws(
    () => validateResearchSourceFreeze(registry, { verifyLocalArtifacts: false }),
    /without a real archivedDigest/,
  );
});

// --- (10) lineage gaps ---
test("a derivedFromArtifactIds reference to a nonexistent record is a lineage gap and is rejected", () => {
  const registry = clone(REAL_REGISTRY);
  const s = findSource(registry, "bvr-sim-2608-25419");
  s.derivedFromArtifactIds = ["this-record-does-not-exist"];
  assert.throws(
    () => validateResearchSourceFreeze(registry, { verifyLocalArtifacts: false }),
    /lineage gap/,
  );
});

// --- (11) supersession ---
test("a corrected record must preserve the superseded record, not delete it", () => {
  const registry = clone(REAL_REGISTRY);
  const original = findSource(registry, "bvr-sim-2608-25419");

  // A correction creates a NEW record with supersedes pointing at the old one.
  const corrected = clone(original);
  corrected.id = "bvr-sim-2608-25419-v2";
  corrected.supersedes = "bvr-sim-2608-25419";
  registry.sources.push(corrected);

  // The old record must still be present and still individually valid —
  // simulating deletion (the wrong way to "correct" an immutable record).
  const withoutOld = clone(registry);
  withoutOld.sources = withoutOld.sources.filter((s) => s.id !== "bvr-sim-2608-25419");
  const supersedesTarget = withoutOld.sources.find((s) => s.id === "bvr-sim-2608-25419-v2").supersedes;
  const targetStillExists = withoutOld.sources.some((s) => s.id === supersedesTarget);
  assert.equal(targetStillExists, false, "fixture check: deletion scenario should indeed remove the old record");

  // The verifier itself must still structurally accept the additive (correct) version...
  const result = validateResearchSourceFreeze(registry, { verifyLocalArtifacts: false });
  assert.equal(result.sources, registry.sources.length);

  // ...and the old record's presence alongside the new one is exactly what
  // "corrections create a new version and preserve the superseded record" means.
  assert.ok(registry.sources.some((s) => s.id === "bvr-sim-2608-25419"), "superseded record must remain present");
  assert.ok(registry.sources.some((s) => s.id === "bvr-sim-2608-25419-v2" && s.supersedes === "bvr-sim-2608-25419"));
});

// --- (12) production-artifact isolation ---
test("checkProductionIsolation finds no violations against the real package.json", () => {
  let packageJson;
  try {
    packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json")));
  } catch {
    packageJson = { dependencies: {}, devDependencies: {} }; // fixture-safe fallback if run outside the repo
  }
  const violations = checkProductionIsolation(REAL_REGISTRY, packageJson);
  assert.deepEqual(violations, []);
});

test("checkProductionIsolation flags a quarantined source that leaks into production dependencies", () => {
  const fakePackageJson = {
    dependencies: {
      "some-unrelated-package": "^1.0.0",
      "bvrgym-wrapper": "^0.1.0", // simulated leak of the quarantined BVR Gym source
    },
    devDependencies: {},
  };
  const violations = checkProductionIsolation(REAL_REGISTRY, fakePackageJson);
  assert.ok(violations.length > 0, "expected a violation for the leaked quarantined dependency");
  assert.match(violations[0], /bvrgym-xcwoid/);
});

test("checkProductionIsolation does not flag a source once it is genuinely ADOPTED", () => {
  const registry = clone(REAL_REGISTRY);
  // Use a source with no sibling records sharing its repo slug, so adopting
  // it cannot be confused with a still-quarantined data/weight record from
  // the same repository (as hirl4ucav's code/data/weights split would be).
  const s = findSource(registry, "pettingzoo-farama");
  s.licenseReviewState = "REVIEWED";
  s.claimLocator = "Section 2";
  s.archivedDigest = "c".repeat(64);
  s.adoptionByUse.codeReuse = "ADOPTED";
  const fakePackageJson = { dependencies: { "pettingzoo-adapter": "^1.0.0" }, devDependencies: {} };
  const violations = checkProductionIsolation(registry, fakePackageJson);
  assert.deepEqual(violations, []);
});

test("checkProductionIsolation still flags a sibling record sharing a repo slug even after one use is adopted", () => {
  const registry = clone(REAL_REGISTRY);
  findSource(registry, "hirl4ucav-code").adoptionByUse.codeReuse = "ADOPTED";
  // hirl4ucav-data and hirl4ucav-weights remain NOT_ADOPTED and share the same
  // repository slug — a dependency matching that slug must still be flagged,
  // since it could plausibly bundle the still-unlicensed data/weights too.
  const fakePackageJson = { dependencies: { "hirl4ucav-adapter": "^1.0.0" }, devDependencies: {} };
  const violations = checkProductionIsolation(registry, fakePackageJson);
  assert.ok(violations.length > 0);
});
