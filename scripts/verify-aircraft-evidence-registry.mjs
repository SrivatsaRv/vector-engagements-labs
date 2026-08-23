import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const REQUIRED_CAPABILITIES = [
  "AERODYNAMICS",
  "PROPULSION",
  "FLIGHT_CONTROLS",
  "MASS_AND_STORES",
  "SENSORS",
];

export const DEFAULT_REGISTRY_PATH = "governance/aircraft-evidence-registry.v2.json";
const SHA256 = /^[a-f0-9]{64}$/u;
const V1_SCHEMA = "vector.aircraft-evidence-registry.v1";
const V2_SCHEMA = "vector.aircraft-evidence-registry.v2";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function artifactMap(registry, isV2, declaredClaimIds = new Set()) {
  const ids = new Set();
  for (const artifact of registry.artifacts) {
    assert(typeof artifact.id === "string" && artifact.id.length > 0, "Evidence artifact requires an id.");
    assert(!ids.has(artifact.id), `Duplicate evidence artifact ${artifact.id}.`);
    ids.add(artifact.id);
    assert(
      ["SOURCE", "VALIDATION", "DERIVED_FIXTURE", ...(isV2 ? ["CONTEXT"] : [])].includes(artifact.kind),
      `${artifact.id} has an unsupported artifact kind.`,
    );
    assert(typeof artifact.uri === "string" && artifact.uri.length > 0, `${artifact.id} requires an immutable artifact location.`);
    if (isV2) {
      assert(
        [
          "NAMED_PERFORMANCE_SOURCE",
          "NAMED_PERFORMANCE_VALIDATION",
          "REFERENCE_ONLY",
          "CATALOG_CONTEXT_ONLY",
          "GOVERNANCE_CONTEXT_ONLY",
          "INELIGIBLE",
        ].includes(artifact.admissionUse),
        `${artifact.id} has an unsupported admission use.`,
      );
      assert(["VERIFIED", "PENDING"].includes(artifact.hashReviewState), `${artifact.id} has an unsupported hash review state.`);
      assert(["REVIEWED", "PENDING"].includes(artifact.licenseReviewState), `${artifact.id} has an unsupported license review state.`);
      assert(Array.isArray(artifact.subjectClaimIds), `${artifact.id} requires subjectClaimIds.`);
      assert(Array.isArray(artifact.eligibleClaimIds), `${artifact.id} requires eligibleClaimIds.`);
      assert(Array.isArray(artifact.capabilityCoverage), `${artifact.id} requires capabilityCoverage.`);
      assert(new Set(artifact.subjectClaimIds).size === artifact.subjectClaimIds.length, `${artifact.id} repeats a subject claim.`);
      assert(new Set(artifact.eligibleClaimIds).size === artifact.eligibleClaimIds.length, `${artifact.id} repeats an eligible claim.`);
      assert(new Set(artifact.capabilityCoverage).size === artifact.capabilityCoverage.length, `${artifact.id} repeats capability coverage.`);
      for (const claimId of artifact.subjectClaimIds) {
        assert(declaredClaimIds.has(claimId), `${artifact.id} references unknown subject claim ${claimId}.`);
      }
      for (const claimId of artifact.eligibleClaimIds) {
        assert(artifact.subjectClaimIds.includes(claimId), `${artifact.id} eligibility for ${claimId} escapes its exact subject binding.`);
      }
      for (const capability of artifact.capabilityCoverage) {
        assert(REQUIRED_CAPABILITIES.includes(capability), `${artifact.id} has unsupported capability coverage ${capability}.`);
      }
      const namedPerformanceUse = artifact.admissionUse.startsWith("NAMED_PERFORMANCE");
      if (namedPerformanceUse) {
        assert(artifact.eligibleClaimIds.length > 0, `${artifact.id} named-performance evidence requires an eligible claim binding.`);
        assert(artifact.capabilityCoverage.length > 0, `${artifact.id} named-performance evidence requires capability coverage.`);
      } else {
        assert(artifact.eligibleClaimIds.length === 0, `${artifact.id} non-admission evidence cannot declare eligible claims.`);
      }
      if (artifact.hashReviewState === "VERIFIED") {
        assert(SHA256.test(artifact.sha256), `${artifact.id} requires an immutable SHA-256 artifact digest.`);
      } else {
        assert(artifact.sha256 === null, `${artifact.id} pending hash review must not claim an immutable digest.`);
        assert(
          !artifact.admissionUse.startsWith("NAMED_PERFORMANCE"),
          `${artifact.id} without an immutable SHA-256 is not eligible for named-performance admission.`,
        );
      }
      if (artifact.admissionUse === "INELIGIBLE") {
        assert(artifact.transactionState === "EXPIRED_WITHOUT_ACCEPTANCE", `${artifact.id} ineligible proposal requires its transaction state.`);
      }
    } else {
      assert(SHA256.test(artifact.sha256), `${artifact.id} requires a SHA-256 artifact digest.`);
    }
    assert(["DECLARED_REMOTE", "COMMITTED_DERIVATIVE"].includes(artifact.retrievalState), `${artifact.id} has an unsupported retrieval state.`);
    if (artifact.retrievalState === "COMMITTED_DERIVATIVE") {
      assert(artifact.kind === "DERIVED_FIXTURE", `${artifact.id} derivative must be DERIVED_FIXTURE.`);
      assert(typeof artifact.localPath === "string", `${artifact.id} derivative requires localPath.`);
      assert(Array.isArray(artifact.derivedFromArtifactIds) && artifact.derivedFromArtifactIds.length > 0, `${artifact.id} derivative requires source ancestry.`);
    } else {
      assert(!artifact.localPath, `${artifact.id} remote artifact must not claim a local artifact hash.`);
      assert(artifact.kind !== "DERIVED_FIXTURE", `${artifact.id} remote artifact cannot be DERIVED_FIXTURE.`);
    }
  }
  return new Map(registry.artifacts.map((artifact) => [artifact.id, artifact]));
}

function assertV2SubjectsAndAssertions(registry, artifacts, declaredClaimIds) {
  assert(Array.isArray(registry.subjects) && registry.subjects.length > 0, "Aircraft evidence registry v2 requires exact subjects.");
  const subjectIds = new Set();
  const subjectCatalogIds = new Set();
  for (const subject of registry.subjects) {
    assert(typeof subject.id === "string" && subject.id.length > 0, "Aircraft subject requires an id.");
    assert(!subjectIds.has(subject.id), `Duplicate aircraft subject ${subject.id}.`);
    assert(!subjectCatalogIds.has(subject.catalogObjectId), `Duplicate aircraft subject for ${subject.catalogObjectId}.`);
    subjectIds.add(subject.id);
    subjectCatalogIds.add(subject.catalogObjectId);
    assert(typeof subject.catalogObjectId === "string" && subject.catalogObjectId.length > 0, `${subject.id} requires a catalog object id.`);
    assert(typeof subject.designation === "string" && subject.designation.length > 0, `${subject.id} requires a designation.`);
    assert(["IAF", "PAF"].includes(subject.operator), `${subject.id} has an unsupported operator.`);
    assert(["SINGLE_SEAT", "TWO_SEAT"].includes(subject.seatConfiguration), `${subject.id} has an unsupported seat configuration.`);
    assert(subject.deliveredQuantity === null || Number.isInteger(subject.deliveredQuantity) && subject.deliveredQuantity > 0, `${subject.id} delivered quantity is invalid.`);
    assert(typeof subject.scenarioSelectable === "boolean", `${subject.id} requires scenario-selectable state.`);
    assert(declaredClaimIds.has(subject.performanceClaimId), `${subject.id} references unknown performance claim ${subject.performanceClaimId}.`);
  }

  assert(Array.isArray(registry.catalogAssertions), "Aircraft evidence registry v2 requires catalog assertions.");
  const assertionIds = new Set();
  for (const item of registry.catalogAssertions) {
    assert(typeof item.id === "string" && item.id.length > 0, "Catalog assertion requires an id.");
    assert(!assertionIds.has(item.id), `Duplicate catalog assertion ${item.id}.`);
    assertionIds.add(item.id);
    assert(subjectIds.has(item.subjectId), `${item.id} references unknown subject ${item.subjectId}.`);
    assert(typeof item.field === "string" && item.field.length > 0, `${item.id} requires a field.`);
    assert(["CONTEXT_ONLY", "UNKNOWN", "MODEL_ASSUMPTION"].includes(item.evidenceState), `${item.id} has an unsupported evidence state.`);
    assert(item.runtimeAuthority === "NONE", `${item.id} descriptive evidence cannot grant runtime authority.`);
    assert(Array.isArray(item.evidenceArtifactIds), `${item.id} requires evidenceArtifactIds.`);
    if (item.evidenceState === "UNKNOWN") {
      assert(item.value === null && item.evidenceArtifactIds.length === 0, `${item.id} UNKNOWN evidence must remain empty.`);
    }
    if (item.evidenceState === "MODEL_ASSUMPTION") {
      assert(item.evidenceArtifactIds.length === 0, `${item.id} model assumption cannot cite source authority.`);
    }
    if (item.evidenceState === "CONTEXT_ONLY") {
      assert(item.evidenceArtifactIds.length > 0, `${item.id} context-only assertion requires evidence.`);
      for (const artifactId of item.evidenceArtifactIds) {
        const artifact = artifacts.get(artifactId);
        assert(artifact, `${item.id} references missing context artifact ${artifactId}.`);
        assert(
          ["CATALOG_CONTEXT_ONLY", "GOVERNANCE_CONTEXT_ONLY", "REFERENCE_ONLY"].includes(artifact.admissionUse),
          `${item.id} cannot cite ${artifactId} as catalog context.`,
        );
        const subject = registry.subjects.find((candidate) => candidate.id === item.subjectId);
        assert(
          artifact.subjectClaimIds.includes(subject.performanceClaimId),
          `${item.id} context artifact ${artifactId} is not bound to exact subject claim ${subject.performanceClaimId}.`,
        );
      }
    }
  }
  return new Map(registry.subjects.map((subject) => [subject.id, subject]));
}

function assertV2AdmissionArtifact(artifact, role, claimId, capability) {
  assert(artifact, `${claimId} ${capability} references missing ${role.toLowerCase()} evidence.`);
  const expectedUse = role === "SOURCE" ? "NAMED_PERFORMANCE_SOURCE" : "NAMED_PERFORMANCE_VALIDATION";
  assert(
    artifact.kind === role && artifact.admissionUse === expectedUse,
    `${claimId} ${capability} ${role.toLowerCase()} ${artifact.id} is not eligible for named-performance admission.`,
  );
  assert(
    SHA256.test(artifact.sha256) && artifact.hashReviewState === "VERIFIED" && artifact.licenseReviewState === "REVIEWED",
    `${claimId} ${capability} ${artifact.id} lacks immutable SHA-256 and completed license review.`,
  );
  assert(artifact.subjectClaimIds.includes(claimId), `${claimId} ${capability} ${artifact.id} is bound to a different subject.`);
  assert(artifact.eligibleClaimIds.includes(claimId), `${claimId} ${capability} ${artifact.id} is not eligible for this claim.`);
  assert(artifact.capabilityCoverage.includes(capability), `${claimId} ${capability} ${artifact.id} lacks capability coverage.`);
}

export function validateAircraftEvidenceRegistry(registry, { rootDirectory = process.cwd(), verifyLocalArtifacts = true } = {}) {
  assert([V1_SCHEMA, V2_SCHEMA].includes(registry.schemaVersion), "Unsupported aircraft evidence registry schema.");
  const isV2 = registry.schemaVersion === V2_SCHEMA;
  if (isV2) {
    assert(registry.supersedes?.schemaVersion === V1_SCHEMA, "Aircraft evidence registry v2 must preserve the v1 predecessor.");
  }
  assert(registry.programmeGate === "#66" && registry.ownerIssue === "#64", "Aircraft evidence registry must remain governed by #64 and #66.");
  assert(Array.isArray(registry.claims), "Aircraft evidence registry requires claims.");
  const declaredClaimIds = new Set(registry.claims.map((claim) => claim.id));
  assert(declaredClaimIds.size === registry.claims.length, "Aircraft evidence registry has duplicate claim ids.");
  const artifacts = artifactMap(registry, isV2, declaredClaimIds);
  for (const artifact of artifacts.values()) {
    for (const parentId of artifact.derivedFromArtifactIds ?? []) {
      assert(artifacts.has(parentId), `${artifact.id} references missing source artifact ${parentId}.`);
    }
    if (verifyLocalArtifacts && artifact.localPath) {
      const path = resolve(rootDirectory, artifact.localPath);
      assert(existsSync(path), `${artifact.id} local artifact is missing: ${artifact.localPath}.`);
      const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
      assert(actual === artifact.sha256, `${artifact.id} local artifact SHA-256 does not match the registry.`);
    }
  }
  const subjects = isV2 ? assertV2SubjectsAndAssertions(registry, artifacts, declaredClaimIds) : undefined;
  const claimIds = new Set();
  const catalogIds = new Set();
  for (const claim of registry.claims) {
    assert(!claimIds.has(claim.id), `Duplicate aircraft evidence claim ${claim.id}.`);
    assert(!catalogIds.has(claim.catalogObjectId), `Duplicate aircraft evidence claim for ${claim.catalogObjectId}.`);
    claimIds.add(claim.id);
    catalogIds.add(claim.catalogObjectId);
    if (isV2) {
      const subject = subjects.get(claim.subjectId);
      assert(subject, `${claim.id} references unknown subject ${claim.subjectId}.`);
      assert(subject.catalogObjectId === claim.catalogObjectId, `${claim.id} subject and catalog identity do not match.`);
      assert(subject.performanceClaimId === claim.id, `${claim.id} does not match subject ${claim.subjectId}'s governed claim binding.`);
    }
    assert(["ADMITTED", "UNSUPPORTED"].includes(claim.state), `${claim.id} has an invalid state.`);
    assert(Array.isArray(claim.capabilities) && claim.capabilities.length === REQUIRED_CAPABILITIES.length, `${claim.id} must account for every performance capability.`);
    const seen = new Set();
    for (const capability of claim.capabilities) {
      assert(REQUIRED_CAPABILITIES.includes(capability.capability), `${claim.id} contains an unsupported capability.`);
      assert(!seen.has(capability.capability), `${claim.id} duplicates ${capability.capability}.`);
      seen.add(capability.capability);
      const sources = capability.sourceArtifactIds ?? [];
      const validations = capability.validationArtifactIds ?? [];
      if (isV2) {
        assert(Array.isArray(capability.contextArtifactIds), `${claim.id} ${capability.capability} requires explicit contextArtifactIds.`);
        for (const id of capability.contextArtifactIds) {
          const artifact = artifacts.get(id);
          assert(artifact, `${claim.id} ${capability.capability} references missing context artifact ${id}.`);
          assert(!artifact.admissionUse.startsWith("NAMED_PERFORMANCE"), `${claim.id} ${capability.capability} context artifact ${id} is misclassified.`);
        }
      }
      for (const id of sources) {
        if (isV2) assertV2AdmissionArtifact(artifacts.get(id), "SOURCE", claim.id, capability.capability);
        else assert(artifacts.get(id)?.kind === "SOURCE", `${claim.id} ${capability.capability} source ${id} is not a SOURCE artifact.`);
      }
      for (const id of validations) {
        if (isV2) assertV2AdmissionArtifact(artifacts.get(id), "VALIDATION", claim.id, capability.capability);
        else assert(artifacts.get(id)?.kind === "VALIDATION", `${claim.id} ${capability.capability} validation ${id} is not a VALIDATION artifact.`);
      }
      assert(!sources.some((id) => validations.includes(id)), `${claim.id} ${capability.capability} reuses an artifact as source and validation.`);
      if (claim.state === "ADMITTED") {
        assert(sources.length > 0 && validations.length > 0, `${claim.id} ${capability.capability} admission needs distinct source and validation artifacts.`);
      } else {
        assert(typeof capability.missingReason === "string" && capability.missingReason.trim().length > 0, `${claim.id} ${capability.capability} unsupported state requires a gap reason.`);
      }
    }
    assert(seen.size === REQUIRED_CAPABILITIES.length, `${claim.id} misses a required performance capability.`);
    if (claim.state === "UNSUPPORTED") assert(typeof claim.reason === "string" && claim.reason.trim().length > 0, `${claim.id} unsupported state requires a reason.`);
  }
  return { claims: registry.claims.length, artifacts: registry.artifacts.length };
}

export function findAircraftEvidenceClaim(registry, catalogObjectId) {
  return registry.claims.find((claim) => claim.catalogObjectId === catalogObjectId);
}

function run() {
  try {
    const raw = readFileSync(resolve(process.cwd(), DEFAULT_REGISTRY_PATH));
    const registry = JSON.parse(raw);
    const result = validateAircraftEvidenceRegistry(registry);
    process.stdout.write(`${JSON.stringify({ ...result, sha256: createHash("sha256").update(raw).digest("hex") })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) run();
