import assert from "node:assert/strict";
import test from "node:test";
import { scenarioCapabilityRef } from "../lib/scenario-capabilities.ts";
import {
  applyScenarioKernelCommand,
  createScenarioKernelHistory,
  redoScenarioKernelCommand,
  ScenarioKernelHistoryError,
  undoScenarioKernelCommand,
} from "../lib/scenario-kernel-history.ts";

function fixture() {
  return {
    schemaVersion: "vector.scenario-kernel.v1",
    id: "history-study",
    version: "1.0.0",
    purpose: "Exercise deterministic authoring history",
    provenance: { source: "USER_AUTHORED", sourceId: "history-test" },
    intendedUse: { id: "vector.intended-use.geometry-teaching", version: "1.0.0" },
    affiliations: [{ id: "aff-a", displayName: "Force A", category: "FORCE" }],
    relationships: [],
    organizations: [
      { id: "org-a", displayName: "Organization A", kind: "ORGANIZATION", affiliationId: "aff-a" },
      { id: "org-b", displayName: "Organization B", kind: "ORGANIZATION", affiliationId: "aff-a" },
    ],
    entities: [
      {
        id: "entity-a", displayName: "Entity A", domain: "AIR", kind: "PLATFORM",
        affiliationId: "aff-a", organizationId: "org-a",
        capabilityRefs: [structuredClone(scenarioCapabilityRef("capability.route-authoring", "1.0.0"))],
      },
      {
        id: "entity-b", displayName: "Entity B", domain: "LAND", kind: "PLATFORM",
        affiliationId: "aff-a", organizationId: "org-b", capabilityRefs: [],
      },
    ],
    tasks: [{
      id: "task-a",
      kind: "SUPPORT",
      ownerOrganizationId: "org-a",
      participantEntityIds: ["entity-a", "entity-b"],
      objective: { kind: "ORGANIZATION", id: "org-b" },
      timing: { notBeforeSeconds: 0, notAfterSeconds: 60 },
      dependencyTaskIds: [],
      capabilityRefs: [],
      lifecycle: "AUTHORED",
    }],
    perspectives: [{
      id: "perspective-admin",
      kind: "AUTHORING_ADMIN",
      visibleAffiliationIds: ["aff-a"],
      exposeScenarioIdentity: true,
      exposeScenarioPurpose: true,
      capabilityVisibility: "VISIBLE_REFERENCES",
      surfaces: ["CONSTRUCT", "OBSERVE", "EXPLAIN", "COMPARE", "REPLAY", "EXPORT"],
    }],
  };
}

function mutation(history, id, kind, patches) {
  return applyScenarioKernelCommand(history, {
    schemaVersion: "vector.scenario-kernel-command.v1",
    id,
    baseDigest: history.current.digest,
    kind,
    patches,
  });
}

test("typed authoring commands apply atomically and retain deterministic history", () => {
  let history = createScenarioKernelHistory(fixture());
  history = mutation(history, "add-entity", "ADD", [{
    kind: "ADD_RECORD",
    collection: "entities",
    value: {
      id: "entity-c", displayName: "Entity C", domain: "MARITIME", kind: "PLATFORM",
      affiliationId: "aff-a", organizationId: "org-a", capabilityRefs: [],
    },
  }]);
  history = mutation(history, "move-entity", "MOVE", [{
    kind: "SET_FIELD", collection: "entities", id: "entity-a", field: "organizationId", value: "org-b",
  }]);
  history = mutation(history, "reorder-entities", "REORDER", [{
    kind: "REORDER", collection: "entities", orderedIds: ["entity-c", "entity-b", "entity-a"],
  }]);
  history = mutation(history, "group-entities", "GROUP", [
    {
      kind: "ADD_RECORD",
      collection: "organizations",
      value: {
        id: "org-group", displayName: "Grouped entities", kind: "GROUP",
        affiliationId: "aff-a", parentOrganizationId: "org-a",
      },
    },
    { kind: "SET_FIELD", collection: "entities", id: "entity-c", field: "organizationId", value: "org-group" },
  ]);
  history = mutation(history, "assign-task", "ASSIGN", [{
    kind: "SET_FIELD", collection: "tasks", id: "task-a", field: "participantEntityIds", value: ["entity-c"],
  }]);
  history = mutation(history, "bulk-label", "BULK_EDIT", [
    { kind: "SET_FIELD", collection: "entities", id: "entity-a", field: "displayName", value: "Renamed A" },
    { kind: "SET_FIELD", collection: "entities", id: "entity-b", field: "displayName", value: "Renamed B" },
  ]);

  assert.equal(history.revision, 6);
  assert.equal(history.past.length, 6);
  assert.equal(history.current.entities.find((entity) => entity.id === "entity-c").organizationId, "org-group");
  assert.deepEqual(history.current.tasks[0].participantEntityIds, ["entity-c"]);
  assert.ok(Object.isFrozen(history));
});

test("remove requires explicit reference resolution and failure leaves the prior draft unchanged", () => {
  const initial = createScenarioKernelHistory(fixture());
  const initialBytes = initial.current.canonicalBytes;
  assert.throws(
    () => mutation(initial, "remove-referenced", "REMOVE", [{
      kind: "REMOVE_RECORD", collection: "entities", id: "entity-b",
    }]),
    (error) => error.name === "ScenarioKernelValidationError",
  );
  assert.equal(initial.current.canonicalBytes, initialBytes);
  assert.equal(initial.revision, 0);

  const resolved = mutation(initial, "remove-resolved", "REMOVE", [
    { kind: "SET_FIELD", collection: "tasks", id: "task-a", field: "participantEntityIds", value: ["entity-a"] },
    { kind: "REMOVE_RECORD", collection: "entities", id: "entity-b" },
  ]);
  assert.deepEqual(resolved.current.entities.map(({ id }) => id), ["entity-a"]);
  assert.deepEqual(resolved.current.tasks[0].participantEntityIds, ["entity-a"]);

  const moved = mutation(initial, "move-referenced", "MOVE", [{
    kind: "SET_FIELD", collection: "entities", id: "entity-b", field: "organizationId", value: "org-a",
  }]);
  assert.equal(moved.current.entities.find(({ id }) => id === "entity-b").organizationId, "org-a");
  assert.deepEqual(
    moved.current.tasks[0].participantEntityIds,
    ["entity-a", "entity-b"],
    "moving a referenced entity preserves its stable identity and never silently retargets the task",
  );
});

test("undo and redo restore the exact canonical authored state and clear redo on a new command", () => {
  const initial = createScenarioKernelHistory(fixture());
  const changed = mutation(initial, "rename", "MOVE", [{
    kind: "SET_FIELD", collection: "entities", id: "entity-a", field: "organizationId", value: "org-b",
  }]);
  const undone = undoScenarioKernelCommand(changed);
  assert.equal(undone.current.digest, initial.current.digest);
  assert.equal(undone.current.canonicalBytes, initial.current.canonicalBytes);
  const redone = redoScenarioKernelCommand(undone);
  assert.equal(redone.current.digest, changed.current.digest);
  assert.equal(redone.current.canonicalBytes, changed.current.canonicalBytes);

  const forked = mutation(undone, "rename-fork", "MOVE", [{
    kind: "SET_FIELD", collection: "entities", id: "entity-a", field: "organizationId", value: null,
  }]);
  assert.deepEqual(forked.future, []);
  assert.throws(() => redoScenarioKernelCommand(forked), ScenarioKernelHistoryError);
});

test("undo and redo span bulk edits, capability dependency resets and imports with identical bytes", () => {
  const initial = createScenarioKernelHistory(fixture());
  const bulk = mutation(initial, "bulk-labels", "BULK_EDIT", [
    { kind: "SET_FIELD", collection: "entities", id: "entity-a", field: "displayName", value: "Bulk A" },
    { kind: "SET_FIELD", collection: "entities", id: "entity-b", field: "displayName", value: "Bulk B" },
  ]);
  const reset = mutation(bulk, "reset-capability", "ASSIGN", [{
    kind: "SET_FIELD", collection: "entities", id: "entity-a", field: "capabilityRefs", value: [],
  }]);
  const replacement = { ...fixture(), id: "replacement-study", provenance: { source: "IMPORTED", sourceId: "import-2" } };
  const imported = applyScenarioKernelCommand(reset, {
    schemaVersion: "vector.scenario-kernel-command.v1",
    id: "import-replacement",
    baseDigest: reset.current.digest,
    kind: "IMPORT",
    sourceDigest: `sha256:${createScenarioKernelHistory(replacement).current.digest}`,
    replacement,
  });

  const undoImport = undoScenarioKernelCommand(imported);
  assert.equal(undoImport.current.canonicalBytes, reset.current.canonicalBytes);
  const undoReset = undoScenarioKernelCommand(undoImport);
  assert.equal(undoReset.current.canonicalBytes, bulk.current.canonicalBytes);
  const undoBulk = undoScenarioKernelCommand(undoReset);
  assert.equal(undoBulk.current.canonicalBytes, initial.current.canonicalBytes);
  const redone = redoScenarioKernelCommand(redoScenarioKernelCommand(redoScenarioKernelCommand(undoBulk)));
  assert.equal(redone.current.canonicalBytes, imported.current.canonicalBytes);
  assert.equal(redone.current.digest, imported.current.digest);
});

test("import and template replacement are content-addressed and stale commands are rejected", () => {
  const initial = createScenarioKernelHistory(fixture());
  const replacement = { ...fixture(), id: "imported-study", provenance: { source: "IMPORTED", sourceId: "source-a" } };
  const sourceDigest = `sha256:${createScenarioKernelHistory(replacement).current.digest}`;
  const imported = applyScenarioKernelCommand(initial, {
    schemaVersion: "vector.scenario-kernel-command.v1",
    id: "import-study",
    baseDigest: initial.current.digest,
    kind: "IMPORT",
    sourceDigest,
    replacement,
  });
  assert.equal(imported.current.id, "imported-study");
  assert.equal(imported.past[0].command.sourceDigest, sourceDigest);

  const templateReplacement = {
    ...fixture(),
    id: "template-study",
    provenance: { source: "TEMPLATE", sourceId: "template-a" },
  };
  const templated = applyScenarioKernelCommand(initial, {
    schemaVersion: "vector.scenario-kernel-command.v1",
    id: "apply-template",
    baseDigest: initial.current.digest,
    kind: "TEMPLATE_APPLY",
    sourceDigest: `sha256:${createScenarioKernelHistory(templateReplacement).current.digest}`,
    replacement: templateReplacement,
  });
  assert.equal(templated.current.provenance.source, "TEMPLATE");

  assert.throws(
    () => applyScenarioKernelCommand(imported, {
      schemaVersion: "vector.scenario-kernel-command.v1",
      id: "stale-template",
      baseDigest: initial.current.digest,
      kind: "IMPORT",
      sourceDigest,
      replacement,
    }),
    (error) => error instanceof ScenarioKernelHistoryError && error.code === "KERNEL_COMMAND_STALE_DRAFT",
  );
  assert.throws(
    () => applyScenarioKernelCommand(initial, {
      schemaVersion: "vector.scenario-kernel-command.v1",
      id: "bad-import",
      baseDigest: initial.current.digest,
      kind: "IMPORT",
      sourceDigest: `sha256:${"0".repeat(64)}`,
      replacement,
    }),
    (error) => error instanceof ScenarioKernelHistoryError && error.code === "KERNEL_COMMAND_INVALID",
  );
});

test("command grammar rejects category smuggling", () => {
  const initial = createScenarioKernelHistory(fixture());
  assert.throws(
    () => mutation(initial, "fake-move", "MOVE", [{
      kind: "SET_FIELD", collection: "entities", id: "entity-a", field: "displayName", value: "No",
    }]),
    (error) => error instanceof ScenarioKernelHistoryError && error.code === "KERNEL_COMMAND_INVALID",
  );
  assert.throws(
    () => mutation(initial, "fake-reorder", "REORDER", [{
      kind: "SET_FIELD", collection: "entities", id: "entity-a", field: "displayName", value: "No",
    }]),
    (error) => error instanceof ScenarioKernelHistoryError && error.code === "KERNEL_COMMAND_INVALID",
  );
  assert.throws(
    () => mutation(initial, "fake-bulk", "BULK_EDIT", [{
      kind: "SET_FIELD", collection: "entities", id: "entity-a", field: "displayName", value: "No",
    }]),
    (error) => error instanceof ScenarioKernelHistoryError && error.code === "KERNEL_COMMAND_INVALID",
  );
  assert.throws(
    () => mutation(initial, "duplicate-assignment", "BULK_EDIT", [
      { kind: "SET_FIELD", collection: "entities", id: "entity-a", field: "displayName", value: "First" },
      { kind: "SET_FIELD", collection: "entities", id: "entity-a", field: "displayName", value: "Second" },
    ]),
    (error) => error instanceof ScenarioKernelHistoryError && error.code === "KERNEL_COMMAND_CONFLICT",
  );

  const applied = mutation(initial, "unique-command", "MOVE", [{
    kind: "SET_FIELD", collection: "entities", id: "entity-a", field: "organizationId", value: "org-b",
  }]);
  assert.throws(
    () => mutation(applied, "unique-command", "MOVE", [{
      kind: "SET_FIELD", collection: "entities", id: "entity-a", field: "organizationId", value: "org-a",
    }]),
    (error) => error instanceof ScenarioKernelHistoryError && error.code === "KERNEL_COMMAND_CONFLICT",
  );

  const saturated = { ...initial, past: Array(1_000).fill({ command: { id: "prior" } }) };
  assert.throws(
    () => mutation(saturated, "over-history-bound", "MOVE", [{
      kind: "SET_FIELD", collection: "entities", id: "entity-a", field: "organizationId", value: "org-b",
    }]),
    (error) => error instanceof ScenarioKernelHistoryError && error.code === "KERNEL_HISTORY_LIMIT_EXCEEDED",
  );
});
