import { sha256HexSync } from "../geospatial/digest.ts";
import type { EngineScenario } from "./contracts.ts";

export type RuntimeModelPackProjection = EngineScenario["modelPack"];

function content(pack: RuntimeModelPackProjection) {
  const value = { ...pack };
  delete value.runtimeDigest;
  return value;
}

export function runtimeModelPackDigest(pack: RuntimeModelPackProjection) {
  return sha256HexSync(content(pack));
}

export function bindRuntimeModelPackDigest(
  pack: Omit<RuntimeModelPackProjection, "runtimeDigest">,
): RuntimeModelPackProjection {
  return { ...pack, runtimeDigest: runtimeModelPackDigest(pack) };
}

export function assertRuntimeModelPackDigest(pack: RuntimeModelPackProjection) {
  if (!pack.runtimeDigest || pack.runtimeDigest !== runtimeModelPackDigest(pack)) {
    throw new Error("The runtime model-pack projection digest does not match its content.");
  }
}
