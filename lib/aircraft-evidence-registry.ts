import registry from "../governance/aircraft-evidence-registry.v2.json" with { type: "json" };

import type {
  AircraftPerformanceAdmissionSource,
  EvidenceReference,
} from "./model-pack.ts";

type GovernedCapability = {
  capability: string;
  sourceArtifactIds?: string[];
  validationArtifactIds?: string[];
  missingReason?: string;
};

type RegistryClaim = {
  id: string;
  catalogObjectId: string;
  state: "ADMITTED" | "UNSUPPORTED";
  reason: string;
  capabilities: GovernedCapability[];
};

type RegistryArtifact = {
  id: string;
  kind: string;
  sha256: string | null;
  hashReviewState: "VERIFIED" | "PENDING";
  licenseReviewState: "REVIEWED" | "PENDING";
  admissionUse: string;
  subjectClaimIds: string[];
  eligibleClaimIds: string[];
  capabilityCoverage: string[];
};

type AircraftEvidenceRegistry = {
  claims: RegistryClaim[];
  artifacts: RegistryArtifact[];
};

const currentRegistry = registry as unknown as AircraftEvidenceRegistry;

export function getGovernedAircraftEvidenceClaim(catalogObjectId: string) {
  return currentRegistry.claims.find((item) => item.catalogObjectId === catalogObjectId);
}

const sameIds = (left: string[], right: string[]) =>
  left.length === right.length && [...left].sort().every((item, index) => item === [...right].sort()[index]);

function assertArtifactIdentity(
  registryDocument: AircraftEvidenceRegistry,
  evidenceById: ReadonlyMap<string, Pick<EvidenceReference, "id" | "kind" | "contentSha256">>,
  artifactId: string,
  expectedKind: "SOURCE" | "VALIDATION",
  claimId: string,
  capability: string,
) {
  const artifact = registryDocument.artifacts.find((item) => item.id === artifactId);
  if (!artifact) throw new Error(`${claimId} ${capability} references missing governed artifact ${artifactId}.`);
  const expectedUse = expectedKind === "SOURCE"
    ? "NAMED_PERFORMANCE_SOURCE"
    : "NAMED_PERFORMANCE_VALIDATION";
  if (
    artifact.kind !== expectedKind ||
    artifact.admissionUse !== expectedUse ||
    artifact.hashReviewState !== "VERIFIED" ||
    artifact.licenseReviewState !== "REVIEWED" ||
    !artifact.sha256
  ) {
    throw new Error(`${claimId} ${capability} artifact ${artifactId} is not eligible immutable ${expectedKind.toLowerCase()} evidence.`);
  }
  if (!artifact.subjectClaimIds.includes(claimId) || !artifact.eligibleClaimIds.includes(claimId)) {
    throw new Error(`${claimId} ${capability} artifact ${artifactId} is bound to a different subject or claim.`);
  }
  if (!artifact.capabilityCoverage.includes(capability)) {
    throw new Error(`${claimId} ${capability} artifact ${artifactId} lacks exact capability coverage.`);
  }
  const packEvidence = evidenceById.get(artifactId);
  if (!packEvidence || packEvidence.kind !== expectedKind || packEvidence.contentSha256 !== artifact.sha256) {
    throw new Error(`${claimId} ${capability} model-pack evidence ${artifactId} identity or SHA-256 does not match the governed registry.`);
  }
}

export function assertGovernedAircraftEvidenceAdmissionForRegistry(
  registryDocument: AircraftEvidenceRegistry,
  catalogObjectId: string,
  admission: AircraftPerformanceAdmissionSource,
  evidenceById: ReadonlyMap<string, Pick<EvidenceReference, "id" | "kind" | "contentSha256">>,
) {
  if (admission.state !== "ADMITTED") return;
  const claim = registryDocument.claims.find((item) => item.catalogObjectId === catalogObjectId);
  if (!claim) {
    throw new Error(`Named aircraft ${catalogObjectId} has no governed evidence-registry claim.`);
  }
  if (claim.state !== "ADMITTED") {
    throw new Error(`Named aircraft ${catalogObjectId} is unsupported by the governed evidence registry: ${claim.reason}`);
  }
  const expected = new Map(claim.capabilities.map((item) => [item.capability, item]));
  for (const capability of admission.capabilities) {
    const governed = expected.get(capability.capability);
    if (!governed) throw new Error(`Named aircraft ${catalogObjectId} has ungoverned capability ${capability.capability}.`);
    if (
      !sameIds(capability.sourceEvidenceRefIds, governed.sourceArtifactIds ?? []) ||
      !sameIds(capability.validationEvidenceRefIds, governed.validationArtifactIds ?? [])
    ) {
      throw new Error(`Named aircraft ${catalogObjectId} ${capability.capability} evidence does not exactly match the governed registry.`);
    }
    for (const artifactId of capability.sourceEvidenceRefIds) {
      assertArtifactIdentity(registryDocument, evidenceById, artifactId, "SOURCE", claim.id, capability.capability);
    }
    for (const artifactId of capability.validationEvidenceRefIds) {
      assertArtifactIdentity(registryDocument, evidenceById, artifactId, "VALIDATION", claim.id, capability.capability);
    }
  }
}

/**
 * A model-pack evidence row is necessary but not sufficient for a named-aircraft
 * claim. The governed registry is the separate admission authority that records
 * exact subject identity, capability coverage, and artifact separation.
 */
export function assertGovernedAircraftEvidenceAdmission(
  catalogObjectId: string,
  admission: AircraftPerformanceAdmissionSource,
  evidenceById: ReadonlyMap<string, Pick<EvidenceReference, "id" | "kind" | "contentSha256">>,
) {
  assertGovernedAircraftEvidenceAdmissionForRegistry(
    currentRegistry,
    catalogObjectId,
    admission,
    evidenceById,
  );
}
