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
  { label: "phone", width: 390, height: 844, family: "phone" },
  { label: "large-phone", width: 430, height: 932, family: "phone" },
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
  for (const viewport of breakpoints) {
    const context = await browser.newContext({ viewport });
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
        navigationVisible: Boolean(document.querySelector(".scenario-authoring-map .maplibregl-ctrl-top-right")),
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
    assert.equal(construct.navigationVisible, true, `${viewport.width}: map navigation missing`);
    assert.ok(successfulTiles > 0, `${viewport.width}: basemap returned no successful tiles`);
    assert.ok(construct.primaryActionHeight >= 38, `${viewport.width}: primary action is undersized`);
    if (viewport.family === "phone") {
      assert.equal(construct.stepsVisible, false, `${viewport.width}: desktop step rail is visible on phone`);
      assert.equal(construct.summaryVisible, false, `${viewport.width}: desktop summary rail is visible on phone`);
      assert.ok(construct.titleSize >= 27, `${viewport.width}: phone title is too small`);
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
