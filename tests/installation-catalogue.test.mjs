import assert from "node:assert/strict";
import test from "node:test";

import {
  admitGroundStart,
  assertPublishedInstallationCatalogueRows,
  assertPublishedRunwayCatalogueRows,
  findInstallationCatalogueRecord,
  INSTALLATION_CATALOGUE,
  INSTALLATION_CATALOGUE_IDENTITY,
} from "../lib/installations.ts";
import { sha256Identity } from "../lib/geospatial/digest.ts";
import { admitEnvironmentPack } from "../lib/geospatial/environment-pack.ts";

function publishedRows() {
  return INSTALLATION_CATALOGUE.records.map((record) => {
    const eligibleRunwayId = INSTALLATION_CATALOGUE.runways
      .filter((runway) => runway.installationId === record.id && runway.missionStartEligibility === "PUBLIC_EDUCATIONAL")
      .map((runway) => runway.id)
      .sort()[0] ?? null;
    return {
    id: record.id,
    service: record.service,
    name: record.name,
    icao_code: record.icaoCode ?? null,
    elevation_ft: record.elevationFt ?? null,
    runway_info: record.runwayInfo ?? null,
    installation_type: record.type,
    public_reference: true,
    source_id: record.sourceId,
    longitude: record.longitude,
    latitude: record.latitude,
    coordinate_datum: record.coordinateDatum,
    positional_uncertainty_m: record.positionalUncertaintyM,
    provenance: record.provenance,
    review_state: record.reviewState,
    ground_start_supported: Boolean(eligibleRunwayId),
    ground_start_runway_id: eligibleRunwayId,
  };
  });
}

function publishedRunwayRows() {
  return INSTALLATION_CATALOGUE.runways.map((runway) => ({
    id: runway.id,
    installation_id: runway.installationId,
    source_runway_id: runway.sourceRunwayId,
    source_airport_ident: runway.sourceAirportIdent,
    designator: runway.designator,
    true_heading_deg: runway.trueHeadingDeg,
    reciprocal_true_heading_deg: runway.reciprocalTrueHeadingDeg,
    length_m: runway.lengthM,
    width_m: runway.widthM,
    surface: runway.surface,
    closed_in_source: runway.closedInSource,
    centreline: runway.centreline,
    threshold_elevations_msl_m: runway.thresholdElevationsMslM,
    horizontal_datum: runway.horizontalDatum,
    vertical_datum: runway.verticalDatum,
    positional_uncertainty_m: runway.positionalUncertaintyM,
    provenance: runway.provenance,
    review_state: runway.reviewState,
    mission_start_eligibility: runway.missionStartEligibility,
    limitation: runway.limitation,
    content_hash: sha256Identity(runway),
  }));
}

test("the public-reference installation manifest is complete only for its declared fixture and has an immutable identity", () => {
  assert.equal(INSTALLATION_CATALOGUE.schemaVersion, "vector.installation-catalogue.v2");
  assert.equal(INSTALLATION_CATALOGUE.coverage.declaredServiceCoverage, "BOUNDED_PUBLIC_REFERENCE_FIXTURE");
  assert.equal(INSTALLATION_CATALOGUE.coverage.includedRecordCount, 21);
  assert.equal(INSTALLATION_CATALOGUE.coverage.includedRecordCount, INSTALLATION_CATALOGUE.records.length);
  const catalogueContent = Object.fromEntries(
    Object.entries(INSTALLATION_CATALOGUE).filter(([key]) => key !== "identity"),
  );
  assert.equal(INSTALLATION_CATALOGUE_IDENTITY.digest, sha256Identity(catalogueContent));
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
    /does not match its exact declared identity/,
  );
  const wrongProvenance = publishedRows();
  wrongProvenance[0].provenance = "UNKNOWN";
  assert.throws(
    () => assertPublishedInstallationCatalogueRows(wrongProvenance),
    /does not match its exact declared identity/,
  );

  assert.doesNotThrow(() => assertPublishedRunwayCatalogueRows(publishedRunwayRows()));
  const wrongHeading = publishedRunwayRows();
  wrongHeading[0].true_heading_deg = Number(wrongHeading[0].true_heading_deg) + 1;
  assert.throws(
    () => assertPublishedRunwayCatalogueRows(wrongHeading),
    /does not match the immutable catalogue/,
  );
  const unknown = publishedRows();
  unknown[0].id = "unlisted-installation";
  assert.throws(
    () => assertPublishedInstallationCatalogueRows(unknown),
    /not in the declared coverage manifest/,
  );
});

test("ground-start admission requires complete sourced runway geometry and rejects unsupported installations", () => {
  assert.equal(INSTALLATION_CATALOGUE.schemaVersion, "vector.installation-catalogue.v2");
  assert.equal(INSTALLATION_CATALOGUE.coverage.includedRecordCount, 21);
  assert.ok(INSTALLATION_CATALOGUE.runways.length > 0);
  const eligible = INSTALLATION_CATALOGUE.runways.find((runway) =>
    runway.installationId === "iaf-jodhpur" && runway.missionStartEligibility === "PUBLIC_EDUCATIONAL");
  assert.ok(eligible, "Jodhpur must carry complete public-educational runway evidence");
  const pack = admitEnvironmentPack({
    studyAreaId: "rajasthan-desert",
    weatherPresetId: "rajasthan-hot-dry",
    effectiveWeather: { temperatureOffsetC: 0, windEastMps: 0, windNorthMps: 0 },
  }).pack;
  const start = admitGroundStart({ pack, installationId: eligible.installationId, runwayId: eligible.id });
  assert.equal(start.runwayId, eligible.id);
  assert.equal(start.altitude.datum, "MSL");

  const unsupported = INSTALLATION_CATALOGUE.records.find((record) =>
    !INSTALLATION_CATALOGUE.runways.some((runway) => runway.installationId === record.id && runway.missionStartEligibility === "PUBLIC_EDUCATIONAL"));
  assert.ok(unsupported);
  assert.throws(
    () => admitGroundStart({ pack, installationId: unsupported.id, runwayId: "missing" }),
    /runway evidence|not available|coverage/i,
  );
});
