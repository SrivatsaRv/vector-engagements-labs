import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const VALID_SOURCE_ROLES = [
  "ARCHITECTURE_INSPIRATION",
  "ALGORITHM_REFERENCE",
  "EVALUATION_REFERENCE",
  "CODE_CANDIDATE",
  "DATA_CANDIDATE",
  "WEIGHT_CANDIDATE",
  "CONTEXT_ONLY",
];

export const VALID_RETRIEVAL_STATES = ["DECLARED_REMOTE", "COMMITTED_DERIVATIVE"];
export const VALID_HASH_REVIEW_STATES = ["VERIFIED", "PENDING"];
export const VALID_LICENSE_REVIEW_STATES = ["REVIEWED", "PENDING", "NOT_APPLICABLE"];
export const VALID_USE_DECISIONS = ["NOT_ADOPTED", "QUARANTINED", "ADOPTED"];
export const VALID_LOCATOR_STABILITY = ["PINNED", "DYNAMIC"];
export const VALID_LICENSE_CLASSIFICATIONS = [
  "PERMISSIVE", "RESEARCH_ONLY", "GPL", "UNKNOWN", "MISSING", "CONFLICTING", "NOT_APPLICABLE",
];
export const BLOCKING_LICENSE_CLASSIFICATIONS = ["GPL", "RESEARCH_ONLY", "UNKNOWN", "MISSING", "CONFLICTING"];
export const VALID_KINDS = ["PAPER", "PROGRAMME_DESCRIPTION", "REPOSITORY", "DATA", "WEIGHTS"];
export const STUDY_ROLES = ["ARCHITECTURE_INSPIRATION", "ALGORITHM_REFERENCE", "EVALUATION_REFERENCE"];

export const DEFAULT_REGISTRY_PATH = "governance/research-source-freeze.v1.json";
const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_COMMIT = /^[0-9a-f]{7,40}$/iu;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function applicableUseKeys(source) {
  const roles = new Set([source.vectorSourceRole, source.secondaryRole].filter(Boolean));
  const keys = new Set();
  if (STUDY_ROLES.some((r) => roles.has(r))) keys.add("architectureStudy");
  if (roles.has("CODE_CANDIDATE")) keys.add("codeReuse");
  if (roles.has("DATA_CANDIDATE")) keys.add("dataReuse");
  if (roles.has("WEIGHT_CANDIDATE")) keys.add("weightReuse");
  if (roles.size === 1 && roles.has("CONTEXT_ONLY")) keys.add("architectureStudy");
  return keys;
}

export function validateResearchSourceFreeze(registry, { rootDirectory = process.cwd(), verifyLocalArtifacts = true } = {}) {
  assert(registry.schemaVersion === "vector.research-source-freeze.v1", "Unsupported research-source-freeze schema.");
  assert(typeof registry.version === "string" && registry.version.length > 0, "Registry requires a version.");
  assert(Array.isArray(registry.sources) && registry.sources.length > 0, "Registry requires at least one source record.");

  const ids = new Set();

  for (const source of registry.sources) {
    assert(typeof source.id === "string" && source.id.length > 0, "Every source requires a stable id.");
    assert(!ids.has(source.id), `Duplicate source id: ${source.id}.`);
    ids.add(source.id);

    assert(typeof source.title === "string" && source.title.length > 0, `${source.id} requires a title.`);
    assert(typeof source.uri === "string" && source.uri.startsWith("http"), `${source.id} requires a canonical URL.`);
    assert(VALID_KINDS.includes(source.kind), `${source.id} has an unsupported kind.`);

    assert(VALID_RETRIEVAL_STATES.includes(source.retrievalState), `${source.id} has an unsupported retrievalState.`);
    assert(VALID_HASH_REVIEW_STATES.includes(source.hashReviewState), `${source.id} has an unsupported hashReviewState.`);
    if (source.hashReviewState === "VERIFIED") {
      assert(SHA256.test(source.sha256), `${source.id} claims VERIFIED but lacks a valid SHA-256.`);
    } else {
      assert(source.sha256 === null, `${source.id} is PENDING hash review and must not claim a digest.`);
    }

    assert(VALID_LICENSE_REVIEW_STATES.includes(source.licenseReviewState), `${source.id} has an unsupported licenseReviewState.`);
    assert(VALID_LICENSE_CLASSIFICATIONS.includes(source.licenseClassification), `${source.id} has an unsupported licenseClassification.`);

    assert(VALID_SOURCE_ROLES.includes(source.vectorSourceRole), `${source.id} has an unsupported vectorSourceRole.`);
    if (source.secondaryRole) {
      assert(VALID_SOURCE_ROLES.includes(source.secondaryRole), `${source.id} has an unsupported secondaryRole.`);
    }

    const roles = new Set([source.vectorSourceRole, source.secondaryRole].filter(Boolean));
    const isCodeCandidate = roles.has("CODE_CANDIDATE");

    if (isCodeCandidate) {
      assert(
        typeof source.exactCommit === "string" && GIT_COMMIT.test(source.exactCommit),
        `${source.id} is a CODE_CANDIDATE and requires an exact commit hash (7-40 hex chars) — a branch name or other free-text reference is not sufficient.`,
      );
      assert(
        typeof source.repositoryOrigin === "string" && source.repositoryOrigin.length > 0,
        `${source.id} is a CODE_CANDIDATE and requires an explicit repositoryOrigin — exact commit alone is not sufficient.`,
      );
      assert(
        Object.prototype.hasOwnProperty.call(source, "subpath"),
        `${source.id} is a CODE_CANDIDATE and requires a subpath field (null if the whole repo applies).`,
      );
      assert(
        Object.prototype.hasOwnProperty.call(source, "archivedDigest"),
        `${source.id} is a CODE_CANDIDATE and requires an archivedDigest field (may be null pending archival).`,
      );
    }

    assert(
      source.adoptionByUse && typeof source.adoptionByUse === "object",
      `${source.id} requires an adoptionByUse object — a single global adoptionDecision is too ambiguous.`,
    );
    const expectedKeys = applicableUseKeys(source);
    const actualKeys = new Set(Object.keys(source.adoptionByUse));
    for (const key of expectedKeys) {
      assert(actualKeys.has(key), `${source.id} is missing an adoptionByUse.${key} decision.`);
    }
    for (const key of actualKeys) {
      assert(expectedKeys.has(key), `${source.id} declares adoptionByUse.${key} but no role makes that use applicable.`);
      assert(VALID_USE_DECISIONS.includes(source.adoptionByUse[key]), `${source.id} adoptionByUse.${key} has an unsupported value.`);
    }

    const blocking = BLOCKING_LICENSE_CLASSIFICATIONS.includes(source.licenseClassification);
    for (const useKey of ["codeReuse", "dataReuse", "weightReuse"]) {
      if (actualKeys.has(useKey) && source.adoptionByUse[useKey] === "ADOPTED") {
        assert(!blocking, `${source.id} cannot set adoptionByUse.${useKey} to ADOPTED with a blocking license classification (${source.licenseClassification}).`);
        assert(source.licenseReviewState === "REVIEWED", `${source.id} cannot set adoptionByUse.${useKey} to ADOPTED without a completed license review.`);
      }
    }

    const anyPromotedArtifactUse = ["codeReuse", "dataReuse", "weightReuse"].some(
      (k) => actualKeys.has(k) && source.adoptionByUse[k] === "ADOPTED",
    );
    if (anyPromotedArtifactUse) {
      assert(source.claimLocator !== "PENDING_REVIEW", `${source.id} cannot promote an artifact use with an unresolved claim locator.`);
      if (isCodeCandidate) {
        assert(SHA256.test(source.archivedDigest), `${source.id} cannot promote codeReuse without a real archivedDigest.`);
      }
    }

    assert(typeof source.reviewer === "string" && source.reviewer.length > 0, `${source.id} requires a reviewer.`);
    assert(typeof source.reviewedAt === "string" && source.reviewedAt.length > 0, `${source.id} requires a reviewedAt date.`);
    assert(source.notRuntimeAuthority === true, `${source.id} must explicitly declare notRuntimeAuthority: true.`);
    assert(Object.prototype.hasOwnProperty.call(source, "supersedes"), `${source.id} requires a supersedes field.`);

    if (source.requiresDisambiguation) {
      assert(
        source.collisionRisk &&
          Array.isArray(source.collisionRisk.similarNames) &&
          source.collisionRisk.similarNames.length > 0 &&
          typeof source.collisionRisk.distinguishingFacts === "string" &&
          source.collisionRisk.distinguishingFacts.length > 0,
        `${source.id} is flagged requiresDisambiguation but is missing a complete collisionRisk record.`,
      );
    }

    if (source.locatorStability) {
      assert(VALID_LOCATOR_STABILITY.includes(source.locatorStability), `${source.id} has an unsupported locatorStability.`);
      if (source.locatorStability === "DYNAMIC") {
        assert(source.hashReviewState !== "VERIFIED", `${source.id} has a DYNAMIC locator and cannot claim a VERIFIED hash.`);
      }
    }

    if (source.kind === "PAPER" || source.kind === "PROGRAMME_DESCRIPTION") {
      assert(Object.prototype.hasOwnProperty.call(source, "documentDigest"), `${source.id} requires a documentDigest field.`);
      assert(typeof source.claimLocator === "string" && source.claimLocator.length > 0, `${source.id} requires a claimLocator.`);
      if (source.hashReviewState === "VERIFIED") {
        assert(SHA256.test(source.documentDigest), `${source.id} claims VERIFIED but lacks a real documentDigest.`);
      }
    }

    if (source.publishedAt) {
      assert(
        source.recencyReview &&
          typeof source.recencyReview.ageAtReviewDays === "number" &&
          typeof source.recencyReview.maturityWindowDays === "number" &&
          typeof source.recencyReview.decision === "string",
        `${source.id} has publishedAt and requires an explicit recencyReview record.`,
      );
      const expectedAge = Math.floor(
        (new Date(`${source.reviewedAt}T00:00:00Z`).getTime() - new Date(`${source.publishedAt}T00:00:00Z`).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      assert(
        source.recencyReview.ageAtReviewDays === expectedAge,
        `${source.id} recencyReview.ageAtReviewDays does not match publishedAt/reviewedAt.`,
      );
      if (source.recencyReview.ageAtReviewDays < source.recencyReview.maturityWindowDays) {
        assert(
          source.recencyReview.decision === "HOLD_CONTEXT_ONLY",
          `${source.id} is within its own reviewed maturity window and must record decision HOLD_CONTEXT_ONLY.`,
        );
      }
    }

    // --- lineage gaps: any declared derivedFrom reference must resolve to a real record ---
    if (source.derivedFromArtifactIds) {
      assert(Array.isArray(source.derivedFromArtifactIds), `${source.id} derivedFromArtifactIds must be an array.`);
      for (const parentId of source.derivedFromArtifactIds) {
        assert(
          registry.sources.some((s) => s.id === parentId),
          `${source.id} declares lineage to missing record ${parentId} — a paper/code/result lineage gap.`,
        );
      }
    }

    if (source.retrievalState === "COMMITTED_DERIVATIVE") {
      assert(typeof source.localPath === "string", `${source.id} claims COMMITTED_DERIVATIVE and requires a localPath.`);
      if (verifyLocalArtifacts) {
        const path = resolve(rootDirectory, source.localPath);
        assert(existsSync(path), `${source.id} local artifact is missing on disk: ${source.localPath}.`);
        const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
        assert(actual === source.sha256, `${source.id} local artifact bytes do not match the recorded digest.`);
      }
    }
  }

  return { sources: registry.sources.length };
}

// Production-artifact isolation: confirms no quarantined/non-adopted source's
// package name or repository slug appears as an actual installed production
// dependency. This is the concrete check behind the issue's requirement that
// "built production artifacts... contain none of the quarantined research
// code, data, training dependencies, or unapproved weights."
export function checkProductionIsolation(registry, packageJson) {
  const declaredDeps = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
  };
  const depNames = Object.keys(declaredDeps).map((n) => n.toLowerCase());
  const violations = [];

  for (const source of registry.sources) {
    const notAdopted =
      !source.adoptionByUse ||
      !["codeReuse", "dataReuse", "weightReuse"].some((k) => source.adoptionByUse[k] === "ADOPTED");
    if (!notAdopted) continue; // adopted sources are allowed to be actual dependencies

    const slug = (source.repositoryOrigin || source.uri || "")
      .toLowerCase()
      .replace(/^https?:\/\/(www\.)?/, "")
      .replace(/\.git$/, "");
    const shortName = slug.split("/").pop();

    for (const dep of depNames) {
      if (shortName && dep.includes(shortName)) {
        violations.push(`Quarantined source '${source.id}' (${shortName}) appears in production dependencies as '${dep}'.`);
      }
    }
  }

  return violations;
}

function run() {
  try {
    const raw = readFileSync(resolve(process.cwd(), DEFAULT_REGISTRY_PATH));
    const registry = JSON.parse(raw);
    const result = validateResearchSourceFreeze(registry);
    process.stdout.write(`${JSON.stringify({ ...result, sha256: createHash("sha256").update(raw).digest("hex") })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) run();
