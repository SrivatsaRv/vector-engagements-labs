import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";

import { runRustWasmGenericAamVerification } from "../lib/validation/generic-aam-verification-wasm.ts";
import {
  genericAamCorpusView,
  genericAamVerificationInput,
  runGenericAamVerification,
  verifyGenericAamCorpus,
} from "../lib/validation/generic-aam-verification.ts";

const corpusPath = new URL(
  "../governance/nasa-tm-109057-generic-aam-verification-corpus.v4.json",
  import.meta.url,
);
const sourcePath = new URL(
  "../fixtures/public-reference/nasa-tm-109057/19940031931.pdf",
  import.meta.url,
);

const clone = (value) => structuredClone(value);
const corpus = () => clone(genericAamCorpusView());
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

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
    corpusId: "nasa-tm-109057-generic-aam-verification-corpus.v4",
    sourceSha256: "30629ac16b33a519e7aee9e821554fb767b8fcb4daa83574966ee75b4cddc3aa",
    byteLength: 2606172,
    state: "VERIFIED",
  });
  const view = genericAamCorpusView();
  assert.ok(Object.isFrozen(view));
  assert.ok(Object.isFrozen(view.subject));
  assert.equal(view.subject.intendedUse, "ENGINE_VERIFICATION_ONLY");
  assert.equal(view.promotion.runtimeAuthority, "NONE");
  assert.deepEqual(view.evaluator.seekerHalfAngles, [
    { degrees: 15, printedRadians: 0.261798 },
    { degrees: 20, printedRadians: 0.349064 },
    { degrees: 30, printedRadians: 0.523596 },
  ]);
});

test("immutable v3 corpus and workload bytes remain retained beside the v4 successor", () => {
  const v3Corpus = readFileSync(new URL(
    "../governance/nasa-tm-109057-generic-aam-verification-corpus.v3.json",
    import.meta.url,
  ));
  const v3Workload = readFileSync(new URL(
    "../fixtures/public-reference/nasa-tm-109057/workload.v3.json",
    import.meta.url,
  ));
  assert.equal(v3Corpus.byteLength, 7456);
  assert.equal(sha256(v3Corpus), "57af85c0bafdb47563e4bd09cce08d329f4044b52adbf50c6e1a072e228d81b3");
  assert.equal(v3Workload.byteLength, 8223);
  assert.equal(sha256(v3Workload), "0b7f7ba1395ff58629c26aaa62e46c239121d37e4197a2246e1064aa8caeb556");
});

test("corpus admission fails closed for tamper, extra keys, duplicate decisions, and laundering", () => {
  const source = readFileSync(sourcePath);
  const cases = [];
  const extra = corpus();
  extra.unknown = true;
  cases.push(extra);
  const wrongSubject = corpus();
  wrongSubject.subject.id = "F-16_BLOCK_52";
  cases.push(wrongSubject);
  const wrongRole = corpus();
  wrongRole.claims[1].role = "INDEPENDENT_VALIDATION";
  cases.push(wrongRole);
  const duplicate = corpus();
  duplicate.decisions.push(clone(duplicate.decisions[0]));
  cases.push(duplicate);
  const gameDump = corpus();
  gameDump.artifact.authority = "WAR_THUNDER_DUMP";
  cases.push(gameDump);
  const promoted = corpus();
  promoted.promotion.runtimeAuthority = "WEAPON_MODEL";
  cases.push(promoted);
  for (const candidate of cases) {
    assert.throws(() => verifyGenericAamCorpus(candidate, source));
  }
  const changed = Buffer.from(source);
  changed[changed.length - 1] ^= 1;
  assert.throws(() => verifyGenericAamCorpus(corpus(), changed), /digest/i);
});

test("caller mutation cannot poison the private corpus authority", () => {
  const source = readFileSync(sourcePath);
  const validBefore = corpus();
  assert.equal(verifyGenericAamCorpus(validBefore, source).state, "VERIFIED");
  const exposed = genericAamCorpusView();
  assert.throws(() => { exposed.artifact.sha256 = "0".repeat(64); }, TypeError);
  assert.throws(() => { exposed.evidencePolicy.ineligibleKinds.splice(0); }, TypeError);
  assert.throws(() => { exposed.promotion.prohibitedSurfaces.splice(0); }, TypeError);
  const forged = corpus();
  forged.artifact.authority = "NASA_NTRS_DCS_WAR_THUNDER";
  forged.artifact.sha256 = validBefore.artifact.sha256;
  forged.evidencePolicy.ineligibleKinds = [];
  forged.promotion.prohibitedSurfaces = [];
  assert.throws(() => verifyGenericAamCorpus(forged, source));
  assert.equal(verifyGenericAamCorpus(corpus(), source).state, "VERIFIED");
  assert.equal(genericAamVerificationInput({ maxTicks: 1 }).sourceSha256, validBefore.artifact.sha256);
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

test("actual WASM preserves every closed numeric admission boundary", () => {
  const base = genericAamVerificationInput({ maxTicks: 1 });
  const target = (patch) => ({
    previousPositionM: { ...base.target.positionM, ...patch },
    positionM: { ...base.target.positionM, ...patch },
    velocityMps: { ...base.target.velocityMps },
  });
  const pairs = [
    [(input) => { input.missile.speedMps = 1; }, (input) => { input.missile.speedMps = 1 - Number.EPSILON; }],
    [(input) => { input.missile.speedMps = 1000; }, (input) => { input.missile.speedMps = 1000 + 1e-9; }],
    [(input) => { input.missile.pitchRateRadS = 100; }, (input) => { input.missile.pitchRateRadS = 100 + 1e-9; }],
    [(input) => { input.missile.yawRateRadS = -100; }, (input) => { input.missile.yawRateRadS = -100 - 1e-9; }],
    [(input) => { input.missile.pitchSignalMps2 = 1000; }, (input) => { input.missile.pitchSignalMps2 = 1000 + 1e-9; }],
    [(input) => { input.missile.yawSignalMps2 = -1000; }, (input) => { input.missile.yawSignalMps2 = -1000 - 1e-9; }],
    [(input) => { input.missile.pitchRad = 1.5; }, (input) => { input.missile.pitchRad = 1.5 + 1e-9; }],
    [(input) => { input.missile.yawRad = Math.PI; }, (input) => { input.missile.yawRad = Math.PI + 1e-9; }],
    [(input) => { input.missile.positionM.x = 12000; }, (input) => { input.missile.positionM.x = 12000 + 1e-9; }],
    [(input) => { input.missile.positionM.y = -12000; }, (input) => { input.missile.positionM.y = -12000 - 1e-9; }],
    [(input) => { input.missile.positionM.z = -12000; }, (input) => { input.missile.positionM.z = -12000 - 1e-9; }],
    [(input) => { input.target = target({ x: 0, y: 100 }); }, (input) => { input.target = target({ x: -1e-9, y: 100 }); }],
    [(input) => { input.target = target({ x: 4500 }); }, (input) => { input.target = target({ x: 4500 + 1e-9 }); }],
    [(input) => { input.target = target({ y: -4000 }); }, (input) => { input.target = target({ y: -4000 - 1e-9 }); }],
    [(input) => { input.target = target({ y: 4000 }); }, (input) => { input.target = target({ y: 4000 + 1e-9 }); }],
    [(input) => { input.target = target({ z: -2000 }); }, (input) => { input.target = target({ z: -2000 + 1e-9 }); }],
    [(input) => { input.target = target({ z: -12000 }); }, (input) => { input.target = target({ z: -12000 - 1e-9 }); }],
    [(input) => { input.maxTicks = 7680; }, (input) => { input.maxTicks = 7681; }],
  ];
  for (const [atBoundary, outside] of pairs) {
    const admitted = clone(base);
    atBoundary(admitted);
    assert.doesNotThrow(() => runGenericAamVerification(admitted));
    assert.doesNotThrow(() => runRustWasmGenericAamVerification(admitted));
    const rejected = clone(base);
    outside(rejected);
    assert.throws(() => runGenericAamVerification(rejected));
    assert.throws(() => runRustWasmGenericAamVerification(rejected));
  }
  for (const tickRateHz of [32, 64, 128, 256]) {
    const admitted = genericAamVerificationInput({ tickRateHz, maxTicks: 1 });
    assert.doesNotThrow(() => runGenericAamVerification(admitted));
    assert.doesNotThrow(() => runRustWasmGenericAamVerification(admitted));
  }
  for (const tickRateHz of [31, 257]) {
    const rejected = { ...genericAamVerificationInput({ maxTicks: 1 }), tickRateHz };
    assert.throws(() => runGenericAamVerification(rejected));
    assert.throws(() => runRustWasmGenericAamVerification(rejected));
  }
});

test("float-roundtrip preserves actual-WASM frame-zero scalar bits", () => {
  const retainedPitchRate = 0.12345678901234566;
  const retainedYawRate = -0.3456789012345679;
  const input = genericAamVerificationInput({
    maxTicks: 1,
    missile: {
      ...genericAamVerificationInput().missile,
      speedMps: 200.12345678901235,
      pitchRateRadS: retainedPitchRate,
      pitchSignalMps2: retainedPitchRate,
      yawRateRadS: retainedYawRate,
      yawSignalMps2: retainedYawRate,
      pitchRad: 0.012345678901234567,
      yawRad: -0.02345678901234568,
      positionM: { x: 1.2345678901234567, y: -2.345678901234568, z: -6000.123456789012 },
    },
  });
  const ts = runGenericAamVerification(input);
  const wasm = runRustWasmGenericAamVerification(input);
  assert.ok(Object.is(wasm.frames[0].pitchRateRadS, retainedPitchRate));
  assert.ok(Object.is(wasm.frames[0].yawRateRadS, retainedYawRate));
  assert.ok(Object.is(wasm.frames[0].targetPositionM.y, input.target.positionM.y));
  assert.ok(Object.is(wasm.frames[0].targetPositionM.z, input.target.positionM.z));
  assert.ok(Object.is(wasm.frames[0].timeSeconds, 1 / input.tickRateHz));
  assert.equal(wasm.inputSha256, ts.inputSha256);
  assertCloseStructure(wasm.frames[0], ts.frames[0], "float-roundtrip frame zero");
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

test("production Rust, WASM, backend, and Worker surfaces contain no generic-AAM verifier", () => {
  const productionPaths = [
    new URL("../engine-rust/src/lib.rs", import.meta.url),
    new URL("../engine-rust/src/wasm_abi.rs", import.meta.url),
    new URL("../lib/engine/backend.ts", import.meta.url),
  ];
  for (const path of productionPaths) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /generic.?aam|NASA_TM_109057/i);
  }
  const generated = readFileSync(new URL("../lib/engine/generated/vector-engine-wasm.ts", import.meta.url), "utf8");
  const base64 = generated.match(/VECTOR_ENGINE_WASM_BASE64 = "([A-Za-z0-9+/=]+)"/)?.[1];
  assert.ok(base64);
  const bytes = Buffer.from(base64, "base64");
  const exports = WebAssembly.Module.exports(new WebAssembly.Module(bytes)).map(({ name }) => name);
  assert.ok(!exports.some((name) => /generic.?aam/i.test(name)));
  assert.doesNotMatch(new TextDecoder().decode(bytes), /generic.?aam|NASA_TM_109057/i);
  const collect = (directory) => existsSync(directory)
    ? readdirSync(directory).flatMap((entry) => {
      const path = new URL(entry, directory.href.endsWith("/") ? directory : new URL(`${directory.href}/`));
      return statSync(path).isDirectory() ? collect(path) : [path];
    })
    : [];
  for (const path of collect(new URL("../dist/", import.meta.url)).filter((entry) => /simulation\.worker-.*\.js$/.test(entry.pathname))) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /vector_generic_aam_run_json|NASA_TM_109057_GENERIC_AAM_REFERENCE|generic-aam-verification/i, path.pathname);
  }
});

test("Rust generic DTO is strict without mutating the shared production Vec3 contract", () => {
  const shared = readFileSync(new URL("../engine-rust/src/lib.rs", import.meta.url), "utf8");
  const generic = readFileSync(new URL("../verification-rust/generic-aam/src/model.rs", import.meta.url), "utf8");
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
