import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";

import {
  assertSourceAdmissionEligible,
  verifyCommittedInventory,
  verifyManifest,
  verifyProductionIsolation,
  verifySourceDirectory,
} from "../scripts/verify-nasa-f16-store-source.mjs";

const manifestPath = resolve(
  "governance/nasa-historical-f16-store-source/manifest.v1.json",
);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const mutate = (apply) => {
  const candidate = structuredClone(manifest);
  apply(candidate);
  return candidate;
};

test("the historical F-16 store corpus is immutable, source-only, and pending human admission", () => {
  const result = verifyManifest(manifest);
  assert.deepEqual(result, {
    artifacts: 3,
    decisionsPending: 3,
    id: "nasa-historical-f16-store-source-20260824",
    pageMaps: 16,
    schemaVersion: "vector.nasa-historical-f16-store-source-manifest.v1",
    visualQaPending: 16,
  });
  assert.throws(
    () => assertSourceAdmissionEligible(manifest),
    /reference use decision is PENDING/,
  );
  assert.equal(manifest.referenceUseDecision.value, "PENDING");
  assert.equal(manifest.redistributionDecision.value, "PENDING");
  assert.equal(manifest.exportReviewDecision.value, "PENDING");
  assert.equal(manifest.decisions, undefined);
});

test("the manifest rejects identity, decision, role, page, unit, datum, and executable-field drift", () => {
  const attacks = [
    ["unknown top-level field", (value) => { value.surprise = true; }],
    ["unknown decision field", (value) => { value.referenceUseDecision.surprise = true; }],
    ["unknown page field", (value) => { value.artifacts[0].pageMaps[0].surprise = true; }],
    ["unknown render recipe field", (value) => { value.renderRecipe.surprise = true; }],
    ["unknown display rotation field", (value) => { value.renderRecipe.displayRotation.surprise = true; }],
    ["unknown conversion field", (value) => { value.conversionPolicy.surprise = true; }],
    ["unknown ancestry field", (value) => { value.ancestry.surprise = true; }],
    ["swapped source digest", (value) => {
      [value.artifacts[0].pdf.sha256, value.artifacts[1].pdf.sha256] =
        [value.artifacts[1].pdf.sha256, value.artifacts[0].pdf.sha256];
    }],
    ["changed metadata digest", (value) => { value.artifacts[2].metadata.sha256 = "0".repeat(64); }],
    ["forged decision", (value) => { value.referenceUseDecision.value = "APPROVED_INTERNAL_VERIFICATION_ONLY"; }],
    ["subject laundering", (value) => { value.artifacts[0].subject = value.artifacts[2].subject; }],
    ["role laundering", (value) => { value.artifacts[1].role = value.artifacts[0].role; }],
    ["wrong assembled-pylon page", (value) => {
      value.artifacts[1].pageMaps.find((page) => page.id === "cr172354-final-pylon-force").pdfPage = 27;
    }],
    ["direct mass relabel", (value) => {
      value.artifacts[1].pageMaps.find((page) => page.id === "cr172354-final-pylon-force").quantitySemantics = "MASS_KG";
    }],
    ["direct inertia relabel", (value) => {
      value.artifacts[1].pageMaps.find((page) => page.id === "cr172354-table2-values").literalUnits[0] = "kg*m^2";
    }],
    ["coordinate conflation", (value) => {
      value.coordinateConcepts.fuselageStation.sameAs = "SPAN_STATION";
    }],
    ["missing lateral datum gap", (value) => { delete value.coordinateConcepts.lateralDatum; }],
    ["promoted handedness", (value) => { value.coordinateConcepts.handedness.availability = "REFERENCE_ONLY"; }],
    ["modern named aircraft promotion", (value) => {
      value.artifacts[0].eligibleClaims.push("PAF F-16 Block 52 compatibility");
    }],
    ["executable parameter", (value) => { value.artifacts[0].stationCompatibility = [3, 7]; }],
    ["changed render identity", (value) => {
      value.artifacts[0].pageMaps[0].render.sha256 = "f".repeat(64);
    }],
    ["wrong rotated dimensions", (value) => {
      value.artifacts[0].pageMaps[0].render.displayWidthPx = value.artifacts[0].pageMaps[0].render.sourceWidthPx;
    }],
    ["forged visual QA", (value) => {
      value.artifacts[0].pageMaps[0].visualQa.status = "APPROVED_HUMAN_REVIEW";
    }],
    ["omitted pylon component qualification", (value) => {
      value.artifacts[1].pageMaps.find((page) => page.id === "cr172354-final-pylon-force").uncertaintyQualification = "omitted";
    }],
    ["omitted asymmetric ejection setup", (value) => {
      value.artifacts[2].pageMaps.find((page) => page.id === "tm87766-single-ejection-p10").uncertaintyQualification = "omitted";
    }],
    ["community source laundering", (value) => {
      value.artifacts[0].eligibleClaims.push("War Thunder community dump");
    }],
  ];

  for (const [name, apply] of attacks) {
    assert.throws(() => verifyManifest(mutate(apply)), undefined, name);
  }
});

test("the verifier rejects changed, truncated, swapped, linked, and undeclared local artifacts", async (t) => {
  const sourceDirectory = process.env.VECTOR_F16_SOURCE_DIR;
  if (!sourceDirectory) {
    t.skip("set VECTOR_F16_SOURCE_DIR to the reviewed six-file offline bundle");
    return;
  }

  const result = await verifySourceDirectory(manifest, resolve(sourceDirectory));
  assert.equal(result.artifacts, 3);
  assert.equal(result.metadataRecords, 3);
  assert.equal(result.admissionEligible, false);
  assert.equal(result.networkAccessed, false);
  assert.equal(result.renders, 16);

  const expectedFiles = manifest.artifacts.flatMap(({ pdf, metadata }) => [pdf.fileName, metadata.fileName]);
  const attack = async (apply, pattern) => {
    const directory = mkdtempSync(join(tmpdir(), "vector-f16-source-attack-"));
    try {
      for (const file of expectedFiles) copyFileSync(resolve(sourceDirectory, file), resolve(directory, file));
      apply(directory);
      await assert.rejects(() => verifySourceDirectory(manifest, directory), pattern);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  };
  await attack((directory) => writeFileSync(resolve(directory, "undeclared.bin"), "x"), /inventory differs/);
  await attack((directory) => writeFileSync(resolve(directory, "TM74078.pdf"), "truncated"), /size or digest mismatch/);
  await attack((directory) => {
    const left = readFileSync(resolve(directory, "TM74078.pdf"));
    const right = readFileSync(resolve(directory, "CR172354.pdf"));
    writeFileSync(resolve(directory, "TM74078.pdf"), right);
    writeFileSync(resolve(directory, "CR172354.pdf"), left);
  }, /size or digest mismatch/);
  await attack((directory) => writeFileSync(resolve(directory, "19780003061.json"), "{}"), /size or digest mismatch/);
  await attack((directory) => {
    unlinkSync(resolve(directory, "TM87766.pdf"));
    symlinkSync(resolve(sourceDirectory, "TM87766.pdf"), resolve(directory, "TM87766.pdf"));
  }, /regular non-symlink/);

  const compressedRoot = mkdtempSync(join(tmpdir(), "vector-f16-compressed-source-"));
  try {
    mkdirSync(resolve(compressedRoot, "governance", "nasa-historical-f16-store-source"), { recursive: true });
    copyFileSync(manifestPath, resolve(compressedRoot, "governance", "nasa-historical-f16-store-source", "manifest.v1.json"));
    writeFileSync(resolve(compressedRoot, "governance", "nasa-historical-f16-store-source", "README.md"), "source-only");
    mkdirSync(resolve(compressedRoot, "docs"), { recursive: true });
    writeFileSync(resolve(compressedRoot, "docs", "innocuous.bin"), gzipSync(readFileSync(resolve(sourceDirectory, "TM74078.pdf"))));
    assert.throws(() => verifyCommittedInventory(compressedRoot), /raw source or render identity/);
  } finally {
    rmSync(compressedRoot, { recursive: true, force: true });
  }
});

test("production code and built runtime inputs cannot import or name the source-only contract", () => {
  assert.deepEqual(verifyCommittedInventory(resolve(".")), {
    files: ["README.md", "manifest.v1.json"],
    rawArtifactsCommitted: 0,
  });
  const result = verifyProductionIsolation(resolve("."));
  assert.equal(result.forbiddenReferences, 0);
  assert.ok(result.filesInspected > 100, "the production scan must cover the repository runtime roots");

  const attackRoot = mkdtempSync(join(tmpdir(), "vector-f16-isolation-attack-"));
  try {
    mkdirSync(resolve(attackRoot, "engine-rust", "src"), { recursive: true });
    mkdirSync(resolve(attackRoot, ".next", "server"), { recursive: true });
    writeFileSync(resolve(attackRoot, ".next", "server", "route.js"), "NASA_TM87766_FSD_F16A_DECOUPLER_FLIGHT_TEST");
    assert.throws(() => verifyProductionIsolation(attackRoot), /production boundary references/);
    unlinkSync(resolve(attackRoot, ".next", "server", "route.js"));
    writeFileSync(resolve(attackRoot, "engine-rust", "src", "forged.rs"), manifest.artifacts[0].pdf.sha256);
    assert.throws(() => verifyProductionIsolation(attackRoot), /production boundary references/);
  } finally {
    rmSync(attackRoot, { recursive: true, force: true });
  }
});

test("raw source or render identities cannot be hidden elsewhere in the repository", () => {
  const attackRoot = mkdtempSync(join(tmpdir(), "vector-f16-raw-attack-"));
  try {
    mkdirSync(resolve(attackRoot, "governance", "nasa-historical-f16-store-source"), { recursive: true });
    copyFileSync(manifestPath, resolve(attackRoot, "governance", "nasa-historical-f16-store-source", "manifest.v1.json"));
    writeFileSync(resolve(attackRoot, "governance", "nasa-historical-f16-store-source", "README.md"), "source-only");
    mkdirSync(resolve(attackRoot, "docs"), { recursive: true });
    writeFileSync(resolve(attackRoot, "docs", "TM74078.pdf"), Buffer.from(manifest.artifacts[0].pdf.sha256, "hex"));
    assert.throws(() => verifyCommittedInventory(attackRoot), /raw source or render identity/);
  } finally {
    rmSync(attackRoot, { recursive: true, force: true });
  }

  const symlinkRoot = mkdtempSync(join(tmpdir(), "vector-f16-root-link-"));
  const targetRoot = mkdtempSync(join(tmpdir(), "vector-f16-root-target-"));
  try {
    mkdirSync(resolve(symlinkRoot, "governance"), { recursive: true });
    mkdirSync(resolve(targetRoot, "source"), { recursive: true });
    writeFileSync(resolve(targetRoot, "source", "README.md"), "source-only");
    copyFileSync(manifestPath, resolve(targetRoot, "source", "manifest.v1.json"));
    symlinkSync(resolve(targetRoot, "source"), resolve(symlinkRoot, "governance", "nasa-historical-f16-store-source"));
    assert.throws(() => verifyCommittedInventory(symlinkRoot), /real non-symlink directory/);
  } finally {
    rmSync(symlinkRoot, { recursive: true, force: true });
    rmSync(targetRoot, { recursive: true, force: true });
  }
});
