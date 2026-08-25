import { readFile } from "node:fs/promises";
import { cpus, freemem, platform, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";

import { sha256Hex } from "../lib/canonical-json.ts";
import {
  InMemoryModelPackRepository,
  compileGovernedModelPack,
  validateScenarioModelInstance,
  type CompiledModelPack,
  type GovernedModelPackResearchExport,
} from "../lib/model-pack.ts";

type Operation = {
  id: string;
  p50BudgetMs: number;
  p95BudgetMs: number;
  p99BudgetMs: number;
  maxBudgetMs: number;
};
type Workload = {
  schemaVersion: "vector.model-pack-foundation-performance-workload.v1";
  fixture: { path: string; id: string; version: string; digest: string };
  warmupRuns: number;
  sampleRuns: number;
  operations: Operation[];
  workloadDigest: string;
};

const workload = JSON.parse(await readFile(
  new URL("../fixtures/performance/model-pack-foundation-workload.v1.json", import.meta.url),
  "utf8",
)) as Workload;
const workloadPayload = structuredClone(workload) as Partial<Workload>;
Reflect.deleteProperty(workloadPayload, "workloadDigest");
const workloadDigest = await sha256Hex(workloadPayload);
if (workload.workloadDigest !== workloadDigest) throw new Error("model-pack foundation workload digest is stale");
const archive = JSON.parse(await readFile(workload.fixture.path, "utf8")) as GovernedModelPackResearchExport;
const serializedPublication = archive.publications[0];
const compileInput = () => ({
  source: structuredClone(serializedPublication.source),
  rawArtifactBytes: serializedPublication.rawArtifactBytes.map((item) => ({
    digest: item.digest, bytes: Uint8Array.from(item.bytes),
  })),
  derivativeBytes: serializedPublication.derivativeBytes.map((item) => ({
    digest: item.digest, bytes: Uint8Array.from(item.bytes),
  })),
});
const bundle = await compileGovernedModelPack(compileInput());
const reference = { id: bundle.pack.id, version: bundle.pack.version, digest: bundle.pack.digest };
if (
  reference.id !== workload.fixture.id
  || reference.version !== workload.fixture.version
  || reference.digest !== workload.fixture.digest
) throw new Error("model-pack foundation fixture identity does not match its workload");
const loadedRepository = new InMemoryModelPackRepository();
await loadedRepository.publishBatch([{ ...compileInput(), bundle }]);
const aircraft = bundle.pack.aircraft[0];

const percentile = (ordered: number[], probability: number) =>
  ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * probability) - 1)];
const summarize = (samples: number[]) => {
  const ordered = [...samples].sort((left, right) => left - right);
  return {
    samples: ordered.length,
    p50Ms: percentile(ordered, 0.5),
    p95Ms: percentile(ordered, 0.95),
    p99Ms: percentile(ordered, 0.99),
    maxMs: ordered.at(-1)!,
  };
};
const measure = async (operation: () => void | Promise<void>) => {
  for (let index = 0; index < workload.warmupRuns; index += 1) await operation();
  const samples = [];
  for (let index = 0; index < workload.sampleRuns; index += 1) {
    const started = performance.now();
    await operation();
    samples.push(performance.now() - started);
  }
  return summarize(samples);
};

const operations = new Map<string, () => void | Promise<void>>([
  ["compile", async () => { await compileGovernedModelPack(compileInput()); }],
  ["publish", async () => {
    const repository = new InMemoryModelPackRepository();
    await repository.publishBatch([{ ...compileInput(), bundle }]);
  }],
  ["exactLookup", async () => { await loadedRepository.resolveExact(reference); }],
  ["researchExport", async () => { await loadedRepository.exportResearch([reference]); }],
  ["researchImport", async () => {
    const repository = new InMemoryModelPackRepository();
    await repository.importResearch(archive);
  }],
  ...[1, 10, 100, 500].map((count) => [`compiledReuse${count}`, () => {
    for (let index = 0; index < count; index += 1) validateScenarioModelInstance(
      bundle.pack as unknown as CompiledModelPack,
      {
      id: `benchmark-instance-${count}-${index}`,
      catalogObjectId: aircraft.catalogObjectId,
      modelId: aircraft.id,
      modelPackDigest: bundle.pack.digest,
      loadout: [],
      patches: [],
      },
    );
  }] as const),
]);

const measurements = [];
for (const budget of workload.operations) {
  const operation = operations.get(budget.id);
  if (!operation) throw new Error(`unknown model-pack benchmark operation ${budget.id}`);
  const result = await measure(operation);
  if (
    result.p50Ms > budget.p50BudgetMs
    || result.p95Ms > budget.p95BudgetMs
    || result.p99Ms > budget.p99BudgetMs
    || result.maxMs > budget.maxBudgetMs
  ) {
    throw new Error(`${budget.id} exceeded a percentile/max budget: ${JSON.stringify({ budget, result })}`);
  }
  measurements.push({ ...result, ...budget });
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: "vector.model-pack-foundation-performance-result.v1",
  workloadDigest,
  fixture: workload.fixture,
  runtime: {
    node: process.version,
    platform: platform(),
    release: release(),
    architecture: process.arch,
    cpuModel: cpus()[0]?.model ?? "UNKNOWN",
    logicalCores: cpus().length,
    totalMemoryBytes: totalmem(),
    freeMemoryBytesAtCompletion: freemem(),
  },
  measurements,
})}\n`);
