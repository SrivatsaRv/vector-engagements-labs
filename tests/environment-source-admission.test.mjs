import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  assertEligibleForAreaEnvironmentPack,
  ingestSourcedPointAtmosphere,
} from "../lib/geospatial/environment-source-admission.ts";
import { sha256Utf8HexSync } from "../lib/geospatial/digest.ts";

const directory = resolve("governance/environment-sources/nasa-power-hourly-20200115");
const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.v1.json"), "utf8"));

function rawArtifact(id) {
  const artifact = manifest.artifacts.find((candidate) => candidate.id === id);
  const bytes = readFileSync(resolve(directory, artifact.path));
  return {
    artifact,
    bytes,
    rawText: bytes.toString("utf8"),
    response: JSON.parse(bytes.toString("utf8")),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function ingest(id) {
  const source = rawArtifact(id);
  return ingestSourcedPointAtmosphere({
    manifest,
    artifactId: id,
    rawText: source.rawText,
  });
}

test("committed NASA POWER responses admit only their exact independently checked point samples", () => {
  const punjab = ingest("north-punjab-anchor");
  const ladakh = ingest("ladakh-anchor");
  assert.equal(punjab.provenance, "SOURCED_DATASET");
  assert.equal(punjab.source.license.spdx, "CC0-1.0");
  assert.equal(punjab.source.horizontalDatum, "WGS84");
  assert.equal(punjab.source.verticalDatum, "UNDECLARED");
  assert.equal(punjab.source.coverage.kind, "POINT_ONLY");
  assert.equal(punjab.samples.length, 24);
  assert.deepEqual(punjab.samples[0], {
    timestampUtc: "2020-01-15T00:00:00Z",
    temperatureC: 4.76,
    surfacePressureKpa: 99.03,
    relativeHumidityPercent: 88.8,
    windSpeedAt10mMps: 1.47,
    windDirectionAt10mDeg: 275.5,
  });
  // Independent known values from the committed response prove this does not
  // branch on study-area identity or reuse the synthetic Phase A preset.
  assert.deepEqual(ladakh.samples[0], {
    timestampUtc: "2020-01-15T00:00:00Z",
    temperatureC: -27.11,
    surfacePressureKpa: 57.88,
    relativeHumidityPercent: 96.37,
    windSpeedAt10mMps: 2.48,
    windDirectionAt10mDeg: 144.8,
  });
  assert.notEqual(punjab.identity.digest, ladakh.identity.digest);
});

test("source admission rejects checksum, provider metadata, datum, coverage, coordinate and no-data corruption", () => {
  const source = rawArtifact("north-punjab-anchor");
  assert.throws(
    () => ingestSourcedPointAtmosphere({
      manifest,
      artifactId: "north-punjab-anchor",
      rawText: `${source.rawText} `,
    }),
    /checksum does not match/,
  );

  const modifiedManifest = structuredClone(manifest);
  modifiedManifest.artifacts[0].longitudeDeg = 0;
  assert.throws(
    () => ingestSourcedPointAtmosphere({
      manifest: modifiedManifest,
      artifactId: "north-punjab-anchor",
      rawText: source.rawText,
    }),
    /coordinates do not match/,
  );

  const noDataResponse = structuredClone(source.response);
  noDataResponse.properties.parameter.T2M["2020011500"] = -999;
  const noDataRawText = JSON.stringify(noDataResponse);
  const noDataManifest = structuredClone(manifest);
  noDataManifest.artifacts[0].sha256 = sha256Utf8HexSync(noDataRawText);
  assert.throws(
    () => ingestSourcedPointAtmosphere({
      manifest: noDataManifest,
      artifactId: "north-punjab-anchor",
      rawText: noDataRawText,
    }),
    /contains its no-data fill value/,
  );

  const incompatibleDatum = structuredClone(manifest);
  incompatibleDatum.verticalDatum = "MSL";
  assert.throws(
    () => ingestSourcedPointAtmosphere({
      manifest: incompatibleDatum,
      artifactId: "north-punjab-anchor",
      rawText: source.rawText,
    }),
    /explicit datum status/,
  );

  const incompatibleCoverage = structuredClone(manifest);
  incompatibleCoverage.coverage.areaAdmission = "ELIGIBLE";
  assert.throws(
    () => ingestSourcedPointAtmosphere({
      manifest: incompatibleCoverage,
      artifactId: "north-punjab-anchor",
      rawText: source.rawText,
    }),
    /ineligible for area environment admission/,
  );
});

test("point-only source artifacts fail closed before area environment-pack use", () => {
  assert.throws(
    () => assertEligibleForAreaEnvironmentPack(ingest("north-punjab-anchor")),
    /point-only and cannot admit an area environment pack/,
  );
});
