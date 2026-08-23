import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { runRustWasmGenericAamVerification } from "../lib/engine/backend.ts";
import {
  GENERIC_AAM_CORPUS,
  assertGenericAamVerificationRun,
  genericAamClosestApproach,
  genericAamControlLagStep,
  genericAamLosRate,
  genericAamVerificationInput,
  runGenericAamVerification,
  verifyGenericAamCorpus,
  verifyGenericAamWorkload,
} from "../lib/validation/generic-aam-verification.ts";

const source = readFileSync(new URL("../fixtures/public-reference/nasa-tm-109057/19940031931.pdf", import.meta.url));
const workloadBytes = readFileSync(new URL("../fixtures/public-reference/nasa-tm-109057/workload.v1.json", import.meta.url));
const workload = JSON.parse(workloadBytes);
const clone = (value) => structuredClone(value);

test("every governed corpus field family has a table-driven tamper falsifier", () => {
  const mutations = [
    ["wrong record URI", (value) => { value.artifact.recordUri += "/forged"; }],
    ["wrong PDF URI", (value) => { value.artifact.pdfUri += "?mirror=1"; }],
    ["wrong report date", (value) => { value.artifact.publicationDate = "1994-06-02"; }],
    ["wrong access date", (value) => { value.accessedAt = "2026-08-23"; }],
    ["wrong review date", (value) => { value.reviewedAt = "2026-08-23"; }],
    ["wrong page count", (value) => { value.artifact.pageCount = 47; }],
    ["wrong licence", (value) => { value.artifact.copyrightDecision = "UNKNOWN"; }],
    ["wrong export state", (value) => { value.artifact.exportControl = "YES"; }],
    ["wrong ancestry", (value) => { value.claims[1].pages = [26]; }],
    ["role laundering", (value) => { value.claims[2].role = "SOURCE"; }],
    ["exact figure oracle", (value) => { value.claims[2].permits = "exact trajectory oracle"; }],
    ["missing decision", (value) => { value.decisions.pop(); }],
    ["conflicting decision", (value) => { value.decisions[1].decision = "AVERAGE_VALUES"; }],
    ["duplicate claim", (value) => { value.claims.push(clone(value.claims[0])); }],
    ["nested unknown key", (value) => { value.artifact.licence = "public"; }],
    ["named weapon binding", (value) => { value.subject.id = "ASTRA_MK_I"; }],
    ["sensor laundering", (value) => { value.subject.capabilities.push("SENSOR_SUPPORT"); }],
    ["DCS laundering", (value) => { value.artifact.authority = "NASA_NTRS_DCS_EXPORT"; }],
    ["War Thunder laundering", (value) => { value.artifact.id = "WAR_THUNDER_NASA_COPY"; }],
    ["runtime promotion", (value) => { value.promotion.prohibitedSurfaces = []; }],
  ];
  for (const [name, mutate] of mutations) {
    const candidate = clone(GENERIC_AAM_CORPUS);
    mutate(candidate);
    assert.throws(() => verifyGenericAamCorpus(candidate, source), undefined, name);
  }
});

test("TypeScript and actual WASM reject the same exact-key and numeric falsifiers", () => {
  const base = genericAamVerificationInput({ maxTicks: 1 });
  const mutations = [
    (value) => { value.schemaVersion = "v2"; },
    (value) => { value.axisConvention = "NED"; },
    (value) => { value.units = "IMPERIAL"; },
    (value) => { value.decisionSha256 = "0".repeat(64); },
    (value) => { value.missile.massKg = 22.7; },
    (value) => { value.missile.positionM.extra = 1; },
    (value) => { value.target.positionM.x = 4500.01; },
    (value) => { value.target.positionM.z = -12000.01; },
    (value) => { value.target.velocityMps.x = 250; },
    (value) => { value.constants.dragK1 += 1e-6; },
  ];
  for (const mutate of mutations) {
    const input = clone(base);
    mutate(input);
    assert.throws(() => runGenericAamVerification(input));
    assert.throws(() => runRustWasmGenericAamVerification(input));
  }
});

test("independent vector oracles anchor LOS rate and closest approach", () => {
  assert.deepEqual(
    genericAamLosRate({ x: 3, y: 4, z: 0 }, { x: 1, y: -2, z: 0 }),
    { x: 0, y: 0, z: -0.4 },
  );
  assert.deepEqual(
    genericAamClosestApproach({ x: 10, y: 5, z: 0 }, { x: -2, y: 0, z: 0 }),
    { timeSeconds: 5, distanceM: 5 },
  );
  assert.deepEqual(
    genericAamClosestApproach({ x: 3, y: 4, z: 0 }, { x: 0, y: 0, z: 0 }),
    { timeSeconds: Number.MAX_VALUE, distanceM: 5 },
  );
});

test("first tick matches independent thrust, drag, mass, pitch, range and control-lag arithmetic", () => {
  const input = genericAamVerificationInput({
    tickRateHz: 32,
    maxTicks: 1,
    missile: {
      ...genericAamVerificationInput().missile,
      pitchRateRadS: 1,
      pitchSignalMps2: 5,
    },
    target: {
      previousPositionM: { x: 1000, y: 0, z: -6000 },
      positionM: { x: 1000, y: 0, z: -6000 },
      velocityMps: { x: 234.375, y: 0, z: 0 },
    },
  });
  const frame = runGenericAamVerification(input).frames[0];
  const dt = 1 / 32;
  const drag = 0.009412 * 200 ** 2 + (93850 / 9.8 ** 2) * 1 ** 2 / 200 ** 2;
  const expectedSpeed = 200 + ((6800 - drag) / 56.7) * dt;
  assert.ok(Math.abs(frame.dragN - drag) < 1e-12);
  assert.ok(Math.abs(frame.speedMps - expectedSpeed) < 1e-12);
  assert.equal(frame.massKg, 56.7 - 34 / 8 * dt);
  assert.equal(frame.pitchRateRadS, 1 + (5 - 1) / 0.25 * dt);
  assert.equal(frame.pitchRad, (1 - 1) / 200 * dt);
  assert.equal(frame.targetPositionM.x, 1000 + 234.375 * dt);
  assert.equal(frame.missilePositionM.x, 200 * dt);
});

test("control-lag Euler error converges monotonically at 32/64/128/256 Hz", () => {
  const exact = 1 - Math.exp(-1 / 0.25);
  const errors = [32, 64, 128, 256].map((rate) => {
    let state = 0;
    for (let tick = 0; tick < rate; tick += 1) state = genericAamControlLagStep(state, 1, 1 / rate, 0.25);
    return Math.abs(state - exact);
  });
  assert.ok(errors.every((error, index) => index === 0 || error < errors[index - 1]));
  assert.ok(errors[3] < errors[0] / 7);
});

test("seeker, thrust-conflict and command-limit sensitivity roles alter only declared causes", () => {
  const target = {
    previousPositionM: { x: 4500, y: 2000, z: -6000 },
    positionM: { x: 4500, y: 2000, z: -6000 },
    velocityMps: { x: 234.375, y: 0, z: 0 },
  };
  const seeker15 = runGenericAamVerification(genericAamVerificationInput({ maxTicks: 1, seekerHalfAngleDeg: 15, target }));
  const seeker30 = runGenericAamVerification(genericAamVerificationInput({ maxTicks: 1, seekerHalfAngleDeg: 30, target }));
  assert.equal(seeker15.terminal.state, "MISS_SEEKER_LIMIT");
  assert.equal(seeker30.terminal.state, "TIME_LIMIT");

  const printedInput = genericAamVerificationInput({ maxTicks: 256, target });
  const conflictInput = clone(printedInput);
  conflictInput.caseRole = "TABLE_THRUST_CONFLICT_SENSITIVITY";
  conflictInput.constants.motorThrustN = 690 * 4.4482216152605;
  assert.notEqual(runGenericAamVerification(printedInput).frames.at(-1).speedMps, runGenericAamVerification(conflictInput).frames.at(-1).speedMps);

  const limitedInput = clone(printedInput);
  limitedInput.maxTicks = 1;
  limitedInput.caseRole = "COMMAND_LIMIT_SENSITIVITY";
  limitedInput.constants.maximumPitchG = 1;
  limitedInput.constants.maximumYawG = 1;
  const normal = runGenericAamVerification({ ...printedInput, maxTicks: 1 }).frames[0];
  const limited = runGenericAamVerification(limitedInput).frames[0];
  assert.ok(Math.abs(limited.yawCommandMps2) < Math.abs(normal.yawCommandMps2));
});

test("exact seeker equality is admitted, epsilon outside rejects, and terminal precedence is fixed", () => {
  const dt = 1 / 128;
  const relativeX = 1000 + (234.375 - 200) * dt;
  const boundaryY = relativeX * Math.tan(15 * Math.PI / 180);
  const make = (y, missile = genericAamVerificationInput().missile) => genericAamVerificationInput({
    maxTicks: 1,
    seekerHalfAngleDeg: 15,
    missile,
    target: {
      previousPositionM: { x: 1000, y, z: -6000 },
      positionM: { x: 1000, y, z: -6000 },
      velocityMps: { x: 234.375, y: 0, z: 0 },
    },
  });
  const equality = runGenericAamVerification(make(boundaryY));
  assert.ok(Math.abs(equality.frames[0].seekerAngleRad - 15 * Math.PI / 180) < 1e-15);
  assert.equal(equality.terminal.state, "TIME_LIMIT");
  assert.equal(runGenericAamVerification(make(boundaryY + 1e-6)).terminal.state, "MISS_SEEKER_LIMIT");
  const ground = runGenericAamVerification(make(boundaryY + 100, {
    ...genericAamVerificationInput().missile,
    positionM: { x: 0, y: 0, z: 1 },
  }));
  assert.equal(ground.terminal.state, "MISS_GROUND_OR_ZERO_SPEED");
});

test("governed workload bytes, exact coverage and limits reject tamper", () => {
  const report = verifyGenericAamWorkload(workload, workloadBytes);
  assert.equal(report.cases, 15);
  assert.equal(report.sha256, "be35b25977f85bb7953a508df0b67d2b92a0950cc17b217c1d5a6039467cea70");
  const changedBytes = Buffer.from(workloadBytes);
  changedBytes[changedBytes.length - 2] = 0x20;
  assert.throws(() => verifyGenericAamWorkload(workload, changedBytes));
  const oversized = clone(workload);
  oversized.cases[0].maxTicks = 1_000_001;
  assert.throws(() => verifyGenericAamWorkload(oversized, workloadBytes));
  const unknown = clone(workload);
  unknown.cases[0].defaultSeeker = 30;
  assert.throws(() => verifyGenericAamWorkload(unknown, workloadBytes));
});

test("workload per-case bytes and sorted batch digest are invariant to execution order", () => {
  const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const runDigest = (run) => digest({
    schemaVersion: run.schemaVersion,
    subjectId: run.subjectId,
    intendedUse: run.intendedUse,
    semantics: run.semantics,
    backend: run.backend,
    caseRole: run.caseRole,
    frames: run.frames,
    terminal: run.terminal,
    limitations: run.limitations,
  });
  const execute = (entries) => entries.map((entry) => {
    const input = genericAamVerificationInput({
      tickRateHz: entry.tickRateHz,
      maxTicks: entry.maxTicks,
      seekerHalfAngleDeg: entry.seekerHalfAngleDeg,
      caseRole: entry.caseRole ?? "PRINTED_LISTING_REPRODUCTION",
      target: { previousPositionM: entry.targetPositionM, positionM: entry.targetPositionM, velocityMps: { x: 234.375, y: 0, z: 0 } },
    });
    if (input.caseRole === "TABLE_THRUST_CONFLICT_SENSITIVITY") input.constants.motorThrustN = 690 * 4.4482216152605;
    const typescript = runGenericAamVerification(input);
    const rust = runRustWasmGenericAamVerification(input);
    return { id: entry.id, expectedTerminal: typescript.terminal.state, expectedTick: typescript.terminal.tick, typescriptRunSha256: runDigest(typescript), rustWasmRunSha256: runDigest(rust) };
  });
  const forward = execute(workload.cases);
  const reversed = execute([...workload.cases].reverse());
  const sort = (results) => [...results].sort((left, right) => left.id.localeCompare(right.id));
  assert.deepEqual(sort(reversed), sort(forward));
  assert.equal(digest(sort(forward)), workload.expectedBatchSha256);
});

test("report-supported qualitative comparisons stay qualitative and independently anchored", () => {
  const target = {
    previousPositionM: { x: 4500, y: 2000, z: -6000 },
    positionM: { x: 4500, y: 2000, z: -6000 },
    velocityMps: { x: 234.375, y: 0, z: 0 },
  };
  const terminals = [15, 20, 30].map((seekerHalfAngleDeg) => runGenericAamVerification(genericAamVerificationInput({ maxTicks: 128 * 30, seekerHalfAngleDeg, target })).terminal.tick);
  assert.ok(terminals[0] <= terminals[1] && terminals[1] <= terminals[2], "wider seeker cases cannot terminate earlier from seeker loss");
  const positive = runGenericAamVerification(genericAamVerificationInput({ maxTicks: 128 * 30, target: { ...target, previousPositionM: { x: 4500, y: 1000, z: -6000 }, positionM: { x: 4500, y: 1000, z: -6000 } } }));
  const negative = runGenericAamVerification(genericAamVerificationInput({ maxTicks: 128 * 30, target: { ...target, previousPositionM: { x: 4500, y: -1000, z: -6000 }, positionM: { x: 4500, y: -1000, z: -6000 } } }));
  assert.equal(positive.terminal.tick, negative.terminal.tick);
  assert.equal(positive.terminal.state, negative.terminal.state);
  assert.ok(Math.abs(500 * Math.tan(Math.PI / 6)) < Math.abs(4500 * Math.tan(Math.PI / 6)), "same angular cone narrows toward launch");
  const ticks = [32, 64, 128].map((rate) => workload.cases.find((entry) => entry.id === `RATE${rate}_SEEKER30`).expectedTick);
  assert.equal(new Set(ticks).size, 3, "timestep endpoint differences must remain reported");
});

test("run-contract forgery, unknown fields, nonfinite output and terminal enum tamper fail closed", () => {
  const input = genericAamVerificationInput({ maxTicks: 1 });
  const valid = runGenericAamVerification(input);
  assert.doesNotThrow(() => assertGenericAamVerificationRun(valid, input, "typescript"));
  const mutations = [
    (run) => { run.backend = "rust-wasm"; },
    (run) => { run.inputSha256 = "0".repeat(64); },
    (run) => { run.terminal.state = "DETONATED"; },
    (run) => { run.frames[0].rangeM = Number.NaN; },
    (run) => { run.frames[0].unknown = true; },
    (run) => { run.frames[0].state = "TRACKING"; },
    (run) => { run.limitations = []; },
  ];
  for (const mutate of mutations) {
    const run = clone(valid);
    mutate(run);
    assert.throws(() => assertGenericAamVerificationRun(run, input, "typescript"));
  }
});
