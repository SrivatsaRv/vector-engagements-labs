import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";
import { adaptPreparedSimulation } from "../lib/runtime/model-pack-adapter.ts";
import { prepareSimulation } from "../lib/simulation.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { createVerificationDeploymentCapabilities } from "../lib/runtime/deployment-capabilities.ts";
import { createPhaseAEnvironmentPack } from "../lib/geospatial/environment-pack.ts";
import { PUBLIC_INSTALLATIONS } from "../lib/installations.ts";
import { getStudyArea, getWeatherPreset } from "../lib/study-areas.ts";
import { resolveBrowserWorkerAssets } from "./browser-worker-assets.ts";

type RuntimeMessage = {
  type: string;
  state: string;
  backend: "typescript" | "rust-wasm";
  recordId: string;
  boundaryCalls: number;
  byteLength: number;
  recordBuffer: ArrayBuffer;
};

type ParitySample = {
  t: number;
  separationM: number;
  speedMps: number;
  position: number[];
  lifecycle: string;
  phase: string;
};

type WorkerVerificationResult = {
  backend: "typescript" | "rust-wasm";
  recordId: string;
  boundaryCalls: number;
  byteLength: number;
  magic: string;
  states: string[];
  mainThreadTurns: number;
  wallMs: number;
  frameCount: number;
  paritySamples: ParitySample[];
  transferredByteLength: number;
  detachedAfterRecycle: boolean;
};

const {
  assetDirectory,
  simulationWorkerName: workerName,
  environmentWorkerName,
} = resolveBrowserWorkerAssets();
const workerBytes = readFileSync(resolve(assetDirectory, workerName));
const environmentWorkerBytes = readFileSync(resolve(assetDirectory, environmentWorkerName));
const server = createServer((request, response) => {
  const assets = new Map([
    [`/assets/${workerName}`, workerBytes],
    [`/assets/${environmentWorkerName}`, environmentWorkerBytes],
  ]);
  const bytes = assets.get(request.url ?? "");
  if (bytes) {
    response.writeHead(200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(bytes);
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end("<!doctype html><title>VECTOR Worker verification</title>");
});
await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Worker test server failed.");
const origin = `http://127.0.0.1:${address.port}`;
const chromePath =
  process.env.VECTOR_CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath: chromePath, headless: true });

const packs = await Promise.all(
  (["typescript", "rust-wasm"] as const).map(async (backend) => {
    const scenario = SCENARIO_LIBRARY[0].scenario;
    const capabilities = createVerificationDeploymentCapabilities(backend);
    return {
      backend,
      pack: await adaptPreparedSimulation(
        prepareSimulation(scenario, scenario.profile, capabilities),
      ),
    };
  }),
);
const phaseAArea = getStudyArea("north-punjab");
const phaseAPack = createPhaseAEnvironmentPack({
  studyArea: phaseAArea,
  weatherPreset: getWeatherPreset(phaseAArea, "north-punjab-clear"),
  installations: PUBLIC_INSTALLATIONS,
});

try {
  const page = await browser.newPage();
  await page.goto(origin);
  await page.evaluate("globalThis.__name = (target) => target");
  const environmentVerification = await page.evaluate(
    async ({ workerUrl, pack }) => {
      const worker = new Worker(workerUrl, { type: "module" });
      const receive = (type: string, requestId: string) => new Promise<Record<string, unknown>>((resolveWait, rejectWait) => {
        const timeout = setTimeout(() => rejectWait(new Error(`Environment Worker ${type} timed out.`)), 5_000);
        const listener = (event: MessageEvent<Record<string, unknown>>) => {
          if (event.data?.requestId !== requestId || event.data.type !== type) return;
          clearTimeout(timeout);
          worker.removeEventListener("message", listener);
          resolveWait(event.data);
        };
        worker.addEventListener("message", listener);
      });
      const loaded = receive("loaded", "environment-load");
      worker.postMessage({ type: "load", requestId: "environment-load", pack });
      await loaded;
      const sampled = receive("sampled", "environment-sample");
      worker.postMessage({
        type: "sample",
        requestId: "environment-sample",
        digest: pack.identity.digest,
        queries: [{ eastM: 0, northM: 0, upM: 8_500, modelTimeSeconds: 0 }],
      });
      const response = await sampled;
      worker.terminate();
      return response;
    },
    { workerUrl: `${origin}/assets/${environmentWorkerName}`, pack: phaseAPack },
  );
  assert.equal(environmentVerification.type, "sampled");
  const environmentSamples = environmentVerification.samples as Array<{ terrain: { elevation: { datum: string; valueM: number } } }>;
  assert.equal(environmentSamples[0]?.terrain.elevation.datum, "MSL");
  assert.equal(environmentSamples[0]?.terrain.elevation.valueM, phaseAArea.surfaceElevationM);
  const results: WorkerVerificationResult[] = [];
  for (const { pack } of packs) {
    const result = await page.evaluate(
      async ({ pack: selectedPack, workerUrl }) => {
        const protocol = "vector.browser-runtime.v1";
        const worker = new Worker(workerUrl, { type: "module" });
        const states: string[] = [];
        let mainThreadTurns = 0;
        const startedAt = performance.now();
        const timer = setInterval(() => {
          mainThreadTurns += 1;
        }, 1);
        const send = (message: Record<string, unknown>) =>
          worker.postMessage({ protocol, ...message });
        const waitFor = (
          accept: (message: RuntimeMessage) => boolean,
          timeoutMs = 10_000,
        ) =>
          new Promise<RuntimeMessage>((resolveWait, rejectWait) => {
            const timeout = setTimeout(() => {
              worker.removeEventListener("message", receive);
              rejectWait(new Error("Worker verification timed out."));
            }, timeoutMs);
            const receive = (event: MessageEvent) => {
              const message = event.data as RuntimeMessage;
              if (message?.state) states.push(message.state);
              if (!accept(message)) return;
              clearTimeout(timeout);
              worker.removeEventListener("message", receive);
              resolveWait(message);
            };
            worker.addEventListener("message", receive);
          });
        const initialized = waitFor((message) => message.type === "initialized");
        send({ requestId: "initialize", type: "initialize" });
        await initialized;
        const loaded = waitFor((message) => message.type === "model-pack-loaded");
        send({ requestId: "load", type: "load-model-pack", pack: selectedPack });
        await loaded;
        const completed = waitFor((message) => message.type === "completed", 20_000);
        send({
          requestId: "run",
          type: "run",
          runId: "run-1",
          packDigest: selectedPack.digest,
          scenarioRef: selectedPack.scenarioRef,
          batchTicks: 128,
          progressIntervalMs: 50,
        });
        const completion = await completed;
        clearInterval(timer);
        const magic = new TextDecoder().decode(
          new Uint8Array(completion.recordBuffer, 0, 8),
        );
        const archive = new Uint8Array(
          completion.recordBuffer,
          0,
          completion.byteLength,
        );
        const archiveHeaderLength = new DataView(completion.recordBuffer).getUint32(
          8,
          true,
        );
        const archiveHeader = JSON.parse(
          new TextDecoder().decode(
            archive.subarray(12, 12 + archiveHeaderLength),
          ),
        ) as {
          members: Array<{ path: string; offset: number; byteLength: number }>;
        };
        const framesMember = archiveHeader.members.find(
          (member) => member.path === "frames.arrow",
        );
        if (!framesMember) throw new Error("Worker record omitted frames.arrow.");
        const framesStart = 12 + archiveHeaderLength + framesMember.offset;
        const frames = archive.subarray(
          framesStart,
          framesStart + framesMember.byteLength,
        );
        const frameHeaderLength = new DataView(
          frames.buffer,
          frames.byteOffset,
          frames.byteLength,
        ).getUint32(8, true);
        const frameHeader = JSON.parse(
          new TextDecoder().decode(
            frames.subarray(12, 12 + frameHeaderLength),
          ),
        ) as {
          columns: string[];
          frames: Array<{
            t: number;
            separationM: number;
            primaryWeaponId: string;
            entityOffset: number;
            entityCount: number;
          }>;
          entities: Array<{ id: string; lifecycle: string; phase: string }>;
        };
        const numeric = new DataView(
          frames.buffer,
          frames.byteOffset + 12 + frameHeaderLength,
        );
        const numericValue = (column: string, entityIndex: number) =>
          numeric.getFloat64(
            (frameHeader.columns.indexOf(column) * frameHeader.entities.length +
              entityIndex) *
              Float64Array.BYTES_PER_ELEMENT,
            true,
          );
        const checkpointIndexes = [
          0,
          Math.floor(frameHeader.frames.length / 2),
          frameHeader.frames.length - 1,
        ];
        const paritySamples = checkpointIndexes.map((frameIndex) => {
          const frame = frameHeader.frames[frameIndex];
          const entityIndex = frameHeader.entities.findIndex(
            (entity, index) =>
              index >= frame.entityOffset &&
              index < frame.entityOffset + frame.entityCount &&
              entity.id === frame.primaryWeaponId,
          );
          if (entityIndex < 0) throw new Error("Primary weapon sample is missing.");
          return {
            t: frame.t,
            separationM: frame.separationM,
            speedMps: numericValue("speedMps", entityIndex),
            position: [
              numericValue("positionX", entityIndex),
              numericValue("positionY", entityIndex),
              numericValue("positionZ", entityIndex),
            ],
            lifecycle: frameHeader.entities[entityIndex].lifecycle,
            phase: frameHeader.entities[entityIndex].phase,
          };
        });
        const transferredByteLength = completion.recordBuffer.byteLength;
        worker.postMessage(
          {
            protocol,
            requestId: "recycle",
            type: "recycle-buffer",
            buffer: completion.recordBuffer,
          },
          [completion.recordBuffer],
        );
        const detachedAfterRecycle = completion.recordBuffer.byteLength === 0;
        worker.terminate();
        return {
          backend: completion.backend,
          recordId: completion.recordId,
          boundaryCalls: completion.boundaryCalls,
          byteLength: completion.byteLength,
          magic,
          states,
          mainThreadTurns,
          wallMs: performance.now() - startedAt,
          frameCount: frameHeader.frames.length,
          paritySamples,
          transferredByteLength,
          detachedAfterRecycle,
        };
      },
      { pack, workerUrl: `${origin}/assets/${workerName}` },
    );
    results.push(result);
  }

  for (const result of results) {
    assert.match(result.recordId, /^[a-f0-9]{64}$/);
    assert.equal(result.magic, "VECTOR1\0");
    assert.ok(result.byteLength > 1_000);
    assert.ok(result.states.includes("ready"));
    assert.ok(result.states.includes("running"));
    assert.ok(result.states.includes("completed"));
    assert.ok(result.mainThreadTurns > 0, "main thread did not remain responsive");
    assert.ok(result.transferredByteLength >= result.byteLength);
    assert.equal(result.detachedAfterRecycle, true);
  }
  assert.equal(results[0].backend, "typescript");
  assert.equal(results[1].backend, "rust-wasm");
  assert.ok(results[0].boundaryCalls > 1);
  assert.equal(results[1].boundaryCalls, 1);
  assert.equal(results[0].frameCount, results[1].frameCount);
  const close = (left: number, right: number, tolerance: number, label: string) =>
    assert.ok(
      Math.abs(left - right) <= tolerance,
      `${label}: ${left} differed from ${right}`,
    );
  for (const [index, typescript] of results[0].paritySamples.entries()) {
    const rust = results[1].paritySamples[index];
    close(typescript.t, rust.t, 1e-9, `checkpoint ${index} time`);
    close(
      typescript.separationM,
      rust.separationM,
      1e-6,
      `checkpoint ${index} separation`,
    );
    close(typescript.speedMps, rust.speedMps, 1e-6, `checkpoint ${index} speed`);
    for (const [axis, value] of typescript.position.entries()) {
      close(value, rust.position[axis], 1e-6, `checkpoint ${index} position ${axis}`);
    }
    assert.equal(typescript.lifecycle, rust.lifecycle);
    assert.equal(typescript.phase, rust.phase);
  }

  const cancellation = await page.evaluate(
    async ({ pack, workerUrl }) => {
      const protocol = "vector.browser-runtime.v1";
      const worker = new Worker(workerUrl, { type: "module" });
      const messages: string[] = [];
      const waitFor = (accept: (message: RuntimeMessage) => boolean) =>
        new Promise<RuntimeMessage>((resolveWait) => {
          const receive = (event: MessageEvent) => {
            const message = event.data as RuntimeMessage;
            messages.push(message.type);
            if (!accept(message)) return;
            worker.removeEventListener("message", receive);
            resolveWait(message);
          };
          worker.addEventListener("message", receive);
        });
      let waiting = waitFor((message) => message.type === "initialized");
      worker.postMessage({ protocol, requestId: "i", type: "initialize" });
      await waiting;
      waiting = waitFor((message) => message.type === "model-pack-loaded");
      worker.postMessage({ protocol, requestId: "l", type: "load-model-pack", pack });
      await waiting;
      const progress = waitFor((message) => message.type === "progress");
      worker.postMessage({
        protocol,
        requestId: "r",
        type: "run",
        runId: "cancel-me",
        packDigest: pack.digest,
        scenarioRef: pack.scenarioRef,
        backend: "typescript",
        batchTicks: 1,
        progressIntervalMs: 50,
      });
      await progress;
      const paused = waitFor(
        (message) => message.type === "state" && message.state === "paused",
      );
      worker.postMessage({
        protocol,
        requestId: "p",
        type: "pause",
        runId: "cancel-me",
      });
      await paused;
      const resumed = waitFor(
        (message) => message.type === "state" && message.state === "running",
      );
      worker.postMessage({
        protocol,
        requestId: "u",
        type: "resume",
        runId: "cancel-me",
      });
      await resumed;
      await waitFor((message) => message.type === "progress");
      const cancelled = waitFor((message) => message.type === "cancelled");
      worker.postMessage({
        protocol,
        requestId: "c",
        type: "cancel",
        runId: "cancel-me",
      });
      const completion = await cancelled;
      worker.terminate();
      return { state: completion.state, messages };
    },
    { pack: packs[0].pack, workerUrl: `${origin}/assets/${workerName}` },
  );
  assert.equal(cancellation.state, "ready");
  assert.ok(cancellation.messages.includes("progress"));
  assert.ok(cancellation.messages.includes("state"));
  assert.ok(cancellation.messages.includes("cancelled"));

  process.stdout.write(
    `${JSON.stringify({ workerAsset: workerName, environmentWorkerAsset: environmentWorkerName, backends: results, cancellation })}\n`,
  );
} finally {
  await browser.close();
  await new Promise<void>((resolveClose, rejectClose) =>
    server.close((error) => (error ? rejectClose(error) : resolveClose())),
  );
}
