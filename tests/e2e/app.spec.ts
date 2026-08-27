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

test("switches to Japanese without changing the prepared run", async ({ page }) => {
  await page
    .getByRole("button", { name: "Switch to Japanese" })
    .click();

  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(page).toHaveTitle("Teachback — 現場の判断を安全に引き継ぐ");
  await expect(page.getByRole("heading", { name: "予約一覧" })).toBeVisible();
  await expect(page.getByText("Built in Japan", { exact: true }))
    .toBeVisible();
  await expect(page.getByText("Built in Japan", { exact: true }))
    .toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "変更案を作る", exact: true }).click();
  await expect(page.getByRole("heading", { name: "変更案" })).toBeVisible();
  await expect(page.getByText("遅い到着向けのお食事")).toBeVisible();

  const exactGuestMessage = page.getByText(
    "We have noted your late arrival. Your meal box will be ready at reception.",
    { exact: true },
  );
  await expect(exactGuestMessage).toHaveAttribute("lang", "en");
  const digestBeforeSwitch = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("teachback-demo-v1") ?? "null");
    return saved?.activeRun?.digest;
  });

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(page.getByRole("heading", { name: "変更案" })).toBeVisible();
  await page.getByRole("button", { name: "英語に切り替える" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Proposed changes" })).toBeVisible();

  const digestAfterSwitch = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("teachback-demo-v1") ?? "null");
    return saved?.activeRun?.digest;
  });
  expect(digestAfterSwitch).toBe(digestBeforeSwitch);
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

test("Japanese UI has no horizontal page overflow", async ({ page }) => {
  await page.getByRole("button", { name: "Switch to Japanese" }).click();
  for (const width of [390, 1120, 1159, 1160, 1440]) {
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

test("falls back safely from an invalid saved locale", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem("teachback-ui-locale-v1", "unsupported");
  });
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Cases" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Switch to Japanese" }),
  ).toBeVisible();
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
