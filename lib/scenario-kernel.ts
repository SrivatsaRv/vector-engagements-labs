import { sha256HexSync } from "./geospatial/digest.ts";

/**
 * Scenario-independent composition authority. This contract intentionally owns
 * authored identity, references, and safe presentation discovery only. It does
 * not authorize a model, controller, sensor, weapon, renderer, or engine path.
 * The existing ScenarioDraft remains the current Air authoring adapter until an
 * explicit #60 projection consumes this kernel.
 */
export const SCENARIO_KERNEL_SCHEMA_VERSION = "vector.scenario-kernel.v1" as const;
export const SCENARIO_KERNEL_PROJECTION_SCHEMA_VERSION =
  "vector.scenario-kernel-projection.v1" as const;

export type ScenarioKernelCapabilityRef = { id: string; version: string };

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
  capabilityDescriptors: Array<{
    id: string;
    version: string;
    owner:
      | "SCENARIO_KERNEL"
      | "MISSION_CONTRACT"
      | "MODEL_PACK"
      | "INFORMATION_CONTRACT"
      | "PRESENTATION_CONTRACT";
    intendedUseId: string;
    admission: {
      state: "UNAVAILABLE" | "AUTHORING_ONLY" | "INSPECTION_ONLY";
      reasonCode: string;
    };
    runtimeAuthority: "NONE";
    authoredInputs: Array<{
      id: string;
      scope: "SCENARIO" | "ENTITY" | "TASK";
      unit: "1" | "m" | "m/s" | "s" | "deg" | "rad" | "kg";
      datum: "NONE" | "WGS84" | "MSL" | "AGL";
      required: boolean;
    }>;
    outputs: Array<{
      id: string;
      source: "DERIVED" | "MODEL" | "RUNTIME";
      availability: "UNAVAILABLE";
      selector: "SCENARIO_IDENTITY" | "ENTITY_IDENTITY" | "TASK_IDENTITY" | "CAPABILITY_ADMISSION";
    }>;
    inspectors: Array<{
      id: string;
      localizationKey: string;
      selector: "SCENARIO_IDENTITY" | "ENTITY_IDENTITY" | "TASK_IDENTITY" | "CAPABILITY_ADMISSION";
    }>;
    dependencies: ScenarioKernelCapabilityRef[];
    invalidation: "DEPENDENTS_ONLY";
    reset: "REMOVE_DEPENDENT_VALUES";
  }>;
  perspectives: Array<{
    id: string;
    kind: "AUTHORING_ADMIN" | "ADJUDICATOR" | "FORCE_OBSERVED" | "REDACTED_PUBLIC";
    ownerAffiliationId?: string;
    visibleAffiliationIds: string[];
    exposeScenarioPurpose: boolean;
    exposeCapabilityDescriptors: boolean;
  }>;
};

export type CompiledScenarioKernel = ScenarioKernelInput & { digest: string };

export type ScenarioKernelProjection = {
  schemaVersion: typeof SCENARIO_KERNEL_PROJECTION_SCHEMA_VERSION;
  kernelId: string;
  kernelVersion: string;
  perspective: {
    id: string;
    kind: ScenarioKernelInput["perspectives"][number]["kind"];
  };
  purpose: string | null;
  affiliations: ScenarioKernelInput["affiliations"];
  relationships: ScenarioKernelInput["relationships"];
  organizations: ScenarioKernelInput["organizations"];
  entities: ScenarioKernelInput["entities"];
  tasks: ScenarioKernelInput["tasks"];
  capabilityDescriptors: ScenarioKernelInput["capabilityDescriptors"];
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
    | "KERNEL_CAPABILITY_CYCLE"
    | "KERNEL_DESCRIPTOR_CONTEXT_FORBIDDEN"
    | "KERNEL_RUNTIME_AUTHORITY_FORBIDDEN"
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
const REASON_CODE = /^[A-Z][A-Z0-9_]*$/;

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
  options: { id?: boolean; version?: boolean; reason?: boolean; nonEmpty?: boolean } = {},
) {
  if (typeof value !== "string") {
    kernelIssue(issues, "KERNEL_INVALID_TYPE", path, `${path} must be a string.`);
    return;
  }
  const maximumLength = options.id ? 128 : options.version ? 64 : options.reason ? 128 : 4096;
  if (value.length > maximumLength) {
    kernelIssue(issues, "KERNEL_INVALID_VALUE", path, `${path} exceeds the ${maximumLength}-character admission bound.`);
  }
  if (options.nonEmpty && !value.trim()) {
    kernelIssue(issues, "KERNEL_INVALID_VALUE", path, `${path} must not be empty.`);
  }
  const pattern = options.id ? KERNEL_ID : options.version ? KERNEL_VERSION : options.reason ? REASON_CODE : null;
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

function validateCapabilityRefs(
  value: unknown,
  path: string,
  issues: ScenarioKernelIssue[],
) {
  const refs = kernelArray(value, path, issues);
  const seen = new Set<string>();
  refs.forEach((candidate, index) => {
    const refPath = `${path}[${index}]`;
    const ref = kernelRecord(candidate, refPath, issues);
    if (!ref) return;
    kernelExactKeys(ref, refPath, ["id", "version"], [], issues);
    kernelString(ref.id, `${refPath}.id`, issues, { id: true });
    kernelString(ref.version, `${refPath}.version`, issues, { version: true });
    if (typeof ref.id === "string" && typeof ref.version === "string") {
      const key = `${ref.id}@${ref.version}`;
      if (seen.has(key)) {
        kernelIssue(issues, "KERNEL_DUPLICATE_REFERENCE", refPath, `${key} is duplicated.`);
      }
      seen.add(key);
    }
  });
  return refs;
}

function validateKernelGraphCycle(
  ids: Iterable<string>,
  edges: (id: string) => readonly string[],
) {
  const state = new Map<string, "VISITING" | "VISITED">();
  const visit = (id: string): boolean => {
    if (state.get(id) === "VISITING") return true;
    if (state.get(id) === "VISITED") return false;
    state.set(id, "VISITING");
    for (const next of edges(id)) {
      if (visit(next)) return true;
    }
    state.set(id, "VISITED");
    return false;
  };
  return [...ids].some(visit);
}

function validateScenarioKernel(input: unknown): asserts input is ScenarioKernelInput {
  const issues: ScenarioKernelIssue[] = [];
  const root = kernelRecord(input, "$", issues);
  if (!root) throw new ScenarioKernelValidationError(issues);
  kernelExactKeys(root, "$", [
    "schemaVersion", "id", "version", "purpose", "provenance", "intendedUse", "affiliations",
    "relationships", "organizations", "entities", "tasks", "capabilityDescriptors", "perspectives",
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
  if (validateKernelGraphCycle(organizationIds, (id) => organizationParents.get(id) ?? [])) {
    kernelIssue(issues, "KERNEL_ORGANIZATION_CYCLE", "$.organizations", "Organization parent references must be acyclic.");
  }

  const capabilityDescriptors = kernelArray(root.capabilityDescriptors, "$.capabilityDescriptors", issues);
  kernelUniqueIds(capabilityDescriptors, "$.capabilityDescriptors", issues);
  const capabilityKeys = new Set<string>();
  const capabilityDependencies = new Map<string, string[]>();
  capabilityDescriptors.forEach((candidate, index) => {
    const path = `$.capabilityDescriptors[${index}]`;
    const value = kernelRecord(candidate, path, issues);
    if (!value) return;
    kernelExactKeys(value, path, [
      "id", "version", "owner", "intendedUseId", "admission", "runtimeAuthority", "authoredInputs",
      "outputs", "inspectors", "dependencies", "invalidation", "reset",
    ], [], issues);
    kernelString(value.id, `${path}.id`, issues, { id: true });
    kernelString(value.version, `${path}.version`, issues, { version: true });
    kernelEnum(value.owner, `${path}.owner`, [
      "SCENARIO_KERNEL", "MISSION_CONTRACT", "MODEL_PACK", "INFORMATION_CONTRACT", "PRESENTATION_CONTRACT",
    ], issues);
    kernelString(value.intendedUseId, `${path}.intendedUseId`, issues, { id: true });
    if (typeof value.intendedUseId === "string"
      && typeof intendedUse?.id === "string"
      && value.intendedUseId !== intendedUse.id) {
      kernelIssue(
        issues,
        "KERNEL_INVALID_VALUE",
        `${path}.intendedUseId`,
        "Capability intended use must match the scenario intended use.",
      );
    }
    const admission = kernelRecord(value.admission, `${path}.admission`, issues);
    if (admission) {
      kernelExactKeys(admission, `${path}.admission`, ["state", "reasonCode"], [], issues);
      kernelEnum(admission.state, `${path}.admission.state`, ["UNAVAILABLE", "AUTHORING_ONLY", "INSPECTION_ONLY"], issues);
      kernelString(admission.reasonCode, `${path}.admission.reasonCode`, issues, { reason: true });
    }
    if (value.runtimeAuthority !== "NONE") {
      kernelIssue(issues, "KERNEL_RUNTIME_AUTHORITY_FORBIDDEN", `${path}.runtimeAuthority`, "Scenario capabilities cannot grant runtime authority.");
    }
    const inputs = kernelArray(value.authoredInputs, `${path}.authoredInputs`, issues);
    kernelUniqueIds(inputs, `${path}.authoredInputs`, issues);
    inputs.forEach((inputCandidate, inputIndex) => {
      const inputPath = `${path}.authoredInputs[${inputIndex}]`;
      const inputValue = kernelRecord(inputCandidate, inputPath, issues);
      if (!inputValue) return;
      kernelExactKeys(inputValue, inputPath, ["id", "scope", "unit", "datum", "required"], [], issues);
      kernelString(inputValue.id, `${inputPath}.id`, issues, { id: true });
      kernelEnum(inputValue.scope, `${inputPath}.scope`, ["SCENARIO", "ENTITY", "TASK"], issues);
      kernelEnum(inputValue.unit, `${inputPath}.unit`, ["1", "m", "m/s", "s", "deg", "rad", "kg"], issues);
      kernelEnum(inputValue.datum, `${inputPath}.datum`, ["NONE", "WGS84", "MSL", "AGL"], issues);
      kernelBoolean(inputValue.required, `${inputPath}.required`, issues);
      if (inputValue.datum === "WGS84" && inputValue.unit !== "deg") {
        kernelIssue(issues, "KERNEL_INVALID_VALUE", `${inputPath}.unit`, "WGS84 authored inputs must use degrees.");
      }
      if (["MSL", "AGL"].includes(String(inputValue.datum)) && inputValue.unit !== "m") {
        kernelIssue(issues, "KERNEL_INVALID_VALUE", `${inputPath}.unit`, "Vertical datum inputs must use metres.");
      }
    });
    const outputs = kernelArray(value.outputs, `${path}.outputs`, issues);
    kernelUniqueIds(outputs, `${path}.outputs`, issues);
    outputs.forEach((outputCandidate, outputIndex) => {
      const outputPath = `${path}.outputs[${outputIndex}]`;
      const output = kernelRecord(outputCandidate, outputPath, issues);
      if (!output) return;
      kernelExactKeys(output, outputPath, ["id", "source", "availability", "selector"], [], issues);
      kernelString(output.id, `${outputPath}.id`, issues, { id: true });
      kernelEnum(output.source, `${outputPath}.source`, ["DERIVED", "MODEL", "RUNTIME"], issues);
      if (output.availability !== "UNAVAILABLE") {
        kernelIssue(issues, "KERNEL_RUNTIME_AUTHORITY_FORBIDDEN", `${outputPath}.availability`, "Kernel descriptors cannot advertise an available output.");
      }
      kernelEnum(output.selector, `${outputPath}.selector`, [
        "SCENARIO_IDENTITY", "ENTITY_IDENTITY", "TASK_IDENTITY", "CAPABILITY_ADMISSION",
      ], issues);
    });
    const inspectors = kernelArray(value.inspectors, `${path}.inspectors`, issues);
    kernelUniqueIds(inspectors, `${path}.inspectors`, issues);
    inspectors.forEach((inspectorCandidate, inspectorIndex) => {
      const inspectorPath = `${path}.inspectors[${inspectorIndex}]`;
      const inspector = kernelRecord(inspectorCandidate, inspectorPath, issues);
      if (!inspector) return;
      kernelExactKeys(inspector, inspectorPath, ["id", "localizationKey", "selector"], [], issues);
      kernelString(inspector.id, `${inspectorPath}.id`, issues, { id: true });
      kernelString(inspector.localizationKey, `${inspectorPath}.localizationKey`, issues, { id: true });
      kernelEnum(inspector.selector, `${inspectorPath}.selector`, [
        "SCENARIO_IDENTITY", "ENTITY_IDENTITY", "TASK_IDENTITY", "CAPABILITY_ADMISSION",
      ], issues);
    });
    const dependencies = validateCapabilityRefs(value.dependencies, `${path}.dependencies`, issues);
    kernelEnum(value.invalidation, `${path}.invalidation`, ["DEPENDENTS_ONLY"], issues);
    kernelEnum(value.reset, `${path}.reset`, ["REMOVE_DEPENDENT_VALUES"], issues);
    if (typeof value.id === "string" && typeof value.version === "string") {
      const key = `${value.id}@${value.version}`;
      capabilityKeys.add(key);
      capabilityDependencies.set(key, dependencies.flatMap((dependency, dependencyIndex) => {
        const ref = kernelRecord(dependency, `${path}.dependencies[${dependencyIndex}]`, []);
        if (!ref) return [];
        return typeof ref.id === "string" && typeof ref.version === "string" ? [`${ref.id}@${ref.version}`] : [];
      }));
    }
  });
  capabilityDescriptors.forEach((candidate, index) => {
    const value = kernelRecord(candidate, `$.capabilityDescriptors[${index}]`, []);
    if (!value) return;
    const dependencies = Array.isArray(value.dependencies) ? value.dependencies : [];
    dependencies.forEach((dependency, dependencyIndex) => {
      const ref = kernelRecord(dependency, `$.capabilityDescriptors[${index}].dependencies[${dependencyIndex}]`, []);
      if (!ref) return;
      if (typeof ref.id === "string" && typeof ref.version === "string" && !capabilityKeys.has(`${ref.id}@${ref.version}`)) {
        kernelIssue(issues, "KERNEL_DANGLING_REFERENCE", `$.capabilityDescriptors[${index}].dependencies[${dependencyIndex}]`, "Capability dependency is not declared.");
      }
      if (ref.id === value.id && ref.version === value.version) {
        kernelIssue(issues, "KERNEL_SELF_REFERENCE", `$.capabilityDescriptors[${index}].dependencies[${dependencyIndex}]`, "A capability cannot depend on itself.");
      }
    });
  });
  if (validateKernelGraphCycle(capabilityKeys, (id) => capabilityDependencies.get(id) ?? [])) {
    kernelIssue(issues, "KERNEL_CAPABILITY_CYCLE", "$.capabilityDescriptors", "Capability dependencies must be acyclic.");
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
    const refs = validateCapabilityRefs(value.capabilityRefs, `${path}.capabilityRefs`, issues);
    refs.forEach((refCandidate, refIndex) => {
      const ref = kernelRecord(refCandidate, `${path}.capabilityRefs[${refIndex}]`, []);
      if (!ref) return;
      if (typeof ref.id === "string" && typeof ref.version === "string" && !capabilityKeys.has(`${ref.id}@${ref.version}`)) {
        kernelIssue(issues, "KERNEL_DANGLING_REFERENCE", `${path}.capabilityRefs[${refIndex}]`, "Entity capability is not declared.");
      }
    });
  });

  const descriptorContextTokens = new Set<string>();
  const addContextToken = (value: unknown) => {
    if (typeof value !== "string") return;
    const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (normalized.length >= 4) descriptorContextTokens.add(normalized);
  };
  addContextToken(root.id);
  entities.forEach((candidate, index) => {
    const entity = kernelRecord(candidate, `$.entities[${index}]`, []);
    if (!entity) return;
    addContextToken(entity.id);
    addContextToken(entity.displayName);
  });
  capabilityDescriptors.forEach((candidate, descriptorIndex) => {
    const descriptor = kernelRecord(candidate, `$.capabilityDescriptors[${descriptorIndex}]`, []);
    if (!descriptor) return;
    const guardedValues: Array<[unknown, string]> = [
      [descriptor.id, `$.capabilityDescriptors[${descriptorIndex}].id`],
      ...kernelArray(descriptor.authoredInputs, `$.capabilityDescriptors[${descriptorIndex}].authoredInputs`, [])
        .map((input, inputIndex) => {
          const path = `$.capabilityDescriptors[${descriptorIndex}].authoredInputs[${inputIndex}]`;
          return [kernelRecord(input, path, [])?.id, `${path}.id`] as [unknown, string];
        }),
      ...kernelArray(descriptor.outputs, `$.capabilityDescriptors[${descriptorIndex}].outputs`, [])
        .map((output, outputIndex) => {
          const path = `$.capabilityDescriptors[${descriptorIndex}].outputs[${outputIndex}]`;
          return [kernelRecord(output, path, [])?.id, `${path}.id`] as [unknown, string];
        }),
      ...kernelArray(descriptor.inspectors, `$.capabilityDescriptors[${descriptorIndex}].inspectors`, [])
        .flatMap((inspector, inspectorIndex) => {
          const path = `$.capabilityDescriptors[${descriptorIndex}].inspectors[${inspectorIndex}]`;
          const value = kernelRecord(inspector, path, []);
          return [
            [value?.id, `${path}.id`],
            [value?.localizationKey, `${path}.localizationKey`],
          ] as Array<[unknown, string]>;
        }),
    ];
    for (const [guarded, path] of guardedValues) {
      if (typeof guarded !== "string") continue;
      const normalized = guarded.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      if ([...descriptorContextTokens].some((token) => normalized.includes(token))) {
        kernelIssue(
          issues,
          "KERNEL_DESCRIPTOR_CONTEXT_FORBIDDEN",
          path,
          "Capability descriptors cannot branch on scenario or entity identity.",
        );
      }
    }
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
    const refs = validateCapabilityRefs(value.capabilityRefs, `${path}.capabilityRefs`, issues);
    refs.forEach((refCandidate, refIndex) => {
      const ref = kernelRecord(refCandidate, `${path}.capabilityRefs[${refIndex}]`, []);
      if (!ref) return;
      if (typeof ref.id === "string" && typeof ref.version === "string" && !capabilityKeys.has(`${ref.id}@${ref.version}`)) {
        kernelIssue(issues, "KERNEL_DANGLING_REFERENCE", `${path}.capabilityRefs[${refIndex}]`, "Task capability is not declared.");
      }
    });
    kernelEnum(value.lifecycle, `${path}.lifecycle`, ["AUTHORED"], issues);
    if (typeof value.id === "string") {
      taskDependencies.set(value.id, dependencies.filter((dependency): dependency is string => typeof dependency === "string"));
    }
  });
  if (validateKernelGraphCycle(taskIds, (id) => taskDependencies.get(id) ?? [])) {
    kernelIssue(issues, "KERNEL_TASK_CYCLE", "$.tasks", "Task dependencies must be acyclic.");
  }

  const perspectives = kernelArray(root.perspectives, "$.perspectives", issues);
  kernelUniqueIds(perspectives, "$.perspectives", issues);
  perspectives.forEach((candidate, index) => {
    const path = `$.perspectives[${index}]`;
    const value = kernelRecord(candidate, path, issues);
    if (!value) return;
    kernelExactKeys(value, path, [
      "id", "kind", "visibleAffiliationIds", "exposeScenarioPurpose", "exposeCapabilityDescriptors",
    ], ["ownerAffiliationId"], issues);
    kernelString(value.id, `${path}.id`, issues, { id: true });
    kernelEnum(value.kind, `${path}.kind`, ["AUTHORING_ADMIN", "ADJUDICATOR", "FORCE_OBSERVED", "REDACTED_PUBLIC"], issues);
    const visible = kernelUniqueStringArray(value.visibleAffiliationIds, `${path}.visibleAffiliationIds`, issues);
    visible.forEach((affiliation, affiliationIndex) => {
      if (typeof affiliation === "string" && !affiliationIds.has(affiliation)) {
        kernelIssue(issues, "KERNEL_DANGLING_REFERENCE", `${path}.visibleAffiliationIds[${affiliationIndex}]`, "Visible affiliation is not declared.");
      }
    });
    kernelBoolean(value.exposeScenarioPurpose, `${path}.exposeScenarioPurpose`, issues);
    kernelBoolean(value.exposeCapabilityDescriptors, `${path}.exposeCapabilityDescriptors`, issues);
    const unrestricted = value.kind === "AUTHORING_ADMIN" || value.kind === "ADJUDICATOR";
    if (unrestricted) {
      const declared = new Set(visible.filter((id): id is string => typeof id === "string"));
      if (declared.size !== affiliationIds.size || [...affiliationIds].some((id) => !declared.has(id))) {
        kernelIssue(issues, "KERNEL_PERSPECTIVE_POLICY_INVALID", `${path}.visibleAffiliationIds`, "Administrative and adjudicator perspectives must explicitly include every affiliation.");
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
    capabilityDescriptors: [...copy.capabilityDescriptors]
      .map((descriptor) => ({
        ...descriptor,
        authoredInputs: [...descriptor.authoredInputs].sort(compareKernelIdentity),
        outputs: [...descriptor.outputs].sort(compareKernelIdentity),
        inspectors: [...descriptor.inspectors].sort(compareKernelIdentity),
        dependencies: [...descriptor.dependencies].sort(compareKernelIdentity),
      }))
      .sort(compareKernelIdentity),
    perspectives: [...copy.perspectives]
      .map((perspective) => ({ ...perspective, visibleAffiliationIds: [...perspective.visibleAffiliationIds].sort() }))
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

export function compileScenarioKernel(input: unknown): CompiledScenarioKernel {
  validateScenarioKernel(input);
  const canonical = canonicalScenarioKernel(input);
  return deepFreezeKernel({ ...canonical, digest: sha256HexSync(canonical) });
}

export function verifyCompiledScenarioKernel(
  kernel: CompiledScenarioKernel,
): CompiledScenarioKernel {
  const { digest, ...source } = kernel;
  const verified = compileScenarioKernel(source);
  if (digest !== verified.digest) {
    throw new ScenarioKernelValidationError([{
      code: "KERNEL_DIGEST_MISMATCH",
      path: "$.digest",
      message: "Scenario kernel digest does not match its canonical content.",
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
  const visibleAffiliations = new Set(perspective.visibleAffiliationIds);
  const affiliations = kernel.affiliations.filter((affiliation) => visibleAffiliations.has(affiliation.id));
  const relationships = kernel.relationships.filter((relationship) =>
    visibleAffiliations.has(relationship.sourceAffiliationId) && visibleAffiliations.has(relationship.targetAffiliationId));

  let organizations = kernel.organizations.filter((organization) => visibleAffiliations.has(organization.affiliationId));
  let organizationIds = new Set(organizations.map((organization) => organization.id));
  let changed = true;
  while (changed) {
    changed = false;
    organizations = organizations.filter((organization) => {
      const keep = !organization.parentOrganizationId || organizationIds.has(organization.parentOrganizationId);
      if (!keep) changed = true;
      return keep;
    });
    organizationIds = new Set(organizations.map((organization) => organization.id));
  }

  const entities = kernel.entities
    .filter((entity) =>
      visibleAffiliations.has(entity.affiliationId) && (!entity.organizationId || organizationIds.has(entity.organizationId)))
    .map((entity) => perspective.exposeCapabilityDescriptors
      ? entity
      : { ...entity, capabilityRefs: [] });
  const entityIds = new Set(entities.map((entity) => entity.id));
  let tasks = kernel.tasks.filter((task) =>
    organizationIds.has(task.ownerOrganizationId) && task.participantEntityIds.every((id) => entityIds.has(id)));
  let taskIds = new Set(tasks.map((task) => task.id));
  changed = true;
  while (changed) {
    changed = false;
    tasks = tasks.filter((task) => {
      const keep = task.dependencyTaskIds.every((id) => taskIds.has(id))
        && projectionObjectiveVisible(task.objective, entityIds, organizationIds, taskIds);
      if (!keep) changed = true;
      return keep;
    });
    taskIds = new Set(tasks.map((task) => task.id));
  }
  if (!perspective.exposeCapabilityDescriptors) {
    tasks = tasks.map((task) => ({ ...task, capabilityRefs: [] }));
  }

  let capabilityDescriptors: ScenarioKernelInput["capabilityDescriptors"] = [];
  if (perspective.exposeCapabilityDescriptors) {
    const referenced = new Set([
      ...entities.flatMap((entity) => entity.capabilityRefs.map((ref) => `${ref.id}@${ref.version}`)),
      ...tasks.flatMap((task) => task.capabilityRefs.map((ref) => `${ref.id}@${ref.version}`)),
    ]);
    changed = true;
    while (changed) {
      changed = false;
      for (const descriptor of kernel.capabilityDescriptors) {
        const key = `${descriptor.id}@${descriptor.version}`;
        if (!referenced.has(key)) continue;
        for (const dependency of descriptor.dependencies) {
          const dependencyKey = `${dependency.id}@${dependency.version}`;
          if (!referenced.has(dependencyKey)) {
            referenced.add(dependencyKey);
            changed = true;
          }
        }
      }
    }
    capabilityDescriptors = kernel.capabilityDescriptors.filter((descriptor) =>
      referenced.has(`${descriptor.id}@${descriptor.version}`));
  }

  const material = {
    schemaVersion: SCENARIO_KERNEL_PROJECTION_SCHEMA_VERSION,
    kernelId: kernel.id,
    kernelVersion: kernel.version,
    perspective: { id: perspective.id, kind: perspective.kind },
    purpose: perspective.exposeScenarioPurpose ? kernel.purpose : null,
    affiliations,
    relationships,
    organizations,
    entities,
    tasks,
    capabilityDescriptors,
  };
  return deepFreezeKernel({ ...material, digest: sha256HexSync(material) });
}
