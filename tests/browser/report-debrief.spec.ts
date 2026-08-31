import { expect, test } from "@playwright/test";

test("canonical report debrief remains exact, contained, and printable", async ({
  page,
}, testInfo) => {
  await page.goto("/report?sample=1");
  const debrief = page.getByRole("region", { name: "Canonical run debrief" });
  await expect(debrief).toBeVisible();
  const timelineEffect = page.getByTestId("report-target-effect-event");
  for (const attribute of [
    "data-effect-event-id",
    "data-effect-frame-index",
    "data-effect-time",
    "data-effect-class",
  ]) {
    await expect(debrief).toHaveAttribute(
      attribute,
      await timelineEffect.getAttribute(attribute) ?? "",
    );
  }
  await expect(page.getByTestId("report-authored-route-profile")).toHaveAttribute(
    "data-profile-applicability",
    "MATCHED",
  );
  await expect(page.getByTestId("report-exact-causal-inputs")).toHaveAttribute(
    "data-duration-authority",
    "SCENARIO_AUTHORED",
  );
  await expect(page.getByTestId("report-weapon-flight-state-timeline")).toContainText(
    /BOOST.*COAST.*TERMINAL_GUIDANCE.*INTERCEPT/i,
  );
  await expect(page.getByTestId("report-observer-track-availability")).toContainText(
    /IAF: sensor UNSUPPORTED · track UNSUPPORTED/i,
  );

  const originalViewport = page.viewportSize();
  const viewports = testInfo.project.name === "phone-390"
    ? [{ width: 320, height: 568 }, { width: 390, height: 844 }]
    : [originalViewport!];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const containment = await page.evaluate(() => {
      const explanation = document.querySelector<HTMLElement>(
        '[data-testid="report-canonical-effect-explanation"]',
      );
      const summary = document.querySelector<HTMLElement>(".report-causal-summary");
      const sections = [...document.querySelectorAll<HTMLElement>(".report-section")];
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        explanationContained: explanation
          ? explanation.scrollWidth <= explanation.clientWidth + 1
          : false,
        explanationWrap: explanation
          ? getComputedStyle(explanation).overflowWrap
          : "missing",
        summaryColumns: summary
          ? getComputedStyle(summary).gridTemplateColumns.split(" ").length
          : 0,
        sectionsContained: sections.every(
          (section) => section.getBoundingClientRect().right <= window.innerWidth + 1,
        ),
      };
    });
    expect(containment.documentWidth).toBeLessThanOrEqual(containment.viewportWidth);
    expect(containment.explanationContained).toBe(true);
    expect(containment.explanationWrap).toBe("anywhere");
    expect(containment.sectionsContained).toBe(true);
    if (viewport.width <= 760) expect(containment.summaryColumns).toBe(1);
  }

  await page.emulateMedia({ media: "print" });
  const printBreaks = await page.evaluate(() => ({
    debrief: getComputedStyle(
      document.querySelector<HTMLElement>('[aria-label="Canonical run debrief"]')!,
    ).breakInside,
    causalInputs: getComputedStyle(
      document.querySelector<HTMLElement>(".report-causal-inputs")!,
    ).breakInside,
    causalSides: [...document.querySelectorAll<HTMLElement>(".report-causal-side")]
      .map((side) => getComputedStyle(side).breakInside),
  }));
  expect(printBreaks.debrief).toBe("avoid");
  expect(printBreaks.causalInputs).toBe("avoid");
  expect(printBreaks.causalSides).toEqual(["avoid", "avoid"]);
});
