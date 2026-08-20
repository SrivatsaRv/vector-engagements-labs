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
