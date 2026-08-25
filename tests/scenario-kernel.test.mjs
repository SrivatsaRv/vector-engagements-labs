import assert from "node:assert/strict";
import test from "node:test";
import {
  compileScenarioKernel,
  projectScenarioKernel,
  ScenarioKernelValidationError,
} from "../lib/scenario-kernel.ts";

const capabilityRef = (id, version = "1.0.0") => ({ id, version });

function kernelFixture() {
  return {
    schemaVersion: "vector.scenario-kernel.v1",
    id: "joint-study",
    version: "1.0.0",
    purpose: "Compare governed multi-domain composition",
    provenance: {
      source: "USER_AUTHORED",
      sourceId: "analyst-study-1",
    },
    intendedUse: {
      id: "vector.intended-use.public-study",
      version: "1.0.0",
    },
    affiliations: [
      { id: "aff-alpha", displayName: "Alpha", category: "FORCE" },
      { id: "aff-bravo", displayName: "Bravo", category: "FORCE" },
      { id: "aff-charlie", displayName: "Charlie", category: "FORCE" },
      { id: "aff-neutral", displayName: "Neutral", category: "NEUTRAL" },
      { id: "aff-civil", displayName: "Civil", category: "CIVIL" },
    ],
    relationships: [
      {
        id: "rel-alpha-bravo",
        sourceAffiliationId: "aff-alpha",
        targetAffiliationId: "aff-bravo",
        disposition: "HOSTILE",
      },
    ],
    organizations: [
      {
        id: "org-alpha",
        displayName: "Alpha Force",
        kind: "FORCE",
        affiliationId: "aff-alpha",
      },
      {
        id: "org-bravo",
        displayName: "Bravo Force",
        kind: "FORCE",
        affiliationId: "aff-bravo",
      },
      {
        id: "org-charlie",
        displayName: "Charlie Force",
        kind: "FORCE",
        affiliationId: "aff-charlie",
      },
      {
        id: "org-alpha-package",
        displayName: "Alpha Package",
        kind: "PACKAGE",
        affiliationId: "aff-alpha",
        parentOrganizationId: "org-alpha",
      },
      {
        id: "org-civil",
        displayName: "Civil Traffic",
        kind: "ORGANIZATION",
        affiliationId: "aff-civil",
      },
    ],
    entities: [
      {
        id: "entity-air-1",
        displayName: "Air test article",
        domain: "AIR",
        kind: "PLATFORM",
        affiliationId: "aff-alpha",
        organizationId: "org-alpha-package",
        capabilityRefs: [capabilityRef("capability.route-authoring")],
      },
      {
        id: "entity-surface-1",
        displayName: "Surface installation",
        domain: "LAND",
        kind: "INSTALLATION",
        affiliationId: "aff-bravo",
        organizationId: "org-bravo",
        capabilityRefs: [],
      },
      {
        id: "entity-maritime-1",
        displayName: "Maritime test article",
        domain: "MARITIME",
        kind: "PLATFORM",
        affiliationId: "aff-charlie",
        organizationId: "org-charlie",
        capabilityRefs: [capabilityRef("capability.observation-inspector")],
      },
      {
        id: "entity-civil-1",
        displayName: "Civil contact",
        domain: "AIR",
        kind: "PLATFORM",
        affiliationId: "aff-civil",
        organizationId: "org-civil",
        capabilityRefs: [],
      },
    ],
    tasks: [
      {
        id: "task-observe",
        kind: "OBSERVE",
        ownerOrganizationId: "org-charlie",
        participantEntityIds: ["entity-maritime-1"],
        objective: { kind: "ENTITY", id: "entity-surface-1" },
        timing: { notBeforeSeconds: 0, notAfterSeconds: 600 },
        dependencyTaskIds: [],
        capabilityRefs: [capabilityRef("capability.observation-inspector")],
        lifecycle: "AUTHORED",
      },
      {
        id: "task-support",
        kind: "SUPPORT",
        ownerOrganizationId: "org-alpha-package",
        participantEntityIds: ["entity-air-1"],
        objective: { kind: "TASK", id: "task-observe" },
        timing: { notBeforeSeconds: 10, notAfterSeconds: 500 },
        dependencyTaskIds: ["task-observe"],
        capabilityRefs: [capabilityRef("capability.route-authoring")],
        lifecycle: "AUTHORED",
      },
    ],
    capabilityDescriptors: [
      {
        id: "capability.route-authoring",
        version: "1.0.0",
        owner: "MISSION_CONTRACT",
        intendedUseId: "vector.intended-use.public-study",
        admission: {
          state: "AUTHORING_ONLY",
          reasonCode: "RUNTIME_ADAPTER_NOT_ADMITTED",
        },
        runtimeAuthority: "NONE",
        authoredInputs: [
          {
            id: "route.start-position",
            scope: "ENTITY",
            unit: "deg",
            datum: "WGS84",
            required: true,
          },
        ],
        outputs: [
          {
            id: "route.achieved-state",
            source: "RUNTIME",
            availability: "UNAVAILABLE",
            selector: "CAPABILITY_ADMISSION",
          },
        ],
        inspectors: [
          {
            id: "inspector.route",
            localizationKey: "scenario.inspector.route",
            selector: "ENTITY_IDENTITY",
          },
        ],
        dependencies: [],
        invalidation: "DEPENDENTS_ONLY",
        reset: "REMOVE_DEPENDENT_VALUES",
      },
      {
        id: "capability.observation-inspector",
        version: "1.0.0",
        owner: "INFORMATION_CONTRACT",
        intendedUseId: "vector.intended-use.public-study",
        admission: {
          state: "INSPECTION_ONLY",
          reasonCode: "RUNTIME_OBSERVATION_UNAVAILABLE",
        },
        runtimeAuthority: "NONE",
        authoredInputs: [],
        outputs: [
          {
            id: "observation.state",
            source: "RUNTIME",
            availability: "UNAVAILABLE",
            selector: "CAPABILITY_ADMISSION",
          },
        ],
        inspectors: [
          {
            id: "inspector.observation",
            localizationKey: "scenario.inspector.observation",
            selector: "CAPABILITY_ADMISSION",
          },
        ],
        dependencies: [],
        invalidation: "DEPENDENTS_ONLY",
        reset: "REMOVE_DEPENDENT_VALUES",
      },
    ],
    perspectives: [
      {
        id: "perspective-admin",
        kind: "AUTHORING_ADMIN",
        visibleAffiliationIds: [
          "aff-alpha",
          "aff-bravo",
          "aff-charlie",
          "aff-neutral",
          "aff-civil",
        ],
        exposeScenarioPurpose: true,
        exposeCapabilityDescriptors: true,
      },
      {
        id: "perspective-charlie",
        kind: "FORCE_OBSERVED",
        ownerAffiliationId: "aff-charlie",
        visibleAffiliationIds: ["aff-charlie"],
        exposeScenarioPurpose: false,
        exposeCapabilityDescriptors: true,
      },
      {
        id: "perspective-public",
        kind: "REDACTED_PUBLIC",
        visibleAffiliationIds: ["aff-neutral"],
        exposeScenarioPurpose: false,
        exposeCapabilityDescriptors: false,
      },
    ],
  };
}

test("scenario kernel canonicalizes arbitrary force and multi-domain composition without Blue/Red inference", () => {
  const source = kernelFixture();
  const compiled = compileScenarioKernel(source);
  const reversed = compileScenarioKernel({
    ...source,
    affiliations: [...source.affiliations].reverse(),
    relationships: [...source.relationships].reverse(),
    organizations: [...source.organizations].reverse(),
    entities: [...source.entities].reverse(),
    tasks: [...source.tasks].reverse().map((task) => ({
      ...task,
      participantEntityIds: [...task.participantEntityIds].reverse(),
      dependencyTaskIds: [...task.dependencyTaskIds].reverse(),
      capabilityRefs: [...task.capabilityRefs].reverse(),
    })),
    capabilityDescriptors: [...source.capabilityDescriptors].reverse(),
    perspectives: [...source.perspectives].reverse().map((perspective) => ({
      ...perspective,
      visibleAffiliationIds: [...perspective.visibleAffiliationIds].reverse(),
    })),
  });
  assert.equal(compiled.digest, reversed.digest);
  assert.deepEqual(compiled, reversed);
  assert.deepEqual(compiled.entities.map(({ domain }) => domain), ["AIR", "AIR", "MARITIME", "LAND"]);
  assert.equal(compiled.relationships.length, 1, "colour or insertion order must not infer hostility");
  assert.equal(compiled.capabilityDescriptors.every(({ runtimeAuthority }) => runtimeAuthority === "NONE"), true);
});

test("scenario kernel canonical ordering is locale-independent for admitted identifier punctuation", () => {
  const source = kernelFixture();
  source.capabilityDescriptors[0].authoredInputs.push(
    { id: "a_b", scope: "SCENARIO", unit: "1", datum: "NONE", required: false },
    { id: "a:b", scope: "SCENARIO", unit: "1", datum: "NONE", required: false },
    { id: "a-b", scope: "SCENARIO", unit: "1", datum: "NONE", required: false },
  );
  const compiled = compileScenarioKernel(source);
  const descriptor = compiled.capabilityDescriptors.find(({ id }) => id === "capability.route-authoring");
  assert.deepEqual(
    descriptor.authoredInputs.map(({ id }) => id),
    ["a-b", "a:b", "a_b", "route.start-position"],
  );
});

test("scenario kernel rejects exact-key and declarative-descriptor poisoning", () => {
  const cases = [
    ["unknown root key", (value) => { value.renderer = "Three.js"; }, "KERNEL_UNKNOWN_FIELD", "$"],
    ["component name", (value) => { value.capabilityDescriptors[0].componentName = "RoutePanel"; }, "KERNEL_UNKNOWN_FIELD", "$.capabilityDescriptors[0]"],
    ["renderer formula", (value) => { value.capabilityDescriptors[0].outputs[0].formula = "entity.x + entity.y"; }, "KERNEL_UNKNOWN_FIELD", "$.capabilityDescriptors[0].outputs[0]"],
    ["source coefficient", (value) => { value.capabilityDescriptors[0].authoredInputs[0].sourceCoefficient = 1.25; }, "KERNEL_UNKNOWN_FIELD", "$.capabilityDescriptors[0].authoredInputs[0]"],
    ["unknown selector", (value) => { value.capabilityDescriptors[0].inspectors[0].selector = "world.truth.position"; }, "KERNEL_INVALID_ENUM", "$.capabilityDescriptors[0].inspectors[0].selector"],
    ["markup localization", (value) => { value.capabilityDescriptors[0].inspectors[0].localizationKey = "<script>alert(1)</script>"; }, "KERNEL_INVALID_ID", "$.capabilityDescriptors[0].inspectors[0].localizationKey"],
    ["entity-name branch", (value) => { value.capabilityDescriptors[0].inspectors[0].localizationKey = "scenario.inspector.entity-air-1"; }, "KERNEL_DESCRIPTOR_CONTEXT_FORBIDDEN", "$.capabilityDescriptors[0].inspectors[0].localizationKey"],
    ["platform-display branch", (value) => { value.capabilityDescriptors[0].inspectors[0].localizationKey = "scenario.inspector.maritime-test-article"; }, "KERNEL_DESCRIPTOR_CONTEXT_FORBIDDEN", "$.capabilityDescriptors[0].inspectors[0].localizationKey"],
    ["foreign intended use", (value) => { value.capabilityDescriptors[0].intendedUseId = "vector.intended-use.foreign"; }, "KERNEL_INVALID_VALUE", "$.capabilityDescriptors[0].intendedUseId"],
    ["runtime claim", (value) => { value.capabilityDescriptors[0].runtimeAuthority = "ENGINE"; }, "KERNEL_RUNTIME_AUTHORITY_FORBIDDEN", "$.capabilityDescriptors[0].runtimeAuthority"],
    ["available runtime output", (value) => { value.capabilityDescriptors[0].outputs[0].availability = "AVAILABLE"; }, "KERNEL_RUNTIME_AUTHORITY_FORBIDDEN", "$.capabilityDescriptors[0].outputs[0].availability"],
  ];
  for (const [label, mutate, code, path] of cases) {
    const value = kernelFixture();
    mutate(value);
    assert.throws(
      () => compileScenarioKernel(value),
      (error) => error instanceof ScenarioKernelValidationError && error.issues.some((issue) => issue.code === code && issue.path === path),
      label,
    );
  }
});

test("scenario kernel rejects malformed nested values as stable validation issues", () => {
  const cases = [
    (value) => { delete value.purpose; },
    (value) => { value.affiliations[0] = null; },
    (value) => { value.capabilityDescriptors[0].dependencies = [null]; },
    (value) => { value.capabilityDescriptors[0].inspectors = [null]; },
    (value) => { value.entities[0].capabilityRefs = [null]; },
    (value) => { value.tasks[0].participantEntityIds = [null]; },
    (value) => { value.entities = Array(10_001).fill(value.entities[0]); },
    (value) => { value.purpose = "x".repeat(4097); },
  ];
  for (const mutate of cases) {
    const value = kernelFixture();
    mutate(value);
    assert.throws(
      () => compileScenarioKernel(value),
      (error) => error instanceof ScenarioKernelValidationError
        && error.issues.some(({ code }) => ["KERNEL_INVALID_TYPE", "KERNEL_MISSING_FIELD", "KERNEL_INVALID_VALUE"].includes(code)),
    );
  }
});

test("scenario kernel rejects duplicate IDs, graph cycles, dangling references and self-reference with stable paths", () => {
  const cases = [
    ["duplicate", (value) => { value.entities[1].id = value.entities[0].id; }, "KERNEL_DUPLICATE_ID", "$.entities[1].id"],
    ["organization cycle", (value) => { value.organizations[0].parentOrganizationId = "org-alpha-package"; }, "KERNEL_ORGANIZATION_CYCLE", "$.organizations"],
    ["task cycle", (value) => { value.tasks[0].dependencyTaskIds = ["task-support"]; }, "KERNEL_TASK_CYCLE", "$.tasks"],
    ["dangling capability", (value) => { value.entities[0].capabilityRefs = [capabilityRef("capability.missing")]; }, "KERNEL_DANGLING_REFERENCE", "$.entities[0].capabilityRefs[0]"],
    ["relationship self-reference", (value) => { value.relationships[0].targetAffiliationId = "aff-alpha"; }, "KERNEL_SELF_REFERENCE", "$.relationships[0].targetAffiliationId"],
  ];
  for (const [label, mutate, code, path] of cases) {
    const value = kernelFixture();
    mutate(value);
    assert.throws(
      () => compileScenarioKernel(value),
      (error) => error instanceof ScenarioKernelValidationError && error.issues.some((issue) => issue.code === code && issue.path === path),
      label,
    );
  }
});

test("perspective projection redacts before selectors and binds cache identity to perspective", () => {
  const compiled = compileScenarioKernel(kernelFixture());
  const admin = projectScenarioKernel(compiled, "perspective-admin");
  const charlie = projectScenarioKernel(compiled, "perspective-charlie");
  const publicView = projectScenarioKernel(compiled, "perspective-public");

  assert.equal(admin.entities.length, 4);
  assert.deepEqual(charlie.entities.map(({ id }) => id), ["entity-maritime-1"]);
  assert.deepEqual(charlie.organizations.map(({ id }) => id), ["org-charlie"]);
  assert.equal(charlie.purpose, null);
  assert.equal(charlie.tasks.length, 0, "a task with a hidden objective must be removed atomically");
  assert.equal(JSON.stringify(charlie).includes("Surface installation"), false);
  assert.equal(JSON.stringify(charlie).includes("entity-surface-1"), false);
  assert.deepEqual(publicView.affiliations.map(({ id }) => id), ["aff-neutral"]);
  assert.equal(publicView.capabilityDescriptors.length, 0);
  assert.notEqual(admin.digest, charlie.digest);
  assert.notEqual(charlie.digest, publicView.digest);

  const publicEntitySource = kernelFixture();
  publicEntitySource.perspectives.find(({ id }) => id === "perspective-public").visibleAffiliationIds = ["aff-alpha"];
  const publicEntityView = projectScenarioKernel(
    compileScenarioKernel(publicEntitySource),
    "perspective-public",
  );
  assert.deepEqual(publicEntityView.entities.map(({ id }) => id), ["entity-air-1"]);
  assert.deepEqual(publicEntityView.entities[0].capabilityRefs, []);
  assert.equal(JSON.stringify(publicEntityView).includes("capability.route-authoring"), false);

  const stale = structuredClone(compiled);
  stale.perspectives.find(({ id }) => id === "perspective-charlie").visibleAffiliationIds.push("aff-bravo");
  assert.throws(
    () => projectScenarioKernel(stale, "perspective-charlie"),
    (error) => error instanceof ScenarioKernelValidationError
      && error.issues.some(({ code, path }) => code === "KERNEL_DIGEST_MISMATCH" && path === "$.digest"),
  );
});

test("capability admission changes invalidate only projections that consume the descriptor", () => {
  const source = kernelFixture();
  const unused = structuredClone(source.capabilityDescriptors[0]);
  unused.id = "capability.unused-authoring";
  unused.inspectors[0].id = "inspector.unused-authoring";
  unused.inspectors[0].localizationKey = "scenario.inspector.unused-authoring";
  source.capabilityDescriptors.push(unused);

  const baseline = compileScenarioKernel(source);
  const baselineCharlie = projectScenarioKernel(baseline, "perspective-charlie");
  source.capabilityDescriptors[2].admission.reasonCode = "UNUSED_DESCRIPTOR_CHANGED";
  const unrelatedChange = compileScenarioKernel(source);
  assert.notEqual(unrelatedChange.digest, baseline.digest);
  assert.equal(
    projectScenarioKernel(unrelatedChange, "perspective-charlie").digest,
    baselineCharlie.digest,
    "an unreferenced descriptor must not invalidate a restricted projection",
  );

  source.capabilityDescriptors[1].admission.reasonCode = "OBSERVATION_ADMISSION_CHANGED";
  const dependentChange = compileScenarioKernel(source);
  assert.notEqual(
    projectScenarioKernel(dependentChange, "perspective-charlie").digest,
    baselineCharlie.digest,
    "a referenced descriptor must invalidate its projection",
  );
});

test("the same kernel compiles deterministic 12, 75, 100 and 250 entity density tiers", () => {
  for (const count of [12, 75, 100, 250]) {
    const source = kernelFixture();
    const additions = Array.from({ length: count - source.entities.length }, (_, index) => ({
      id: `entity-density-${String(index + 1).padStart(3, "0")}`,
      displayName: `Density entity ${index + 1}`,
      domain: ["AIR", "LAND", "MARITIME"][index % 3],
      kind: index % 4 === 0 ? "INSTALLATION" : "PLATFORM",
      affiliationId: ["aff-alpha", "aff-charlie", "aff-civil"][index % 3],
      organizationId: ["org-alpha", "org-charlie", "org-civil"][index % 3],
      capabilityRefs: [],
    }));
    source.entities.push(...additions);
    const first = compileScenarioKernel(source);
    const repeat = compileScenarioKernel({ ...source, entities: [...source.entities].reverse() });
    assert.equal(first.entities.length, count);
    assert.equal(first.digest, repeat.digest);
  }
});
