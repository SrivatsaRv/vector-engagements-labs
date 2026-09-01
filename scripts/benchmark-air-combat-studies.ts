import { arch, cpus, platform, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import { buildReportExport, type ReportLibraryScenario } from "../lib/report-export.ts";
import { buildAuthoredProfileBinding } from "../lib/report-profile.ts";
import { selectCanonicalTargetEffect, selectDisplayFrame } from "../lib/frontend/selectors.ts";
import {
  createVectorSimulationRecord,
  openVectorSimulationRecord,
  serializeVectorRecord,
} from "../lib/record/vector-record.ts";
import { retainedScenarioPackageReference } from "../lib/scenario-package-reference.ts";
import {
  CURRENT_AIR_COMBAT_STUDY_IDS,
  SCENARIO_LIBRARY,
  type ScenarioDefinition,
} from "../lib/scenarios.ts";
import {
  prepareSimulation,
  simulateWithCapabilitiesForVerification,
} from "../lib/simulation.ts";
import type { EngineBackendId } from "../lib/engine/contracts.ts";
import { createVerificationDeploymentCapabilities } from "../lib/runtime/deployment-capabilities.ts";

const measuredRounds = Number(process.env.VECTOR_AIR_COMBAT_BENCHMARK_ROUNDS ?? 7);
const maximumEngineP95Ms = Number(process.env.VECTOR_AIR_COMBAT_ENGINE_P95_MS ?? 150);
const maximumRecordP95Ms = Number(process.env.VECTOR_AIR_COMBAT_RECORD_P95_MS ?? 250);
const maximumOpenP95Ms = Number(process.env.VECTOR_AIR_COMBAT_OPEN_P95_MS ?? 250);
const maximumReportP95Ms = Number(process.env.VECTOR_AIR_COMBAT_REPORT_P95_MS ?? 50);
const maximumRecordBytes = Number(process.env.VECTOR_AIR_COMBAT_RECORD_BYTES ?? 8 * 1024 * 1024);
const maximumReportBytes = Number(process.env.VECTOR_AIR_COMBAT_REPORT_BYTES ?? 512 * 1024);

if (!Number.isInteger(measuredRounds) || measuredRounds < 3 || measuredRounds > 50) {
  throw new Error("VECTOR_AIR_COMBAT_BENCHMARK_ROUNDS must be an integer in [3, 50].");
}

const definitions = CURRENT_AIR_COMBAT_STUDY_IDS.map((id) => {
  const definition = SCENARIO_LIBRARY.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Missing governed Air-combat study ${id}.`);
  return definition;
});

const expectedOutcomes = new Map<string, string>([
  ["a2a-crossing-intercept", "KILL"],
  ["a2a-defensive-break", "KILL"],
  ["a2a-high-energy-crossing-challenge", "NO_EFFECT"],
]);

const libraryProjection = (definition: ScenarioDefinition): ReportLibraryScenario => ({
  id: definition.id,
  version: definition.version,
  domain: definition.domain,
  title: definition.title,
  scope: definition.scope,
  targetProfile: definition.targetProfile,
  theatre: definition.theatre,
  ...(definition.authoredProfile
    ? {
        authoredProfile: definition.authoredProfile,
        authoredProfileBinding: buildAuthoredProfileBinding(definition, definition.scenario),
      }
    : {}),
});

type Sample = {
  backend: EngineBackendId;
  scenarioId: string;
  engineMs: number;
  recordMs: number;
  openMs: number;
  reportMs: number;
  recordBytes: number;
  reportBytes: number;
  frames: number;
};

const samples: Sample[] = [];
for (const backend of ["typescript", "rust-wasm"] as const) {
  const capabilities = createVerificationDeploymentCapabilities(backend, ["A2A"]);
  for (const definition of definitions) {
    simulateWithCapabilitiesForVerification(definition.scenario, capabilities);
  }
  for (let round = 0; round < measuredRounds; round += 1) {
    for (const definition of definitions) {
      const engineStarted = performance.now();
      const result = simulateWithCapabilitiesForVerification(definition.scenario, capabilities);
      const engineMs = performance.now() - engineStarted;
      const effectClass = selectCanonicalTargetEffect(
        result,
        selectDisplayFrame(result, result.timeOfFlight),
      ).presentation.effectClass;
      if (effectClass !== expectedOutcomes.get(definition.id)) {
        throw new Error(`${definition.id} produced unexpected ${effectClass} target effect.`);
      }

      const prepared = {
        ...prepareSimulation(definition.scenario, definition.scenario.profile, capabilities),
        packageReference: retainedScenarioPackageReference(definition),
      };
      const recordStarted = performance.now();
      const record = await createVectorSimulationRecord(
        prepared,
        result,
        "2026-08-31T00:00:00.000Z",
      );
      const serialized = serializeVectorRecord(record);
      const recordMs = performance.now() - recordStarted;

      const openStarted = performance.now();
      const opened = await openVectorSimulationRecord(serialized.buffer, serialized.byteLength);
      const openMs = performance.now() - openStarted;
      if (
        opened.manifest.scenarioPackage?.id !== definition.id ||
        opened.manifest.scenarioPackage?.version !== definition.version
      ) {
        throw new Error(`${definition.id} reopened with different package identity.`);
      }

      const reportStarted = performance.now();
      const report = buildReportExport(
        {
          scenario: definition.scenario,
          result,
          events: [],
          createdAt: "2026-08-31T00:00:00.000Z",
          engine: backend,
          profileVersion: definition.version,
        },
        libraryProjection(definition),
        "last-saved",
      );
      const reportBytes = Buffer.byteLength(JSON.stringify(report));
      const reportMs = performance.now() - reportStarted;
      samples.push({
        backend,
        scenarioId: definition.id,
        engineMs,
        recordMs,
        openMs,
        reportMs,
        recordBytes: serialized.byteLength,
        reportBytes,
        frames: result.frames.length,
      });
    }
  }
}

const percentile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
};

const summary = ([backend, scenarioId]: [EngineBackendId, string]) => {
  const selected = samples.filter(
    (sample) => sample.backend === backend && sample.scenarioId === scenarioId,
  );
  const metric = (key: "engineMs" | "recordMs" | "openMs" | "reportMs") => ({
    p50Ms: Number(percentile(selected.map((sample) => sample[key]), 0.5).toFixed(3)),
    p95Ms: Number(percentile(selected.map((sample) => sample[key]), 0.95).toFixed(3)),
    maximumMs: Number(Math.max(...selected.map((sample) => sample[key])).toFixed(3)),
  });
  return {
    backend,
    scenarioId,
    measuredRuns: selected.length,
    frames: selected[0].frames,
    engine: metric("engineMs"),
    recordCreateAndSerialize: metric("recordMs"),
    recordOpenAndVerify: metric("openMs"),
    reportGeneration: metric("reportMs"),
    recordBytes: Math.max(...selected.map((sample) => sample.recordBytes)),
    reportBytes: Math.max(...selected.map((sample) => sample.reportBytes)),
  };
};

const summaries = (["typescript", "rust-wasm"] as const).flatMap((backend) =>
  definitions.map((definition) => summary([backend, definition.id])),
);

const evidence = {
  schemaVersion: "vector.air-combat-study-performance.v1",
  environment: {
    runtime: process.version,
    platform: `${platform()} ${release()}`,
    architecture: arch(),
    cpu: cpus()[0]?.model ?? "unknown",
    logicalCores: cpus().length,
    memoryBytes: totalmem(),
  },
  measuredRounds,
  budgets: {
    engineP95Ms: maximumEngineP95Ms,
    recordCreateAndSerializeP95Ms: maximumRecordP95Ms,
    recordOpenAndVerifyP95Ms: maximumOpenP95Ms,
    reportGenerationP95Ms: maximumReportP95Ms,
    recordBytes: maximumRecordBytes,
    reportBytes: maximumReportBytes,
  },
  studies: summaries,
};
process.stdout.write(`${JSON.stringify(evidence)}\n`);

for (const item of summaries) {
  const failures = [
    ["engine p95", item.engine.p95Ms, maximumEngineP95Ms],
    ["record create/serialize p95", item.recordCreateAndSerialize.p95Ms, maximumRecordP95Ms],
    ["record open/verify p95", item.recordOpenAndVerify.p95Ms, maximumOpenP95Ms],
    ["report generation p95", item.reportGeneration.p95Ms, maximumReportP95Ms],
    ["record bytes", item.recordBytes, maximumRecordBytes],
    ["report bytes", item.reportBytes, maximumReportBytes],
  ].filter(([, actual, limit]) => Number(actual) > Number(limit));
  if (failures.length > 0) {
    throw new Error(
      `${item.backend}/${item.scenarioId} exceeded ${failures.map(([name, actual, limit]) => `${name} ${actual} > ${limit}`).join(", ")}`,
    );
  }
}
