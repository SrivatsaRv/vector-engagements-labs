import assert from "node:assert/strict";
import test from "node:test";
import { runRustWasmPublicAircraftReference } from "../lib/engine/backend.ts";
import {
  NASA_NESC_CASE_11,
  publicAircraftReferenceInput,
  runPublicAircraftReference,
  verifyPublicAircraftReference,
} from "../lib/validation/public-aircraft-reference.ts";

test("NASA NESC case 11 stays evidence-bound and passes every declared tolerance", () => {
  const report = verifyPublicAircraftReference();
  assert.equal(report.status, "PASS");
  assert.equal(report.framesCompared, 4);
  assert.equal(report.toleranceChecks.length, 12);
  assert.ok(report.toleranceChecks.every(({ value, tolerance }) => value <= tolerance));
  assert.match(report.source.modelPackageSha256, /^[a-f0-9]{64}$/);
  assert.match(report.source.trajectorySha256, /^[a-f0-9]{64}$/);
  assert.match(report.limitations.join(" "), /not connected to the Su-30MKI versus F-16/i);
  assert.equal(report.controls.throttlePercent, 13.9019);
});

test("the trim propagator is deterministic and step-size independent at common checkpoints", () => {
  const input = publicAircraftReferenceInput();
  const first = runPublicAircraftReference(input);
  const second = runPublicAircraftReference(input);
  const finer = runPublicAircraftReference({ ...input, sampleIntervalSeconds: 30 });
  assert.deepEqual(first, second);
  assert.deepEqual(first.frames, finer.frames.filter((frame) => frame.timeSeconds % 60 === 0));
  assert.equal(new Set(first.frames.map((frame) => frame.specificEnergyJkg)).size, 1);
});

test("a trajectory regression fails the public-reference gate", () => {
  const run = structuredClone(runPublicAircraftReference(publicAircraftReferenceInput()));
  run.frames.at(-1).latitudeDeg += 0.01;
  const report = verifyPublicAircraftReference(run);
  assert.equal(report.status, "FAIL");
  assert.ok(report.maximumErrors.geodesicPositionM > NASA_NESC_CASE_11.tolerances.geodesicPositionM);
});

test("public-reference inputs fail closed when work or schema bounds are invalid", () => {
  const input = publicAircraftReferenceInput();
  assert.throws(
    () => runPublicAircraftReference({ ...input, schemaVersion: "other" }),
    /Unsupported public aircraft reference schema/,
  );
  assert.throws(
    () => runPublicAircraftReference({ ...input, sampleIntervalSeconds: 0 }),
    /propagation bounds/,
  );
  assert.throws(
    () => runPublicAircraftReference({ ...input, durationSeconds: 10001, sampleIntervalSeconds: 1 }),
    /propagation bounds/,
  );
});

test("Rust/WASM and TypeScript preserve the same public-reference state", () => {
  const input = publicAircraftReferenceInput();
  const typescript = runPublicAircraftReference(input);
  const rust = runRustWasmPublicAircraftReference(input);
  assert.equal(rust.backend, "rust-wasm");
  assert.equal(verifyPublicAircraftReference(rust).status, "PASS");
  assert.equal(rust.frames.length, typescript.frames.length);
  for (let index = 0; index < rust.frames.length; index += 1) {
    const rustFrame = rust.frames[index];
    const typescriptFrame = typescript.frames[index];
    assert.ok(Math.abs(rustFrame.latitudeDeg - typescriptFrame.latitudeDeg) <= 1e-9);
    assert.ok(Math.abs(rustFrame.longitudeDeg - typescriptFrame.longitudeDeg) <= 1e-9);
    assert.ok(Math.abs(rustFrame.specificEnergyJkg - typescriptFrame.specificEnergyJkg) <= 1e-9);
    assert.deepEqual(rustFrame.attitudeDeg, typescriptFrame.attitudeDeg);
    assert.deepEqual(rustFrame.bodyAngularRateRadS, typescriptFrame.bodyAngularRateRadS);
  }
});
