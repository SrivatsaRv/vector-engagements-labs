import { performance } from "node:perf_hooks";
import { expect, test, type Page } from "@playwright/test";

import { sha256Hex } from "../../lib/canonical-json";
import { ENGINE_VERSION } from "../../lib/engine/version";
import { admitEnvironmentPack } from "../../lib/geospatial/environment-pack";
import {
  INSTALLATION_CATALOGUE,
  INSTALLATION_CATALOGUE_IDENTITY,
  PUBLIC_INSTALLATIONS,
} from "../../lib/installations";
import { SCENARIO_PACKAGE_SCHEMA_VERSION } from "../../lib/scenario-package";
import { SCENARIO_LIBRARY } from "../../lib/scenarios";
import { WEAPON_SIMULATION_MODELS } from "../../lib/simulation-models";
import { STUDY_AREAS } from "../../lib/study-areas";
import {
  AIR_COMBAT_BROWSER_PERFORMANCE_POLICY,
  assertAirCombatBrowserPerformanceEvidence,
  type AirCombatBrowserPerformanceEvidence,
  type AirCombatBrowserPerformanceMeasurement,
} from "../../lib/validation/air-combat-browser-performance";

type PerformanceWindow = Window & {
  __vectorLongTaskSupported?: boolean;
  __vectorLongTaskDurationsMs?: number[];
  __vectorRecordBlob?: { byteLength: number; filename: string } | null;
};

// Browser recording perturbs the main thread and can manufacture the Long
// Tasks this test is intended to measure. The attached JSON evidence is the
// diagnostic authority for this isolated performance journey.
test.use({ trace: "off", video: "off", screenshot: "off" });

const TRANSPARENT_RASTER_TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function catalogFixture(scenarioId: string) {
  const definition = SCENARIO_LIBRARY.find((item) => item.id === scenarioId);
  if (!definition) throw new Error(`Missing exact Air-combat scenario ${scenarioId}.`);
  const template = {
    id: definition.id,
    version: definition.version,
    domain: definition.domain,
    title: definition.title,
    status: "VALIDATED",
    package: definition,
    schema_version: SCENARIO_PACKAGE_SCHEMA_VERSION,
    content_hash: await sha256Hex(definition),
    engine_version: ENGINE_VERSION,
    intended_use_id: definition.intendedUse.id,
    intended_use_version: definition.intendedUse.version,
    model_pack_id: definition.modelPack.id,
    model_pack_version: definition.modelPack.version,
    model_pack_digest: definition.modelPack.digest,
  };
  return {
    state: "POSTGIS",
    installationCatalogue: {
      schemaVersion: INSTALLATION_CATALOGUE.schemaVersion,
      ...INSTALLATION_CATALOGUE_IDENTITY,
      intendedUse: INSTALLATION_CATALOGUE.intendedUse,
      coverage: INSTALLATION_CATALOGUE.coverage,
      validity: INSTALLATION_CATALOGUE.validity,
      review: INSTALLATION_CATALOGUE.review,
      records: INSTALLATION_CATALOGUE.records,
      runways: INSTALLATION_CATALOGUE.runways,
    },
    installations: PUBLIC_INSTALLATIONS.map((item) => {
      const governed = INSTALLATION_CATALOGUE.records.find((record) => record.id === item.id)!;
      const eligibleRunway = governed.runwayIds
        .map((id) => INSTALLATION_CATALOGUE.runways.find((runway) => runway.id === id))
        .find((runway) => runway?.missionStartEligibility === "PUBLIC_EDUCATIONAL");
      return {
        id: item.id,
        service: item.service,
        name: item.name,
        icao_code: item.icaoCode,
        elevation_ft: item.elevationFt,
        runway_info: item.runwayInfo,
        installation_type: item.type,
        longitude: item.longitude,
        latitude: item.latitude,
        public_reference: true,
        source_id: item.sourceId,
        ground_start_supported: Boolean(eligibleRunway),
        ground_start_runway_id: eligibleRunway?.id ?? null,
      };
    }),
    runways: INSTALLATION_CATALOGUE.runways.map((runway) => ({
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
    })),
    environmentPacks: STUDY_AREAS.flatMap((area) => area.weatherPresets.map((weather) => {
      const pack = admitEnvironmentPack({
        studyAreaId: area.id,
        weatherPresetId: weather.id,
      }).pack;
      return {
        id: pack.identity.id,
        version: pack.identity.version,
        digest: pack.identity.digest,
        study_area_id: area.id,
        weather_preset_id: weather.id,
        terrain_digest: pack.terrain.digest,
        atmosphere_digest: pack.atmosphere.digest,
        valid_from: pack.validity.startsAt,
        valid_until: pack.validity.endsAt,
      };
    })),
    simulationModels: WEAPON_SIMULATION_MODELS.map((model) => ({
      id: model.id,
      weapon_id: model.weaponId,
      version: model.version,
      domains: model.domains,
      propulsion_kind: model.propulsionKind,
      launch_mass_kg: model.launchMassKg,
      dry_mass_kg: model.dryMassKg,
      powered_flight_seconds: model.poweredFlightSeconds,
      thrust_newtons: model.thrustNewtons,
      thrust_taper_speed_mps: model.thrustTaperSpeedMps,
      reference_area_m2: model.referenceAreaM2,
      drag_coefficient: model.dragCoefficient,
      navigation_constant: model.navigationConstant,
      maximum_command_g: model.maximumCommandG,
      seeker_activation_range_m: model.seekerActivationRangeM,
      datalink_update_seconds: model.datalinkUpdateSeconds,
      value_state: model.valueState,
      rationale: model.rationale,
    })),
    studyAreas: STUDY_AREAS.map((area) => ({
      id: area.id,
      name: area.name,
      short_name: area.shortName,
      description: area.description,
      terrain_class: area.terrainClass,
      surface_elevation_m: area.surfaceElevationM,
      anchor_longitude: area.anchor.longitude,
      anchor_latitude: area.anchor.latitude,
      boundary: {
        coordinates: [[
          area.bounds[0],
          [area.bounds[1][0], area.bounds[0][1]],
          area.bounds[1],
          [area.bounds[0][0], area.bounds[1][1]],
          area.bounds[0],
        ]],
      },
      environment_presets: area.weatherPresets,
      default_environment_preset_id: area.defaultWeatherPresetId,
      source_class: area.sourceClass,
    })),
    scenarioTemplates: [template],
    credibilityAdmissions: [{
      state: "ADMITTED_WITH_LIMITATIONS",
      intendedUse: definition.intendedUse,
      modelPack: definition.modelPack,
      credibilityManifest: {
        id: "air-combat-browser-performance-credibility",
        version: "1.0.0",
        approvalState: "DRAFT",
        limitations: [{
          id: "air-combat-browser-performance-limitation",
          severity: "BLOCKING",
          statement: "Local Chromium regression fixture; no named-system or production-capacity claim.",
        }],
      },
      scenarioTemplateIds: [definition.id],
    }],
  };
}

async function selectCanonicalTimelineEnd(page: Page) {
  const timeline = page.getByRole("slider", { name: "Run timeline" });
  await timeline.focus();
  await page.keyboard.press("End");
  return timeline;
}

async function collectAnimationFrameIntervals(page: Page, sampleCount: number) {
  return page.evaluate(async (count) => {
    const intervals: number[] = [];
    let previous = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
    while (intervals.length < count) {
      const current = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
      intervals.push(current - previous);
      previous = current;
    }
    return intervals;
  }, sampleCount);
}

test("the exact Air-combat studies retain bounded Worker and canonical 3D browser performance", async ({ page }, testInfo) => {
  const policy = AIR_COMBAT_BROWSER_PERFORMANCE_POLICY;
  expect(policy.studies).toHaveLength(3);
  if (testInfo.project.name !== policy.measurementProject) {
    expect(["phone-390", "tablet-768", "desktop-1440", "full-hd"]).toContain(testInfo.project.name);
    return;
  }

  test.setTimeout(120_000);
  const viewport = page.viewportSize();
  expect(viewport).toEqual({ width: 1_366, height: 768 });
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await page.addInitScript(() => {
    const instrumented = window as PerformanceWindow;
    instrumented.__vectorLongTaskDurationsMs = [];
    instrumented.__vectorLongTaskSupported = PerformanceObserver.supportedEntryTypes.includes("longtask");
    if (instrumented.__vectorLongTaskSupported) {
      const observer = new PerformanceObserver((list) => {
        const target = (window as PerformanceWindow).__vectorLongTaskDurationsMs ?? [];
        target.push(...list.getEntries().map(({ duration }) => duration));
        (window as PerformanceWindow).__vectorLongTaskDurationsMs = target;
      });
      observer.observe({ type: "longtask", buffered: true });
    }
    const nativeCreateObjectUrl = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object) => {
      const url = nativeCreateObjectUrl(object);
      if (object instanceof Blob && object.type === "application/octet-stream") {
        instrumented.__vectorRecordBlob = { byteLength: object.size, filename: "" };
      }
      return url;
    };
    const nativeAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click() {
      if (this.download.endsWith(".vector")) {
        const captured = (window as PerformanceWindow).__vectorRecordBlob;
        if (captured) captured.filename = this.download;
        return;
      }
      nativeAnchorClick.call(this);
    };
  });

  let catalog = await catalogFixture(policy.studies[0].scenarioId);
  await page.route("**/api/catalog", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalog) }));
  await page.route("**/api/map-tile?**", (route) => route.fulfill({
    status: 200,
    contentType: "image/png",
    body: TRANSPARENT_RASTER_TILE,
  }));

  const browserName = page.context().browser()?.browserType().name() ?? "unknown";
  const client = await page.context().newCDPSession(page);
  const measurements: AirCombatBrowserPerformanceMeasurement[] = [];
  const loadedHeapSamples: number[] = [];

  for (const study of policy.studies) {
    catalog = await catalogFixture(study.scenarioId);
    const loadStarted = performance.now();
    await page.goto(`/workbench?scenario=${study.scenarioId}&start=guided`);
    await expect(page.locator(".catalog-state.POSTGIS")).toHaveText("PostGIS catalog connected");
    await expect(page.locator("[data-authored-profile]")).toBeVisible();
    const packageLoadMs = performance.now() - loadStarted;

    await page.getByRole("button", { name: "5 Validate" }).click();
    await client.send("HeapProfiler.collectGarbage");
    const heapBefore = await client.send("Runtime.getHeapUsage");
    loadedHeapSamples.push(heapBefore.usedSize);
    await page.evaluate(() => {
      const instrumented = window as PerformanceWindow;
      instrumented.__vectorLongTaskDurationsMs = [];
      instrumented.__vectorRecordBlob = null;
    });

    const runStarted = performance.now();
    await page.getByRole("button", { name: /run baseline/i }).click();
    await expect(page.locator('.catalog-state[data-runtime-state="completed"]')).toHaveText(
      "Worker · completed",
      { timeout: policy.maximumWorkerRunMs },
    );
    const workerRunMs = performance.now() - runStarted;
    await expect(page.locator('.vector-record-panel[data-record-source="WORKER_RUN"]')).toBeVisible();

    const pause = page.getByRole("button", { name: "Pause run", exact: true });
    if (await pause.isVisible()) await pause.click();
    const selectionStarted = performance.now();
    await page.getByRole("button", { name: "3D", exact: true }).click();
    const scene = page.locator(".simulation-scene");
    await expect(scene).toBeVisible();
    const timeline = await selectCanonicalTimelineEnd(page);
    await expect(scene).toHaveAttribute("data-display-frame-index", String(study.frameIndex));
    await expect(scene).toHaveAttribute("data-display-time", String(study.modelTimeSeconds));
    await expect(scene).toHaveAttribute("data-effect-class", study.effectClass);
    const canonicalFrameIndex = Number(await scene.getAttribute("data-display-frame-index"));
    const canonicalModelTimeSeconds = Number(await scene.getAttribute("data-display-time"));
    const canonicalEffectClass = await scene.getAttribute("data-effect-class") ?? "";
    const canonical3dSelectionMs = performance.now() - selectionStarted;

    await timeline.focus();
    await page.keyboard.press("Home");
    await expect(scene).toHaveAttribute("data-display-frame-index", "0");
    const fourTimes = page.getByRole("button", { name: `${policy.playbackSpeed}×`, exact: true });
    await fourTimes.click();
    await expect(fourTimes).toHaveClass(/active/);
    const playbackStartFrameIndex = Number(await scene.getAttribute("data-display-frame-index"));
    await page.getByRole("button", { name: "Play playback", exact: true }).click();
    const animationFrameIntervalsMs = await collectAnimationFrameIntervals(
      page,
      policy.animationFrameSampleCount,
    );
    await page.getByRole("button", { name: "Pause playback", exact: true }).click();
    const playbackEndFrameIndex = Number(await scene.getAttribute("data-display-frame-index"));

    await page.getByRole("button", { name: "Download VSR", exact: true }).click();
    const retainedRecord = await page.evaluate(() =>
      (window as PerformanceWindow).__vectorRecordBlob ?? null);
    expect(retainedRecord?.filename).toMatch(new RegExp(`^${study.scenarioId}-[a-f0-9]{12}\\.vector$`));
    await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    const longTaskState = await page.evaluate(() => ({
      supported: (window as PerformanceWindow).__vectorLongTaskSupported ?? false,
      durations: [...((window as PerformanceWindow).__vectorLongTaskDurationsMs ?? [])],
    }));
    expect(longTaskState.supported).toBe(true);
    await client.send("HeapProfiler.collectGarbage");
    const heapAfter = await client.send("Runtime.getHeapUsage");

    measurements.push({
      scenarioId: study.scenarioId,
      frameIndex: canonicalFrameIndex,
      modelTimeSeconds: canonicalModelTimeSeconds,
      effectClass: canonicalEffectClass,
      packageLoadMs,
      workerRunMs,
      canonical3dSelectionMs,
      animationFrameIntervalsMs,
      longTaskDurationsMs: longTaskState.durations,
      heapBeforeRunBytes: heapBefore.usedSize,
      heapAfterPlaybackBytes: heapAfter.usedSize,
      recordBytes: retainedRecord?.byteLength ?? 0,
      recordId: await page.getByTestId("vsr-record-id").innerText(),
      contentDigest: await page.getByTestId("vsr-content-digest").innerText(),
      playbackStartFrameIndex,
      playbackEndFrameIndex,
    });
  }

  await page.goto("/scenarios");
  await client.send("HeapProfiler.collectGarbage");
  const cleanupHeap = await client.send("Runtime.getHeapUsage");
  const retainedHeapDriftBytes = Math.max(
    0,
    cleanupHeap.usedSize - loadedHeapSamples[0]!,
    ...loadedHeapSamples.map((usedSize) => usedSize - loadedHeapSamples[0]!),
  );
  const evidence: AirCombatBrowserPerformanceEvidence = {
    schemaVersion: "vector.air-combat-browser-performance-evidence.v1",
    projectName: testInfo.project.name,
    browserName,
    viewport: viewport!,
    userAgent: await page.evaluate(() => navigator.userAgent),
    retainedHeapDriftBytes,
    measurements,
  };
  await testInfo.attach("air-combat-browser-performance.json", {
    body: JSON.stringify({ policy, evidence }, null, 2),
    contentType: "application/json",
  });
  assertAirCombatBrowserPerformanceEvidence(evidence);
  expect(runtimeErrors).toEqual([]);
});
