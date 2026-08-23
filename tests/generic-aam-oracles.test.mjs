import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { runRustWasmGenericAamVerification } from "../lib/validation/generic-aam-verification-wasm.ts";
import {
  genericAamCorpusView,
  assertGenericAamVerificationRun,
  decodeGenericAamVerificationRunJson,
  genericAamClosestApproach,
  genericAamControlLagStep,
  genericAamLimitedSignal,
  genericAamLosRate,
  GENERIC_AAM_SEMANTIC_QUANTUM,
  genericAamSemanticBin,
  genericAamSemanticBatchSha256,
  genericAamSemanticOutcome,
  genericAamSemanticOutcomeSha256,
  genericAamVerificationInput,
  runGenericAamVerification,
  verifyGenericAamCorpus,
  verifyGenericAamWorkload,
} from "../lib/validation/generic-aam-verification.ts";

const source = readFileSync(new URL("../fixtures/public-reference/nasa-tm-109057/19940031931.pdf", import.meta.url));
const workloadBytes = readFileSync(new URL("../fixtures/public-reference/nasa-tm-109057/workload.v4.json", import.meta.url));
const workload = JSON.parse(workloadBytes);
const clone = (value) => structuredClone(value);
const corpus = () => clone(genericAamCorpusView());
const nextUp = (value) => {
  const bytes = new ArrayBuffer(8);
  const view = new DataView(bytes);
  view.setFloat64(0, value, false);
  view.setBigUint64(0, view.getBigUint64(0, false) + 1n, false);
  return view.getFloat64(0, false);
};

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
    const candidate = corpus();
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
    (value) => { value.maxTicks = 7681; },
    (value) => { value.seekerHalfAngleRad = 15 * Math.PI / 180; },
    (value) => { value.missile.pitchRateRadS = 1e308; },
    (value) => { value.missile.positionM.x = 1e308; },
  ];
  for (const mutate of mutations) {
    const input = clone(base);
    mutate(input);
    assert.throws(() => runGenericAamVerification(input));
    assert.throws(() => runRustWasmGenericAamVerification(input));
  }
});

test("independent vector oracles anchor LOS rate and closest approach", () => {
  assert.throws(
    () => genericAamLosRate({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }),
    /zero range/i,
  );
  assert.deepEqual(
    genericAamLosRate({ x: 3, y: 4, z: 0 }, { x: 1, y: -2, z: 0 }),
    { x: 0, y: 0, z: -0.4 },
  );
  assert.deepEqual(
    genericAamClosestApproach({ x: 10, y: 5, z: 0 }, { x: -2, y: 0, z: 0 }),
    { timeSeconds: 5, distanceM: 5 },
  );
  assert.throws(
    () => genericAamClosestApproach({ x: 3, y: 4, z: 0 }, { x: 0, y: 0, z: 0 }),
    /relative speed/i,
  );
  assert.deepEqual(
    genericAamClosestApproach({ x: 1, y: 0.5, z: 0 }, { x: 2, y: 0, z: 0 }),
    { timeSeconds: -0.5, distanceM: 0.5 },
  );
});

test("printed seeker radians, not recomputed degree conversions, own the boundary", () => {
  const relativeX = 1000 + (234.375 - 200) / 128;
  for (const [degrees, radians] of [[15, 0.261798], [20, 0.349064], [30, 0.523596]]) {
    const base = genericAamVerificationInput({ maxTicks: 1, seekerHalfAngleDeg: degrees });
    assert.equal(base.seekerHalfAngleRad, radians);
    assert.notEqual(base.seekerHalfAngleRad, degrees * Math.PI / 180);
    const boundaryY = relativeX * Math.tan(radians);
    const make = (y) => genericAamVerificationInput({
      maxTicks: 1,
      seekerHalfAngleDeg: degrees,
      target: {
        previousPositionM: { x: 1000, y, z: -6000 },
        positionM: { x: 1000, y, z: -6000 },
        velocityMps: { x: 234.375, y: 0, z: 0 },
      },
    });
    for (const run of [runGenericAamVerification, runRustWasmGenericAamVerification]) {
      assert.equal(run(make(boundaryY)).terminal.state, "TIME_LIMIT");
      assert.equal(run(make(boundaryY + 1e-6)).terminal.state, "MISS_SEEKER_LIMIT");
    }
  }
});

test("hit epsilon is strict and a receding closest point cannot become a hit", () => {
  const make = (y) => genericAamVerificationInput({
    maxTicks: 1,
    target: {
      previousPositionM: { x: 0, y, z: -6000 },
      positionM: { x: 0, y, z: -6000 },
      velocityMps: { x: 234.375, y: 0, z: 0 },
    },
  });
  assert.equal(runGenericAamVerification(make(10 - 1e-9)).terminal.state, "HIT");
  assert.notEqual(runGenericAamVerification(make(10)).terminal.state, "HIT");
  const receding = genericAamClosestApproach({ x: 0.1, y: 9, z: 0 }, { x: 100, y: 0, z: 0 });
  assert.ok(receding.timeSeconds < 0);
  const recedingRun = runGenericAamVerification(genericAamVerificationInput({
    maxTicks: 1,
    missile: {
      ...genericAamVerificationInput().missile,
      speedMps: 1000,
    },
    target: {
      previousPositionM: { x: 10, y: 9.5, z: -6000 },
      positionM: { x: 10, y: 9.5, z: -6000 },
      velocityMps: { x: 234.375, y: 0, z: 0 },
    },
  }));
  assert.ok(recedingRun.frames[0].closestApproachTimeS < 0);
  assert.notEqual(recedingRun.terminal.state, "HIT");
});

test("burnout transition and PN limiter boundaries are exact evaluator contracts", () => {
  const input = genericAamVerificationInput({ maxTicks: 8 * 128 + 1 });
  const run = runGenericAamVerification(input);
  assert.ok(run.frames.length >= 8 * 128 + 1);
  assert.equal(run.frames[8 * 128 - 1].thrustN, 6800);
  assert.equal(run.frames[8 * 128].thrustN, 0);
  assert.equal(run.frames[8 * 128 - 1].massKg, input.constants.burnoutMassKg);
  assert.equal(run.frames[8 * 128].massKg, input.constants.burnoutMassKg);
  assert.equal(genericAamLimitedSignal(1, 30, 22.7, 700, input.constants), 1);
  assert.equal(genericAamLimitedSignal(31, 30, 22.7, 700, input.constants), 30);
  assert.equal(genericAamLimitedSignal(-31, 30, 22.7, 700, input.constants), -30);
  const limitedInput = genericAamVerificationInput({
    maxTicks: 1,
    caseRole: "COMMAND_LIMIT_SENSITIVITY",
    missile: { ...genericAamVerificationInput().missile, speedMps: 700 },
    target: {
      previousPositionM: { x: 4500, y: 4000, z: -6000 },
      positionM: { x: 4500, y: 4000, z: -6000 },
      velocityMps: { x: 234.375, y: 0, z: 0 },
    },
  });
  limitedInput.constants.maximumPitchG = 1;
  limitedInput.constants.maximumYawG = 1;
  const limitedFrame = runGenericAamVerification(limitedInput).frames[0];
  assert.equal(
    limitedFrame.yawCommandMps2,
    9.8 * (22.7 / limitedFrame.massKg),
  );
});

test("full evaluator trajectories converge through 32/64/128/256 Hz", () => {
  const rates = [32, 64, 128, 256];
  const runs = rates.map((tickRateHz) => runGenericAamVerification(
    genericAamVerificationInput({ tickRateHz, maxTicks: tickRateHz * 30 }),
  ));
  assert.ok(runs.every((run) => run.terminal.state === "MISS_OPENING_AFTER_BURN"));
  const ranges = runs.map((run) => run.frames.at(-1).rangeM);
  const deltas = ranges.slice(0, -1).map((value, index) => Math.abs(value - ranges[index + 1]));
  assert.ok(deltas[1] < deltas[0] && deltas[2] < deltas[1]);
  const times = runs.map((run, index) => run.terminal.tick / rates[index]);
  assert.ok(Math.max(...times) - Math.min(...times) <= 1 / 32);
});

test("controlled seeker-only cases produce nested actual hit sets", () => {
  const grid = [];
  for (const x of [500, 1000, 1500, 2500, 3500]) {
    for (const y of [0, 100, 250, 500, 1000, 1500]) grid.push({ x, y });
  }
  const hitSet = (seekerHalfAngleDeg) => new Set(grid.filter(({ x, y }) => {
    const target = {
      previousPositionM: { x, y, z: -6000 },
      positionM: { x, y, z: -6000 },
      velocityMps: { x: 234.375, y: 0, z: 0 },
    };
    return runGenericAamVerification(genericAamVerificationInput({
      tickRateHz: 64,
      maxTicks: 64 * 30,
      seekerHalfAngleDeg,
      target,
    })).terminal.state === "HIT";
  }).map(({ x, y }) => `${x}:${y}`));
  const [hits15, hits20, hits30] = [15, 20, 30].map(hitSet);
  assert.ok([...hits15].every((id) => hits20.has(id)));
  assert.ok([...hits20].every((id) => hits30.has(id)));
  assert.ok(hits15.size < hits20.size && hits20.size < hits30.size);
  const controlled = [15, 20, 30].map((seekerHalfAngleDeg) => genericAamVerificationInput({ seekerHalfAngleDeg }));
  const withoutSeeker = (input) => {
    const copy = clone(input);
    delete copy.seekerHalfAngleDeg;
    delete copy.seekerHalfAngleRad;
    return copy;
  };
  assert.deepEqual(withoutSeeker(controlled[0]), withoutSeeker(controlled[1]));
  assert.deepEqual(withoutSeeker(controlled[1]), withoutSeeker(controlled[2]));
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
  const boundaryY = relativeX * Math.tan(0.261798);
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
  assert.ok(Math.abs(equality.frames[0].seekerAngleRad - 0.261798) < 1e-15);
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
  assert.equal(report.sha256, "9df2c63309e22931deed24c2ee267b7efed2fc7783061ad84b2628f8e577012d");
  const changedBytes = Buffer.from(workloadBytes);
  changedBytes[changedBytes.length - 2] = 0x20;
  assert.throws(() => verifyGenericAamWorkload(workload, changedBytes));
  const oversized = clone(workload);
  oversized.cases[0].maxTicks = 1_000_001;
  assert.throws(() => verifyGenericAamWorkload(oversized, workloadBytes));
  const unknown = clone(workload);
  unknown.cases[0].defaultSeeker = 30;
  assert.throws(() => verifyGenericAamWorkload(unknown, workloadBytes));
  for (const [name, mutate] of [
    ["terminal", (value) => { value.cases[0].expectedTerminal = "HIT"; }],
    ["tick", (value) => { value.cases[0].expectedTick += 1; }],
    ["cause", (value) => { value.cases[0].expectedCause = "CPA_HIT"; }],
    ["frame count", (value) => { value.cases[0].expectedFrameCount += 1; }],
    ["semantic outcome digest", (value) => { value.cases[0].semanticOutcomeSha256 = "0".repeat(64); }],
    ["batch digest", (value) => { value.expectedBatchSha256 = "0".repeat(64); }],
    ["case order", (value) => { value.cases.reverse(); }],
    ["duplicate case", (value) => { value.cases.push(clone(value.cases[0])); }],
  ]) {
    const candidate = clone(workload);
    mutate(candidate);
    assert.throws(() => verifyGenericAamWorkload(candidate, Buffer.from(JSON.stringify(candidate))), undefined, name);
  }
});

test("semantic quantization closes half-bin, negative-zero, and integer-overflow boundaries", () => {
  const quantum = GENERIC_AAM_SEMANTIC_QUANTUM;
  assert.equal(genericAamSemanticBin(0.499999 * quantum), 0);
  assert.equal(genericAamSemanticBin(0.500001 * quantum), 1);
  assert.equal(genericAamSemanticBin(-0.499999 * quantum), 0);
  assert.equal(genericAamSemanticBin(-0.500001 * quantum), -1);
  assert.equal(genericAamSemanticBin(0.5 * quantum), 1);
  assert.equal(genericAamSemanticBin(-0.5 * quantum), 0, "ECMAScript rounding ties toward positive infinity");
  assert.equal(Object.is(genericAamSemanticBin(-0), -0), false);
  assert.equal(Object.is(genericAamSemanticBin(-0.499999 * quantum), -0), false);
  for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_VALUE, (Number.MAX_SAFE_INTEGER + 1) * quantum]) {
    assert.throws(() => genericAamSemanticBin(invalid), /finite|integer-bin/);
  }
});

test("workload semantic identity excludes platform-sensitive trajectory bits", () => {
  const entry = workload.cases[0];
  const input = genericAamVerificationInput({
    tickRateHz: entry.tickRateHz,
    maxTicks: entry.maxTicks,
    seekerHalfAngleDeg: entry.seekerHalfAngleDeg,
    caseRole: entry.caseRole ?? "PRINTED_LISTING_REPRODUCTION",
    target: { previousPositionM: entry.targetPositionM, positionM: entry.targetPositionM, velocityMps: { x: 234.375, y: 0, z: 0 } },
  });
  const run = runGenericAamVerification(input);
  const perturbed = clone(run);
  perturbed.frames[1].speedMps = nextUp(perturbed.frames[1].speedMps);
  assert.notEqual(JSON.stringify(perturbed.frames), JSON.stringify(run.frames));
  assert.deepEqual(genericAamSemanticOutcome(entry, perturbed), genericAamSemanticOutcome(entry, run));
  assert.equal(genericAamSemanticOutcomeSha256(entry, perturbed), genericAamSemanticOutcomeSha256(entry, run));
  const materiallyChanged = clone(run);
  const interiorIndex = Math.floor((materiallyChanged.frames.length - 1) / 2);
  assert.ok(interiorIndex > 0 && interiorIndex < materiallyChanged.frames.length - 1);
  materiallyChanged.frames[interiorIndex].missilePositionM.x += 0.001;
  assert.notDeepEqual(genericAamSemanticOutcome(entry, materiallyChanged), genericAamSemanticOutcome(entry, run));
  const aggregateChanged = clone(run);
  const sampledTicks = new Set(genericAamSemanticOutcome(entry, run).samples.map(({ tick }) => tick));
  const aggregateIndex = aggregateChanged.frames.findIndex((frame) => !sampledTicks.has(frame.tick));
  assert.ok(aggregateIndex > 0, "workload must include a non-sampled interior frame");
  const previousSamples = genericAamSemanticOutcome(entry, aggregateChanged).samples;
  aggregateChanged.frames[aggregateIndex].yawCommandMps2 = Math.max(
    ...aggregateChanged.frames.map(({ yawCommandMps2 }) => Math.abs(yawCommandMps2)),
  ) + 0.001;
  const aggregateOutcome = genericAamSemanticOutcome(entry, aggregateChanged);
  assert.deepEqual(aggregateOutcome.samples, previousSamples);
  assert.notDeepEqual(aggregateOutcome.aggregates, genericAamSemanticOutcome(entry, run).aggregates);
  assert.notEqual(genericAamSemanticOutcomeSha256(entry, aggregateChanged), genericAamSemanticOutcomeSha256(entry, run));
  const changedConfiguration = { ...entry, seekerHalfAngleDeg: 20, seekerHalfAngleRad: 0.349064 };
  assert.notEqual(genericAamSemanticOutcomeSha256(changedConfiguration, run), genericAamSemanticOutcomeSha256(entry, run));
  const outcome = genericAamSemanticOutcome(entry, run);
  assert.equal(genericAamSemanticBatchSha256([outcome]), genericAamSemanticBatchSha256([outcome]));
  assert.throws(() => genericAamSemanticBatchSha256([outcome, outcome]), /duplicate/i);
});

test("workload per-case semantics and sorted batch digest are invariant to execution order", () => {
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
    const outcome = genericAamSemanticOutcome(entry, typescript);
    assert.deepEqual(genericAamSemanticOutcome(entry, rust), outcome);
    return {
      id: entry.id,
      outcome,
      sha256: genericAamSemanticOutcomeSha256(entry, typescript),
      typescriptOutputSha256: typescript.outputSha256,
      rustWasmOutputSha256: rust.outputSha256,
    };
  });
  const forward = execute(workload.cases);
  const reversed = execute([...workload.cases].reverse());
  const sort = (results) => [...results].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  assert.deepEqual(sort(reversed), sort(forward));
  for (const result of forward) {
    const expected = workload.cases.find(({ id }) => id === result.id);
    assert.equal(result.outcome.terminalState, expected.expectedTerminal);
    assert.equal(result.outcome.terminalTick, expected.expectedTick);
    assert.equal(result.outcome.terminalCause, expected.expectedCause);
    assert.equal(result.outcome.frameCount, expected.expectedFrameCount);
    assert.equal(result.sha256, expected.semanticOutcomeSha256);
  }
  assert.equal(genericAamSemanticBatchSha256(forward.map(({ outcome }) => outcome)), workload.expectedBatchSha256);
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
    (run) => { run.schemaVersion = "vector.generic-aam-verification-run.v2"; },
    (run) => { run.subjectId = "AIM_120"; },
    (run) => { run.intendedUse = "PRODUCTION"; },
    (run) => { run.semantics = "UNREVIEWED"; },
    (run) => { run.backend = "rust-wasm"; },
    (run) => { run.sourceSha256 = "0".repeat(64); },
    (run) => { run.corpusSha256 = "0".repeat(64); },
    (run) => { run.decisionSha256 = "0".repeat(64); },
    (run) => { run.inputSha256 = "0".repeat(64); },
    (run) => { run.outputSha256 = "0".repeat(64); },
    (run) => { run.contentSha256 = "0".repeat(64); },
    (run) => { run.caseRole = "NAMED_WEAPON"; },
    (run) => { run.terminal.state = "DETONATED"; },
    (run) => { run.frames[0].rangeM = Number.NaN; },
    (run) => { run.frames[0].rangeM = null; },
    (run) => { run.frames[0].dragN = "1"; },
    (run) => { run.frames[0].missilePositionM.x = null; },
    (run) => { run.frames[0].unknown = true; },
    (run) => { run.frames[0].state = "TRACKING"; },
    (run) => { run.terminal.cause = "FORGED_CAUSE"; },
    (run) => { run.limitations = []; },
  ];
  for (const mutate of mutations) {
    const run = clone(valid);
    mutate(run);
    assert.throws(() => assertGenericAamVerificationRun(run, input, "typescript"));
    assert.throws(() => decodeGenericAamVerificationRunJson(JSON.stringify(run), input, "typescript"));
  }
});

test("every frame numeric field and vector component rejects non-number JSON values", () => {
  const input = genericAamVerificationInput({ maxTicks: 1 });
  const valid = runGenericAamVerification(input);
  const scalarKeys = [
    "tick", "timeSeconds", "speedMps", "pitchRad", "yawRad", "pitchRateRadS",
    "yawRateRadS", "pitchSignalMps2", "yawSignalMps2", "massKg", "thrustN",
    "dragN", "rangeM", "seekerAngleRad", "closingVelocityMps", "pitchCommandMps2",
    "yawCommandMps2", "closestApproachTimeS", "closestApproachDistanceM",
  ];
  for (const key of scalarKeys) {
    for (const forged of [null, "1"]) {
      const run = clone(valid);
      run.frames[0][key] = forged;
      assert.throws(() => decodeGenericAamVerificationRunJson(JSON.stringify(run), input, "typescript"), undefined, `${key}=${forged}`);
    }
  }
  for (const vector of ["missilePositionM", "targetPositionM", "relativePositionM", "losRateRadS"]) {
    for (const component of ["x", "y", "z"]) {
      const run = clone(valid);
      run.frames[0][vector][component] = null;
      assert.throws(() => decodeGenericAamVerificationRunJson(JSON.stringify(run), input, "typescript"), undefined, `${vector}.${component}`);
    }
  }
});
