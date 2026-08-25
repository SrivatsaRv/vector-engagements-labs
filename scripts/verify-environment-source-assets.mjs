import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

const pointDirectory = "governance/environment-sources/nasa-power-hourly-20200115";
const regionalDirectory = "governance/environment-sources/regional-environment-v1";
const installationV1Path = "governance/installation-catalogue.v1.json";
const installationV2Path = "governance/installation-catalogue.v2.json";
const refreshRegional = process.argv.includes("--refresh-regional");
const knownArguments = new Set(["--refresh-regional"]);
for (const argument of process.argv.slice(2)) {
  if (!knownArguments.has(argument)) throw new Error(`Unknown argument: ${argument}`);
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonicalJson = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
};

function verifyPointSource() {
  const manifest = JSON.parse(readFileSync(resolve(pointDirectory, "manifest.v1.json"), "utf8"));
  if (manifest.schemaVersion !== "vector.environment-source-manifest.v1") {
    throw new Error("Unsupported environment source manifest schema.");
  }
  if (manifest.coverage?.kind !== "POINT_ONLY" || manifest.coverage?.areaAdmission !== "INELIGIBLE") {
    throw new Error("Committed point source must remain ineligible for an area environment pack.");
  }
  if (manifest.verticalDatum !== "UNDECLARED") {
    throw new Error("Committed POWER point source must not invent a vertical datum.");
  }
  for (const artifact of manifest.artifacts ?? []) {
    const bytes = readFileSync(resolve(pointDirectory, artifact.path));
    const actual = sha256(bytes);
    if (actual !== artifact.sha256) {
      throw new Error(`Environment source artifact ${artifact.id} digest mismatch: expected ${artifact.sha256}, received ${actual}.`);
    }
    const response = JSON.parse(bytes.toString("utf8"));
    if (response.header?.time_standard !== "UTC" || response.header?.api?.version !== manifest.request.apiVersion) {
      throw new Error(`Environment source artifact ${artifact.id} metadata differs from its manifest.`);
    }
  }
  return { id: manifest.id, version: manifest.version, artifacts: manifest.artifacts.length, coverage: manifest.coverage.kind };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/u, ""));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/u, ""));
    rows.push(row);
  }
  if (quoted || rows.length < 1) throw new Error("CSV source is malformed.");
  const header = rows.shift();
  return rows.map((values) => Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""])));
}

function finiteNumber(value, context) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${context} must be finite.`);
  return number;
}

async function fetchText(url, attempts = 4) {
  let failure;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      failure = error;
      if (attempt < attempts) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 500));
    }
  }
  throw new Error(`Source request failed for ${url}: ${failure instanceof Error ? failure.message : failure}`);
}

async function mapConcurrent(items, concurrency, task) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

const ETOPO_ORIGIN_LONGITUDE = -179.99791666666667;
const ETOPO_ORIGIN_LATITUDE = -89.99791666666667;
const ETOPO_SOURCE_STEP = 1 / 240;

function outwardEtpoCoordinate(value, origin, stride, mode) {
  const sourceIndex = (value - origin) / ETOPO_SOURCE_STEP;
  const multiple = mode === "floor" ? Math.floor(sourceIndex / stride) : Math.ceil(sourceIndex / stride);
  return origin + multiple * stride * ETOPO_SOURCE_STEP;
}

function etopoUrl(bounds, stride) {
  const [[west, south], [east, north]] = bounds;
  const sourceWest = outwardEtpoCoordinate(west, ETOPO_ORIGIN_LONGITUDE, stride, "floor");
  const sourceEast = outwardEtpoCoordinate(east, ETOPO_ORIGIN_LONGITUDE, stride, "ceil");
  const sourceSouth = outwardEtpoCoordinate(south, ETOPO_ORIGIN_LATITUDE, stride, "floor");
  const sourceNorth = outwardEtpoCoordinate(north, ETOPO_ORIGIN_LATITUDE, stride, "ceil");
  const query = `z[(%s):${stride}:(%n)][(%w):${stride}:(%e)]`
    .replace("%s", sourceSouth.toFixed(12))
    .replace("%n", sourceNorth.toFixed(12))
    .replace("%w", sourceWest.toFixed(12))
    .replace("%e", sourceEast.toFixed(12));
  return `https://coastwatch.pfeg.noaa.gov/erddap/griddap/ETOPO_2022_v1_15s.csv0?${encodeURIComponent(query).replaceAll("%3A", ":").replaceAll("%5B", "[").replaceAll("%5D", "]").replaceAll("%28", "(").replaceAll("%29", ")")}`;
}

function compileTerrain(text, studyAreaId, expectedStep) {
  const values = text.trim().split(/\r?\n/u).map((line, index) => {
    const columns = line.split(",");
    if (columns.length !== 3) throw new Error(`${studyAreaId} terrain row ${index} is malformed.`);
    return {
      latitudeDeg: finiteNumber(columns[0], `${studyAreaId} terrain latitude`),
      longitudeDeg: finiteNumber(columns[1], `${studyAreaId} terrain longitude`),
      elevationEgm2008M: finiteNumber(columns[2], `${studyAreaId} terrain elevation`),
    };
  });
  const longitudes = [...new Set(values.map((value) => value.longitudeDeg))].sort((left, right) => left - right);
  const latitudes = [...new Set(values.map((value) => value.latitudeDeg))].sort((left, right) => left - right);
  if (longitudes.length < 2 || latitudes.length < 2 || values.length !== longitudes.length * latitudes.length) {
    throw new Error(`${studyAreaId} terrain source is not a complete regular grid.`);
  }
  const tolerance = 1e-8;
  if (Math.abs(longitudes[1] - longitudes[0] - expectedStep) > tolerance
    || Math.abs(latitudes[1] - latitudes[0] - expectedStep) > tolerance) {
    throw new Error(`${studyAreaId} terrain preprocessing resolution differs from the source decision.`);
  }
  const byCoordinate = new Map(values.map((value) => [`${value.latitudeDeg}:${value.longitudeDeg}`, value]));
  const elevationEgm2008M = [];
  const surfaceElevationMslM = [];
  const landSeaMask = [];
  for (const latitude of latitudes) {
    for (const longitude of longitudes) {
      const value = byCoordinate.get(`${latitude}:${longitude}`);
      if (!value) throw new Error(`${studyAreaId} terrain grid has a void.`);
      elevationEgm2008M.push(Number(value.elevationEgm2008M.toFixed(3)));
      surfaceElevationMslM.push(Number(Math.max(0, value.elevationEgm2008M).toFixed(3)));
      landSeaMask.push(value.elevationEgm2008M >= 0 ? 1 : 0);
    }
  }
  return {
    westDeg: longitudes[0],
    southDeg: latitudes[0],
    longitudeStepDeg: expectedStep,
    latitudeStepDeg: expectedStep,
    columns: longitudes.length,
    rows: latitudes.length,
    elevationEgm2008M,
    surfaceElevationMslM,
    landSeaMask,
    noDataPolicy: "FAIL_CLOSED",
  };
}

function powerUrl(longitude, latitude, date, parameters) {
  const query = new URLSearchParams({
    parameters: parameters.join(","),
    community: "SB",
    longitude: String(longitude),
    latitude: String(latitude),
    start: date,
    end: date,
    format: "JSON",
    "time-standard": "UTC",
  });
  return `https://power.larc.nasa.gov/api/temporal/hourly/point?${query}`;
}

function compileAtmosphere(responses, region, preset, selection) {
  const [[west, south], [east, north]] = region.bounds;
  const longitudes = [west, (west + east) / 2, east];
  const latitudes = [south, (south + north) / 2, north];
  const byNode = new Map(responses.map((item) => [`${item.latitude}:${item.longitude}`, item.response]));
  const fields = {
    temperatureC: [],
    surfacePressureKpa: [],
    relativeHumidityPercent: [],
    windEastMps: [],
    windNorthMps: [],
  };
  let apiVersion;
  const fillValues = new Set();
  for (let hour = 0; hour < selection.atmosphere.sampleCount; hour += 1) {
    const key = `${preset.date}${String(hour).padStart(2, "0")}`;
    for (const latitude of latitudes) {
      for (const longitude of longitudes) {
        const response = byNode.get(`${latitude}:${longitude}`);
        if (!response) throw new Error(`${region.studyAreaId}/${preset.id} is missing a POWER grid node.`);
        if (response.header?.time_standard !== "UTC" || response.header?.start !== preset.date || response.header?.end !== preset.date) {
          throw new Error(`${region.studyAreaId}/${preset.id} POWER metadata is incompatible.`);
        }
        apiVersion ??= response.header?.api?.version;
        if (response.header?.api?.version !== apiVersion) throw new Error("POWER API version changed inside one source bundle.");
        fillValues.add(response.header.fill_value);
        const values = response.properties?.parameter;
        const take = (parameter) => {
          const value = finiteNumber(values?.[parameter]?.[key], `${region.studyAreaId}/${preset.id}/${parameter}/${key}`);
          if (value === response.header.fill_value) throw new Error(`${region.studyAreaId}/${preset.id}/${parameter}/${key} contains no-data.`);
          return value;
        };
        fields.temperatureC.push(take("T2M"));
        fields.surfacePressureKpa.push(take("PS"));
        fields.relativeHumidityPercent.push(take("RH2M"));
        fields.windEastMps.push(take("U10M"));
        fields.windNorthMps.push(take("V10M"));
      }
    }
  }
  if (!apiVersion || fillValues.size !== 1) throw new Error("POWER source metadata is inconsistent.");
  return {
    id: preset.id,
    sourceDate: preset.date,
    startTimeUtc: `${preset.date.slice(0, 4)}-${preset.date.slice(4, 6)}-${preset.date.slice(6, 8)}T00:00:00Z`,
    intervalSeconds: selection.atmosphere.sampleIntervalSeconds,
    sampleCount: selection.atmosphere.sampleCount,
    westDeg: west,
    southDeg: south,
    longitudeStepDeg: (east - west) / 2,
    latitudeStepDeg: (north - south) / 2,
    columns: 3,
    rows: 3,
    apiVersion,
    ...fields,
  };
}

function runwayCatalogue(selection, airportsText, runwaysText, installationV1) {
  if (sha256(airportsText) !== selection.runways.airportsSha256
    || sha256(runwaysText) !== selection.runways.runwaysSha256) {
    throw new Error("OurAirports source bytes do not match the frozen revision.");
  }
  const airports = parseCsv(airportsText.toString("utf8"));
  const runways = parseCsv(runwaysText.toString("utf8"));
  const airportByIdent = new Map(airports.map((airport) => [airport.ident, airport]));
  const runwayRowsByIdent = new Map();
  for (const runway of runways) {
    const rows = runwayRowsByIdent.get(runway.airport_ident) ?? [];
    rows.push(runway);
    runwayRowsByIdent.set(runway.airport_ident, rows);
  }
  const records = installationV1.records.map((record) => {
    const airportIdent = selection.runways.installationAirportIdentifiers[record.id];
    const airport = airportByIdent.get(airportIdent);
    if (!airport) throw new Error(`OurAirports airport ${airportIdent} for ${record.id} is missing.`);
    const distanceDeg = Math.hypot(Number(airport.longitude_deg) - record.longitude, Number(airport.latitude_deg) - record.latitude);
    if (!(distanceDeg <= 0.02)) throw new Error(`OurAirports airport ${airportIdent} is too far from ${record.id}.`);
    return {
      ...record,
      aliases: [...new Set([record.name, airport.name, airport.ident, airport.icao_code].filter(Boolean))],
      runwaySourceAirportIdent: airport.ident,
      runwayEvidence: "OURAIRPORTS_PUBLIC_DOMAIN",
    };
  });
  const compiledRunways = [];
  for (const record of records) {
    const rows = runwayRowsByIdent.get(record.runwaySourceAirportIdent) ?? [];
    for (const runway of rows) {
      const number = (field) => runway[field] === "" ? null : finiteNumber(runway[field], `${record.id}/${runway.id}/${field}`);
      const geometryComplete = [
        "length_ft", "width_ft", "le_latitude_deg", "le_longitude_deg", "le_elevation_ft", "le_heading_degT",
        "he_latitude_deg", "he_longitude_deg", "he_elevation_ft", "he_heading_degT",
      ].every((field) => runway[field] !== "" && Number.isFinite(Number(runway[field])))
        && runway.le_ident !== "" && runway.he_ident !== "" && runway.surface !== "";
      const closed = runway.closed === "1";
      compiledRunways.push({
        id: `runway:${record.id}:${runway.id}`,
        installationId: record.id,
        sourceRunwayId: runway.id,
        sourceAirportIdent: runway.airport_ident,
        designator: `${runway.le_ident}/${runway.he_ident}`,
        trueHeadingDeg: number("le_heading_degT"),
        reciprocalTrueHeadingDeg: number("he_heading_degT"),
        lengthM: number("length_ft") === null ? null : Number((number("length_ft") * 0.3048).toFixed(3)),
        widthM: number("width_ft") === null ? null : Number((number("width_ft") * 0.3048).toFixed(3)),
        surface: runway.surface || null,
        closedInSource: closed,
        centreline: geometryComplete ? {
          type: "LineString",
          coordinates: [
            [number("le_longitude_deg"), number("le_latitude_deg")],
            [number("he_longitude_deg"), number("he_latitude_deg")],
          ],
        } : null,
        thresholdElevationsMslM: geometryComplete ? {
          low: Number((number("le_elevation_ft") * 0.3048).toFixed(3)),
          high: Number((number("he_elevation_ft") * 0.3048).toFixed(3)),
        } : null,
        horizontalDatum: "WGS84",
        verticalDatum: "MSL_REPORTED_BY_SOURCE",
        positionalUncertaintyM: null,
        provenance: "SOURCED_DATASET",
        reviewState: "UNVERIFIED_PUBLIC_REFERENCE",
        missionStartEligibility: geometryComplete && !closed ? "PUBLIC_EDUCATIONAL" : "INELIGIBLE",
        limitation: closed
          ? "The source marks this runway closed; ground starts fail closed."
          : geometryComplete
            ? "Public-domain community reference only; not navigation, readiness, occupancy, or current operational-status evidence."
            : "Required runway geometry, dimension, heading, surface, or elevation evidence is incomplete.",
      });
    }
  }
  const runwayIdsByInstallation = new Map();
  for (const runway of compiledRunways) {
    const ids = runwayIdsByInstallation.get(runway.installationId) ?? [];
    ids.push(runway.id);
    runwayIdsByInstallation.set(runway.installationId, ids);
  }
  return {
    schemaVersion: "vector.installation-catalogue.v2",
    id: installationV1.id,
    version: "2.0.0",
    intendedUse: installationV1.intendedUse,
    coverage: {
      ...installationV1.coverage,
      knownGaps: [
        "This fixture is not a complete IAF or PAF installation catalogue.",
        "OurAirports is community-maintained and provides no accuracy, fitness, navigation, readiness, occupancy, or current operational-status guarantee.",
        "Only runways with both sourced thresholds, elevations, headings, dimensions, surface, and an open source state are eligible for public-educational ground starts.",
      ],
      runwayRecordCount: compiledRunways.length,
      eligibleRunwayRecordCount: compiledRunways.filter((runway) => runway.missionStartEligibility === "PUBLIC_EDUCATIONAL").length,
    },
    validity: { retrievedOn: selection.retrievedDate, validFrom: null, validUntil: null },
    review: { state: "PUBLIC_REFERENCE_UNVERIFIED", reviewedOn: selection.retrievedDate },
    sources: [
      ...installationV1.sources,
      {
        id: `ourairports-${selection.runways.commit}`,
        publisher: selection.runways.publisher,
        title: "OurAirports airports and runways frozen revision",
        url: `${selection.runways.repository}/tree/${selection.runways.commit}`,
        license: selection.runways.licence,
      },
    ],
    records: records.map((record) => ({
      ...record,
      runwayIds: (runwayIdsByInstallation.get(record.id) ?? []).sort(),
      groundStartState: compiledRunways.some((runway) => runway.installationId === record.id && runway.missionStartEligibility === "PUBLIC_EDUCATIONAL")
        ? "SUPPORTED_PUBLIC_EDUCATIONAL"
        : "UNSUPPORTED_INCOMPLETE_EVIDENCE",
    })),
    runways: compiledRunways.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

async function refreshRegionalSources() {
  const selection = JSON.parse(readFileSync(resolve(regionalDirectory, "source-selection.v1.json"), "utf8"));
  const installationV1 = JSON.parse(readFileSync(resolve(installationV1Path), "utf8"));
  const sourceDirectory = process.env.VECTOR_OURAIRPORTS_SOURCE_DIR;
  if (!sourceDirectory) throw new Error("VECTOR_OURAIRPORTS_SOURCE_DIR must identify the exact frozen OurAirports checkout.");
  const airportsBytes = readFileSync(resolve(sourceDirectory, "airports.csv"));
  const runwaysBytes = readFileSync(resolve(sourceDirectory, "runways.csv"));
  const installationV2 = runwayCatalogue(selection, airportsBytes, runwaysBytes, installationV1);
  const installationV2Bytes = Buffer.from(`${JSON.stringify(installationV2, null, 2)}\n`);
  writeFileSync(resolve(installationV2Path), installationV2Bytes);

  const rawDirectory = resolve(regionalDirectory, "raw");
  mkdirSync(rawDirectory, { recursive: true });
  const artifacts = [];
  const regions = [];
  for (const region of selection.regions) {
    const terrainSourceUrl = etopoUrl(region.bounds, selection.terrain.preprocessedStride);
    const terrainText = await fetchText(terrainSourceUrl);
    const terrainPath = `raw/${region.studyAreaId}.etopo.csv`;
    const terrainBytes = Buffer.from(terrainText);
    writeFileSync(resolve(regionalDirectory, terrainPath), terrainBytes);
    artifacts.push({
      id: `terrain:${region.studyAreaId}`,
      kind: "NOAA_ETOPO_2022",
      path: terrainPath,
      url: terrainSourceUrl,
      sha256: sha256(terrainBytes),
    });
    const weatherPresets = [];
    for (const preset of region.weatherPresets) {
      const [[west, south], [east, north]] = region.bounds;
      const longitudes = [west, (west + east) / 2, east];
      const latitudes = [south, (south + north) / 2, north];
      const requests = latitudes.flatMap((latitude, row) => longitudes.map((longitude, column) => ({ latitude, longitude, row, column })));
      const responses = await mapConcurrent(requests, 4, async (request) => {
        const url = powerUrl(request.longitude, request.latitude, preset.date, selection.atmosphere.parameters);
        const rawText = await fetchText(url);
        const rawBytes = Buffer.from(rawText);
        const path = `raw/${region.studyAreaId}.${preset.id}.r${request.row}c${request.column}.power.json`;
        writeFileSync(resolve(regionalDirectory, path), rawBytes);
        artifacts.push({
          id: `atmosphere:${region.studyAreaId}:${preset.id}:r${request.row}c${request.column}`,
          kind: "NASA_POWER_HOURLY_POINT",
          path,
          url,
          sha256: sha256(rawBytes),
          longitudeDeg: request.longitude,
          latitudeDeg: request.latitude,
        });
        return { ...request, response: JSON.parse(rawText) };
      });
      weatherPresets.push(compileAtmosphere(responses, region, preset, selection));
    }
    regions.push({
      studyAreaId: region.studyAreaId,
      coverage: {
        type: "Polygon",
        coordinates: [[
          [region.bounds[0][0], region.bounds[0][1]],
          [region.bounds[1][0], region.bounds[0][1]],
          [region.bounds[1][0], region.bounds[1][1]],
          [region.bounds[0][0], region.bounds[1][1]],
          [region.bounds[0][0], region.bounds[0][1]],
        ]],
      },
      terrain: compileTerrain(terrainText, region.studyAreaId, selection.terrain.preprocessedResolutionDegrees),
      weatherPresets,
    });
  }
  artifacts.sort((left, right) => left.id.localeCompare(right.id));
  const content = {
    terrain: {
      id: selection.terrain.datasetId,
      version: "2022-v1",
      publisher: selection.terrain.publisher,
      sourceUrl: selection.terrain.sourceUrl,
      licence: selection.terrain.licence,
      horizontalDatum: selection.terrain.horizontalDatum,
      verticalDatum: selection.terrain.verticalDatum,
      derivedRuntimeDatum: "MSL",
      conversionPolicy: "ETOPO EGM2008 orthometric height is consumed as the pack's declared MSL reference; sea cells use zero-metre sea surface and retain the source bathymetry in evidence.",
      sourceResolutionDegrees: selection.terrain.sourceResolutionDegrees,
      preprocessedResolutionDegrees: selection.terrain.preprocessedResolutionDegrees,
      uncertainty: "ETOPO 2022 global land RMSE is documented separately; no cell-specific uncertainty is inferred.",
    },
    atmosphere: {
      id: "nasa-power-hourly-surface-regional-grid",
      version: "data-v10",
      publisher: selection.atmosphere.publisher,
      sourceUrl: selection.atmosphere.sourceUrl,
      licence: selection.atmosphere.licence,
      horizontalDatum: selection.atmosphere.horizontalDatum,
      verticalDatum: "SURFACE_PRESSURE_AND_FIXED_MEASUREMENT_HEIGHTS",
      timeStandard: selection.atmosphere.timeStandard,
      parameters: selection.atmosphere.parameters,
      verticalProfilePolicy: selection.atmosphere.verticalProfilePolicy,
      uncertainty: "POWER grid-cell analysis values; no station-scale or operational forecast accuracy is claimed.",
    },
    installationCatalogue: {
      id: installationV2.id,
      version: installationV2.version,
      schemaVersion: installationV2.schemaVersion,
      fileSha256: sha256(installationV2Bytes),
    },
    regions,
  };
  const compiled = {
    schemaVersion: "vector.regional-environment-source-bundle.v1",
    id: selection.id,
    version: selection.version,
    digest: `sha256:${sha256(canonicalJson(content))}`,
    ...content,
  };
  const compiledBytes = Buffer.from(`${JSON.stringify(compiled)}\n`);
  writeFileSync(resolve(regionalDirectory, "compiled.v1.json"), compiledBytes);
  const manifest = {
    schemaVersion: "vector.regional-environment-source-manifest.v1",
    id: selection.id,
    version: selection.version,
    retrievedDate: selection.retrievedDate,
    intendedUse: "PUBLIC_EDUCATIONAL",
    areaAdmission: "ELIGIBLE",
    compiledPath: "compiled.v1.json",
    compiledSha256: sha256(compiledBytes),
    installationCataloguePath: installationV2Path,
    installationCatalogueSha256: sha256(installationV2Bytes),
    sources: {
      terrain: selection.terrain,
      atmosphere: selection.atmosphere,
      runways: selection.runways,
    },
    artifacts,
    limitations: [
      "ETOPO 2022 and OurAirports are not navigation data.",
      "OurAirports does not prove current occupancy, readiness, assignment, or operational status.",
      "NASA POWER provides gridded surface analysis values, not an observed atmosphere-aloft profile or operational forecast.",
      "The derived vertical atmosphere profile is bounded to -500..20000 m MSL and fails closed outside the frozen 24-hour interval.",
    ],
  };
  writeFileSync(resolve(regionalDirectory, "manifest.v1.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function verifyRegionalSources() {
  const manifestPath = resolve(regionalDirectory, "manifest.v1.json");
  const compiledPath = resolve(regionalDirectory, "compiled.v1.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const compiledBytes = readFileSync(compiledPath);
  if (manifest.schemaVersion !== "vector.regional-environment-source-manifest.v1"
    || manifest.areaAdmission !== "ELIGIBLE") {
    throw new Error("Regional environment manifest is not area-eligible.");
  }
  if (sha256(compiledBytes) !== manifest.compiledSha256) {
    throw new Error("Compiled regional environment source digest mismatch.");
  }
  const compiled = JSON.parse(compiledBytes.toString("utf8"));
  if (compiled.schemaVersion !== "vector.regional-environment-source-bundle.v1"
    || compiled.terrain?.verticalDatum !== "EGM2008"
    || compiled.terrain?.derivedRuntimeDatum !== "MSL"
    || compiled.atmosphere?.horizontalDatum !== "WGS84"
    || compiled.atmosphere?.timeStandard !== "UTC"
    || compiled.regions?.length !== 6
    || compiled.regions.some((region) => region.weatherPresets?.length !== 2)) {
    throw new Error("Compiled regional environment source contract is invalid.");
  }
  const content = Object.fromEntries(
    Object.entries(compiled).filter(([key]) => !["digest", "schemaVersion", "id", "version"].includes(key)),
  );
  if (compiled.digest !== `sha256:${sha256(canonicalJson(content))}`) {
    throw new Error("Compiled regional environment content identity is invalid.");
  }
  const declaredPaths = new Set();
  for (const artifact of manifest.artifacts ?? []) {
    if (declaredPaths.has(artifact.path)) throw new Error(`Duplicate regional source path ${artifact.path}.`);
    declaredPaths.add(artifact.path);
    const bytes = readFileSync(resolve(regionalDirectory, artifact.path));
    if (sha256(bytes) !== artifact.sha256) throw new Error(`Regional source artifact ${artifact.id} digest mismatch.`);
  }
  const actualRawPaths = readdirSync(resolve(regionalDirectory, "raw")).map((name) => `raw/${name}`).sort();
  const expectedRawPaths = [...declaredPaths].sort();
  if (JSON.stringify(actualRawPaths) !== JSON.stringify(expectedRawPaths)) {
    throw new Error("Regional environment raw artifact inventory differs from its manifest.");
  }
  const installationBytes = readFileSync(resolve(manifest.installationCataloguePath));
  if (sha256(installationBytes) !== manifest.installationCatalogueSha256) {
    throw new Error("Installation/runway catalogue digest mismatch.");
  }
  const installation = JSON.parse(installationBytes.toString("utf8"));
  if (installation.schemaVersion !== "vector.installation-catalogue.v2"
    || installation.records.length !== 21
    || !installation.runways.some((runway) => runway.missionStartEligibility === "PUBLIC_EDUCATIONAL")) {
    throw new Error("Installation/runway catalogue does not satisfy the regional source boundary.");
  }
  return {
    id: compiled.id,
    version: compiled.version,
    digest: compiled.digest,
    regions: compiled.regions.length,
    artifacts: manifest.artifacts.length,
    runways: installation.runways.length,
    eligibleRunways: installation.coverage.eligibleRunwayRecordCount,
  };
}

if (refreshRegional) await refreshRegionalSources();
const point = verifyPointSource();
const regional = verifyRegionalSources();
process.stdout.write(`${JSON.stringify({ point, regional })}\n`);
