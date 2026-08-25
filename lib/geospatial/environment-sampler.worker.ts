/// <reference lib="webworker" />

import {
  createEnvironmentSampler,
  type EnvironmentPack,
  type EnvironmentSampleQuery,
} from "./environment-pack.ts";

type Request =
  | { type: "load"; requestId: string; pack: EnvironmentPack }
  | { type: "sample"; requestId: string; digest: string; queries: EnvironmentSampleQuery[] }
  | { type: "cancel"; requestId: string };

type Loaded = ReturnType<typeof createEnvironmentSampler>;
const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const packs = new Map<string, Loaded>();
const cancelled = new Set<string>();
const inFlight = new Set<string>();
const MAX_PACKS = 4;
const SAMPLE_CHUNK_SIZE = 128;

function reply(value: unknown) {
  scope.postMessage(value);
}

const yieldToWorker = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function processSamples(request: Extract<Request, { type: "sample" }>, sampler: Loaded) {
  if (inFlight.has(request.requestId)) {
    reply({ type: "failed", requestId: request.requestId, code: "duplicate-request", message: "Environment request is already active." });
    return;
  }
  inFlight.add(request.requestId);
  try {
    const samples = [];
    for (let offset = 0; offset < request.queries.length; offset += SAMPLE_CHUNK_SIZE) {
      if (cancelled.has(request.requestId)) throw new DOMException("Environment sampling was cancelled.", "AbortError");
      samples.push(...sampler.sampleBatch(request.queries.slice(offset, offset + SAMPLE_CHUNK_SIZE)));
      await yieldToWorker();
    }
    if (cancelled.has(request.requestId)) throw new DOMException("Environment sampling was cancelled.", "AbortError");
    reply({ type: "sampled", requestId: request.requestId, digest: request.digest, samples });
  } catch (error) {
    reply({ type: "failed", requestId: request.requestId, code: error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "sampling", message: error instanceof Error ? error.message : "Environment sampling failed." });
  } finally {
    cancelled.delete(request.requestId);
    inFlight.delete(request.requestId);
  }
}

scope.addEventListener("message", (event: MessageEvent<unknown>) => {
  const request = event.data as Partial<Request>;
  if (!request || typeof request.requestId !== "string" || typeof request.type !== "string") {
    reply({ type: "failed", code: "protocol", message: "Environment Worker received an invalid request." });
    return;
  }
  if (request.type === "cancel") {
    cancelled.add(request.requestId);
    return;
  }
  if (request.type === "load") {
    try {
      const pack = request.pack!;
      const cached = packs.has(pack.identity.digest);
      if (!cached) {
        if (packs.size >= MAX_PACKS) packs.delete(packs.keys().next().value!);
        packs.set(pack.identity.digest, createEnvironmentSampler(pack));
      }
      reply({ type: "loaded", requestId: request.requestId, digest: pack.identity.digest, cached });
    } catch (error) {
      reply({ type: "failed", requestId: request.requestId, code: "environment-pack", message: error instanceof Error ? error.message : "Environment pack load failed." });
    }
    return;
  }
  if (request.type === "sample") {
    const sampler = typeof request.digest === "string" ? packs.get(request.digest) : undefined;
    if (!sampler || !Array.isArray(request.queries)) {
      reply({ type: "failed", requestId: request.requestId, code: "missing-pack", message: "Environment pack is not loaded in this Worker." });
      return;
    }
    void processSamples(request as Extract<Request, { type: "sample" }>, sampler);
  }
});
