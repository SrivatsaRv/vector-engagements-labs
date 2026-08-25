import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  createProductionIsolationReport,
  loadAndVerifyGenericMissionPolicyGovernance,
} from "./lib/generic-mission-policy-source-verifier.mjs";

export function verifyGenericMissionPolicyGovernanceCommand() {
  const governance = loadAndVerifyGenericMissionPolicyGovernance();
  const productionIsolation = createProductionIsolationReport(resolve("."), governance.manifest, governance.productionEvidence);
  return {
    schemaVersion: governance.manifest.schemaVersion,
    manifestCanonicalDigest: governance.manifest.canonicalDigest,
    artifactsVerified: governance.manifest.artifacts.length,
    pagesBound: governance.manifest.artifacts.reduce((count, artifact) => count + artifact.pageMaps.length, 0),
    productionIsolation,
  };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
  try {
    process.stdout.write(`${JSON.stringify(verifyGenericMissionPolicyGovernanceCommand())}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
