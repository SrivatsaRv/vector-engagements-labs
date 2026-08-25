import assert from "node:assert/strict";
import test from "node:test";
import { scenarioCapabilityRef } from "../lib/scenario-capabilities.ts";
import {
  admitScenarioKernelIntake,
  bindAirMissionToScenarioKernel,
  migrateScenarioKernelInput,
  projectScenarioKernelWorkspace,
  ScenarioKernelAdapterError,
} from "../lib/scenario-kernel-adapters.ts";
import { compileScenarioKernel } from "../lib/scenario-kernel.ts";
import { createDefaultAirMissionDefinition } from "../lib/air-mission.ts";
import { CURRENT_COMPILED_MODEL_PACK } from "../lib/engine/weapon-admission.ts";
import { sha256HexSync } from "../lib/geospatial/digest.ts";
import { createDefaultSpatialPlan } from "../lib/scenario-spatial.ts";
import { DEFAULT_SCENARIO, prepareSimulation } from "../lib/simulation.ts";
import { getStudyArea } from "../lib/study-areas.ts";

function fixture(source = "USER_AUTHORED") {
  return {
    schemaVersion: "vector.scenario-kernel.v1",
    id: "adapter-study",
    version: "1.0.0",
    purpose: "Exercise downstream adapter boundaries",
    provenance: { source, sourceId: "adapter-test" },
    intendedUse: { id: "vector.intended-use.geometry-teaching", version: "1.0.0" },
    affiliations: [{ id: "aff-a", displayName: "Force A", category: "FORCE" }],
    relationships: [],
    organizations: [{
      id: "org-a", displayName: "Organization A", kind: "ORGANIZATION", affiliationId: "aff-a",
    }],
    entities: [{
      id: "entity-a", displayName: "Entity A", domain: "AIR", kind: "PLATFORM",
      affiliationId: "aff-a", organizationId: "org-a",
      capabilityRefs: [structuredClone(scenarioCapabilityRef("capability.route-authoring", "1.0.0"))],
    }],
    tasks: [],
    perspectives: [
      {
        id: "perspective-admin",
        kind: "AUTHORING_ADMIN",
        visibleAffiliationIds: ["aff-a"],
        exposeScenarioIdentity: true,
        exposeScenarioPurpose: true,
        capabilityVisibility: "VISIBLE_REFERENCES",
        surfaces: ["CONSTRUCT", "OBSERVE", "EXPLAIN", "COMPARE", "REPLAY", "EXPORT"],
      },
      {
        id: "perspective-public",
        kind: "REDACTED_PUBLIC",
        visibleAffiliationIds: [],
        exposeScenarioIdentity: false,
        exposeScenarioPurpose: false,
        capabilityVisibility: "NONE",
        surfaces: ["OBSERVE", "EXPLAIN", "COMPARE", "REPLAY", "EXPORT"],
      },
    ],
  };
}

function intake(route, draft) {
  return {
    schemaVersion: "vector.scenario-kernel-intake.v1",
    route,
    sourceDigest: `sha256:${compileScenarioKernel(draft).digest}`,
    draft,
  };
}

test("#154 blank, template and import routes share one exact compiler without hidden defaults", () => {
  for (const [route, source] of [
    ["BLANK", "USER_AUTHORED"],
    ["TEMPLATE", "TEMPLATE"],
    ["IMPORT", "IMPORTED"],
  ]) {
    const draft = fixture(source);
    const history = admitScenarioKernelIntake(intake(route, draft));
    assert.equal(history.current.provenance.source, source);
    assert.equal(history.revision, 0);
  }

  const draft = fixture();
  assert.throws(
    () => admitScenarioKernelIntake({ ...intake("IMPORT", draft), route: "TEMPLATE" }),
    (error) => error instanceof ScenarioKernelAdapterError && error.code === "KERNEL_INTAKE_PROVENANCE_MISMATCH",
  );
  assert.throws(
    () => admitScenarioKernelIntake({ ...intake("BLANK", draft), sourceDigest: `sha256:${"0".repeat(64)}` }),
    (error) => error instanceof ScenarioKernelAdapterError && error.code === "KERNEL_INTAKE_DIGEST_MISMATCH",
  );
});

test("migration is explicit identity-only for the first kernel version and rejects legacy authority", () => {
  const source = fixture();
  const result = migrateScenarioKernelInput(source);
  assert.equal(result.history.current.digest, compileScenarioKernel(source).digest);
  assert.deepEqual(result.appliedMigrations, []);
  assert.throws(
    () => migrateScenarioKernelInput({ schemaVersion: "vector.scenario-draft.v1", blue: {}, red: {} }),
    (error) => error instanceof ScenarioKernelAdapterError && error.code === "KERNEL_INTAKE_MIGRATION_UNAVAILABLE",
  );
});

test("#155 workspace adapter discovers navigation and inspectors only from a redacted projection", () => {
  const kernel = compileScenarioKernel(fixture());
  const admin = projectScenarioKernelWorkspace(
    kernel,
    "perspective-admin",
    "CONSTRUCT",
    { collection: "entities", id: "entity-a" },
  );
  assert.equal(admin.selection.state, "VISIBLE");
  assert.deepEqual(admin.navigator.map(({ canonicalRef }) => canonicalRef.id), ["aff-a", "org-a", "entity-a"]);
  assert.deepEqual(admin.inspectors.map(({ inspectorId }) => inspectorId), ["inspector.route"]);
  assert.equal(Object.hasOwn(admin, "entities"), false, "the adapter must not fork canonical records into a parallel schema");

  const publicView = projectScenarioKernelWorkspace(
    kernel,
    "perspective-public",
    "OBSERVE",
    { collection: "entities", id: "entity-a" },
  );
  assert.deepEqual(publicView.selection, { state: "REDACTED" });
  assert.deepEqual(publicView.navigator, []);
  assert.deepEqual(publicView.inspectors, []);
  assert.equal(JSON.stringify(publicView).includes("entity-a"), false);
  assert.throws(
    () => projectScenarioKernelWorkspace(
      kernel,
      "perspective-admin",
      "OBSERVE",
      { collection: "entities", id: "entity-a", hiddenTruth: "smuggled" },
    ),
    (error) => error instanceof ScenarioKernelAdapterError && error.code === "KERNEL_WORKSPACE_SELECTION_INVALID",
  );
});

test("workspace identity remains canonical under authored insertion permutation", () => {
  const source = fixture();
  const reversed = {
    ...source,
    affiliations: [...source.affiliations].reverse(),
    organizations: [...source.organizations].reverse(),
    entities: [...source.entities].reverse(),
    perspectives: [...source.perspectives].reverse().map((perspective) => ({
      ...perspective,
      surfaces: [...perspective.surfaces].reverse(),
    })),
  };
  const left = projectScenarioKernelWorkspace(
    compileScenarioKernel(source), "perspective-admin", "OBSERVE", null,
  );
  const right = projectScenarioKernelWorkspace(
    compileScenarioKernel(reversed), "perspective-admin", "OBSERVE", null,
  );
  assert.equal(left.digest, right.digest);
  assert.deepEqual(left, right);
});

function airMissionBindingFixture() {
  const scenario = structuredClone(DEFAULT_SCENARIO);
  const area = getStudyArea(scenario.studyAreaId);
  scenario.spatialPlan = createDefaultSpatialPlan({
    studyArea: area,
    rangeM: scenario.range,
    blueAltitudeM: scenario.altitude,
    redAltitudeM: scenario.altitude + scenario.targetDelta,
    blueSpeedMps: scenario.launcherSpeed,
    redSpeedMps: scenario.targetSpeed,
    crossingAngleDeg: scenario.aspect,
  });
  scenario.airMission = createDefaultAirMissionDefinition({
    scenario,
    modelPack: CURRENT_COMPILED_MODEL_PACK,
  });
  const compiledAirMission = prepareSimulation(scenario).engineScenario.airMission;
  const airCapability = structuredClone(scenarioCapabilityRef("capability.air-mission", "1.0.0"));
  const kernelSource = fixture();
  kernelSource.entities = [
    {
      id: "entity-assigned-flight",
      displayName: "Assigned flight",
      domain: "AIR",
      kind: "PLATFORM",
      affiliationId: "aff-a",
      organizationId: "org-a",
      capabilityRefs: [airCapability],
    },
    {
      id: "entity-assigned-contact",
      displayName: "Assigned contact",
      domain: "AIR",
      kind: "PLATFORM",
      affiliationId: "aff-a",
      organizationId: "org-a",
      capabilityRefs: [],
    },
  ];
  kernelSource.tasks = [{
    id: "task-air-mission",
    kind: "AREA",
    ownerOrganizationId: "org-a",
    participantEntityIds: ["entity-assigned-flight"],
    objective: { kind: "ENTITY", id: "entity-assigned-contact" },
    timing: { notBeforeSeconds: 0, notAfterSeconds: 600 },
    dependencyTaskIds: [],
    capabilityRefs: [airCapability],
    lifecycle: "AUTHORED",
  }];
  kernelSource.perspectives[0].visibleAffiliationIds = ["aff-a"];
  const kernel = compileScenarioKernel(kernelSource);
  const mapping = {
    schemaVersion: "vector.scenario-kernel-air-mission-map.v1",
    taskId: "task-air-mission",
    assignments: [{
      assignmentId: scenario.airMission.assignments[0].id,
      entityId: "entity-assigned-flight",
    }],
    targets: [{
      targetId: scenario.airMission.assignedTargetIds[0],
      entityId: "entity-assigned-contact",
    }],
  };
  return { scenario, compiledAirMission, kernel, mapping };
}

test("published-air-mission-owner-binding: #60 artifacts bind by identity without copied mission fields", () => {
  const { scenario, compiledAirMission, kernel, mapping } = airMissionBindingFixture();
  const first = bindAirMissionToScenarioKernel(kernel, scenario.airMission, compiledAirMission, mapping);
  const second = bindAirMissionToScenarioKernel(kernel, scenario.airMission, compiledAirMission, {
    ...mapping,
    assignments: [...mapping.assignments].reverse(),
    targets: [...mapping.targets].reverse(),
  });
  assert.equal(first.schemaVersion, "vector.scenario-kernel-air-mission-binding.v1");
  assert.equal(first.kernel.digest, kernel.digest);
  assert.equal(first.airMission.authoredDigest, compiledAirMission.authoredDigest);
  assert.equal(first.airMission.compiledDigest, compiledAirMission.compiledDigest);
  assert.equal(first.digest, second.digest);
  assert.equal(first.canonicalBytes, second.canonicalBytes);
  assert.equal(Object.hasOwn(first.airMission, "flightPlans"), false);
  assert.equal(Object.hasOwn(first.airMission, "missionClass"), false);
});

test("#60 adapter rejects forged compiled lineage, dangling mappings and absent capability admission", () => {
  const { scenario, compiledAirMission, kernel, mapping } = airMissionBindingFixture();
  const forged = structuredClone(compiledAirMission);
  forged.assignment.loadout[0].quantity += 1;
  assert.throws(
    () => bindAirMissionToScenarioKernel(kernel, scenario.airMission, forged, mapping),
    (error) => error instanceof ScenarioKernelAdapterError
      && error.code === "KERNEL_AIR_MISSION_INVALID"
      && error.path === "$.compiledAirMission.compiledDigest",
  );

  const authorityMission = structuredClone(scenario.airMission);
  const authorityForged = structuredClone(compiledAirMission);
  authorityForged.assignment.groundEnvelope.groundDynamics.authority = "CALLER_ASSERTED";
  const groundMaterial = structuredClone(authorityForged.assignment.groundEnvelope.groundDynamics);
  delete groundMaterial.digest;
  authorityForged.assignment.groundEnvelope.groundDynamics.digest = sha256HexSync(groundMaterial);
  const envelopeMaterial = structuredClone(authorityForged.assignment.groundEnvelope);
  delete envelopeMaterial.digest;
  authorityForged.assignment.groundEnvelope.digest = sha256HexSync(envelopeMaterial);
  authorityMission.assignments[0].groundCompatibility.envelopeDigest =
    authorityForged.assignment.groundEnvelope.digest;
  authorityForged.authored = structuredClone(authorityMission);
  authorityForged.authoredDigest = sha256HexSync(authorityMission);
  delete authorityForged.compiledDigest;
  authorityForged.compiledDigest = sha256HexSync(authorityForged);
  assert.throws(
    () => bindAirMissionToScenarioKernel(kernel, authorityMission, authorityForged, mapping),
    (error) => error instanceof ScenarioKernelAdapterError
      && error.code === "KERNEL_AIR_MISSION_INVALID"
      && error.path === "$.compiledAirMission.assignment.groundEnvelope.groundDynamics",
  );

  const semanticallyForged = structuredClone(compiledAirMission);
  semanticallyForged.start.initialSpeedMps += 10;
  delete semanticallyForged.compiledDigest;
  semanticallyForged.compiledDigest = sha256HexSync(semanticallyForged);
  assert.throws(
    () => bindAirMissionToScenarioKernel(
      kernel,
      scenario.airMission,
      semanticallyForged,
      mapping,
    ),
    (error) => error instanceof ScenarioKernelAdapterError
      && error.code === "KERNEL_AIR_MISSION_INVALID"
      && error.path === "$.compiledAirMission.start",
  );

  const dangling = structuredClone(mapping);
  dangling.assignments[0].entityId = "entity-deleted";
  assert.throws(
    () => bindAirMissionToScenarioKernel(kernel, scenario.airMission, compiledAirMission, dangling),
    (error) => error instanceof ScenarioKernelAdapterError
      && error.code === "KERNEL_AIR_MISSION_REFERENCE_INVALID"
      && error.path === "$.mapping.assignments[0].entityId",
  );

  const sourceWithoutCapability = structuredClone(kernel);
  delete sourceWithoutCapability.capabilityDescriptors;
  delete sourceWithoutCapability.canonicalBytes;
  delete sourceWithoutCapability.digest;
  sourceWithoutCapability.tasks[0].capabilityRefs = [];
  sourceWithoutCapability.entities[0].capabilityRefs = [];
  const kernelWithoutCapability = compileScenarioKernel(sourceWithoutCapability);
  assert.throws(
    () => bindAirMissionToScenarioKernel(
      kernelWithoutCapability,
      scenario.airMission,
      compiledAirMission,
      mapping,
    ),
    (error) => error instanceof ScenarioKernelAdapterError
      && error.code === "KERNEL_AIR_MISSION_CAPABILITY_MISSING"
      && error.path === "$.mapping.taskId",
  );
});
