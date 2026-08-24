import { CURRENT_MODEL_PACK_DIGEST } from "../reference-model-pack.ts";
import type { EngineBackendId } from "../engine/contracts.ts";
import type { EngagementDomain } from "../engine/primitives.ts";
import { sha256HexSync } from "../geospatial/digest.ts";
import deploymentConfiguration from "../../config/deployment-capabilities.json" with {
  type: "json",
};

export const DEPLOYMENT_CAPABILITY_SCHEMA =
  "vector.deployment-capabilities.v1" as const;

export type CapabilityState =
  | "ENABLED"
  | "DISABLED_BY_DEPLOYMENT"
  | "UNSUPPORTED_BY_MODEL_PACK"
  | "INCOMPATIBLE"
  | "LOADING"
  | "FAILED"
  | "STALE";

export type CapabilityDecision = {
  state: CapabilityState;
  reason: string;
  operatorGuidance: string;
};

export type OptionalCapability =
  | "environment"
  | "weather"
  | "terrain"
  | "sensors"
  | "datalink"
  | "aew"
  | "ew"
  | "weapons"
  | "savedRunCompatibility";

const DOMAINS: readonly EngagementDomain[] = ["A2A", "A2G", "G2A", "G2G"];
const OPTIONAL_CAPABILITIES: readonly OptionalCapability[] = [
  "environment",
  "weather",
  "terrain",
  "sensors",
  "datalink",
  "aew",
  "ew",
  "weapons",
  "savedRunCompatibility",
];

export type DeploymentCapabilityManifest = {
  schemaVersion: typeof DEPLOYMENT_CAPABILITY_SCHEMA;
  digest: string;
  configurationSource: "repository/deployment-capabilities";
  buildIdentity: string;
  domains: Record<EngagementDomain, CapabilityDecision>;
  missionClasses: readonly ["TACTICAL_INTERCEPT"];
  startPostures: readonly ["AIRBORNE"];
  optionalCapabilities: Record<OptionalCapability, CapabilityDecision>;
  admittedModelPackDigests: readonly string[];
  engine: {
    id: EngineBackendId;
    version: "vector-engine.v1";
  };
};

export type DeploymentCapabilityInput = Omit<
  DeploymentCapabilityManifest,
  "digest"
>;

/**
 * A deployment artifact can cross a browser Worker boundary, but it must not
 * become a second configuration authority there. This verification result is
 * deliberately small and contains no scenario, environment, or request data.
 */
export type CapabilityManifestIdentity = Pick<
  DeploymentCapabilityManifest,
  "schemaVersion" | "digest"
> & {
  engineId: EngineBackendId;
};

const STATES = new Set<CapabilityState>([
  "ENABLED",
  "DISABLED_BY_DEPLOYMENT",
  "UNSUPPORTED_BY_MODEL_PACK",
  "INCOMPATIBLE",
  "LOADING",
  "FAILED",
  "STALE",
]);
const BACKENDS = new Set<EngineBackendId>(["rust-wasm", "typescript"]);

export class CapabilityAdmissionError extends Error {
  readonly code:
    | "CAPABILITY_CONFIG_INVALID"
    | "DOMAIN_DISABLED"
    | "SCENARIO_ENGINE_FORBIDDEN"
    | "CAPABILITY_MANIFEST_STALE";

  constructor(
    code:
      | "CAPABILITY_CONFIG_INVALID"
      | "DOMAIN_DISABLED"
      | "SCENARIO_ENGINE_FORBIDDEN"
      | "CAPABILITY_MANIFEST_STALE",
    message: string,
  ) {
    super(message);
    this.name = "CapabilityAdmissionError";
    this.code = code;
  }
}

function validateDecision(path: string, decision: CapabilityDecision) {
  if (!STATES.has(decision.state)) {
    throw new CapabilityAdmissionError(
      "CAPABILITY_CONFIG_INVALID",
      `${path} has an unknown capability state.`,
    );
  }
  if (!decision.reason.trim() || !decision.operatorGuidance.trim()) {
    throw new CapabilityAdmissionError(
      "CAPABILITY_CONFIG_INVALID",
      `${path} must include a reason and operator guidance.`,
    );
  }
}

function validateExactKeys(
  path: string,
  actual: Record<string, unknown>,
  expected: readonly string[],
) {
  const unknown = Object.keys(actual).filter((key) => !expected.includes(key));
  const missing = expected.filter((key) => !Object.hasOwn(actual, key));
  if (unknown.length || missing.length) {
    throw new CapabilityAdmissionError(
      "CAPABILITY_CONFIG_INVALID",
      `${path} must declare exactly the supported capability keys.`,
    );
  }
}

export function createDeploymentCapabilityManifest(
  input: DeploymentCapabilityInput,
): DeploymentCapabilityManifest {
  if (input.schemaVersion !== DEPLOYMENT_CAPABILITY_SCHEMA) {
    throw new CapabilityAdmissionError(
      "CAPABILITY_CONFIG_INVALID",
      "The deployment capability manifest schema is not supported.",
    );
  }
  if (!BACKENDS.has(input.engine.id)) {
    throw new CapabilityAdmissionError(
      "CAPABILITY_CONFIG_INVALID",
      "The deployment engine is not supported.",
    );
  }
  validateExactKeys("domains", input.domains, DOMAINS);
  validateExactKeys(
    "optionalCapabilities",
    input.optionalCapabilities,
    OPTIONAL_CAPABILITIES,
  );
  for (const [domain, decision] of Object.entries(input.domains)) {
    validateDecision(`domains.${domain}`, decision);
  }
  for (const [capability, decision] of Object.entries(
    input.optionalCapabilities,
  )) {
    validateDecision(`optionalCapabilities.${capability}`, decision);
  }
  if (!input.admittedModelPackDigests.length) {
    throw new CapabilityAdmissionError(
      "CAPABILITY_CONFIG_INVALID",
      "At least one model-pack digest must be admitted.",
    );
  }
  if (!input.admittedModelPackDigests.includes(CURRENT_MODEL_PACK_DIGEST)) {
    throw new CapabilityAdmissionError(
      "CAPABILITY_CONFIG_INVALID",
      "The current model-pack digest is not admitted by the deployment.",
    );
  }
  const digest = sha256HexSync(input);
  return Object.freeze({ ...input, digest });
}

function manifestInput(
  manifest: DeploymentCapabilityManifest,
): DeploymentCapabilityInput {
  return Object.fromEntries(
    Object.entries(manifest).filter(([key]) => key !== "digest"),
  ) as DeploymentCapabilityInput;
}

/**
 * Recompute the content address after a structured-clone or persisted record
 * boundary. A correct shape with a changed digest is stale, not admissible.
 */
export function verifyCapabilityManifest(
  manifest: DeploymentCapabilityManifest,
): DeploymentCapabilityManifest {
  const expected = createDeploymentCapabilityManifest(manifestInput(manifest));
  if (manifest.digest !== expected.digest) {
    throw new CapabilityAdmissionError(
      "CAPABILITY_MANIFEST_STALE",
      "The deployment capability manifest digest does not match its content.",
    );
  }
  return expected;
}

export function capabilityManifestIdentity(
  manifest: DeploymentCapabilityManifest,
): CapabilityManifestIdentity {
  return {
    schemaVersion: manifest.schemaVersion,
    digest: manifest.digest,
    engineId: manifest.engine.id,
  };
}

/**
 * Product Workers use the manifest embedded in their own deployment. A
 * well-formed manifest from another deployment is explicitly stale; only
 * parity fixtures may use a verification manifest outside this boundary.
 */
export function admitWorkerCapabilityManifest(
  manifest: DeploymentCapabilityManifest,
): DeploymentCapabilityManifest {
  const verified = verifyCapabilityManifest(manifest);
  if (verified.digest !== DEPLOYMENT_CAPABILITIES.digest) {
    throw new CapabilityAdmissionError(
      "CAPABILITY_MANIFEST_STALE",
      "The compiled scenario was prepared for a different deployment capability manifest.",
    );
  }
  return verified;
}

const enabled = (reason: string): CapabilityDecision => ({
  state: "ENABLED",
  reason,
  operatorGuidance: "This capability is available in this deployment.",
});

const configuredInput = deploymentConfiguration as unknown as DeploymentCapabilityInput;
const DEPLOYMENT_INPUT: DeploymentCapabilityInput = configuredInput;

export const DEPLOYMENT_CAPABILITIES =
  createDeploymentCapabilityManifest(DEPLOYMENT_INPUT);

/**
 * Creates a complete deployment artifact for parity and adapter verification.
 * Product code uses DEPLOYMENT_CAPABILITIES and never accepts this as scenario
 * input.
 */
export function createVerificationDeploymentCapabilities(
  engine: EngineBackendId,
  enabledDomains: readonly EngagementDomain[] = ["A2A"],
  additionalModelPackDigests: readonly string[] = [],
) {
  const admitted = new Set(enabledDomains);
  return createDeploymentCapabilityManifest({
    ...DEPLOYMENT_INPUT,
    buildIdentity: `verification-${engine}`,
    engine: { ...DEPLOYMENT_INPUT.engine, id: engine },
    admittedModelPackDigests: [
      ...DEPLOYMENT_INPUT.admittedModelPackDigests,
      ...additionalModelPackDigests,
    ],
    optionalCapabilities: {
      ...DEPLOYMENT_INPUT.optionalCapabilities,
      ...(additionalModelPackDigests.length > 0
        ? { sensors: enabled("The generic engine-verification sensor fixture is admitted.") }
        : {}),
    },
    domains: Object.fromEntries(
      Object.entries(DEPLOYMENT_INPUT.domains).map(([domain, decision]) => [
        domain,
        admitted.has(domain as EngagementDomain)
          ? enabled(`The ${domain} verification fixture is admitted.`)
          : decision,
      ]),
    ) as Record<EngagementDomain, CapabilityDecision>,
  });
}

export function domainCapability(
  domain: EngagementDomain,
  manifest = DEPLOYMENT_CAPABILITIES,
) {
  return manifest.domains[domain];
}

/** The manifest is the sole deployment authority for optional subsystem use. */
export function optionalCapability(
  capability: OptionalCapability,
  manifest = DEPLOYMENT_CAPABILITIES,
) {
  return manifest.optionalCapabilities[capability];
}

export function isOptionalCapabilityEnabled(
  capability: OptionalCapability,
  manifest = DEPLOYMENT_CAPABILITIES,
) {
  return optionalCapability(capability, manifest).state === "ENABLED";
}

export function admitScenarioCapabilities(
  scenario: { domain: EngagementDomain } & Record<string, unknown>,
  manifest = DEPLOYMENT_CAPABILITIES,
) {
  if (Object.prototype.hasOwnProperty.call(scenario, "engineBackend")) {
    throw new CapabilityAdmissionError(
      "SCENARIO_ENGINE_FORBIDDEN",
      "A scenario cannot select the deployment engine.",
    );
  }
  const decision = manifest.domains[scenario.domain];
  if (!decision || decision.state !== "ENABLED") {
    throw new CapabilityAdmissionError(
      "DOMAIN_DISABLED",
      decision?.reason ?? "The scenario domain is not known to this deployment.",
    );
  }
  return manifest;
}
