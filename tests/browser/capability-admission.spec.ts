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

test("the A2A builder does not present disabled information or fixed-turn behavior as active", async ({ page }) => {
  await page.goto("/workbench?scenario=a2a-crossing-intercept&start=guided");

  await page.locator(".catalog-state.POSTGIS").waitFor({ state: "attached" });
  await page.getByRole("button", { name: "4 Admitted conditions", exact: true }).click();
  await expect(
    page.getByRole("status").filter({
      hasText: "Information and tactical-policy controls are unavailable",
    }),
  ).toBeVisible();
  await expect(page.getByText(/four-g defensive break/i)).toHaveCount(0);
  await expect(page.getByText(/radars and data links start available/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /defensive turn/i })).toHaveCount(0);
});
