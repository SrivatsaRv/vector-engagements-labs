import { authorGenericAirborneStoreTransfer } from "../air-mission.ts";
import { CURRENT_COMPILED_MODEL_PACK } from "../engine/weapon-admission.ts";
import { createGenericTakeoffPerformanceScenario } from "./generic-takeoff-performance.ts";

/** #187-owned additive workload; the frozen #182 takeoff fixture remains unchanged. */
export const GENERIC_AIRBORNE_STORE_TRANSFER_PERFORMANCE_PROFILE = Object.freeze({
  schemaVersion: "vector.generic-airborne-store-transfer-performance-profile.v1" as const,
  id: "generic-runway-takeoff-airborne-transfer-25s.v1" as const,
  durationSeconds: 25,
  warmupRunsPerBackend: 3,
  measuredRunsPerBackend: 20,
  percentile: 0.95,
  maximumP95Ms: 100,
  maximumFramesPerRun: 150,
  maximumOptimizedWasmBytes: 585_000,
  backends: Object.freeze(["typescript", "rust-wasm"] as const),
});

export function createGenericAirborneStoreTransferScenario() {
  const scenario = createGenericTakeoffPerformanceScenario();
  if (!scenario.airMission) {
    throw new Error("Generic airborne store-transfer fixture requires an admitted Air mission.");
  }
  scenario.airMission = authorGenericAirborneStoreTransfer({
    mission: scenario.airMission,
    modelPack: CURRENT_COMPILED_MODEL_PACK,
    storeOrdinal: 1,
    operation: "RELEASE",
    requestedTimeSeconds: 20,
    installedDragAreaM2: 0.08,
  });
  return scenario;
}
