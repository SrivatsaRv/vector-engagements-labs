import { expect, test } from "@playwright/test";
import { sha256Hex } from "../../lib/canonical-json";
import { ENGINE_VERSION } from "../../lib/engine/version";
import { PUBLIC_INSTALLATIONS } from "../../lib/installations";
import { SCENARIO_PACKAGE_SCHEMA_VERSION } from "../../lib/scenario-package";
import { SCENARIO_LIBRARY } from "../../lib/scenarios";
import { STUDY_AREAS } from "../../lib/study-areas";
import { WEAPON_SIMULATION_MODELS } from "../../lib/simulation-models";

async function catalogFixture() {
  const definition = SCENARIO_LIBRARY.find(
    (item) => item.id === "a2a-crossing-intercept",
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
    installations: PUBLIC_INSTALLATIONS.map((item) => ({
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

test("a current deployment manifest drives the real Worker run after route recovery", async ({ page }) => {
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

  await page.goto("/workbench?scenario=a2a-crossing-intercept&start=guided");
  await expect(page.locator(".catalog-state.POSTGIS")).toHaveText("PostGIS catalog connected");
  const compact = (page.viewportSize()?.width ?? 1_366) <= 768;
  if (compact) {
    await page.getByRole("button", { name: /Next: Forces & loadouts/i }).click();
    await page.getByRole("button", { name: /Next: Place & flight/i }).click();
  } else {
    await page.getByRole("button", { name: /Place & flight/i }).click();
  }

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
  await expect(page.getByRole("button", { name: /run baseline/i })).toBeEnabled();
  await page.getByRole("button", { name: /run baseline/i }).click();

  if (compact) {
    await expect(page.locator(".session-layout")).toBeVisible({ timeout: 30_000 });
  } else {
    await expect(page.getByText(/Run 01 · (Playing|Paused)/i)).toBeVisible({ timeout: 30_000 });
  }
  await expect(
    page.locator('.catalog-state[data-runtime-state="completed"]'),
  ).toHaveText("Worker · completed");
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
  }
  await expect(page.locator(".telemetry.is-collapsed")).toBeVisible();
  const telemetryToggle = page.getByRole("button", { name: /expand telemetry/i });
  await expect(telemetryToggle).toHaveAttribute("aria-expanded", "false");
  await expect(telemetryToggle).toHaveAttribute("aria-controls", "synchronized-run-telemetry");
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
  expect(runtimeErrors).toEqual([]);
});
