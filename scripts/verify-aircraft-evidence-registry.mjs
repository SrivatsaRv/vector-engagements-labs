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

export const DEFAULT_REGISTRY_PATH = "governance/aircraft-evidence-registry.v1.json";
const SHA256 = /^[a-f0-9]{64}$/u;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function artifactMap(registry) {
  const ids = new Set();
  for (const artifact of registry.artifacts) {
    assert(typeof artifact.id === "string" && artifact.id.length > 0, "Evidence artifact requires an id.");
    assert(!ids.has(artifact.id), `Duplicate evidence artifact ${artifact.id}.`);
    ids.add(artifact.id);
    assert(["SOURCE", "VALIDATION", "DERIVED_FIXTURE"].includes(artifact.kind), `${artifact.id} has an unsupported artifact kind.`);
    assert(typeof artifact.uri === "string" && artifact.uri.length > 0, `${artifact.id} requires an immutable artifact location.`);
    assert(SHA256.test(artifact.sha256), `${artifact.id} requires a SHA-256 artifact digest.`);
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

export function validateAircraftEvidenceRegistry(registry, { rootDirectory = process.cwd(), verifyLocalArtifacts = true } = {}) {
  assert(registry.schemaVersion === "vector.aircraft-evidence-registry.v1", "Unsupported aircraft evidence registry schema.");
  assert(registry.programmeGate === "#66" && registry.ownerIssue === "#64", "Aircraft evidence registry must remain governed by #64 and #66.");
  const artifacts = artifactMap(registry);
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
  const claimIds = new Set();
  const catalogIds = new Set();
  for (const claim of registry.claims) {
    assert(!claimIds.has(claim.id), `Duplicate aircraft evidence claim ${claim.id}.`);
    assert(!catalogIds.has(claim.catalogObjectId), `Duplicate aircraft evidence claim for ${claim.catalogObjectId}.`);
    claimIds.add(claim.id);
    catalogIds.add(claim.catalogObjectId);
    assert(["ADMITTED", "UNSUPPORTED"].includes(claim.state), `${claim.id} has an invalid state.`);
    assert(Array.isArray(claim.capabilities) && claim.capabilities.length === REQUIRED_CAPABILITIES.length, `${claim.id} must account for every performance capability.`);
    const seen = new Set();
    for (const capability of claim.capabilities) {
      assert(REQUIRED_CAPABILITIES.includes(capability.capability), `${claim.id} contains an unsupported capability.`);
      assert(!seen.has(capability.capability), `${claim.id} duplicates ${capability.capability}.`);
      seen.add(capability.capability);
      const sources = capability.sourceArtifactIds ?? [];
      const validations = capability.validationArtifactIds ?? [];
      for (const id of sources) assert(artifacts.get(id)?.kind === "SOURCE", `${claim.id} ${capability.capability} source ${id} is not a SOURCE artifact.`);
      for (const id of validations) assert(artifacts.get(id)?.kind === "VALIDATION", `${claim.id} ${capability.capability} validation ${id} is not a VALIDATION artifact.`);
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
