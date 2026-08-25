import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { canonicalJson } from "../lib/canonical-json.ts";
import { admitEnvironmentPack, type RegionalEnvironmentPack } from "../lib/geospatial/environment-pack.ts";
import { sha256HexSync, sha256Identity } from "../lib/geospatial/digest.ts";
import { INSTALLATION_CATALOGUE, INSTALLATION_DATABASE_SOURCES, PUBLIC_INSTALLATIONS } from "../lib/installations.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { STUDY_AREAS } from "../lib/study-areas.ts";

const migrationPath = resolve("db/migrations/014_environment_pack_runways.sql");
const successorMigrationPath = resolve("db/migrations/015_generic_ground_dynamics.sql");
const frozenMigrationSha256 = "c40e91b0fbbf2ee5110ae601dba676d2feec1957ebb440db81703c1696cbd227";
const startMarker = "-- BEGIN GENERATED ENVIRONMENT-PACK SCENARIO PACKAGES";
const endMarker = "-- END GENERATED ENVIRONMENT-PACK SCENARIO PACKAGES";
const checkOnly = process.argv.includes("--check");
const knownArguments = new Set(["--check", "--write"]);
for (const argument of process.argv.slice(2)) {
  if (!knownArguments.has(argument)) throw new Error(`Unknown argument: ${argument}`);
}
if (!checkOnly && !process.argv.includes("--write")) {
  throw new Error("Pass --write to regenerate the migration or --check to verify it.");
}

const existing = readFileSync(migrationPath, "utf8");
if (existsSync(successorMigrationPath)) {
  const actualSha256 = createHash("sha256").update(existing).digest("hex");
  if (actualSha256 !== frozenMigrationSha256) {
    throw new Error(`Historical environment migration 014 changed: expected ${frozenMigrationSha256}, received ${actualSha256}.`);
  }
  if (!checkOnly) {
    throw new Error("Environment migration 014 is frozen; add a forward migration instead of regenerating it.");
  }
  process.stdout.write(`verified frozen environment migration 014 ${actualSha256}\n`);
  process.exit(0);
}

const escapeSqlLiteral = (value: string) => value.replaceAll("'", "''");
const sqlText = (value: string) => `'${escapeSqlLiteral(value)}'`;
const sqlOptionalText = (value: string | null | undefined) => value == null ? "NULL" : sqlText(value);
const sqlNumber = (value: number | null | undefined) => value == null ? "NULL" : String(value);
const sqlJson = (value: unknown) => `${sqlText(canonicalJson(value))}::jsonb`;

const sourceStatements = INSTALLATION_DATABASE_SOURCES.map((source) =>
  `INSERT INTO sources (id,title,publisher,url,published_at,source_class,notes) VALUES (${sqlText(source.id)},${sqlText(source.title)},${sqlText(source.publisher)},${sqlText(source.url)},NULL,${sqlText(source.sourceClass)},${sqlText(source.note)}) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,publisher=EXCLUDED.publisher,url=EXCLUDED.url,published_at=EXCLUDED.published_at,source_class=EXCLUDED.source_class,notes=EXCLUDED.notes;`,
).join("\n");

const installationStatements = PUBLIC_INSTALLATIONS.map((installation) => {
  const governed = INSTALLATION_CATALOGUE.records.find((record) => record.id === installation.id);
  if (!governed) throw new Error(`Installation ${installation.id} is absent from the governed catalogue.`);
  return `INSERT INTO installations (id,service,name,icao_code,elevation_ft,runway_info,installation_type,location,public_reference,source_id,coordinate_datum,positional_uncertainty_m,provenance,review_state) VALUES (${sqlText(installation.id)},${sqlText(installation.service)},${sqlText(installation.name)},${sqlOptionalText(installation.icaoCode ?? null)},${sqlNumber(installation.elevationFt)},${sqlOptionalText(installation.runwayInfo ?? null)},${sqlText(installation.type)},ST_SetSRID(ST_MakePoint(${installation.longitude},${installation.latitude}),4326),true,${sqlText(installation.sourceId)},${sqlText(governed.coordinateDatum)},${sqlNumber(governed.positionalUncertaintyM)},${sqlText(governed.provenance)},${sqlText(governed.reviewState)}) ON CONFLICT (id) DO UPDATE SET service=EXCLUDED.service,name=EXCLUDED.name,icao_code=EXCLUDED.icao_code,elevation_ft=EXCLUDED.elevation_ft,runway_info=EXCLUDED.runway_info,installation_type=EXCLUDED.installation_type,location=EXCLUDED.location,public_reference=EXCLUDED.public_reference,source_id=EXCLUDED.source_id,coordinate_datum=EXCLUDED.coordinate_datum,positional_uncertainty_m=EXCLUDED.positional_uncertainty_m,provenance=EXCLUDED.provenance,review_state=EXCLUDED.review_state;`;
}).join("\n");

const runwayStatements = INSTALLATION_CATALOGUE.runways.map((runway) =>
  `INSERT INTO installation_runways (id,installation_id,source_runway_id,source_airport_ident,designator,true_heading_deg,reciprocal_true_heading_deg,length_m,width_m,surface,closed_in_source,centreline,threshold_elevations_msl_m,horizontal_datum,vertical_datum,positional_uncertainty_m,provenance,review_state,mission_start_eligibility,limitation,content_hash) VALUES (${sqlText(runway.id)},${sqlText(runway.installationId)},${sqlText(runway.sourceRunwayId)},${sqlText(runway.sourceAirportIdent)},${sqlText(runway.designator)},${sqlNumber(runway.trueHeadingDeg)},${sqlNumber(runway.reciprocalTrueHeadingDeg)},${sqlNumber(runway.lengthM)},${sqlNumber(runway.widthM)},${sqlOptionalText(runway.surface)},${runway.closedInSource ? "true" : "false"},${runway.centreline ? `ST_SetSRID(ST_GeomFromGeoJSON(${sqlText(canonicalJson(runway.centreline))}),4326)` : "NULL"},${runway.thresholdElevationsMslM ? sqlJson(runway.thresholdElevationsMslM) : "NULL"},${sqlText(runway.horizontalDatum)},${sqlText(runway.verticalDatum)},${sqlNumber(runway.positionalUncertaintyM)},${sqlText(runway.provenance)},${sqlText(runway.reviewState)},${sqlText(runway.missionStartEligibility)},${sqlText(runway.limitation)},${sqlText(sha256Identity(runway))}) ON CONFLICT (id) DO UPDATE SET installation_id=EXCLUDED.installation_id,source_runway_id=EXCLUDED.source_runway_id,source_airport_ident=EXCLUDED.source_airport_ident,designator=EXCLUDED.designator,true_heading_deg=EXCLUDED.true_heading_deg,reciprocal_true_heading_deg=EXCLUDED.reciprocal_true_heading_deg,length_m=EXCLUDED.length_m,width_m=EXCLUDED.width_m,surface=EXCLUDED.surface,closed_in_source=EXCLUDED.closed_in_source,centreline=EXCLUDED.centreline,threshold_elevations_msl_m=EXCLUDED.threshold_elevations_msl_m,horizontal_datum=EXCLUDED.horizontal_datum,vertical_datum=EXCLUDED.vertical_datum,positional_uncertainty_m=EXCLUDED.positional_uncertainty_m,provenance=EXCLUDED.provenance,review_state=EXCLUDED.review_state,mission_start_eligibility=EXCLUDED.mission_start_eligibility,limitation=EXCLUDED.limitation,content_hash=EXCLUDED.content_hash;`,
).join("\n");

const environmentPacks = STUDY_AREAS.flatMap((area) => area.weatherPresets.map((weatherPreset) => ({
  studyAreaId: area.id,
  weatherPresetId: weatherPreset.id,
  pack: admitEnvironmentPack({
    studyAreaId: area.id,
    weatherPresetId: weatherPreset.id,
    effectiveWeather: weatherPreset,
  }).pack as RegionalEnvironmentPack,
})));
const environmentPackStatements = environmentPacks.map(({ pack, studyAreaId, weatherPresetId }) =>
  `INSERT INTO environment_packs (id,version,digest,schema_version,study_area_id,weather_preset_id,intended_use,provenance,coverage,horizontal_datum,vertical_datum,source_vertical_datum,valid_from,valid_until,terrain_digest,atmosphere_digest,installation_catalogue_digest,payload) VALUES (${sqlText(pack.identity.id)},${sqlText(pack.identity.version)},${sqlText(pack.identity.digest)},${sqlText(pack.schemaVersion)},${sqlText(studyAreaId)},${sqlText(weatherPresetId)},${sqlText(pack.intendedUse)},${sqlText(pack.provenance)},ST_SetSRID(ST_GeomFromGeoJSON(${sqlText(canonicalJson(pack.coverage.geometry))}),4326),${sqlText(pack.coverage.horizontalDatum)},${sqlText(pack.coverage.verticalDatum)},${sqlText(pack.coverage.sourceVerticalDatum)},${sqlText(pack.validity.startsAt)}::timestamptz,${sqlText(pack.validity.endsAt)}::timestamptz,${sqlText(pack.terrain.digest)},${sqlText(pack.atmosphere.digest)},${sqlText(pack.installationCoverage.catalogue.digest)},${sqlJson(pack)}) ON CONFLICT (id,version,digest) DO NOTHING;`,
).join("\n");

const scenarioStatements = SCENARIO_LIBRARY.map((definition) => {
  const tag = `vector_environment_${definition.id.replaceAll("-", "_")}`;
  const packageJson = canonicalJson(definition);
  if (packageJson.includes(`$${tag}$`)) throw new Error(`Dollar-quote collision for ${definition.id}.`);
  return `UPDATE scenario_templates SET package=$${tag}$${packageJson}$${tag}$::jsonb, content_hash='${sha256HexSync(definition)}' WHERE id='${escapeSqlLiteral(definition.id)}' AND version='${escapeSqlLiteral(definition.version)}' AND schema_version='vector.scenario.v4';`;
}).join("\n");

const generated = `${startMarker}
-- Run \`npm run environment:migration:generate\` after changing a governed installation, runway, EnvironmentPack, or scenario package.
${sourceStatements}
${installationStatements}
${runwayStatements}
${environmentPackStatements}
${scenarioStatements}

DO $$
BEGIN
  IF (SELECT count(*) FROM installation_runways) <> ${INSTALLATION_CATALOGUE.runways.length}
     OR (SELECT count(*) FROM environment_packs) <> ${environmentPacks.length} THEN
    RAISE EXCEPTION 'EnvironmentPack migration did not install the exact governed runway and environment rows';
  END IF;
  IF EXISTS (
    SELECT 1 FROM scenario_templates
    WHERE schema_version <> 'vector.scenario.v4'
       OR package->>'environment' NOT LIKE 'Sourced regional terrain and atmosphere%'
       OR package::text LIKE '%terrain and runway fidelity is synthetic or unavailable%'
  ) THEN
    RAISE EXCEPTION 'EnvironmentPack migration did not update every governed scenario package';
  END IF;
END $$;
${endMarker}`;
const start = existing.indexOf(startMarker);
const end = existing.indexOf(endMarker);
if (start < 0 || end < start) throw new Error("Environment scenario migration markers are missing or out of order.");
const expected = `${existing.slice(0, start)}${generated}${existing.slice(end + endMarker.length)}`;

const summary = `${PUBLIC_INSTALLATIONS.length} installations, ${INSTALLATION_CATALOGUE.runways.length} runways, ${environmentPacks.length} EnvironmentPacks, and ${SCENARIO_LIBRARY.length} scenario packages`;
if (checkOnly) {
  if (existing !== expected) throw new Error("Environment scenario migration is stale; run npm run environment:migration:generate.");
  process.stdout.write(`verified ${summary}\n`);
} else {
  writeFileSync(migrationPath, expected);
  process.stdout.write(`generated ${summary}\n`);
}
