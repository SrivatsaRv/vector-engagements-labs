import assert from "node:assert/strict";
import test from "node:test";
import {
  compileScenarioKernel,
  projectScenarioKernel,
  ScenarioKernelValidationError,
} from "../lib/scenario-kernel.ts";
import { scenarioCapabilityRef } from "../lib/scenario-capabilities.ts";

const capabilityRef = (id, version = "1.0.0") => structuredClone(scenarioCapabilityRef(id, version));

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
      id: "vector.intended-use.geometry-teaching",
      version: "1.0.0",
    },
    affiliations: [
      { id: "aff-alpha", displayName: "Alpha", category: "FORCE" },
      { id: "aff-bravo", displayName: "Bravo", category: "FORCE" },
      { id: "aff-charlie", displayName: "Charlie", category: "FORCE" },
      { id: "aff-neutral", displayName: "Neutral", category: "NEUTRAL" },
      { id: "aff-civil", displayName: "Civil", category: "CIVIL" },
      { id: "aff-unknown", displayName: "Unknown affiliation", category: "UNKNOWN" },
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
      {
        id: "entity-neutral-1",
        displayName: "Neutral observer",
        domain: "OTHER",
        kind: "LOGICAL_GROUP",
        affiliationId: "aff-neutral",
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
          "aff-unknown",
        ],
        exposeScenarioIdentity: true,
        exposeScenarioPurpose: true,
        capabilityVisibility: "VISIBLE_REFERENCES",
        surfaces: ["CONSTRUCT", "OBSERVE", "EXPLAIN", "COMPARE", "REPLAY", "EXPORT"],
      },
      {
        id: "perspective-charlie",
        kind: "FORCE_OBSERVED",
        ownerAffiliationId: "aff-charlie",
        visibleAffiliationIds: ["aff-charlie"],
        exposeScenarioIdentity: false,
        exposeScenarioPurpose: false,
        capabilityVisibility: "VISIBLE_REFERENCES",
        surfaces: ["OBSERVE", "EXPLAIN", "COMPARE", "REPLAY", "EXPORT"],
      },
      {
        id: "perspective-public",
        kind: "REDACTED_PUBLIC",
        visibleAffiliationIds: ["aff-neutral"],
        exposeScenarioIdentity: false,
        exposeScenarioPurpose: false,
        capabilityVisibility: "NONE",
        surfaces: ["OBSERVE", "EXPLAIN", "COMPARE", "REPLAY", "EXPORT"],
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
    perspectives: [...source.perspectives].reverse().map((perspective) => ({
      ...perspective,
      visibleAffiliationIds: [...perspective.visibleAffiliationIds].reverse(),
    })),
  });
  assert.equal(compiled.digest, reversed.digest);
  assert.deepEqual(compiled, reversed);
  assert.deepEqual(compiled.entities.map(({ domain }) => domain), ["AIR", "AIR", "MARITIME", "OTHER", "LAND"]);
  assert.equal(compiled.relationships.length, 1, "colour or insertion order must not infer hostility");
  assert.equal(compiled.entities.flatMap(({ capabilityRefs }) => capabilityRefs)
    .every(({ descriptorDigest }) => /^sha256:[0-9a-f]{64}$/.test(descriptorDigest)), true);
});

test("scenario kernel canonical ordering is locale-independent for admitted identifier punctuation", () => {
  const source = kernelFixture();
  source.organizations.push(
    { id: "a_b", displayName: "A underscore", kind: "GROUP", affiliationId: "aff-alpha" },
    { id: "a:b", displayName: "A colon", kind: "GROUP", affiliationId: "aff-alpha" },
    { id: "a-b", displayName: "A dash", kind: "GROUP", affiliationId: "aff-alpha" },
  );
  const compiled = compileScenarioKernel(source);
  assert.deepEqual(
    compiled.organizations.map(({ id }) => id).filter((id) => id.startsWith("a")),
    ["a-b", "a:b", "a_b"],
  );
});

test("scenario kernel rejects scenario-authored descriptor authority and malformed content-addressed references", () => {
  const cases = [
    ["unknown root key", (value) => { value.renderer = "Three.js"; }, "KERNEL_UNKNOWN_FIELD", "$"],
    ["hostility by display colour", (value) => { value.affiliations[0].color = "red"; }, "KERNEL_UNKNOWN_FIELD", "$.affiliations[0]"],
    ["descriptor collection", (value) => { value.capabilityDescriptors = []; }, "KERNEL_UNKNOWN_FIELD", "$"],
    ["selector", (value) => { value.entities[0].capabilityRefs[0].selector = "world.truth.position"; }, "KERNEL_UNKNOWN_FIELD", "$.entities[0].capabilityRefs[0]"],
    ["runtime claim", (value) => { value.entities[0].capabilityRefs[0].runtimeAuthority = "ENGINE"; }, "KERNEL_UNKNOWN_FIELD", "$.entities[0].capabilityRefs[0]"],
    ["malformed digest", (value) => { value.entities[0].capabilityRefs[0].descriptorDigest = "sha256:1234"; }, "KERNEL_INVALID_VALUE", "$.entities[0].capabilityRefs[0].descriptorDigest"],
    ["foreign intended use", (value) => { value.entities[0].capabilityRefs[0].intendedUse.id = "vector.intended-use.foreign"; }, "KERNEL_INVALID_VALUE", "$.entities[0].capabilityRefs[0].intendedUse"],
    ["foreign intended-use version", (value) => { value.entities[0].capabilityRefs[0].intendedUse.version = "2.0.0"; }, "KERNEL_INVALID_VALUE", "$.entities[0].capabilityRefs[0].intendedUse"],
    ["owner executable field", (value) => { value.entities[0].capabilityRefs[0].ownerContract.formula = "entity.x"; }, "KERNEL_UNKNOWN_FIELD", "$.entities[0].capabilityRefs[0].ownerContract"],
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
    (value) => { value.entities[0].capabilityRefs = [null]; },
    (value) => { value.tasks[0].participantEntityIds = [null]; },
    (value) => { value.entities = Array(10_001).fill(value.entities[0]); },
    (value) => { value.purpose = "x".repeat(4097); },
    (value) => { value.perspectives = []; },
  ];
  for (const mutate of cases) {
    const value = kernelFixture();
    mutate(value);
    assert.throws(
      () => compileScenarioKernel(value),
      (error) => error instanceof ScenarioKernelValidationError
        && error.issues.some(({ code }) => [
          "KERNEL_INVALID_TYPE",
          "KERNEL_MISSING_FIELD",
          "KERNEL_INVALID_VALUE",
          "KERNEL_PERSPECTIVE_POLICY_INVALID",
        ].includes(code)),
    );
  }
});

test("scenario kernel rejects duplicate IDs, graph cycles, dangling references and self-reference with stable paths", () => {
  const cases = [
    ["duplicate", (value) => { value.entities[1].id = value.entities[0].id; }, "KERNEL_DUPLICATE_ID", "$.entities[1].id"],
    ["organization cycle", (value) => { value.organizations[0].parentOrganizationId = "org-alpha-package"; }, "KERNEL_ORGANIZATION_CYCLE", "$.organizations"],
    ["task cycle", (value) => { value.tasks[0].dependencyTaskIds = ["task-support"]; }, "KERNEL_TASK_CYCLE", "$.tasks"],
    ["malformed capability", (value) => { value.entities[0].capabilityRefs[0].descriptorDigest = "missing"; }, "KERNEL_INVALID_VALUE", "$.entities[0].capabilityRefs[0].descriptorDigest"],
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
  const admin = projectScenarioKernel(compiled, "perspective-admin", "OBSERVE");
  const charlie = projectScenarioKernel(compiled, "perspective-charlie", "OBSERVE");
  const publicView = projectScenarioKernel(compiled, "perspective-public", "OBSERVE");

  assert.equal(admin.entities.length, 5);
  assert.deepEqual(charlie.entities.map(({ id }) => id), ["entity-maritime-1"]);
  assert.deepEqual(charlie.organizations.map(({ id }) => id), ["org-charlie"]);
  assert.equal(charlie.purpose, null);
  assert.equal(charlie.tasks.length, 0, "a task with a hidden objective must be removed atomically");
  assert.equal(JSON.stringify(charlie).includes("Surface installation"), false);
  assert.equal(JSON.stringify(charlie).includes("entity-surface-1"), false);
  assert.deepEqual(publicView.affiliations.map(({ id }) => id), ["aff-neutral"]);
  assert.deepEqual(publicView.entities.map(({ id }) => id), ["entity-neutral-1"]);
  assert.equal(Object.hasOwn(publicView, "capabilityDescriptors"), false);
  assert.notEqual(admin.digest, charlie.digest);
  assert.notEqual(charlie.digest, publicView.digest);

  const publicEntitySource = kernelFixture();
  publicEntitySource.perspectives.find(({ id }) => id === "perspective-public").visibleAffiliationIds = ["aff-alpha"];
  const publicEntityView = projectScenarioKernel(
    compileScenarioKernel(publicEntitySource),
    "perspective-public",
    "OBSERVE",
  );
  assert.deepEqual(publicEntityView.entities.map(({ id }) => id), ["entity-air-1"]);
  assert.deepEqual(publicEntityView.entities[0].capabilityRefs, []);
  assert.equal(JSON.stringify(publicEntityView).includes("capability.route-authoring"), false);

  const stale = structuredClone(compiled);
  stale.perspectives.find(({ id }) => id === "perspective-charlie").visibleAffiliationIds.push("aff-bravo");
  assert.throws(
    () => projectScenarioKernel(stale, "perspective-charlie", "OBSERVE"),
    (error) => error instanceof ScenarioKernelValidationError
      && error.issues.some(({ code, path }) => code === "KERNEL_DIGEST_MISMATCH" && path === "$.digest"),
  );
});

test("the projection contract covers all six named product surfaces and enforces perspective authorization", () => {
  const compiled = compileScenarioKernel(kernelFixture());
  const surfaces = ["CONSTRUCT", "OBSERVE", "EXPLAIN", "COMPARE", "REPLAY", "EXPORT"];
  for (const surface of surfaces) {
    const projection = projectScenarioKernel(compiled, "perspective-admin", surface);
    assert.equal(projection.surface, surface);
    assert.notEqual(projection.digest, "");
  }
  for (const surface of surfaces.slice(1)) {
    const publicProjection = projectScenarioKernel(compiled, "perspective-public", surface);
    const serialized = JSON.stringify(publicProjection);
    assert.equal(publicProjection.scenario, null);
    assert.equal(Object.hasOwn(publicProjection, "capabilityDescriptors"), false);
    assert.equal(serialized.includes("entity-air-1"), false, `${surface} must consume the redacted projection`);
    assert.equal(serialized.includes("task-observe"), false, `${surface} must not reconstruct hidden task truth`);
  }
  assert.throws(
    () => projectScenarioKernel(compiled, "perspective-public", "CONSTRUCT"),
    (error) => error instanceof ScenarioKernelValidationError
      && error.issues.some(({ code, path }) => code === "KERNEL_PERSPECTIVE_POLICY_INVALID" && path === "$.surface"),
  );
});

test("capability-reference changes invalidate consuming projections without leaking through public projections", () => {
  const source = kernelFixture();
  source.perspectives.find(({ id }) => id === "perspective-public").visibleAffiliationIds = ["aff-charlie"];
  const baseline = compileScenarioKernel(source);
  const baselinePublic = projectScenarioKernel(baseline, "perspective-public", "OBSERVE");
  const baselineAdmin = projectScenarioKernel(baseline, "perspective-admin", "OBSERVE");
  source.entities.find(({ id }) => id === "entity-maritime-1").capabilityRefs[0] =
    capabilityRef("capability.route-authoring");
  const changed = compileScenarioKernel(source);
  assert.notEqual(changed.digest, baseline.digest);
  assert.equal(
    projectScenarioKernel(changed, "perspective-public", "OBSERVE").digest,
    baselinePublic.digest,
    "public projections must not expose capability-reference changes",
  );
  assert.notEqual(
    projectScenarioKernel(changed, "perspective-admin", "OBSERVE").digest,
    baselineAdmin.digest,
    "admin projections consume governed capability references",
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

test("the documented 10,000-node organization bound is iterative and returns stable cycle issues", () => {
  const source = kernelFixture();
  source.organizations = Array.from({ length: 10_000 }, (_, index) => ({
    id: `org-bound-${String(index).padStart(5, "0")}`,
    displayName: `Bounded organization ${index}`,
    kind: "ORGANIZATION",
    affiliationId: "aff-alpha",
    ...(index === 0 ? {} : { parentOrganizationId: `org-bound-${String(index - 1).padStart(5, "0")}` }),
  }));
  source.entities = [];
  source.tasks = [];
  assert.doesNotThrow(() => compileScenarioKernel(source));

  source.organizations[0].parentOrganizationId = "org-bound-09999";
  assert.throws(
    () => compileScenarioKernel(source),
    (error) => error instanceof ScenarioKernelValidationError
      && error.issues.some(({ code, path }) => code === "KERNEL_ORGANIZATION_CYCLE" && path === "$.organizations"),
  );
});

test("task objective references participate in task-cycle admission", () => {
  const source = kernelFixture();
  source.tasks[0].objective = { kind: "TASK", id: "task-support" };
  source.tasks[1].objective = { kind: "TASK", id: "task-observe" };
  source.tasks[1].dependencyTaskIds = [];
  assert.throws(
    () => compileScenarioKernel(source),
    (error) => error instanceof ScenarioKernelValidationError
      && error.issues.some(({ code, path }) => code === "KERNEL_TASK_CYCLE" && path === "$.tasks"),
  );
});

test("task dependency traversal rejects more than 10,000 admitted edges with a stable bound error", () => {
  const source = kernelFixture();
  source.entities = [];
  source.tasks = Array.from({ length: 143 }, (_, index) => ({
    id: `task-bound-${String(index).padStart(3, "0")}`,
    kind: "SUPPORT",
    ownerOrganizationId: "org-alpha",
    participantEntityIds: [],
    objective: { kind: "ORGANIZATION", id: "org-alpha" },
    timing: { notBeforeSeconds: 0, notAfterSeconds: 1 },
    dependencyTaskIds: Array.from(
      { length: index },
      (_, dependencyIndex) => `task-bound-${String(dependencyIndex).padStart(3, "0")}`,
    ),
    capabilityRefs: [],
    lifecycle: "AUTHORED",
  }));
  assert.throws(
    () => compileScenarioKernel(source),
    (error) => error instanceof ScenarioKernelValidationError
      && error.issues.some(({ code, path }) => code === "KERNEL_GRAPH_LIMIT_EXCEEDED" && path === "$.tasks"),
  );
});

test("a scenario cannot self-admit a capability descriptor", () => {
  const source = kernelFixture();
  source.capabilityDescriptors = [{
    id: "capability.route-authoring",
    runtimeAuthority: "ENGINE",
  }];
  assert.throws(
    () => compileScenarioKernel(source),
    (error) => error instanceof ScenarioKernelValidationError
      && error.issues.some(({ code, path }) => code === "KERNEL_UNKNOWN_FIELD" && path === "$"),
  );
});

test("a redacted projection does not expose scenario identity or capability metadata", () => {
  const source = kernelFixture();
  source.perspectives.find(({ id }) => id === "perspective-public").visibleAffiliationIds = ["aff-alpha"];
  const projection = projectScenarioKernel(compileScenarioKernel(source), "perspective-public", "OBSERVE");
  const serialized = JSON.stringify(projection);
  assert.equal(serialized.includes("joint-study"), false);
  assert.equal(serialized.includes("capability.route-authoring"), false);
  assert.equal(serialized.includes("capabilityDescriptors"), false);
  for (const hidden of ["aff-bravo", "aff-charlie", "aff-neutral", "aff-civil", "aff-unknown", "Surface installation", "Maritime test article", "Civil contact", "Neutral observer"]) {
    assert.equal(serialized.includes(hidden), false, `${hidden} must not cross the projection boundary`);
  }
});

test("canonical serialized bytes are invariant to object-key and collection insertion order", () => {
  const reverseKeys = (value) => {
    if (Array.isArray(value)) return value.map(reverseKeys);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).reverse().map(([key, nested]) => [key, reverseKeys(nested)]));
  };
  const source = kernelFixture();
  source.entities[0].capabilityRefs.push(capabilityRef("capability.observation-inspector"));
  source.tasks[1].capabilityRefs.push(capabilityRef("capability.observation-inspector"));
  const first = compileScenarioKernel(source);
  const permuted = reverseKeys({
    ...source,
    affiliations: [...source.affiliations].reverse(),
    relationships: [...source.relationships].reverse(),
    organizations: [...source.organizations].reverse(),
    entities: [...source.entities].reverse().map((entity) => ({
      ...entity,
      capabilityRefs: [...entity.capabilityRefs].reverse(),
    })),
    tasks: [...source.tasks].reverse().map((task) => ({
      ...task,
      participantEntityIds: [...task.participantEntityIds].reverse(),
      dependencyTaskIds: [...task.dependencyTaskIds].reverse(),
      capabilityRefs: [...task.capabilityRefs].reverse(),
    })),
    perspectives: [...source.perspectives].reverse().map((perspective) => ({
      ...perspective,
      visibleAffiliationIds: [...perspective.visibleAffiliationIds].reverse(),
      surfaces: [...perspective.surfaces].reverse(),
    })),
  });
  const second = compileScenarioKernel(permuted);
  assert.equal(typeof first.canonicalBytes, "string");
  assert.equal(first.canonicalBytes, second.canonicalBytes);
});
