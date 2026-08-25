import rawCatalogue from "../governance/installation-catalogue.v2.json" with { type: "json" };
import { sha256Identity } from "./geospatial/digest.ts";
import type { DatasetIdentity } from "./geospatial/contracts.ts";

export type InstallationService = "IAF" | "PAF";
export type InstallationType = "MAIN_OPERATING_BASE" | "FORWARD_OPERATING_BASE" | "AIR_STATION";

export type InstallationCatalogueRecord = {
  id: string;
  service: InstallationService;
  name: string;
  icaoCode?: string;
  longitude: number;
  latitude: number;
  elevationFt?: number;
  runwayInfo?: string;
  type: InstallationType;
  sourceId: "iaf-stations-wikipedia" | "shield-paf-orbat-2026-05-19";
  coordinateDatum: "WGS84";
  /** `null` means the source did not publish a reviewed positional uncertainty. */
  positionalUncertaintyM: number | null;
  provenance: "PUBLIC_REFERENCE";
  reviewState: "UNVERIFIED";
  aliases: string[];
  runwaySourceAirportIdent: string;
  runwayEvidence: "OURAIRPORTS_PUBLIC_DOMAIN";
  runwayIds: string[];
  groundStartState: "SUPPORTED_PUBLIC_EDUCATIONAL" | "UNSUPPORTED_INCOMPLETE_EVIDENCE";
};

export type RunwayCatalogueRecord = {
  id: string;
  installationId: string;
  sourceRunwayId: string;
  sourceAirportIdent: string;
  designator: string;
  trueHeadingDeg: number | null;
  reciprocalTrueHeadingDeg: number | null;
  lengthM: number | null;
  widthM: number | null;
  surface: string | null;
  closedInSource: boolean;
  centreline: { type: "LineString"; coordinates: [[number, number], [number, number]] } | null;
  thresholdElevationsMslM: { low: number; high: number } | null;
  horizontalDatum: "WGS84";
  verticalDatum: "MSL_REPORTED_BY_SOURCE";
  positionalUncertaintyM: null;
  provenance: "SOURCED_DATASET";
  reviewState: "UNVERIFIED_PUBLIC_REFERENCE";
  missionStartEligibility: "PUBLIC_EDUCATIONAL" | "INELIGIBLE";
  limitation: string;
};

export type InstallationCatalogueContent = {
  schemaVersion: "vector.installation-catalogue.v2";
  id: "vector.public-reference-installations";
  version: "2.0.0";
  intendedUse: "PUBLIC_EDUCATIONAL";
  coverage: {
    declaredServiceCoverage: "BOUNDED_PUBLIC_REFERENCE_FIXTURE";
    includedRecordCount: number;
    geographicCoverage: string;
    installationTypeCoverage: InstallationType[];
    knownGaps: string[];
    runwayRecordCount: number;
    eligibleRunwayRecordCount: number;
  };
  validity: { retrievedOn: string; validFrom: null; validUntil: null };
  review: { state: "PUBLIC_REFERENCE_UNVERIFIED"; reviewedOn: string };
  sources: Array<{
    id: string;
    title: string;
    publisher: string;
    url: string;
    license: "SOURCE_LICENSE_NOT_VERIFIED" | "OPERATOR_SUPPLIED_PUBLIC_REFERENCE" | "Unlicense";
  }>;
  records: InstallationCatalogueRecord[];
  runways: RunwayCatalogueRecord[];
};

export type InstallationCatalogue = InstallationCatalogueContent & {
  identity: DatasetIdentity;
};

function assertInstallationCatalogueContent(value: InstallationCatalogueContent): void {
  if (value.schemaVersion !== "vector.installation-catalogue.v2") {
    throw new TypeError("Unsupported installation catalogue schema.");
  }
  if (value.coverage.declaredServiceCoverage !== "BOUNDED_PUBLIC_REFERENCE_FIXTURE") {
    throw new TypeError("Installation catalogue must not claim complete IAF or PAF coverage.");
  }
  if (value.coverage.includedRecordCount !== value.records.length || value.records.length === 0) {
    throw new TypeError("Installation catalogue count does not match its records.");
  }
  if (value.coverage.knownGaps.length === 0) {
    throw new TypeError("Installation catalogue must state its known coverage gaps.");
  }
  const sourceIds = new Set(value.sources.map((source) => source.id));
  const ids = new Set<string>();
  for (const record of value.records) {
    if (ids.has(record.id)) throw new TypeError(`Duplicate installation identity ${record.id}.`);
    ids.add(record.id);
    if (!sourceIds.has(record.sourceId)) throw new TypeError(`Installation ${record.id} has an unknown source.`);
    if (record.coordinateDatum !== "WGS84" || !Number.isFinite(record.longitude) || !Number.isFinite(record.latitude)) {
      throw new TypeError(`Installation ${record.id} requires finite WGS84 coordinates.`);
    }
    if (record.longitude < -180 || record.longitude > 180 || record.latitude < -90 || record.latitude > 90) {
      throw new RangeError(`Installation ${record.id} is outside WGS84 bounds.`);
    }
    if (record.positionalUncertaintyM !== null && (!Number.isFinite(record.positionalUncertaintyM) || record.positionalUncertaintyM < 0)) {
      throw new TypeError(`Installation ${record.id} has invalid positional uncertainty.`);
    }
  }
  const runwayIds = new Set<string>();
  for (const runway of value.runways) {
    if (runwayIds.has(runway.id)) throw new TypeError(`Duplicate runway identity ${runway.id}.`);
    runwayIds.add(runway.id);
    if (!ids.has(runway.installationId)) throw new TypeError(`Runway ${runway.id} has an unknown installation.`);
    if (runway.horizontalDatum !== "WGS84" || runway.verticalDatum !== "MSL_REPORTED_BY_SOURCE") {
      throw new TypeError(`Runway ${runway.id} has an unsupported datum.`);
    }
    if (runway.missionStartEligibility === "PUBLIC_EDUCATIONAL") {
      if (runway.closedInSource || !runway.centreline || !runway.thresholdElevationsMslM
        || !(runway.lengthM! > 0) || !(runway.widthM! > 0)
        || !Number.isFinite(runway.trueHeadingDeg)) {
        throw new TypeError(`Runway ${runway.id} lacks sufficient public-educational start evidence.`);
      }
    }
  }
  if (value.coverage.runwayRecordCount !== value.runways.length
    || value.coverage.eligibleRunwayRecordCount !== value.runways.filter((runway) => runway.missionStartEligibility === "PUBLIC_EDUCATIONAL").length) {
    throw new TypeError("Installation catalogue runway counts do not match its records.");
  }
  for (const record of value.records) {
    if (record.runwayIds.some((id) => !runwayIds.has(id))) {
      throw new TypeError(`Installation ${record.id} references an unknown runway.`);
    }
  }
}

const content = rawCatalogue as InstallationCatalogueContent;
assertInstallationCatalogueContent(content);

/**
 * Single immutable input for seed data, compilation, and coverage presentation.
 * PostGIS is canonical for published geometry. This checked-in content is the
 * reproducible seed/compiled-pack artifact, never a second hand-edited list.
 */
export const INSTALLATION_CATALOGUE: InstallationCatalogue = Object.freeze({
  ...content,
  identity: Object.freeze({
    id: content.id,
    version: content.version,
    digest: sha256Identity(content),
  }),
});

export const INSTALLATION_CATALOGUE_IDENTITY = INSTALLATION_CATALOGUE.identity;

/** Compatibility projection for current seed, compiler, and test consumers. */
export type PublicInstallation = Pick<InstallationCatalogueRecord,
  "id" | "service" | "name" | "icaoCode" | "longitude" | "latitude" |
  "elevationFt" | "runwayInfo" | "type" | "sourceId"
> & { dataState: "PUBLIC_REFERENCE" };

export const PUBLIC_INSTALLATIONS: readonly PublicInstallation[] = Object.freeze(
  INSTALLATION_CATALOGUE.records.map((record) => Object.freeze({
    id: record.id,
    service: record.service,
    name: record.name,
    icaoCode: record.icaoCode,
    longitude: record.longitude,
    latitude: record.latitude,
    elevationFt: record.elevationFt,
    runwayInfo: record.runwayInfo,
    type: record.type,
    sourceId: record.sourceId,
    dataState: "PUBLIC_REFERENCE" as const,
  })),
);

export function findInstallationCatalogueRecord(id: string): InstallationCatalogueRecord | undefined {
  return INSTALLATION_CATALOGUE.records.find((record) => record.id === id);
}

export function findRunwayCatalogueRecord(id: string): RunwayCatalogueRecord | undefined {
  return INSTALLATION_CATALOGUE.runways.find((runway) => runway.id === id);
}

/**
 * Explicit public-educational reconciliation envelope for a source-reported
 * runway threshold and the coarser preprocessed DEM surface. This is a model
 * assumption, not source uncertainty; disagreement outside it fails closed.
 */
export const MAX_RUNWAY_DEM_DISAGREEMENT_M = 30;

export function reconcileGroundStartElevation(runwayMslM: number, terrainMslM: number) {
  if (![runwayMslM, terrainMslM].every(Number.isFinite)
    || Math.abs(runwayMslM - terrainMslM) > MAX_RUNWAY_DEM_DISAGREEMENT_M) {
    throw new TypeError("Runway threshold and admitted DEM elevations conflict outside the declared reconciliation envelope.");
  }
  return Object.freeze({
    valueM: Math.max(runwayMslM, terrainMslM) + 0.01,
    datum: "MSL" as const,
    provenance: "MODEL_ASSUMPTION" as const,
    runwayMslM,
    terrainMslM,
    maximumDisagreementM: MAX_RUNWAY_DEM_DISAGREEMENT_M,
  });
}

function pointInsidePolygon(point: [number, number], ring: Array<[number, number]>) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const [currentX, currentY] = ring[current];
    const [previousX, previousY] = ring[previous];
    const cross = (point[1] - currentY) * (previousX - currentX) - (point[0] - currentX) * (previousY - currentY);
    const onSegment = Math.abs(cross) <= 1e-10
      && point[0] >= Math.min(currentX, previousX) && point[0] <= Math.max(currentX, previousX)
      && point[1] >= Math.min(currentY, previousY) && point[1] <= Math.max(currentY, previousY);
    if (onSegment) return true;
    if ((currentY > point[1]) !== (previousY > point[1])
      && point[0] < ((previousX - currentX) * (point[1] - currentY)) / (previousY - currentY) + currentX) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Public-educational ground-start evidence boundary. This admits only exact
 * runway records carried by the selected environment coverage; it never turns
 * a point installation, text runway note, or current-status assumption into a
 * runway start.
 */
export function admitGroundStart(input: {
  pack: {
    installationCoverage: { catalogue: DatasetIdentity };
    coverage: { geometry: { type: "Polygon"; coordinates: Array<Array<[number, number]>> } };
  };
  installationId: string;
  runwayId: string;
}) {
  if (input.pack.installationCoverage.catalogue.id !== INSTALLATION_CATALOGUE_IDENTITY.id
    || input.pack.installationCoverage.catalogue.version !== INSTALLATION_CATALOGUE_IDENTITY.version
    || input.pack.installationCoverage.catalogue.digest !== INSTALLATION_CATALOGUE_IDENTITY.digest) {
    throw new TypeError("Ground-start installation catalogue does not match the selected environment pack.");
  }
  const installation = findInstallationCatalogueRecord(input.installationId);
  const runway = findRunwayCatalogueRecord(input.runwayId);
  if (!installation || !runway || runway.installationId !== installation.id
    || runway.missionStartEligibility !== "PUBLIC_EDUCATIONAL"
    || !runway.centreline || !runway.thresholdElevationsMslM || runway.trueHeadingDeg === null) {
    throw new TypeError("Ground start is not available because sufficient runway evidence is missing.");
  }
  const ring = input.pack.coverage.geometry.coordinates[0];
  if (!ring || runway.centreline.coordinates.some((coordinate) => !pointInsidePolygon(coordinate, ring))) {
    throw new TypeError("Ground-start runway is outside the selected environment coverage.");
  }
  return Object.freeze({
    schemaVersion: "vector.ground-start.v1" as const,
    installationId: installation.id,
    runwayId: runway.id,
    threshold: {
      longitudeDeg: runway.centreline.coordinates[0][0],
      latitudeDeg: runway.centreline.coordinates[0][1],
    },
    altitude: { valueM: runway.thresholdElevationsMslM.low, datum: "MSL" as const },
    trueHeadingDeg: runway.trueHeadingDeg,
    runwayLengthM: runway.lengthM!,
    runwayWidthM: runway.widthM!,
    surface: runway.surface!,
    sourceRunwayId: runway.sourceRunwayId,
    limitation: runway.limitation,
    terrainReconciliation: {
      maximumDisagreementM: MAX_RUNWAY_DEM_DISAGREEMENT_M,
      provenance: "MODEL_ASSUMPTION" as const,
      policy: "FAIL_CLOSED_OUTSIDE_ENVELOPE" as const,
    },
  });
}

/**
 * PostGIS remains the authority for published map geometry. The catalog route
 * calls this boundary before exposing rows so a stale or partially seeded
 * database cannot be presented as the immutable compiled-pack catalogue.
 */
export function assertPublishedInstallationCatalogueRows(rows: readonly Record<string, unknown>[]): void {
  if (rows.length !== INSTALLATION_CATALOGUE.records.length) {
    throw new TypeError("Published installation catalogue count does not match the declared coverage manifest.");
  }
  const seen = new Set<string>();
  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id : "";
    const record = findInstallationCatalogueRecord(id);
    if (!record || seen.has(id)) {
      throw new TypeError(`Published installation ${id || "<missing>"} is not in the declared coverage manifest.`);
    }
    seen.add(id);
    const eligibleRunwayId = INSTALLATION_CATALOGUE.runways
      .filter((runway) => runway.installationId === record.id && runway.missionStartEligibility === "PUBLIC_EDUCATIONAL")
      .map((runway) => runway.id)
      .sort()[0] ?? null;
    if (row.service !== record.service
      || row.name !== record.name
      || (row.icao_code ?? undefined) !== record.icaoCode
      || (row.elevation_ft === null ? undefined : Number(row.elevation_ft)) !== record.elevationFt
      || (row.runway_info ?? undefined) !== record.runwayInfo
      || row.installation_type !== record.type
      || row.public_reference !== true
      || row.source_id !== record.sourceId
      || Number(row.longitude) !== record.longitude
      || Number(row.latitude) !== record.latitude
      || row.coordinate_datum !== record.coordinateDatum
      || (row.positional_uncertainty_m === null ? null : Number(row.positional_uncertainty_m)) !== record.positionalUncertaintyM
      || row.provenance !== record.provenance
      || row.review_state !== record.reviewState
      || row.ground_start_supported !== Boolean(eligibleRunwayId)
      || (row.ground_start_runway_id ?? null) !== eligibleRunwayId) {
      throw new TypeError(`Published installation ${id} does not match its exact declared identity, geometry, datum, provenance, or runway eligibility.`);
    }
  }
}

export function assertPublishedRunwayCatalogueRows(rows: readonly Record<string, unknown>[]): void {
  if (rows.length !== INSTALLATION_CATALOGUE.runways.length) {
    throw new TypeError("Published runway catalogue count does not match the declared coverage manifest.");
  }
  for (const runway of INSTALLATION_CATALOGUE.runways) {
    const row = rows.find((candidate) => candidate.id === runway.id);
    if (!row || row.installation_id !== runway.installationId
      || row.source_runway_id !== runway.sourceRunwayId
      || row.source_airport_ident !== runway.sourceAirportIdent
      || row.designator !== runway.designator
      || (row.true_heading_deg === null ? null : Number(row.true_heading_deg)) !== runway.trueHeadingDeg
      || (row.reciprocal_true_heading_deg === null ? null : Number(row.reciprocal_true_heading_deg)) !== runway.reciprocalTrueHeadingDeg
      || (row.length_m === null ? null : Number(row.length_m)) !== runway.lengthM
      || (row.width_m === null ? null : Number(row.width_m)) !== runway.widthM
      || (row.surface ?? null) !== runway.surface
      || row.closed_in_source !== runway.closedInSource
      || row.horizontal_datum !== runway.horizontalDatum
      || row.vertical_datum !== runway.verticalDatum
      || (row.positional_uncertainty_m === null ? null : Number(row.positional_uncertainty_m)) !== runway.positionalUncertaintyM
      || row.provenance !== runway.provenance
      || row.review_state !== runway.reviewState
      || row.mission_start_eligibility !== runway.missionStartEligibility
      || row.limitation !== runway.limitation
      || row.content_hash !== sha256Identity(runway)
      || sha256Identity(row.centreline) !== sha256Identity(runway.centreline)
      || sha256Identity(row.threshold_elevations_msl_m) !== sha256Identity(runway.thresholdElevationsMslM)) {
      throw new TypeError(`Published runway ${runway.id} does not match the immutable catalogue.`);
    }
  }
}

export const DEFAULT_MAP_ORIGIN = { longitude: 74.2, latitude: 31.8 };
