import registry from "../governance/aircraft-evidence-registry.v1.json" with { type: "json" };

import type { AircraftPerformanceAdmissionSource } from "./model-pack.ts";

type GovernedCapability = {
  capability: string;
  sourceArtifactIds?: string[];
  validationArtifactIds?: string[];
  missingReason?: string;
};

type RegistryClaim = {
  catalogObjectId: string;
  state: "ADMITTED" | "UNSUPPORTED";
  reason: string;
  capabilities: GovernedCapability[];
};

/**
 * A model-pack evidence row is necessary but not sufficient for a named-aircraft
 * claim. The governed registry is the separate admission authority that records
 * exact subject identity, capability coverage, and artifact separation.
 */
export function assertGovernedAircraftEvidenceAdmission(
  catalogObjectId: string,
  admission: AircraftPerformanceAdmissionSource,
) {
  if (admission.state !== "ADMITTED") return;
  const claim = registry.claims.find((item) => item.catalogObjectId === catalogObjectId) as RegistryClaim | undefined;
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
    const same = (left: string[], right: string[]) =>
      left.length === right.length && [...left].sort().every((item, index) => item === [...right].sort()[index]);
    if (
      !same(capability.sourceEvidenceRefIds, governed.sourceArtifactIds ?? []) ||
      !same(capability.validationEvidenceRefIds, governed.validationArtifactIds ?? [])
    ) {
      throw new Error(`Named aircraft ${catalogObjectId} ${capability.capability} evidence does not exactly match the governed registry.`);
    }
  }
}
