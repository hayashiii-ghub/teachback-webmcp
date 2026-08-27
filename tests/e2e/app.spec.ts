import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Reset demo" }).click();
});

test("prepares, approves, and keeps commit bound to the agent tool", async ({ page }) => {
  await page
    .getByRole("button", { name: "Prepare preview", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Proposed changes" })).toBeVisible();
  await expect(page.getByText("No changes have been applied.")).toBeVisible();

  await page.getByRole("button", { name: "Approve preview" }).click();
  await expect(page.getByRole("button", { name: "Approved — ready to commit" })).toBeDisabled();
});

test("refuses the unsafe case without changing it", async ({ page }) => {
  await page.getByRole("button", { name: /R-2052\s+Daniel Kim/ }).click();
  await page
    .getByRole("button", { name: "Prepare preview", exact: true })
    .click();

  await expect(page.getByRole("heading", { name: "Human review required" })).toBeVisible();
  await expect(page.getByText("Arrival is later than 22:00.")).toBeVisible();
  await expect(
    page.getByText("No changes were made.", { exact: true }),
  ).toBeVisible();
});

test("has no horizontal page overflow", async ({ page }) => {
  for (const width of [1120, 1159, 1160]) {
    await page.setViewportSize({ width, height: 900 });
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth, `overflow at ${width}px`).toBeLessThanOrEqual(
      dimensions.clientWidth,
    );
  }
});

test("recovers safely from malformed saved state", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem("teachback-demo-v1", JSON.stringify({ storageVersion: 1 }));
  });
  await page.reload();

  await expect(page.getByRole("heading", { name: "Emma Wilson" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset demo" })).toBeVisible();
  const savedStateIsValid = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("teachback-demo-v1") ?? "null");
    return Array.isArray(saved?.reservations) && saved.reservations.length === 3;
  });
  expect(savedStateIsValid).toBe(true);
});

test("stays usable when saved-state writes are unavailable", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage unavailable", "SecurityError");
    };
  });
  await page.reload();

  await expect(page.getByRole("heading", { name: "Emma Wilson" })).toBeVisible();
  await page
    .getByRole("button", { name: "Prepare preview", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Proposed changes" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("keeps keyboard focus inside the audit dialog and restores it", async ({
  page,
}) => {
  const auditTrigger = page.getByRole("button", { name: "View audit trail" });
  await auditTrigger.focus();
  await auditTrigger.click();

  const closeButton = page.getByRole("button", { name: "Close audit trail" });
  await expect(closeButton).toBeFocused();
  await expect(page.locator(".app-content")).toHaveAttribute("inert", "");
  await page.keyboard.press("Tab");
  await expect(closeButton).toBeFocused();
  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog", { name: "Audit trail" })).toHaveCount(0);
  await expect(auditTrigger).toBeFocused();
});
