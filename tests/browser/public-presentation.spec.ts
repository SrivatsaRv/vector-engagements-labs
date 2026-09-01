import { expect, test, type Page } from "@playwright/test";

const extraViewports: Record<string, { width: number; height: number }[]> = {
  "phone-390": [{ width: 320, height: 568 }],
  "tablet-768": [{ width: 1024, height: 768 }],
  "full-hd": [{ width: 2560, height: 1440 }],
};

async function expectContained(page: Page, selectors: string[]) {
  const result = await page.evaluate((checkedSelectors) => {
    const visible = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    };
    const boxes = checkedSelectors.flatMap((selector) =>
      [...document.querySelectorAll<HTMLElement>(selector)]
        .filter(visible)
        .map((element) => {
          const box = element.getBoundingClientRect();
          return { selector, left: box.left, right: box.right, width: box.width };
        }),
    );
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      boxes,
    };
  }, selectors);
  expect(result.documentWidth).toBeLessThanOrEqual(result.viewportWidth + 1);
  for (const box of result.boxes) {
    expect(box.width, `${box.selector} has usable width`).toBeGreaterThan(0);
    expect(box.left, `${box.selector} stays on the left edge`).toBeGreaterThanOrEqual(-1);
    expect(box.right, `${box.selector} stays on the right edge`).toBeLessThanOrEqual(result.viewportWidth + 1);
  }
}

test("public release pages stay simple and contained across supported displays", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const original = page.viewportSize();
  const viewports = [original!, ...(extraViewports[testInfo.project.name] ?? [])];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);

    await page.goto("/scenarios", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: /review and run/i })).toHaveCount(3);
    await expect(page.getByText(/BVR mutual offset and defensive turn/i)).toBeVisible();
    await expect(page.getByText(/Air strike: hardened aircraft shelters/i)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Advanced tools" })).toHaveCount(0);
    await expectContained(page, [".product-header", ".library-page-intro", ".scenario-card"]);

    await page.goto("/about", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /realistic warfare simulation platform/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Why open source?" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What is coming next?" })).toBeVisible();
    await expectContained(page, [".product-header", ".about-hero", ".about-facts article", ".about-faq article"]);

    await page.goto("/math", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "How Vector calculates a run" })).toBeVisible();
    await expectContained(page, [".product-header", ".math-hero", ".math-warning"]);
  }

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('a[href="/about"]:visible').first()).toBeVisible();
  await expect(page.getByText("Open source by design", { exact: true })).toBeVisible();
  const favicon = page.locator('link[rel="icon"]').first();
  await expect(favicon).toHaveCount(1);
  const faviconHref = await favicon.getAttribute("href");
  expect(faviconHref).toBeTruthy();
  const response = await page.request.get(faviconHref!);
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain("#273746");
});
