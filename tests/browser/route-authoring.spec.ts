import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sha256Hex } from "../../lib/canonical-json";
import { ENGINE_VERSION } from "../../lib/engine/version";
import { INSTALLATION_CATALOGUE, INSTALLATION_CATALOGUE_IDENTITY, PUBLIC_INSTALLATIONS } from "../../lib/installations";
import { SCENARIO_PACKAGE_SCHEMA_VERSION } from "../../lib/scenario-package";
import { SCENARIO_LIBRARY } from "../../lib/scenarios";
import { STUDY_AREAS } from "../../lib/study-areas";
import { WEAPON_SIMULATION_MODELS } from "../../lib/simulation-models";
import { admitEnvironmentPack } from "../../lib/geospatial/environment-pack";

async function catalogFixture(scenarioId = "a2a-crossing-intercept") {
  const definition = SCENARIO_LIBRARY.find(
    (item) => item.id === scenarioId,
  )!;
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
      const pack = admitEnvironmentPack({ studyAreaId: area.id, weatherPresetId: weather.id }).pack;
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
        id: "browser-fixture-credibility",
        version: "1.0.0",
        approvalState: "DRAFT",
        limitations: [{
          id: "browser-fixture-limitation",
          severity: "BLOCKING",
          statement: "Browser contract fixture; no named-system performance claim.",
        }],
      },
      scenarioTemplateIds: [definition.id],
    }],
  };
}

async function expectLaptopVisual(
  surface: Locator,
  name: string,
  testInfo: TestInfo,
) {
  if (testInfo.project.name !== "laptop-1366") return;
  await expect(surface).toHaveScreenshot(name, {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.005,
  });
}

const TRANSPARENT_RASTER_TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function openGuidedWorkbench(page: Page, scenarioId: string) {
  await page.goto(`/workbench?scenario=${scenarioId}&start=guided`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".catalog-state.POSTGIS")).toHaveText(
    "PostGIS catalog connected",
    { timeout: 20_000 },
  );
}

async function selectCanonicalTimelineEnd(page: import("@playwright/test").Page) {
  const timeline = page.getByRole("slider", { name: "Run timeline" });
  await timeline.focus();
  await page.keyboard.press("End");
  return timeline;
}

async function selectTimelineBeforeEnd(
  timeline: Locator,
  deltaSeconds = 0.1,
) {
  await timeline.evaluate((element, delta) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, String(Number(input.max) - delta));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, deltaSeconds);
}

test("the unedited BVR package remains MATCHED across canonical Map and 3D presentation", async ({ page }, testInfo) => {
  const scenarioId = "a2a-crossing-intercept";
  const catalog = await catalogFixture(scenarioId);
  await page.route("**/api/catalog", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalog) }),
  );
  await page.route("**/api/map-tile?**", (route) => route.fulfill({
    status: 200,
    contentType: "image/png",
    body: TRANSPARENT_RASTER_TILE,
  }));
  await openGuidedWorkbench(page, scenarioId);
  await expect(page.locator('[data-authored-profile="bvr-mutual-offset-defensive-turn"]')).toContainText(
    "Blue OFFSET → RECOMMIT → EXTEND · Red OFFSET → DEFENSIVE_BREAK → EXTEND",
  );

  const compact = (page.viewportSize()?.width ?? 1_366) <= 768;
  if (compact) {
    await page.getByRole("button", { name: /Next: Forces & loadouts/i }).click();
    await page.getByRole("button", { name: /Next: Place & flight/i }).click();
    await expect(page.locator(".atmosphere-card")).not.toContainText(/Visibility|Relative humidity/);
    await page.getByRole("button", { name: /Next: Admitted conditions/i }).click();
    await expect(page.locator("section.configured-note")).toContainText(
      "This run has no tactical information or autonomous pilot model.",
    );
    await page.getByRole("button", { name: /Next: Validate/i }).click();
  } else {
    await page.getByRole("button", { name: "3 Place & flight" }).click();
    await expect(page.locator(".atmosphere-card")).not.toContainText(/Visibility|Relative humidity/);
    await page.getByRole("button", { name: "4 Admitted conditions" }).click();
    await expect(page.locator("section.configured-note")).toContainText(
      "This run has no tactical information or autonomous pilot model.",
    );
    await expect(page.locator("section.configured-note")).toContainText(
      "Red carries recorded loadout inventory",
    );
    await expect(page.locator("section.configured-note")).not.toContainText(
      /Sensors: enabled|EW: enabled/,
    );
    await page.getByRole("button", { name: "5 Validate" }).click();
  }
  await page.getByRole("button", { name: /run baseline/i }).click();
  await expect(page.locator('.catalog-state[data-runtime-state="completed"]')).toHaveText(
    "Worker · completed",
    { timeout: 30_000 },
  );
  const pause = page.getByRole("button", { name: "Pause run", exact: true });
  if (await pause.isVisible()) await pause.click();
  const compactPause = page.getByRole("button", { name: "Pause playback", exact: true });
  if (await compactPause.isVisible()) await compactPause.click();

  const timeline = page.getByRole("slider", { name: "Run timeline" });
  await timeline.evaluate((element, modelTimeSeconds) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(element, String(modelTimeSeconds));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, 2);
  const map = page.locator(".engagement-map-shell");
  await expect(map).toHaveAttribute("data-display-frame-index", "9");
  await expect(map).toHaveAttribute("data-display-time", "2");
  await expect(map).toHaveAttribute("data-effect-state", "BEFORE_EFFECT_BOUNDARY");
  await expect(map).toHaveAttribute("data-declared-route-feature-count", "2");
  await expect(map.locator(".map-status")).toHaveCount(0);
  const blueMap = map.locator('[data-entity-id="blue-platform-1"]');
  const redMap = map.locator('[data-entity-id="red-object-1"]');
  const weaponMap = map.locator('[data-entity-id="blue-weapon-1"]');
  await expect(weaponMap).toHaveAttribute("data-lifecycle", "ACTIVE");
  await expect(weaponMap).toHaveAttribute("data-flight-state", "BOOST");
  await expect(weaponMap).toHaveAttribute("data-label-visibility", "COMPACT");
  await expect(blueMap).toHaveAttribute("data-label-visibility", "VISIBLE");
  await expect(map).toHaveAttribute("data-launched-store-count", "1");

  const environmentIdentity = page.locator(".environment-pack-identity");
  const recordedEntities = page.getByRole("list", { name: "Recorded entities" });
  const mapToolbar = map.locator(".vector-map-toolbar");
  const [environmentBox, legendBox, toolbarBox] = await Promise.all([
    environmentIdentity.boundingBox(),
    recordedEntities.boundingBox(),
    mapToolbar.boundingBox(),
  ]);
  expect(environmentBox).not.toBeNull();
  expect(legendBox).not.toBeNull();
  expect(toolbarBox).not.toBeNull();
  expect(environmentBox!.y + environmentBox!.height).toBeLessThanOrEqual(legendBox!.y);
  const toolbarAndLegendDoNotOverlap =
    toolbarBox!.x + toolbarBox!.width <= legendBox!.x
    || legendBox!.x + legendBox!.width <= toolbarBox!.x
    || toolbarBox!.y + toolbarBox!.height <= legendBox!.y
    || legendBox!.y + legendBox!.height <= toolbarBox!.y;
  expect(toolbarAndLegendDoNotOverlap).toBe(true);
  await expectLaptopVisual(map, "bvr-long-range-launch-map.png", testInfo);

  await timeline.focus();
  await page.keyboard.press("End");
  await expect(map).toHaveAttribute("data-display-frame-index", "146");
  await expect(map).toHaveAttribute("data-display-time", "36");
  await expect(map).toHaveAttribute("data-effect-state", "RECORDED");
  await expect(map).toHaveAttribute("data-effect-class", "KILL");
  await expect(map).toHaveAttribute("data-declared-route-feature-count", "2");
  await expect(map).toHaveAttribute("data-achieved-trail-feature-count", "3");
  await expect(map).toHaveAttribute("data-launched-store-count", "1");
  await expect(map.locator(".map-status")).toHaveCount(0);

  await expect(blueMap).toContainText("Su-30MKI");
  await expect(blueMap).toHaveAttribute("data-affiliation", "BLUE");
  await expect(blueMap.locator("circle.tactical-frame")).toHaveCount(1);
  await expect(redMap).toContainText("F-16C Block 52");
  await expect(redMap).toHaveAttribute("data-affiliation", "RED");
  await expect(redMap).toHaveAttribute("data-lifecycle", "TERMINATED");
  await expect(redMap.locator("path.tactical-frame")).toHaveCount(1);
  await expect(weaponMap).toContainText("Astra Mk 1");
  await expect(weaponMap).toHaveAttribute("data-lifecycle", "TERMINATED");
  await expect(weaponMap.locator('svg[data-symbol-role="GUIDED_MISSILE"]')).toHaveCount(1);
  await expectLaptopVisual(map, "bvr-long-range-effect-map.png", testInfo);

  await page.getByRole("button", { name: "3D", exact: true }).click();
  const scene = page.locator(".simulation-scene");
  await expect(scene).toHaveAttribute("data-display-frame-index", "146");
  await expect(scene).toHaveAttribute("data-effect-class", "KILL");
  await expect(scene).toHaveAttribute("data-authored-profile-applicability", "MATCHED");
  await expect(scene).toHaveAttribute("data-authored-profile-applicability-reason", "EXACT_CAUSAL_MATCH");
  await expect(scene).toHaveAttribute("data-declared-route-count", "2");
  await expect(scene).toHaveAttribute("data-achieved-trail-count", "3");
  await expect(scene).toHaveAttribute("data-launched-store-count", "1");
});

test("short-wide BVR playback keeps key-free tiles, labels, controls, and frame-earned copy separate", async ({ page }) => {
  await page.setViewportSize({ width: 1_857, height: 339 });
  const tileRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/map-tile?")) tileRequests.push(request.url());
  });
  const scenarioId = "a2a-crossing-intercept";
  const catalog = await catalogFixture(scenarioId);
  await page.route("**/api/catalog", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalog) }),
  );
  await openGuidedWorkbench(page, scenarioId);
  await page.getByRole("button", { name: "5 Validate", exact: true }).click();
  await page.getByRole("button", { name: /run baseline/i }).click();
  await expect(page.locator('.catalog-state[data-runtime-state="completed"]')).toHaveText(
    "Worker · completed",
    { timeout: 30_000 },
  );
  await expect(page.locator('.map-tactical-marker[data-entity-id="blue-platform-1"]')).toBeVisible();
  await expect(page.locator(".outcome")).toHaveAttribute("data-effect-state", "BEFORE_EFFECT_BOUNDARY");
  await expect(page.locator(".outcome")).toContainText("Outcome pending");
  await expect(page.locator(".outcome")).not.toContainText("Generic educational model");
  await expect(page.locator(".session-right .track-state-unavailable")).toContainText(
    "No admitted sensor model; no track is shown.",
  );
  await expect(page.locator(".session-right .track-evidence-disclosure")).not.toHaveAttribute("open", "");
  expect(tileRequests.length).toBeGreaterThan(0);
  expect(tileRequests.every((url) => url.includes("revision=osm-derived-v1"))).toBe(true);
  expect(await page.locator("body").innerText()).not.toContain("API KEY REQUIRED");

  const layout = await page.locator(".engagement-map-shell").evaluate((surface) => {
    const rect = (element: Element) => {
      const value = element.getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom };
    };
    const intersects = (left: ReturnType<typeof rect>, right: ReturnType<typeof rect>) =>
      !(left.right <= right.left || left.left >= right.right || left.bottom <= right.top || left.top >= right.bottom);
    const labelBoxes = [...surface.querySelectorAll<HTMLElement>('.map-tactical-marker[data-entity-id] > span')]
      .filter((label) => getComputedStyle(label).display !== "none")
      .map(rect);
    const controlBoxes = [...surface.querySelectorAll<HTMLElement>(
      ".vector-map-toolbar,.map-scope-switch,.map-layer-legend,.map-context-disclosure,.vector-map-telemetry",
    )].filter((control) => getComputedStyle(control).display !== "none").map(rect);
    const pairs = (boxes: ReturnType<typeof rect>[]) => boxes.flatMap((box, index) =>
      boxes.slice(index + 1).filter((candidate) => intersects(box, candidate)));
    return {
      height: surface.getBoundingClientRect().height,
      labelCollisions: pairs(labelBoxes).length,
      controlCollisions: pairs(controlBoxes).length,
      visibleLabels: labelBoxes.length,
    };
  });
  expect(layout.height).toBeGreaterThanOrEqual(300);
  expect(layout.visibleLabels).toBeGreaterThanOrEqual(2);
  expect(layout.labelCollisions).toBe(0);
  expect(layout.controlCollisions).toBe(0);
});

test("browser presentation changes only at the canonical target-effect frame", async ({ page }, testInfo) => {
  const scenarioId = "a2a-high-energy-crossing-challenge";
  const catalog = await catalogFixture(scenarioId);
  await page.route("**/api/catalog", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalog) }),
  );
  await page.route("**/api/map-tile?**", (route) => route.abort());
  await openGuidedWorkbench(page, scenarioId);
  await expect(
    page.locator('[data-authored-profile="beam-drag-extend-recommit"]'),
  ).toContainText(
    "Blue INTERCEPT → OFFSET → RECOMMIT · Red BEAM → DRAG → EXTEND",
  );

  const compact = (page.viewportSize()?.width ?? 1_366) <= 768;
  if (compact) {
    await page.getByRole("button", { name: /Next: Forces & loadouts/i }).click();
    await page.getByRole("button", { name: /Next: Place & flight/i }).click();
    await page.getByRole("button", { name: /Next: Admitted conditions/i }).click();
    await page.getByRole("button", { name: /Next: Validate/i }).click();
  } else {
    await page.getByRole("button", { name: "5 Validate" }).click();
  }
  await expect(page.getByRole("button", { name: /run baseline/i })).toBeEnabled();
  await page.getByRole("button", { name: /run baseline/i }).click();
  await expect(page.locator('.catalog-state[data-runtime-state="completed"]')).toHaveText(
    "Worker · completed",
    { timeout: 30_000 },
  );
  const pause = page.getByRole("button", { name: "Pause run", exact: true });
  if (await pause.isVisible()) await pause.click();
  const compactPause = page.getByRole("button", { name: "Pause playback", exact: true });
  if (await compactPause.isVisible()) await compactPause.click();

  const timeline = page.getByRole("slider", { name: "Run timeline" });
  await timeline.focus();
  await page.keyboard.press("End");
  const summary = page.locator('.target-effect-summary:visible').first();
  await expect(summary).toHaveAttribute("data-effect-state", "RECORDED");
  await expect(summary).toHaveAttribute("data-effect-class", "NO_EFFECT");
  await expect(summary).toHaveAttribute("data-effect-frame-index", "461");
  await expect(summary).toHaveAttribute("data-effect-time", "114.7");
  await expect(summary).toHaveAttribute("data-target-lifecycle", "ACTIVE");
  await expect(summary).toHaveAttribute("data-kill-claim-authorized", "false");
  await expect(summary).toContainText("No effect recorded");
  await expect(summary).not.toContainText("MODEL_ASSUMPTION");

  await selectTimelineBeforeEnd(timeline);
  await expect(summary).toHaveAttribute("data-effect-state", "BEFORE_EFFECT_BOUNDARY");
  await expect(summary).toHaveAttribute("data-effect-class", "NONE");
  await expect(summary).toHaveAttribute("data-kill-claim-authorized", "false");
  await expect(summary).toContainText("Boundary 114.700 s");

  await page.getByRole("button", { name: "3D", exact: true }).click();
  const scene = page.locator(".simulation-scene");
  await expect(scene).toHaveAttribute("data-display-frame-index", "460");
  await expect(scene).toHaveAttribute("data-display-time", "114.65");
  await expect(scene).toHaveAttribute("data-effect-state", "BEFORE_EFFECT_BOUNDARY");
  await expect(scene).toHaveAttribute("data-effect-class", "NONE");
  await expect(scene).toHaveAttribute("data-label-policy", "TACTICAL_LABEL_POLICY_V1");
  await expect(scene).toHaveAttribute("data-authored-profile-applicability", "MATCHED");
  await expect(scene).toHaveAttribute("data-authored-profile-applicability-reason", "EXACT_CAUSAL_MATCH");

  await timeline.focus();
  await page.keyboard.press("End");
  await expect(scene).toHaveAttribute("data-display-frame-index", "461");
  await expect(scene).toHaveAttribute("data-display-time", "114.7");
  await expect(scene).toHaveAttribute("data-effect-state", "RECORDED");
  await expect(scene).toHaveAttribute("data-effect-class", "NO_EFFECT");
  await expect(scene).toHaveAttribute("data-visible-label-count", /[1-9]/);

  const blueLabel = scene.locator('[data-entity-id="blue-platform-1"]');
  const redLabel = scene.locator('[data-entity-id="red-object-1"]');
  await expect(blueLabel).toContainText(/Su-30MKI.*RECOMMIT.*authored intent; no autonomous selection/i);
  await expect(blueLabel).toHaveAttribute("data-authored-intent", "RECOMMIT");
  await expect(blueLabel).toHaveAttribute("aria-label", /blue fighter.*recommit authored intent; no autonomous selection/i);
  await expect(redLabel).toContainText(/F-16C Block 52.*EXTEND.*authored intent; no autonomous selection/i);
  await expect(redLabel).toHaveAttribute("data-authored-intent", "EXTEND");
  await expect(redLabel).toHaveAttribute("aria-label", /red fighter.*extend authored intent; no autonomous selection/i);
  expect(await scene.locator(".simulation-entity-label").evaluateAll((labels) =>
    labels.filter((label) => /BLUE 1|RED 1|WEAPON [0-9]/i.test(label.textContent ?? "")).length,
  )).toBe(0);
  const visibleLabels = scene.locator('.simulation-entity-label:not([hidden])');
  await expect(visibleLabels.first()).toHaveAttribute("data-label-visibility", /VISIBLE|COMPACT/);
  await expect(visibleLabels.first()).toHaveAttribute("data-collision-state", "CLEAR");
  await expect(visibleLabels.first()).toHaveAttribute("data-edge-state", /CLEAR|CLAMPED/);
  await expect(scene).toHaveAttribute("data-declared-route-count", "2");
  await expect(scene).toHaveAttribute("data-achieved-trail-count", "3");
  await expect(scene).toHaveAttribute("data-altitude-stem-count", "3");
  await expect(scene).toHaveAttribute("data-launched-store-count", "1");
  await expectLaptopVisual(scene, "transition-recommit-label-decluttering.png", testInfo);
});

test("the close-merge WVR effect remains canonical and labels exact authored intent", async ({ page }, testInfo) => {
  const scenarioId = "a2a-defensive-break";
  const catalog = await catalogFixture(scenarioId);
  await page.route("**/api/catalog", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalog) }),
  );
  await page.route("**/api/map-tile?**", (route) => route.abort());
  await openGuidedWorkbench(page, scenarioId);
  await expect(page.locator('[data-authored-profile="wvr-one-circle-defensive-break"]')).toContainText(
    "Blue MERGE → ONE_CIRCLE → EXTEND · Red MERGE → DEFENSIVE_BREAK → EXTEND",
  );

  const compact = (page.viewportSize()?.width ?? 1_366) <= 768;
  if (compact) {
    await page.getByRole("button", { name: /Next: Forces & loadouts/i }).click();
    await page.getByRole("button", { name: /Next: Place & flight/i }).click();
    await page.getByRole("button", { name: /Next: Admitted conditions/i }).click();
    await page.getByRole("button", { name: /Next: Validate/i }).click();
  } else {
    await page.getByRole("button", { name: "5 Validate" }).click();
  }
  await page.getByRole("button", { name: /run baseline/i }).click();
  await expect(page.locator('.catalog-state[data-runtime-state="completed"]')).toHaveText(
    "Worker · completed",
    { timeout: 30_000 },
  );
  const pause = page.getByRole("button", { name: "Pause run", exact: true });
  if (await pause.isVisible()) await pause.click();
  const compactPause = page.getByRole("button", { name: "Pause playback", exact: true });
  if (await compactPause.isVisible()) await compactPause.click();

  const timeline = page.getByRole("slider", { name: "Run timeline" });
  await timeline.focus();
  await page.keyboard.press("End");
  const summary = page.locator('.target-effect-summary:visible').first();
  await expect(summary).toHaveAttribute("data-effect-frame-index", "116");
  await expect(summary).toHaveAttribute("data-effect-time", "28.4");
  await selectTimelineBeforeEnd(timeline);
  await expect(summary).toHaveAttribute("data-effect-state", "BEFORE_EFFECT_BOUNDARY");
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const scene = page.locator(".simulation-scene");
  await expect(scene).toHaveAttribute("data-display-frame-index", "114");
  await expect(scene).toHaveAttribute("data-display-time", "28.25");
  await expect(scene).toHaveAttribute("data-effect-state", "BEFORE_EFFECT_BOUNDARY");

  await timeline.focus();
  await page.keyboard.press("End");
  await expect(scene).toHaveAttribute("data-display-frame-index", "116");
  await expect(scene).toHaveAttribute("data-display-time", "28.4");
  await expect(scene).toHaveAttribute("data-effect-state", "RECORDED");
  await expect(scene).toHaveAttribute("data-effect-class", "KILL");
  await expect(scene).toHaveAttribute("data-authored-profile-applicability", "MATCHED");
  await expect(scene).toHaveAttribute("data-authored-profile-applicability-reason", "EXACT_CAUSAL_MATCH");
  const redLabel = scene.locator('[data-entity-id="red-object-1"]');
  const blueLabel = scene.locator('[data-entity-id="blue-platform-1"]');
  await expect(blueLabel).toHaveAttribute("data-affiliation", "BLUE");
  await expect(blueLabel).toHaveAttribute("aria-label", /blue fighter/i);
  await expect(redLabel).toHaveAttribute("data-lifecycle", "TERMINATED");
  await expect(redLabel).toHaveAttribute("data-affiliation", "RED");
  await expect(redLabel).toHaveAttribute("data-authored-intent", /DEFENSIVE_BREAK|EXTEND/);
  await expect(redLabel).toHaveAttribute("aria-label", /red fighter.*authored intent; no autonomous selection/i);
  await expect(redLabel).toHaveAttribute("data-label-visibility", /VISIBLE|COMPACT/);
  await expect(blueLabel).toHaveAttribute("data-label-visibility", /VISIBLE|COMPACT/);
  await expect(scene.locator('[data-entity-id="blue-weapon-1"]')).toHaveAttribute(
    "data-label-visibility",
    "HIDDEN",
  );
  expect(await scene.locator(".simulation-entity-label").evaluateAll((labels) =>
    labels.filter((label) => /BLUE 1|RED 1|WEAPON [0-9]/i.test(label.textContent ?? "")).length,
  )).toBe(0);
  await expect(scene).toHaveAttribute("data-visible-label-count", /[1-9]/);
  await expect(scene).toHaveAttribute("data-declared-route-count", "2");
  await expect(scene).toHaveAttribute("data-achieved-trail-count", "3");
  await expect(scene).toHaveAttribute("data-altitude-stem-count", "3");
  await expect(scene).toHaveAttribute("data-launched-store-count", "1");
  await expectLaptopVisual(scene, "wvr-close-merge-altitude-stems.png", testInfo);
});

// Correctness journeys verify eventual authoritative Worker completion across
// the viewport matrix. The dedicated browser-performance contract separately
// retains the 10 s Worker budget on its controlled measurement viewport.
const CORRECTNESS_WORKER_COMPLETION_TIMEOUT_MS = 45_000;

const canonicalAirStudies = [
  {
    title: "the BVR Air study keeps every playback and outcome surface on one canonical frame",
    id: "a2a-crossing-intercept",
    frameIndex: "146",
    time: "36",
    effect: "KILL",
  },
  {
    title: "the WVR Air study keeps every playback and outcome surface on one canonical frame",
    id: "a2a-defensive-break",
    frameIndex: "116",
    time: "28.4",
    effect: "KILL",
  },
  {
    title: "the transition Air study keeps every playback and outcome surface on one canonical frame",
    id: "a2a-high-energy-crossing-challenge",
    frameIndex: "461",
    time: "114.7",
    effect: "NO_EFFECT",
  },
] as const;

for (const study of canonicalAirStudies) {
  test(study.title, async ({ page }) => {
    test.setTimeout(90_000);

    const catalog = await catalogFixture(study.id);
    await page.route("**/api/catalog", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalog) }),
    );
    await page.route("**/api/map-tile?**", (route) => route.abort());
    await openGuidedWorkbench(page, study.id);

    const compact = (page.viewportSize()?.width ?? 1_366) <= 768;
    if (compact) {
      await page.getByRole("button", { name: /Next: Forces & loadouts/i }).click();
      await page.getByRole("button", { name: /Next: Place & flight/i }).click();
      await page.getByRole("button", { name: /Next: Admitted conditions/i }).click();
      await page.getByRole("button", { name: /Next: Validate/i }).click();
    } else {
      await page.getByRole("button", { name: "5 Validate" }).click();
    }
    await page.getByRole("button", { name: /run baseline/i }).click();
    await expect(page.locator('.catalog-state[data-runtime-state="completed"]')).toHaveText(
      "Worker · completed",
      { timeout: CORRECTNESS_WORKER_COMPLETION_TIMEOUT_MS },
    );

    const fourTimes = page.getByRole("button", { name: "4×", exact: true });
    await fourTimes.click();
    await expect(fourTimes).toHaveClass(/active/);
    const pauseRun = page.getByRole("button", { name: "Pause run", exact: true });
    if (await pauseRun.isVisible()) await pauseRun.click();
    const pausePlayback = page.getByRole("button", { name: "Pause playback", exact: true });
    if (await pausePlayback.isVisible()) await pausePlayback.click();

    const timeline = await selectCanonicalTimelineEnd(page);
    await expect(timeline).toHaveValue(study.time);
    await expect(timeline).toHaveAttribute("data-selected-frame-index", study.frameIndex);
    await expect(timeline).toHaveAttribute("data-selected-display-time", study.time);

    const map = page.locator(".engagement-map-shell");
    const playback = page.locator(".playback [data-frame-index]");
    const telemetry = page.getByRole("region", { name: "Synchronized run telemetry" });
    const geometry = page.locator(".current-geometry").first();
    const routeTransition = page.locator(".route-transition-inspector:visible").first();
    const targetEffect = page.locator(".target-effect-summary:visible").first();
    await expect(map).toHaveAttribute("data-display-frame-index", study.frameIndex);
    await expect(map).toHaveAttribute("data-display-time", study.time);
    for (const surface of [playback, telemetry, geometry, routeTransition]) {
      await expect(surface).toHaveAttribute("data-frame-index", study.frameIndex);
      await expect(surface).toHaveAttribute("data-display-time", study.time);
    }
    await expect(map).toHaveAttribute("data-effect-class", study.effect);
    await expect(targetEffect).toHaveAttribute("data-effect-frame-index", study.frameIndex);
    await expect(targetEffect).toHaveAttribute("data-effect-time", study.time);
    await expect(targetEffect).toHaveAttribute("data-effect-class", study.effect);

    const pausedFrame = await playback.getAttribute("data-frame-index");
    await page.waitForTimeout(150);
    await expect(playback).toHaveAttribute("data-frame-index", pausedFrame!);

    await page.getByRole("button", { name: "3D", exact: true }).click();
    const scene = page.locator(".simulation-scene");
    await expect(scene).toHaveAttribute("data-display-frame-index", study.frameIndex);
    await expect(scene).toHaveAttribute("data-display-time", study.time);
    await expect(scene).toHaveAttribute("data-effect-class", study.effect);

    await selectTimelineBeforeEnd(timeline);
    await expect(scene).not.toHaveAttribute("data-display-frame-index", study.frameIndex);
    await expect(targetEffect).toHaveAttribute("data-effect-state", "BEFORE_EFFECT_BOUNDARY");
    await timeline.focus();
    await page.keyboard.press("End");
    await expect(scene).toHaveAttribute("data-display-frame-index", study.frameIndex);
    await expect(timeline).toHaveAttribute("data-selected-frame-index", study.frameIndex);
    await expect(targetEffect).toHaveAttribute("data-effect-class", study.effect);

    await page.getByRole("button", { name: "Explain & report", exact: true }).click();
    const situationLogEffect = page.getByTestId("results-target-effect-event");
    await expect(situationLogEffect).toHaveAttribute("data-effect-frame-index", study.frameIndex);
    await expect(situationLogEffect).toHaveAttribute("data-effect-time", study.time);
    await expect(situationLogEffect).toHaveAttribute("data-effect-class", study.effect);
  });
}

test("an invalid non-spatial numeric draft cannot be bypassed by changing builder steps", async ({ page }) => {
  const catalog = await catalogFixture();
  await page.route("**/api/catalog", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalog) }),
  );
  await page.route("**/api/map-tile?**", (route) => route.abort());
  await openGuidedWorkbench(page, "a2a-crossing-intercept");

  const missionClass = page.getByRole("combobox", { name: "Mission class" });
  await missionClass.selectOption("COMBAT_AIR_PATROL");
  const flightSize = page.getByRole("textbox", { name: "CAP flight size" });
  await flightSize.fill("1e");
  await expect(flightSize).toHaveValue("1e");
  await expect(flightSize).toHaveAttribute("aria-invalid", "true");

  const nextStep = page.getByRole("button", {
    name: "Next: Forces & loadouts",
    exact: true,
  });
  await nextStep.click();
  await expect(page.getByRole("heading", { name: /What is this run comparing/i })).toBeVisible();
  await expect(flightSize).toBeVisible();
  await expect(flightSize).toHaveValue("1e");
  const describedBy = await flightSize.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  const liveError = page.locator(`[id="${describedBy}"]`);
  await expect(liveError).toHaveRole("alert");
  await expect(liveError).toContainText(/syntax/i);

  await flightSize.fill("2");
  await expect(flightSize).toHaveAttribute("aria-invalid", "false");
  await nextStep.click();
  await expect(page.getByRole("heading", { name: /Who is fighting/i })).toBeVisible();
});

test("QHD Define uses one readable task measure without a detached action rail", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "full-hd", "The full-HD project owns the explicit QHD regression viewport.");
  await page.setViewportSize({ width: 2_560, height: 1_440 });
  const catalog = await catalogFixture();
  await page.route("**/api/catalog", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalog) }),
  );
  await page.route("**/api/map-tile?**", (route) => route.abort());
  await openGuidedWorkbench(page, "a2a-crossing-intercept");

  const header = await page.locator(".builder-scroll > header").boundingBox();
  const content = await page.locator(".builder-step-content").boundingBox();
  const runName = await page.getByRole("textbox", { name: "Run name" }).boundingBox();
  const mission = await page.getByRole("region", { name: "Air mission contract" }).boundingBox();
  const choices = await page.locator(".guided-options").boundingBox();
  const actions = await page.locator(".builder-actions").boundingBox();

  expect(header).not.toBeNull();
  expect(content).not.toBeNull();
  expect(runName).not.toBeNull();
  expect(mission).not.toBeNull();
  expect(choices).not.toBeNull();
  expect(actions).not.toBeNull();
  expect(Math.abs(header!.x - content!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(runName!.x - content!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(mission!.x - content!.x)).toBeLessThanOrEqual(1);
  expect(runName!.width).toBeGreaterThanOrEqual(900);
  expect(mission!.width).toBeGreaterThanOrEqual(1_000);
  expect(actions!.y - (choices!.y + choices!.height)).toBeLessThanOrEqual(80);
  expect(actions!.y).toBeLessThan(1_250);

  await expect(page).toHaveScreenshot("qhd-define-workbench.png", {
    animations: "disabled",
    fullPage: false,
  });
});

test("duration and replay seed use governed raw admission before builder navigation", async ({ page }) => {
  const catalog = await catalogFixture();
  await page.route("**/api/catalog", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalog) }),
  );
  await page.route("**/api/map-tile?**", (route) => route.abort());
  await openGuidedWorkbench(page, "a2a-crossing-intercept");

  const duration = page.getByRole("textbox", { name: "Run duration" });
  const seed = page.getByRole("textbox", { name: "Replay seed" });
  const compact = (page.viewportSize()?.width ?? 1_366) <= 768;
  const nextStep = compact
    ? page.getByRole("button", { name: /^Next: Forces & loadouts$/i })
    : page.getByRole("button", { name: /^2 Forces & loadouts$/i });
  await expect(duration).toHaveValue("100");
  await expect(seed).toHaveValue("42");

  await seed.fill("");
  await expect(seed).toHaveValue("");
  await expect(seed).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert")).toContainText("empty");
  await nextStep.click();
  await expect(seed).toBeVisible();
  await expect(seed).toHaveValue("");

  await seed.fill("42");
  await expect(seed).toHaveAttribute("aria-invalid", "false");
  await duration.fill("54.1251");
  await seed.fill("42.5");
  await expect(duration).toHaveAttribute("aria-invalid", "true");
  await expect(seed).toHaveAttribute("aria-invalid", "true");
  await nextStep.click();
  await expect(duration).toBeVisible();
  await expect(duration).toHaveValue("54.1251");
  await expect(page.getByRole("alert")).toHaveCount(2);

  await duration.fill("54.125");
  await seed.fill("314159");
  await expect(duration).toHaveAttribute("aria-invalid", "false");
  await expect(seed).toHaveAttribute("aria-invalid", "false");
  await nextStep.click();
  await expect(page.getByRole("heading", { name: /Who is fighting/i })).toBeVisible();
});

test("shared transient controls hand off once and remain accessible, contained, and stable", async ({ page }, testInfo) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  const catalog = await catalogFixture();
  const longLabel = "Jodhpur Air Force Station — public-reference catalogue identity with an intentionally long responsive label";
  const longLabelInstallation = catalog.installations.find((item) => item.id === "iaf-jodhpur");
  if (longLabelInstallation) longLabelInstallation.name = longLabel;
  await page.route("**/api/catalog", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalog) }),
  );
  await page.route("**/api/map-tile?**", (route) => route.abort());
  await openGuidedWorkbench(page, "a2a-crossing-intercept");
  const compact = (page.viewportSize()?.width ?? 1_366) <= 768;

  if (compact) await page.getByRole("button", { name: /Next: Forces & loadouts/i }).click();
  else await page.getByRole("button", { name: /^2 Forces & loadouts$/i }).click();
  const blueTeam = page.locator("article.blue-team");
  const aircraft = blueTeam.getByRole("combobox", { name: /Aircraft variant:/i });
  const weapon = blueTeam.getByRole("combobox", { name: /Selected weapon:/i });
  await expect(aircraft).toHaveAttribute("aria-controls");
  await aircraft.click();
  await expect(page.getByRole("listbox", { name: "Aircraft variant" })).toBeVisible();
  await weapon.click();
  await expect(aircraft).toHaveAttribute("aria-expanded", "false");
  await expect(weapon).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("listbox")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(weapon).toBeFocused();
  await expect(page.getByRole("listbox")).toHaveCount(0);

  if (compact) await page.getByRole("button", { name: /Next: Place & flight/i }).click();
  else await page.getByRole("button", { name: /^3 Place & flight$/i }).click();
  await page.getByRole("button", { name: /Rajasthan desert/i }).click();
  const blueOrigin = page.getByRole("combobox", { name: /Blue origin:/i });
  const redOrigin = page.getByRole("combobox", { name: /Red origin:/i });
  const touchClient = ["phone-390", "tablet-768"].includes(testInfo.project.name)
    ? await page.context().newCDPSession(page)
    : null;
  if (touchClient) {
    await touchClient.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  }
  const activateOrigin = async (trigger: typeof blueOrigin) => {
    if (!touchClient) {
      await trigger.click();
      return;
    }
    await trigger.evaluate((element) => {
      element.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        composed: true,
        isPrimary: true,
        pointerId: 1,
        pointerType: "touch",
      }));
      element.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        composed: true,
        isPrimary: true,
        pointerId: 1,
        pointerType: "touch",
      }));
      (element as HTMLElement).click();
    });
  };
  await activateOrigin(blueOrigin);
  const longOption = page.getByRole("option", { name: new RegExp(longLabel, "i") });
  await expect(longOption).toBeVisible();
  const longLabelContainment = await longOption.evaluate((option) => {
    const optionBox = option.getBoundingClientRect();
    const listbox = option.closest("[role=listbox]")!.getBoundingClientRect();
    return {
      optionLeft: optionBox.left,
      optionRight: optionBox.right,
      surfaceLeft: listbox.left,
      surfaceRight: listbox.right,
    };
  });
  expect(longLabelContainment.optionLeft).toBeGreaterThanOrEqual(longLabelContainment.surfaceLeft);
  expect(longLabelContainment.optionRight).toBeLessThanOrEqual(longLabelContainment.surfaceRight);
  await activateOrigin(redOrigin);
  await expect(blueOrigin).toHaveAttribute("aria-expanded", "false");
  await expect(redOrigin).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("listbox")).toHaveCount(1);

  const basemap = page.getByRole("combobox", { name: /Basemap:/i });
  await activateOrigin(basemap);
  await expect(redOrigin).toHaveAttribute("aria-expanded", "false");
  await expect(basemap).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("listbox", { name: "Basemap" })).toBeVisible();
  const containment = await page.getByRole("listbox", { name: "Basemap" }).evaluate((surface) => {
    const box = surface.getBoundingClientRect();
    const viewport = window.visualViewport;
    return {
      bottom: box.bottom,
      height: box.height,
      left: box.left,
      right: box.right,
      viewportHeight: viewport?.height ?? window.innerHeight,
      viewportWidth: viewport?.width ?? window.innerWidth,
    };
  });
  expect(containment.height).toBeGreaterThan(0);
  expect(containment.left).toBeGreaterThanOrEqual(7);
  expect(containment.right).toBeLessThanOrEqual(containment.viewportWidth - 7);
  expect(containment.bottom).toBeLessThanOrEqual(containment.viewportHeight - 7);
  const stickyRailPlacement = await page.getByRole("listbox", { name: "Basemap" }).evaluate((surface) => {
    const overlay = surface.getBoundingClientRect();
    const rail = document.querySelector<HTMLElement>("[data-vector-overlay-obstacle=persistent-action-rail]")
      ?.getBoundingClientRect();
    if (!rail) return { avoids: false, overlay: null, rail: null };
    return {
      avoids: overlay.right <= rail.left
      || overlay.left >= rail.right
      || overlay.bottom <= rail.top
      || overlay.top >= rail.bottom,
      overlay: { bottom: overlay.bottom, left: overlay.left, right: overlay.right, top: overlay.top },
      rail: { bottom: rail.bottom, left: rail.left, right: rail.right, top: rail.top },
    };
  });
  expect(stickyRailPlacement.avoids, JSON.stringify(stickyRailPlacement)).toBe(true);
  const coarsePointer = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  if (touchClient) expect(coarsePointer).toBe(true);
  if (coarsePointer) {
    const triggerBox = await basemap.boundingBox();
    expect(triggerBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(triggerBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    const optionBoxes = await page.getByRole("listbox", { name: "Basemap" }).getByRole("option").evaluateAll((items) =>
      items.map((item) => ({
        height: item.getBoundingClientRect().height,
        width: item.getBoundingClientRect().width,
      })),
    );
    expect(optionBoxes.every((box) => box.height >= 44 && box.width >= 44)).toBe(true);
  }
  await page.getByRole("option", { name: "Standard" }).click();
  await expect(basemap).toBeFocused();
  await expect(page.getByRole("listbox")).toHaveCount(0);

  if (testInfo.project.name === "laptop-1366") {
    const client = await page.context().newCDPSession(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await basemap.click();
    expect(await page.getByRole("listbox", { name: "Basemap" }).evaluate((surface) =>
      getComputedStyle(surface).scrollBehavior,
    )).toBe("auto");
    await page.keyboard.press("Escape");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await client.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
    await basemap.evaluate((trigger) => (trigger as HTMLElement).click());
    const zoomContainment = await page.getByRole("listbox", { name: "Basemap" }).evaluate((surface) => {
      const box = surface.getBoundingClientRect();
      return {
        bottom: box.bottom,
        left: box.left,
        right: box.right,
        viewportHeight: window.visualViewport?.height ?? window.innerHeight,
        viewportWidth: window.visualViewport?.width ?? window.innerWidth,
      };
    });
    expect(zoomContainment.left).toBeGreaterThanOrEqual(7);
    expect(zoomContainment.right).toBeLessThanOrEqual(zoomContainment.viewportWidth - 7);
    expect(zoomContainment.bottom).toBeLessThanOrEqual(zoomContainment.viewportHeight - 7);
    await page.keyboard.press("Escape");
    await client.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });

    await client.send("HeapProfiler.collectGarbage");
    const before = await client.send("Runtime.getHeapUsage");
    const timings = await page.evaluate(async () => {
      const triggers = Array.from(document.querySelectorAll<HTMLButtonElement>(".origin-picker-trigger"));
      const shifts: number[] = [];
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as PerformanceEntryList & Array<{ value: number; hadRecentInput: boolean }>) {
          if (!entry.hadRecentInput) shifts.push(entry.value);
        }
      });
      observer.observe({ type: "layout-shift", buffered: true });
      const samples: number[] = [];
      for (let cycle = 0; cycle < 105; cycle += 1) {
        const started = performance.now();
        triggers[cycle % 2]!.click();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (cycle >= 5) samples.push(performance.now() - started);
      }
      observer.disconnect();
      samples.sort((a, b) => a - b);
      return {
        cls: shifts.reduce((sum, value) => sum + value, 0),
        p95Ms: samples[Math.floor(samples.length * 0.95)] ?? Infinity,
        surfaces: document.querySelectorAll("[data-vector-overlay=transient]").length,
      };
    });
    await client.send("HeapProfiler.collectGarbage");
    const after = await client.send("Runtime.getHeapUsage");
    const heapDeltaBytes = after.usedSize - before.usedSize;
    await testInfo.attach("overlay-performance.json", {
      body: JSON.stringify({ ...timings, heapDeltaBytes }),
      contentType: "application/json",
    });
    expect(timings.p95Ms).toBeLessThanOrEqual(100);
    expect(timings.cls).toBeLessThanOrEqual(0.05);
    expect(timings.surfaces).toBe(1);
    expect(heapDeltaBytes).toBeLessThanOrEqual(2_000_000);
  }

  await page.goto("/scenarios");
  await expect(page.locator("[data-vector-overlay=transient]")).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});

test("a current deployment manifest drives the real Worker run after route recovery", async ({ page }) => {
  // This journey authors every mission layer before starting the real Worker.
  // Keep its orchestration timeout distinct from the explicit Worker and 3D
  // performance budgets asserted in air-combat-performance.spec.ts.
  test.setTimeout(90_000);
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  const catalog = await catalogFixture();
  await page.route("**/api/catalog", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalog) }),
  );
  // Tile transport has its own bounded cache contract. This journey exercises
  // the real MapLibre canvas/markers/resize path without coupling every
  // viewport to the tile proxy's network sockets.
  await page.route("**/api/map-tile?**", (route) => route.abort());

  await openGuidedWorkbench(page, "a2a-crossing-intercept");
  await expect(page.getByRole("region", { name: "Air mission contract" })).toContainText("vector.air-mission.v1");
  await page.getByRole("combobox", { name: "Mission class" }).selectOption("COMBAT_AIR_PATROL");
  await expect(page.getByRole("group", { name: "CAP defaults" })).toBeVisible();
  await page.getByRole("combobox", { name: "Engagement regime" }).selectOption("BVR");
  const stationTime = page.getByRole("slider", { name: /CAP on-station time/i });
  await stationTime.focus();
  await page.keyboard.press("ArrowRight");
  await expect(stationTime).toHaveValue("35");
  await expect(page.getByRole("textbox", { name: "Recovery policy" })).toBeVisible();
  const compact = (page.viewportSize()?.width ?? 1_366) <= 768;
  if (compact) {
    await page.getByRole("button", { name: /Next: Forces & loadouts/i }).click();
    await page.getByRole("button", { name: /Next: Place & flight/i }).click();
  } else {
    await page.getByRole("button", { name: /Place & flight/i }).click();
  }

  const showContextChoices = page.getByRole("button", { name: "Show context choices" });
  if (await showContextChoices.isVisible()) await showContextChoices.click();
  await page.getByRole("button", { name: /Rajasthan Desert/i }).click();
  await page.getByRole("button", { name: /Dusty crosswind/i }).click();

  // A selected installation is a compiled identity, not a decorative marker.
  // The governed shared select exposes the affiliation-scoped choices; the
  // option is intentionally absent while its transient listbox remains closed.
  const blueOriginPicker = page.getByRole("combobox", { name: /Blue origin/i });
  await expect(page.getByText(/bases available in this environment pack/i)).toBeVisible();
  await expect(page.getByText(/not a complete IAF or PAF catalogue/i)).toBeVisible();
  await blueOriginPicker.click();
  await expect(blueOriginPicker).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("option", { name: "Jodhpur AFS", exact: true }).click();
  const originState = page.locator(".origin-reference-state");
  await expect(originState).toContainText("Installation origin selected");
  await expect(originState).toContainText("iaf-jodhpur · source iaf-stations-wikipedia");
  // This fixture deliberately aborts the tile proxy. MapLibre markers only
  // exist after style load. Either prove the resolved marker or the truthful
  // loading state; never claim a marker exists while the surface is loading.
  const selectedAuthoringSymbol = page.locator(".authoring-entity-marker.selected svg[data-selected=\"true\"]");
  const authoringMapStatus = page.locator(".authoring-map-status");
  await expect.poll(async () => (
    await selectedAuthoringSymbol.count() === 1
    || /Loading placement surface|Basemap unavailable/.test(await authoringMapStatus.textContent() ?? "")
  )).toBe(true);
  if (await selectedAuthoringSymbol.count() === 1) {
    await expect(selectedAuthoringSymbol).toHaveAttribute("data-availability", "AVAILABLE");
  } else {
    await expect(authoringMapStatus).toContainText(/Loading placement surface|Basemap unavailable/);
  }
  const airborneStart = page.getByRole("group", { name: "Airborne start" });
  const longitude = airborneStart.getByRole("textbox", { name: "Longitude" });
  const latitude = airborneStart.getByRole("textbox", { name: "Latitude" });
  await expect(longitude).toHaveValue("73.048056");
  await expect(latitude).toHaveValue("26.251389");

  // A numeric horizontal edit must visibly change the authoring contract to a
  // manual airborne start before this real-Worker journey can run.
  const selectedLongitude = Number(await longitude.inputValue());
  await longitude.fill(String(selectedLongitude + 0.01));
  await longitude.press("Enter");
  await expect(page.getByText(/manual airborne start/i)).toBeVisible();
  await expect(page.getByText(/no installation identity will be compiled/i)).toBeVisible();

  // Rebind the exact installation, then author a real ground/runway start.
  // The same mission artifact drives validation, Worker spawn, and VSR output.
  if ((await blueOriginPicker.getAttribute("aria-expanded")) !== "true") {
    await blueOriginPicker.click();
  }
  await page.getByRole("option", { name: "Jodhpur AFS", exact: true }).click();
  const missionStart = page.getByRole("region", { name: "Mission start and recovery" });
  await missionStart.getByRole("combobox", { name: "Start posture" }).selectOption("RUNWAY");
  await expect(missionStart).toContainText("Sourced runway · runway:iaf-jodhpur:236786");
  await expect(missionStart).toContainText("iaf-jodhpur · source iaf-stations-wikipedia");
  await expect(missionStart).toContainText(/sourced · [0-9a-f]{16}/i);
  await expect(missionStart).toContainText("first frame remains on the threshold with zero speed");
  await expect(missionStart.getByRole("region", { name: "Mission flight plan constraints" })).toContainText("vector.flight-plan.v1");
  await missionStart.getByRole("button", { name: "Reverse takeoff direction" }).click();
  await expect(missionStart).toContainText("224.8° true");
  await missionStart.getByRole("button", { name: "Reverse takeoff direction" }).click();
  await expect(missionStart).toContainText("44.8° true");
  const transferEditor = missionStart.getByRole("region", { name: "Airborne store transfer" });
  await transferEditor.getByRole("button", { name: "Author store 1 transfer request" }).click();
  await transferEditor.getByRole("combobox", { name: "Store transfer operation" }).selectOption("JETTISON");
  await transferEditor.getByRole("textbox", { name: "Store transfer requested time" }).fill("20");
  await transferEditor.getByRole("textbox", { name: "Store installed drag area" }).fill("0.08");
  await expect(transferEditor).toContainText(/blue-weapon-1 · su-30mki-study-station/i);
  await expect(transferEditor).toContainText(/no named-aircraft\/store, safe-separation, landing, or recovery fidelity/i);

  // The mission editor is the authority. Its single route adapter updates the
  // legacy spatial projection atomically; the Worker later consumes the
  // compiled mission route, never an independently edited copy.
  const missionRouteLongitude = missionStart.getByRole("textbox", { name: "blue-route-2 longitude" });
  const editedMissionLongitude = Number(await missionRouteLongitude.inputValue()) + 0.005;
  await missionRouteLongitude.fill(String(editedMissionLongitude));
  await missionRouteLongitude.press("Enter");
  const routeEditor = page.getByRole("region", { name: /route coordinates/i }).first();
  const projectedRouteLongitude = routeEditor.locator("fieldset").first().getByLabel("Longitude", { exact: true });
  await expect.poll(async () => Number(await projectedRouteLongitude.inputValue())).toBeCloseTo(editedMissionLongitude, 6);
  const speed = page.getByRole("textbox", { name: /true airspeed/i });
  await speed.fill("-1");
  await expect(speed).toHaveValue("-1");
  await expect(speed).toHaveAttribute("aria-invalid", "true");
  if (!compact) await page.getByRole("button", { name: /Validate/i }).click();
  await expect(speed).toHaveValue("-1");
  await expect(page.getByText(/Correct the marked flight inputs/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Next: Admitted conditions/i })).toBeDisabled();

  await speed.fill("275");
  await speed.press("Enter");
  await expect(routeEditor.getByTestId("compiled-route-plan-preview")).toContainText("vector.route-plan.v2");
  const acceptanceRadius = routeEditor.getByRole("textbox", { name: /acceptance radius/i });
  await acceptanceRadius.fill("0");
  await expect(acceptanceRadius).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("button", { name: /Next: Admitted conditions/i })).toBeDisabled();
  await acceptanceRadius.fill("4000");
  await acceptanceRadius.press("Enter");
  await expect(acceptanceRadius).toHaveAttribute("aria-invalid", "false");
  const transition = routeEditor.getByRole("combobox", { name: /transition/i });
  await transition.selectOption("FLY_OVER");
  await transition.press("Tab");
  await expect(transition).toHaveValue("FLY_OVER");
  await expect(acceptanceRadius).toBeDisabled();
  if (compact) {
    await page.getByRole("button", { name: /Next: Admitted conditions/i }).click();
    await expect(
      page.getByText(
        /Sensor, (EW|electronic-warfare), and tactical-policy controls (are|remain) unavailable/i,
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /IAF radar/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Defensive turn/i })).toHaveCount(0);
    await page.getByRole("button", { name: /Next: Validate/i }).click();
  } else {
    await page.getByRole("button", { name: "4 Admitted conditions" }).click();
    await expect(
      page.getByText(
        /Sensor, (EW|electronic-warfare), and tactical-policy controls (are|remain) unavailable/i,
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /IAF radar/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Defensive turn/i })).toHaveCount(0);
    await page.getByRole("button", { name: "5 Validate" }).click();
  }
  await expect(page.getByText(/Authored positions and routes are inside/i)).toBeVisible();
  await expect(page.getByText(/Air mission, flight plan, start, loadout, and fuel are admitted/i)).toBeVisible();
  await expect(page.getByText(/combat air patrol · bvr · runway/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /run baseline/i })).toBeEnabled();
  await page.getByRole("button", { name: /run baseline/i }).click();

  await expect(
    page.locator('.catalog-state[data-runtime-state="completed"]'),
  ).toHaveText("Worker · completed", { timeout: CORRECTNESS_WORKER_COMPLETION_TIMEOUT_MS });
  if (compact) {
    await expect(page.locator(".session-layout")).toBeVisible();
  } else {
    await expect(page.getByText(/Run 01 · (Playing|Paused)/i)).toBeVisible();
  }
  await expect(page.getByRole("list", { name: "Recorded entities" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Recorded entities" }).locator("svg[data-availability=\"AVAILABLE\"]").first()).toBeVisible();
  await expect(page.getByText("Condition injection", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Track-information interruption", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /IAF RASP/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /PAF RASP/i })).toHaveCount(0);
  const trackInspector = page.locator(".track-state-inspector:visible");
  await trackInspector.scrollIntoViewIfNeeded();
  await expect(trackInspector).toBeVisible();
  await expect(trackInspector.getByRole("tab", { name: "IAF picture" })).toHaveAttribute("aria-selected", "true");
  await trackInspector.getByRole("tab", { name: "PAF picture" }).click();
  await expect(trackInspector.getByRole("tab", { name: "PAF picture" })).toHaveAttribute("aria-selected", "true");
  if (!compact) {
    await page.getByRole("button", { name: "Pause run", exact: true }).click();
    await expect(page.getByText("Run 01 · Paused", { exact: true })).toBeVisible();
  } else {
    await page.getByRole("button", { name: "Pause playback", exact: true }).click();
    await expect(page.getByRole("button", { name: "Play playback", exact: true })).toBeVisible();
  }
  const timeline = page.getByRole("slider", { name: "Run timeline" });
  for (const [modelTimeSeconds, operationalState] of [
    [0, "HOLD SHORT"],
    [0.05, "TAKEOFF ROLL"],
    [6.7, "ROTATE"],
    [8.4, "CLIMBOUT"],
    [14.5, "ENROUTE"],
  ] as const) {
    await timeline.evaluate((element, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(element, String(value));
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, modelTimeSeconds);
    await expect(page.locator(".current-geometry")).toContainText(operationalState);
    await expect(page.locator(".current-geometry")).toContainText("VALID");
    const phaseDisplayTime = await page.locator(".current-geometry").getAttribute("data-display-time");
    expect(phaseDisplayTime).not.toBeNull();
    await expect(page.locator(".engagement-map-shell")).toHaveAttribute("data-display-time", phaseDisplayTime!);
    await expect(page.locator(".playback [data-display-time]")).toHaveAttribute("data-display-time", phaseDisplayTime!);
    await expect(page.locator(".telemetry-title [data-display-time]")).toHaveAttribute("data-display-time", phaseDisplayTime!);
  }
  const recordedEntities = page.getByRole("list", { name: "Recorded entities" }).locator("li");
  const preTransferEntityIds = await recordedEntities.evaluateAll((items) =>
    items.map((item) => item.getAttribute("data-entity-id")),
  );
  expect(preTransferEntityIds).not.toContain("blue-weapon-1");
  await timeline.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("airborne-store-transfer-outcome")).toContainText(
    /JETTISON achieved · blue-weapon-1 .* AIRBORNE_TRANSFER_ADMITTED/,
  );
  const postTransferEntityIds = await recordedEntities.evaluateAll((items) =>
    items.map((item) => item.getAttribute("data-entity-id")),
  );
  expect(postTransferEntityIds).toHaveLength(preTransferEntityIds.length + 1);
  expect(postTransferEntityIds.filter((id) => id === "blue-weapon-1")).toHaveLength(1);
  const mapDisplayTime = await page.locator(".engagement-map-shell").getAttribute("data-display-time");
  expect(mapDisplayTime).not.toBeNull();
  await expect(page.locator(".playback [data-display-time]")).toHaveAttribute("data-display-time", mapDisplayTime!);
  await expect(page.locator(".telemetry-title [data-display-time]")).toHaveAttribute("data-display-time", mapDisplayTime!);
  await expect(page.locator(".current-geometry")).toHaveAttribute("data-display-time", mapDisplayTime!);
  const routeTransition = page.locator(".route-transition-inspector:visible").first();
  await expect(routeTransition).toHaveAttribute("data-display-time", mapDisplayTime!);
  await expect(routeTransition).toHaveAttribute("data-frame-index", await page.locator(".engagement-map-shell").getAttribute("data-display-frame-index") ?? "");
  await expect(routeTransition).toContainText(/Fly-over|Fly-by|Route complete|unavailable/i);
  await expect(page.locator(".current-geometry")).not.toContainText("Relative-position diagram");
  await expect(page.locator(".current-geometry")).toContainText("WEAPON TO TARGET");
  await expect(page.locator(".current-geometry")).toContainText("COAST");
  await expect(page.locator(".current-geometry")).toContainText("Weapon speed");
  await expect(page.locator(".telemetry.is-collapsed")).toBeVisible();
  const telemetryToggle = page.getByRole("button", { name: /expand telemetry/i });
  await expect(telemetryToggle).toHaveAttribute("aria-expanded", "false");
  await expect(telemetryToggle).toHaveAttribute("aria-controls", "synchronized-run-telemetry");
  await expect(page.locator(".telemetry-title [data-display-time]")).toHaveAttribute("data-display-time", mapDisplayTime!);
  await expect(page.locator(".map-context-disclosure summary")).toHaveText("Study area");
  const collapsed = await page.evaluate(() => ({
    sceneHeight: document.querySelector(".scene-wrap")?.getBoundingClientRect().height ?? 0,
    canvasHeight: document.querySelector(".engagement-map canvas")?.getBoundingClientRect().height ?? 0,
    camera: document.querySelector(".vector-map-telemetry")?.textContent,
    time: document.querySelector(".telemetry-title > div")?.textContent,
    attribution: document.querySelector(".maplibregl-ctrl-attrib")?.getBoundingClientRect().height ?? 0,
  }));
  if (compact) {
    await telemetryToggle.focus();
    await page.keyboard.press("Enter");
  } else {
    await telemetryToggle.click();
  }
  await expect(page.locator(".telemetry.is-expanded")).toBeVisible();
  await expect(page.getByRole("button", { name: /collapse telemetry/i })).toHaveAttribute("aria-expanded", "true");
  await page.waitForFunction(() => {
    const scene = document.querySelector(".scene-wrap")?.getBoundingClientRect();
    const canvas = document.querySelector(".engagement-map canvas")?.getBoundingClientRect();
    return Boolean(scene && canvas && Math.abs(scene.height - canvas.height) <= 2);
  });
  const expanded = await page.evaluate(() => ({
    sceneHeight: document.querySelector(".scene-wrap")?.getBoundingClientRect().height ?? 0,
    canvasHeight: document.querySelector(".engagement-map canvas")?.getBoundingClientRect().height ?? 0,
    camera: document.querySelector(".vector-map-telemetry")?.textContent,
    time: document.querySelector(".telemetry-title > div")?.textContent,
  }));
  expect(collapsed.sceneHeight).toBeGreaterThan(expanded.sceneHeight);
  expect(Math.abs(collapsed.canvasHeight - collapsed.sceneHeight)).toBeLessThanOrEqual(2);
  expect(Math.abs(expanded.canvasHeight - expanded.sceneHeight)).toBeLessThanOrEqual(2);
  if (!compact) {
    expect(expanded.camera).toBe(collapsed.camera);
    expect(expanded.time).toBe(collapsed.time);
  }
  expect(collapsed.attribution).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Map", exact: true }).click();
  const tacticalMarkers = page.locator(".engagement-map-shell .map-tactical-marker:not(.map-installation-marker)");
  const mapStatus = page.locator(".engagement-map-shell .map-status");
  await expect.poll(async () => (
    await tacticalMarkers.count() > 0
    || /Loading basemap|Basemap unavailable/.test(await mapStatus.textContent() ?? "")
  )).toBe(true);
  if (await tacticalMarkers.count() > 0) {
    const tacticalMarker = tacticalMarkers.first();
    await tacticalMarker.focus();
    await tacticalMarker.press("Enter");
    await expect(tacticalMarker).toHaveAttribute("data-selected", "true");
    await expect(tacticalMarker).toHaveAttribute("aria-pressed", "true");
    await expect(tacticalMarker).toHaveAttribute("data-label-visibility", "VISIBLE");
  } else {
    await expect(mapStatus).toContainText(/Loading basemap|Basemap unavailable/);
  }
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const threeScene = page.locator(".simulation-scene");
  await expect(threeScene).toHaveAttribute("data-display-time", mapDisplayTime!);
  await expect(threeScene).toHaveAttribute("data-declared-route-count", /[2-9]/);
  await expect(threeScene).toHaveAttribute("data-active-route-leg-count", /[1-9]/);
  await expect(threeScene).toHaveAttribute("data-label-policy", "TACTICAL_LABEL_POLICY_V1");
  await expect(threeScene).toHaveAttribute("data-authored-profile-applicability", "MODIFIED_FROM");
  await expect(threeScene).toHaveAttribute(
    "data-authored-profile-applicability-reason",
    "CAUSAL_INPUTS_MODIFIED",
  );
  const modifiedProfileNotice = page.locator(
    '.lab-notice > [data-authored-profile-applicability="MODIFIED_FROM"]',
  );
  await expect(modifiedProfileNotice).not.toHaveAttribute("data-authored-profile");
  await expect(modifiedProfileNotice).not.toContainText(
    /OFFSET|SUPPORT|RECOMMIT|BEAM|DRAG|EXTEND/,
  );
  await expect(threeScene).toHaveAttribute("data-visible-label-count", /[1-9]/);
  const blue3dLabel = page.locator('.simulation-entity-label[data-entity-id="blue-platform-1"]');
  const red3dLabel = page.locator('.simulation-entity-label[data-entity-id="red-object-1"]');
  await expect(blue3dLabel).toContainText(/Su-30MKI · [0-9]+ m/i);
  await expect(blue3dLabel).not.toContainText(/BLUE 1|authored intent/i);
  await expect(blue3dLabel).toHaveAttribute("data-affiliation", "BLUE");
  await expect(blue3dLabel).toHaveAttribute("data-authored-intent", "UNAVAILABLE");
  await expect(blue3dLabel).toHaveAttribute("aria-label", /blue fighter/i);
  await expect(red3dLabel).toContainText(/F-16C Block 52 · [0-9]+ m/i);
  await expect(red3dLabel).not.toContainText(/RED 1|authored intent/i);
  await expect(red3dLabel).toHaveAttribute("data-affiliation", "RED");
  await expect(red3dLabel).toHaveAttribute("data-authored-intent", "UNAVAILABLE");
  await expect(red3dLabel).toHaveAttribute("aria-label", /red fighter/i);
  const rendered3dLabels = threeScene.locator(".simulation-entity-label");
  const generatedCallsignLeaks = await rendered3dLabels.evaluateAll((labels) =>
    labels.filter((label) => /BLUE 1|RED 1|WEAPON [0-9]/i.test(label.textContent ?? "")).length,
  );
  expect(generatedCallsignLeaks).toBe(0);
  const visible3dLabels = threeScene.locator('.simulation-entity-label:not([hidden])');
  await expect(visible3dLabels.first()).toHaveAttribute("data-label-visibility", /VISIBLE|COMPACT/);
  await expect(visible3dLabels.first()).toHaveAttribute("data-collision-state", "CLEAR");
  await expect(visible3dLabels.first()).toHaveAttribute("data-edge-state", /CLEAR|CLAMPED/);
  await expect(
    page.getByRole("list", { name: "Recorded entities" }).locator('[data-entity-id="blue-weapon-1"]'),
  ).toHaveCount(1);
  await expect(page.locator(".current-geometry")).toHaveAttribute("data-display-time", mapDisplayTime!);
  await page.getByRole("button", { name: "Explain & report", exact: true }).click();
  await expect(page.getByTestId("results-airborne-store-transfer")).toContainText(
    /JETTISON achieved[\s\S]*blue-weapon-1[\s\S]*AIRBORNE_TRANSFER_ADMITTED/,
  );
  expect(runtimeErrors).toEqual([]);
});

test("a Worker-produced VSR downloads and reopens without rerunning physics", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const scenarioId = "a2a-defensive-break";
  const catalog = await catalogFixture(scenarioId);
  const runtimeErrors: string[] = [];
  const serverRunRequests: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/runs") {
      serverRunRequests.push(request.postData() ?? "");
    }
  });
  await page.route("**/api/catalog", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalog) }),
  );
  await page.route("**/api/map-tile?**", (route) => route.abort());
  await page.addInitScript(() => {
    const requestTypes: string[] = [];
    Object.defineProperty(window, "__vectorWorkerRequestTypes", {
      configurable: true,
      value: requestTypes,
    });
    const nativePostMessage = Worker.prototype.postMessage;
    Object.defineProperty(Worker.prototype, "postMessage", {
      configurable: true,
      writable: true,
      value(this: Worker, message: unknown, transferOrOptions?: Transferable[] | StructuredSerializeOptions) {
        if (message && typeof message === "object" && "type" in message) {
          requestTypes.push(String((message as { type: unknown }).type));
        }
        return Reflect.apply(
          nativePostMessage,
          this,
          transferOrOptions === undefined ? [message] : [message, transferOrOptions],
        );
      },
    });
  });

  await openGuidedWorkbench(page, scenarioId);
  const compact = (page.viewportSize()?.width ?? 1_366) <= 768;
  if (compact) {
    await page.getByRole("button", { name: /Next: Forces & loadouts/i }).click();
    await page.getByRole("button", { name: /Next: Place & flight/i }).click();
    await page.getByRole("button", { name: /Next: Admitted conditions/i }).click();
    await page.getByRole("button", { name: /Next: Validate/i }).click();
  } else {
    await page.getByRole("button", { name: "5 Validate" }).click();
  }
  await page.getByRole("button", { name: /run baseline/i }).click();
  await expect(page.locator('.catalog-state[data-runtime-state="completed"]')).toHaveText(
    "Worker · completed",
    { timeout: 45_000 },
  );

  const recordRegion = page.getByRole("region", { name: "VECTOR Simulation Record" });
  await expect(recordRegion).toHaveAttribute("data-record-source", "WORKER_RUN");
  await expect(recordRegion).toContainText("Worker-produced record");
  const recordId = await page.getByTestId("vsr-record-id").innerText();
  const contentDigest = await page.getByTestId("vsr-content-digest").innerText();
  expect(recordId).toMatch(/^[a-f0-9]{64}$/);
  expect(contentDigest).toMatch(/^[a-f0-9]{64}$/);
  const exactBackend = await page.locator(".session-layout").getAttribute("data-engine-backend");
  expect(exactBackend).toMatch(/^(typescript|rust-wasm)$/);

  const downloadPromise = page.waitForEvent("download");
  await recordRegion.getByRole("button", { name: "Download VSR", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    new RegExp(`^${scenarioId}-[a-f0-9]{12}\\.vector$`),
  );
  const exactRecordPath = testInfo.outputPath("worker-produced.vector");
  await download.saveAs(exactRecordPath);
  const exactRecordBytes = await readFile(exactRecordPath);
  expect(exactRecordBytes.byteLength).toBeGreaterThan(12);

  await page.reload();
  await expect(page.locator(".catalog-state.POSTGIS")).toHaveText("PostGIS catalog connected");
  await expect(recordRegion).toHaveAttribute("data-record-source", "NONE");
  await page.locator('input[aria-label="Open VSR file"]').setInputFiles(exactRecordPath);
  await expect(recordRegion).toHaveAttribute("data-record-source", "VERIFIED_IMPORT", {
    timeout: 30_000,
  });
  await expect(recordRegion).toContainText("Worker-verified import");
  await expect(page.locator('.catalog-state[data-runtime-state="completed"]')).toHaveText(
    "Worker · completed",
  );
  await expect(page.getByTestId("vsr-record-id")).toHaveText(recordId);
  await expect(page.getByTestId("vsr-content-digest")).toHaveText(contentDigest);
  await expect(page.locator(".session-layout")).toBeVisible();
  const importedProfileNotice = page.locator(
    '[data-authored-profile="wvr-one-circle-defensive-break"]',
  );
  await expect(importedProfileNotice).toHaveAttribute(
    "data-authored-profile-applicability",
    "MATCHED",
  );
  await expect(importedProfileNotice).toContainText(
    "Blue MERGE → ONE_CIRCLE → EXTEND · Red MERGE → DEFENSIVE_BREAK → EXTEND",
  );
  await expect(page.locator(".scenario-name strong")).toHaveText(
    "WVR one-circle defensive break: Su-30MKI versus PAF F-16C Block 52",
  );

  const workerRequestTypes = async () => page.evaluate(() =>
    [...((window as unknown as { __vectorWorkerRequestTypes?: string[] }).__vectorWorkerRequestTypes ?? [])]);
  await expect.poll(workerRequestTypes).toContain("open-record");
  expect(await workerRequestTypes()).not.toContain("run");

  await page.getByRole("button", { name: "Explain & report", exact: true }).click();
  const importedDebrief = page.locator(".debrief-workspace");
  await expect(importedDebrief).toHaveAttribute("data-report-source", "VERIFIED_IMPORT");
  await expect(importedDebrief).toHaveAttribute("data-record-id", recordId);
  await expect(importedDebrief).toHaveAttribute("data-content-digest", contentDigest);
  await expect(importedDebrief).toHaveAttribute("data-engine-backend", exactBackend!);
  await expect(importedDebrief).toHaveAttribute("data-canonical-frame-count", "117");
  await expect(importedDebrief.locator("h1")).toHaveText(
    "WVR one-circle defensive break: Su-30MKI versus PAF F-16C Block 52",
  );
  await expect(page.locator(".results-overview article").filter({ hasText: "Model outcome" })).toContainText(
    "Geometric intercept",
  );
  await expect(page.locator(".debrief-outcome .target-effect-summary")).toHaveAttribute(
    "data-effect-class",
    "KILL",
  );
  await expect(page.getByTestId("results-target-effect-event")).toHaveAttribute(
    "data-effect-frame-index",
    "116",
  );
  await expect(page.getByTestId("results-target-effect-event")).toHaveAttribute(
    "data-effect-time",
    "28.4",
  );
  const canonicalDebrief = page.getByRole("region", { name: "Canonical run debrief" });
  await expect(canonicalDebrief).toBeVisible();
  await expect(canonicalDebrief.getByTestId("report-authored-route-profile")).toHaveAttribute(
    "data-profile-applicability",
    "MATCHED",
  );
  await expect(canonicalDebrief.getByTestId("report-authored-route-profile")).toContainText(
    /MERGE[\s\S]*ONE_CIRCLE[\s\S]*EXTEND[\s\S]*DEFENSIVE_BREAK/,
  );
  await expect(canonicalDebrief.getByTestId("report-exact-causal-inputs")).toContainText(
    /Run duration[\s\S]*45 s[\s\S]*Guidance \/ regime[\s\S]*loft \/ WVR_BFM/,
  );
  await expect(canonicalDebrief.getByTestId("report-canonical-geometry")).toContainText(
    /Weapon world-entry \/ launch frame[\s\S]*Closest active-aircraft approach/,
  );
  await expect(canonicalDebrief.getByTestId("report-recorded-causal-facts")).toContainText(
    /Weapon entered world[\s\S]*Weapon termination[\s\S]*Primary-weapon recorded flight states[\s\S]*Recorded route-index changes/,
  );
  const importedSaveDownloadPromise = page.waitForEvent("download");
  await page.locator(".debrief-notes").getByRole(
    "button",
    { name: "Download exact VSR", exact: true },
  ).click();
  const importedSaveDownload = await importedSaveDownloadPromise;
  const importedSavePath = testInfo.outputPath("imported-report-source.vector");
  await importedSaveDownload.saveAs(importedSavePath);
  expect(await readFile(importedSavePath)).toEqual(exactRecordBytes);
  expect(serverRunRequests).toEqual([]);

  const corruptPath = testInfo.outputPath("corrupt-worker-produced.vector");
  const corruptRecordBytes = Buffer.from(exactRecordBytes);
  corruptRecordBytes[corruptRecordBytes.length - 1] ^= 0xff;
  await writeFile(corruptPath, corruptRecordBytes);
  await page.locator('input[aria-label="Open VSR file"]').setInputFiles(corruptPath);
  await expect(recordRegion.getByRole("alert")).toContainText("VSR verification failed");
  await expect(recordRegion).toHaveAttribute("data-record-source", "VERIFIED_IMPORT");
  await expect(page.getByTestId("vsr-record-id")).toHaveText(recordId);
  await expect(page.getByTestId("vsr-content-digest")).toHaveText(contentDigest);
  await expect(page.locator('.catalog-state[data-runtime-state="completed"]')).toHaveText(
    "Worker · completed",
  );
  await expect(page.locator(".debrief-outcome .target-effect-summary")).toHaveAttribute(
    "data-effect-class",
    "KILL",
  );

  const mismatchedPackagePath = resolve(
    "fixtures/vector-record/issue-197/a2a-crossing-intercept.vector",
  );
  await page.locator('input[aria-label="Open VSR file"]').setInputFiles(mismatchedPackagePath);
  await expect(recordRegion.getByRole("alert")).toContainText(
    "The verified VSR scenario package does not match this workbench package.",
    { timeout: 30_000 },
  );
  await expect(recordRegion).toHaveAttribute("data-record-source", "VERIFIED_IMPORT");
  await expect(page.getByTestId("vsr-record-id")).toHaveText(recordId);
  await expect(page.getByTestId("vsr-content-digest")).toHaveText(contentDigest);
  await expect(page.locator('.catalog-state[data-runtime-state="completed"]')).toHaveText(
    "Worker · completed",
  );
  await expect(page.locator(".debrief-workspace h1")).toHaveText(
    "WVR one-circle defensive break: Su-30MKI versus PAF F-16C Block 52",
  );
  await expect(page.locator(".debrief-outcome .target-effect-summary")).toHaveAttribute(
    "data-effect-class",
    "KILL",
  );
  expect(await workerRequestTypes()).not.toContain("run");
  expect(runtimeErrors).toEqual([]);
});
