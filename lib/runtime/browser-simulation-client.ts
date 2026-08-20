import type { ProfileId } from "../engine/primitives.ts";
import {
  openVectorSimulationRecord,
  type OpenedVectorRecord,
} from "../record/vector-record.ts";
import {
  prepareSimulation,
  type Scenario,
  type SimulationResult,
} from "../simulation.ts";
import { adaptPreparedSimulation } from "./model-pack-adapter.ts";
import {
  BROWSER_RUNTIME_PROTOCOL,
  type BrowserRuntimeRequest,
  type BrowserRuntimeResponse,
  type BrowserRuntimeState,
} from "./protocol.ts";

type WorkerLike = Pick<
  Worker,
  "postMessage" | "terminate" | "addEventListener" | "removeEventListener"
>;

/**
 * Creates the separately bounded environment Worker. Route and ground-start
 * admission in #64 will own its request protocol; simulation ticks never use
 * a Worker, database, or network to obtain environment data.
 */
export function createEnvironmentSamplerWorker() {
  return new Worker(
    new URL("../geospatial/environment-sampler.worker.ts", import.meta.url),
    { type: "module", name: "vector-environment-sampler" },
  );
}

export type BrowserSimulationProgress = {
  modelTimeSeconds: number;
  integratedSteps: number;
  progress: number;
};

export type BrowserSimulationCompletion = {
  result: SimulationResult;
  record: OpenedVectorRecord;
  recordId: string;
  contentDigest: string;
  boundaryCalls: number;
};

export type BrowserSimulationRunOptions = {
  timeoutMs?: number;
  batchTicks?: number;
  progressIntervalMs?: number;
  onProgress?: (progress: BrowserSimulationProgress) => void;
  onState?: (state: BrowserRuntimeState) => void;
};

export class BrowserSimulationCancelledError extends Error {
  override name = "BrowserSimulationCancelledError";
}

type Pending = {
  accept: (message: BrowserRuntimeResponse) => boolean;
  resolve: (message: BrowserRuntimeResponse) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const CANCEL_GRACE_MS = 100;

export class BrowserSimulationClient {
  private readonly workerFactory: () => WorkerLike;
  private worker: WorkerLike | null = null;
  private state: BrowserRuntimeState = "initialization";
  private sequence = 0;
  private initialized: Promise<void> | null = null;
  private readonly pending = new Map<string, Pending>();
  private readonly loadedDigests = new Set<string>();
  private preparing = false;
  private activeRunId: string | null = null;
  private activeStateListener: ((state: BrowserRuntimeState) => void) | null = null;
  private activeProgressListener:
    | ((progress: BrowserSimulationProgress) => void)
    | null = null;

  constructor(
    workerFactory: () => WorkerLike = () =>
      new Worker(new URL("./simulation.worker.ts", import.meta.url), {
        type: "module",
        name: "vector-simulation-runtime",
      }),
  ) {
    this.workerFactory = workerFactory;
  }

  getState() {
    return this.state;
  }

  private nextId(prefix: string) {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }

  private ensureWorker() {
    if (this.worker) return this.worker;
    const worker = this.workerFactory();
    worker.addEventListener("message", this.handleMessage as EventListener);
    worker.addEventListener("error", this.handleCrash as EventListener);
    worker.addEventListener("messageerror", this.handleCrash as EventListener);
    this.worker = worker;
    this.state = "initialization";
    return worker;
  }

  private readonly handleMessage = (event: MessageEvent<BrowserRuntimeResponse>) => {
    const message = event.data;
    if (!message || message.protocol !== BROWSER_RUNTIME_PROTOCOL) return;
    this.state = message.state;
    this.activeStateListener?.(message.state);
    if (message.type === "progress" && message.runId === this.activeRunId) {
      this.activeProgressListener?.({
        modelTimeSeconds: message.modelTimeSeconds,
        integratedSteps: message.integratedSteps,
        progress: message.progress,
      });
    }
    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    if (message.type === "failed") {
      this.pending.delete(message.requestId);
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(new Error(message.message));
      return;
    }
    if (pending.accept(message)) {
      this.pending.delete(message.requestId);
      if (pending.timer) clearTimeout(pending.timer);
      pending.resolve(message);
    }
  };

  private readonly handleCrash = () => {
    const error = new Error("The browser simulation Worker crashed or lost its message channel.");
    this.failPending(error);
    this.destroyWorker("failed");
  };

  private failPending(error: Error) {
    for (const item of this.pending.values()) {
      if (item.timer) clearTimeout(item.timer);
      item.reject(error);
    }
    this.pending.clear();
  }

  private destroyWorker(nextState: BrowserRuntimeState) {
    if (this.worker) {
      this.worker.removeEventListener("message", this.handleMessage as EventListener);
      this.worker.removeEventListener("error", this.handleCrash as EventListener);
      this.worker.removeEventListener("messageerror", this.handleCrash as EventListener);
      this.worker.terminate();
    }
    this.worker = null;
    this.initialized = null;
    this.loadedDigests.clear();
    this.preparing = false;
    this.activeRunId = null;
    this.activeProgressListener = null;
    this.activeStateListener = null;
    this.state = nextState;
  }

  private request(
    message: BrowserRuntimeRequest,
    accept: Pending["accept"],
    timeoutMs = DEFAULT_TIMEOUT_MS,
    transfer: Transferable[] = [],
  ) {
    const worker = this.ensureWorker();
    return new Promise<BrowserRuntimeResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(message.requestId);
        const error = new Error(`Browser simulation request ${message.type} timed out.`);
        reject(error);
        this.failPending(error);
        this.destroyWorker("terminated");
      }, timeoutMs);
      this.pending.set(message.requestId, { accept, resolve, reject, timer });
      worker.postMessage(message, transfer);
    });
  }

  async initialize() {
    if (!this.initialized) {
      const requestId = this.nextId("initialize");
      this.initialized = this.request(
        { protocol: BROWSER_RUNTIME_PROTOCOL, requestId, type: "initialize" },
        (message) => message.type === "initialized",
        5_000,
      ).then(() => undefined);
    }
    return this.initialized;
  }

  async run(
    scenario: Scenario,
    profileId: ProfileId = scenario.profile,
    options: BrowserSimulationRunOptions = {},
  ): Promise<BrowserSimulationCompletion> {
    if (this.activeRunId || this.preparing) {
      throw new Error("A browser simulation run is already active.");
    }
    this.preparing = true;
    let pack: Awaited<ReturnType<typeof adaptPreparedSimulation>>;
    try {
      await this.initialize();
      const prepared = prepareSimulation(scenario, profileId);
      pack = await adaptPreparedSimulation(prepared);
      if (!this.loadedDigests.has(pack.digest)) {
        const requestId = this.nextId("load-pack");
        const response = await this.request(
          {
            protocol: BROWSER_RUNTIME_PROTOCOL,
            requestId,
            type: "load-model-pack",
            pack,
          },
          (message) => message.type === "model-pack-loaded",
        );
        if (response.type !== "model-pack-loaded" || response.digest !== pack.digest) {
          throw new Error("Browser simulation Worker acknowledged the wrong model pack.");
        }
        this.loadedDigests.add(pack.digest);
      }
    } finally {
      this.preparing = false;
    }
    const runId = this.nextId("run");
    const requestId = this.nextId("execute");
    this.activeRunId = runId;
    this.activeProgressListener = options.onProgress ?? null;
    this.activeStateListener = options.onState ?? null;
    try {
      const response = await this.request(
        {
          protocol: BROWSER_RUNTIME_PROTOCOL,
          requestId,
          type: "run",
          runId,
          packDigest: pack.digest,
          scenarioRef: pack.scenarioRef,
          batchTicks: Math.max(1, Math.min(4_096, Math.floor(options.batchTicks ?? 128))),
          progressIntervalMs: Math.max(
            50,
            Math.min(1_000, Math.floor(options.progressIntervalMs ?? 100)),
          ),
        },
        (message) => message.type === "completed" || message.type === "cancelled",
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );
      if (response.type === "cancelled") {
        throw new BrowserSimulationCancelledError("Browser simulation run cancelled.");
      }
      if (response.type !== "completed") throw new Error("Browser simulation ended without a record.");
      if (response.backend !== pack.prepared.capabilityManifest.engine.id) {
        throw new Error("Browser simulation completion provenance is invalid.");
      }
      try {
        const record = await openVectorSimulationRecord(
          response.recordBuffer,
          response.byteLength,
        );
        return {
          result: record.result,
          record,
          recordId: response.recordId,
          contentDigest: response.contentDigest,
          boundaryCalls: response.boundaryCalls,
        };
      } finally {
        const recycleId = this.nextId("recycle");
        this.worker?.postMessage(
          {
            protocol: BROWSER_RUNTIME_PROTOCOL,
            requestId: recycleId,
            type: "recycle-buffer",
            buffer: response.recordBuffer,
          } satisfies BrowserRuntimeRequest,
          [response.recordBuffer],
        );
      }
    } finally {
      this.activeRunId = null;
      this.activeProgressListener = null;
      this.activeStateListener = null;
    }
  }

  async pause() {
    if (!this.activeRunId) return;
    const requestId = this.nextId("pause");
    await this.request(
      {
        protocol: BROWSER_RUNTIME_PROTOCOL,
        requestId,
        type: "pause",
        runId: this.activeRunId,
      },
      (message) => message.type === "state" && message.state === "paused",
      1_000,
    );
  }

  async resume() {
    if (!this.activeRunId) return;
    const requestId = this.nextId("resume");
    await this.request(
      {
        protocol: BROWSER_RUNTIME_PROTOCOL,
        requestId,
        type: "resume",
        runId: this.activeRunId,
      },
      (message) => message.type === "state" && message.state === "running",
      1_000,
    );
  }

  async cancel() {
    if (!this.activeRunId || !this.worker) return;
    const requestId = this.nextId("cancel");
    const runId = this.activeRunId;
    try {
      await this.request(
        { protocol: BROWSER_RUNTIME_PROTOCOL, requestId, type: "cancel", runId },
        (message) => message.type === "state" && message.state === "cancelling",
        CANCEL_GRACE_MS,
      );
    } catch {
      this.failPending(new Error("Browser simulation cancellation forced Worker termination."));
      this.destroyWorker("terminated");
    }
  }

  terminate() {
    this.failPending(new Error("Browser simulation client terminated."));
    this.destroyWorker("terminated");
  }
}

let sharedClient: BrowserSimulationClient | null = null;

export function getBrowserSimulationClient() {
  sharedClient ??= new BrowserSimulationClient();
  return sharedClient;
}
