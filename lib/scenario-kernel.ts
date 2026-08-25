import { canonicalJson } from "./canonical-json.ts";
import { sha256Utf8HexSync } from "./geospatial/digest.ts";
import {
  type GovernedScenarioCapabilityDescriptor,
  resolveScenarioCapability,
} from "./scenario-capabilities.ts";

/**
 * Scenario-independent composition authority. This contract intentionally owns
 * authored identity, references, and safe presentation discovery only. It does
 * not authorize a model, controller, sensor, weapon, renderer, or engine path.
 * The #60 Air authoring/compiler contract remains the execution owner; the
 * explicit identity-only adapter in scenario-kernel-adapters.ts binds it.
 */
export const SCENARIO_KERNEL_SCHEMA_VERSION = "vector.scenario-kernel.v1" as const;
export const SCENARIO_KERNEL_PROJECTION_SCHEMA_VERSION =
  "vector.scenario-kernel-projection.v1" as const;

export type ScenarioKernelSurface =
  | "CONSTRUCT"
  | "OBSERVE"
  | "EXPLAIN"
  | "COMPARE"
  | "REPLAY"
  | "EXPORT";

export type ScenarioKernelCapabilityRef = {
  id: string;
  version: string;
  ownerContract: { id: string; version: string };
  descriptorDigest: `sha256:${string}`;
  intendedUse: { id: string; version: string };
};

export type ScenarioKernelInput = {
  schemaVersion: typeof SCENARIO_KERNEL_SCHEMA_VERSION;
  id: string;
  version: string;
  purpose: string;
  provenance: {
    source: "USER_AUTHORED" | "IMPORTED" | "TEMPLATE";
    sourceId: string;
  };
  intendedUse: { id: string; version: string };
  affiliations: Array<{
    id: string;
    displayName: string;
    category: "FORCE" | "NEUTRAL" | "CIVIL" | "UNKNOWN";
  }>;
  relationships: Array<{
    id: string;
    sourceAffiliationId: string;
    targetAffiliationId: string;
    disposition: "ALLIED" | "HOSTILE" | "NEUTRAL" | "UNKNOWN";
  }>;
  organizations: Array<{
    id: string;
    displayName: string;
    kind: "COALITION" | "FORCE" | "ORGANIZATION" | "GROUP" | "PACKAGE" | "FORMATION";
    affiliationId: string;
    parentOrganizationId?: string;
  }>;
  entities: Array<{
    id: string;
    displayName: string;
    domain: "AIR" | "LAND" | "MARITIME" | "SPACE" | "CYBER" | "OTHER";
    kind: "PLATFORM" | "INSTALLATION" | "AREA" | "LOGICAL_GROUP";
    affiliationId: string;
    organizationId?: string;
    capabilityRefs: ScenarioKernelCapabilityRef[];
  }>;
  tasks: Array<{
    id: string;
    kind: "SUPPORT" | "ESCORT" | "PROTECT" | "OBSERVE" | "ROUTE" | "AREA";
    ownerOrganizationId: string;
    participantEntityIds: string[];
    objective: { kind: "ENTITY" | "ORGANIZATION" | "TASK"; id: string };
    timing: { notBeforeSeconds: number; notAfterSeconds: number };
    dependencyTaskIds: string[];
    capabilityRefs: ScenarioKernelCapabilityRef[];
    lifecycle: "AUTHORED";
  }>;
  perspectives: Array<{
    id: string;
    kind: "AUTHORING_ADMIN" | "ADJUDICATOR" | "FORCE_OBSERVED" | "REDACTED_PUBLIC";
    ownerAffiliationId?: string;
    visibleAffiliationIds: string[];
    exposeScenarioIdentity: boolean;
    exposeScenarioPurpose: boolean;
    capabilityVisibility: "NONE" | "VISIBLE_REFERENCES";
    surfaces: ScenarioKernelSurface[];
  }>;
};

export type CompiledScenarioKernel = ScenarioKernelInput & {
  capabilityDescriptors: readonly GovernedScenarioCapabilityDescriptor[];
  canonicalBytes: string;
  digest: string;
};

export type ScenarioKernelProjection = {
  schemaVersion: typeof SCENARIO_KERNEL_PROJECTION_SCHEMA_VERSION;
  scenario: { id: string; version: string } | null;
  perspective: {
    kind: ScenarioKernelInput["perspectives"][number]["kind"];
    policyDigest: string;
  };
  surface: ScenarioKernelSurface;
  purpose: string | null;
  affiliations: ScenarioKernelInput["affiliations"];
  relationships: ScenarioKernelInput["relationships"];
  organizations: ScenarioKernelInput["organizations"];
  entities: ScenarioKernelInput["entities"];
  tasks: ScenarioKernelInput["tasks"];
  capabilityDescriptors?: readonly GovernedScenarioCapabilityDescriptor[];
  digest: string;
};

export type ScenarioKernelIssue = {
  code:
    | "KERNEL_INVALID_SCHEMA"
    | "KERNEL_INVALID_TYPE"
    | "KERNEL_UNKNOWN_FIELD"
    | "KERNEL_MISSING_FIELD"
    | "KERNEL_INVALID_ID"
    | "KERNEL_INVALID_ENUM"
    | "KERNEL_INVALID_VALUE"
    | "KERNEL_DUPLICATE_ID"
    | "KERNEL_DUPLICATE_REFERENCE"
    | "KERNEL_DIGEST_MISMATCH"
    | "KERNEL_DANGLING_REFERENCE"
    | "KERNEL_SELF_REFERENCE"
    | "KERNEL_ORGANIZATION_CYCLE"
    | "KERNEL_TASK_CYCLE"
    | "KERNEL_GRAPH_LIMIT_EXCEEDED"
    | "KERNEL_PERSPECTIVE_POLICY_INVALID";
  path: string;
  message: string;
};

export class ScenarioKernelValidationError extends Error {
  readonly issues: readonly ScenarioKernelIssue[];

  constructor(issues: readonly ScenarioKernelIssue[]) {
    super(`Scenario kernel validation failed with ${issues.length} issue${issues.length === 1 ? "" : "s"}.`);
    this.name = "ScenarioKernelValidationError";
    this.issues = issues;
  }
}

type KernelRecord = Record<string, unknown>;
type KernelIssueCode = ScenarioKernelIssue["code"];

const KERNEL_ID = /^[a-z0-9]+(?:[._:/-][a-z0-9]+)*$/;
const KERNEL_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/;
const SHA256_IDENTITY = /^sha256:[0-9a-f]{64}$/;
const MAX_KERNEL_GRAPH_EDGES = 10_000;

function kernelIssue(
  issues: ScenarioKernelIssue[],
  code: KernelIssueCode,
  path: string,
  message: string,
) {
  issues.push({ code, path, message });
}

function kernelRecord(
  value: unknown,
  path: string,
  issues: ScenarioKernelIssue[],
): KernelRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    kernelIssue(issues, "KERNEL_INVALID_TYPE", path, `${path} must be an object.`);
    return null;
  }
  return value as KernelRecord;
}

function kernelExactKeys(
  value: KernelRecord,
  path: string,
  required: readonly string[],
  optional: readonly string[],
  issues: ScenarioKernelIssue[],
) {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      kernelIssue(issues, "KERNEL_UNKNOWN_FIELD", path, `${path} contains unsupported field ${key}.`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      kernelIssue(issues, "KERNEL_MISSING_FIELD", `${path}.${key}`, `${path}.${key} is required.`);
    }
  }
}

function kernelArray(
  value: unknown,
  path: string,
  issues: ScenarioKernelIssue[],
  maximumLength = 10_000,
): unknown[] {
  if (!Array.isArray(value)) {
    kernelIssue(issues, "KERNEL_INVALID_TYPE", path, `${path} must be an array.`);
    return [];
  }
  if (value.length > maximumLength) {
    kernelIssue(issues, "KERNEL_INVALID_VALUE", path, `${path} exceeds the ${maximumLength}-item admission bound.`);
    return [];
  }
  return value;
}

function kernelString(
  value: unknown,
  path: string,
  issues: ScenarioKernelIssue[],
  options: { id?: boolean; version?: boolean; nonEmpty?: boolean } = {},
) {
  if (typeof value !== "string") {
    kernelIssue(issues, "KERNEL_INVALID_TYPE", path, `${path} must be a string.`);
    return;
  }
  const maximumLength = options.id ? 128 : options.version ? 64 : 4096;
  if (value.length > maximumLength) {
    kernelIssue(issues, "KERNEL_INVALID_VALUE", path, `${path} exceeds the ${maximumLength}-character admission bound.`);
  }
  if (options.nonEmpty && !value.trim()) {
    kernelIssue(issues, "KERNEL_INVALID_VALUE", path, `${path} must not be empty.`);
  }
  const pattern = options.id ? KERNEL_ID : options.version ? KERNEL_VERSION : null;
  if (pattern && !pattern.test(value)) {
    kernelIssue(issues, "KERNEL_INVALID_ID", path, `${path} has an invalid stable identifier.`);
  }
}

function kernelEnum(
  value: unknown,
  path: string,
  allowed: readonly string[],
  issues: ScenarioKernelIssue[],
) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    kernelIssue(issues, "KERNEL_INVALID_ENUM", path, `${path} is not a supported value.`);
  }
}

function kernelBoolean(value: unknown, path: string, issues: ScenarioKernelIssue[]) {
  if (typeof value !== "boolean") {
    kernelIssue(issues, "KERNEL_INVALID_TYPE", path, `${path} must be boolean.`);
  }
}

function kernelFiniteNonNegative(value: unknown, path: string, issues: ScenarioKernelIssue[]) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    kernelIssue(issues, "KERNEL_INVALID_VALUE", path, `${path} must be a finite non-negative number.`);
  }
}

function kernelUniqueIds(
  values: unknown[],
  path: string,
  issues: ScenarioKernelIssue[],
) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const id = kernelRecord(value, `${path}[${index}]`, issues)?.id;
    if (typeof id !== "string") return;
    if (seen.has(id)) {
      kernelIssue(issues, "KERNEL_DUPLICATE_ID", `${path}[${index}].id`, `${id} is duplicated.`);
    }
    seen.add(id);
  });
  return seen;
}

function kernelUniqueStringArray(
  value: unknown,
  path: string,
  issues: ScenarioKernelIssue[],
) {
  const values = kernelArray(value, path, issues);
  const seen = new Set<string>();
  values.forEach((item, index) => {
    kernelString(item, `${path}[${index}]`, issues, { id: true });
    if (typeof item !== "string") return;
    if (seen.has(item)) {
      kernelIssue(issues, "KERNEL_DUPLICATE_REFERENCE", `${path}[${index}]`, `${item} is duplicated.`);
    }
    seen.add(item);
  });
  return values;
}

function kernelUniqueEnumArray(
  value: unknown,
  path: string,
  allowed: readonly string[],
  issues: ScenarioKernelIssue[],
  maximumLength = 10_000,
) {
  const values = kernelArray(value, path, issues, maximumLength);
  const seen = new Set<string>();
  values.forEach((item, index) => {
    kernelEnum(item, `${path}[${index}]`, allowed, issues);
    if (typeof item !== "string") return;
    if (seen.has(item)) {
      kernelIssue(issues, "KERNEL_DUPLICATE_REFERENCE", `${path}[${index}]`, `${item} is duplicated.`);
    }
    seen.add(item);
  });
  return values;
}

function validateCapabilityRefs(
  value: unknown,
  path: string,
  issues: ScenarioKernelIssue[],
  intendedUse: KernelRecord | null,
) {
  const refs = kernelArray(value, path, issues);
  const seen = new Set<string>();
  refs.forEach((candidate, index) => {
    const refPath = `${path}[${index}]`;
    const ref = kernelRecord(candidate, refPath, issues);
    if (!ref) return;
    kernelExactKeys(ref, refPath, ["id", "version", "ownerContract", "descriptorDigest", "intendedUse"], [], issues);
    kernelString(ref.id, `${refPath}.id`, issues, { id: true });
    kernelString(ref.version, `${refPath}.version`, issues, { version: true });
    const ownerContract = kernelRecord(ref.ownerContract, `${refPath}.ownerContract`, issues);
    if (ownerContract) {
      kernelExactKeys(ownerContract, `${refPath}.ownerContract`, ["id", "version"], [], issues);
      kernelString(ownerContract.id, `${refPath}.ownerContract.id`, issues, { id: true });
      kernelString(ownerContract.version, `${refPath}.ownerContract.version`, issues, { version: true });
    }
    if (typeof ref.descriptorDigest !== "string" || !SHA256_IDENTITY.test(ref.descriptorDigest)) {
      kernelIssue(
        issues,
        "KERNEL_INVALID_VALUE",
        `${refPath}.descriptorDigest`,
        `${refPath}.descriptorDigest must be a lowercase SHA-256 content identity.`,
      );
    }
    const refIntendedUse = kernelRecord(ref.intendedUse, `${refPath}.intendedUse`, issues);
    if (refIntendedUse) {
      kernelExactKeys(refIntendedUse, `${refPath}.intendedUse`, ["id", "version"], [], issues);
      kernelString(refIntendedUse.id, `${refPath}.intendedUse.id`, issues, { id: true });
      kernelString(refIntendedUse.version, `${refPath}.intendedUse.version`, issues, { version: true });
      if (typeof intendedUse?.id === "string"
        && typeof intendedUse.version === "string"
        && (refIntendedUse.id !== intendedUse.id || refIntendedUse.version !== intendedUse.version)) {
        kernelIssue(
          issues,
          "KERNEL_INVALID_VALUE",
          `${refPath}.intendedUse`,
          "Capability reference intended use must match the scenario intended use identity and version.",
        );
      }
    }
    if (typeof ref.id === "string" && typeof ref.version === "string") {
      const key = `${ref.id}@${ref.version}`;
      if (seen.has(key)) {
        kernelIssue(issues, "KERNEL_DUPLICATE_REFERENCE", refPath, `${key} is duplicated.`);
      }
      seen.add(key);
      const descriptor = resolveScenarioCapability(ref.id, ref.version);
      if (!descriptor) {
        kernelIssue(issues, "KERNEL_DANGLING_REFERENCE", refPath, `${key} is not present in the governed capability registry.`);
      } else {
        if (ref.descriptorDigest !== descriptor.digest) {
          kernelIssue(issues, "KERNEL_DIGEST_MISMATCH", `${refPath}.descriptorDigest`, "Capability reference digest does not match its governed descriptor.");
        }
        if (canonicalJson(ref.ownerContract) !== canonicalJson(descriptor.ownerContract)) {
          kernelIssue(issues, "KERNEL_INVALID_VALUE", `${refPath}.ownerContract`, "Capability owner contract does not match its governed descriptor.");
        }
        if (canonicalJson(ref.intendedUse) !== canonicalJson(descriptor.intendedUse)) {
          kernelIssue(issues, "KERNEL_INVALID_VALUE", `${refPath}.intendedUse`, "Capability intended use does not match its governed descriptor.");
        }
      }
    }
  });
  return refs;
}

function validateKernelGraph(
  ids: Iterable<string>,
  edges: (id: string) => readonly string[],
) {
  const idSet = new Set(ids);
  const adjacency = new Map<string, string[]>();
  const indegree = new Map([...idSet].map((id) => [id, 0]));
  let edgeCount = 0;
  for (const id of idSet) {
    const admittedEdges = [...new Set(edges(id))].filter((target) => idSet.has(target));
    edgeCount += admittedEdges.length;
    if (edgeCount > MAX_KERNEL_GRAPH_EDGES) return "LIMIT_EXCEEDED" as const;
    adjacency.set(id, admittedEdges);
    for (const target of admittedEdges) indegree.set(target, (indegree.get(target) ?? 0) + 1);
  }
  const queue = [...idSet].filter((id) => indegree.get(id) === 0);
  let cursor = 0;
  let visited = 0;
  while (cursor < queue.length) {
    const id = queue[cursor];
    cursor += 1;
    visited += 1;
    for (const target of adjacency.get(id) ?? []) {
      const remaining = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, remaining);
      if (remaining === 0) queue.push(target);
    }
  }
  return visited === idSet.size ? "ACYCLIC" as const : "CYCLIC" as const;
}

function validateScenarioKernel(input: unknown): asserts input is ScenarioKernelInput {
  const issues: ScenarioKernelIssue[] = [];
  const root = kernelRecord(input, "$", issues);
  if (!root) throw new ScenarioKernelValidationError(issues);
  kernelExactKeys(root, "$", [
    "schemaVersion", "id", "version", "purpose", "provenance", "intendedUse", "affiliations",
    "relationships", "organizations", "entities", "tasks", "perspectives",
  ], [], issues);
  if (root.schemaVersion !== SCENARIO_KERNEL_SCHEMA_VERSION) {
    kernelIssue(issues, "KERNEL_INVALID_SCHEMA", "$.schemaVersion", "Scenario kernel schema is not supported.");
  }
  kernelString(root.id, "$.id", issues, { id: true });
  kernelString(root.version, "$.version", issues, { version: true });
  kernelString(root.purpose, "$.purpose", issues, { nonEmpty: true });

  const provenance = kernelRecord(root.provenance, "$.provenance", issues);
  if (provenance) {
    kernelExactKeys(provenance, "$.provenance", ["source", "sourceId"], [], issues);
    kernelEnum(provenance.source, "$.provenance.source", ["USER_AUTHORED", "IMPORTED", "TEMPLATE"], issues);
    kernelString(provenance.sourceId, "$.provenance.sourceId", issues, { id: true });
  }
  const intendedUse = kernelRecord(root.intendedUse, "$.intendedUse", issues);
  if (intendedUse) {
    kernelExactKeys(intendedUse, "$.intendedUse", ["id", "version"], [], issues);
    kernelString(intendedUse.id, "$.intendedUse.id", issues, { id: true });
    kernelString(intendedUse.version, "$.intendedUse.version", issues, { version: true });
  }

  const affiliations = kernelArray(root.affiliations, "$.affiliations", issues);
  const affiliationIds = kernelUniqueIds(affiliations, "$.affiliations", issues);
  affiliations.forEach((candidate, index) => {
    const path = `$.affiliations[${index}]`;
    const value = kernelRecord(candidate, path, issues);
    if (!value) return;
    kernelExactKeys(value, path, ["id", "displayName", "category"], [], issues);
    kernelString(value.id, `${path}.id`, issues, { id: true });
    kernelString(value.displayName, `${path}.displayName`, issues, { nonEmpty: true });
    kernelEnum(value.category, `${path}.category`, ["FORCE", "NEUTRAL", "CIVIL", "UNKNOWN"], issues);
  });

  const relationships = kernelArray(root.relationships, "$.relationships", issues);
  kernelUniqueIds(relationships, "$.relationships", issues);
  const relationshipPairs = new Set<string>();
  relationships.forEach((candidate, index) => {
    const path = `$.relationships[${index}]`;
    const value = kernelRecord(candidate, path, issues);
    if (!value) return;
    kernelExactKeys(value, path, ["id", "sourceAffiliationId", "targetAffiliationId", "disposition"], [], issues);
    kernelString(value.id, `${path}.id`, issues, { id: true });
    kernelString(value.sourceAffiliationId, `${path}.sourceAffiliationId`, issues, { id: true });
    kernelString(value.targetAffiliationId, `${path}.targetAffiliationId`, issues, { id: true });
    kernelEnum(value.disposition, `${path}.disposition`, ["ALLIED", "HOSTILE", "NEUTRAL", "UNKNOWN"], issues);
    for (const field of ["sourceAffiliationId", "targetAffiliationId"] as const) {
      const ref = value[field];
      if (typeof ref === "string" && !affiliationIds.has(ref)) {
        kernelIssue(issues, "KERNEL_DANGLING_REFERENCE", `${path}.${field}`, `${ref} does not identify an affiliation.`);
      }
    }
    if (value.sourceAffiliationId === value.targetAffiliationId) {
      kernelIssue(issues, "KERNEL_SELF_REFERENCE", `${path}.targetAffiliationId`, "An affiliation relationship cannot target itself.");
    }
    if (typeof value.sourceAffiliationId === "string" && typeof value.targetAffiliationId === "string") {
      const pair = `${value.sourceAffiliationId}->${value.targetAffiliationId}`;
      if (relationshipPairs.has(pair)) {
        kernelIssue(issues, "KERNEL_DUPLICATE_REFERENCE", path, `${pair} has more than one disposition.`);
      }
      relationshipPairs.add(pair);
    }
  });

  const organizations = kernelArray(root.organizations, "$.organizations", issues);
  const organizationIds = kernelUniqueIds(organizations, "$.organizations", issues);
  const organizationParents = new Map<string, string[]>();
  organizations.forEach((candidate, index) => {
    const path = `$.organizations[${index}]`;
    const value = kernelRecord(candidate, path, issues);
    if (!value) return;
    kernelExactKeys(value, path, ["id", "displayName", "kind", "affiliationId"], ["parentOrganizationId"], issues);
    kernelString(value.id, `${path}.id`, issues, { id: true });
    kernelString(value.displayName, `${path}.displayName`, issues, { nonEmpty: true });
    kernelEnum(value.kind, `${path}.kind`, ["COALITION", "FORCE", "ORGANIZATION", "GROUP", "PACKAGE", "FORMATION"], issues);
    kernelString(value.affiliationId, `${path}.affiliationId`, issues, { id: true });
    if (typeof value.affiliationId === "string" && !affiliationIds.has(value.affiliationId)) {
      kernelIssue(issues, "KERNEL_DANGLING_REFERENCE", `${path}.affiliationId`, `${value.affiliationId} does not identify an affiliation.`);
    }
    if (Object.hasOwn(value, "parentOrganizationId")) {
      kernelString(value.parentOrganizationId, `${path}.parentOrganizationId`, issues, { id: true });
      if (value.parentOrganizationId === value.id) {
        kernelIssue(issues, "KERNEL_SELF_REFERENCE", `${path}.parentOrganizationId`, "An organization cannot parent itself.");
      } else if (typeof value.parentOrganizationId === "string" && !organizationIds.has(value.parentOrganizationId)) {
        kernelIssue(issues, "KERNEL_DANGLING_REFERENCE", `${path}.parentOrganizationId`, `${value.parentOrganizationId} does not identify an organization.`);
      }
    }
    if (typeof value.id === "string") {
      organizationParents.set(value.id, typeof value.parentOrganizationId === "string" ? [value.parentOrganizationId] : []);
    }
  });
  const organizationGraph = validateKernelGraph(organizationIds, (id) => organizationParents.get(id) ?? []);
  if (organizationGraph === "LIMIT_EXCEEDED") {
    kernelIssue(issues, "KERNEL_GRAPH_LIMIT_EXCEEDED", "$.organizations", "Organization graph exceeds the 10,000-edge admission bound.");
  } else if (organizationGraph === "CYCLIC") {
    kernelIssue(issues, "KERNEL_ORGANIZATION_CYCLE", "$.organizations", "Organization parent references must be acyclic.");
  }

  const entities = kernelArray(root.entities, "$.entities", issues);
  const entityIds = kernelUniqueIds(entities, "$.entities", issues);
  entities.forEach((candidate, index) => {
    const path = `$.entities[${index}]`;
    const value = kernelRecord(candidate, path, issues);
    if (!value) return;
    kernelExactKeys(value, path, ["id", "displayName", "domain", "kind", "affiliationId", "capabilityRefs"], ["organizationId"], issues);
    kernelString(value.id, `${path}.id`, issues, { id: true });
    kernelString(value.displayName, `${path}.displayName`, issues, { nonEmpty: true });
    kernelEnum(value.domain, `${path}.domain`, ["AIR", "LAND", "MARITIME", "SPACE", "CYBER", "OTHER"], issues);
    kernelEnum(value.kind, `${path}.kind`, ["PLATFORM", "INSTALLATION", "AREA", "LOGICAL_GROUP"], issues);
    kernelString(value.affiliationId, `${path}.affiliationId`, issues, { id: true });
    if (typeof value.affiliationId === "string" && !affiliationIds.has(value.affiliationId)) {
      kernelIssue(issues, "KERNEL_DANGLING_REFERENCE", `${path}.affiliationId`, "Entity affiliation is not declared.");
    }
    if (Object.hasOwn(value, "organizationId")) {
      kernelString(value.organizationId, `${path}.organizationId`, issues, { id: true });
      if (typeof value.organizationId === "string" && !organizationIds.has(value.organizationId)) {
        kernelIssue(issues, "KERNEL_DANGLING_REFERENCE", `${path}.organizationId`, "Entity organization is not declared.");
      }
    }
    validateCapabilityRefs(value.capabilityRefs, `${path}.capabilityRefs`, issues, intendedUse);
  });

  const tasks = kernelArray(root.tasks, "$.tasks", issues);
  const taskIds = kernelUniqueIds(tasks, "$.tasks", issues);
  const taskDependencies = new Map<string, string[]>();
  tasks.forEach((candidate, index) => {
    const path = `$.tasks[${index}]`;
    const value = kernelRecord(candidate, path, issues);
    if (!value) return;
    kernelExactKeys(value, path, [
      "id", "kind", "ownerOrganizationId", "participantEntityIds", "objective", "timing",
      "dependencyTaskIds", "capabilityRefs", "lifecycle",
    ], [], issues);
    kernelString(value.id, `${path}.id`, issues, { id: true });
    kernelEnum(value.kind, `${path}.kind`, ["SUPPORT", "ESCORT", "PROTECT", "OBSERVE", "ROUTE", "AREA"], issues);
    kernelString(value.ownerOrganizationId, `${path}.ownerOrganizationId`, issues, { id: true });
    if (typeof value.ownerOrganizationId === "string" && !organizationIds.has(value.ownerOrganizationId)) {
      kernelIssue(issues, "KERNEL_DANGLING_REFERENCE", `${path}.ownerOrganizationId`, "Task owner is not declared.");
    }
    const participants = kernelUniqueStringArray(value.participantEntityIds, `${path}.participantEntityIds`, issues);
    participants.forEach((participant, participantIndex) => {
      if (typeof participant === "string" && !entityIds.has(participant)) {
        kernelIssue(issues, "KERNEL_DANGLING_REFERENCE", `${path}.participantEntityIds[${participantIndex}]`, "Task participant is not declared.");
      }
    });
    const objective = kernelRecord(value.objective, `${path}.objective`, issues);
    let objectiveTaskId: string | null = null;
    if (objective) {
      kernelExactKeys(objective, `${path}.objective`, ["kind", "id"], [], issues);
      kernelEnum(objective.kind, `${path}.objective.kind`, ["ENTITY", "ORGANIZATION", "TASK"], issues);
      kernelString(objective.id, `${path}.objective.id`, issues, { id: true });
      const ids = objective.kind === "ENTITY" ? entityIds : objective.kind === "ORGANIZATION" ? organizationIds : taskIds;
      if (typeof objective.id === "string" && !ids.has(objective.id)) {
        kernelIssue(issues, "KERNEL_DANGLING_REFERENCE", `${path}.objective.id`, "Task objective is not declared.");
      }
      if (objective.kind === "TASK" && objective.id === value.id) {
        kernelIssue(issues, "KERNEL_SELF_REFERENCE", `${path}.objective.id`, "A task cannot target itself.");
      }
      if (objective.kind === "TASK" && typeof objective.id === "string") objectiveTaskId = objective.id;
    }
    const timing = kernelRecord(value.timing, `${path}.timing`, issues);
    if (timing) {
      kernelExactKeys(timing, `${path}.timing`, ["notBeforeSeconds", "notAfterSeconds"], [], issues);
      kernelFiniteNonNegative(timing.notBeforeSeconds, `${path}.timing.notBeforeSeconds`, issues);
      kernelFiniteNonNegative(timing.notAfterSeconds, `${path}.timing.notAfterSeconds`, issues);
      if (typeof timing.notBeforeSeconds === "number" && typeof timing.notAfterSeconds === "number" && timing.notAfterSeconds < timing.notBeforeSeconds) {
        kernelIssue(issues, "KERNEL_INVALID_VALUE", `${path}.timing.notAfterSeconds`, "Task end must not precede its start.");
      }
    }
    const dependencies = kernelUniqueStringArray(value.dependencyTaskIds, `${path}.dependencyTaskIds`, issues);
    dependencies.forEach((dependency, dependencyIndex) => {
      if (dependency === value.id) {
        kernelIssue(issues, "KERNEL_SELF_REFERENCE", `${path}.dependencyTaskIds[${dependencyIndex}]`, "A task cannot depend on itself.");
      } else if (typeof dependency === "string" && !taskIds.has(dependency)) {
        kernelIssue(issues, "KERNEL_DANGLING_REFERENCE", `${path}.dependencyTaskIds[${dependencyIndex}]`, "Task dependency is not declared.");
      }
    });
    validateCapabilityRefs(value.capabilityRefs, `${path}.capabilityRefs`, issues, intendedUse);
    kernelEnum(value.lifecycle, `${path}.lifecycle`, ["AUTHORED"], issues);
    if (typeof value.id === "string") {
      taskDependencies.set(value.id, [
        ...dependencies.filter((dependency): dependency is string => typeof dependency === "string"),
        ...(objectiveTaskId ? [objectiveTaskId] : []),
      ]);
    }
  });
  const taskGraph = validateKernelGraph(taskIds, (id) => taskDependencies.get(id) ?? []);
  if (taskGraph === "LIMIT_EXCEEDED") {
    kernelIssue(issues, "KERNEL_GRAPH_LIMIT_EXCEEDED", "$.tasks", "Task graph exceeds the 10,000-edge admission bound.");
  } else if (taskGraph === "CYCLIC") {
    kernelIssue(issues, "KERNEL_TASK_CYCLE", "$.tasks", "Task dependencies must be acyclic.");
  }

  const perspectives = kernelArray(root.perspectives, "$.perspectives", issues);
  if (perspectives.length === 0) {
    kernelIssue(issues, "KERNEL_PERSPECTIVE_POLICY_INVALID", "$.perspectives", "A scenario kernel must declare at least one information perspective.");
  }
  kernelUniqueIds(perspectives, "$.perspectives", issues);
  perspectives.forEach((candidate, index) => {
    const path = `$.perspectives[${index}]`;
    const value = kernelRecord(candidate, path, issues);
    if (!value) return;
    kernelExactKeys(value, path, [
      "id", "kind", "visibleAffiliationIds", "exposeScenarioIdentity", "exposeScenarioPurpose", "capabilityVisibility",
      "surfaces",
    ], ["ownerAffiliationId"], issues);
    kernelString(value.id, `${path}.id`, issues, { id: true });
    kernelEnum(value.kind, `${path}.kind`, ["AUTHORING_ADMIN", "ADJUDICATOR", "FORCE_OBSERVED", "REDACTED_PUBLIC"], issues);
    const visible = kernelUniqueStringArray(value.visibleAffiliationIds, `${path}.visibleAffiliationIds`, issues);
    visible.forEach((affiliation, affiliationIndex) => {
      if (typeof affiliation === "string" && !affiliationIds.has(affiliation)) {
        kernelIssue(issues, "KERNEL_DANGLING_REFERENCE", `${path}.visibleAffiliationIds[${affiliationIndex}]`, "Visible affiliation is not declared.");
      }
    });
    kernelBoolean(value.exposeScenarioIdentity, `${path}.exposeScenarioIdentity`, issues);
    kernelBoolean(value.exposeScenarioPurpose, `${path}.exposeScenarioPurpose`, issues);
    kernelEnum(value.capabilityVisibility, `${path}.capabilityVisibility`, ["NONE", "VISIBLE_REFERENCES"], issues);
    const surfaces = kernelUniqueEnumArray(
      value.surfaces,
      `${path}.surfaces`,
      ["CONSTRUCT", "OBSERVE", "EXPLAIN", "COMPARE", "REPLAY", "EXPORT"],
      issues,
      6,
    );
    if (surfaces.length === 0) {
      kernelIssue(issues, "KERNEL_PERSPECTIVE_POLICY_INVALID", `${path}.surfaces`, "A perspective must authorize at least one named surface.");
    }
    const unrestricted = value.kind === "AUTHORING_ADMIN" || value.kind === "ADJUDICATOR";
    if (unrestricted) {
      const declared = new Set(visible.filter((id): id is string => typeof id === "string"));
      if (declared.size !== affiliationIds.size || [...affiliationIds].some((id) => !declared.has(id))) {
        kernelIssue(issues, "KERNEL_PERSPECTIVE_POLICY_INVALID", `${path}.visibleAffiliationIds`, "Administrative and adjudicator perspectives must explicitly include every affiliation.");
      }
      if (value.exposeScenarioIdentity !== true || value.exposeScenarioPurpose !== true) {
        kernelIssue(issues, "KERNEL_PERSPECTIVE_POLICY_INVALID", path, "Administrative and adjudicator perspectives must expose scenario identity and purpose.");
      }
      if (value.capabilityVisibility !== "VISIBLE_REFERENCES") {
        kernelIssue(issues, "KERNEL_PERSPECTIVE_POLICY_INVALID", `${path}.capabilityVisibility`, "Administrative and adjudicator perspectives must expose governed capability references.");
      }
    }
    if (value.kind === "FORCE_OBSERVED") {
      kernelString(value.ownerAffiliationId, `${path}.ownerAffiliationId`, issues, { id: true });
      if (typeof value.ownerAffiliationId === "string" && (!affiliationIds.has(value.ownerAffiliationId) || !visible.includes(value.ownerAffiliationId))) {
        kernelIssue(issues, "KERNEL_PERSPECTIVE_POLICY_INVALID", `${path}.ownerAffiliationId`, "A force-observed perspective must include its declared owner affiliation.");
      }
    } else if (Object.hasOwn(value, "ownerAffiliationId")) {
      kernelIssue(issues, "KERNEL_PERSPECTIVE_POLICY_INVALID", `${path}.ownerAffiliationId`, "Only force-observed perspectives declare an owner affiliation.");
    }
    if (value.kind === "REDACTED_PUBLIC" && value.capabilityVisibility !== "NONE") {
      kernelIssue(issues, "KERNEL_PERSPECTIVE_POLICY_INVALID", `${path}.capabilityVisibility`, "Public perspectives cannot expose capability references.");
    }
  });

  if (issues.length > 0) throw new ScenarioKernelValidationError(issues);
}

function compareKernelIdentity(left: { id: string; version?: string }, right: { id: string; version?: string }) {
  const leftKey = `${left.id}@${left.version ?? ""}`;
  const rightKey = `${right.id}@${right.version ?? ""}`;
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function canonicalScenarioKernel(input: ScenarioKernelInput): ScenarioKernelInput {
  const copy = structuredClone(input);
  return {
    ...copy,
    affiliations: [...copy.affiliations].sort(compareKernelIdentity),
    relationships: [...copy.relationships].sort(compareKernelIdentity),
    organizations: [...copy.organizations].sort(compareKernelIdentity),
    entities: [...copy.entities]
      .map((entity) => ({ ...entity, capabilityRefs: [...entity.capabilityRefs].sort(compareKernelIdentity) }))
      .sort(compareKernelIdentity),
    tasks: [...copy.tasks]
      .map((task) => ({
        ...task,
        participantEntityIds: [...task.participantEntityIds].sort(),
        dependencyTaskIds: [...task.dependencyTaskIds].sort(),
        capabilityRefs: [...task.capabilityRefs].sort(compareKernelIdentity),
      }))
      .sort(compareKernelIdentity),
    perspectives: [...copy.perspectives]
      .map((perspective) => ({
        ...perspective,
        visibleAffiliationIds: [...perspective.visibleAffiliationIds].sort(),
        surfaces: [...perspective.surfaces].sort(),
      }))
      .sort(compareKernelIdentity),
  };
}

function deepFreezeKernel<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreezeKernel(nested);
  }
  return value;
}

function resolveKernelCapabilityDescriptors(input: ScenarioKernelInput) {
  const required = new Set([
    ...input.entities.flatMap((entity) => entity.capabilityRefs.map((ref) => `${ref.id}@${ref.version}`)),
    ...input.tasks.flatMap((task) => task.capabilityRefs.map((ref) => `${ref.id}@${ref.version}`)),
  ]);
  const resolved = new Map<string, GovernedScenarioCapabilityDescriptor>();
  const queue = [...required];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const key = queue[cursor];
    if (resolved.has(key)) continue;
    const separator = key.lastIndexOf("@");
    const descriptor = resolveScenarioCapability(key.slice(0, separator), key.slice(separator + 1));
    if (!descriptor) continue;
    resolved.set(key, descriptor);
    for (const dependency of descriptor.dependencies) {
      const dependencyKey = `${dependency.id}@${dependency.version}`;
      if (!resolved.has(dependencyKey)) queue.push(dependencyKey);
    }
    if (queue.length > MAX_KERNEL_GRAPH_EDGES) {
      throw new ScenarioKernelValidationError([{
        code: "KERNEL_GRAPH_LIMIT_EXCEEDED",
        path: "$.capabilityDescriptors",
        message: "Capability dependency closure exceeds the 10,000-edge admission bound.",
      }]);
    }
  }
  return [...resolved.values()].sort(compareKernelIdentity);
}

export function compileScenarioKernel(input: unknown): CompiledScenarioKernel {
  validateScenarioKernel(input);
  const canonical = canonicalScenarioKernel(input);
  const material = {
    ...canonical,
    capabilityDescriptors: resolveKernelCapabilityDescriptors(canonical),
  };
  const canonicalBytes = canonicalJson(material);
  return deepFreezeKernel({
    ...material,
    canonicalBytes,
    digest: sha256Utf8HexSync(canonicalBytes),
  });
}

export function verifyCompiledScenarioKernel(
  kernel: CompiledScenarioKernel,
): CompiledScenarioKernel {
  const { canonicalBytes, digest } = kernel;
  const source = structuredClone(kernel) as Record<string, unknown>;
  delete source.capabilityDescriptors;
  delete source.canonicalBytes;
  delete source.digest;
  const verified = compileScenarioKernel(source);
  if (canonicalBytes !== verified.canonicalBytes || digest !== verified.digest) {
    throw new ScenarioKernelValidationError([{
      code: "KERNEL_DIGEST_MISMATCH",
      path: "$.digest",
      message: "Scenario kernel canonical bytes or digest do not match its canonical content.",
    }]);
  }
  return verified;
}

function projectionObjectiveVisible(
  objective: ScenarioKernelInput["tasks"][number]["objective"],
  visibleEntities: ReadonlySet<string>,
  visibleOrganizations: ReadonlySet<string>,
  visibleTasks: ReadonlySet<string>,
) {
  return objective.kind === "ENTITY"
    ? visibleEntities.has(objective.id)
    : objective.kind === "ORGANIZATION"
      ? visibleOrganizations.has(objective.id)
      : visibleTasks.has(objective.id);
}

export function projectScenarioKernel(
  kernel: CompiledScenarioKernel,
  perspectiveId: string,
  surface: ScenarioKernelSurface,
): ScenarioKernelProjection {
  kernel = verifyCompiledScenarioKernel(kernel);
  const perspective = kernel.perspectives.find((candidate) => candidate.id === perspectiveId);
  if (!perspective) {
    throw new ScenarioKernelValidationError([{
      code: "KERNEL_DANGLING_REFERENCE",
      path: "$.perspectiveId",
      message: `${perspectiveId} does not identify a perspective.`,
    }]);
  }
  if (!perspective.surfaces.includes(surface)) {
    throw new ScenarioKernelValidationError([{
      code: "KERNEL_PERSPECTIVE_POLICY_INVALID",
      path: "$.surface",
      message: `${perspectiveId} does not authorize the ${surface} surface.`,
    }]);
  }
  const visibleAffiliations = new Set(perspective.visibleAffiliationIds);
  const affiliations = kernel.affiliations.filter((affiliation) => visibleAffiliations.has(affiliation.id));
  const relationships = kernel.relationships.filter((relationship) =>
    visibleAffiliations.has(relationship.sourceAffiliationId) && visibleAffiliations.has(relationship.targetAffiliationId));

  const organizationCandidates = kernel.organizations.filter((organization) =>
    visibleAffiliations.has(organization.affiliationId));
  const organizationIds = new Set(organizationCandidates.map((organization) => organization.id));
  const childrenByParent = new Map<string, string[]>();
  const hiddenOrganizationQueue: string[] = [];
  for (const organization of organizationCandidates) {
    if (!organization.parentOrganizationId) continue;
    const children = childrenByParent.get(organization.parentOrganizationId) ?? [];
    children.push(organization.id);
    childrenByParent.set(organization.parentOrganizationId, children);
    if (!organizationIds.has(organization.parentOrganizationId)) hiddenOrganizationQueue.push(organization.id);
  }
  for (let cursor = 0; cursor < hiddenOrganizationQueue.length; cursor += 1) {
    const hiddenId = hiddenOrganizationQueue[cursor];
    if (!organizationIds.delete(hiddenId)) continue;
    hiddenOrganizationQueue.push(...(childrenByParent.get(hiddenId) ?? []));
  }
  const organizations = organizationCandidates.filter((organization) => organizationIds.has(organization.id));
  const exposeCapabilities = perspective.capabilityVisibility === "VISIBLE_REFERENCES";
  const entities = kernel.entities
    .filter((entity) =>
      visibleAffiliations.has(entity.affiliationId) && (!entity.organizationId || organizationIds.has(entity.organizationId)))
    .map((entity) => exposeCapabilities ? entity : { ...entity, capabilityRefs: [] });
  const entityIds = new Set(entities.map((entity) => entity.id));
  const taskCandidates = kernel.tasks.filter((task) =>
    organizationIds.has(task.ownerOrganizationId) && task.participantEntityIds.every((id) => entityIds.has(id)));
  const taskIds = new Set(taskCandidates.map((task) => task.id));
  const dependentsByTask = new Map<string, string[]>();
  const hiddenTaskQueue: string[] = [];
  for (const task of taskCandidates) {
    const taskReferences = [
      ...task.dependencyTaskIds,
      ...(task.objective.kind === "TASK" ? [task.objective.id] : []),
    ];
    for (const referencedTaskId of new Set(taskReferences)) {
      const dependents = dependentsByTask.get(referencedTaskId) ?? [];
      dependents.push(task.id);
      dependentsByTask.set(referencedTaskId, dependents);
      if (!taskIds.has(referencedTaskId)) hiddenTaskQueue.push(task.id);
    }
    if (!projectionObjectiveVisible(task.objective, entityIds, organizationIds, taskIds)) {
      hiddenTaskQueue.push(task.id);
    }
  }
  for (let cursor = 0; cursor < hiddenTaskQueue.length; cursor += 1) {
    const hiddenId = hiddenTaskQueue[cursor];
    if (!taskIds.delete(hiddenId)) continue;
    hiddenTaskQueue.push(...(dependentsByTask.get(hiddenId) ?? []));
  }
  const tasks = taskCandidates
    .filter((task) => taskIds.has(task.id))
    .map((task) => exposeCapabilities ? task : { ...task, capabilityRefs: [] });
  const visibleCapabilityKeys = new Set(exposeCapabilities ? [
    ...entities.flatMap((entity) => entity.capabilityRefs.map((ref) => `${ref.id}@${ref.version}`)),
    ...tasks.flatMap((task) => task.capabilityRefs.map((ref) => `${ref.id}@${ref.version}`)),
  ] : []);
  const descriptorsByKey = new Map(kernel.capabilityDescriptors.map((descriptor) =>
    [`${descriptor.id}@${descriptor.version}`, descriptor]));
  const capabilityQueue = [...visibleCapabilityKeys];
  for (let cursor = 0; cursor < capabilityQueue.length; cursor += 1) {
    const descriptor = descriptorsByKey.get(capabilityQueue[cursor]);
    if (!descriptor) continue;
    for (const dependency of descriptor.dependencies) {
      const key = `${dependency.id}@${dependency.version}`;
      if (visibleCapabilityKeys.has(key)) continue;
      visibleCapabilityKeys.add(key);
      capabilityQueue.push(key);
    }
  }
  const capabilityDescriptors = kernel.capabilityDescriptors.filter((descriptor) =>
    visibleCapabilityKeys.has(`${descriptor.id}@${descriptor.version}`));

  const material = {
    schemaVersion: SCENARIO_KERNEL_PROJECTION_SCHEMA_VERSION,
    scenario: perspective.exposeScenarioIdentity ? { id: kernel.id, version: kernel.version } : null,
    perspective: {
      kind: perspective.kind,
      policyDigest: sha256Utf8HexSync(canonicalJson(perspective)),
    },
    surface,
    purpose: perspective.exposeScenarioPurpose ? kernel.purpose : null,
    affiliations,
    relationships,
    organizations,
    entities,
    tasks,
    ...(exposeCapabilities ? { capabilityDescriptors } : {}),
  };
  return deepFreezeKernel({
    ...material,
    digest: sha256Utf8HexSync(canonicalJson(material)),
  });
}
