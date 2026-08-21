import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPublishedInstallationCatalogueRows,
  findInstallationCatalogueRecord,
  INSTALLATION_CATALOGUE,
  INSTALLATION_CATALOGUE_IDENTITY,
  PUBLIC_INSTALLATIONS,
} from "../lib/installations.ts";
import { sha256Identity } from "../lib/geospatial/digest.ts";

function publishedRows() {
  return PUBLIC_INSTALLATIONS.map((record) => ({
    id: record.id,
    source_id: record.sourceId,
    longitude: record.longitude,
    latitude: record.latitude,
  }));
}

test("the public-reference installation manifest is complete only for its declared fixture and has an immutable identity", () => {
  assert.equal(INSTALLATION_CATALOGUE.schemaVersion, "vector.installation-catalogue.v1");
  assert.equal(INSTALLATION_CATALOGUE.coverage.declaredServiceCoverage, "BOUNDED_PUBLIC_REFERENCE_FIXTURE");
  assert.equal(INSTALLATION_CATALOGUE.coverage.includedRecordCount, 21);
  assert.equal(INSTALLATION_CATALOGUE.coverage.includedRecordCount, INSTALLATION_CATALOGUE.records.length);
  assert.equal(INSTALLATION_CATALOGUE_IDENTITY.digest, sha256Identity({
    schemaVersion: INSTALLATION_CATALOGUE.schemaVersion,
    id: INSTALLATION_CATALOGUE.id,
    version: INSTALLATION_CATALOGUE.version,
    intendedUse: INSTALLATION_CATALOGUE.intendedUse,
    coverage: INSTALLATION_CATALOGUE.coverage,
    validity: INSTALLATION_CATALOGUE.validity,
    review: INSTALLATION_CATALOGUE.review,
    sources: INSTALLATION_CATALOGUE.sources,
    records: INSTALLATION_CATALOGUE.records,
  }));
  assert.ok(INSTALLATION_CATALOGUE.coverage.knownGaps.some((gap) => gap.includes("not a complete IAF or PAF")));
  for (const record of INSTALLATION_CATALOGUE.records) {
    assert.equal(record.coordinateDatum, "WGS84");
    assert.equal(record.provenance, "PUBLIC_REFERENCE");
    assert.equal(record.reviewState, "UNVERIFIED");
    assert.ok(findInstallationCatalogueRecord(record.id));
  }
});

test("published PostGIS rows must exactly match the declared catalogue instead of silently substituting a static base", () => {
  assert.doesNotThrow(() => assertPublishedInstallationCatalogueRows(publishedRows()));
  assert.throws(
    () => assertPublishedInstallationCatalogueRows(publishedRows().slice(1)),
    /count does not match/,
  );
  const wrongCoordinate = publishedRows();
  wrongCoordinate[0].longitude += 0.001;
  assert.throws(
    () => assertPublishedInstallationCatalogueRows(wrongCoordinate),
    /does not match its declared source and WGS84 position/,
  );
  const unknown = publishedRows();
  unknown[0].id = "unlisted-installation";
  assert.throws(
    () => assertPublishedInstallationCatalogueRows(unknown),
    /not in the declared coverage manifest/,
  );
});
