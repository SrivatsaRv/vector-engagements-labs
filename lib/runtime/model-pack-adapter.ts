import { sha256Hex } from "../canonical-json.ts";
import type { PreparedSimulation } from "../simulation.ts";
import type { RuntimeModelPackAdapter } from "./protocol.ts";

export async function adaptPreparedSimulation(
  prepared: PreparedSimulation,
): Promise<RuntimeModelPackAdapter> {
  const scenarioRef = `${prepared.engineScenario.id}@${prepared.engineScenario.version}`;
  const content = {
    schemaVersion: "vector.runtime-model-pack-adapter.v1" as const,
    scenarioRef,
    prepared,
  };
  return { ...content, digest: await sha256Hex(content) };
}

export async function verifyRuntimeModelPack(pack: RuntimeModelPackAdapter) {
  const { digest, ...content } = pack;
  return digest === (await sha256Hex(content));
}
