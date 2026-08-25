import { expect, test } from "@playwright/test";

test("a disabled domain link cannot fall through to the A2A workbench", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  await page.goto("/workbench?scenario=a2g-emitter-corridor");

  await expect(page.getByRole("status")).toContainText("A2G unavailable");
  await expect(page.getByText(/outside the active release scope/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /return to available scenarios/i })).toBeVisible();
  await expect(page.getByText(/Su-30MKI \/ Astra versus F-16C/i)).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});

test("Peace Drive I evidence is visibly context-only and fitted EW remains unknown", async ({ page }) => {
  // Stage 2D has no database. Exercise the deterministic static catalogue
  // fallback without leaving an in-flight Hyperdrive request behind when this
  // page closes; that failure can tear down the one built Wrangler process.
  await page.route("**/api/catalog", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "service_unavailable" }),
  }));
  await page.goto("/workbench?scenario=a2a-crossing-intercept");
  await expect(page.locator(".catalog-state.error")).toHaveText("Catalog unavailable");
  const forcesStep = page.getByRole("button", { name: /Forces & loadouts/i });
  if (await forcesStep.isVisible()) await forcesStep.click();
  else await page.getByRole("button", { name: "Edit forces" }).click();

  const evidencePanels = page.locator("details.platform-systems");
  await expect(evidencePanels).toHaveCount(2);
  const redEvidence = evidencePanels.nth(1);
  await expect(redEvidence.locator("summary")).toContainText("PARTIAL");
  await redEvidence.locator("summary").click();

  await expect(redEvidence).toContainText("12 delivered single-seat aircraft");
  await expect(redEvidence.getByTestId("platform-system-radar")).toContainText("Not established");
  await expect(redEvidence).toContainText("AN/APG-68(V)9 requested-programme association only");
  await expect(redEvidence).toContainText("Link 16 requested-programme association only");
  await expect(redEvidence).toContainText("CONTEXT ONLY");
  await expect(redEvidence.getByTestId("platform-system-defensive-ew")).toContainText("Not established");
  await expect(redEvidence.getByTestId("platform-default-loadout")).toContainText("2 × AIM-120C-5");
  await expect(redEvidence.getByTestId("platform-default-loadout")).toContainText("MODEL_ASSUMPTION");
  await expect(redEvidence).toContainText("Named-aircraft performance remains unsupported");
  await expect(redEvidence).not.toContainText("ALQ-211");

  const redTeam = page.locator("article.red-team");
  await redTeam.getByRole("combobox", { name: /Aircraft variant.*F-16C Block 52/i }).click();
  const aircraftOptions = page.getByRole("listbox", { name: "Aircraft variant" });
  await expect(aircraftOptions.getByRole("option", { name: /F-16C Block 52/i })).toHaveCount(1);
  await expect(aircraftOptions.getByRole("option", { name: /F-16D Block 52/i })).toHaveCount(0);
});
