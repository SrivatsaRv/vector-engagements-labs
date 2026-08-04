import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";

const vectorUrl = process.env.VECTOR_URL ?? "http://127.0.0.1:4317";
const chromePath =
  process.env.VECTOR_CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outputDirectory = resolve("outputs/responsive");
const breakpoints = [
  { label: "compact-phone", width: 320, height: 568, family: "phone" },
  { label: "phone", width: 390, height: 844, family: "phone" },
  { label: "large-phone", width: 430, height: 932, family: "phone" },
  { label: "tablet-portrait", width: 768, height: 1024, family: "tablet" },
  { label: "tablet-landscape", width: 1024, height: 768, family: "tablet" },
  { label: "compact-laptop", width: 1280, height: 720, family: "desktop" },
  { label: "laptop", width: 1366, height: 768, family: "desktop" },
  { label: "workstation", width: 1440, height: 900, family: "desktop" },
  { label: "large-laptop", width: 1536, height: 864, family: "desktop" },
  { label: "full-hd", width: 1920, height: 1080, family: "desktop" },
  { label: "qhd-27-inch", width: 2560, height: 1440, family: "large" },
  { label: "4k-tv", width: 3840, height: 2160, family: "large" },
];

async function openConstructStep(page, step, viewport) {
  if (viewport.family !== "phone") {
    const labels = [
      "1 Define",
      "2 Forces & loadouts",
      "3 Place & flight",
      "4 Sensors & decisions",
      "5 Validate",
    ];
    await page.getByRole("button", { name: labels[step], exact: true }).click();
    return;
  }
  for (let current = 0; current < step; current += 1) {
    await page.locator(".builder-actions > div button").last().click();
  }
}

mkdirSync(outputDirectory, { recursive: true });
const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-webgl"],
});

try {
  for (const [viewportIndex, viewport] of breakpoints.entries()) {
    const context = await browser.newContext({
      viewport,
      extraHTTPHeaders: {
        "cf-connecting-ip": `198.18.0.${viewportIndex + 1}`,
      },
    });
    const page = await context.newPage();
    const runtimeErrors = [];
    let successfulTiles = 0;
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.url().includes("/api/map-tile") && response.ok()) {
        successfulTiles += 1;
      }
    });

    await page.goto(vectorUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(document.querySelector(".landing-sim canvas")));
    const landing = await page.evaluate(() => {
      const rectangle = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      const header = rectangle(".product-header");
      const overline = rectangle(".hero .overline");
      return {
        bodyWidth: document.body.scrollWidth,
        header,
        overline,
        title: rectangle(".hero h1"),
        titleSize: Number.parseFloat(getComputedStyle(document.querySelector(".hero h1")).fontSize),
        actions: rectangle(".hero-actions"),
        preview: rectangle(".landing-sim"),
        previewCanvas: rectangle(".landing-sim canvas"),
      };
    });
    assert.ok(landing.bodyWidth <= viewport.width, `${viewport.width}: landing page overflows horizontally`);
    assert.ok(landing.preview?.width <= viewport.width, `${viewport.width}: landing preview exceeds viewport`);
    assert.ok(landing.previewCanvas?.width > 0 && landing.previewCanvas?.height > 0, `${viewport.width}: landing 3D preview collapsed`);
    if (viewport.family === "phone") {
      assert.ok((landing.overline?.top ?? 999) - (landing.header?.bottom ?? 0) <= 48, `${viewport.width}: mobile hero begins too far below navigation`);
      assert.ok(landing.titleSize >= 36 && landing.titleSize <= 48, `${viewport.width}: mobile title scale is outside its contract`);
      assert.ok((landing.actions?.right ?? 999) <= viewport.width, `${viewport.width}: landing actions exceed viewport`);
      assert.ok((landing.preview?.height ?? 0) >= 360, `${viewport.width}: mobile model preview is too small`);
    }

    await page.goto(
      `${vectorUrl}/workbench?scenario=a2a-crossing-intercept&start=guided`,
      { waitUntil: "networkidle" },
    );
    await page.waitForFunction(() => Boolean(document.querySelector(".catalog-state.POSTGIS")));
    await openConstructStep(page, 2, viewport);
    await page.waitForFunction(() => {
      const map = document.querySelector(".scenario-authoring-map");
      return Boolean(
        map &&
          map.getBoundingClientRect().height >= 300 &&
          map.querySelector("canvas") &&
          document.querySelectorAll(".authoring-entity-marker").length === 2,
      );
    });
    await page.waitForTimeout(250);

    const construct = await page.evaluate(() => {
      const rectangle = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      return {
        viewport: { width: innerWidth, height: innerHeight },
        bodyWidth: document.body.scrollWidth,
        map: rectangle(".scenario-authoring-map"),
        mapCanvas: rectangle(".scenario-authoring-map canvas"),
        scrollSurface: rectangle(".builder-scroll"),
        footer: rectangle(".builder-actions"),
        content: rectangle(".scenario-authoring-surface"),
        titleSize: Number.parseFloat(
          getComputedStyle(document.querySelector(".builder h1")).fontSize,
        ),
        primaryActionHeight:
          document
            .querySelector(".builder-actions > div button:last-child")
            ?.getBoundingClientRect().height ?? 0,
        markers: document.querySelectorAll(".authoring-entity-marker").length,
        installationMarkers: document.querySelectorAll(".authoring-installation-marker").length,
        originPickers: document.querySelectorAll(".origin-pickers details").length,
        mapControlCount: document.querySelectorAll(".scenario-authoring-map-shell .vector-map-toolbar button").length,
        cameraTelemetry: document.querySelectorAll(".scenario-authoring-map-shell .vector-map-telemetry span").length,
        stepsVisible: getComputedStyle(document.querySelector(".build-steps")).display !== "none",
        summaryVisible: getComputedStyle(document.querySelector(".builder-summary")).display !== "none",
      };
    });

    assert.ok(construct.bodyWidth <= viewport.width, `${viewport.width}: horizontal page overflow`);
    const minimumMapHeight = viewport.family === "large" ? 500 : 300;
    assert.ok(construct.map?.height >= minimumMapHeight, `${viewport.width}: map container collapsed`);
    assert.ok(construct.mapCanvas?.height >= minimumMapHeight, `${viewport.width}: MapLibre canvas collapsed`);
    assert.equal(construct.markers, 2, `${viewport.width}: expected two start entities`);
    assert.ok(construct.installationMarkers >= 1, `${viewport.width}: no selectable bases rendered`);
    assert.equal(construct.originPickers, 2, `${viewport.width}: team origin controls missing`);
    assert.equal(construct.mapControlCount, 6, `${viewport.width}: VECTOR map controls missing`);
    assert.equal(construct.cameraTelemetry, 4, `${viewport.width}: map telemetry missing`);
    assert.ok(successfulTiles > 0, `${viewport.width}: basemap returned no successful tiles`);
    if (viewport.label === "phone") {
      await page.getByRole("button", { name: "Basemap", exact: true }).click();
      await page.getByRole("button", { name: /^Tactical/ }).click();
      await page.waitForFunction(() => localStorage.getItem("vector.map.basemap.v1") === "TACTICAL");
      await page.getByRole("button", { name: "Basemap", exact: true }).click();
      await page.getByRole("button", { name: /^Minimal/ }).click();
    }
    assert.ok(construct.primaryActionHeight >= 38, `${viewport.width}: primary action is undersized`);
    if (viewport.family === "phone") {
      assert.equal(construct.stepsVisible, false, `${viewport.width}: desktop step rail is visible on phone`);
      assert.equal(construct.summaryVisible, false, `${viewport.width}: desktop summary rail is visible on phone`);
      assert.ok(construct.titleSize >= 27, `${viewport.width}: phone title is too small`);
    } else if (viewport.family === "tablet") {
      assert.equal(construct.stepsVisible, true, `${viewport.width}: tablet lost construct navigation`);
    } else {
      assert.equal(construct.stepsVisible, true, `${viewport.width}: desktop step rail disappeared`);
      assert.equal(construct.summaryVisible, true, `${viewport.width}: desktop summary rail disappeared`);
    }
    if (viewport.width === 2560) {
      assert.ok(construct.content?.width >= 1550, "QHD task surface does not use the display");
      assert.ok(construct.titleSize >= 40, "QHD typography did not scale");
    }
    if (viewport.width === 3840) {
      assert.ok(construct.content?.width >= 2350, "4K task surface does not use the display");
      assert.ok(construct.titleSize >= 48, "4K typography did not scale");
    }
    assert.ok(
      construct.scrollSurface && construct.footer && construct.scrollSurface.bottom <= construct.footer.top + 1,
      `${viewport.width}: footer overlaps the authoring surface`,
    );
    await page.screenshot({
      path: resolve(outputDirectory, `construct-${viewport.width}x${viewport.height}.png`),
      fullPage: false,
    });

    const blueOriginPicker = page.locator(".origin-pickers details.blue");
    const blueOriginOptions = blueOriginPicker.locator("button");
    if ((await blueOriginOptions.count()) > 0) {
      await blueOriginPicker.locator("summary").click();
      const selectedOrigin = (await blueOriginOptions.first().textContent())?.trim();
      await blueOriginOptions.first().click();
      await page
        .getByText(`${selectedOrigin} selected as the Blue origin.`, { exact: true })
        .waitFor();
    }

    // Restore the calibrated package before validating and running it. Origin
    // selection is an authoring mutation and must not leak into later checks.
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(document.querySelector(".catalog-state.POSTGIS")));

    await openConstructStep(page, 3, viewport);
    const conditions = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".event-choice button")];
      const blue = document.querySelector(".rasp-effect-grid article.blue");
      const red = document.querySelector(".rasp-effect-grid article.red");
      return {
        cardHeights: cards.map((card) => card.getBoundingClientRect().height),
        blueBorder: blue ? getComputedStyle(blue).borderTopColor : "",
        redBorder: red ? getComputedStyle(red).borderTopColor : "",
        bodyWidth: document.body.scrollWidth,
      };
    });
    assert.equal(conditions.cardHeights.length, 3);
    assert.ok(conditions.cardHeights.every((height) => height >= 100));
    assert.notEqual(conditions.blueBorder, conditions.redBorder, "RASP ownership colors must differ");
    assert.ok(conditions.bodyWidth <= viewport.width, `${viewport.width}: Conditions overflows horizontally`);

    if (viewport.family === "phone") {
      await page.locator(".builder-actions > div button").last().click();
    } else {
      await page.getByRole("button", { name: "5 Validate", exact: true }).click();
    }
    const runButton = page.getByRole("button", { name: "Run baseline", exact: true });
    await runButton.waitFor();
    assert.equal(await runButton.isEnabled(), true, `${viewport.width}: calibrated template is not runnable`);
    await runButton.click();
    await page.locator('.session-layout[data-engine-backend="rust-wasm"]').waitFor();
    await page.waitForFunction(() => {
      const map = document.querySelector(".engagement-map");
      return Boolean(
        map &&
          map.getBoundingClientRect().height >= 300 &&
          map.querySelector("canvas") &&
          document.querySelectorAll(
            ".map-tactical-marker:not(.map-installation-marker)",
          ).length >= 2,
      );
    });
    const observe = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      mapHeight: document.querySelector(".engagement-map")?.getBoundingClientRect().height ?? 0,
      canvasHeight: document.querySelector(".engagement-map canvas")?.getBoundingClientRect().height ?? 0,
      telemetryPanels: document.querySelectorAll(".telemetry-panel").length,
      telemetryColumns: getComputedStyle(
        document.querySelector(".telemetry-multiples"),
      ).gridTemplateColumns.split(" ").length,
      sessionScrollable:
        (document.querySelector(".simulation-column")?.scrollHeight ?? 0) >
        (document.querySelector(".simulation-column")?.clientHeight ?? 0),
      entities: document.querySelectorAll(".map-tactical-marker:not(.map-installation-marker)").length,
      backend: document.querySelector(".session-layout")?.getAttribute("data-engine-backend"),
    }));
    assert.ok(observe.bodyWidth <= viewport.width, `${viewport.width}: Observe overflows horizontally`);
    assert.ok(observe.mapHeight >= 300 && observe.canvasHeight >= 300, `${viewport.width}: Observe map collapsed`);
    assert.equal(observe.telemetryPanels, 6, `${viewport.width}: telemetry panel count changed`);
    if (viewport.family === "phone") {
      assert.equal(observe.telemetryColumns, 1, `${viewport.width}: phone telemetry is not stacked`);
      assert.equal(observe.sessionScrollable, true, `${viewport.width}: phone replay cannot reach telemetry`);
    }
    assert.ok(observe.entities >= 2, `${viewport.width}: engine entities not rendered`);
    assert.equal(observe.backend, "rust-wasm", `${viewport.width}: selected browser backend did not run`);
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await page.waitForFunction(() => Boolean(document.querySelector(".three-d-surface .simulation-scene canvas")));
    await page.waitForTimeout(100);
    const threeDimensional = await page.evaluate(() => {
      const rectangle = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      const simulation = document.querySelector(".simulation-column");
      return {
        bodyWidth: document.body.scrollWidth,
        scrollWidth: simulation?.scrollWidth ?? 0,
        clientWidth: simulation?.clientWidth ?? 0,
        scene: rectangle(".three-d-surface"),
        canvas: rectangle(".three-d-surface canvas"),
        legend: rectangle(".three-d-surface .symbol-key"),
        topline: rectangle(".sim-topline"),
        metrics: rectangle(".live-metrics"),
        playback: rectangle(".playback"),
        firstTelemetryPanel: rectangle(".telemetry-panel"),
      };
    });
    assert.ok(threeDimensional.bodyWidth <= viewport.width, `${viewport.width}: 3D replay overflows page`);
    assert.ok(threeDimensional.scrollWidth <= threeDimensional.clientWidth + 1, `${viewport.width}: 3D replay has internal horizontal overflow`);
    assert.ok((threeDimensional.scene?.height ?? 0) >= 300, `${viewport.width}: 3D scene collapsed`);
    assert.ok((threeDimensional.metrics?.bottom ?? 0) <= (threeDimensional.topline?.bottom ?? -1) + 1, `${viewport.width}: live metrics overflow their control row`);
    assert.ok((threeDimensional.topline?.bottom ?? 99999) <= (threeDimensional.scene?.top ?? 0) + 1, `${viewport.width}: control row overlaps the 3D scene`);
    assert.ok(Math.abs((threeDimensional.canvas?.width ?? 0) - (threeDimensional.scene?.width ?? 0)) <= 2, `${viewport.width}: 3D canvas width does not follow its container`);
    assert.ok(Math.abs((threeDimensional.canvas?.height ?? 0) - (threeDimensional.scene?.height ?? 0)) <= 2, `${viewport.width}: 3D canvas height does not follow its container`);
    assert.ok((threeDimensional.legend?.left ?? -1) >= 0 && (threeDimensional.legend?.right ?? 99999) <= viewport.width, `${viewport.width}: entity legend leaves the viewport`);
    assert.ok((threeDimensional.playback?.right ?? 99999) <= viewport.width, `${viewport.width}: playback controls leave the viewport`);
    assert.ok((threeDimensional.firstTelemetryPanel?.right ?? 99999) <= viewport.width, `${viewport.width}: telemetry leaves the viewport`);
    assert.deepEqual(runtimeErrors, [], `${viewport.width}: browser runtime errors: ${runtimeErrors.join(" | ")}`);
    if ([390, 2560, 3840].includes(viewport.width)) {
      await page.screenshot({
        path: resolve(outputDirectory, `observe-${viewport.width}x${viewport.height}.png`),
        fullPage: false,
      });
    }
    await context.close();
  }
  process.stdout.write(
    `${JSON.stringify({ state: "verified", breakpoints, outputDirectory })}\n`,
  );
} finally {
  await browser.close();
}
