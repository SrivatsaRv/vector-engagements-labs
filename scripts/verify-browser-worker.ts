import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";
import { buildSync } from "esbuild";
import { adaptPreparedSimulation } from "../lib/runtime/model-pack-adapter.ts";
import { prepareSimulation } from "../lib/simulation.ts";
import {
  CURRENT_AIR_COMBAT_STUDY_IDS,
  SCENARIO_LIBRARY,
} from "../lib/scenarios.ts";
import { sha256HexSync } from "../lib/geospatial/digest.ts";
import { SCENARIO_PACKAGE_REFERENCE_SCHEMA_VERSION } from "../lib/scenario-package-reference.ts";
import {
  DEPLOYMENT_CAPABILITIES,
  createVerificationDeploymentCapabilities,
} from "../lib/runtime/deployment-capabilities.ts";
import { admitEnvironmentPack } from "../lib/geospatial/environment-pack.ts";
import { resolveBrowserWorkerAssets } from "./browser-worker-assets.ts";
import { bindVerificationTrackModelPack } from "../lib/engine/verification-track-fixture.ts";
import { TRACK_STORE_CAPACITY_WORKLOAD } from "../lib/validation/track-store-capacity.ts";
import { publishOrVerifyAirCombatEvidence } from "./air-combat-evidence-policy.ts";

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
  record?: {
    manifest: { scenarioPackage?: WorkerVerificationResult["packageReferences"][number] };
    report: { scenarioPackage?: WorkerVerificationResult["packageReferences"][number] };
  };
};

type WorkerVerificationResult = {
  scenarioId: string;
  control: boolean;
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
  targetEffectResult: string | null;
  packageReferences: Array<{
    schemaVersion: string;
    id: string;
    version: string;
    contentHash: string;
  }>;
  compiledDurationSeconds: number;
  recordOpened: boolean;
  evidenceSignature: AirCombatEvidenceSignature;
};

type ArchiveMemberSignature = {
  path: string;
  offset: number;
  byteLength: number;
  sha256: string;
  [key: string]: unknown;
};

type AirCombatEvidenceSignature = {
  archiveSchemaVersion: string;
  normalizedManifest: Record<string, unknown>;
  nonManifestMembers: ArchiveMemberSignature[];
};

const TRACKED_AIR_COMBAT_EVIDENCE_DIRECTORY = resolve(
  "fixtures/vector-record/issue-197",
);

function trackedAirCombatEvidenceSignature(
  archiveBytes: Buffer,
): AirCombatEvidenceSignature {
  assert.equal(archiveBytes.subarray(0, 8).toString("utf8"), "VECTOR1\0");
  const headerLength = archiveBytes.readUInt32LE(8);
  assert.ok(headerLength > 0 && 12 + headerLength <= archiveBytes.byteLength);
  const header = JSON.parse(
    archiveBytes.subarray(12, 12 + headerLength).toString("utf8"),
  ) as {
    schemaVersion: string;
    members: ArchiveMemberSignature[];
  };
  assert.ok(Array.isArray(header.members));
  for (const member of header.members) {
    assert.ok(
      member.offset >= 0
        && member.byteLength >= 0
        && 12 + headerLength + member.offset + member.byteLength <= archiveBytes.byteLength,
      `Tracked evidence member ${member.path} is out of bounds.`,
    );
    const memberBytes = archiveBytes.subarray(
      12 + headerLength + member.offset,
      12 + headerLength + member.offset + member.byteLength,
    );
    assert.equal(
      createHash("sha256").update(memberBytes).digest("hex"),
      member.sha256,
      `Tracked evidence member ${member.path} failed its archive digest.`,
    );
  }
  const manifestMember = header.members.find(({ path }) => path === "manifest.json");
  assert.ok(manifestMember, "Tracked evidence omitted manifest.json.");
  const manifestStart = 12 + headerLength + manifestMember.offset;
  const manifest = JSON.parse(
    archiveBytes.subarray(
      manifestStart,
      manifestStart + manifestMember.byteLength,
    ).toString("utf8"),
  ) as Record<string, unknown>;
  const normalizedManifest = { ...manifest };
  delete normalizedManifest.createdAt;
  delete normalizedManifest.contentDigest;
  return {
    archiveSchemaVersion: header.schemaVersion,
    normalizedManifest,
    nonManifestMembers: header.members.filter(({ path }) => path !== "manifest.json"),
  };
}

const evidenceFlagIndex = process.argv.indexOf("--write-air-combat-evidence");
const evidenceDirectoryArgument = evidenceFlagIndex >= 0
  ? process.argv[evidenceFlagIndex + 1]
  : undefined;
if (evidenceFlagIndex >= 0 && !evidenceDirectoryArgument) {
  throw new Error("--write-air-combat-evidence requires an output directory.");
}
const evidenceDirectory = evidenceDirectoryArgument
  ? resolve(evidenceDirectoryArgument)
  : undefined;

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

const studyDefinitions = CURRENT_AIR_COMBAT_STUDY_IDS.map((scenarioId) => {
  const definition = SCENARIO_LIBRARY.find((candidate) => candidate.id === scenarioId);
  if (!definition) throw new Error(`Air-combat study ${scenarioId} is missing.`);
  return definition;
});
const prepareStudyPack = async (
  definition: (typeof studyDefinitions)[number],
  scenario = definition.scenario,
) => {
  const packageReference = {
    schemaVersion: SCENARIO_PACKAGE_REFERENCE_SCHEMA_VERSION,
    id: definition.id,
    version: definition.version,
    contentHash: sha256HexSync(definition),
  };
  return adaptPreparedSimulation({
    ...prepareSimulation(scenario, scenario.profile, DEPLOYMENT_CAPABILITIES),
    packageReference,
  });
};
const studyPacks = await Promise.all(studyDefinitions.map(async (definition) => ({
  scenarioId: definition.id,
  control: false,
  pack: await prepareStudyPack(definition),
})));
const wvrDefinition = studyDefinitions.find(({ id }) => id === "a2a-defensive-break");
if (!wvrDefinition) throw new Error("WVR study is missing.");
const wvrControlScenario = structuredClone(wvrDefinition.scenario);
const wvrControlRequest = wvrControlScenario.airMission?.assignments[0]
  ?.storeTransferPlan?.requests[0];
if (!wvrControlRequest) throw new Error("WVR control has no release request.");
wvrControlRequest.requestedTimeSeconds = 20.65;
studyPacks.push({
  scenarioId: wvrDefinition.id,
  control: true,
  pack: await prepareStudyPack(wvrDefinition, wvrControlScenario),
});
const challenge = studyDefinitions.at(-1)!;
const scenario = challenge.scenario;
const pack = studyPacks[0]!.pack;
const challengePackageReference = {
  schemaVersion: SCENARIO_PACKAGE_REFERENCE_SCHEMA_VERSION,
  id: challenge.id,
  version: challenge.version,
  contentHash: sha256HexSync(challenge),
};
const stalePack = await adaptPreparedSimulation({
  ...prepareSimulation(
    scenario,
    scenario.profile,
    createVerificationDeploymentCapabilities(DEPLOYMENT_CAPABILITIES.engine.id),
  ),
  packageReference: challengePackageReference,
});
const verificationBase = prepareSimulation(scenario, scenario.profile, DEPLOYMENT_CAPABILITIES);
const verificationBinding = await bindVerificationTrackModelPack(verificationBase.engineScenario);
const verificationPack = await adaptPreparedSimulation({
  ...verificationBase,
  packageReference: challengePackageReference,
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
  const workerVerification: {
    results: WorkerVerificationResult[];
    states: string[];
    mainThreadTurns: number;
    wallMs: number;
    staleAdmissionError: string;
    verificationAdmissionError: string;
    evidenceArtifacts: Array<{
      scenarioId: string;
      control: boolean;
      base64: string;
    }>;
  } = await page.evaluate(
      async ({ studyPacks: selectedPacks, stalePack: rejectedPack, verificationPack: rejectedVerificationPack, workerUrl, emitEvidence }) => {
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
        const results: WorkerVerificationResult[] = [];
        const evidenceArtifacts: Array<{
          scenarioId: string;
          control: boolean;
          base64: string;
        }> = [];
        for (const selected of selectedPacks) {
          const loaded = waitFor((message) => message.type === "model-pack-loaded");
          send({ requestId: `load-${results.length}`, type: "load-model-pack", pack: selected.pack });
          await loaded;
          const completed = waitFor((message) => message.type === "completed", 20_000);
          send({
            requestId: `run-${results.length}`,
            type: "run",
            runId: `run-${results.length}`,
            packDigest: selected.pack.digest,
            scenarioRef: selected.pack.scenarioRef,
            batchTicks: 128,
            progressIntervalMs: 50,
          });
          const completion = await completed;
          const magic = new TextDecoder().decode(
            new Uint8Array(completion.recordBuffer, 0, 8),
          );
          const archive = new Uint8Array(
            completion.recordBuffer,
            0,
            completion.byteLength,
          );
          const archiveHeaderLength = new DataView(completion.recordBuffer).getUint32(8, true);
          const archiveHeader = JSON.parse(
            new TextDecoder().decode(archive.subarray(12, 12 + archiveHeaderLength)),
          ) as {
            schemaVersion: string;
            members: ArchiveMemberSignature[];
          };
          const memberBytes = (path: string) => {
            const member = archiveHeader.members.find((candidate) => candidate.path === path);
            if (!member) throw new Error(`Worker record omitted ${path}.`);
            const start = 12 + archiveHeaderLength + member.offset;
            return archive.subarray(start, start + member.byteLength);
          };
          const jsonMember = <T,>(path: string): T => JSON.parse(
            new TextDecoder().decode(memberBytes(path)),
          ) as T;
          const report = jsonMember<{
            result: { successful: boolean; termination: string; closestApproach: number; timeOfFlight: number };
            scenarioPackage?: WorkerVerificationResult["packageReferences"][number];
          }>("report.json");
          const manifest = jsonMember<Record<string, unknown> & {
            scenarioPackage?: WorkerVerificationResult["packageReferences"][number];
          }>("manifest.json");
          const compiled = jsonMember<{
            packageReference?: WorkerVerificationResult["packageReferences"][number];
            engineScenario: { durationSeconds: number };
          }>("compiled.json");
          const frames = memberBytes("frames.arrow");
          const frameHeaderLength = new DataView(
            frames.buffer,
            frames.byteOffset,
            frames.byteLength,
          ).getUint32(8, true);
          const frameHeader = JSON.parse(
            new TextDecoder().decode(frames.subarray(12, 12 + frameHeaderLength)),
          ) as {
            frames: Array<{ t: number; separationM: number; entityOffset: number; entityCount: number }>;
            entities: Array<{ id: string; lifecycle: string; phase: string }>;
          };
          const eventText = new TextDecoder().decode(memberBytes("events.jsonl")).trim();
          const events = (eventText ? eventText.split("\n") : []).map((line) => JSON.parse(line)) as Array<{
            payload: {
              kind: string;
              weaponId?: string;
              targetId?: string;
              to?: string;
              targetEffect?: string;
              closestApproachM?: number;
              interceptRadiusM?: number;
              commit?: { result?: string };
            };
          }>;
          const terminalEvent = events.find(({ payload }) => payload.kind === "WEAPON_TERMINATED");
          const effectEvent = events.find(({ payload }) => payload.kind === "TARGET_EFFECT_COMMITTED");
          const finalFrame = frameHeader.frames.at(-1);
          const finalEntities = finalFrame
            ? frameHeader.entities.slice(finalFrame.entityOffset, finalFrame.entityOffset + finalFrame.entityCount)
            : [];
          const terminalTarget = finalEntities.find(({ id }) => id === terminalEvent?.payload.targetId);
          const terminalWeapon = finalEntities.find(({ id }) => id === terminalEvent?.payload.weaponId);
          const packageReferences = [
            manifest.scenarioPackage,
            report.scenarioPackage,
            compiled.packageReference,
          ].filter((reference): reference is WorkerVerificationResult["packageReferences"][number] => Boolean(reference));
          const normalizedManifest = { ...manifest };
          delete normalizedManifest.createdAt;
          delete normalizedManifest.contentDigest;
          const evidenceSignature: AirCombatEvidenceSignature = {
            archiveSchemaVersion: archiveHeader.schemaVersion,
            normalizedManifest,
            nonManifestMembers: archiveHeader.members.filter(
              ({ path }) => path !== "manifest.json",
            ),
          };
          const recordBufferToOpen = completion.recordBuffer.slice(0, completion.byteLength);
          const recordOpened = waitFor((message) => message.type === "record-opened", 20_000);
          worker.postMessage(
            {
              protocol,
              requestId: `open-record-${results.length}`,
              type: "open-record",
              recordBuffer: recordBufferToOpen,
              byteLength: completion.byteLength,
            },
            [recordBufferToOpen],
          );
          const opened = await recordOpened;
          if (opened.record?.manifest.scenarioPackage) {
            packageReferences.push(opened.record.manifest.scenarioPackage);
          }
          if (opened.record?.report.scenarioPackage) {
            packageReferences.push(opened.record.report.scenarioPackage);
          }
          const transferredByteLength = completion.recordBuffer.byteLength;
          if (emitEvidence) {
            const evidenceBytes = new Uint8Array(
              completion.recordBuffer,
              0,
              completion.byteLength,
            );
            let evidenceBinary = "";
            for (let offset = 0; offset < evidenceBytes.length; offset += 32_768) {
              evidenceBinary += String.fromCharCode(
                ...evidenceBytes.subarray(offset, offset + 32_768),
              );
            }
            evidenceArtifacts.push({
              scenarioId: selected.scenarioId,
              control: selected.control,
              base64: btoa(evidenceBinary),
            });
          }
          worker.postMessage(
            { protocol, requestId: `recycle-${results.length}`, type: "recycle-buffer", buffer: completion.recordBuffer },
            [completion.recordBuffer],
          );
          results.push({
            scenarioId: selected.scenarioId,
            control: selected.control,
            backend: completion.backend,
            recordId: completion.recordId,
            boundaryCalls: completion.boundaryCalls,
            byteLength: completion.byteLength,
            magic,
            states: [],
            mainThreadTurns: 0,
            wallMs: 0,
            frameCount: frameHeader.frames.length,
            staleAdmissionError: "",
            verificationAdmissionError: "",
            transferredByteLength,
            detachedAfterRecycle: completion.recordBuffer.byteLength === 0,
            termination: report.result.termination,
            successful: report.result.successful,
            timeOfFlightSeconds: report.result.timeOfFlight,
            closestApproachM: report.result.closestApproach,
            finalSeparationM: finalFrame?.separationM ?? Number.NaN,
            terminalEvent: terminalEvent?.payload ?? null,
            terminalWeaponLifecycle: terminalWeapon?.lifecycle ?? null,
            terminalTargetLifecycle: terminalTarget?.lifecycle ?? null,
            targetEffectResult: effectEvent?.payload.commit?.result ?? null,
            packageReferences,
            compiledDurationSeconds: compiled.engineScenario.durationSeconds,
            recordOpened: Boolean(opened.record),
            evidenceSignature,
          });
        }
        clearInterval(timer);
        worker.terminate();
        return {
          results,
          states,
          mainThreadTurns,
          wallMs: performance.now() - startedAt,
          staleAdmissionError,
          verificationAdmissionError,
          evidenceArtifacts,
        };
      },
      {
        studyPacks,
        stalePack,
        verificationPack,
        workerUrl: `${origin}/assets/${workerName}`,
        emitEvidence: Boolean(evidenceDirectory),
      },
    );
  assert.ok(workerVerification.states.includes("ready"));
  assert.ok(workerVerification.states.includes("running"));
  assert.ok(workerVerification.states.includes("completed"));
  assert.ok(workerVerification.states.includes("failed"));
  assert.ok(workerVerification.mainThreadTurns > 0, "main thread did not remain responsive");
  assert.match(workerVerification.staleAdmissionError, /capability-manifest-stale/);
  assert.match(workerVerification.verificationAdmissionError, /capability-manifest-stale/);
  const expectedRuns = [
    { scenarioId: "a2a-crossing-intercept", control: false, duration: 100, effect: "DEGRADED", time: 72.95, closest: 19.900251, target: "ACTIVE" },
    { scenarioId: "a2a-defensive-break", control: false, duration: 45, effect: "KILL", time: 28.4, closest: 3.745229, target: "TERMINATED" },
    { scenarioId: "a2a-high-energy-crossing-challenge", control: false, duration: 140, effect: "NO_EFFECT", time: 114.7, closest: 24.947303, target: "ACTIVE" },
    { scenarioId: "a2a-defensive-break", control: true, duration: 45, effect: "NO_EFFECT", time: 28.8, closest: 23.746881, target: "ACTIVE" },
  ];
  assert.equal(workerVerification.results.length, expectedRuns.length);
  for (const [index, result] of workerVerification.results.entries()) {
    const expected = expectedRuns[index]!;
    const definition = studyDefinitions.find(({ id }) => id === expected.scenarioId)!;
    const packageReference = {
      schemaVersion: SCENARIO_PACKAGE_REFERENCE_SCHEMA_VERSION,
      id: definition.id,
      version: definition.version,
      contentHash: sha256HexSync(definition),
    };
    assert.equal(result.scenarioId, expected.scenarioId);
    assert.equal(result.control, expected.control);
    assert.match(result.recordId, /^[a-f0-9]{64}$/);
    assert.equal(result.magic, "VECTOR1\0");
    assert.ok(result.byteLength > 1_000);
    assert.ok(result.transferredByteLength >= result.byteLength);
    assert.equal(result.detachedAfterRecycle, true);
    assert.equal(result.backend, DEPLOYMENT_CAPABILITIES.engine.id);
    assert.ok(result.boundaryCalls > 1);
    assert.equal(result.termination, "weapon_intercept");
    assert.equal(result.successful, true);
    assert.equal(result.timeOfFlightSeconds, expected.time);
    assert.equal(Number(result.closestApproachM.toFixed(6)), expected.closest);
    assert.equal(result.terminalEvent?.to, "INTERCEPT");
    assert.equal(result.terminalEvent?.closestApproachM, expected.closest);
    assert.equal(result.terminalEvent?.interceptRadiusM, 25);
    assert.equal(result.terminalWeaponLifecycle, "TERMINATED");
    assert.equal(result.terminalTargetLifecycle, expected.target);
    assert.equal(result.targetEffectResult, expected.effect);
    assert.equal(result.compiledDurationSeconds, expected.duration);
    assert.equal(result.recordOpened, true);
    assert.deepEqual(result.packageReferences, Array.from({ length: 5 }, () => packageReference));
  }

  const evidenceInventory = {
    schemaVersion: "vector.air-combat-study-evidence.v1",
    artifacts: workerVerification.results.map((result) => ({
      filename: `${result.scenarioId}${result.control ? "-release-20.65-control" : ""}.vector`,
      scenarioId: result.scenarioId,
      control: result.control,
      recordId: result.recordId,
      byteLength: result.byteLength,
      packageReference: result.packageReferences[0],
      compiledDurationSeconds: result.compiledDurationSeconds,
      termination: result.termination,
      targetEffectResult: result.targetEffectResult,
      timeOfFlightSeconds: result.timeOfFlightSeconds,
      closestApproachM: Number(result.closestApproachM.toFixed(6)),
      terminalWeaponLifecycle: result.terminalWeaponLifecycle,
      terminalTargetLifecycle: result.terminalTargetLifecycle,
    })),
  };
  const generatedEvidence = evidenceInventory.artifacts.map((artifact, index) => ({
    filename: artifact.filename,
    byteLength: artifact.byteLength,
    archiveBytes: evidenceDirectory
      ? Buffer.from(workerVerification.evidenceArtifacts[index]!.base64, "base64")
      : Buffer.alloc(0),
    signature: workerVerification.results[index]!.evidenceSignature,
  }));
  publishOrVerifyAirCombatEvidence({
    trackedDirectory: TRACKED_AIR_COMBAT_EVIDENCE_DIRECTORY,
    evidenceDirectory,
    inventory: evidenceInventory,
    generated: generatedEvidence,
    signatureOf: trackedAirCombatEvidenceSignature,
  });

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
    `${JSON.stringify({
      workerAsset: workerName,
      environmentWorkerAsset: environmentWorkerName,
      backend: {
        results: workerVerification.results.map((result) => {
          const { evidenceSignature, ...publicResult } = result;
          void evidenceSignature;
          return publicResult;
        }),
        states: workerVerification.states,
        mainThreadTurns: workerVerification.mainThreadTurns,
        wallMs: workerVerification.wallMs,
        staleAdmissionError: workerVerification.staleAdmissionError,
        verificationAdmissionError: workerVerification.verificationAdmissionError,
      },
      cancellation,
      trackStoreCapacity,
    })}\n`,
  );
} finally {
  await browser.close();
  await new Promise<void>((resolveClose, rejectClose) =>
    server.close((error) => (error ? rejectClose(error) : resolveClose())),
  );
}
