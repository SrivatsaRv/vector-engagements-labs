import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";

const vectorUrl = process.env.VECTOR_URL ?? "http://127.0.0.1:4317";
const chromePath =
  process.env.VECTOR_CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outputDirectory = resolve("outputs/blog-editorial");
const articlePath =
  "/blogs/posts/what-engagement-simulators-need-to-model-in-2026";
const viewports = [
  { label: "desktop", width: 1440, height: 900, expectsFigureScroll: false },
  { label: "phone", width: 390, height: 844, expectsFigureScroll: true },
];

mkdirSync(outputDirectory, { recursive: true });
const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
});

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const runtimeErrors = [];

    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });

    await page.goto(`${vectorUrl}${articlePath}`, { waitUntil: "networkidle" });
    const editorialImages = page.locator(".blog-editorial-figure img");
    for (let index = 0; index < (await editorialImages.count()); index += 1) {
      await editorialImages.nth(index).scrollIntoViewIfNeeded();
    }
    await page.waitForFunction(() => {
      const images = [...document.querySelectorAll(".blog-editorial-figure img")];
      return (
        images.length === 2 &&
        images.every(
          (image) =>
            image.complete && image.naturalWidth === 1536 && image.naturalHeight === 1024,
        )
      );
    });
    await page.waitForFunction(
      () => document.querySelectorAll(".mermaid-container svg").length === 5,
    );

    const result = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
      figures: [...document.querySelectorAll(".blog-editorial-figure")].map(
        (figure) => {
          const scroller = figure.querySelector(".blog-editorial-viewport");
          const image = figure.querySelector("img");
          const fullResolutionLink = figure.querySelector("figcaption > a");
          return {
            title: figure.querySelector("figcaption strong")?.textContent?.trim(),
            clientWidth: scroller?.clientWidth ?? 0,
            scrollWidth: scroller?.scrollWidth ?? 0,
            imageWidth: image?.naturalWidth ?? 0,
            imageHeight: image?.naturalHeight ?? 0,
            fullResolutionPath: fullResolutionLink
              ? new URL(fullResolutionLink.href).pathname
              : null,
          };
        },
      ),
      mermaidCount: document.querySelectorAll(".mermaid-container svg").length,
    }));

    assert.equal(runtimeErrors.length, 0, `${viewport.label}: browser errors`);
    assert.ok(
      result.bodyWidth <= result.viewportWidth,
      `${viewport.label}: article page overflows horizontally`,
    );
    assert.equal(result.figures.length, 2, `${viewport.label}: editorial figures`);
    assert.deepEqual(
      result.figures.map((figure) => figure.title),
      ["Causal simulation loop", "One record, six synchronized views"],
    );
    assert.equal(result.mermaidCount, 5, `${viewport.label}: remaining Mermaid figures`);

    for (const figure of result.figures) {
      assert.equal(figure.imageWidth, 1536, `${viewport.label}: image width`);
      assert.equal(figure.imageHeight, 1024, `${viewport.label}: image height`);
      assert.match(figure.fullResolutionPath ?? "", /^\/blog\/diagrams\/.+\.webp$/);
      if (viewport.expectsFigureScroll) {
        assert.ok(
          figure.scrollWidth > figure.clientWidth,
          `${viewport.label}: diagram should scroll inside its figure`,
        );
      } else {
        assert.ok(
          figure.scrollWidth <= figure.clientWidth + 1,
          `${viewport.label}: diagram should fit its reading column`,
        );
      }
    }

    const figures = page.locator(".blog-editorial-figure");
    await figures.nth(0).screenshot({
      path: resolve(outputDirectory, `${viewport.label}-causal.png`),
    });
    await figures.nth(1).screenshot({
      path: resolve(outputDirectory, `${viewport.label}-record.png`),
    });

    console.log(
      `${viewport.label}: 2 editorial figures, 5 Mermaid figures, no page overflow`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
