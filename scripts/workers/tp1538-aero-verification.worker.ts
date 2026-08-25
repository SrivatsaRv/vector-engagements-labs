import { parentPort } from "node:worker_threads";

import {
  createTp1538Evaluator,
  type Tp1538AeroAssemblyInput,
  type Tp1538AeroLookupRequest,
} from "../../lib/validation/tp1538-aero-verification.ts";

if (!parentPort) throw new Error("TP-1538 verification Worker requires a parent port.");

let evaluator: ReturnType<typeof createTp1538Evaluator> | null = null;

function exactKeys(value: unknown, expected: string[], label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} must have exact keys.`);
  }
}

parentPort.on("message", (message: unknown) => {
  let requestId = "UNIDENTIFIED";
  try {
    if (message && typeof message === "object" && !Array.isArray(message) && typeof (message as { requestId?: unknown }).requestId === "string") {
      requestId = (message as { requestId: string }).requestId;
    }
    if (!message || typeof message !== "object" || Array.isArray(message)) throw new Error("TP-1538 Worker message must be an object.");
    const schemaVersion = (message as { schemaVersion?: unknown }).schemaVersion;
    if (schemaVersion === "vector.tp1538-aero-worker-init.v1") {
      exactKeys(message, ["corpus", "expectedCorpusSha256", "requestId", "schemaVersion"], "TP-1538 Worker init");
      if (typeof message.requestId !== "string" || typeof message.expectedCorpusSha256 !== "string") throw new Error("TP-1538 Worker init identity is invalid.");
      evaluator = createTp1538Evaluator(message.corpus, message.expectedCorpusSha256);
      parentPort?.postMessage({ schemaVersion: "vector.tp1538-aero-worker-ready.v1", requestId, corpusSha256: evaluator.corpusSha256 });
      return;
    }
    if (schemaVersion === "vector.tp1538-aero-worker-evaluate.v1") {
      exactKeys(message, ["assemblyRequests", "lookupRequests", "requestId", "schemaVersion"], "TP-1538 Worker evaluation");
      if (!evaluator) throw new Error("TP-1538 Worker is not initialized.");
      if (!Array.isArray(message.lookupRequests) || !Array.isArray(message.assemblyRequests)
        || message.lookupRequests.length + message.assemblyRequests.length < 1
        || message.lookupRequests.length + message.assemblyRequests.length > 4096) throw new Error("TP-1538 Worker workload must contain 1 through 4,096 operations.");
      const lookupResults = (message.lookupRequests as Tp1538AeroLookupRequest[]).map((request) => evaluator?.lookup(request));
      const assemblyResults = (message.assemblyRequests as Tp1538AeroAssemblyInput[]).map((request) => evaluator?.assemble(request));
      parentPort?.postMessage({
        schemaVersion: "vector.tp1538-aero-worker-result.v1",
        requestId,
        corpusSha256: evaluator.corpusSha256,
        lookupResults,
        assemblyResults,
      });
      return;
    }
    throw new Error("TP-1538 Worker schema version is unknown.");
  } catch (error) {
    parentPort?.postMessage({
      schemaVersion: "vector.tp1538-aero-worker-error.v1",
      requestId,
      code: "TP1538_WORKER_REJECTED",
      message: error instanceof Error ? error.message : "Unknown TP-1538 Worker failure.",
    });
  }
});
