import { expect, test, type Page } from "@playwright/test";
import { createTeachingJourney } from "../../src/teaching";

async function installTools(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.reviewTools = {};
    Object.defineProperty(document, "modelContext", { configurable: true, value: {
      registerTool: async (tool: any) => { w.reviewTools[tool.name] = tool; },
    } });
  });
}

async function call(page: Page, name: string, input = {}) {
  await expect.poll(() => page.evaluate((name) => Boolean((window as any).reviewTools?.[name]), name)).toBe(true);
  return page.evaluate(async ({ name, input }) =>
    JSON.parse(await (window as any).reviewTools[name].execute(input)), { name, input });
}

test("publishing Sofia preserves committed Emma and approved Maya", async ({ page }) => {
  await installTools(page);
  await page.goto("/");
  const preview = await call(page, "teachback_prepare_current");
  await page.getByRole("button", { name: "Approve preview", exact: true }).click();
  await call(page, "teachback_commit_approved", { run_id: preview.data.run_id, expected_digest: preview.data.digest });
  await page.getByRole("searchbox", { name: "Search cases" }).fill("Maya");
  await page.getByRole("button", { name: "Check conditions and prepare preview", exact: true }).click();
  await page.getByRole("button", { name: "Approve preview", exact: true }).click();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("teachback-demo-v1")!));
  await page.getByRole("searchbox", { name: "Search cases" }).fill("");
  await page.getByRole("button", { name: /R-2050\s+Sofia Rossi/ }).click();
  await page.getByRole("button", { name: "Teach from this case", exact: true }).click();
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  await page.getByLabel("Compensation requests", { exact: true }).selectOption("escalate");
  await page.getByRole("button", { name: "Publish reusable rule", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Daniel Kim", exact: true })).toBeVisible();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("teachback-demo-v1")!));
  expect(after.reservations).toEqual(before.reservations);
  expect(after.runsByReservationId).toEqual(before.runsByReservationId);
  expect(after.audit).toEqual(expect.arrayContaining(before.audit));
  expect(new Set(after.audit.map((e: any) => e.id)).size).toBe(after.audit.length);
});

test("a second tab cannot resurrect discarded approval", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Check conditions and prepare preview", exact: true }).click();
  await page.getByRole("button", { name: "Approve preview", exact: true }).click();
  const second = await context.newPage();
  await installTools(second);
  await second.goto("/");
  await expect(second.getByRole("heading", { name: "Teachback is open in another tab" })).toBeVisible();
  await expect(second.getByRole("button", { name: /Sofia Rossi/ })).toHaveCount(0);
  expect(await second.evaluate(() => Object.keys((window as any).reviewTools))).toEqual([]);
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await page.close();
  await second.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(second.getByRole("button", { name: "Check conditions and prepare preview", exact: true })).toBeVisible();
  await expect(second.getByText("Approved for this proposal", { exact: true })).toHaveCount(0);
});

test("without tab locking the app cannot mutate saved work or expose tools", async ({ page }) => {
  await installTools(page);
  await page.addInitScript(() => Object.defineProperty(navigator, "locks", { value: undefined }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "This browser cannot start an editing session" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("teachback-demo-v1"))).toBeNull();
  expect(await page.evaluate(() => Object.keys((window as any).reviewTools))).toEqual([]);
});

test("the first playbook also allows every accepted draft value to be corrected", async ({ page }) => {
  await installTools(page);
  await page.addInitScript((journey) => {
    localStorage.setItem("teachback-teaching-scenario-version", "5");
    localStorage.setItem("teachback-teaching-v4", JSON.stringify(journey));
  }, createTeachingJourney());
  await page.goto("/");
  await call(page, "teachback_submit_playbook_draft", {
    latest_arrival_limit: "23:59", taxi_handling: "allow", dietary_handling: "allow", compensation_handling: "allow",
  });
  await expect(page.getByLabel("Latest arrival", { exact: true })).toHaveValue("23:59");
  await page.getByLabel("Latest arrival", { exact: true }).selectOption("22:00");
  await page.getByLabel("Taxi request", { exact: true }).selectOption("escalate");
  await page.getByLabel("Dietary request", { exact: true }).selectOption("escalate");
  await page.getByLabel("Compensation requests", { exact: true }).selectOption("escalate");
  await expect(page.getByRole("button", { name: "Publish reusable rule", exact: true })).toBeEnabled();
});

test("an alternate agent draft stays visible and can be corrected", async ({ page }, testInfo) => {
  await installTools(page);
  await page.goto("/");
  await page.getByRole("button", { name: /R-2050\s+Sofia Rossi/ }).click();
  await page.getByRole("button", { name: "Teach from this case", exact: true }).click();
  const result = await call(page, "teachback_submit_playbook_draft", {
    latest_arrival_limit: "22:00", taxi_handling: "escalate", dietary_handling: "escalate", compensation_handling: "allow",
  });
  expect(result.code).toBe("PLAYBOOK_DRAFTED");
  await expect(page.getByLabel("Latest arrival", { exact: true })).toHaveValue("22:00");
  await expect(page.getByLabel("Taxi request", { exact: true })).toHaveValue("escalate");
  await page.getByLabel("Compensation requests", { exact: true }).selectOption("escalate");
  await expect(page.getByRole("button", { name: "Publish reusable rule", exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath("alternate-draft.png"), fullPage: true });
  await page.getByLabel("Latest arrival", { exact: true }).selectOption("23:59");
  await page.getByLabel("Taxi request", { exact: true }).selectOption("allow");
  await page.getByLabel("Dietary request", { exact: true }).selectOption("allow");
  await expect(page.getByRole("button", { name: "Publish reusable rule", exact: true })).toBeEnabled();
});

test("Noah refusal explains compensation and is recorded", async ({ page }, testInfo) => {
  await installTools(page);
  await page.goto("/");
  await page.getByRole("searchbox", { name: "Search cases" }).fill("Noah");
  const result = await call(page, "teachback_prepare_current");
  expect(result.code).toBe("PLAYBOOK_NOT_APPLICABLE");
  expect(result.reasons).toContain("Compensation requests are outside this playbook.");
  await expect(page.locator(".eligibility-list .is-failed")).toContainText("No compensation request");
  const checklist = await page.locator(".eligibility-list").boundingBox();
  const reasons = await page.locator(".refusal-reasons").boundingBox();
  expect(reasons!.y).toBeGreaterThan(checklist!.y + checklist!.height);
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("teachback-demo-v1")!));
  expect(state.audit.at(-1).summary).toContain("Rejected");
  expect(state.runsByReservationId["R-2060"]).toBeUndefined();
  await page.screenshot({ path: testInfo.outputPath("refused.png"), fullPage: true });
});

test("keyboard can expand WebMCP evidence and stay inside audit", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "View audit trail", exact: true }).click();
  await page.keyboard.press("Tab");
  await expect(page.locator(".webmcp-evidence summary")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".webmcp-evidence")).toHaveAttribute("open", "");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close audit trail" })).toBeFocused();
});
