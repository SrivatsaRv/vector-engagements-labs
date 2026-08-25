import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  loadAndVerifyGenericMissionPolicyGovernance,
  verifyExternalSourceBundle,
  verifyProductionIsolation,
} from "./lib/generic-mission-policy-source-verifier.mjs";

function sourceDirectory(argv) {
  const index = argv.indexOf("--source-dir");
  if (index >= 0) {
    if (!argv[index + 1]) throw new Error("--source-dir requires a directory value.");
    return argv[index + 1];
  }
  return process.env.VECTOR_GENERIC_MISSION_POLICY_SOURCE_DIR;
}

export function verifyGenericMissionPolicySourceCommand(argv = process.argv.slice(2)) {
  const externalSourceDirectory = sourceDirectory(argv);
  if (!externalSourceDirectory) throw new Error("VECTOR_GENERIC_MISSION_POLICY_SOURCE_DIR or --source-dir must identify exact user-supplied source bytes.");
  const governance = loadAndVerifyGenericMissionPolicyGovernance();
  const sources = verifyExternalSourceBundle(externalSourceDirectory);
  const productionFilesScanned = verifyProductionIsolation();
  return {
    schemaVersion: governance.manifest.schemaVersion,
    manifestCanonicalDigest: governance.manifest.canonicalDigest,
    ...sources,
    productionFilesScanned,
  };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
  try {
    process.stdout.write(`${JSON.stringify(verifyGenericMissionPolicySourceCommand())}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
