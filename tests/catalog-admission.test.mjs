import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { admitCatalogCredibility } from "../lib/catalog-admission.ts";
import {
  CREDIBILITY_MANIFEST_SCHEMA_VERSION,
  INTENDED_USE_SCHEMA_VERSION,
} from "../lib/model-pack.ts";
import { createCurrentModelPackSource } from "../lib/reference-model-pack.ts";
import { SCENARIO_PACKAGE_SCHEMA_VERSION } from "../lib/scenario-package.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { ENGINE_VERSION } from "../lib/engine/version.ts";

const bundle = JSON.parse(
  await readFile(
    new URL(
      "../fixtures/model-packs/vector-scalar-study-v0.9.compiled.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

function rows() {
  const intendedUse = createCurrentModelPackSource().intendedUses[0];
  const manifest = structuredClone(bundle.credibilityManifest);
  const pack = structuredClone(bundle.pack);
  return {
    scenarioTemplates: SCENARIO_LIBRARY.map((definition) => ({
      id: definition.id,
      version: definition.version,
      domain: definition.domain,
      title: definition.title,
      status: "VALIDATED",
      package: definition,
      schema_version: SCENARIO_PACKAGE_SCHEMA_VERSION,
      content_hash: "a".repeat(64),
      engine_version: ENGINE_VERSION,
      intended_use_id: definition.intendedUse.id,
      intended_use_version: definition.intendedUse.version,
      model_pack_id: definition.modelPack.id,
      model_pack_version: definition.modelPack.version,
      model_pack_digest: definition.modelPack.digest,
    })),
    intendedUses: [{
      id: intendedUse.id,
      version: intendedUse.version,
      schema_version: INTENDED_USE_SCHEMA_VERSION,
      definition: intendedUse,
      content_hash: "b".repeat(64),
    }],
    compiledModelPacks: [{
      id: pack.id,
      version: pack.version,
      schema_version: pack.schemaVersion,
      digest: pack.digest,
      payload: pack,
      credibility_manifest_id: manifest.id,
      credibility_manifest_version: manifest.version,
    }],
    credibilityManifests: [{
      id: manifest.id,
      version: manifest.version,
      schema_version: CREDIBILITY_MANIFEST_SCHEMA_VERSION,
      subject_kind: manifest.subject.kind,
      subject_id: manifest.subject.id,
      subject_digest: manifest.subject.digest,
      manifest,
      content_hash: manifest.contentDigest,
      approval_state: manifest.approvalState,
    }],
  };
}

test("catalog admission binds every scenario to one intended use, SI pack, manifest, and limitation set", () => {
  const [admission] = admitCatalogCredibility(rows());

  assert.equal(admission.state, "ADMITTED_WITH_LIMITATIONS");
  assert.equal(admission.modelPack.digest, bundle.pack.digest);
  assert.equal(admission.credibilityManifest.approvalState, "DRAFT");
  assert.equal(admission.credibilityManifest.limitations[0].severity, "BLOCKING");
  assert.ok(admission.namedAircraftPerformance.every((item) => item.state === "UNSUPPORTED"));
  assert.ok(admission.namedAircraftPerformance.every((item) => item.reason));
  assert.deepEqual(
    admission.scenarioTemplateIds,
    SCENARIO_LIBRARY.map((item) => item.id).sort(),
  );
});

test("catalog admission fails closed for missing or mismatched credibility records", () => {
  const missingPack = rows();
  missingPack.compiledModelPacks = [];
  assert.throws(
    () => admitCatalogCredibility(missingPack),
    /missing model pack/,
  );

  const mismatchedDigest = rows();
  mismatchedDigest.compiledModelPacks[0].payload.digest = "0".repeat(64);
  assert.throws(
    () => admitCatalogCredibility(mismatchedDigest),
    /payload digest mismatch/,
  );

  const missingLimitations = rows();
  missingLimitations.credibilityManifests[0].manifest.limitations = [];
  assert.throws(
    () => admitCatalogCredibility(missingLimitations),
    /unapproved pack must carry explicit limitations/,
  );

  const mismatchedApproval = rows();
  mismatchedApproval.credibilityManifests[0].approval_state =
    "APPROVED_FOR_DECLARED_USE";
  assert.throws(
    () => admitCatalogCredibility(mismatchedApproval),
    /approval state mismatch/,
  );

  const missingNamedPerformanceBoundary = rows();
  delete missingNamedPerformanceBoundary.compiledModelPacks[0].payload.aircraft[0].performanceAdmission;
  assert.throws(
    () => admitCatalogCredibility(missingNamedPerformanceBoundary),
    /expected an object/,
  );
});
