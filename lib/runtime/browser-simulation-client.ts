import type { ProfileId } from "../engine/primitives.ts";
import type { CompiledModelPack } from "../model-pack.ts";
import {
  MAX_VECTOR_RECORD_BYTES,
  type OpenedVectorRecord,
} from "../record/vector-record.ts";
import {
  prepareSimulation,
  type Scenario,
  type SimulationResult,
} from "../simulation.ts";
import { adaptPreparedSimulation } from "./model-pack-adapter.ts";
import {
  assertRetainedScenarioPackageReference,
  type ScenarioPackageReference,
} from "../scenario-package-reference.ts";
import {
  admitScenarioDraftReceipt,
  assertMatchingScenarioDraftAdmissionReceipt,
  createScenarioDraftAdmissionReceipt,
  ScenarioDraftAdmissionError,
  type ScenarioDraftAdmissionIssueCode,
  type ScenarioDraftAdmissionReceipt,
} from "../scenario-draft-admission.ts";
import {
  BROWSER_RUNTIME_PROTOCOL,
  type BrowserRuntimeRequest,
  type BrowserRuntimeResponse,
  type BrowserRuntimeState,
} from "./protocol.ts";

async function createSimulationWorker() {
  // Vinext must own the Worker URL. Importing the Vite worker module produces
  // a same-origin JavaScript asset, unlike a source `import.meta.url` which
  // Vinext serializes as a file: URL in the browser client bundle.
  const { default: SimulationWorker } = await import(
    "./simulation.worker.ts?worker"
  );
  return new SimulationWorker({ name: "vector-simulation-runtime" });
}

type WorkerLike = Pick<
  Worker,
  "postMessage" | "terminate" | "addEventListener" | "removeEventListener"
>;

type WorkerFactory = () => WorkerLike | Promise<WorkerLike>;

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
  admission: ScenarioDraftAdmissionReceipt;
  /** Exact-length Worker-produced .vector bytes retained by the caller. */
  serializedRecord: ArrayBuffer;
  recordId: string;
  contentDigest: string;
  boundaryCalls: number;
};

export type BrowserSimulationRunOptions = {
  admission?: ScenarioDraftAdmissionReceipt;
  packageReference?: ScenarioPackageReference;
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
const DRAFT_ADMISSION_FAILURE_CODES = new Set<ScenarioDraftAdmissionIssueCode>([
  "DRAFT_ADMISSION_INVALID",
  "DRAFT_ADMISSION_STALE_REQUEST",
  "DRAFT_ADMISSION_STALE_DRAFT",
]);

export class BrowserSimulationClient {
  private readonly workerFactory: WorkerFactory;
  private worker: WorkerLike | null = null;
  private workerLoading: Promise<WorkerLike> | null = null;
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

  constructor(workerFactory: WorkerFactory = createSimulationWorker) {
    this.workerFactory = workerFactory;
  }

  getState() {
    return this.state;
  }

  private nextId(prefix: string) {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }

  private async ensureWorker() {
    if (this.worker) return this.worker;
    if (!this.workerLoading) {
      this.workerLoading = Promise.resolve(this.workerFactory()).then((worker) => {
        worker.addEventListener("message", this.handleMessage as EventListener);
        worker.addEventListener("error", this.handleCrash as EventListener);
        worker.addEventListener("messageerror", this.handleCrash as EventListener);
        this.worker = worker;
        this.state = "initialization";
        return worker;
      });
    }
    return this.workerLoading;
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
      if (
        DRAFT_ADMISSION_FAILURE_CODES.has(message.code as ScenarioDraftAdmissionIssueCode)
        && message.fieldPath
        && message.correctiveGuidance
      ) {
        pending.reject(new ScenarioDraftAdmissionError(
          message.code as ScenarioDraftAdmissionIssueCode,
          message.fieldPath,
          message.message,
          message.correctiveGuidance,
        ));
      } else {
        pending.reject(new Error(message.message));
      }
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
    this.workerLoading = null;
    this.initialized = null;
    this.loadedDigests.clear();
    this.preparing = false;
    this.activeRunId = null;
    this.activeProgressListener = null;
    this.activeStateListener = null;
    this.state = nextState;
  }

  private async request(
    message: BrowserRuntimeRequest,
    accept: Pending["accept"],
    timeoutMs = DEFAULT_TIMEOUT_MS,
    transfer: Transferable[] = [],
  ) {
    const worker = await this.ensureWorker();
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
    let admission: ScenarioDraftAdmissionReceipt;
    try {
      await this.initialize();
      const requestedAdmission = options.admission
        ?? await createScenarioDraftAdmissionReceipt(scenario, this.nextId("admission"));
      admission = await admitScenarioDraftReceipt(requestedAdmission, scenario);
      const prepared = prepareSimulation(scenario, profileId);
      if (options.packageReference) {
        assertRetainedScenarioPackageReference(options.packageReference);
        prepared.packageReference = structuredClone(options.packageReference);
      }
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
          admission,
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
      const completedAdmission = assertMatchingScenarioDraftAdmissionReceipt(
        admission,
        response.admission,
      );
      if (response.backend !== pack.prepared.capabilityManifest.engine.id) {
        throw new Error("Browser simulation completion provenance is invalid.");
      }
      try {
        const record = response.record;
        if (
          !Number.isSafeInteger(response.byteLength) ||
          response.byteLength < 12 ||
          response.byteLength > response.recordBuffer.byteLength ||
          response.byteLength > MAX_VECTOR_RECORD_BYTES
        ) {
          throw new Error("Browser simulation completion record length is invalid.");
        }
        if (
          record.manifest.recordId !== response.recordId ||
          record.manifest.contentDigest !== response.contentDigest
        ) {
          throw new Error("Browser simulation completion record identity is invalid.");
        }
        return {
          result: record.result,
          record,
          admission: completedAdmission,
          serializedRecord: response.recordBuffer.slice(0, response.byteLength),
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

  async openRecord(
    buffer: ArrayBuffer,
    byteLength = buffer.byteLength,
    options: {
      compiledModelPack?: Readonly<CompiledModelPack>;
      timeoutMs?: number;
    } = {},
  ): Promise<OpenedVectorRecord> {
    if (this.activeRunId || this.preparing) {
      throw new Error("A browser simulation run or record verification is already active.");
    }
    if (
      !Number.isSafeInteger(byteLength) ||
      byteLength < 12 ||
      byteLength > buffer.byteLength ||
      byteLength > MAX_VECTOR_RECORD_BYTES
    ) {
      throw new Error("VECTOR record length is out of bounds.");
    }
    this.preparing = true;
    try {
      await this.initialize();
      const requestId = this.nextId("open-record");
      const recordBuffer = buffer.slice(0, byteLength);
      const response = await this.request(
        {
          protocol: BROWSER_RUNTIME_PROTOCOL,
          requestId,
          type: "open-record",
          recordBuffer,
          byteLength,
          ...(options.compiledModelPack
            ? { compiledModelPack: options.compiledModelPack }
            : {}),
        },
        (message) => message.type === "record-opened",
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        [recordBuffer],
      );
      if (response.type !== "record-opened") {
        throw new Error("Browser record verification ended without an admitted record.");
      }
      return response.record;
    } finally {
      this.preparing = false;
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
