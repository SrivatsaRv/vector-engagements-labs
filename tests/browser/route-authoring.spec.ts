import { expect, test } from "@playwright/test";
import { sha256Hex } from "../../lib/canonical-json";
import { ENGINE_VERSION } from "../../lib/engine/version";
import { INSTALLATION_CATALOGUE, INSTALLATION_CATALOGUE_IDENTITY, PUBLIC_INSTALLATIONS } from "../../lib/installations";
import { SCENARIO_PACKAGE_SCHEMA_VERSION } from "../../lib/scenario-package";
import { SCENARIO_LIBRARY } from "../../lib/scenarios";
import { STUDY_AREAS } from "../../lib/study-areas";
import { WEAPON_SIMULATION_MODELS } from "../../lib/simulation-models";
import { admitEnvironmentPack } from "../../lib/geospatial/environment-pack";

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
  await page.goto("/workbench?scenario=a2a-crossing-intercept&start=guided");
  await expect(page.locator(".catalog-state.POSTGIS")).toHaveText("PostGIS catalog connected");
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

  if (compact) {
    await expect(page.locator(".session-layout")).toBeVisible({ timeout: 30_000 });
  } else {
    await expect(page.getByText(/Run 01 · (Playing|Paused)/i)).toBeVisible({ timeout: 30_000 });
  }
  await expect(
    page.locator('.catalog-state[data-runtime-state="completed"]'),
  ).toHaveText("Worker · completed");
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
  await expect(page.locator(".simulation-scene")).toHaveAttribute("data-display-time", mapDisplayTime!);
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
