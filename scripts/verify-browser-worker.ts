import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";
import { buildSync } from "esbuild";
import { adaptPreparedSimulation } from "../lib/runtime/model-pack-adapter.ts";
import { prepareSimulation } from "../lib/simulation.ts";
import {
  HIGH_ENERGY_CROSSING_CHALLENGE_ID,
  SCENARIO_LIBRARY,
} from "../lib/scenarios.ts";
import {
  DEPLOYMENT_CAPABILITIES,
  createVerificationDeploymentCapabilities,
} from "../lib/runtime/deployment-capabilities.ts";
import { admitEnvironmentPack } from "../lib/geospatial/environment-pack.ts";
import { resolveBrowserWorkerAssets } from "./browser-worker-assets.ts";
import { bindVerificationTrackModelPack } from "../lib/engine/verification-track-fixture.ts";
import { TRACK_STORE_CAPACITY_WORKLOAD } from "../lib/validation/track-store-capacity.ts";

type RuntimeMessage = {
  type: string;
  state: string;
  code?: string;
  message?: string;
  backend: "typescript" | "rust-wasm";
  recordId: string;
  boundaryCalls: number;
  byteLength: number;
  recordBuffer: ArrayBuffer;
};

type WorkerVerificationResult = {
  backend: typeof DEPLOYMENT_CAPABILITIES.engine.id;
  recordId: string;
  boundaryCalls: number;
  byteLength: number;
  magic: string;
  states: string[];
  mainThreadTurns: number;
  wallMs: number;
  frameCount: number;
  staleAdmissionError: string;
  verificationAdmissionError: string;
  transferredByteLength: number;
  detachedAfterRecycle: boolean;
  termination: string;
  successful: boolean;
  timeOfFlightSeconds: number;
  closestApproachM: number;
  finalSeparationM: number;
  terminalEvent: {
    kind: string;
    weaponId?: string;
    targetId?: string;
    to?: string;
    targetEffect?: string;
    closestApproachM?: number;
    interceptRadiusM?: number;
  } | null;
  terminalWeaponLifecycle: string | null;
  terminalTargetLifecycle: string | null;
};

const {
  assetDirectory,
  simulationWorkerName: workerName,
  environmentWorkerName,
} = resolveBrowserWorkerAssets();
const workerBytes = readFileSync(resolve(assetDirectory, workerName));
const environmentWorkerBytes = readFileSync(resolve(assetDirectory, environmentWorkerName));
const trackStoreWorkerBytes = buildSync({
  entryPoints: [resolve("scripts/track-store-capacity.worker.ts")],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
}).outputFiles[0]!.contents;
const server = createServer((request, response) => {
  const assets = new Map([
    [`/assets/${workerName}`, workerBytes],
    [`/assets/${environmentWorkerName}`, environmentWorkerBytes],
    ["/assets/track-store-capacity.worker.js", trackStoreWorkerBytes],
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
const chromePath = process.env.VECTOR_CHROME_PATH ?? chromium.executablePath();
const browser = await chromium.launch({ executablePath: chromePath, headless: true });

const challenge = SCENARIO_LIBRARY.find(
  (definition) => definition.id === HIGH_ENERGY_CROSSING_CHALLENGE_ID,
);
if (!challenge) throw new Error("High-energy crossing challenge is missing.");
const scenario = challenge.scenario;
const pack = await adaptPreparedSimulation(
  prepareSimulation(scenario, scenario.profile, DEPLOYMENT_CAPABILITIES),
);
const stalePack = await adaptPreparedSimulation(
  prepareSimulation(
    scenario,
    scenario.profile,
    createVerificationDeploymentCapabilities(DEPLOYMENT_CAPABILITIES.engine.id),
  ),
);
const verificationBase = prepareSimulation(scenario, scenario.profile, DEPLOYMENT_CAPABILITIES);
const verificationBinding = await bindVerificationTrackModelPack(verificationBase.engineScenario);
const verificationPack = await adaptPreparedSimulation({
  ...verificationBase,
  engineScenario: verificationBinding.scenario,
  capabilityManifest: createVerificationDeploymentCapabilities(
    DEPLOYMENT_CAPABILITIES.engine.id,
    ["A2A"],
    [verificationBinding.pack.digest],
  ),
});
const regionalPack = admitEnvironmentPack({
  studyAreaId: "north-punjab",
  weatherPresetId: "north-punjab-clear",
}).pack;

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
      const cancelled = receive("failed", "environment-cancel");
      worker.postMessage({
        type: "sample",
        requestId: "environment-cancel",
        digest: pack.identity.digest,
        queries: Array.from({ length: 4096 }, () => ({ eastM: 0, northM: 0, upM: 8_500, modelTimeSeconds: 0 })),
      });
      setTimeout(() => worker.postMessage({ type: "cancel", requestId: "environment-cancel" }), 0);
      const cancellation = await cancelled;
      const sampled = receive("sampled", "environment-sample");
      worker.postMessage({
        type: "sample",
        requestId: "environment-sample",
        digest: pack.identity.digest,
        queries: [{ eastM: 0, northM: 0, upM: 8_500, modelTimeSeconds: 0 }],
      });
      const response = await sampled;
      worker.terminate();
      return { response, cancellation };
    },
    { workerUrl: `${origin}/assets/${environmentWorkerName}`, pack: regionalPack },
  );
  assert.equal((environmentVerification.response as Record<string, unknown>).type, "sampled");
  assert.equal((environmentVerification.cancellation as Record<string, unknown>).code, "cancelled");
  const environmentSamples = (environmentVerification.response as Record<string, unknown>).samples as Array<{ terrain: { elevation: { datum: string; valueM: number } } }>;
  assert.equal(environmentSamples[0]?.terrain.elevation.datum, "MSL");
  assert.ok(Number.isFinite(environmentSamples[0]?.terrain.elevation.valueM));
  const result: WorkerVerificationResult = await page.evaluate(
      async ({ pack: selectedPack, stalePack: rejectedPack, verificationPack: rejectedVerificationPack, workerUrl }) => {
        const protocol = "vector.browser-runtime.v1";
        const worker = new Worker(workerUrl, { name: "vector-simulation-runtime" });
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
              if (message?.type === "failed") {
                clearTimeout(timeout);
                worker.removeEventListener("message", receive);
                rejectWait(
                  new Error(
                    `Worker verification failed: ${message.code ?? "unknown"}: ${message.message ?? "No message."}`,
                  ),
                );
                return;
              }
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
        const staleAdmission = waitFor(
          (message) => message.type === "model-pack-loaded",
        );
        send({ requestId: "stale-load", type: "load-model-pack", pack: rejectedPack });
        const staleAdmissionError = await staleAdmission.then(
          () => "unexpected model-pack admission",
          (error: Error) => error.message,
        );
        const verificationAdmission = waitFor(
          (message) => message.type === "model-pack-loaded",
        );
        send({ requestId: "verification-load", type: "load-model-pack", pack: rejectedVerificationPack });
        const verificationAdmissionError = await verificationAdmission.then(
          () => "unexpected verification-pack admission",
          (error: Error) => error.message,
        );
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
        const reportMember = archiveHeader.members.find(
          (member) => member.path === "report.json",
        );
        if (!reportMember) throw new Error("Worker record omitted report.json.");
        const eventsMember = archiveHeader.members.find(
          (member) => member.path === "events.jsonl",
        );
        if (!eventsMember) throw new Error("Worker record omitted events.jsonl.");
        const reportStart = 12 + archiveHeaderLength + reportMember.offset;
        const report = JSON.parse(
          new TextDecoder().decode(
            archive.subarray(reportStart, reportStart + reportMember.byteLength),
          ),
        ) as {
          result: {
            successful: boolean;
            termination: string;
            closestApproach: number;
            timeOfFlight: number;
          };
        };
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
        const eventsStart = 12 + archiveHeaderLength + eventsMember.offset;
        const events = new TextDecoder().decode(
          archive.subarray(eventsStart, eventsStart + eventsMember.byteLength),
        ).trim().split("\n").map((line) => JSON.parse(line)) as Array<{
          payload: {
            kind: string;
            weaponId?: string;
            targetId?: string;
            to?: string;
            targetEffect?: string;
            closestApproachM?: number;
            interceptRadiusM?: number;
          };
        }>;
        const terminalEvent = events.find((event) => event.payload.kind === "WEAPON_TERMINATED");
        const finalFrame = frameHeader.frames.at(-1);
        const finalEntities = finalFrame
          ? frameHeader.entities.slice(finalFrame.entityOffset, finalFrame.entityOffset + finalFrame.entityCount)
          : [];
        const terminalTarget = finalEntities.find((entity) => entity.id === terminalEvent?.payload.targetId);
        const terminalWeapon = finalEntities.find((entity) => entity.id === terminalEvent?.payload.weaponId);
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
          staleAdmissionError,
          verificationAdmissionError,
          transferredByteLength,
          detachedAfterRecycle,
          termination: report.result.termination,
          successful: report.result.successful,
          timeOfFlightSeconds: report.result.timeOfFlight,
          closestApproachM: report.result.closestApproach,
          finalSeparationM: finalFrame?.separationM ?? Number.NaN,
          terminalEvent: terminalEvent?.payload ?? null,
          terminalWeaponLifecycle: terminalWeapon?.lifecycle ?? null,
          terminalTargetLifecycle: terminalTarget?.lifecycle ?? null,
        };
      },
      { pack, stalePack, verificationPack, workerUrl: `${origin}/assets/${workerName}` },
    );

  assert.match(result.recordId, /^[a-f0-9]{64}$/);
  assert.equal(result.magic, "VECTOR1\0");
  assert.ok(result.byteLength > 1_000);
  assert.ok(result.states.includes("ready"));
  assert.ok(result.states.includes("running"));
  assert.ok(result.states.includes("completed"));
  assert.ok(result.mainThreadTurns > 0, "main thread did not remain responsive");
  assert.ok(result.transferredByteLength >= result.byteLength);
  assert.equal(result.detachedAfterRecycle, true);
  assert.equal(result.backend, DEPLOYMENT_CAPABILITIES.engine.id);
  assert.ok(result.boundaryCalls > 1);
  assert.ok(result.states.includes("failed"));
  assert.match(result.staleAdmissionError, /capability-manifest-stale/);
  assert.match(result.verificationAdmissionError, /capability-manifest-stale/);
  assert.equal(result.termination, "weapon_intercept");
  assert.equal(result.successful, true);
  assert.equal(result.timeOfFlightSeconds, 131.9);
  assert.ok(result.closestApproachM > 21 && result.closestApproachM < 22);
  assert.ok(result.finalSeparationM > 21 && result.finalSeparationM < 22);
  assert.equal(result.terminalEvent?.to, "INTERCEPT");
  assert.equal(result.terminalEvent?.targetEffect, "NOT_MODELLED");
  assert.equal(result.terminalEvent?.closestApproachM, 21.836104);
  assert.equal(result.terminalEvent?.interceptRadiusM, 25);
  assert.equal(result.terminalWeaponLifecycle, "TERMINATED");
  assert.equal(result.terminalTargetLifecycle, "ACTIVE");

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
    { pack, workerUrl: `${origin}/assets/${workerName}` },
  );
  assert.equal(cancellation.state, "ready");
  assert.ok(cancellation.messages.includes("progress"));
  assert.ok(cancellation.messages.includes("state"));
  assert.ok(cancellation.messages.includes("cancelled"));

  const trackStoreCapacity = await page.evaluate(async ({ workerUrl }) => {
    const worker = new Worker(workerUrl, { type: "module" });
    const receive = (type: string, runId: string) => new Promise<Record<string, unknown>>((resolveWait, rejectWait) => {
      const timeout = setTimeout(() => rejectWait(new Error(`TrackStore Worker ${type} timed out.`)), 10_000);
      const listener = (event: MessageEvent<Record<string, unknown>>) => {
        if (event.data.type !== type || event.data.runId !== runId) return;
        clearTimeout(timeout);
        worker.removeEventListener("message", listener);
        resolveWait(event.data);
      };
      worker.addEventListener("message", listener);
    });
    const firstProgress = receive("progress", "cancel-capacity");
    worker.postMessage({ type: "run", runId: "cancel-capacity" });
    await firstProgress;
    const cancelled = receive("cancelled", "cancel-capacity");
    worker.postMessage({ type: "cancel", runId: "cancel-capacity" });
    await cancelled;
    const completed = receive("completed", "recover-capacity");
    worker.postMessage({ type: "run", runId: "recover-capacity" });
    const result = await completed;
    worker.terminate();
    return result;
  }, { workerUrl: `${origin}/assets/track-store-capacity.worker.js` });
  assert.equal(trackStoreCapacity.workloadId, TRACK_STORE_CAPACITY_WORKLOAD.id);
  assert.equal(trackStoreCapacity.workloadVersion, TRACK_STORE_CAPACITY_WORKLOAD.version);
  assert.equal(trackStoreCapacity.retainedTracks, TRACK_STORE_CAPACITY_WORKLOAD.expected.retainedTracks);
  assert.equal(trackStoreCapacity.transitionCount, TRACK_STORE_CAPACITY_WORKLOAD.expected.lifecycleTransitions);
  assert.equal(trackStoreCapacity.canonicalPictures, 2);
  assert.deepEqual(trackStoreCapacity.tracksPerPicture, TRACK_STORE_CAPACITY_WORKLOAD.sides.map(() => TRACK_STORE_CAPACITY_WORKLOAD.tracksPerSide));
  const canonicalFrameBytes = trackStoreCapacity.canonicalFrameBytes;
  if (typeof canonicalFrameBytes !== "number") throw new Error("TrackStore Worker omitted canonical frame bytes.");
  assert.ok(canonicalFrameBytes > 0);
  assert.equal(trackStoreCapacity.parityDigest, TRACK_STORE_CAPACITY_WORKLOAD.expected.parityDigest);

  process.stdout.write(
    `${JSON.stringify({ workerAsset: workerName, environmentWorkerAsset: environmentWorkerName, backend: result, cancellation, trackStoreCapacity })}\n`,
  );
} finally {
  await browser.close();
  await new Promise<void>((resolveClose, rejectClose) =>
    server.close((error) => (error ? rejectClose(error) : resolveClose())),
  );
}
