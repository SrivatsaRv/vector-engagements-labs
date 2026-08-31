import { sha256HexSync } from "./geospatial/digest.ts";
import type { ScenarioDefinition } from "./scenarios.ts";

export const SCENARIO_PACKAGE_REFERENCE_SCHEMA_VERSION =
  "vector.scenario-package-reference.v1" as const;

export type ScenarioPackageReference = {
  schemaVersion: typeof SCENARIO_PACKAGE_REFERENCE_SCHEMA_VERSION;
  id: string;
  version: string;
  contentHash: string;
};

/** Append-only deployment authority; historical entries remain for VSR creation. */
export const RETAINED_SCENARIO_PACKAGE_REFERENCES = Object.freeze([
  ["a2a-crossing-intercept", "1.2.0", "680bc9267b5c067e6d56560e112de5d2941380d04bfc59aa8743ba8dc5e2c090"],
  ["a2a-defensive-break", "1.2.0", "83e6657dea3f9b246a19125a5d62a616c477a4d364d5fb6823aa608ec53534c5"],
  ["a2g-emitter-corridor", "1.1.0", "4ae5abeb246d0547e82e21e14cc0a7cf0511f02801465adb7f3268ba1a31d329"],
  ["a2g-protected-node", "1.1.0", "ee2aa9199f0241a7a705328a6d0eefe91d4cde0dffbc21647fe341cda084c2a6"],
  ["g2a-point-defence", "1.1.0", "2ed963cf08b066b57ab9cf5d7484de146942a11a2a389ea18c496f84d07fc6e6"],
  ["g2a-layered-screen", "1.1.0", "695d25b16f93754d558c6395b3dd4d3cb321b436ceb412bae31e6d5c06c3e033"],
  ["g2g-supersonic-corridor", "1.1.0", "4dc684053a671d049c670cbe99c3554534635c045432f4cb3f43e48958d31d11"],
  ["g2g-defended-route", "1.1.0", "15c727299b71c9addd716795db427f6edd60abc2e606875e82843a5b2c18791a"],
  ["a2a-high-energy-crossing-challenge", "1.2.0", "2bb894f31d0457926fc4b52a8680785d870a76831e73b8112aa9b6212cb42743"],
] as const);

export function assertScenarioPackageReference(
  value: unknown,
): asserts value is ScenarioPackageReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Scenario-package reference must be an object.");
  }
  const reference = value as Partial<ScenarioPackageReference>;
  const keys = Object.keys(reference).sort();
  const expected = ["contentHash", "id", "schemaVersion", "version"];
  if (
    keys.length !== expected.length ||
    !keys.every((key, index) => key === expected[index]) ||
    reference.schemaVersion !== SCENARIO_PACKAGE_REFERENCE_SCHEMA_VERSION ||
    typeof reference.id !== "string" ||
    reference.id.trim().length === 0 ||
    typeof reference.version !== "string" ||
    reference.version.trim().length === 0 ||
    typeof reference.contentHash !== "string" ||
    !/^[0-9a-f]{64}$/u.test(reference.contentHash)
  ) {
    throw new Error("Scenario-package reference is malformed or has unknown fields.");
  }
}

/**
 * Resolves a run-time source-package claim against the exact package inventory
 * shipped by this deployment. This is intentionally stronger than the archive
 * reader's structural check: an old VSR remains self-contained, while a new
 * browser/Worker run may not mint arbitrary package provenance.
 */
export function assertRetainedScenarioPackageReference(
  value: unknown,
): asserts value is ScenarioPackageReference {
  assertScenarioPackageReference(value);
  const retained = RETAINED_SCENARIO_PACKAGE_REFERENCES.find(
    ([id, version]) => id === value.id && version === value.version,
  );
  if (!retained || retained[2] !== value.contentHash) {
    throw new Error(
      "Scenario-package reference does not match an exact retained deployment package.",
    );
  }
}

export function retainedScenarioPackageReference(
  definition: ScenarioDefinition,
): ScenarioPackageReference {
  const reference = {
    schemaVersion: SCENARIO_PACKAGE_REFERENCE_SCHEMA_VERSION,
    id: definition.id,
    version: definition.version,
    contentHash: sha256HexSync(definition),
  };
  assertRetainedScenarioPackageReference(reference);
  return reference;
}
