import { expect, test, type Page } from "@playwright/test";
import type { AppState, ToolResult } from "../../src/domain";
import { UI_COPY, type UiLocale } from "../../src/i18n";
import type { TeachingJourney } from "../../src/teaching";
import { approveForAgent } from "./approval";
import { resetDemo } from "./reset";

async function savedState(page: Page): Promise<AppState> {
  await expect.poll(() => page.evaluate(() => localStorage.getItem("teachback-demo-v1"))).not.toBeNull();
  return page.evaluate(() => JSON.parse(localStorage.getItem("teachback-demo-v1")!));
}

async function savedJourney(page: Page): Promise<TeachingJourney> {
  await expect.poll(() => page.evaluate(() => localStorage.getItem("teachback-teaching-v4"))).not.toBeNull();
  return page.evaluate(() => JSON.parse(localStorage.getItem("teachback-teaching-v4")!));
}

async function openDemo(page: Page, locale: UiLocale) {
  await page.goto("/");
  if (locale === "ja") await page.getByRole("button", { name: "日本語", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Emma Wilson", exact: true })).toBeVisible();
}

type TestWindow = Window & {
  uxFailWrites?: boolean;
  uxTools?: Record<string, { execute(input: Record<string, unknown>): string | Promise<string> }>;
};

async function installToggleableStorageFailure(page: Page) {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if ((window as TestWindow).uxFailWrites && key.startsWith("teachback-")) {
        throw new DOMException("Storage unavailable", "SecurityError");
      }
      setItem.call(this, key, value);
    };
  });
}

for (const locale of ["en", "ja"] as const) {
  test(`hides stale ${locale} reservation actions for empty search results and restores the same proposal`, async ({ page }) => {
    const copy = UI_COPY[locale];
    await openDemo(page, locale);
    await page.getByRole("button", { name: copy.preparePreview, exact: true }).click();
    await expect(page.getByRole("heading", { name: copy.proposedChanges, exact: true })).toBeVisible();
    const before = await savedState(page);
    const proposal = before.runsByReservationId["R-2048"];
    expect(proposal?.status).toBe("awaiting_review");

    await page.getByRole("searchbox", { name: copy.caseSearch, exact: true }).fill("nobody-zzz");
    await expect(page.getByRole("heading", { name: copy.noMatchingCases, exact: true })).toBeVisible();
    await expect(page.getByText(copy.emptySearchHelp, { exact: true })).toBeVisible();
    await expect(page.locator(".reservation-workspace, .review-panel")).toHaveCount(0);
    await expect(page.getByRole("button", { name: copy.approveAndApply, exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: copy.discard, exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: copy.previousCases, exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: copy.nextCases, exact: true })).toBeDisabled();

    await page.getByRole("button", { name: copy.clearSearch, exact: true }).click();
    await expect(page.getByRole("heading", { name: "Emma Wilson", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: copy.approveAndApply, exact: true })).toBeEnabled();
    const restored = await savedState(page);
    expect(restored.runsByReservationId["R-2048"]).toEqual(proposal);
    expect(restored.reservations).toEqual(before.reservations);
  });

  test(`keeps ${locale} recorded actions and published boundaries inspectable across teaching and source navigation`, async ({ page }) => {
    const copy = UI_COPY[locale];
    await openDemo(page, locale);
    await page.getByRole("searchbox", { name: copy.caseSearch, exact: true }).fill("Sofia");
    await expect(page.getByRole("heading", { name: "Sofia Rossi", exact: true })).toBeVisible();
    const sourceStatus = page.locator(".source-status");
    await expect(sourceStatus.getByText(copy.reservationResponse, { exact: true })).toBeVisible();
    await expect(sourceStatus.getByText(copy.caseHandled, { exact: true })).toBeVisible();
    await expect(sourceStatus.getByText(copy.ruleNotCreated, { exact: true })).toBeVisible();
    await expect(page.locator(".playbook-flow.is-unmatched")).toHaveCount(0);
    const recorded = page.getByRole("region", { name: copy.recordedResponse, exact: true });
    await expect(recorded.locator(".recorded-actions li")).toHaveCount(6);
    const sourceActions = await recorded.locator(".recorded-actions li").allTextContents();
    await recorded.locator(".recorded-messages summary").click();
    await expect(recorded.locator('dd[lang="en"]')).toHaveCount(2);
    const sourceMessages = await recorded.locator('dd[lang="en"]').allTextContents();
    expect(sourceMessages.every(message => message.trim().length > 0)).toBe(true);

    await page.getByRole("button", { name: copy.teachThisCase, exact: true }).click();
    await expect(recorded.locator(".recorded-actions li")).toHaveText(sourceActions);
    await expect(page.locator(".teaching-rule-facts div").filter({ has: page.getByText(copy.teachingActionCount, { exact: true }) })).toContainText(`6${copy.teachingCountUnit}`);
    await page.getByRole("button", { name: copy.createAgentDraft, exact: true }).click();
    const fixedBoundary = page.locator(".fixed-boundary-details");
    await expect(fixedBoundary.locator("summary")).toHaveText(copy.fixedResponseBoundary);
    await expect(page.locator(".boundary-section-heading")).toContainText(copy.editableBoundary);
    await expect(page.locator("#boundary-correction")).toContainText(`${copy.compensationRule}: ${copy.taxiEscalate}`);
    await expect(page.getByRole("combobox")).toHaveCount(1);
    await expect(page.getByRole("button", { name: copy.publishPlaybook, exact: true })).toBeDisabled();
    await fixedBoundary.locator("summary").click();
    await expect(fixedBoundary.getByText("23:59", { exact: true })).toBeVisible();
    await page.getByLabel(copy.compensationRule, { exact: true }).selectOption("escalate");
    await expect(page.locator(".boundary-section-heading")).toContainText(copy.humanBoundary);
    await expect(page.locator("#boundary-correction")).toHaveText(copy.publishReady);
    await page.getByRole("button", { name: copy.publishPlaybook, exact: true }).click();

    await expect(page.getByRole("heading", { name: "Daniel Kim", exact: true })).toBeVisible();
    await expect(page.getByRole("searchbox", { name: copy.caseSearch, exact: true })).toHaveValue("");
    const notice = page.locator(".publish-notice");
    await expect(notice).toContainText(`${copy.rulePublishedNotice} Sofia Rossi`);
    await expect(notice).toContainText(`${copy.reuseTargetNotice} Daniel Kim`);
    await page.locator(".playbook-flow").getByRole("button", { name: "Sofia Rossi R-2050", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Sofia Rossi", exact: true })).toBeVisible();
    await expect(sourceStatus.getByText(copy.ruleRegistered, { exact: true })).toBeVisible();
    await expect(recorded.locator(".recorded-actions li")).toHaveText(sourceActions);
    await recorded.locator(".recorded-messages summary").click();
    await expect(recorded.locator('dd[lang="en"]')).toHaveText(sourceMessages);
    const registeredRule = page.getByRole("region", { name: copy.registeredRule, exact: true });
    await expect(registeredRule).toContainText(copy.nightPlaybookName);
    await expect(registeredRule).toContainText("23:59");
    await expect(registeredRule).toContainText(copy.compensationEscalate);
    await expect(page.getByRole("button", { name: copy.teachThisCase, exact: true })).toHaveCount(0);
    const tryMatchingCase = page.getByRole("button", { name: copy.tryMatchingCase });
    await expect(tryMatchingCase).toContainText("Daniel Kim");
    await tryMatchingCase.click();
    await expect(page.getByRole("heading", { name: "Daniel Kim", exact: true })).toBeVisible();
    await expect(page.locator(".playbook-flow")).toContainText(copy.nightPlaybookName);
    await page.getByRole("button", { name: copy.preparePreview, exact: true }).click();
    await expect(page.getByRole("heading", { name: copy.proposedChanges, exact: true })).toBeVisible();
    expect((await savedState(page)).runsByReservationId["R-2052"]?.playbookId).toBe("night-arrival-coordination@1");
  });

  test(`gives a rejected ${locale} case an explicit manual endpoint and an eligible next case`, async ({ page }) => {
    const copy = UI_COPY[locale];
    await openDemo(page, locale);
    await page.getByRole("searchbox", { name: copy.caseSearch, exact: true }).fill("Noah");
    await expect(page.getByRole("heading", { name: "Noah Martin", exact: true })).toBeVisible();
    await expect(page.locator(".reservation-requests")).toContainText(copy.compensationRequested);
    const before = await savedState(page);
    await page.getByRole("button", { name: copy.checkConditions, exact: true }).click();
    await expect(page.locator('.case-item[aria-current="true"]')).toContainText(copy.caseNeedsHumanReview);
    await expect(page.locator(".manual-endpoint")).toHaveText(copy.manualEndpoint);
    await expect(page.getByRole("button", { name: copy.checkConditions, exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: copy.approveAndApply, exact: true })).toHaveCount(0);
    const rejected = await savedState(page);
    expect(rejected.reservations).toEqual(before.reservations);
    expect(rejected.runsByReservationId["R-2060"]).toBeUndefined();
    await page.getByRole("button", { name: copy.tryAnotherCase }).click();
    await expect(page.getByRole("searchbox", { name: copy.caseSearch, exact: true })).toHaveValue("");
    await expect(page.getByRole("heading", { name: "Emma Wilson", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: copy.preparePreview, exact: true })).toBeEnabled();
  });

  test(`keeps the reuse purpose visible on a narrow ${locale} screen`, async ({ page }) => {
    const copy = UI_COPY[locale];
    await page.setViewportSize({ width: 390, height: 844 });
    await openDemo(page, locale);
    const purpose = page.getByRole("region", { name: copy.readyHeading, exact: true });
    await expect(purpose).toBeVisible();
    await expect(purpose).toContainText(copy.readyBody);
    const pending = page.locator(".pending-criteria");
    await expect(pending.locator("summary")).toHaveText(copy.viewConditions);
    await expect(pending).not.toHaveAttribute("open");
    await expect(pending.locator("li")).toHaveCount(7);
    await expect(pending.locator("li").first()).not.toBeVisible();
    await pending.locator("summary").click();
    await expect(pending.locator("li").last()).toBeVisible();
    await pending.locator("summary").click();
    const prepare = page.getByRole("button", { name: copy.preparePreview, exact: true });
    await prepare.scrollIntoViewIfNeeded();
    await expect(prepare).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test(`requires an explicit ${locale} reset confirmation and preserves work when cancelled`, async ({ page }) => {
    const copy = UI_COPY[locale];
    await openDemo(page, locale);
    await page.getByRole("button", { name: copy.preparePreview, exact: true }).click();
    await approveForAgent(page, locale);
    await expect(page.getByText(copy.approvedReady, { exact: true })).toBeVisible();
    const before = await savedState(page);
    const dialog = page.getByRole("dialog", { name: copy.resetConfirmTitle, exact: true });
    await page.getByRole("button", { name: copy.resetDemo, exact: true }).click();
    await expect(dialog).toContainText(copy.resetConfirmBody);
    await expect(dialog.getByRole("button", { name: copy.cancel, exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    expect((await savedState(page)).runsByReservationId).toEqual(before.runsByReservationId);

    await page.getByRole("button", { name: copy.resetDemo, exact: true }).click();
    await dialog.getByRole("button", { name: copy.cancel, exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText(copy.approvedReady, { exact: true })).toBeVisible();
    expect((await savedState(page)).reservations).toEqual(before.reservations);

    await resetDemo(page, locale);
    await expect(page.getByRole("button", { name: copy.preparePreview, exact: true })).toBeVisible();
    const reset = await savedState(page);
    expect(reset.runsByReservationId).toEqual({});
    expect(reset.rejectionsByReservationId).toEqual({});
    expect((await savedJourney(page)).publishedPlaybooks).toHaveLength(1);
  });
}

test("warns on failed persistence and saves the visible work after retry", async ({ page }) => {
  await installToggleableStorageFailure(page);
  await openDemo(page, "en");
  await page.evaluate(() => { (window as TestWindow).uxFailWrites = true; });
  await page.getByRole("button", { name: UI_COPY.en.preparePreview, exact: true }).click();
  await expect(page.getByRole("heading", { name: UI_COPY.en.proposedChanges, exact: true })).toBeVisible();
  await expect(page.locator(".storage-warning")).toContainText(UI_COPY.en.storageWarning);
  const visibleChanges = await page.locator(".changes-list").innerText();
  expect((await savedState(page)).runsByReservationId["R-2048"]).toBeUndefined();

  await page.evaluate(() => { (window as TestWindow).uxFailWrites = false; });
  await page.getByRole("button", { name: UI_COPY.en.storageRetry, exact: true }).click();
  await expect(page.locator(".storage-warning")).toHaveCount(0);
  expect((await savedState(page)).runsByReservationId["R-2048"]?.status).toBe("awaiting_review");
  await page.reload();
  await expect(page.locator(".changes-list")).toHaveText(visibleChanges);
});

test("does not discard current work when saving a reset fails", async ({ page }) => {
  await installToggleableStorageFailure(page);
  await openDemo(page, "en");
  await page.getByRole("button", { name: UI_COPY.en.preparePreview, exact: true }).click();
  await expect(page.getByRole("heading", { name: UI_COPY.en.proposedChanges, exact: true })).toBeVisible();
  const before = await savedState(page);
  await page.evaluate(() => { (window as TestWindow).uxFailWrites = true; });
  await resetDemo(page);
  await expect(page.locator(".storage-warning")).toContainText(UI_COPY.en.resetFailed);
  await expect(page.getByRole("heading", { name: UI_COPY.en.proposedChanges, exact: true })).toBeVisible();
  expect(await savedState(page)).toEqual(before);
  await page.evaluate(() => { (window as TestWindow).uxFailWrites = false; });
  await page.getByRole("button", { name: UI_COPY.en.storageRetry, exact: true }).click();
  await expect(page.locator(".storage-warning")).toHaveCount(0);
  await resetDemo(page);
  expect((await savedState(page)).runsByReservationId).toEqual({});
});

test("distinguishes built-in website preparation from a WebMCP agent call in the audit trail", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as TestWindow;
    w.uxTools = {};
    Object.defineProperty(document, "modelContext", { configurable: true, value: {
      registerTool: (tool: { name: string; execute(input: Record<string, unknown>): string | Promise<string> }) => { w.uxTools![tool.name] = tool; },
    } });
  });
  await openDemo(page, "en");
  await page.getByRole("button", { name: UI_COPY.en.preparePreview, exact: true }).click();
  await page.getByRole("button", { name: UI_COPY.en.viewAudit, exact: true }).click();
  const audit = page.getByRole("dialog", { name: UI_COPY.en.auditTrail, exact: true });
  await expect(audit.locator(".audit-events > li").first().locator(":scope > strong")).toHaveText("Website");
  await expect(audit.locator(".audit-provenance")).toHaveText(UI_COPY.en.auditProvenance);
  await audit.locator(".webmcp-evidence summary").click();
  await expect(audit.getByText(UI_COPY.en.webMcpNoCalls, { exact: true })).toBeVisible();
  await audit.getByRole("button", { name: UI_COPY.en.closeAudit, exact: true }).click();

  await expect.poll(() => page.evaluate(() => Boolean((window as TestWindow).uxTools?.teachback_prepare_current))).toBe(true);
  const prepared: ToolResult = await page.evaluate(async () => JSON.parse(await (window as TestWindow).uxTools!.teachback_prepare_current.execute({})));
  expect(prepared.code).toBe("RUN_PREPARED");
  await page.getByRole("button", { name: UI_COPY.en.viewAudit, exact: true }).click();
  await expect(audit.locator(".audit-events > li").first().locator(":scope > strong")).toHaveText("Agent");
  await audit.locator(".webmcp-evidence summary").click();
  await expect(audit.getByText("teachback_prepare_current", { exact: true })).toBeVisible();
  await expect(audit.getByText("RUN_PREPARED", { exact: true })).toBeVisible();
});
