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
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

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
    await page.getByText("PostGIS catalog connected", { exact: true }).waitFor();
    await page.getByRole("button", { name: "3 Place & flight", exact: true }).click();
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
        markers: document.querySelectorAll(".authoring-entity-marker").length,
        installationMarkers: document.querySelectorAll(".authoring-installation-marker").length,
        originPickers: document.querySelectorAll(".origin-pickers details").length,
        navigationVisible: Boolean(document.querySelector(".scenario-authoring-map .maplibregl-ctrl-top-right")),
      };
    });

    assert.ok(construct.bodyWidth <= viewport.width, `${viewport.width}: horizontal page overflow`);
    assert.ok(construct.map?.height >= 300, `${viewport.width}: map container collapsed`);
    assert.ok(construct.mapCanvas?.height >= 300, `${viewport.width}: MapLibre canvas collapsed`);
    assert.equal(construct.markers, 2, `${viewport.width}: expected two start entities`);
    assert.ok(construct.installationMarkers >= 1, `${viewport.width}: no selectable bases rendered`);
    assert.equal(construct.originPickers, 2, `${viewport.width}: team origin controls missing`);
    assert.equal(construct.navigationVisible, true, `${viewport.width}: map navigation missing`);
    assert.ok(successfulTiles > 0, `${viewport.width}: basemap returned no successful tiles`);
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
    await page.getByText("PostGIS catalog connected", { exact: true }).waitFor();

    await page.getByRole("button", { name: "4 Sensors & decisions", exact: true }).click();
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

    await page.getByRole("button", { name: "5 Validate", exact: true }).click();
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
      entities: document.querySelectorAll(".map-tactical-marker:not(.map-installation-marker)").length,
      backend: document.querySelector(".session-layout")?.getAttribute("data-engine-backend"),
    }));
    assert.ok(observe.bodyWidth <= viewport.width, `${viewport.width}: Observe overflows horizontally`);
    assert.ok(observe.mapHeight >= 300 && observe.canvasHeight >= 300, `${viewport.width}: Observe map collapsed`);
    assert.equal(observe.telemetryPanels, 6, `${viewport.width}: telemetry panel count changed`);
    assert.ok(observe.entities >= 2, `${viewport.width}: engine entities not rendered`);
    assert.equal(observe.backend, "rust-wasm", `${viewport.width}: selected browser backend did not run`);
    assert.deepEqual(runtimeErrors, [], `${viewport.width}: browser runtime errors: ${runtimeErrors.join(" | ")}`);
    await context.close();
  }
  process.stdout.write(
    `${JSON.stringify({ state: "verified", breakpoints, outputDirectory })}\n`,
  );
} finally {
  await browser.close();
}
