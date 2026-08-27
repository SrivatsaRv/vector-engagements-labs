import assert from "node:assert/strict";
import test from "node:test";
import { EngineSession, runEngine } from "../lib/engine/core.ts";
import { BrowserSimulationClient } from "../lib/runtime/browser-simulation-client.ts";
import { adaptPreparedSimulation, verifyRuntimeModelPack } from "../lib/runtime/model-pack-adapter.ts";
import {
  BROWSER_RUNTIME_PROTOCOL,
  BROWSER_RUNTIME_PROTOCOL_VERSION,
  isRuntimeRequest,
} from "../lib/runtime/protocol.ts";
import { prepareSimulation } from "../lib/simulation.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";

test("browser runtime protocol identity and message admission are versioned", () => {
  assert.equal(BROWSER_RUNTIME_PROTOCOL, "vector.browser-runtime.v1");
  assert.equal(BROWSER_RUNTIME_PROTOCOL_VERSION, 1);
  assert.equal(
    isRuntimeRequest({
      protocol: BROWSER_RUNTIME_PROTOCOL,
      requestId: "initialize-1",
      type: "initialize",
    }),
    true,
  );
  assert.equal(
    isRuntimeRequest({ protocol: "vector.browser-runtime.v2", requestId: "x", type: "run" }),
    false,
  );
  assert.equal(
    isRuntimeRequest({
      protocol: BROWSER_RUNTIME_PROTOCOL,
      requestId: "open-1",
      type: "open-record",
      recordBuffer: new ArrayBuffer(12),
      byteLength: 12,
    }),
    true,
  );
});

test("client delegates saved-record verification to the Worker", async () => {
  const opened = {
    manifest: { recordId: "worker-record", contentDigest: "a".repeat(64) },
    scenario: { id: "worker-scenario" },
    result: { outcome: "worker-verified" },
    events: { state: "AVAILABLE", items: [] },
    pictures: [],
    report: { schemaVersion: "vector.report.v1" },
  };
  const requests = [];
  class RecordWorker extends EventTarget {
    postMessage(message) {
      requests.push(message);
      const response = message.type === "initialize"
        ? { type: "initialized", state: "ready" }
        : { type: "record-opened", state: "completed", record: opened };
      queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", {
        data: {
          protocol: BROWSER_RUNTIME_PROTOCOL,
          requestId: message.requestId,
          ...response,
        },
      })));
    }
    terminate() {}
  }
  const client = new BrowserSimulationClient(() => new RecordWorker());
  const input = new ArrayBuffer(12);
  const result = await client.openRecord(input);
  assert.equal(result, opened);
  assert.equal(requests.at(-1).type, "open-record");
  assert.notEqual(requests.at(-1).recordBuffer, input, "the caller retains its uploaded buffer");
  client.terminate();
});

test("digest adapter detects compiled-pack mutation", async () => {
  const prepared = prepareSimulation(SCENARIO_LIBRARY[0].scenario);
  const pack = await adaptPreparedSimulation(prepared);
  assert.equal(await verifyRuntimeModelPack(pack), true);
  pack.prepared.engineScenario.seed += 1;
  assert.equal(await verifyRuntimeModelPack(pack), false);
});

test("client timeout terminates the stuck Worker and initializes a replacement", async () => {
  class StallingWorker extends EventTarget {
    terminated = false;

    postMessage(message) {
      if (message.type === "initialize") {
        queueMicrotask(() =>
          this.dispatchEvent(
            new MessageEvent("message", {
              data: {
                protocol: BROWSER_RUNTIME_PROTOCOL,
                requestId: message.requestId,
                type: "initialized",
                state: "ready",
              },
            }),
          ),
        );
      }
      if (message.type === "load-model-pack") {
        queueMicrotask(() =>
          this.dispatchEvent(
            new MessageEvent("message", {
              data: {
                protocol: BROWSER_RUNTIME_PROTOCOL,
                requestId: message.requestId,
                type: "model-pack-loaded",
                state: "ready",
                digest: message.pack.digest,
                cached: false,
              },
            }),
          ),
        );
      }
    }

    terminate() {
      this.terminated = true;
    }
  }

  const workers = [];
  const client = new BrowserSimulationClient(() => {
    const worker = new StallingWorker();
    workers.push(worker);
    return worker;
  });
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const stalled = client.run(scenario, "medium", { timeoutMs: 20 });
  await assert.rejects(
    client.run(scenario, "medium", { timeoutMs: 20 }),
    /already active/,
  );
  await assert.rejects(
    stalled,
    /timed out/,
  );
  assert.equal(workers[0].terminated, true);
  assert.equal(client.getState(), "terminated");
  await client.initialize();
  assert.equal(workers.length, 2);
  assert.equal(client.getState(), "ready");
  client.terminate();
});

test("client rejects a Worker crash and recovers with a fresh instance", async () => {
  class CrashingWorker extends EventTarget {
    terminated = false;

    postMessage(message) {
      if (message.type === "initialize" || message.type === "load-model-pack") {
        const response =
          message.type === "initialize"
            ? { type: "initialized", state: "ready" }
            : {
                type: "model-pack-loaded",
                state: "ready",
                digest: message.pack.digest,
                cached: false,
              };
        queueMicrotask(() =>
          this.dispatchEvent(
            new MessageEvent("message", {
              data: {
                protocol: BROWSER_RUNTIME_PROTOCOL,
                requestId: message.requestId,
                ...response,
              },
            }),
          ),
        );
      } else if (message.type === "run") {
        queueMicrotask(() => this.dispatchEvent(new Event("error")));
      }
    }

    terminate() {
      this.terminated = true;
    }
  }

  const workers = [];
  const client = new BrowserSimulationClient(() => {
    const worker = new CrashingWorker();
    workers.push(worker);
    return worker;
  });
  await assert.rejects(
    client.run(SCENARIO_LIBRARY[0].scenario),
    /crashed or lost its message channel/,
  );
  assert.equal(workers[0].terminated, true);
  assert.equal(client.getState(), "failed");
  await client.initialize();
  assert.equal(workers.length, 2);
  assert.equal(client.getState(), "ready");
  client.terminate();
});

for (const batchTicks of [1, 7, 128, 2_048]) {
  test(`TypeScript model clock is invariant at ${batchTicks} ticks per batch`, () => {
    const prepared = prepareSimulation(SCENARIO_LIBRARY[1].scenario);
    const expected = runEngine(prepared.engineScenario);
    const session = new EngineSession(prepared.engineScenario);
    let priorModelTime = -1;
    let boundaryCalls = 0;
    while (!session.isCompleted()) {
      const batch = session.runTicks(batchTicks);
      assert.ok(batch.modelTimeSeconds >= priorModelTime);
      assert.ok(batch.progress >= 0 && batch.progress <= 1);
      priorModelTime = batch.modelTimeSeconds;
      boundaryCalls += 1;
    }
    assert.deepEqual(session.result(), expected);
    assert.equal(
      boundaryCalls,
      Math.ceil(expected.diagnostics.integratedSteps / batchTicks),
    );
  });
}

test("completed Worker batch time uses the canonical off-grid terminal boundary", () => {
  const prepared = prepareSimulation(SCENARIO_LIBRARY[0].scenario);
  const scenario = structuredClone(prepared.engineScenario);
  scenario.fixedStepSeconds = 0.003;
  scenario.durationSeconds = 0.008;
  const weapon = scenario.entities.find((entity) => entity.kind === "GUIDED_WEAPON");
  weapon.weapon.launchTimeSeconds = 0.006;

  for (const batchTicks of [1, 2, 128]) {
    const session = new EngineSession(structuredClone(scenario));
    let completedBatch = session.runTicks(batchTicks);
    while (!completedBatch.completed) completedBatch = session.runTicks(batchTicks);
    const run = session.result();
    const completed = run.events.items.find(
      (event) => event.payload.kind === "RUN_COMPLETED",
    );
    assert.equal(completedBatch.integratedSteps, 3);
    assert.equal(completedBatch.modelTimeSeconds, 0.009);
    assert.equal(completedBatch.progress, 1);
    assert.equal(run.frames.at(-1).t, completedBatch.modelTimeSeconds);
    assert.equal(completed.modelTimeSeconds, completedBatch.modelTimeSeconds);
  }
});
