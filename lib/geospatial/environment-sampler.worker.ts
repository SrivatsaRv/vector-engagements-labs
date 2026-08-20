/// <reference lib="webworker" />

import {
  createPhaseAEnvironmentSampler,
  type EnvironmentPack,
  type EnvironmentSampleQuery,
} from "./environment-pack.ts";

type Request =
  | { type: "load"; requestId: string; pack: EnvironmentPack }
  | { type: "sample"; requestId: string; digest: string; queries: EnvironmentSampleQuery[] }
  | { type: "cancel"; requestId: string };

type Loaded = ReturnType<typeof createPhaseAEnvironmentSampler>;
const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const packs = new Map<string, Loaded>();
const cancelled = new Set<string>();
const MAX_PACKS = 4;

function reply(value: unknown) {
  scope.postMessage(value);
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
        packs.set(pack.identity.digest, createPhaseAEnvironmentSampler(pack));
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
    try {
      const controller = new AbortController();
      if (cancelled.delete(request.requestId)) controller.abort();
      const samples = sampler.sampleBatch(request.queries, controller.signal);
      reply({ type: "sampled", requestId: request.requestId, digest: request.digest, samples });
    } catch (error) {
      reply({ type: "failed", requestId: request.requestId, code: error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "sampling", message: error instanceof Error ? error.message : "Environment sampling failed." });
    }
  }
});
