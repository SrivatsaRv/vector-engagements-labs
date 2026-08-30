import type { EngineBackendId } from "../engine/contracts.ts";
import type { CompiledModelPack } from "../model-pack.ts";
import type { OpenedVectorRecord } from "../record/vector-record.ts";
import type { PreparedSimulation } from "../simulation.ts";

export const BROWSER_RUNTIME_PROTOCOL = "vector.browser-runtime.v1" as const;
export const BROWSER_RUNTIME_PROTOCOL_VERSION = 1 as const;

export type BrowserRuntimeState =
  | "initialization"
  | "ready"
  | "running"
  | "paused"
  | "cancelling"
  | "completed"
  | "failed"
  | "terminated";

/**
 * Temporary adapter until the Simulation Data Foundation model-pack contract
 * lands. Only this type is permitted to assume that a compiled EngineScenario
 * and its display projection travel together.
 */
export type RuntimeModelPackAdapter = {
  schemaVersion: "vector.runtime-model-pack-adapter.v1";
  digest: string;
  scenarioRef: string;
  prepared: PreparedSimulation;
};

type RuntimeRequestBase = {
  protocol: typeof BROWSER_RUNTIME_PROTOCOL;
  requestId: string;
};

export type BrowserRuntimeRequest =
  | (RuntimeRequestBase & { type: "initialize" })
  | (RuntimeRequestBase & {
      type: "load-model-pack";
      pack: RuntimeModelPackAdapter;
    })
  | (RuntimeRequestBase & {
      type: "run";
      runId: string;
      packDigest: string;
      scenarioRef: string;
      batchTicks: number;
      progressIntervalMs: number;
    })
  | (RuntimeRequestBase & {
      type: "open-record";
      recordBuffer: ArrayBuffer;
      byteLength: number;
      compiledModelPack?: Readonly<CompiledModelPack>;
    })
  | (RuntimeRequestBase & { type: "pause"; runId: string })
  | (RuntimeRequestBase & { type: "resume"; runId: string })
  | (RuntimeRequestBase & { type: "cancel"; runId: string })
  | (RuntimeRequestBase & {
      type: "recycle-buffer";
      buffer: ArrayBuffer;
    })
  | (RuntimeRequestBase & { type: "terminate" });

type RuntimeResponseBase = {
  protocol: typeof BROWSER_RUNTIME_PROTOCOL;
  requestId: string;
  state: BrowserRuntimeState;
};

export type BrowserRuntimeResponse =
  | (RuntimeResponseBase & { type: "initialized" })
  | (RuntimeResponseBase & {
      type: "model-pack-loaded";
      digest: string;
      cached: boolean;
    })
  | (RuntimeResponseBase & {
      type: "state";
      runId?: string;
      reason?: string;
    })
  | (RuntimeResponseBase & {
      type: "progress";
      runId: string;
      modelTimeSeconds: number;
      integratedSteps: number;
      progress: number;
    })
  | (RuntimeResponseBase & {
      type: "completed";
      runId: string;
      backend: EngineBackendId;
      recordId: string;
      contentDigest: string;
      byteLength: number;
      boundaryCalls: number;
      recordBuffer: ArrayBuffer;
      record: OpenedVectorRecord;
    })
  | (RuntimeResponseBase & {
      type: "record-opened";
      record: OpenedVectorRecord;
    })
  | (RuntimeResponseBase & {
      type: "cancelled";
      runId: string;
    })
  | (RuntimeResponseBase & {
      type: "failed";
      runId?: string;
      code:
        | "protocol"
        | "missing-pack"
        | "timeout"
        | "engine"
        | "record"
        | "capability-manifest-stale";
      message: string;
      recoverable: boolean;
    })
  | (RuntimeResponseBase & { type: "terminated" });

export function isRuntimeRequest(value: unknown): value is BrowserRuntimeRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BrowserRuntimeRequest>;
  const requestTypes = new Set<BrowserRuntimeRequest["type"]>([
    "initialize",
    "load-model-pack",
    "run",
    "open-record",
    "pause",
    "resume",
    "cancel",
    "recycle-buffer",
    "terminate",
  ]);
  return (
    candidate.protocol === BROWSER_RUNTIME_PROTOCOL &&
    typeof candidate.requestId === "string" &&
    typeof candidate.type === "string" &&
    requestTypes.has(candidate.type as BrowserRuntimeRequest["type"])
  );
}
