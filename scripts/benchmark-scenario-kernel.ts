import { arch, cpus, platform, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import { compileScenarioKernel, type ScenarioKernelInput, type ScenarioKernelSurface } from "../lib/scenario-kernel.ts";
import { projectScenarioKernelWorkspace } from "../lib/scenario-kernel-adapters.ts";
import {
  applyScenarioKernelCommand,
  createScenarioKernelHistory,
  redoScenarioKernelCommand,
  undoScenarioKernelCommand,
} from "../lib/scenario-kernel-history.ts";

const TIERS = [12, 75, 100, 250] as const;
const SURFACES: ScenarioKernelSurface[] = [
  "CONSTRUCT", "OBSERVE", "EXPLAIN", "COMPARE", "REPLAY", "EXPORT",
];
const samples = Number(process.env.VECTOR_SCENARIO_KERNEL_BENCHMARK_RUNS ?? 30);
const maximumP95Ms = Number(process.env.VECTOR_SCENARIO_KERNEL_MAX_P95_MS ?? 100);

if (!Number.isInteger(samples) || samples < 5 || samples > 1_000) {
  throw new Error("VECTOR_SCENARIO_KERNEL_BENCHMARK_RUNS must be an integer from 5 through 1,000.");
}
if (!Number.isFinite(maximumP95Ms) || maximumP95Ms <= 0) {
  throw new Error("VECTOR_SCENARIO_KERNEL_MAX_P95_MS must be a positive finite number.");
}

function densityFixture(entityCount: number): ScenarioKernelInput {
  const affiliationIds = ["aff-alpha", "aff-bravo", "aff-charlie", "aff-neutral", "aff-civil"];
  const groupCount = entityCount === 12 ? 3 : 12;
  const organizations = Array.from({ length: groupCount }, (_, index) => ({
    id: `org-${String(index + 1).padStart(2, "0")}`,
    displayName: `Organization ${index + 1}`,
    kind: "ORGANIZATION" as const,
    affiliationId: affiliationIds[index % affiliationIds.length],
  }));
  const entities = Array.from({ length: entityCount }, (_, index) => ({
    id: `entity-${String(index + 1).padStart(3, "0")}`,
    displayName: `Entity ${index + 1}`,
    domain: (["AIR", "LAND", "MARITIME", "SPACE", "CYBER"] as const)[index % 5],
    kind: index % 7 === 0 ? "INSTALLATION" as const : "PLATFORM" as const,
    affiliationId: organizations[index % groupCount].affiliationId,
    organizationId: organizations[index % groupCount].id,
    capabilityRefs: [],
  }));
  const tasks = organizations.map((organization, index) => ({
    id: `task-${String(index + 1).padStart(2, "0")}`,
    kind: "OBSERVE" as const,
    ownerOrganizationId: organization.id,
    participantEntityIds: entities
      .filter((entity) => entity.organizationId === organization.id)
      .slice(0, 2)
      .map(({ id }) => id),
    objective: { kind: "ENTITY" as const, id: entities[(index + 1) % entities.length].id },
    timing: { notBeforeSeconds: 0, notAfterSeconds: 3_600 },
    dependencyTaskIds: [],
    capabilityRefs: [],
    lifecycle: "AUTHORED" as const,
  }));
  return {
    schemaVersion: "vector.scenario-kernel.v1",
    id: `density-${entityCount}`,
    version: "1.0.0",
    purpose: "Deterministic scenario-kernel capacity evidence",
    provenance: { source: "TEMPLATE", sourceId: `density-${entityCount}` },
    intendedUse: { id: "vector.intended-use.geometry-teaching", version: "1.0.0" },
    affiliations: [
      { id: "aff-alpha", displayName: "Alpha", category: "FORCE" },
      { id: "aff-bravo", displayName: "Bravo", category: "FORCE" },
      { id: "aff-charlie", displayName: "Charlie", category: "FORCE" },
      { id: "aff-neutral", displayName: "Neutral", category: "NEUTRAL" },
      { id: "aff-civil", displayName: "Civil", category: "CIVIL" },
    ],
    relationships: [],
    organizations,
    entities,
    tasks,
    perspectives: [{
      id: "perspective-admin",
      kind: "AUTHORING_ADMIN",
      visibleAffiliationIds: affiliationIds,
      exposeScenarioIdentity: true,
      exposeScenarioPurpose: true,
      capabilityVisibility: "VISIBLE_REFERENCES",
      surfaces: SURFACES,
    }],
  };
}

function percentile(sorted: readonly number[], quantile: number) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
}

const measurements = [];
for (const entityCount of TIERS) {
  const source = densityFixture(entityCount);
  const expectedDigest = compileScenarioKernel(source).digest;
  const bulkPatches = source.entities.map((entity) => ({
    kind: "SET_FIELD",
    collection: "entities",
    id: entity.id,
    field: "displayName",
    value: `${entity.displayName} revised`,
  }));
  const expectedEdited = applyScenarioKernelCommand(createScenarioKernelHistory(source), {
    schemaVersion: "vector.scenario-kernel-command.v1",
    id: "benchmark-bulk-edit",
    baseDigest: expectedDigest,
    kind: "BULK_EDIT",
    patches: bulkPatches,
  }).current.digest;
  const durations: number[] = [];
  for (let run = 0; run < samples + 3; run += 1) {
    const started = performance.now();
    const history = createScenarioKernelHistory(source);
    const edited = applyScenarioKernelCommand(history, {
      schemaVersion: "vector.scenario-kernel-command.v1",
      id: "benchmark-bulk-edit",
      baseDigest: history.current.digest,
      kind: "BULK_EDIT",
      patches: bulkPatches,
    });
    const undone = undoScenarioKernelCommand(edited);
    const redone = redoScenarioKernelCommand(undone);
    for (const surface of SURFACES) {
      projectScenarioKernelWorkspace(redone.current, "perspective-admin", surface, null);
    }
    const duration = performance.now() - started;
    if (history.current.digest !== expectedDigest || undone.current.digest !== expectedDigest
      || edited.current.digest !== expectedEdited || redone.current.digest !== expectedEdited) {
      throw new Error(`Density ${entityCount} compile/history digest drifted.`);
    }
    if (run >= 3) durations.push(duration);
  }
  durations.sort((left, right) => left - right);
  const measurement = {
    entityCount,
    organizationCount: source.organizations.length,
    taskCount: source.tasks.length,
    bulkEditCount: bulkPatches.length,
    samples,
    digest: expectedDigest,
    p50Ms: percentile(durations, 0.50),
    p95Ms: percentile(durations, 0.95),
    p99Ms: percentile(durations, 0.99),
    maxMs: durations.at(-1)!,
  };
  if (measurement.p95Ms > maximumP95Ms) {
    throw new Error(`Density ${entityCount} compile + six-surface projection p95 ${measurement.p95Ms} ms exceeded ${maximumP95Ms} ms.`);
  }
  measurements.push(measurement);
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: "vector.scenario-kernel-performance-evidence.v1",
  measuredAt: new Date().toISOString(),
  environment: {
    runtime: process.version,
    platform: `${platform()} ${release()}`,
    architecture: arch(),
    cpu: cpus()[0]?.model ?? "unknown",
    logicalCores: cpus().length,
    memoryBytes: totalmem(),
  },
  workload: {
    tiers: TIERS,
    surfaces: SURFACES,
    operation: "compile canonical kernel, bulk-edit every entity, undo/redo exact bytes, and project all six workspace surfaces",
  },
  thresholds: { maximumP95Ms },
  measurements,
}, null, 2)}\n`);
