import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildCoverageFeatures,
  buildDeclaredRouteFeatures,
  buildDirectionVectorFeatures,
  buildInstallationFeatures,
  buildLaunchFeatures,
  buildTrackFeatures,
  circlePolygon,
  localToLngLat,
} from "../lib/map-layer-contracts.ts";
import { tacticalSymbolMarkup } from "../lib/tactical-symbol-markup.ts";
import {
  TACTICAL_SYMBOL_LIBRARY,
  TACTICAL_SYMBOL_ROLES,
} from "../lib/tactical-symbol-library.ts";
import { OBJECT_CATALOG } from "../lib/object-catalog.ts";
import { PUBLIC_INSTALLATIONS } from "../lib/installations.ts";
import { buildReportExport } from "../lib/report-export.ts";
import { getScenarioDefinition } from "../lib/scenarios.ts";
import { getFrameAt, simulate } from "../lib/simulation.ts";

test("both MapLibre surfaces use the same-origin module worker prepared at build time", () => {
  const authoringMap = readFileSync(new URL("../components/ScenarioAuthoringMap.tsx", import.meta.url), "utf8");
  const engagementMap = readFileSync(new URL("../components/EngagementMap.tsx", import.meta.url), "utf8");
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const workerPath = "/vendor/maplibre/maplibre-gl-worker.mjs";

  assert.match(authoringMap, new RegExp(`setWorkerUrl\\(\\"${workerPath}`));
  assert.match(engagementMap, new RegExp(`setWorkerUrl\\(\\"${workerPath}`));
  assert.equal(packageJson.scripts.prebuild, "npm run map:assets:prepare");
  assert.equal(packageJson.scripts.predev, "npm run map:assets:prepare");
});

test("geographic conversion and coverage rings remain finite and closed", () => {
  const origin = { longitude: 74.5, latitude: 31.2 };
  assert.deepEqual(localToLngLat({ x: 0, y: 0 }, origin), [74.5, 31.2]);
  const [ring] = circlePolygon([74.5, 31.2], 45000);
  assert.equal(ring.length, 65);
  assert.deepEqual(ring[0], ring.at(-1));
  assert.ok(ring.flat().every(Number.isFinite));
});

test("SHIELD PAF installation seed retains all validated point identities", () => {
  const paf = PUBLIC_INSTALLATIONS.filter((item) => item.service === "PAF");
  assert.equal(paf.length, 15);
  assert.deepEqual(
    paf.map((item) => item.icaoCode).sort(),
    ["OPBW", "OPJA", "OPKC", "OPMI", "OPMR", "OPMS", "OPMU", "OPRN", "OPRQ", "OPRS", "OPSD", "OPSF", "OPSK", "OPPS", "OPSR"].sort(),
  );
  assert.ok(paf.every((item) => item.sourceId === "shield-paf-orbat-2026-05-19"));
  assert.ok(paf.every((item) => Number.isFinite(item.longitude) && Number.isFinite(item.latitude)));
  const nurKhan = paf.find((item) => item.icaoCode === "OPRN");
  assert.deepEqual(
    { latitude: nurKhan?.latitude, longitude: nurKhan?.longitude },
    { latitude: 33.6167, longitude: 73.0992 },
  );
});

test("map contract produces installations, routes, launch, tracks and vectors from one run", () => {
  const definition = getScenarioDefinition("a2a-crossing-intercept");
  const result = simulate(definition.scenario);
  const origin = result.engineRun.scenario.environment.studyArea.anchor;
  const frame = getFrameAt(result, Math.min(20, result.timeOfFlight));
  const installations = buildInstallationFeatures([
    {
      id: "test-station",
      service: "IAF",
      name: "Public reference station",
      installation_type: "air station",
      longitude: 74.3,
      latitude: 31.1,
    },
  ]);
  assert.equal(installations.length, 1);
  assert.deepEqual(installations[0].geometry.coordinates, [74.3, 31.1]);

  const routes = buildDeclaredRouteFeatures(result, origin);
  assert.ok(routes.length >= 2);
  assert.ok(routes.every((feature) => feature.geometry.coordinates.length >= 2));
  assert.ok(routes.every((feature) => feature.properties.entityId));

  const launches = buildLaunchFeatures(result, origin);
  assert.equal(
    launches.length,
    result.engineRun.scenario.entities.filter(
      (entity) => entity.weapon?.launchTimeSeconds !== null && entity.weapon,
    ).length,
  );
  assert.ok(launches.every((feature) => feature.properties.modelTime === 0));
  assert.ok(launches.every((feature) => feature.geometry.coordinates.every(Number.isFinite)));

  const tracks = buildTrackFeatures(result, frame, frame.t, origin);
  assert.ok(tracks.length >= 3);
  assert.ok(tracks.every((feature) => feature.geometry.coordinates.length >= 2));
  const withoutRed = buildTrackFeatures(result, frame, frame.t, origin, "red-object-1");
  assert.equal(withoutRed.some((feature) => feature.properties.entityId === "red-object-1"), false);

  const vectors = buildDirectionVectorFeatures(frame, origin);
  assert.equal(vectors.length, frame.entities.filter((entity) => entity.lifecycle !== "STOWED").length);
  assert.ok(vectors.every((feature) => feature.geometry.coordinates.length === 2));
});

test("air-defence coverage layers retain owner, kind, altitude and provenance", () => {
  const definition = getScenarioDefinition("g2a-layered-screen");
  const result = simulate(definition.scenario);
  const origin = result.engineRun.scenario.environment.studyArea.anchor;
  const frame = getFrameAt(result, 5);
  const features = buildCoverageFeatures(result, frame, origin);
  assert.deepEqual(
    new Set(features.map((feature) => feature.properties.kind)),
    new Set(["DETECTION", "TRACKING", "ENGAGEMENT", "MINIMUM_RANGE"]),
  );
  assert.ok(features.every((feature) => feature.properties.entityId));
  assert.ok(features.every((feature) => feature.properties.maximumAltitudeM > feature.properties.minimumAltitudeM));
  assert.ok(features.every((feature) => ["SOURCED", "MODEL_ASSUMPTION", "USER_PROVIDED", "UNKNOWN"].includes(feature.properties.valueState)));
  assert.ok(features.every((feature) => feature.geometry.coordinates[0].length === 65));
});

test("every tactical kind has stable affiliation and lifecycle markup", () => {
  const kinds = ["AIRCRAFT", "GUIDED_WEAPON", "RADAR", "AIR_DEFENCE_SYSTEM", "SURFACE_LAUNCHER", "BASE", "FIXED_OBJECTIVE"];
  const affiliations = ["BLUE", "RED", "NEUTRAL"];
  const lifecycles = ["STOWED", "ACTIVE", "TRACKING", "ENGAGING", "TERMINATED"];
  const outputs = new Set();
  for (const kind of kinds) {
    for (const affiliation of affiliations) {
      for (const lifecycle of lifecycles) {
        const markup = tacticalSymbolMarkup(kind, affiliation, lifecycle);
        assert.match(markup, new RegExp(`data-kind="${kind}"`));
        assert.match(markup, new RegExp(`tactical-symbol-${affiliation.toLowerCase()}`));
        assert.match(markup, new RegExp(`tactical-symbol-${lifecycle.toLowerCase()}`));
        assert.match(markup, /tactical-silhouette/);
        outputs.add(markup);
      }
    }
  }
  assert.equal(outputs.size, kinds.length * affiliations.length * lifecycles.length);
});

test("approved tactical roles render distinct, attributed silhouettes", () => {
  const outputs = new Set();
  for (const role of TACTICAL_SYMBOL_ROLES) {
    const definition = TACTICAL_SYMBOL_LIBRARY[role];
    const kind = role === "GUIDED_MISSILE"
      ? "GUIDED_WEAPON"
      : role === "RADAR"
        ? "RADAR"
        : role === "SAM_SYSTEM"
          ? "AIR_DEFENCE_SYSTEM"
          : role === "SURFACE_LAUNCHER"
            ? "SURFACE_LAUNCHER"
            : role === "AIR_BASE"
              ? "BASE"
              : role === "FIXED_OBJECTIVE"
                ? "FIXED_OBJECTIVE"
                : "AIRCRAFT";
    const markup = tacticalSymbolMarkup(kind, "BLUE", "ACTIVE", role);
    assert.match(markup, new RegExp(`data-symbol-role="${role}"`));
    assert.match(markup, /tactical-heading-layer/);
    assert.ok(definition.author.length > 0);
    outputs.add(markup);
  }
  assert.equal(outputs.size, TACTICAL_SYMBOL_ROLES.length);
});

test("every catalog object declares a supported tactical role", () => {
  assert.ok(OBJECT_CATALOG.length > 0);
  for (const object of OBJECT_CATALOG) {
    assert.ok(
      TACTICAL_SYMBOL_LIBRARY[object.symbolRole],
      `${object.id} must map to an approved tactical role`,
    );
  }
});

test("report export binds the exact run configuration, frames and source state", () => {
  const definition = getScenarioDefinition("a2a-crossing-intercept");
  const result = simulate(definition.scenario);
  const report = buildReportExport(
    {
      scenario: definition.scenario,
      result,
      events: [{ id: 1, time: 0, type: "run", title: "Baseline", detail: "Started" }],
      createdAt: "2026-08-03T00:00:00.000Z",
      engine: "browser-point-mass-v0.5",
      profileVersion: "public-study-v0.5",
      packageProvenance: {
        schemaVersion: "vector.scenario.v2",
        contentHash: "a".repeat(64),
        draftRevision: 0,
        frameHash: "b".repeat(64),
      },
    },
    definition,
    "last-saved",
  );
  assert.equal(report.schema, "vector.engagement-report.v2");
  assert.equal(report.export.sourceState, "last-saved");
  assert.equal(report.telemetry.samples.length, result.frames.length);
  assert.equal(report.provenance.scenarioContentHash, "a".repeat(64));
  assert.equal(report.provenance.frameHash, "b".repeat(64));
  assert.equal(report.scenario.configuration.information.blueTrackSource, definition.scenario.blueTrackSource);
  assert.equal(report.scenario.configuration.environment.visibility.value, definition.scenario.visibilityKm);
  assert.equal(report.result.outcome, result.outcome);
});
