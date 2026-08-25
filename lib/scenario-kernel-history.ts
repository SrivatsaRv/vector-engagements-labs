import { canonicalJson } from "./canonical-json.ts";
import {
  compileScenarioKernel,
  type CompiledScenarioKernel,
  type ScenarioKernelInput,
} from "./scenario-kernel.ts";

export const SCENARIO_KERNEL_COMMAND_SCHEMA_VERSION = "vector.scenario-kernel-command.v1" as const;
export const SCENARIO_KERNEL_HISTORY_SCHEMA_VERSION = "vector.scenario-kernel-history.v1" as const;

type KernelCollection =
  | "affiliations"
  | "relationships"
  | "organizations"
  | "entities"
  | "tasks"
  | "perspectives";

type KernelCollectionRecord<C extends KernelCollection> = ScenarioKernelInput[C][number];
type KernelMutableField = {
  affiliations: "displayName" | "category";
  relationships: "sourceAffiliationId" | "targetAffiliationId" | "disposition";
  organizations: "displayName" | "kind" | "affiliationId" | "parentOrganizationId";
  entities: "displayName" | "domain" | "kind" | "affiliationId" | "organizationId" | "capabilityRefs";
  tasks:
    | "kind"
    | "ownerOrganizationId"
    | "participantEntityIds"
    | "objective"
    | "timing"
    | "dependencyTaskIds"
    | "capabilityRefs"
    | "lifecycle";
  perspectives:
    | "kind"
    | "ownerAffiliationId"
    | "visibleAffiliationIds"
    | "exposeScenarioIdentity"
    | "exposeScenarioPurpose"
    | "capabilityVisibility"
    | "surfaces";
};
type KernelMutableKey<C extends KernelCollection> = KernelMutableField[C] & keyof KernelCollectionRecord<C>;
type KernelSetFieldPatch<C extends KernelCollection> = {
  [F in KernelMutableKey<C>]: {
    kind: "SET_FIELD";
    collection: C;
    id: string;
    field: F;
    value: Exclude<KernelCollectionRecord<C>[F], undefined>
      | (undefined extends KernelCollectionRecord<C>[F] ? null : never);
  }
}[KernelMutableKey<C>];
type KernelAddPatch = {
  [C in KernelCollection]: { kind: "ADD_RECORD"; collection: C; value: KernelCollectionRecord<C> };
}[KernelCollection];
type KernelSetPatch = {
  [C in KernelCollection]: KernelSetFieldPatch<C>;
}[KernelCollection];

export type ScenarioKernelPatch =
  | KernelAddPatch
  | { kind: "REMOVE_RECORD"; collection: KernelCollection; id: string }
  | KernelSetPatch
  | { kind: "REORDER"; collection: KernelCollection; orderedIds: string[] };

type MutationCommandKind = "ADD" | "REMOVE" | "MOVE" | "REORDER" | "GROUP" | "ASSIGN" | "BULK_EDIT";

type KernelMovePatch =
  | Extract<KernelSetPatch, { collection: "organizations"; field: "parentOrganizationId" }>
  | Extract<KernelSetPatch, { collection: "entities"; field: "organizationId" }>
  | Extract<KernelSetPatch, { collection: "tasks"; field: "ownerOrganizationId" }>;
type KernelAssignPatch =
  | Extract<KernelSetPatch, { collection: "organizations"; field: "affiliationId" }>
  | Extract<KernelSetPatch, { collection: "entities"; field: "affiliationId" | "capabilityRefs" }>
  | Extract<KernelSetPatch, { collection: "tasks"; field: "participantEntityIds" | "capabilityRefs" }>
  | Extract<KernelSetPatch, {
    collection: "perspectives";
    field: "ownerAffiliationId" | "visibleAffiliationIds" | "capabilityVisibility" | "surfaces";
  }>;
type KernelGroupPatch =
  | Extract<KernelSetPatch, { collection: "organizations"; field: "parentOrganizationId" }>
  | Extract<KernelSetPatch, { collection: "entities"; field: "organizationId" }>;
type MutationCommand<K extends MutationCommandKind, P extends ScenarioKernelPatch> = {
  schemaVersion: typeof SCENARIO_KERNEL_COMMAND_SCHEMA_VERSION;
  id: string;
  baseDigest: string;
  kind: K;
  patches: P[];
};

export type ScenarioKernelCommand =
  | MutationCommand<"ADD", KernelAddPatch | KernelSetPatch>
  | MutationCommand<"REMOVE", Extract<ScenarioKernelPatch, { kind: "REMOVE_RECORD" }> | KernelSetPatch>
  | MutationCommand<"MOVE", KernelMovePatch>
  | MutationCommand<"REORDER", Extract<ScenarioKernelPatch, { kind: "REORDER" }>>
  | MutationCommand<"GROUP", Extract<KernelAddPatch, { collection: "organizations" }> | KernelGroupPatch>
  | MutationCommand<"ASSIGN", KernelAssignPatch>
  | MutationCommand<"BULK_EDIT", KernelSetPatch>
  | {
  schemaVersion: typeof SCENARIO_KERNEL_COMMAND_SCHEMA_VERSION;
  id: string;
  baseDigest: string;
  kind: "IMPORT" | "TEMPLATE_APPLY";
  sourceDigest: `sha256:${string}`;
  replacement: ScenarioKernelInput;
  };

export type ScenarioKernelHistoryEntry = {
  command: ScenarioKernelCommand;
  beforeBytes: string;
  beforeDigest: string;
  afterBytes: string;
  afterDigest: string;
};

export type ScenarioKernelHistory = {
  schemaVersion: typeof SCENARIO_KERNEL_HISTORY_SCHEMA_VERSION;
  revision: number;
  current: CompiledScenarioKernel;
  past: readonly ScenarioKernelHistoryEntry[];
  future: readonly ScenarioKernelHistoryEntry[];
};

export type ScenarioKernelHistoryIssueCode =
  | "KERNEL_COMMAND_INVALID"
  | "KERNEL_COMMAND_STALE_DRAFT"
  | "KERNEL_COMMAND_TARGET_MISSING"
  | "KERNEL_COMMAND_CONFLICT"
  | "KERNEL_HISTORY_LIMIT_EXCEEDED"
  | "KERNEL_HISTORY_EMPTY";

export class ScenarioKernelHistoryError extends Error {
  readonly code: ScenarioKernelHistoryIssueCode;
  readonly path: string;

  constructor(
    code: ScenarioKernelHistoryIssueCode,
    path: string,
    message: string,
  ) {
    super(message);
    this.name = "ScenarioKernelHistoryError";
    this.code = code;
    this.path = path;
  }
}

const ID = /^[a-z0-9]+(?:[._:/-][a-z0-9]+)*$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const MAX_PATCHES = 1_000;
const MAX_HISTORY = 1_000;
const COLLECTIONS: KernelCollection[] = [
  "affiliations", "relationships", "organizations", "entities", "tasks", "perspectives",
];
const MUTATION_KINDS: MutationCommandKind[] = [
  "ADD", "REMOVE", "MOVE", "REORDER", "GROUP", "ASSIGN", "BULK_EDIT",
];
const FIELDS: Record<KernelCollection, ReadonlySet<string>> = {
  affiliations: new Set(["displayName", "category"]),
  relationships: new Set(["sourceAffiliationId", "targetAffiliationId", "disposition"]),
  organizations: new Set(["displayName", "kind", "affiliationId", "parentOrganizationId"]),
  entities: new Set(["displayName", "domain", "kind", "affiliationId", "organizationId", "capabilityRefs"]),
  tasks: new Set([
    "kind", "ownerOrganizationId", "participantEntityIds", "objective", "timing",
    "dependencyTaskIds", "capabilityRefs", "lifecycle",
  ]),
  perspectives: new Set([
    "kind", "ownerAffiliationId", "visibleAffiliationIds", "exposeScenarioIdentity",
    "exposeScenarioPurpose", "capabilityVisibility", "surfaces",
  ]),
};

function exactKeys(value: Record<string, unknown>, expected: readonly string[], path: string) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(sortedExpected)) {
    throw new ScenarioKernelHistoryError("KERNEL_COMMAND_INVALID", path, `${path} has unsupported or missing fields.`);
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ScenarioKernelHistoryError("KERNEL_COMMAND_INVALID", path, `${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function stableId(value: unknown, path: string) {
  if (typeof value !== "string" || value.length > 128 || !ID.test(value)) {
    throw new ScenarioKernelHistoryError("KERNEL_COMMAND_INVALID", path, `${path} must be a bounded stable identifier.`);
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

function authoredInput(compiled: CompiledScenarioKernel): ScenarioKernelInput {
  const source = structuredClone(compiled) as Record<string, unknown>;
  delete source.capabilityDescriptors;
  delete source.canonicalBytes;
  delete source.digest;
  return source as ScenarioKernelInput;
}

function validatePatch(input: unknown, index: number): ScenarioKernelPatch {
  const path = `$.patches[${index}]`;
  const patch = record(input, path);
  if (patch.kind === "ADD_RECORD") {
    exactKeys(patch, ["kind", "collection", "value"], path);
  } else if (patch.kind === "REMOVE_RECORD") {
    exactKeys(patch, ["kind", "collection", "id"], path);
    stableId(patch.id, `${path}.id`);
  } else if (patch.kind === "SET_FIELD") {
    exactKeys(patch, ["kind", "collection", "id", "field", "value"], path);
    stableId(patch.id, `${path}.id`);
    if (typeof patch.field !== "string") {
      throw new ScenarioKernelHistoryError("KERNEL_COMMAND_INVALID", `${path}.field`, "Patch field must be a string.");
    }
  } else if (patch.kind === "REORDER") {
    exactKeys(patch, ["kind", "collection", "orderedIds"], path);
    if (!Array.isArray(patch.orderedIds) || patch.orderedIds.length > 10_000) {
      throw new ScenarioKernelHistoryError("KERNEL_COMMAND_INVALID", `${path}.orderedIds`, "Reorder IDs exceed the collection bound.");
    }
    patch.orderedIds.forEach((id, idIndex) => stableId(id, `${path}.orderedIds[${idIndex}]`));
  } else {
    throw new ScenarioKernelHistoryError("KERNEL_COMMAND_INVALID", `${path}.kind`, "Patch kind is unsupported.");
  }
  if (!COLLECTIONS.includes(patch.collection as KernelCollection)) {
    throw new ScenarioKernelHistoryError("KERNEL_COMMAND_INVALID", `${path}.collection`, "Patch collection is unsupported.");
  }
  if (patch.kind === "SET_FIELD" && !FIELDS[patch.collection as KernelCollection].has(String(patch.field))) {
    throw new ScenarioKernelHistoryError("KERNEL_COMMAND_INVALID", `${path}.field`, "Patch field is not mutable for this collection.");
  }
  return structuredClone(input) as ScenarioKernelPatch;
}

function validateCommand(input: unknown): ScenarioKernelCommand {
  const command = record(input, "$command");
  stableId(command.id, "$command.id");
  if (typeof command.baseDigest !== "string" || !/^[0-9a-f]{64}$/.test(command.baseDigest)) {
    throw new ScenarioKernelHistoryError("KERNEL_COMMAND_INVALID", "$command.baseDigest", "Command base digest is invalid.");
  }
  if (command.schemaVersion !== SCENARIO_KERNEL_COMMAND_SCHEMA_VERSION) {
    throw new ScenarioKernelHistoryError("KERNEL_COMMAND_INVALID", "$command.schemaVersion", "Command schema is unsupported.");
  }
  if (command.kind === "IMPORT" || command.kind === "TEMPLATE_APPLY") {
    exactKeys(command, ["schemaVersion", "id", "baseDigest", "kind", "sourceDigest", "replacement"], "$command");
    if (typeof command.sourceDigest !== "string" || !DIGEST.test(command.sourceDigest)) {
      throw new ScenarioKernelHistoryError("KERNEL_COMMAND_INVALID", "$command.sourceDigest", "Import/template source digest is invalid.");
    }
    const replacement = compileScenarioKernel(command.replacement);
    if (`sha256:${replacement.digest}` !== command.sourceDigest) {
      throw new ScenarioKernelHistoryError("KERNEL_COMMAND_INVALID", "$command.sourceDigest", "Import/template source digest does not match its replacement bytes.");
    }
    const expectedSource = command.kind === "IMPORT" ? "IMPORTED" : "TEMPLATE";
    if (replacement.provenance.source !== expectedSource) {
      throw new ScenarioKernelHistoryError("KERNEL_COMMAND_INVALID", "$command.replacement.provenance.source", `${command.kind} requires ${expectedSource} provenance.`);
    }
    return structuredClone(input) as ScenarioKernelCommand;
  }
  if (!MUTATION_KINDS.includes(command.kind as MutationCommandKind)) {
    throw new ScenarioKernelHistoryError("KERNEL_COMMAND_INVALID", "$command.kind", "Command kind is unsupported.");
  }
  exactKeys(command, ["schemaVersion", "id", "baseDigest", "kind", "patches"], "$command");
  if (!Array.isArray(command.patches) || command.patches.length === 0 || command.patches.length > MAX_PATCHES) {
    throw new ScenarioKernelHistoryError("KERNEL_COMMAND_INVALID", "$command.patches", "Command patches must be non-empty and bounded.");
  }
  const commandKind = command.kind as MutationCommandKind;
  const patches = command.patches.map(validatePatch);
  const kinds = patches.map((patch) => patch.kind);
  const setPatches = patches.filter((patch): patch is Extract<ScenarioKernelPatch, { kind: "SET_FIELD" }> =>
    patch.kind === "SET_FIELD");
  const setTargets = new Set<string>();
  for (const patch of setPatches) {
    const target = `${patch.collection}:${patch.id}:${patch.field}`;
    if (setTargets.has(target)) {
      throw new ScenarioKernelHistoryError("KERNEL_COMMAND_CONFLICT", "$command.patches", `Command assigns ${target} more than once.`);
    }
    setTargets.add(target);
  }
  if (commandKind === "ADD"
    && (kinds.filter((kind) => kind === "ADD_RECORD").length !== 1
      || kinds.some((kind) => kind !== "ADD_RECORD" && kind !== "SET_FIELD"))) {
    throw new ScenarioKernelHistoryError("KERNEL_COMMAND_INVALID", "$command.patches", "Add commands require one addition plus optional explicit resolution patches.");
  }
  if (commandKind === "REMOVE"
    && (kinds.filter((kind) => kind === "REMOVE_RECORD").length !== 1
      || kinds.some((kind) => kind !== "REMOVE_RECORD" && kind !== "SET_FIELD"))) {
    throw new ScenarioKernelHistoryError("KERNEL_COMMAND_INVALID", "$command.patches", "Remove commands require exactly one removal plus explicit resolution patches.");
  }
  if (commandKind === "MOVE" && (kinds.some((kind) => kind !== "SET_FIELD")
    || setPatches.some((patch) => !(
      (patch.collection === "organizations" && patch.field === "parentOrganizationId")
      || (patch.collection === "entities" && patch.field === "organizationId")
      || (patch.collection === "tasks" && patch.field === "ownerOrganizationId")
    )))) {
    throw new ScenarioKernelHistoryError("KERNEL_COMMAND_INVALID", "$command.patches", "Move commands only admit organization-placement assignments.");
  }
  if (commandKind === "ASSIGN" && (kinds.some((kind) => kind !== "SET_FIELD")
    || setPatches.some((patch) => !(
      (patch.collection === "organizations" && patch.field === "affiliationId")
      || (patch.collection === "entities" && ["affiliationId", "capabilityRefs"].includes(patch.field))
      || (patch.collection === "tasks" && ["participantEntityIds", "capabilityRefs"].includes(patch.field))
      || (patch.collection === "perspectives"
        && ["ownerAffiliationId", "visibleAffiliationIds", "capabilityVisibility", "surfaces"].includes(patch.field))
    )))) {
    throw new ScenarioKernelHistoryError("KERNEL_COMMAND_INVALID", "$command.patches", `${commandKind} commands only admit field assignments.`);
  }
  if (commandKind === "REORDER" && (patches.length !== 1 || kinds[0] !== "REORDER")) {
    throw new ScenarioKernelHistoryError("KERNEL_COMMAND_INVALID", "$command.patches", "Reorder commands require exactly one complete reorder patch.");
  }
  if (commandKind === "GROUP"
    && (kinds.filter((kind) => kind === "ADD_RECORD").length !== 1
      || !kinds.includes("SET_FIELD")
      || kinds.some((kind) => kind !== "ADD_RECORD" && kind !== "SET_FIELD")
      || patches.some((patch) => patch.kind === "ADD_RECORD" && patch.collection !== "organizations")
      || setPatches.some((patch) => !(
        (patch.collection === "entities" && patch.field === "organizationId")
        || (patch.collection === "organizations" && patch.field === "parentOrganizationId")
      )))) {
    throw new ScenarioKernelHistoryError("KERNEL_COMMAND_INVALID", "$command.patches", "Group commands add a group and assign at least one record.");
  }
  if (commandKind === "BULK_EDIT"
    && (patches.length < 2 || kinds.some((kind) => kind !== "SET_FIELD"))) {
    throw new ScenarioKernelHistoryError("KERNEL_COMMAND_INVALID", "$command.patches", "Bulk-edit commands require at least two field assignments.");
  }
  return { ...(structuredClone(input) as Record<string, unknown>), patches } as ScenarioKernelCommand;
}

function applyPatches(input: ScenarioKernelInput, patches: readonly ScenarioKernelPatch[]) {
  const draft = structuredClone(input);
  for (const [index, patch] of patches.entries()) {
    const collection = draft[patch.collection] as Array<{ id: string } & Record<string, unknown>>;
    if (patch.kind === "ADD_RECORD") {
      collection.push(structuredClone(patch.value) as { id: string } & Record<string, unknown>);
      continue;
    }
    if (patch.kind === "REORDER") {
      const byId = new Map(collection.map((item) => [item.id, item]));
      if (new Set(patch.orderedIds).size !== collection.length
        || patch.orderedIds.some((id) => !byId.has(id))) {
        throw new ScenarioKernelHistoryError("KERNEL_COMMAND_CONFLICT", `$.patches[${index}].orderedIds`, "Reorder must name every collection record exactly once.");
      }
      collection.splice(0, collection.length, ...patch.orderedIds.map((id) => byId.get(id)!));
      continue;
    }
    const targetIndex = collection.findIndex((item) => item.id === patch.id);
    if (targetIndex < 0) {
      throw new ScenarioKernelHistoryError("KERNEL_COMMAND_TARGET_MISSING", `$.patches[${index}].id`, `${patch.id} is not present.`);
    }
    if (patch.kind === "REMOVE_RECORD") {
      collection.splice(targetIndex, 1);
    } else {
      const target = collection[targetIndex];
      if (patch.value === null) delete target[patch.field];
      else target[patch.field] = structuredClone(patch.value);
    }
  }
  return draft;
}

export function createScenarioKernelHistory(input: unknown): ScenarioKernelHistory {
  return deepFreeze({
    schemaVersion: SCENARIO_KERNEL_HISTORY_SCHEMA_VERSION,
    revision: 0,
    current: compileScenarioKernel(input),
    past: [],
    future: [],
  });
}

export function applyScenarioKernelCommand(
  history: ScenarioKernelHistory,
  input: unknown,
): ScenarioKernelHistory {
  if (history.past.length >= MAX_HISTORY) {
    throw new ScenarioKernelHistoryError("KERNEL_HISTORY_LIMIT_EXCEEDED", "$.past", "History exceeds the 1,000-command bound.");
  }
  const command = validateCommand(input);
  if ([...history.past, ...history.future].some((entry) => entry.command.id === command.id)) {
    throw new ScenarioKernelHistoryError("KERNEL_COMMAND_CONFLICT", "$command.id", "Command ID is already present in this history.");
  }
  if (command.baseDigest !== history.current.digest) {
    throw new ScenarioKernelHistoryError("KERNEL_COMMAND_STALE_DRAFT", "$command.baseDigest", "Command is not bound to the current draft digest.");
  }
  const before = authoredInput(history.current);
  let replacement: ScenarioKernelInput;
  if ("replacement" in command) {
    replacement = structuredClone(command.replacement);
  } else {
    replacement = applyPatches(before, command.patches);
  }
  const current = compileScenarioKernel(replacement);
  const entry: ScenarioKernelHistoryEntry = {
    command,
    beforeBytes: canonicalJson(before),
    beforeDigest: history.current.digest,
    afterBytes: canonicalJson(authoredInput(current)),
    afterDigest: current.digest,
  };
  return deepFreeze({
    schemaVersion: SCENARIO_KERNEL_HISTORY_SCHEMA_VERSION,
    revision: history.revision + 1,
    current,
    past: [...history.past, entry],
    future: [],
  });
}

export function undoScenarioKernelCommand(history: ScenarioKernelHistory): ScenarioKernelHistory {
  const entry = history.past.at(-1);
  if (!entry) throw new ScenarioKernelHistoryError("KERNEL_HISTORY_EMPTY", "$.past", "No command is available to undo.");
  const current = compileScenarioKernel(JSON.parse(entry.beforeBytes));
  if (current.digest !== entry.beforeDigest) throw new ScenarioKernelHistoryError("KERNEL_COMMAND_CONFLICT", "$.past", "Undo bytes do not match their recorded digest.");
  return deepFreeze({
    ...history,
    revision: history.revision + 1,
    current,
    past: history.past.slice(0, -1),
    future: [entry, ...history.future],
  });
}

export function redoScenarioKernelCommand(history: ScenarioKernelHistory): ScenarioKernelHistory {
  const [entry, ...future] = history.future;
  if (!entry) throw new ScenarioKernelHistoryError("KERNEL_HISTORY_EMPTY", "$.future", "No command is available to redo.");
  const current = compileScenarioKernel(JSON.parse(entry.afterBytes));
  if (current.digest !== entry.afterDigest) throw new ScenarioKernelHistoryError("KERNEL_COMMAND_CONFLICT", "$.future", "Redo bytes do not match their recorded digest.");
  return deepFreeze({
    ...history,
    revision: history.revision + 1,
    current,
    past: [...history.past, entry],
    future,
  });
}
