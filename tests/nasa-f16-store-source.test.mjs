import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
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
  verifyReleaseOwnerVisualReview,
  verifySourceDirectory,
  verifySourceTermsAuthority,
} from "../scripts/verify-nasa-f16-store-source.mjs";

const manifestPath = resolve(
  "governance/nasa-historical-f16-store-source/manifest.v1.json",
);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const governedRoot = resolve("governance/nasa-historical-f16-store-source");
const authority = JSON.parse(readFileSync(resolve(governedRoot, "source-terms-authority.v1.json"), "utf8"));
const visualReview = JSON.parse(readFileSync(resolve(governedRoot, "release-owner-visual-review.v1.json"), "utf8"));
const policyBytes = readFileSync(resolve(governedRoot, authority.policyArtifact.repositoryPath));
const metadataFiles = Object.fromEntries(manifest.artifacts.map((artifact) => [
  artifact.metadata.repositoryPath,
  readFileSync(resolve(governedRoot, artifact.metadata.repositoryPath)),
]));

test("routine policy verification is byte-based and render reproduction is explicit", () => {
  const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
  assert.match(
    packageJson.scripts["policy:nasa-f16-store-source:verify"],
    /scripts\/verify-nasa-f16-store-source\.mjs --source-dir governance\/nasa-historical-f16-store-source\/sources --integrity-only/u,
  );
  assert.match(packageJson.scripts["policy:nasa-f16-store-source:render-verify"], /scripts\/verify-nasa-f16-store-source\.mjs --source-dir governance\/nasa-historical-f16-store-source\/sources/u);
  assert.doesNotMatch(packageJson.scripts["policy:nasa-f16-store-source:render-verify"], /--integrity-only/u);
  const omitted = spawnSync(
    process.execPath,
    ["--require", "./scripts/lib/generic-sensor-network-deny.cjs", "scripts/verify-nasa-f16-store-source.mjs"],
    { encoding: "utf8" },
  );
  assert.notEqual(omitted.status, 0);
  assert.match(omitted.stderr, /CLI verification requires --source-dir/u);
});

const mutate = (apply) => {
  const candidate = structuredClone(manifest);
  apply(candidate);
  return candidate;
};

test("the historical F-16 store corpus is immutable, source-terms authorized, visually reviewed, and source-only", () => {
  const result = verifyManifest(manifest);
  assert.deepEqual(result, {
    artifacts: 3,
    decisionsAuthorized: 3,
    id: "nasa-historical-f16-store-source-20260824",
    pageMaps: 16,
    schemaVersion: "vector.nasa-historical-f16-store-source-manifest.v1",
    visualQaReviewed: 16,
  });
  assert.throws(
    () => assertSourceAdmissionEligible(manifest),
    /source-only manifest cannot admit executable behavior/,
  );
  assert.equal(manifest.referenceUseDecision.value, "SOURCE_TERMS_AUTHORIZED_INTERNAL_VERIFICATION_ONLY");
  assert.equal(manifest.redistributionDecision.value, "SOURCE_TERMS_AUTHORIZED_EXACT_BYTES_AND_DECLARED_RENDERS");
  assert.equal(manifest.exportReviewDecision.value, "SOURCE_METADATA_NO_RESTRICTION");
  assert.deepEqual(manifest.permissions, {
    adaptation: false,
    execution: false,
    modelAdmission: false,
    numericOrEquationTranscription: false,
    runtime: false,
  });
  assert.equal(manifest.decisions, undefined);
});

test("source terms and release-owner review are exact, separate, non-legal, and fail closed", () => {
  assert.deepEqual(verifySourceTermsAuthority(manifest, authority, policyBytes, metadataFiles), {
    authorityKind: "AUTHORITATIVE_SOURCE_TERMS",
    legalApproval: false,
    metadataRecords: 3,
  });
  assert.deepEqual(verifyReleaseOwnerVisualReview(manifest, visualReview), {
    legalApproval: false,
    reviewedPages: 16,
    reviewerRole: "RELEASE_OWNER_REVIEW",
  });

  const authorityAttacks = [
    ["fabricated human requirement", (value) => { value.humanReviewerRequired = true; }],
    ["fabricated legal approval", (value) => { value.legalApproval = true; }],
    ["changed policy URL", (value) => { value.policyArtifact.url = "https://example.invalid/policy.pdf"; }],
    ["changed metadata evidence", (value) => { value.metadataEvidence[0].sha256 = "0".repeat(64); }],
    ["broadened redistribution scope", (value) => { value.decisions.redistribution.scope = "ANY_DERIVATIVE"; }],
  ];
  for (const [name, apply] of authorityAttacks) {
    const candidate = structuredClone(authority);
    apply(candidate);
    assert.throws(() => verifySourceTermsAuthority(manifest, candidate, policyBytes, metadataFiles), undefined, name);
  }
  assert.throws(
    () => verifySourceTermsAuthority(manifest, authority, Buffer.from("changed"), metadataFiles),
    /policy bytes or identity differ/,
  );
  assert.throws(
    () => verifySourceTermsAuthority(manifest, authority, policyBytes, {
      ...metadataFiles,
      "sources/19780003061.json": Buffer.from("changed"),
    }),
    /metadata evidence differs/,
  );

  const visualAttacks = [
    ["human/legal role laundering", (value) => { value.reviewerRole = "AUTHORIZED_HUMAN"; }],
    ["fabricated visual legal approval", (value) => { value.legalApproval = true; }],
    ["numeric transcription claim", (value) => { value.numericOrEquationTranscriptionPerformed = true; }],
    ["different manifest", (value) => { value.subject.manifestCanonicalDigest = "0".repeat(64); }],
    ["changed page mapping", (value) => { value.reviewedPages[0].pdfPage = 5; }],
    ["changed render identity", (value) => { value.reviewedPages[0].displayRender.sha256 = "0".repeat(64); }],
    ["broadened semantic category", (value) => { value.reviewedPages[0].eligibleCategory = "COMPATIBILITY_MATRIX"; }],
  ];
  for (const [name, apply] of visualAttacks) {
    const candidate = structuredClone(visualReview);
    apply(candidate);
    assert.throws(() => verifyReleaseOwnerVisualReview(manifest, candidate), undefined, name);
  }
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

test("the verifier rejects changed, truncated, swapped, linked, and undeclared local artifacts", async () => {
  const sourceDirectory = process.env.VECTOR_F16_SOURCE_DIR
    ? resolve(process.env.VECTOR_F16_SOURCE_DIR)
    : resolve(governedRoot, "sources");

  const result = await verifySourceDirectory(manifest, sourceDirectory, { render: false });
  assert.equal(result.artifacts, 3);
  assert.equal(result.metadataRecords, 3);
  assert.equal(result.admissionEligible, false);
  assert.equal(result.networkAccessed, false);
  assert.equal(result.renders, 0);

  const expectedFiles = manifest.artifacts.flatMap(({ pdf, metadata }) => [pdf.fileName, metadata.fileName]);
  const attack = async (apply, pattern) => {
    const directory = mkdtempSync(join(tmpdir(), "vector-f16-source-attack-"));
    try {
      for (const file of expectedFiles) copyFileSync(resolve(sourceDirectory, file), resolve(directory, file));
      apply(directory);
      await assert.rejects(() => verifySourceDirectory(manifest, directory, { render: false }), pattern);
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
    mkdirSync(resolve(compressedRoot, "governance"), { recursive: true });
    cpSync(governedRoot, resolve(compressedRoot, "governance", "nasa-historical-f16-store-source"), { recursive: true });
    mkdirSync(resolve(compressedRoot, "docs"), { recursive: true });
    writeFileSync(resolve(compressedRoot, "docs", "innocuous.bin"), gzipSync(readFileSync(resolve(sourceDirectory, "TM74078.pdf"))));
    assert.throws(() => verifyCommittedInventory(compressedRoot), /raw source or render identity/);
  } finally {
    rmSync(compressedRoot, { recursive: true, force: true });
  }
});

test("production code and built runtime inputs cannot import or name the source-only contract", () => {
  assert.deepEqual(verifyCommittedInventory(resolve(".")), {
    files: 29,
    governedQuarantineFiles: 27,
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

test("the committed quarantine rejects missing, extra, linked, changed, or mismatched governed evidence", () => {
  const attack = (apply, pattern) => {
    const attackRoot = mkdtempSync(join(tmpdir(), "vector-f16-committed-attack-"));
    try {
      mkdirSync(resolve(attackRoot, "governance"), { recursive: true });
      const attackBundle = resolve(attackRoot, "governance", "nasa-historical-f16-store-source");
      cpSync(governedRoot, attackBundle, { recursive: true });
      apply(attackBundle);
      assert.throws(() => verifyCommittedInventory(attackRoot), pattern);
    } finally {
      rmSync(attackRoot, { recursive: true, force: true });
    }
  };

  attack((bundle) => unlinkSync(resolve(bundle, manifest.artifacts[0].pdf.repositoryPath)), /inventory differs/);
  attack((bundle) => writeFileSync(resolve(bundle, "renders", "undeclared.png"), "x"), /inventory differs/);
  attack((bundle) => writeFileSync(resolve(bundle, manifest.artifacts[0].pageMaps[0].render.displayPath), "changed"), /size or digest differs/);
  attack((bundle) => writeFileSync(resolve(bundle, "source-terms-authority.v1.json"), "{}\n"), undefined);
  attack((bundle) => writeFileSync(resolve(bundle, "release-owner-visual-review.v1.json"), "{}\n"), undefined);
  attack((bundle) => {
    const path = resolve(bundle, manifest.artifacts[2].metadata.repositoryPath);
    unlinkSync(path);
    symlinkSync(resolve(governedRoot, manifest.artifacts[2].metadata.repositoryPath), path);
  }, /symlink/);
});

test("raw source or render identities cannot be hidden elsewhere in the repository", () => {
  const attackRoot = mkdtempSync(join(tmpdir(), "vector-f16-raw-attack-"));
  try {
    mkdirSync(resolve(attackRoot, "governance"), { recursive: true });
    cpSync(governedRoot, resolve(attackRoot, "governance", "nasa-historical-f16-store-source"), { recursive: true });
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
