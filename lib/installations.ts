import rawCatalogue from "../governance/installation-catalogue.v1.json" with { type: "json" };
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
};

export type InstallationCatalogueContent = {
  schemaVersion: "vector.installation-catalogue.v1";
  id: "vector.public-reference-installations";
  version: "1.0.0";
  intendedUse: "PUBLIC_EDUCATIONAL";
  coverage: {
    declaredServiceCoverage: "BOUNDED_PUBLIC_REFERENCE_FIXTURE";
    includedRecordCount: number;
    geographicCoverage: string;
    installationTypeCoverage: InstallationType[];
    knownGaps: string[];
  };
  validity: { startsAt: "-infinity"; endsAt: "+infinity" };
  review: { state: "PUBLIC_REFERENCE_FIXTURE"; verifiedAt: string };
  sources: Array<{
    id: InstallationCatalogueRecord["sourceId"];
    title: string;
    publisher: string;
    url: string;
    license: "SOURCE_LICENSE_NOT_VERIFIED" | "OPERATOR_SUPPLIED_PUBLIC_REFERENCE";
  }>;
  records: InstallationCatalogueRecord[];
};

export type InstallationCatalogue = InstallationCatalogueContent & {
  identity: DatasetIdentity;
};

function assertInstallationCatalogueContent(value: InstallationCatalogueContent): void {
  if (value.schemaVersion !== "vector.installation-catalogue.v1") {
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
    if (row.source_id !== record.sourceId
      || Number(row.longitude) !== record.longitude
      || Number(row.latitude) !== record.latitude) {
      throw new TypeError(`Published installation ${id} does not match its declared source and WGS84 position.`);
    }
  }
}

export const DEFAULT_MAP_ORIGIN = { longitude: 74.2, latitude: 31.8 };
