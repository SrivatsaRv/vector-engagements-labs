import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { runRustWasmGenericAamVerification } from "../lib/engine/backend.ts";
import {
  GENERIC_AAM_CORPUS,
  genericAamVerificationInput,
  runGenericAamVerification,
  verifyGenericAamCorpus,
} from "../lib/validation/generic-aam-verification.ts";

const corpusPath = new URL(
  "../governance/nasa-tm-109057-generic-aam-verification-corpus.v2.json",
  import.meta.url,
);
const sourcePath = new URL(
  "../fixtures/public-reference/nasa-tm-109057/19940031931.pdf",
  import.meta.url,
);

const clone = (value) => structuredClone(value);

function assertCloseStructure(actual, expected, label = "value") {
  if (typeof expected === "number") {
    assert.ok(Math.abs(actual - expected) <= 1e-9, `${label}: ${actual} != ${expected}`);
    return;
  }
  if (Array.isArray(expected)) {
    assert.equal(actual.length, expected.length, `${label} length`);
    expected.forEach((entry, index) => assertCloseStructure(actual[index], entry, `${label}[${index}]`));
    return;
  }
  if (expected && typeof expected === "object") {
    assert.deepEqual(Object.keys(actual), Object.keys(expected), `${label} keys`);
    for (const key of Object.keys(expected)) assertCloseStructure(actual[key], expected[key], `${label}.${key}`);
    return;
  }
  assert.deepEqual(actual, expected, label);
}

test("the exact NASA artifact and verification-only corpus verify offline", () => {
  const report = verifyGenericAamCorpus(
    JSON.parse(readFileSync(corpusPath, "utf8")),
    readFileSync(sourcePath),
  );
  assert.deepEqual(report, {
    schemaVersion: "vector.weapon-verification-corpus-report.v1",
    corpusId: "nasa-tm-109057-generic-aam-verification-corpus.v2",
    sourceSha256: "30629ac16b33a519e7aee9e821554fb767b8fcb4daa83574966ee75b4cddc3aa",
    byteLength: 2606172,
    state: "VERIFIED",
  });
  assert.equal(GENERIC_AAM_CORPUS.subject.intendedUse, "ENGINE_VERIFICATION_ONLY");
  assert.equal(GENERIC_AAM_CORPUS.promotion.runtimeAuthority, "NONE");
  assert.deepEqual(GENERIC_AAM_CORPUS.evaluator.seekerHalfAngles, [
    { degrees: 15, printedRadians: 0.261798 },
    { degrees: 20, printedRadians: 0.349064 },
    { degrees: 30, printedRadians: 0.523596 },
  ]);
});

test("corpus admission fails closed for tamper, extra keys, duplicate decisions, and laundering", () => {
  const source = readFileSync(sourcePath);
  const cases = [];
  const extra = clone(GENERIC_AAM_CORPUS);
  extra.unknown = true;
  cases.push(extra);
  const wrongSubject = clone(GENERIC_AAM_CORPUS);
  wrongSubject.subject.id = "F-16_BLOCK_52";
  cases.push(wrongSubject);
  const wrongRole = clone(GENERIC_AAM_CORPUS);
  wrongRole.claims[1].role = "INDEPENDENT_VALIDATION";
  cases.push(wrongRole);
  const duplicate = clone(GENERIC_AAM_CORPUS);
  duplicate.decisions.push(clone(duplicate.decisions[0]));
  cases.push(duplicate);
  const gameDump = clone(GENERIC_AAM_CORPUS);
  gameDump.artifact.authority = "WAR_THUNDER_DUMP";
  cases.push(gameDump);
  const promoted = clone(GENERIC_AAM_CORPUS);
  promoted.promotion.runtimeAuthority = "WEAPON_MODEL";
  cases.push(promoted);
  for (const candidate of cases) {
    assert.throws(() => verifyGenericAamCorpus(candidate, source));
  }
  const changed = Buffer.from(source);
  changed[changed.length - 1] ^= 1;
  assert.throws(() => verifyGenericAamCorpus(GENERIC_AAM_CORPUS, changed), /digest/i);
});

test("input admission rejects defaults, wrong bindings, nonfinite state, and excessive work", () => {
  const input = genericAamVerificationInput();
  const candidates = [
    { ...input, seekerHalfAngleDeg: undefined },
    { ...input, subjectId: "AIM_120" },
    { ...input, intendedUse: "PRODUCTION" },
    { ...input, tickRateHz: 31 },
    { ...input, maxTicks: 7_681 },
    { ...input, sourceSha256: "0".repeat(64) },
    { ...input, missile: { ...input.missile, speedMps: Number.NaN } },
    { ...input, missile: { ...input.missile, pitchRateRadS: 1e308 } },
    { ...input, missile: { ...input.missile, positionM: { x: 1e308, y: 0, z: -6000 } } },
    { ...input, unknown: true },
  ];
  for (const candidate of candidates) {
    assert.throws(() => runGenericAamVerification(candidate));
  }
});

test("D09 rejects exceptional initial range and relative-speed states in both engines", () => {
  const base = genericAamVerificationInput({ maxTicks: 1 });
  const zeroRange = {
    ...base,
    target: {
      previousPositionM: { ...base.missile.positionM },
      positionM: { ...base.missile.positionM },
      velocityMps: { x: 234.375, y: 0, z: 0 },
    },
  };
  const zeroRelativeSpeed = {
    ...base,
    missile: { ...base.missile, speedMps: 234.375 },
  };
  for (const candidate of [zeroRange, zeroRelativeSpeed]) {
    assert.throws(() => runGenericAamVerification(candidate), /D09|range|relative speed/i);
    assert.throws(() => runRustWasmGenericAamVerification(candidate));
  }
});

test("D09 closes an admitted dynamic exact-zero range identically in both engines", () => {
  const input = genericAamVerificationInput({
    maxTicks: 1,
    missile: {
      ...genericAamVerificationInput().missile,
      positionM: { x: 0.2685546875, y: 0, z: -6000 },
    },
    target: {
      previousPositionM: { x: 0, y: 0, z: -6000 },
      positionM: { x: 0, y: 0, z: -6000 },
      velocityMps: { x: 234.375, y: 0, z: 0 },
    },
  });
  for (const run of [runGenericAamVerification(input), runRustWasmGenericAamVerification(input)]) {
    assert.deepEqual(run.terminal, { state: "HIT", tick: 1, cause: "EXACT_ZERO_RANGE" });
    assert.equal(run.frames[0].rangeM, 0);
    assert.equal(run.frames[0].closestApproachTimeS, 0);
    assert.equal(run.frames[0].closestApproachDistanceM, 0);
  }
});

test("axial geometry has zero LOS command and exact first-tick mass depletion", () => {
  const input = genericAamVerificationInput({
    maxTicks: 1,
    target: {
      previousPositionM: { x: 1000, y: 0, z: -6000 },
      positionM: { x: 1000, y: 0, z: -6000 },
      velocityMps: { x: 234.375, y: 0, z: 0 },
    },
  });
  const run = runGenericAamVerification(input);
  assert.equal(run.frames.length, 1);
  assert.equal(Math.abs(run.frames[0].losRateRadS.x), 0);
  assert.equal(Math.abs(run.frames[0].losRateRadS.y), 0);
  assert.equal(Math.abs(run.frames[0].losRateRadS.z), 0);
  assert.equal(Math.abs(run.frames[0].pitchCommandMps2), 0);
  assert.equal(Math.abs(run.frames[0].yawCommandMps2), 0);
  assert.equal(run.frames[0].massKg, 56.7 - 34 / (8 * 128));
});

test("terminal precedence is deterministic and explicit", () => {
  const base = genericAamVerificationInput({ maxTicks: 1 });
  const hit = runGenericAamVerification({
    ...base,
    target: {
      previousPositionM: { x: 0, y: 1, z: -6000 },
      positionM: { x: 0, y: 1, z: -6000 },
      velocityMps: { x: 234.375, y: 0, z: 0 },
    },
  });
  assert.equal(hit.terminal.state, "HIT");
  assert.equal(hit.terminal.tick, 1);
  const seeker = runGenericAamVerification({
    ...base,
    seekerHalfAngleDeg: 15,
    seekerHalfAngleRad: 0.261798,
    target: {
      previousPositionM: { x: 100, y: 100, z: -6000 },
      positionM: { x: 100, y: 100, z: -6000 },
      velocityMps: { x: 234.375, y: 0, z: 0 },
    },
  });
  assert.equal(seeker.terminal.state, "MISS_SEEKER_LIMIT");
});

test("TypeScript and Rust-WASM preserve terminal and every numeric frame field", () => {
  for (const seekerHalfAngleDeg of [15, 20, 30]) {
    for (const tickRateHz of [32, 64, 128]) {
      const input = genericAamVerificationInput({
        tickRateHz,
        maxTicks: tickRateHz * 2,
        seekerHalfAngleDeg,
      });
      const typescript = runGenericAamVerification(input);
      const rust = runRustWasmGenericAamVerification(input);
      assert.deepEqual(rust.terminal, typescript.terminal);
      assert.equal(rust.frames.length, typescript.frames.length);
      for (let index = 0; index < rust.frames.length; index += 1) {
        assertCloseStructure(rust.frames[index], typescript.frames[index], `frame ${index}`);
      }
    }
  }
});

test("the evaluator is deterministic and is not imported by production contracts", () => {
  const input = genericAamVerificationInput({ maxTicks: 128 });
  assert.deepEqual(runGenericAamVerification(input), runGenericAamVerification(input));
  for (const path of [
    new URL("../lib/engine/contracts.ts", import.meta.url),
    new URL("../lib/engine/core.ts", import.meta.url),
    new URL("../lib/engine/simulation-events.ts", import.meta.url),
    new URL("../lib/model-pack.ts", import.meta.url),
  ]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /generic-aam-verification/);
  }
});

test("Rust generic DTO is strict without mutating the shared production Vec3 contract", () => {
  const shared = readFileSync(new URL("../engine-rust/src/lib.rs", import.meta.url), "utf8");
  const generic = readFileSync(new URL("../engine-rust/src/generic_aam_reference.rs", import.meta.url), "utf8");
  const expectedSharedContract = `#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}`;
  assert.ok(shared.includes(expectedSharedContract));
  assert.doesNotMatch(shared, /#\[serde\(deny_unknown_fields\)\]\npub struct Vec3/);
  assert.match(generic, /struct GenericAamVec3/);
  assert.match(generic, /deny_unknown_fields[\s\S]{0,100}struct GenericAamVec3/);
});
