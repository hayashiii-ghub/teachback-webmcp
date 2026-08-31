import { expect, test, type Page } from "@playwright/test";
import { UI_COPY } from "../../src/i18n";
import { approveForAgent } from "./approval";
import { resetDemo } from "./reset";

async function savedState(page: Page) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem("teachback-demo-v1"))).not.toBeNull();
  return page.evaluate(() => JSON.parse(localStorage.getItem("teachback-demo-v1")!));
}

for (const locale of ["en", "ja"] as const) {
  test(`completes ${locale} approval in the page without agent tools`, async ({ page }, testInfo) => {
    const copy = UI_COPY[locale];
    await page.goto("/");
    if (locale === "ja") await page.getByRole("button", { name: "日本語", exact: true }).click();
    const before = await savedState(page);
    await page.getByRole("button", { name: copy.preparePreview, exact: true }).click();
    await expect(page.getByRole("heading", { name: copy.proposedChanges, exact: true })).toBeVisible();
    const criteria = page.locator(".checked-criteria");
    await expect(criteria).not.toHaveAttribute("open");
    await criteria.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(criteria.locator("li")).toHaveCount(7);
    await expect(criteria.locator("li").last()).toBeVisible();
    await page.keyboard.press("Enter");
    const apply = page.getByRole("button", { name: copy.approveAndApply, exact: true });
    await expect(apply).toBeEnabled();
    if (testInfo.project.name === "desktop") {
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(apply).toBeInViewport();
      await expect(page.getByRole("heading", { name: copy.proposedChanges, exact: true })).toBeInViewport();
    }
    expect((await savedState(page)).reservations).toEqual(before.reservations);
    await page.screenshot({ path: testInfo.outputPath("manual-prepared.png"), fullPage: true });
    await apply.focus();
    await page.keyboard.press("Enter");
    const completed = page.locator(".completion-status");
    await expect(completed).toContainText(copy.committed);
    await expect(completed).toBeFocused();
    await expect(page.getByRole("heading", { name: copy.appliedChanges, exact: true })).toBeVisible();
    await expect(page.locator('.case-item[aria-current="true"]')).toContainText(copy.caseHandled);
    const after = await savedState(page);
    expect(after.reservations.find((r: any) => r.id === "R-2048")).toMatchObject({ version: 2, estimatedArrivalTime: "20:45" });
    expect(after.reservations.filter((r: any) => r.id !== "R-2048"))
      .toEqual(before.reservations.filter((r: any) => r.id !== "R-2048"));
    expect(after.audit.slice(-2).map((e: any) => e.actor)).toEqual(["Human", "Human"]);
    await expect(apply).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("manual-completed.png"), fullPage: true });
    await page.reload();
    await expect(completed).toContainText(copy.committed);
    expect((await savedState(page)).reservations).toEqual(after.reservations);
  });

  test(`can apply a restored ${locale} approval without renewing it`, async ({ page }) => {
    const copy = UI_COPY[locale];
    await page.goto("/");
    if (locale === "ja") await page.getByRole("button", { name: "日本語", exact: true }).click();
    await page.getByRole("button", { name: copy.preparePreview, exact: true }).click();
    await approveForAgent(page, locale);
    const before = await savedState(page);
    await page.reload();
    await page.getByRole("button", { name: copy.applyApproved, exact: true }).click();
    await expect(page.locator(".completion-status")).toContainText(copy.committed);
    const after = await savedState(page);
    expect(after.runsByReservationId["R-2048"].approvalExpiresAt).toBe(before.runsByReservationId["R-2048"].approvalExpiresAt);
    expect(after.audit).toHaveLength(before.audit.length + 1);
    expect(after.audit.at(-1).actor).toBe("Human");
  });
}

for (const action of ["switch", "reset"] as const) {
  test(`does not overwrite a ${action} while application is pending`, async ({ page }) => {
    await page.addInitScript(() => {
      const original = crypto.subtle.digest.bind(crypto.subtle);
      crypto.subtle.digest = async (algorithm, data) => {
        const w = window as any;
        if (w.pauseDigest) await new Promise<void>(resolve => (w.releaseDigests ??= []).push(resolve));
        return original(algorithm, data);
      };
    });
    await page.goto("/");
    await page.getByRole("button", { name: UI_COPY.en.preparePreview, exact: true }).click();
    const before = await savedState(page);
    await page.evaluate(() => { (window as any).pauseDigest = true; });
    await page.getByRole("button", { name: UI_COPY.en.approveAndApply, exact: true }).click();
    await expect(page.getByRole("button", { name: UI_COPY.en.applying, exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Discard", exact: true })).toBeDisabled();
    await page.keyboard.press("Enter");
    if (action === "switch") await page.getByRole("button", { name: /R-2050\s+Sofia Rossi/ }).click();
    else await resetDemo(page);
    await page.evaluate(() => { const w = window as any; w.pauseDigest = false; w.releaseDigests.forEach((resolve: () => void) => resolve()); });
    await expect(page.locator(".review-actions")).toHaveAttribute("aria-busy", "false");
    expect((await savedState(page)).reservations).toEqual(before.reservations);
    if (action === "switch") {
      await expect(page.getByRole("heading", { name: "Sofia Rossi", exact: true })).toBeVisible();
      await page.getByRole("button", { name: /R-2048\s+Emma Wilson/ }).click();
      await expect(page.getByRole("alert")).toContainText("Changes were not applied");
      await page.getByRole("button", { name: "Prepare again", exact: true }).click();
      await expect(page.getByRole("alert")).toHaveCount(0);
      await page.getByRole("button", { name: UI_COPY.en.approveAndApply, exact: true }).click();
      await expect(page.locator(".completion-status")).toContainText(UI_COPY.en.committed);
    } else expect((await savedState(page)).runsByReservationId).toEqual({});
  });
}

test("shows an application failure and allows retry without changing the reservation", async ({ page }) => {
  await page.addInitScript(() => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (algorithm, data) => {
      if ((window as any).failDigest) throw new Error("Digest unavailable");
      return original(algorithm, data);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: UI_COPY.en.preparePreview, exact: true }).click();
  const before = await savedState(page);
  await page.evaluate(() => { (window as any).failDigest = true; });
  await page.getByRole("button", { name: UI_COPY.en.approveAndApply, exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Changes were not applied");
  expect((await savedState(page)).reservations).toEqual(before.reservations);
  await page.evaluate(() => { (window as any).failDigest = false; });
  await page.getByRole("button", { name: UI_COPY.en.approveAndApply, exact: true }).click();
  await expect(page.locator(".completion-status")).toContainText(UI_COPY.en.committed);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("keeps an agent's concurrent application without duplicate changes or a false failure", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.tools = {};
    Object.defineProperty(document, "modelContext", { configurable: true, value: {
      registerTool: async (tool: any) => { w.tools[tool.name] = tool; },
    } });
    const original = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (algorithm, data) => {
      if (w.digestsToPause > 0) {
        w.digestsToPause--;
        await new Promise<void>(resolve => (w.releaseDigests ??= []).push(resolve));
      }
      return original(algorithm, data);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: UI_COPY.en.preparePreview, exact: true }).click();
  await approveForAgent(page);
  await page.evaluate(() => { (window as any).digestsToPause = 2; });
  await page.getByRole("button", { name: UI_COPY.en.applyApproved, exact: true }).click();
  await expect(page.getByRole("button", { name: UI_COPY.en.applying, exact: true })).toBeDisabled();
  const code = await page.evaluate(async () => {
    const w = window as any;
    const state = JSON.parse(localStorage.getItem("teachback-demo-v1")!);
    const run = state.runsByReservationId[state.selectedReservationId];
    return JSON.parse(await w.tools.teachback_commit_approved.execute({ run_id: run.id, expected_digest: run.digest })).code;
  });
  expect(code).toBe("RUN_COMMITTED");
  await page.evaluate(() => { (window as any).releaseDigests.forEach((resolve: () => void) => resolve()); });
  await expect(page.locator(".review-actions")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".completion-status")).toContainText(UI_COPY.en.committed);
  await expect(page.getByRole("alert")).toHaveCount(0);
  const after = await savedState(page);
  expect(after.reservations.find((r: any) => r.id === "R-2048").version).toBe(2);
  expect(after.audit.at(-1).actor).toBe("Agent");
  expect(after.audit.filter((e: any) => e.summary.startsWith("Committed"))).toHaveLength(1);
});
