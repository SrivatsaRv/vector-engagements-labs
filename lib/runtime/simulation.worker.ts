/// <reference lib="webworker" />

import { runEngineBackend } from "../engine/backend.ts";
import { EngineSession } from "../engine/core.ts";
import type { EngineRun } from "../engine/contracts.ts";
import {
  createVectorSimulationRecord,
  openVectorSimulationRecord,
  serializeVectorRecord,
} from "../record/vector-record.ts";
import { buildSimulationResult } from "../simulation.ts";
import {
  admitScenarioDraftReceipt,
  ScenarioDraftAdmissionError,
  type ScenarioDraftAdmissionReceipt,
} from "../scenario-draft-admission.ts";
import { CapabilityAdmissionError } from "./deployment-capabilities.ts";
import { admitRuntimeModelPack } from "./model-pack-adapter.ts";
import {
  BROWSER_RUNTIME_PROTOCOL,
  isRuntimeRequest,
  type BrowserRuntimeRequest,
  type BrowserRuntimeResponse,
  type BrowserRuntimeState,
  type RuntimeModelPackAdapter,
} from "./protocol.ts";

const workerScope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const packs = new Map<string, RuntimeModelPackAdapter>();
const reusableBuffers: ArrayBuffer[] = [];
const MAX_PACKS = 8;
const MAX_REUSABLE_BUFFERS = 2;
const MAX_REUSABLE_BUFFER_BYTES = 64 * 1024 * 1024;

type ActiveRun = {
  requestId: string;
  runId: string;
  cancelled: boolean;
  paused: boolean;
  resume: (() => void) | null;
};

let state: BrowserRuntimeState = "initialization";
let active: ActiveRun | null = null;
let verifyingRecord = false;

function respond(message: BrowserRuntimeResponse, transfer: Transferable[] = []) {
  workerScope.postMessage(message, transfer);
}

function stateMessage(
  requestId: string,
  next: BrowserRuntimeState,
  runId?: string,
  reason?: string,
) {
  state = next;
  respond({
    protocol: BROWSER_RUNTIME_PROTOCOL,
    requestId,
    type: "state",
    state,
    ...(runId ? { runId } : {}),
    ...(reason ? { reason } : {}),
  });
}

function nextTurn() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function waitWhilePaused(run: ActiveRun) {
  while (run.paused && !run.cancelled) {
    await new Promise<void>((resolve) => {
      run.resume = resolve;
    });
    run.resume = null;
  }
}

function takeReusableBuffer() {
  return reusableBuffers.sort((left, right) => left.byteLength - right.byteLength).shift();
}

async function executeRun(request: Extract<BrowserRuntimeRequest, { type: "run" }>) {
  const pack = packs.get(request.packDigest);
  if (!pack || pack.scenarioRef !== request.scenarioRef) {
    state = "failed";
    respond({
      protocol: BROWSER_RUNTIME_PROTOCOL,
      requestId: request.requestId,
      type: "failed",
      state,
      runId: request.runId,
      code: "missing-pack",
      message: "The referenced compiled model pack is not loaded in this Worker.",
      recoverable: true,
    });
    return;
  }
  const backend = pack.prepared.capabilityManifest.engine.id;
  const run: ActiveRun = {
    requestId: request.requestId,
    runId: request.runId,
    cancelled: false,
    paused: false,
    resume: null,
  };
  active = run;
  let engineRun: EngineRun;
  let admission: ScenarioDraftAdmissionReceipt;
  let boundaryCalls = 0;
  try {
    admission = await admitScenarioDraftReceipt(
      request.admission,
      pack.prepared.scenario,
    );
    stateMessage(request.requestId, "running", request.runId);
    if (backend === "typescript") {
      const session = new EngineSession(pack.prepared.engineScenario);
      let lastProgress = 0;
      while (!session.isCompleted()) {
        await waitWhilePaused(run);
        if (run.cancelled) {
          state = "ready";
          respond({
            protocol: BROWSER_RUNTIME_PROTOCOL,
            requestId: request.requestId,
            type: "cancelled",
            state,
            runId: request.runId,
          });
          active = null;
          return;
        }
        const batch = session.runTicks(request.batchTicks);
        boundaryCalls += 1;
        const now = performance.now();
        if (batch.completed || now - lastProgress >= request.progressIntervalMs) {
          lastProgress = now;
          respond({
            protocol: BROWSER_RUNTIME_PROTOCOL,
            requestId: request.requestId,
            type: "progress",
            state: "running",
            runId: request.runId,
            modelTimeSeconds: batch.modelTimeSeconds,
            integratedSteps: batch.integratedSteps,
            progress: batch.progress,
          });
        }
        if (!batch.completed) await nextTurn();
      }
      engineRun = session.result();
    } else {
      // Compatibility path: one whole-run Rust JSON ABI call. It is isolated
      // from the main thread and provenance-checked, but cannot cooperatively
      // pause inside the WASM call until the typed batch ABI lands.
      boundaryCalls = 1;
      await nextTurn();
      if (run.cancelled) {
        state = "ready";
        respond({
          protocol: BROWSER_RUNTIME_PROTOCOL,
          requestId: request.requestId,
          type: "cancelled",
          state,
          runId: request.runId,
        });
        active = null;
        return;
      }
      engineRun = runEngineBackend(pack.prepared.engineScenario, backend);
    }
    if (run.cancelled) {
      state = "ready";
      respond({
        protocol: BROWSER_RUNTIME_PROTOCOL,
        requestId: request.requestId,
        type: "cancelled",
        state,
        runId: request.runId,
      });
      active = null;
      return;
    }
    const result = buildSimulationResult(pack.prepared, engineRun);
    const record = await createVectorSimulationRecord(pack.prepared, result);
    const serialized = serializeVectorRecord(record, takeReusableBuffer());
    const openedRecord = await openVectorSimulationRecord(
      serialized.buffer,
      serialized.byteLength,
    );
    state = "completed";
    respond(
      {
        protocol: BROWSER_RUNTIME_PROTOCOL,
        requestId: request.requestId,
        type: "completed",
        state,
        runId: request.runId,
        admission,
        backend,
        recordId: record.manifest.recordId,
        contentDigest: record.manifest.contentDigest,
        byteLength: serialized.byteLength,
        boundaryCalls,
        recordBuffer: serialized.buffer,
        record: openedRecord,
      },
      [serialized.buffer],
    );
    active = null;
  } catch (error) {
    state = "failed";
    active = null;
    respond({
      protocol: BROWSER_RUNTIME_PROTOCOL,
      requestId: request.requestId,
      type: "failed",
      state,
      runId: request.runId,
      code: error instanceof ScenarioDraftAdmissionError ? error.code : "engine",
      message: error instanceof Error ? error.message : "Unknown simulation Worker failure.",
      recoverable: true,
      ...(error instanceof ScenarioDraftAdmissionError
        ? {
            fieldPath: error.fieldPath,
            stage: error.stage,
            severity: error.severity,
            correctiveGuidance: error.correctiveGuidance,
          }
        : {}),
    });
  }
}

async function executeOpenRecord(
  request: Extract<BrowserRuntimeRequest, { type: "open-record" }>,
) {
  verifyingRecord = true;
  stateMessage(request.requestId, "running");
  try {
    const record = await openVectorSimulationRecord(
      request.recordBuffer,
      request.byteLength,
      request.compiledModelPack
        ? { compiledModelPack: request.compiledModelPack }
        : undefined,
    );
    state = "completed";
    respond({
      protocol: BROWSER_RUNTIME_PROTOCOL,
      requestId: request.requestId,
      type: "record-opened",
      state,
      record,
    });
  } catch (error) {
    state = "failed";
    respond({
      protocol: BROWSER_RUNTIME_PROTOCOL,
      requestId: request.requestId,
      type: "failed",
      state,
      code: "record",
      message: error instanceof Error ? error.message : "Unknown record verification failure.",
      recoverable: true,
    });
  } finally {
    verifyingRecord = false;
  }
}

workerScope.addEventListener("message", (event: MessageEvent<unknown>) => {
  const request = event.data;
  if (!isRuntimeRequest(request)) {
    state = "failed";
    respond({
      protocol: BROWSER_RUNTIME_PROTOCOL,
      requestId: "invalid",
      type: "failed",
      state,
      code: "protocol",
      message: "The Worker received an unsupported protocol message.",
      recoverable: false,
    });
    return;
  }
  if (request.type === "initialize") {
    state = "ready";
    respond({
      protocol: BROWSER_RUNTIME_PROTOCOL,
      requestId: request.requestId,
      type: "initialized",
      state,
    });
    return;
  }
  if (request.type === "load-model-pack") {
    void admitRuntimeModelPack(request.pack)
      .then(() => {
        const cached = packs.has(request.pack.digest);
        if (!cached) {
          if (packs.size >= MAX_PACKS) packs.delete(packs.keys().next().value!);
          packs.set(request.pack.digest, request.pack);
        }
        state = "ready";
        respond({
          protocol: BROWSER_RUNTIME_PROTOCOL,
          requestId: request.requestId,
          type: "model-pack-loaded",
          state,
          digest: request.pack.digest,
          cached,
        });
      })
      .catch((error: unknown) => {
        state = "failed";
        respond({
          protocol: BROWSER_RUNTIME_PROTOCOL,
          requestId: request.requestId,
          type: "failed",
          state,
          code:
            error instanceof CapabilityAdmissionError &&
            error.code === "CAPABILITY_MANIFEST_STALE"
              ? "capability-manifest-stale"
              : "protocol",
          message:
            error instanceof Error
              ? error.message
              : "The model-pack adapter cannot be admitted.",
          recoverable: false,
        });
      });
    return;
  }
  if (request.type === "run") {
    if (active || verifyingRecord) {
      respond({
        protocol: BROWSER_RUNTIME_PROTOCOL,
        requestId: request.requestId,
        type: "failed",
        state,
        runId: request.runId,
        code: "engine",
        message: "This simulation Worker already owns an active run.",
        recoverable: true,
      });
      return;
    }
    void executeRun(request);
    return;
  }
  if (request.type === "open-record") {
    if (active || verifyingRecord) {
      respond({
        protocol: BROWSER_RUNTIME_PROTOCOL,
        requestId: request.requestId,
        type: "failed",
        state,
        code: "record",
        message: "This simulation Worker already owns an active run.",
        recoverable: true,
      });
      return;
    }
    void executeOpenRecord(request);
    return;
  }
  if (request.type === "pause" && active?.runId === request.runId) {
    active.paused = true;
    stateMessage(request.requestId, "paused", request.runId);
    return;
  }
  if (request.type === "resume" && active?.runId === request.runId) {
    active.paused = false;
    active.resume?.();
    stateMessage(request.requestId, "running", request.runId);
    return;
  }
  if (request.type === "cancel" && active?.runId === request.runId) {
    active.cancelled = true;
    active.paused = false;
    active.resume?.();
    stateMessage(request.requestId, "cancelling", request.runId);
    return;
  }
  if (request.type === "recycle-buffer") {
    if (
      request.buffer.byteLength <= MAX_REUSABLE_BUFFER_BYTES &&
      reusableBuffers.length < MAX_REUSABLE_BUFFERS
    ) {
      reusableBuffers.push(request.buffer);
    }
    return;
  }
  if (request.type === "terminate") {
    state = "terminated";
    respond({
      protocol: BROWSER_RUNTIME_PROTOCOL,
      requestId: request.requestId,
      type: "terminated",
      state,
    });
    workerScope.close();
  }
});
