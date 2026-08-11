import assert from "node:assert/strict";
import { runRustWasmPublicAircraftReference } from "../lib/engine/backend.ts";
import {
  NASA_NESC_CASE_11,
  publicAircraftReferenceInput,
  runPublicAircraftReference,
  verifyPublicAircraftReference,
} from "../lib/validation/public-aircraft-reference.ts";

const input = publicAircraftReferenceInput();
const typescript = runPublicAircraftReference(input);
const repeated = runPublicAircraftReference(input);
const rust = runRustWasmPublicAircraftReference(input);
const typescriptReport = verifyPublicAircraftReference(typescript);
const rustReport = verifyPublicAircraftReference(rust);

assert.equal(typescriptReport.status, "PASS");
assert.equal(rustReport.status, "PASS");
assert.deepEqual(typescript, repeated, "TypeScript reference propagation must be deterministic");
assert.match(NASA_NESC_CASE_11.referenceModel.modelPackageSha256, /^[a-f0-9]{64}$/);
assert.match(NASA_NESC_CASE_11.referenceModel.trajectorySha256, /^[a-f0-9]{64}$/);
assert.equal(typescript.frames.length, rust.frames.length);
assert.equal(typescript.caseId, rust.caseId);
for (let index = 0; index < typescript.frames.length; index += 1) {
  const expected = typescript.frames[index];
  const actual = rust.frames[index];
  for (const path of [
    ["timeSeconds"],
    ["latitudeDeg"],
    ["longitudeDeg"],
    ["altitudeMslM"],
    ["velocityNedMps", "north"],
    ["velocityNedMps", "east"],
    ["velocityNedMps", "down"],
    ["attitudeDeg", "yaw"],
    ["attitudeDeg", "pitch"],
    ["attitudeDeg", "roll"],
    ["bodyAngularRateRadS", "roll"],
    ["bodyAngularRateRadS", "pitch"],
    ["bodyAngularRateRadS", "yaw"],
    ["aerodynamicBodyForceN", "x"],
    ["aerodynamicBodyForceN", "y"],
    ["aerodynamicBodyForceN", "z"],
    ["aerodynamicBodyMomentNm", "roll"],
    ["aerodynamicBodyMomentNm", "pitch"],
    ["aerodynamicBodyMomentNm", "yaw"],
    ["mach"],
    ["dynamicPressurePa"],
    ["specificEnergyJkg"],
  ]) {
    const valueAt = (root) => path.reduce((value, key) => value[key], root);
    assert.ok(
      Math.abs(valueAt(actual) - valueAt(expected)) <= 1e-9,
      `TypeScript/Rust parity failed at frame ${index} ${path.join(".")}`,
    );
  }
}
assert.ok(Math.abs(typescript.trimForceResidualN - rust.trimForceResidualN) <= 1e-9);

process.stdout.write(`${JSON.stringify({
  caseId: input.caseId,
  status: "PASS",
  framesCompared: typescript.frames.length,
  maxGeodesicErrorM: Number(typescriptReport.maximumErrors.geodesicPositionM.toFixed(3)),
  maxSpeedErrorMps: Number(typescriptReport.maximumErrors.speedMps.toFixed(6)),
  maxAltitudeErrorM: Number(typescriptReport.maximumErrors.altitudeM.toFixed(6)),
  trimForceResidualN: Number(typescriptReport.trimForceResidualN.toFixed(3)),
  parityTolerance: 1e-9,
})}\n`);
