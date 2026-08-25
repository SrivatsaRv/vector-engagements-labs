import { canonicalJson } from "./canonical-json.ts";
import { sha256Utf8HexSync } from "./geospatial/digest.ts";

export const SCENARIO_CAPABILITY_DESCRIPTOR_SCHEMA_VERSION =
  "vector.scenario-capability-descriptor.v1" as const;
export const SCENARIO_CAPABILITY_REGISTRY_SCHEMA_VERSION =
  "vector.scenario-capability-registry.v1" as const;
export const SCENARIO_CAPABILITY_EVIDENCE_SCHEMA_VERSION =
  "vector.scenario-capability-evidence.v1" as const;

const ID = /^[a-z0-9]+(?:[._:/-][a-z0-9]+)*$/;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const OWNERS = [
  "vector.contract.mission-scenario-runtime",
  "vector.contract.information-state",
  "vector.contract.ui-presentation-semantics",
] as const;
const SELECTORS = [
  "SCENARIO_IDENTITY",
  "ENTITY_IDENTITY",
  "TASK_IDENTITY",
  "CAPABILITY_REFERENCE",
] as const;

export type ScenarioCapabilityDescriptorSource = {
  schemaVersion: typeof SCENARIO_CAPABILITY_DESCRIPTOR_SCHEMA_VERSION;
  id: string;
  version: string;
  ownerContract: { id: typeof OWNERS[number]; version: string };
  intendedUse: { id: string; version: string };
  admission: {
    state: "UNAVAILABLE" | "AUTHORING_ONLY" | "INSPECTION_ONLY";
    reasonCode: string;
  };
  runtimeAuthority: "NONE";
  authoredFields: Array<{
    id: string;
    scope: "SCENARIO" | "ENTITY" | "TASK";
    valueDomain: "IDENTITY" | "POSITION" | "TIMING" | "REFERENCE";
    unit: "1" | "m" | "m/s" | "s" | "deg" | "rad" | "kg";
    datum: "NONE" | "WGS84" | "MSL" | "AGL";
    required: boolean;
  }>;
  outputs: Array<{
    id: string;
    source: "DERIVED" | "MODEL" | "RUNTIME";
    availability: "UNAVAILABLE";
    selector: typeof SELECTORS[number];
  }>;
  inspectors: Array<{
    id: string;
    localizationKey: string;
    selector: typeof SELECTORS[number];
  }>;
  dependencies: Array<{ id: string; version: string }>;
  evidence: Array<{
    id: string;
    version: string;
    digest: `sha256:${string}`;
    claim: "CONTRACT_TESTED" | "OWNER_REVIEWED";
  }>;
  invalidation: "DEPENDENTS_ONLY";
  reset: "REMOVE_DEPENDENT_VALUES";
};

export type GovernedScenarioCapabilityDescriptor = ScenarioCapabilityDescriptorSource & {
  canonicalBytes: string;
  digest: `sha256:${string}`;
};

export type ScenarioCapabilityRegistry = {
  schemaVersion: typeof SCENARIO_CAPABILITY_REGISTRY_SCHEMA_VERSION;
  descriptors: readonly GovernedScenarioCapabilityDescriptor[];
  canonicalBytes: string;
  digest: `sha256:${string}`;
};

export type GovernedScenarioCapabilityEvidence = {
  schemaVersion: typeof SCENARIO_CAPABILITY_EVIDENCE_SCHEMA_VERSION;
  id: string;
  version: string;
  claim: "CONTRACT_TESTED" | "OWNER_REVIEWED";
  sourcePath: string;
  assertionId: string;
  canonicalBytes: string;
  digest: `sha256:${string}`;
};

function exactKeys(value: Record<string, unknown>, required: readonly string[], label: string) {
  const actual = Object.keys(value).sort();
  const expected = [...required].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} keys must equal ${expected.join(", ")}.`);
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function stableId(value: unknown, label: string) {
  if (typeof value !== "string" || value.length > 128 || !ID.test(value)) {
    throw new TypeError(`${label} must be a bounded stable identifier.`);
  }
}

function semanticVersion(value: unknown, label: string) {
  if (typeof value !== "string" || value.length > 64 || !VERSION.test(value)) {
    throw new TypeError(`${label} must be a semantic version.`);
  }
}

function array(value: unknown, label: string, maximum = 10_000): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new TypeError(`${label} must be an array within the ${maximum}-item bound.`);
  }
  return value;
}

function uniqueIds(values: unknown[], label: string) {
  const seen = new Set<string>();
  for (const [index, candidate] of values.entries()) {
    const id = record(candidate, `${label}[${index}]`).id;
    stableId(id, `${label}[${index}].id`);
    if (seen.has(String(id))) throw new TypeError(`${label} repeats ${String(id)}.`);
    seen.add(String(id));
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

function compileEvidence(
  source: Omit<GovernedScenarioCapabilityEvidence, "canonicalBytes" | "digest">,
): GovernedScenarioCapabilityEvidence {
  stableId(source.id, "capability evidence id");
  semanticVersion(source.version, "capability evidence version");
  if (source.schemaVersion !== SCENARIO_CAPABILITY_EVIDENCE_SCHEMA_VERSION
    || !["CONTRACT_TESTED", "OWNER_REVIEWED"].includes(source.claim)
    || typeof source.sourcePath !== "string" || source.sourcePath.length > 256
    || !/^tests\/[a-z0-9./-]+$/.test(source.sourcePath)
    || typeof source.assertionId !== "string" || source.assertionId.length > 128
    || !ID.test(source.assertionId)) {
    throw new TypeError("Capability evidence identity is invalid.");
  }
  const canonicalBytes = canonicalJson(source);
  return deepFreeze({
    ...source,
    canonicalBytes,
    digest: `sha256:${sha256Utf8HexSync(canonicalBytes)}`,
  });
}

export const SCENARIO_CAPABILITY_EVIDENCE = deepFreeze([
  compileEvidence({
    schemaVersion: SCENARIO_CAPABILITY_EVIDENCE_SCHEMA_VERSION,
    id: "evidence.scenario-route-authoring-contract",
    version: "1.0.0",
    claim: "CONTRACT_TESTED",
    sourcePath: "tests/scenario-capabilities.test.mjs",
    assertionId: "route-authoring-owner-binding",
  }),
  compileEvidence({
    schemaVersion: SCENARIO_CAPABILITY_EVIDENCE_SCHEMA_VERSION,
    id: "evidence.scenario-observation-inspector-contract",
    version: "1.0.0",
    claim: "CONTRACT_TESTED",
    sourcePath: "tests/scenario-capabilities.test.mjs",
    assertionId: "observation-inspector-owner-binding",
  }),
  compileEvidence({
    schemaVersion: SCENARIO_CAPABILITY_EVIDENCE_SCHEMA_VERSION,
    id: "evidence.scenario-air-mission-adapter-contract",
    version: "1.0.0",
    claim: "CONTRACT_TESTED",
    sourcePath: "tests/scenario-kernel-adapters.test.mjs",
    assertionId: "published-air-mission-owner-binding",
  }),
] as const);

function resolveEvidence(id: string, version: string) {
  return SCENARIO_CAPABILITY_EVIDENCE.find((candidate) =>
    candidate.id === id && candidate.version === version) ?? null;
}

function evidenceReference(id: string) {
  const evidence = resolveEvidence(id, "1.0.0");
  if (!evidence) throw new TypeError(`Capability evidence ${id}@1.0.0 is not registered.`);
  return {
    id: evidence.id,
    version: evidence.version,
    digest: evidence.digest,
    claim: evidence.claim,
  };
}

export function validateScenarioCapabilityDescriptor(
  input: unknown,
): ScenarioCapabilityDescriptorSource {
  const value = record(input, "capability descriptor");
  exactKeys(value, [
    "schemaVersion", "id", "version", "ownerContract", "intendedUse", "admission",
    "runtimeAuthority", "authoredFields", "outputs", "inspectors", "dependencies",
    "evidence", "invalidation", "reset",
  ], "capability descriptor");
  if (value.schemaVersion !== SCENARIO_CAPABILITY_DESCRIPTOR_SCHEMA_VERSION) {
    throw new TypeError("Capability descriptor schema is unsupported.");
  }
  stableId(value.id, "capability descriptor id");
  semanticVersion(value.version, "capability descriptor version");
  const owner = record(value.ownerContract, "capability owner contract");
  exactKeys(owner, ["id", "version"], "capability owner contract");
  if (!OWNERS.includes(owner.id as typeof OWNERS[number])) throw new TypeError("Capability owner contract is not registered.");
  semanticVersion(owner.version, "capability owner contract version");
  const intendedUse = record(value.intendedUse, "capability intended use");
  exactKeys(intendedUse, ["id", "version"], "capability intended use");
  stableId(intendedUse.id, "capability intended-use id");
  semanticVersion(intendedUse.version, "capability intended-use version");
  const admission = record(value.admission, "capability admission");
  exactKeys(admission, ["state", "reasonCode"], "capability admission");
  if (!["UNAVAILABLE", "AUTHORING_ONLY", "INSPECTION_ONLY"].includes(String(admission.state))) {
    throw new TypeError("Capability admission state is unsupported.");
  }
  if (typeof admission.reasonCode !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(admission.reasonCode)) {
    throw new TypeError("Capability admission reason code is invalid.");
  }
  if (value.runtimeAuthority !== "NONE") throw new TypeError("Capability descriptors cannot grant runtime authority.");

  const authoredFields = array(value.authoredFields, "capability authored fields");
  uniqueIds(authoredFields, "capability authored fields");
  for (const [index, candidate] of authoredFields.entries()) {
    const field = record(candidate, `capability authored fields[${index}]`);
    exactKeys(field, ["id", "scope", "valueDomain", "unit", "datum", "required"], `capability authored fields[${index}]`);
    if (!["SCENARIO", "ENTITY", "TASK"].includes(String(field.scope))) throw new TypeError("Capability field scope is unsupported.");
    if (!["IDENTITY", "POSITION", "TIMING", "REFERENCE"].includes(String(field.valueDomain))) throw new TypeError("Capability field value domain is unsupported.");
    if (!["1", "m", "m/s", "s", "deg", "rad", "kg"].includes(String(field.unit))) throw new TypeError("Capability field unit is unsupported.");
    if (!["NONE", "WGS84", "MSL", "AGL"].includes(String(field.datum))) throw new TypeError("Capability field datum is unsupported.");
    if (typeof field.required !== "boolean") throw new TypeError("Capability field required state must be boolean.");
    if (field.datum === "WGS84" && field.unit !== "deg") throw new TypeError("WGS84 capability fields must use degrees.");
    if (["MSL", "AGL"].includes(String(field.datum)) && field.unit !== "m") throw new TypeError("Vertical capability fields must use metres.");
  }

  const outputs = array(value.outputs, "capability outputs");
  uniqueIds(outputs, "capability outputs");
  for (const [index, candidate] of outputs.entries()) {
    const output = record(candidate, `capability outputs[${index}]`);
    exactKeys(output, ["id", "source", "availability", "selector"], `capability outputs[${index}]`);
    if (!["DERIVED", "MODEL", "RUNTIME"].includes(String(output.source))) throw new TypeError("Capability output source is unsupported.");
    if (output.availability !== "UNAVAILABLE") throw new TypeError("Capability output cannot claim runtime availability.");
    if (!SELECTORS.includes(output.selector as typeof SELECTORS[number])) throw new TypeError("Capability output selector is unsupported.");
  }

  const inspectors = array(value.inspectors, "capability inspectors");
  uniqueIds(inspectors, "capability inspectors");
  for (const [index, candidate] of inspectors.entries()) {
    const inspector = record(candidate, `capability inspectors[${index}]`);
    exactKeys(inspector, ["id", "localizationKey", "selector"], `capability inspectors[${index}]`);
    stableId(inspector.localizationKey, `capability inspectors[${index}].localizationKey`);
    if (!SELECTORS.includes(inspector.selector as typeof SELECTORS[number])) throw new TypeError("Capability inspector selector is unsupported.");
  }

  const dependencies = array(value.dependencies, "capability dependencies");
  uniqueIds(dependencies, "capability dependencies");
  for (const [index, candidate] of dependencies.entries()) {
    const dependency = record(candidate, `capability dependencies[${index}]`);
    exactKeys(dependency, ["id", "version"], `capability dependencies[${index}]`);
    semanticVersion(dependency.version, `capability dependencies[${index}].version`);
  }
  const evidence = array(value.evidence, "capability evidence", 100);
  if (evidence.length === 0) throw new TypeError("Capability descriptor requires evidence.");
  uniqueIds(evidence, "capability evidence");
  for (const [index, candidate] of evidence.entries()) {
    const item = record(candidate, `capability evidence[${index}]`);
    exactKeys(item, ["id", "version", "digest", "claim"], `capability evidence[${index}]`);
    semanticVersion(item.version, `capability evidence[${index}].version`);
    if (typeof item.digest !== "string" || !DIGEST.test(item.digest)) throw new TypeError("Capability evidence digest is invalid.");
    if (!["CONTRACT_TESTED", "OWNER_REVIEWED"].includes(String(item.claim))) throw new TypeError("Capability evidence claim is unsupported.");
    if (typeof item.id === "string" && typeof item.version === "string") {
      const governed = resolveEvidence(item.id, item.version);
      if (!governed || governed.digest !== item.digest || governed.claim !== item.claim) {
        throw new TypeError("Capability evidence does not match a governed evidence identity.");
      }
    }
  }
  if (value.invalidation !== "DEPENDENTS_ONLY" || value.reset !== "REMOVE_DEPENDENT_VALUES") {
    throw new TypeError("Capability invalidation/reset policy is unsupported.");
  }
  return structuredClone(input) as ScenarioCapabilityDescriptorSource;
}

function compileDescriptor(source: ScenarioCapabilityDescriptorSource): GovernedScenarioCapabilityDescriptor {
  const validated = validateScenarioCapabilityDescriptor(source);
  const canonicalSource = {
    ...validated,
    authoredFields: [...validated.authoredFields].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    outputs: [...validated.outputs].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    inspectors: [...validated.inspectors].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    dependencies: [...validated.dependencies].sort((left, right) => `${left.id}@${left.version}` < `${right.id}@${right.version}` ? -1 : 1),
    evidence: [...validated.evidence].sort((left, right) => `${left.id}@${left.version}` < `${right.id}@${right.version}` ? -1 : 1),
  };
  const canonicalBytes = canonicalJson(canonicalSource);
  return deepFreeze({
    ...canonicalSource,
    canonicalBytes,
    digest: `sha256:${sha256Utf8HexSync(canonicalBytes)}`,
  });
}

const descriptorSources: ScenarioCapabilityDescriptorSource[] = [
  {
    schemaVersion: SCENARIO_CAPABILITY_DESCRIPTOR_SCHEMA_VERSION,
    id: "capability.route-authoring",
    version: "1.0.0",
    ownerContract: { id: "vector.contract.mission-scenario-runtime", version: "1.0.0" },
    intendedUse: { id: "vector.intended-use.geometry-teaching", version: "1.0.0" },
    admission: { state: "AUTHORING_ONLY", reasonCode: "AIR_ADAPTER_REQUIRED" },
    runtimeAuthority: "NONE",
    authoredFields: [{
      id: "route.start-position",
      scope: "ENTITY",
      valueDomain: "POSITION",
      unit: "deg",
      datum: "WGS84",
      required: true,
    }],
    outputs: [{
      id: "route.achieved-state",
      source: "RUNTIME",
      availability: "UNAVAILABLE",
      selector: "CAPABILITY_REFERENCE",
    }],
    inspectors: [{
      id: "inspector.route",
      localizationKey: "scenario.inspector.route",
      selector: "ENTITY_IDENTITY",
    }],
    dependencies: [],
    evidence: [evidenceReference("evidence.scenario-route-authoring-contract")],
    invalidation: "DEPENDENTS_ONLY",
    reset: "REMOVE_DEPENDENT_VALUES",
  },
  {
    schemaVersion: SCENARIO_CAPABILITY_DESCRIPTOR_SCHEMA_VERSION,
    id: "capability.observation-inspector",
    version: "1.0.0",
    ownerContract: { id: "vector.contract.information-state", version: "1.0.0" },
    intendedUse: { id: "vector.intended-use.geometry-teaching", version: "1.0.0" },
    admission: { state: "INSPECTION_ONLY", reasonCode: "RUNTIME_OBSERVATION_UNAVAILABLE" },
    runtimeAuthority: "NONE",
    authoredFields: [],
    outputs: [{
      id: "observation.state",
      source: "RUNTIME",
      availability: "UNAVAILABLE",
      selector: "CAPABILITY_REFERENCE",
    }],
    inspectors: [{
      id: "inspector.observation",
      localizationKey: "scenario.inspector.observation",
      selector: "CAPABILITY_REFERENCE",
    }],
    dependencies: [],
    evidence: [evidenceReference("evidence.scenario-observation-inspector-contract")],
    invalidation: "DEPENDENTS_ONLY",
    reset: "REMOVE_DEPENDENT_VALUES",
  },
  {
    schemaVersion: SCENARIO_CAPABILITY_DESCRIPTOR_SCHEMA_VERSION,
    id: "capability.air-mission",
    version: "1.0.0",
    ownerContract: { id: "vector.contract.mission-scenario-runtime", version: "1.0.0" },
    intendedUse: { id: "vector.intended-use.geometry-teaching", version: "1.0.0" },
    admission: { state: "AUTHORING_ONLY", reasonCode: "AIR_MISSION_OWNER_ADAPTER_REQUIRED" },
    runtimeAuthority: "NONE",
    authoredFields: [{
      id: "air-mission.definition-ref",
      scope: "TASK",
      valueDomain: "REFERENCE",
      unit: "1",
      datum: "NONE",
      required: true,
    }],
    outputs: [],
    inspectors: [{
      id: "inspector.air-mission",
      localizationKey: "scenario.inspector.air-mission",
      selector: "CAPABILITY_REFERENCE",
    }],
    dependencies: [{ id: "capability.route-authoring", version: "1.0.0" }],
    evidence: [evidenceReference("evidence.scenario-air-mission-adapter-contract")],
    invalidation: "DEPENDENTS_ONLY",
    reset: "REMOVE_DEPENDENT_VALUES",
  },
];

export function compileScenarioCapabilityRegistry(
  input: unknown,
): ScenarioCapabilityRegistry {
  if (!Array.isArray(input) || input.length > 10_000) {
    throw new TypeError("Capability registry sources must be an array within the 10,000-descriptor bound.");
  }
  const sources = input as ScenarioCapabilityDescriptorSource[];
  const descriptors = sources.map(compileDescriptor)
    .sort((left, right) => `${left.id}@${left.version}` < `${right.id}@${right.version}` ? -1 : 1);
  const descriptorKeys = new Set<string>();
  const descriptorByKey = new Map<string, GovernedScenarioCapabilityDescriptor>();
  for (const descriptor of descriptors) {
    const key = `${descriptor.id}@${descriptor.version}`;
    if (descriptorKeys.has(key)) throw new TypeError(`Capability registry repeats ${key}.`);
    descriptorKeys.add(key);
    descriptorByKey.set(key, descriptor);
  }
  const indegree = new Map([...descriptorKeys].map((key) => [key, 0]));
  const adjacency = new Map<string, string[]>();
  let edgeCount = 0;
  for (const descriptor of descriptors) {
    const key = `${descriptor.id}@${descriptor.version}`;
    const dependencies = descriptor.dependencies.map(({ id, version }) => `${id}@${version}`);
    for (const dependency of dependencies) {
      if (dependency === key) throw new TypeError(`Capability descriptor ${key} cannot depend on itself.`);
      if (!descriptorKeys.has(dependency)) throw new TypeError(`Capability descriptor ${key} has unavailable dependency ${dependency}.`);
      if (canonicalJson(descriptorByKey.get(dependency)?.intendedUse)
        !== canonicalJson(descriptor.intendedUse)) {
        throw new TypeError(`Capability descriptor ${key} has a dependency with a different intended use.`);
      }
      indegree.set(dependency, (indegree.get(dependency) ?? 0) + 1);
    }
    edgeCount += dependencies.length;
    if (edgeCount > 10_000) throw new TypeError("Capability registry exceeds the 10,000-edge bound.");
    adjacency.set(key, dependencies);
  }
  const queue = [...descriptorKeys].filter((key) => indegree.get(key) === 0);
  let visited = 0;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    visited += 1;
    for (const dependency of adjacency.get(queue[cursor]) ?? []) {
      const remaining = (indegree.get(dependency) ?? 0) - 1;
      indegree.set(dependency, remaining);
      if (remaining === 0) queue.push(dependency);
    }
  }
  if (visited !== descriptorKeys.size) throw new TypeError("Capability descriptor dependencies must be acyclic.");
  const registryMaterial = { schemaVersion: SCENARIO_CAPABILITY_REGISTRY_SCHEMA_VERSION, descriptors };
  const canonicalBytes = canonicalJson(registryMaterial);
  return deepFreeze({
    ...registryMaterial,
    descriptors,
    canonicalBytes,
    digest: `sha256:${sha256Utf8HexSync(canonicalBytes)}`,
  });
}

export const SCENARIO_CAPABILITY_REGISTRY = compileScenarioCapabilityRegistry(descriptorSources);

export function scenarioCapabilityRef(id: string, version = "1.0.0") {
  const descriptor = SCENARIO_CAPABILITY_REGISTRY.descriptors.find((candidate) =>
    candidate.id === id && candidate.version === version);
  if (!descriptor) throw new RangeError(`Capability descriptor ${id}@${version} is not registered.`);
  return Object.freeze({
    id: descriptor.id,
    version: descriptor.version,
    ownerContract: descriptor.ownerContract,
    descriptorDigest: descriptor.digest,
    intendedUse: descriptor.intendedUse,
  });
}

export function resolveScenarioCapability(id: string, version: string) {
  return SCENARIO_CAPABILITY_REGISTRY.descriptors.find((candidate) =>
    candidate.id === id && candidate.version === version) ?? null;
}
