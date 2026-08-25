import { canonicalJson } from "./canonical-json.ts";
import { sha256HexSync, sha256Utf8HexSync } from "./geospatial/digest.ts";
import {
  AIR_MISSION_SCHEMA_VERSION,
  COMPILED_AIR_MISSION_SCHEMA_VERSION,
  isAirMissionDefinition,
  type AirMissionDefinition,
  type CompiledAirMission,
} from "./air-mission.ts";
import {
  createScenarioKernelHistory,
  type ScenarioKernelHistory,
} from "./scenario-kernel-history.ts";
import {
  projectScenarioKernel,
  verifyCompiledScenarioKernel,
  type CompiledScenarioKernel,
  type ScenarioKernelInput,
  type ScenarioKernelProjection,
  type ScenarioKernelSurface,
} from "./scenario-kernel.ts";

export const SCENARIO_KERNEL_INTAKE_SCHEMA_VERSION = "vector.scenario-kernel-intake.v1" as const;
export const SCENARIO_KERNEL_WORKSPACE_SCHEMA_VERSION = "vector.scenario-kernel-workspace.v1" as const;
export const SCENARIO_KERNEL_AIR_MISSION_MAP_SCHEMA_VERSION =
  "vector.scenario-kernel-air-mission-map.v1" as const;
export const SCENARIO_KERNEL_AIR_MISSION_BINDING_SCHEMA_VERSION =
  "vector.scenario-kernel-air-mission-binding.v1" as const;

export type ScenarioKernelIntake = {
  schemaVersion: typeof SCENARIO_KERNEL_INTAKE_SCHEMA_VERSION;
  route: "BLANK" | "TEMPLATE" | "IMPORT";
  sourceDigest: `sha256:${string}`;
  draft: ScenarioKernelInput;
};

export type ScenarioKernelSelectionRef = {
  collection: "affiliations" | "organizations" | "entities" | "tasks";
  id: string;
};

export type ScenarioKernelWorkspaceProjection = {
  schemaVersion: typeof SCENARIO_KERNEL_WORKSPACE_SCHEMA_VERSION;
  surface: ScenarioKernelSurface;
  projection: ScenarioKernelProjection;
  navigator: Array<{
    canonicalRef: ScenarioKernelSelectionRef;
    parentRef: ScenarioKernelSelectionRef | null;
  }>;
  selection:
    | { state: "NONE" | "REDACTED" }
    | { state: "VISIBLE"; canonicalRef: ScenarioKernelSelectionRef };
  inspectors: Array<{
    capabilityId: string;
    capabilityVersion: string;
    inspectorId: string;
    selector: "SCENARIO_IDENTITY" | "ENTITY_IDENTITY" | "TASK_IDENTITY" | "CAPABILITY_REFERENCE";
  }>;
  digest: string;
};

export type ScenarioKernelAirMissionMap = {
  schemaVersion: typeof SCENARIO_KERNEL_AIR_MISSION_MAP_SCHEMA_VERSION;
  taskId: string;
  assignments: Array<{ assignmentId: string; entityId: string }>;
  targets: Array<{ targetId: string; entityId: string }>;
};

/**
 * Identity-only boundary between #156 composition and #60 execution. Mission
 * fields remain exclusively in AirMissionDefinition/CompiledAirMission.
 */
export type ScenarioKernelAirMissionBinding = {
  schemaVersion: typeof SCENARIO_KERNEL_AIR_MISSION_BINDING_SCHEMA_VERSION;
  kernel: { schemaVersion: CompiledScenarioKernel["schemaVersion"]; id: string; version: string; digest: string };
  airMission: {
    schemaVersion: typeof AIR_MISSION_SCHEMA_VERSION;
    compiledSchemaVersion: typeof COMPILED_AIR_MISSION_SCHEMA_VERSION;
    id: string;
    version: string;
    authoredDigest: string;
    compiledDigest: string;
  };
  taskId: string;
  assignments: Array<{ assignmentId: string; entityId: string }>;
  targets: Array<{ targetId: string; entityId: string }>;
  canonicalBytes: string;
  digest: string;
};

export type ScenarioKernelAdapterIssueCode =
  | "KERNEL_INTAKE_INVALID"
  | "KERNEL_INTAKE_DIGEST_MISMATCH"
  | "KERNEL_INTAKE_PROVENANCE_MISMATCH"
  | "KERNEL_INTAKE_MIGRATION_UNAVAILABLE"
  | "KERNEL_WORKSPACE_SELECTION_INVALID"
  | "KERNEL_AIR_MISSION_INVALID"
  | "KERNEL_AIR_MISSION_REFERENCE_INVALID"
  | "KERNEL_AIR_MISSION_CAPABILITY_MISSING";

export class ScenarioKernelAdapterError extends Error {
  readonly code: ScenarioKernelAdapterIssueCode;
  readonly path: string;

  constructor(code: ScenarioKernelAdapterIssueCode, path: string, message: string) {
    super(message);
    this.name = "ScenarioKernelAdapterError";
    this.code = code;
    this.path = path;
  }
}

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const RAW_DIGEST = /^[0-9a-f]{64}$/;
const STABLE_ID = /^[a-z0-9]+(?:[._:/-][a-z0-9]+)*$/;
const AIR_MISSION_CAPABILITY = "capability.air-mission@1.0.0";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

function record(value: unknown, path: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ScenarioKernelAdapterError("KERNEL_INTAKE_INVALID", path, `${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], path: string) {
  if (canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new ScenarioKernelAdapterError("KERNEL_INTAKE_INVALID", path, `${path} has unsupported or missing fields.`);
  }
}

function airFail(
  code: Extract<ScenarioKernelAdapterIssueCode,
    "KERNEL_AIR_MISSION_INVALID" | "KERNEL_AIR_MISSION_REFERENCE_INVALID" | "KERNEL_AIR_MISSION_CAPABILITY_MISSING">,
  path: string,
  message: string,
): never {
  throw new ScenarioKernelAdapterError(code, path, message);
}

function airRecord(value: unknown, path: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    airFail("KERNEL_AIR_MISSION_INVALID", path, `${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function airExactKeys(value: Record<string, unknown>, expected: readonly string[], path: string) {
  if (canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    airFail("KERNEL_AIR_MISSION_INVALID", path, `${path} has unsupported or missing fields.`);
  }
}

function airStableId(value: unknown, path: string) {
  if (typeof value !== "string" || value.length > 128 || !STABLE_ID.test(value)) {
    airFail("KERNEL_AIR_MISSION_REFERENCE_INVALID", path, `${path} must be a bounded stable identifier.`);
  }
}

function hasCapabilityReference(
  refs: ReadonlyArray<ScenarioKernelInput["entities"][number]["capabilityRefs"][number]>,
  key: string,
) {
  return refs.some(({ id, version }) => `${id}@${version}` === key);
}

function validateCompiledAirMissionLineage(
  mission: AirMissionDefinition,
  compiled: CompiledAirMission,
) {
  const compiledRecord = airRecord(compiled, "$.compiledAirMission");
  airExactKeys(compiledRecord, [
    "schemaVersion", "id", "version", "authoredDigest", "compiledDigest", "modelPackDigest",
    "environmentPackDigest", "authored", "flightPlan", "assignment", "policies", "start",
  ], "$.compiledAirMission");
  if (compiled.schemaVersion !== COMPILED_AIR_MISSION_SCHEMA_VERSION
    || compiled.id !== mission.id
    || compiled.version !== mission.version
    || !RAW_DIGEST.test(compiled.authoredDigest)
    || !RAW_DIGEST.test(compiled.compiledDigest)
    || !RAW_DIGEST.test(compiled.modelPackDigest)
    || !DIGEST.test(compiled.environmentPackDigest)) {
    airFail("KERNEL_AIR_MISSION_INVALID", "$.compiledAirMission", "Compiled Air mission identity is invalid.");
  }
  const compiledCopy = structuredClone(compiled) as Record<string, unknown>;
  const claimedCompiledDigest = compiledCopy.compiledDigest;
  delete compiledCopy.compiledDigest;
  if (sha256HexSync(compiledCopy) !== claimedCompiledDigest) {
    airFail(
      "KERNEL_AIR_MISSION_INVALID",
      "$.compiledAirMission.compiledDigest",
      "Compiled Air mission digest does not bind its exact published content.",
    );
  }
  if (sha256HexSync(mission) !== compiled.authoredDigest
    || canonicalJson(compiled.authored) !== canonicalJson(mission)) {
    airFail(
      "KERNEL_AIR_MISSION_INVALID",
      "$.compiledAirMission.authoredDigest",
      "Compiled Air mission does not bind the supplied authoritative AirMissionDefinition.",
    );
  }
  if (canonicalJson(compiled.flightPlan) !== canonicalJson(mission.flightPlans[0])
    || canonicalJson(compiled.policies) !== canonicalJson(mission.policies)) {
    airFail(
      "KERNEL_AIR_MISSION_INVALID",
      "$.compiledAirMission.flightPlan",
      "Compiled Air mission projection disagrees with the authoritative mission object.",
    );
  }
  const assignment = airRecord(compiled.assignment, "$.compiledAirMission.assignment");
  airExactKeys(assignment, [
    "id", "flightPlanId", "aircraftId", "initialFuelPercent", "loadout", "groundEnvelope",
  ], "$.compiledAirMission.assignment");
  const authoredAssignment = mission.assignments.find(({ id }) => id === compiled.assignment.id);
  if (!authoredAssignment
    || compiled.modelPackDigest !== authoredAssignment.aircraftModelPackDigest
    || compiled.assignment.flightPlanId !== authoredAssignment.flightPlanId
    || compiled.assignment.aircraftId !== authoredAssignment.aircraftId
    || compiled.assignment.initialFuelPercent !== authoredAssignment.initialFuelPercent
    || canonicalJson(compiled.assignment.loadout) !== canonicalJson(authoredAssignment.loadout.stores)) {
    airFail(
      "KERNEL_AIR_MISSION_INVALID",
      "$.compiledAirMission.assignment",
      "Compiled Air mission assignment disagrees with its authored assignment.",
    );
  }
  const envelope = airRecord(
    compiled.assignment.groundEnvelope,
    "$.compiledAirMission.assignment.groundEnvelope",
  );
  airExactKeys(envelope, [
    "schemaVersion", "id", "aircraftId", "aircraftModelId", "modelPackDigest",
    "minimumRunwayLengthM", "compatibleSurfaces", "maximumTailwindMps", "valueState",
    "evidenceRefIds", "limitationIds", "digest",
  ], "$.compiledAirMission.assignment.groundEnvelope");
  const envelopeCopy = structuredClone(compiled.assignment.groundEnvelope) as Record<string, unknown>;
  const claimedEnvelopeDigest = envelopeCopy.digest;
  delete envelopeCopy.digest;
  if (typeof claimedEnvelopeDigest !== "string" || sha256HexSync(envelopeCopy) !== claimedEnvelopeDigest) {
    airFail(
      "KERNEL_AIR_MISSION_INVALID",
      "$.compiledAirMission.assignment.groundEnvelope.digest",
      "Compiled ground-envelope digest does not bind its exact published content.",
    );
  }
  if (compiled.assignment.groundEnvelope.id !== authoredAssignment.groundCompatibility.envelopeId
    || compiled.assignment.groundEnvelope.digest !== authoredAssignment.groundCompatibility.envelopeDigest
    || compiled.assignment.groundEnvelope.aircraftId !== authoredAssignment.aircraftId
    || compiled.assignment.groundEnvelope.modelPackDigest !== authoredAssignment.aircraftModelPackDigest) {
    airFail(
      "KERNEL_AIR_MISSION_INVALID",
      "$.compiledAirMission.assignment.groundEnvelope",
      "Compiled ground-envelope identity disagrees with the authoritative assignment binding.",
    );
  }
  const start = airRecord(compiled.start, "$.compiledAirMission.start");
  airExactKeys(start, [
    "posture", "entryState", "position", "initialSpeedMps", "headingSource", "runwayHeadingDegTrue",
  ], "$.compiledAirMission.start");
  const firstPoint = mission.flightPlans[0]?.routePoints[0];
  if (!firstPoint) {
    airFail("KERNEL_AIR_MISSION_INVALID", "$.airMission.flightPlans", "The Air mission has no start point.");
  }
  const speed = firstPoint.constraint.speed.kind === "TAS"
    ? firstPoint.constraint.speed.valueMps
    : firstPoint.constraint.speed.value * Math.sqrt(
      1.4 * 287.05 * (Math.min(25_000, Math.max(0, firstPoint.position.altitude.valueM)) <= 11_000
        ? 288.15 - 0.0065 * Math.min(25_000, Math.max(0, firstPoint.position.altitude.valueM))
        : 216.65),
    );
  const expectedStart: CompiledAirMission["start"] = mission.start.posture === "AIRBORNE"
    ? {
        posture: "AIRBORNE",
        entryState: "AIRBORNE",
        position: firstPoint.position,
        initialSpeedMps: speed,
        headingSource: "FLIGHT_PLAN_FIRST_LEG",
        runwayHeadingDegTrue: null,
      }
    : {
        posture: mission.start.posture,
        entryState: "GROUND",
        position: {
          longitude: mission.start.runway.threshold.longitude,
          latitude: mission.start.runway.threshold.latitude,
          altitude: mission.start.runway.threshold.elevation,
        },
        initialSpeedMps: 0,
        headingSource: "RUNWAY_TRUE_HEADING",
        runwayHeadingDegTrue: mission.start.runway.headingDeg,
      };
  if (canonicalJson(compiled.start) !== canonicalJson(expectedStart)) {
    airFail(
      "KERNEL_AIR_MISSION_INVALID",
      "$.compiledAirMission.start",
      "Compiled start state disagrees with the authoritative Air mission start.",
    );
  }
}

/**
 * #60 consumer boundary: bind canonical composition identities to the exact
 * published Air mission artifacts. This adapter deliberately emits references
 * and digests only; Air mission fields and runtime authority stay with #60.
 */
export function bindAirMissionToScenarioKernel(
  kernelInput: CompiledScenarioKernel,
  missionInput: AirMissionDefinition,
  compiledInput: CompiledAirMission,
  mappingInput: unknown,
): ScenarioKernelAirMissionBinding {
  const kernel = verifyCompiledScenarioKernel(kernelInput);
  if (!isAirMissionDefinition(missionInput)
    || missionInput.schemaVersion !== AIR_MISSION_SCHEMA_VERSION) {
    airFail(
      "KERNEL_AIR_MISSION_INVALID",
      "$.airMission",
      "The supplied Air mission does not satisfy the published #60 contract.",
    );
  }
  validateCompiledAirMissionLineage(missionInput, compiledInput);

  const mapping = airRecord(mappingInput, "$.mapping");
  airExactKeys(mapping, ["schemaVersion", "taskId", "assignments", "targets"], "$.mapping");
  if (mapping.schemaVersion !== SCENARIO_KERNEL_AIR_MISSION_MAP_SCHEMA_VERSION) {
    airFail("KERNEL_AIR_MISSION_INVALID", "$.mapping.schemaVersion", "Air mission mapping schema is unsupported.");
  }
  airStableId(mapping.taskId, "$.mapping.taskId");
  if (!Array.isArray(mapping.assignments) || mapping.assignments.length > 10_000) {
    airFail("KERNEL_AIR_MISSION_INVALID", "$.mapping.assignments", "Assignments must be a bounded array.");
  }
  if (!Array.isArray(mapping.targets) || mapping.targets.length > 10_000) {
    airFail("KERNEL_AIR_MISSION_INVALID", "$.mapping.targets", "Targets must be a bounded array.");
  }

  const assignments = mapping.assignments.map((candidate, index) => {
    const value = airRecord(candidate, `$.mapping.assignments[${index}]`);
    airExactKeys(value, ["assignmentId", "entityId"], `$.mapping.assignments[${index}]`);
    airStableId(value.assignmentId, `$.mapping.assignments[${index}].assignmentId`);
    airStableId(value.entityId, `$.mapping.assignments[${index}].entityId`);
    return { assignmentId: String(value.assignmentId), entityId: String(value.entityId) };
  });
  const targets = mapping.targets.map((candidate, index) => {
    const value = airRecord(candidate, `$.mapping.targets[${index}]`);
    airExactKeys(value, ["targetId", "entityId"], `$.mapping.targets[${index}]`);
    airStableId(value.targetId, `$.mapping.targets[${index}].targetId`);
    airStableId(value.entityId, `$.mapping.targets[${index}].entityId`);
    return { targetId: String(value.targetId), entityId: String(value.entityId) };
  });
  for (const [identities, key, path] of [
    [assignments.map(({ assignmentId }) => assignmentId), "assignmentId", "$.mapping.assignments"],
    [assignments.map(({ entityId }) => entityId), "entityId", "$.mapping.assignments"],
    [targets.map(({ targetId }) => targetId), "targetId", "$.mapping.targets"],
    [targets.map(({ entityId }) => entityId), "entityId", "$.mapping.targets"],
  ] as const) {
    if (new Set(identities).size !== identities.length) {
      airFail("KERNEL_AIR_MISSION_REFERENCE_INVALID", path, `${path} contains a duplicate ${key}.`);
    }
  }

  const authoredAssignmentIds = missionInput.assignments.map(({ id }) => id).sort();
  const mappedAssignmentIds = assignments.map(({ assignmentId }) => assignmentId).sort();
  if (canonicalJson(authoredAssignmentIds) !== canonicalJson(mappedAssignmentIds)) {
    airFail(
      "KERNEL_AIR_MISSION_REFERENCE_INVALID",
      "$.mapping.assignments",
      "The mapping must resolve every and only published Air mission assignment.",
    );
  }
  const authoredTargetIds = [...missionInput.assignedTargetIds].sort();
  const mappedTargetIds = targets.map(({ targetId }) => targetId).sort();
  if (canonicalJson(authoredTargetIds) !== canonicalJson(mappedTargetIds)) {
    airFail(
      "KERNEL_AIR_MISSION_REFERENCE_INVALID",
      "$.mapping.targets",
      "The mapping must resolve every and only published Air mission target.",
    );
  }

  const task = kernel.tasks.find(({ id }) => id === mapping.taskId);
  if (!task) {
    airFail("KERNEL_AIR_MISSION_REFERENCE_INVALID", "$.mapping.taskId", "The mapped kernel task does not exist.");
  }
  if (!hasCapabilityReference(task.capabilityRefs, AIR_MISSION_CAPABILITY)) {
    airFail(
      "KERNEL_AIR_MISSION_CAPABILITY_MISSING",
      "$.mapping.taskId",
      "The mapped task lacks the governed Air mission capability reference.",
    );
  }
  for (const [index, mapped] of assignments.entries()) {
    const entity = kernel.entities.find(({ id }) => id === mapped.entityId);
    if (!entity) {
      airFail(
        "KERNEL_AIR_MISSION_REFERENCE_INVALID",
        `$.mapping.assignments[${index}].entityId`,
        "The mapped assignment entity does not exist.",
      );
    }
    if (entity.domain !== "AIR" || entity.kind !== "PLATFORM"
      || !task.participantEntityIds.includes(entity.id)) {
      airFail(
        "KERNEL_AIR_MISSION_REFERENCE_INVALID",
        `$.mapping.assignments[${index}].entityId`,
        "An Air mission assignment must resolve to a participating AIR PLATFORM.",
      );
    }
    if (!hasCapabilityReference(entity.capabilityRefs, AIR_MISSION_CAPABILITY)) {
      airFail(
        "KERNEL_AIR_MISSION_CAPABILITY_MISSING",
        `$.mapping.assignments[${index}].entityId`,
        "The mapped assignment entity lacks the governed Air mission capability reference.",
      );
    }
  }
  for (const [index, mapped] of targets.entries()) {
    if (!kernel.entities.some(({ id }) => id === mapped.entityId)) {
      airFail(
        "KERNEL_AIR_MISSION_REFERENCE_INVALID",
        `$.mapping.targets[${index}].entityId`,
        "The mapped target entity does not exist.",
      );
    }
  }
  if (targets.length !== 1
    || task.objective.kind !== "ENTITY"
    || task.objective.id !== targets[0].entityId) {
    airFail(
      "KERNEL_AIR_MISSION_REFERENCE_INVALID",
      "$.mapping.targets",
      "The published single Air mission target must resolve to the mapped task objective.",
    );
  }

  assignments.sort((left, right) => {
    const leftKey = `${left.assignmentId}/${left.entityId}`;
    const rightKey = `${right.assignmentId}/${right.entityId}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  targets.sort((left, right) => {
    const leftKey = `${left.targetId}/${left.entityId}`;
    const rightKey = `${right.targetId}/${right.entityId}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  const material = {
    schemaVersion: SCENARIO_KERNEL_AIR_MISSION_BINDING_SCHEMA_VERSION,
    kernel: {
      schemaVersion: kernel.schemaVersion,
      id: kernel.id,
      version: kernel.version,
      digest: kernel.digest,
    },
    airMission: {
      schemaVersion: AIR_MISSION_SCHEMA_VERSION,
      compiledSchemaVersion: COMPILED_AIR_MISSION_SCHEMA_VERSION,
      id: missionInput.id,
      version: missionInput.version,
      authoredDigest: compiledInput.authoredDigest,
      compiledDigest: compiledInput.compiledDigest,
    },
    taskId: String(mapping.taskId),
    assignments,
    targets,
  };
  const canonicalBytes = canonicalJson(material);
  return deepFreeze({
    ...material,
    canonicalBytes,
    digest: sha256Utf8HexSync(canonicalBytes),
  });
}

/**
 * #154 boundary: blank, template, and import all enter the same exact kernel
 * compiler. The adapter supplies no defaults and performs no legacy inference.
 */
export function admitScenarioKernelIntake(input: unknown): ScenarioKernelHistory {
  const intake = record(input, "$intake");
  exactKeys(intake, ["schemaVersion", "route", "sourceDigest", "draft"], "$intake");
  if (intake.schemaVersion !== SCENARIO_KERNEL_INTAKE_SCHEMA_VERSION
    || !["BLANK", "TEMPLATE", "IMPORT"].includes(String(intake.route))) {
    throw new ScenarioKernelAdapterError("KERNEL_INTAKE_INVALID", "$intake", "Intake schema or route is unsupported.");
  }
  if (typeof intake.sourceDigest !== "string" || !DIGEST.test(intake.sourceDigest)) {
    throw new ScenarioKernelAdapterError("KERNEL_INTAKE_INVALID", "$intake.sourceDigest", "Intake source digest is invalid.");
  }
  const compiledDraft = createScenarioKernelHistory(intake.draft);
  const expectedDigest = `sha256:${compiledDraft.current.digest}`;
  if (intake.sourceDigest !== expectedDigest) {
    throw new ScenarioKernelAdapterError("KERNEL_INTAKE_DIGEST_MISMATCH", "$intake.sourceDigest", "Intake digest does not match the exact authored draft bytes.");
  }
  const draft = record(intake.draft, "$intake.draft");
  const provenance = record(draft.provenance, "$intake.draft.provenance");
  const expectedSource = intake.route === "BLANK"
    ? "USER_AUTHORED"
    : intake.route === "TEMPLATE" ? "TEMPLATE" : "IMPORTED";
  if (provenance.source !== expectedSource) {
    throw new ScenarioKernelAdapterError(
      "KERNEL_INTAKE_PROVENANCE_MISMATCH",
      "$intake.draft.provenance.source",
      `${String(intake.route)} intake requires ${expectedSource} provenance.`,
    );
  }
  return compiledDraft;
}

/**
 * Explicit migration boundary. V1 is the first owned kernel version, so current
 * V1 input is an identity admission and every legacy/unknown version fails
 * closed until its owner publishes a reviewed migration.
 */
export function migrateScenarioKernelInput(input: unknown): {
  sourceSchemaVersion: typeof import("./scenario-kernel.ts").SCENARIO_KERNEL_SCHEMA_VERSION;
  targetSchemaVersion: typeof import("./scenario-kernel.ts").SCENARIO_KERNEL_SCHEMA_VERSION;
  appliedMigrations: readonly [];
  history: ScenarioKernelHistory;
} {
  const source = record(input, "$source");
  if (source.schemaVersion !== "vector.scenario-kernel.v1") {
    throw new ScenarioKernelAdapterError(
      "KERNEL_INTAKE_MIGRATION_UNAVAILABLE",
      "$.schemaVersion",
      "No migration into vector.scenario-kernel.v1 is registered for this schema.",
    );
  }
  return deepFreeze({
    sourceSchemaVersion: "vector.scenario-kernel.v1",
    targetSchemaVersion: "vector.scenario-kernel.v1",
    appliedMigrations: [],
    history: createScenarioKernelHistory(input),
  });
}

function selectionVisible(projection: ScenarioKernelProjection, selection: ScenarioKernelSelectionRef) {
  return projection[selection.collection].some((candidate) => candidate.id === selection.id);
}

/**
 * #155 boundary: navigation and inspector discovery are projections over
 * already-redacted canonical records. It creates no entity, truth, event,
 * movement, decision, or comparison-result authority.
 */
export function projectScenarioKernelWorkspace(
  kernel: CompiledScenarioKernel,
  perspectiveId: string,
  surface: ScenarioKernelSurface,
  selectionInput: ScenarioKernelSelectionRef | null,
): ScenarioKernelWorkspaceProjection {
  let selection: ScenarioKernelSelectionRef | null = null;
  if (selectionInput) {
    if (typeof selectionInput !== "object" || Array.isArray(selectionInput)
      || canonicalJson(Object.keys(selectionInput).sort()) !== canonicalJson(["collection", "id"])) {
      throw new ScenarioKernelAdapterError("KERNEL_WORKSPACE_SELECTION_INVALID", "$.selection", "Workspace selection must have exact collection and ID fields.");
    }
    if (selectionInput.id.length > 128 || !STABLE_ID.test(selectionInput.id)
      || !["affiliations", "organizations", "entities", "tasks"].includes(selectionInput.collection)) {
      throw new ScenarioKernelAdapterError("KERNEL_WORKSPACE_SELECTION_INVALID", "$.selection", "Workspace selection is invalid.");
    }
    selection = { collection: selectionInput.collection, id: selectionInput.id };
  }
  const projection = projectScenarioKernel(kernel, perspectiveId, surface);
  const navigator: ScenarioKernelWorkspaceProjection["navigator"] = [
    ...projection.affiliations.map((affiliation) => ({
      canonicalRef: { collection: "affiliations" as const, id: affiliation.id },
      parentRef: null,
    })),
    ...projection.organizations.map((organization) => ({
      canonicalRef: { collection: "organizations" as const, id: organization.id },
      parentRef: organization.parentOrganizationId
        ? { collection: "organizations" as const, id: organization.parentOrganizationId }
        : { collection: "affiliations" as const, id: organization.affiliationId },
    })),
    ...projection.entities.map((entity) => ({
      canonicalRef: { collection: "entities" as const, id: entity.id },
      parentRef: entity.organizationId
        ? { collection: "organizations" as const, id: entity.organizationId }
        : { collection: "affiliations" as const, id: entity.affiliationId },
    })),
    ...projection.tasks.map((task) => ({
      canonicalRef: { collection: "tasks" as const, id: task.id },
      parentRef: { collection: "organizations" as const, id: task.ownerOrganizationId },
    })),
  ];
  const visibleSelection = selection && selectionVisible(projection, selection) ? selection : null;
  const selectedCapabilityRefs = visibleSelection?.collection === "entities"
    ? projection.entities.find(({ id }) => id === visibleSelection.id)?.capabilityRefs ?? []
    : visibleSelection?.collection === "tasks"
      ? projection.tasks.find(({ id }) => id === visibleSelection.id)?.capabilityRefs ?? []
      : [];
  const selectedCapabilityKeys = new Set(selectedCapabilityRefs.map(({ id, version }) => `${id}@${version}`));
  const inspectors = (projection.capabilityDescriptors ?? [])
    .filter((descriptor) => selectedCapabilityKeys.has(`${descriptor.id}@${descriptor.version}`))
    .flatMap((descriptor) => descriptor.inspectors.map((inspector) => ({
      capabilityId: descriptor.id,
      capabilityVersion: descriptor.version,
      inspectorId: inspector.id,
      selector: inspector.selector,
    })));
  const material = {
    schemaVersion: SCENARIO_KERNEL_WORKSPACE_SCHEMA_VERSION,
    surface,
    projection,
    navigator,
    selection: !selection
      ? { state: "NONE" as const }
      : visibleSelection
        ? { state: "VISIBLE" as const, canonicalRef: visibleSelection }
        : { state: "REDACTED" as const },
    inspectors,
  };
  return deepFreeze({
    ...material,
    digest: sha256Utf8HexSync(canonicalJson(material)),
  });
}
