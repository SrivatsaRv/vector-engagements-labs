import historicalBundle from "../../fixtures/model-packs/vector-scalar-study-v0.8.compiled.json" with { type: "json" };
import type { CompiledModelPack } from "../model-pack.ts";
import { CURRENT_COMPILED_MODEL_PACK } from "./weapon-admission.ts";

const RETAINED_COMPILED_MODEL_PACKS = [
  historicalBundle.pack as CompiledModelPack,
  CURRENT_COMPILED_MODEL_PACK,
] as const;

export function findRetainedCompiledModelPack(identity: {
  id: string;
  version: string;
  digest: string;
}): CompiledModelPack | undefined {
  return RETAINED_COMPILED_MODEL_PACKS.find(
    (candidate) =>
      candidate.id === identity.id &&
      candidate.version === identity.version &&
      candidate.digest === identity.digest,
  );
}

/**
 * Resolve only an exact, application-retained pack identity. Saved-run replay
 * must never reinterpret archived authored inputs through the current pack.
 */
export function resolveRetainedCompiledModelPack(identity: {
  id: string;
  version: string;
  digest: string;
}): CompiledModelPack {
  const pack = findRetainedCompiledModelPack(identity);
  if (!pack) {
    throw new Error(
      `No retained compiled model pack matches ${identity.id}@${identity.version} (${identity.digest}).`,
    );
  }
  return pack;
}
