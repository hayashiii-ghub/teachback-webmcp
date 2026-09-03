import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Command, PlaybookDraft, PlaybookStep, PreparedRun, Proposal, PublishedPlaybook, Reservation, Result, SessionState, TextToken } from "../../src/core/domain";
import { isSessionState } from "../../src/core/persistence";
import { approveRun } from "../../src/core/playbook-runtime";

// Deterministic integration tests only. The shim exposes the actual registered
// tools, but the proposal below is test-authored, NOT evidence of an LLM run.
// Human publish/approve controls are exercised as UI tests, not filmed proof.
const SESSION_KEY = "teachback-session-v1";
type TestTools = Record<string, { execute(input: Record<string, unknown>): Promise<string> }>;
type TestWindow = Window & { __teachbackTestTools?: TestTools; __restoreCoreStorage?: () => void };
interface DemonstrationData {
  demonstrationId: string; caseId: string; sourceDigest: string; totalSavedOperations: number;
  sourceCase: Pick<Reservation, "guestDisplayName" | "requestedArrivalDate" | "requestedArrivalTime">;
  commands: (Command & { id: string })[];
}
interface CasesData { cases: (Reservation & { workflow_status: string; active_run_id: string | null })[] }
interface PlaybooksData { playbooks: PublishedPlaybook[] }

const browserErrors = new WeakMap<BrowserContext, string[]>();

test.beforeEach(async ({ page, context }) => {
  const errors: string[] = [];
  browserErrors.set(context, errors);
  const observed = new Set<Page>();
  const observePage = (current: Page) => {
    if (observed.has(current)) return;
    observed.add(current);
    current.on("pageerror", error => errors.push(`[pageerror] ${current.url()}\n${error.stack ?? error.message}`));
    current.on("console", message => {
      if (message.type() !== "error") return;
      const location = message.location();
      errors.push(`[console.error] ${current.url()}\n${message.text()}\n${location.url}:${location.lineNumber}:${location.columnNumber}`);
    });
  };
  // Also retain errors from secondary tabs, even if the original editing tab closes.
  context.on("page", observePage);
  context.pages().forEach(observePage);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("teachback-ui-locale-v1", "en");
    } catch {
      // Storage-unavailable tests must still reach the application's error UI.
    }
    const tools: TestTools = Object.create(null);
    (window as TestWindow).__teachbackTestTools = tools;
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool(tool: TestTools[string] & { name: string }, options?: { signal?: AbortSignal }) {
          tools[tool.name] = tool;
          options?.signal?.addEventListener("abort", () => { if (tools[tool.name] === tool) delete tools[tool.name]; }, { once: true });
        },
      },
    });
  });
});

test.afterEach(async ({ context }) => {
  expect(browserErrors.get(context) ?? [], "No unhandled page errors or console.error output in any test tab").toEqual([]);
});

async function ready(page: Page) {
  await expect(page.getByRole("navigation", { name: "Main navigation", exact: true })).toBeVisible();
  await page.waitForFunction(() => Object.keys((window as TestWindow).__teachbackTestTools ?? {}).length === 7);
}
async function open(page: Page) { await page.goto("/"); await ready(page); }
async function workspace(page: Page, name: "Cases" | "Playbooks" | "History") {
  await page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("button", { name, exact: true }).click();
}
async function editorTab(page: Page, name: "Operations" | "Conditions" | "Review & publish") {
  const tab = page.getByRole("tab", { name, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}
async function noHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({ viewport: window.innerWidth, content: document.documentElement.scrollWidth }));
  expect(widths.content, "The workspace must fit the desktop or mobile viewport").toBeLessThanOrEqual(widths.viewport);
}
async function openPublishedPlaybook(page: Page, playbook: PublishedPlaybook) {
  await workspace(page, "Playbooks");
  await page.getByRole("region", { name: "Published playbooks", exact: true }).getByRole("button", {
    name: new RegExp(`${playbook.name}.*v${playbook.version}\\b`),
  }).click();
  await expect(page.locator(".published-procedure").getByRole("heading", { name: playbook.name, exact: true })).toBeVisible();
}
async function tool<T>(page: Page, name: string, input: Record<string, unknown> = {}): Promise<Result<T>> {
  return page.evaluate(async ({ name, input }) => {
    const entry = (window as TestWindow).__teachbackTestTools?.[name];
    if (!entry) throw new Error(`Registered test tool is missing: ${name}`);
    return JSON.parse(await entry.execute(input)) as Result<T>;
  }, { name, input });
}
function data<T>(result: Result<T>): T {
  expect(result.ok, `${result.code}: ${result.summary} ${JSON.stringify(result.issues ?? [])}`).toBe(true);
  expect(result.data).toBeDefined();
  return result.data!;
}
async function saved(page: Page): Promise<SessionState> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SESSION_KEY);
}
async function cases(page: Page) { return data(await tool<CasesData>(page, "teachback_list_cases")).cases; }
async function selectCase(page: Page, reservation: Reservation) {
  await workspace(page, "Cases");
  const item = page.locator(".core-case-rail").getByRole("button", { name: new RegExp(reservation.id) });
  await item.click();
  await expect(item).toHaveAttribute("aria-pressed", "true");
}
async function recordCase(page: Page, reservation: Reservation, subset = false): Promise<DemonstrationData> {
  await selectCase(page, reservation);
  await page.getByRole("button", { name: "Record work", exact: true }).click();
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recording your work" })).toBeVisible();
  await page.getByLabel("Date", { exact: true }).fill(reservation.requestedArrivalDate!);
  await page.getByLabel("Time", { exact: true }).fill(reservation.requestedArrivalTime!);
  await page.getByRole("button", { name: "Save arrival", exact: true }).click();
  await expect(page.locator(".core-records li")).toHaveCount(1);
  if (!subset) {
    await page.getByRole("button", { name: "Save meal box", exact: true }).click();
    await expect(page.locator(".core-records li")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Meal box saved", exact: true })).toBeDisabled();
    await page.getByLabel("Message to the guest", { exact: true }).fill(`Dear ${reservation.guestDisplayName}, your meal box will be ready when you arrive at ${reservation.requestedArrivalTime}.`);
    await page.getByRole("button", { name: "Save message draft", exact: true }).click();
    await expect(page.locator(".core-records li")).toHaveCount(3);
  }
  await page.getByLabel("Handoff text", { exact: true }).fill(`Expect ${reservation.guestDisplayName} at ${reservation.requestedArrivalTime}; please welcome them at reception.`);
  await page.getByRole("button", { name: "Save handoff", exact: true }).click();
  await expect(page.locator(".core-records li")).toHaveCount(subset ? 2 : 4);
  await page.getByRole("button", { name: "Finish recording", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ask an agent to draft from this work", exact: true })).toBeVisible();
  const recorded = data(await tool<DemonstrationData>(page, "teachback_get_demonstration"));
  expect(recorded.caseId).toBe(reservation.id);
  expect(recorded.commands).toHaveLength(subset ? 2 : 4);
  expect(recorded.totalSavedOperations).toBe(subset ? 2 : 4);
  return recorded;
}

/** Builds test input from actual UI-saved command IDs and wording, not fixture playbooks. */
function proposalFrom(recorded: DemonstrationData, latestArrivalTime = "22:00"): Proposal {
  const replacements = [
    { value: recorded.sourceCase.guestDisplayName, field: "guestDisplayName" as const },
    { value: recorded.sourceCase.requestedArrivalTime!, field: "requestedArrivalTime" as const },
  ];
  function template(text: string): TextToken[] {
    let tokens: TextToken[] = [{ kind: "literal", value: text }];
    for (const replacement of replacements) tokens = tokens.flatMap(token => {
      if (token.kind !== "literal") return [token];
      return token.value.split(replacement.value).flatMap<TextToken>((part, index) => [
        ...(index ? [{ kind: "case_field" as const, field: replacement.field }] : []),
        ...(part ? [{ kind: "literal" as const, value: part }] : []),
      ]);
    });
    return tokens;
  }
  const steps: PlaybookStep[] = recorded.commands.map((command, index) => {
    const common = { id: `recorded-step-${index + 1}`, evidenceCommandIds: [command.id], rationale: "Reuse this saved human operation, with the next case's values where needed." };
    if (command.type === "set_estimated_arrival") return { ...common, type: command.type, input: { date: { kind: "case_field", field: "requestedArrivalDate" }, time: { kind: "case_field", field: "requestedArrivalTime" } } };
    if (command.type === "set_meal_service") return { ...common, type: command.type, input: { kind: "literal", value: "late_meal_box" } };
    return { ...common, type: command.type, input: { template: template(command.input.text) } };
  });
  return { name: "Recorded reception response", purpose: "Reuse the saved response with this guest's arrival details and human approval.", steps, proposedBoundary: { latestArrivalTime }, unresolvedQuestions: [] };
}

async function submitAndPublish(page: Page, recording: DemonstrationData, humanBoundaryChange = false): Promise<PublishedPlaybook> {
  const proposal = proposalFrom(recording, humanBoundaryChange ? "23:00" : "22:00");
  const submitted = data(await tool<PlaybookDraft>(page, "teachback_create_draft", { demonstration_id: recording.demonstrationId, source_digest: recording.sourceDigest, request_id: crypto.randomUUID(), proposal }));
  expect(submitted.createdBy).toBe("Agent");
  expect(submitted.sourceDemonstrationId).toBe(recording.demonstrationId);
  await expect(page.getByRole("tab", { name: "Operations", exact: true })).toHaveAttribute("aria-selected", "true");
  const publish = page.getByRole("button", { name: "Publish this playbook", exact: true });
  // Editing and publishing are separate tasks; approval is only on the final tab.
  await expect(publish).toHaveCount(0);
  await editorTab(page, "Conditions");
  await expect(publish).toHaveCount(0);
  if (humanBoundaryChange) {
    expect(submitted.validationIssues.some(issue => issue.code === "BOUNDARY_TOO_WIDE")).toBe(true);
    await page.getByLabel("Latest arrival (no later than 22:00)", { exact: true }).fill("21:40");
    await page.getByRole("button", { name: "Save changes and validate", exact: true }).click();
    await expect(page.getByLabel("Latest arrival (no later than 22:00)", { exact: true })).toHaveValue("21:40");
  }
  await editorTab(page, "Review & publish");
  await expect(publish).toBeDisabled();
  const confirmation = page.getByRole("checkbox", { name: "I reviewed the recorded work, bindings and boundary", exact: true });
  await expect(confirmation).toBeEnabled();
  await confirmation.check();
  await publish.click();
  await expect(page.locator(".published-procedure").getByRole("heading", { name: proposal.name, exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("button", { name: "Playbooks", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".core-case-rail")).toHaveCount(0);
  const published = data(await tool<PlaybooksData>(page, "teachback_list_playbooks")).playbooks.at(-1)!;
  expect(published.publishedBy).toBe("Human");
  expect(published.sourceDemonstrationId).toBe(recording.demonstrationId);
  expect(published.boundary.latestArrivalTime).toBe(humanBoundaryChange ? "21:40" : "22:00");
  expect(published.steps).toEqual(proposal.steps);
  return published;
}

async function prepareCase(page: Page, reservation: Reservation, playbook: PublishedPlaybook): Promise<PreparedRun> {
  await selectCase(page, reservation);
  await page.getByRole("button", { name: "Reuse playbook", exact: true }).click();
  return data(await tool<PreparedRun>(page, "teachback_prepare_run", {
    case_id: reservation.id, expected_case_version: reservation.version,
    playbook_id: playbook.id, playbook_version: playbook.version, request_id: crypto.randomUUID(),
  }));
}

/**
 * Migration fixture only: reproduce a valid approval saved by the old UI.
 * This runs the domain transition in the test process, then reloads its persisted
 * state. It neither adds a production approval tool nor represents a human act.
 */
async function restorePreviouslyApprovedRun(page: Page, run: PreparedRun): Promise<PreparedRun> {
  const state = await saved(page);
  const now = await page.evaluate(() => new Date().toISOString());
  const transition = approveRun(state, run.id, run.digest, { now });
  const approved = data(transition.result);
  expect(isSessionState(transition.state)).toBe(true);
  await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: SESSION_KEY, state: transition.state });
  await page.reload(); await ready(page);
  await selectCase(page, transition.state.reservations.find(reservation => reservation.id === run.caseId)!);
  await page.getByRole("button", { name: "Reuse playbook", exact: true }).click();
  return approved;
}

test("separates Cases, Playbooks and History without changing saved work or the selected case", async ({ page }) => {
  await open(page);
  const [, selected] = await cases(page);
  await selectCase(page, selected);
  const before = await saved(page);
  const navigation = page.getByRole("navigation", { name: "Main navigation", exact: true });
  await expect(navigation.getByRole("button", { name: "Cases", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Workflow stages", exact: true })).toHaveCount(0);
  await noHorizontalOverflow(page);
  await workspace(page, "Playbooks");
  await expect(navigation.getByRole("button", { name: "Playbooks", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".core-case-rail")).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "Search reservations", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publish this playbook", exact: true })).toHaveCount(0);
  await noHorizontalOverflow(page);
  await workspace(page, "History");
  await expect(navigation.getByRole("button", { name: "History", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Audit trail", exact: true })).toBeVisible();
  await expect(page.locator(".core-case-rail")).toHaveCount(0);
  await noHorizontalOverflow(page);
  await workspace(page, "Cases");
  await expect(page.getByRole("heading", { name: selected.guestDisplayName, exact: true })).toBeVisible();
  await expect(page.locator(".core-case-rail").getByRole("button", { name: new RegExp(selected.id) })).toHaveAttribute("aria-pressed", "true");
  expect(await saved(page)).toEqual(before);
});

test("keeps editorial draft and published details readable in both languages", async ({ page }) => {
  await open(page);
  const [source] = await cases(page);
  const recorded = await recordCase(page, source);
  const proposal = proposalFrom(recorded);
  data(await tool<PlaybookDraft>(page, "teachback_create_draft", {
    demonstration_id: recorded.demonstrationId, source_digest: recorded.sourceDigest,
    request_id: crypto.randomUUID(), proposal,
  }));
  for (const locale of ["en", "ja"] as const) {
    await page.getByRole("button", { name: locale === "en" ? "EN" : "日本語", exact: true }).click();
    for (const [tab, name] of (locale === "en"
      ? [["operations", "Operations"], ["conditions", "Conditions"], ["review", "Review & publish"]]
      : [["operations", "操作内容"], ["conditions", "適用条件"], ["review", "確認・公開"]])) {
      await page.getByRole("tab", { name, exact: true }).click();
      await noHorizontalOverflow(page);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({ path: test.info().outputPath(`draft-${tab}-${locale}.png`), fullPage: true, scale: "css", animations: "disabled" });
    }
  }
  await page.getByRole("button", { name: "EN", exact: true }).click();
  // The full allowed length must wrap on publication, not stretch the workspace.
  const longName = "LongPlaybookName".repeat(5);
  await page.getByLabel("Playbook name", { exact: true }).fill(longName);
  await page.getByRole("button", { name: "Save changes and validate", exact: true }).click();
  await page.getByRole("checkbox", { name: "I reviewed the recorded work, bindings and boundary", exact: true }).check();
  await page.getByRole("button", { name: "Publish this playbook", exact: true }).click();
  await expect(page.locator(".published-procedure h1")).toHaveText(longName);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath("published-long-name.png"), fullPage: true, scale: "css", animations: "disabled" });
  await workspace(page, "History");
  await noHorizontalOverflow(page);
});

test("prepares through WebMCP and applies exact changes only when a person approves in the UI", async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => Object.keys((window as TestWindow).__teachbackTestTools ?? {}).sort())).toEqual([
    "teachback_create_draft", "teachback_get_demonstration", "teachback_get_run",
    "teachback_list_cases", "teachback_list_playbooks", "teachback_prepare_run", "teachback_update_draft",
  ]);
  expect(data(await tool<PlaybooksData>(page, "teachback_list_playbooks")).playbooks).toEqual([]);
  expect((await tool(page, "teachback_get_demonstration")).code).toBe("DEMONSTRATION_NOT_FOUND");
  const [source, target, , other] = await cases(page);
  const recorded = await recordCase(page, source);
  expect(recorded.commands[0]).toMatchObject({ type: "set_estimated_arrival", input: { time: source.requestedArrivalTime } });
  const published = await submitAndPublish(page, recorded, true);
  await workspace(page, "Cases");
  const run = data(await tool<PreparedRun>(page, "teachback_prepare_run", {
    case_id: target.id, expected_case_version: target.version,
    playbook_id: published.id, playbook_version: published.version, request_id: crypto.randomUUID(),
  }));
  // Agent preparation does not silently replace the human's current case.
  await expect(page.getByRole("heading", { name: source.guestDisplayName, exact: true })).toBeVisible();
  const agentActivity = page.locator(".core-feedback").filter({ hasText: "Agent activity for:" });
  await expect(agentActivity).toContainText(target.guestDisplayName);
  await agentActivity.getByRole("button", { name: "View this case", exact: true }).click();
  await expect(page.getByRole("heading", { name: target.guestDisplayName, exact: true })).toBeVisible();
  expect(run.commands).toHaveLength(4);
  expect(run.after.guestMessageDraft).toContain(`${target.guestDisplayName},`);
  expect(run.after.guestMessageDraft).toContain(target.requestedArrivalTime!);
  expect(run.after.guestMessageDraft).not.toContain(source.guestDisplayName);
  await expect(page.getByRole("heading", { name: "Proposed changes", exact: true })).toBeVisible();
  await expect(page.locator(".core-diff")).toContainText(target.guestDisplayName);
  await expect(page.locator(".core-diff").getByText("Case status", { exact: true })).toBeVisible();
  await expect(page.locator(".core-diff").getByText("Unhandled", { exact: true })).toBeVisible();
  await expect(page.locator(".core-diff").getByText("Handled", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve only · let agent apply", exact: true })).toHaveCount(0);
  await expect(page.getByText(/Tell the agent.*I approved it/)).toHaveCount(0);
  expect(run.status).toBe("awaiting_review");
  expect(run.approval).toBeNull();
  expect((await saved(page)).reservations.find(row => row.id === target.id)).toEqual(run.before);
  expect((await cases(page)).find(row => row.id === target.id)?.handled).toBe(false);
  await selectCase(page, other);
  await expect(page.getByRole("heading", { name: other.guestDisplayName, exact: true })).toBeVisible();
  await expect(agentActivity).toContainText(target.guestDisplayName);
  await expect(agentActivity).toContainText(/awaiting (human )?review/i);
  expect((await saved(page)).reservations.find(row => row.id === target.id)).toEqual(run.before);
  await selectCase(page, target);
  await page.getByRole("button", { name: "Approve and apply", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Committed", exact: true })).toBeVisible();
  const applied = data(await tool<PreparedRun>(page, "teachback_get_run", { run_id: run.id }));
  expect(applied.status).toBe("committed");
  expect(applied.digest).toBe(run.digest);
  expect(applied.approval).toMatchObject({ approvedDigest: run.digest, used: true });
  expect(applied.commands).toEqual(run.commands);
  expect(applied.exactDiff).toEqual(run.exactDiff);
  const after = await cases(page);
  expect(after.find(row => row.id === target.id)?.handled).toBe(true);
  expect(after.find(row => row.id === other.id)?.handled).toBe(false);
  const persisted = await saved(page);
  expect(persisted.audit.find(entry => entry.eventType === "playbook_published")?.actor).toBe("Human");
  expect(persisted.audit.find(entry => entry.eventType === "run_approved")?.actor).toBe("Human");
  expect(persisted.audit.find(entry => entry.eventType === "run_prepared")?.actor).toBe("Agent");
  expect(persisted.audit.find(entry => entry.eventType === "run_committed")?.actor).toBe("Human");
  expect(persisted.reservations.find(row => row.id === target.id)).toEqual(run.after);
  expect(persisted.demonstrations).toHaveLength(1);
  await selectCase(page, other);
  await expect(agentActivity).toContainText(target.guestDisplayName);
  await expect(agentActivity).toContainText("Handled");
  await expect(agentActivity).not.toContainText(/awaiting (human )?review|I approved it|please continue/i);
  await page.reload(); await ready(page);
  await expect(agentActivity).toContainText(target.guestDisplayName);
  await expect(agentActivity).toContainText("Handled");
  await expect(agentActivity).not.toContainText(/awaiting (human )?review|I approved it|please continue/i);
  expect(data(await tool<PreparedRun>(page, "teachback_get_run", { run_id: run.id }))).toEqual(applied);
  expect(data(await tool<PlaybooksData>(page, "teachback_list_playbooks")).playbooks[0].contentDigest).toBe(published.contentDigest);
  expect((await saved(page)).reservations.find(row => row.id === target.id)).toEqual(run.after);
  await selectCase(page, target);
  await page.getByRole("button", { name: "Reuse playbook", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Applied changes", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Committed", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve and apply", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Apply approved changes", exact: true })).toHaveCount(0);
  expect((await saved(page)).audit.filter(entry => entry.runId === run.id && entry.eventType === "run_committed")).toHaveLength(1);
});

test("chooses the reuse target explicitly and only offers eligible recording targets from Playbooks", async ({ page }) => {
  await open(page);
  const [source, target, , fresh] = await cases(page);
  const recording = await recordCase(page, source, true);
  const published = await submitAndPublish(page, recording);
  const beforeChoosing = await saved(page);
  await page.getByRole("button", { name: "Reuse on a case", exact: true }).click();
  const reuseDialog = page.getByRole("dialog", { name: "Choose a case to reuse this playbook", exact: true });
  await expect(reuseDialog).toBeVisible();
  // The recorded source is handled; publishing must not silently target it again.
  await expect(reuseDialog.getByRole("button", { name: new RegExp(source.id) })).toHaveCount(0);
  const targetChoice = reuseDialog.getByRole("button", { name: new RegExp(target.id) });
  await expect(targetChoice).toContainText("Select this case");
  await expect(targetChoice).toBeEnabled();
  await noHorizontalOverflow(page);
  await reuseDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(reuseDialog).toHaveCount(0);
  await expect(page.locator(".published-procedure")).toBeVisible();
  expect(await saved(page)).toEqual(beforeChoosing);
  await page.getByRole("button", { name: "Reuse on a case", exact: true }).click();
  await targetChoice.click();
  await expect(reuseDialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: target.guestDisplayName, exact: true })).toBeVisible();
  await expect(page.locator(".workspace-playbook-reference")).toContainText(published.name);
  await expect(page.locator(".workspace-playbook-reference")).toContainText(`v${published.version}`);
  await expect(page.getByRole("button", { name: "Check conditions and prepare", exact: true })).toBeVisible();
  expect(await saved(page)).toEqual(beforeChoosing);
  await page.getByRole("button", { name: "Check conditions and prepare", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Proposed changes", exact: true })).toBeVisible();
  const beforeRecordingChoice = await saved(page);
  const activeRun = beforeRecordingChoice.runsById[beforeRecordingChoice.activeRunIdByCaseId[target.id]];
  expect(activeRun).toMatchObject({ caseId: target.id, playbookId: published.id, playbookVersion: published.version, status: "awaiting_review" });
  await openPublishedPlaybook(page, published);
  await page.getByRole("button", { name: "Reuse on a case", exact: true }).click();
  await expect(targetChoice).toContainText("Review existing proposal");
  await expect(targetChoice).toBeEnabled();
  await targetChoice.click();
  await expect(page.getByRole("heading", { name: "Proposed changes", exact: true })).toBeVisible();
  expect(await saved(page)).toEqual(beforeRecordingChoice);
  await workspace(page, "Playbooks");
  await page.getByRole("button", { name: "Record work", exact: true }).click();
  const recordDialog = page.getByRole("dialog", { name: "Choose a case to record", exact: true });
  await expect(recordDialog).toBeVisible();
  await expect(recordDialog.getByRole("button", { name: new RegExp(source.id) })).toHaveCount(0);
  const reviewingTarget = recordDialog.getByRole("button", { name: new RegExp(target.id) });
  await expect(reviewingTarget).toContainText("Reviewing a proposal");
  await expect(reviewingTarget).toBeDisabled();
  const freshChoice = recordDialog.getByRole("button", { name: new RegExp(fresh.id) });
  await expect(freshChoice).toBeEnabled();
  await freshChoice.click();
  await expect(recordDialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: fresh.guestDisplayName, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record work", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Start recording", exact: true })).toBeEnabled();
  expect(await saved(page)).toEqual(beforeRecordingChoice);
  expect((await saved(page)).recordingId).toBeNull();
});

test("uses only the recorded subset and returns the newest of two independently saved recordings", async ({ page }) => {
  await open(page);
  const [source, target, , other] = await cases(page);
  const first = await recordCase(page, source, true);
  const published = await submitAndPublish(page, first);
  const run = await prepareCase(page, target, published);
  expect(run.commands.map(command => command.type)).toEqual(["set_estimated_arrival", "add_shift_handoff"]);
  expect(run.exactDiff.map(change => change.field)).not.toContain("mealService");
  expect(run.exactDiff.map(change => change.field)).not.toContain("guestMessageDraft");
  expect(run.after.mealService).toBe("regular_dinner");
  expect(run.after.guestMessageDraft).toBeNull();
  await page.getByRole("button", { name: "Approve and apply", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Committed", exact: true })).toBeVisible();
  expect(data(await tool<PreparedRun>(page, "teachback_get_run", { run_id: run.id })).status).toBe("committed");
  const second = await recordCase(page, other, true);
  expect(second.demonstrationId).not.toBe(first.demonstrationId);
  expect(second.caseId).toBe(other.id);
  expect(second.sourceCase.guestDisplayName).toBe(other.guestDisplayName);
  expect(data(await tool<DemonstrationData>(page, "teachback_get_demonstration", { demonstration_id: first.demonstrationId })).caseId).toBe(source.id);
});

test.describe("facility time-zone rendering", () => {
  test.use({ timezoneId: "America/Los_Angeles" });

  test("recovers a previously saved approval through the UI without asking an agent to apply it", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-08-31T10:00:00.000Z") });
    await open(page);
    expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe("America/Los_Angeles");
    const [source, target] = await cases(page);
    const recording = await recordCase(page, source, true);
    const published = await submitAndPublish(page, recording);
    const run = await prepareCase(page, target, published);
    const approved = await restorePreviouslyApprovedRun(page, run);
    await expect(page.getByText("This exact proposal is approved", { exact: true })).toBeVisible();
    await expect(page.getByText("Valid until: 07:05 PM", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply approved changes", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve and apply", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve only · let agent apply", exact: true })).toHaveCount(0);
    await expect(page.getByText(/Tell the agent.*I approved it/)).toHaveCount(0);
    expect(data(await tool<PreparedRun>(page, "teachback_get_run", { run_id: run.id }))).toEqual(approved);
    expect((await saved(page)).reservations.find(row => row.id === target.id)).toEqual(run.before);
    await page.getByRole("button", { name: "Apply approved changes", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Committed", exact: true })).toBeVisible();
    const applied = data(await tool<PreparedRun>(page, "teachback_get_run", { run_id: run.id }));
    expect(applied.status).toBe("committed");
    expect(applied.approval).toEqual({ ...approved.approval, used: true });
    const persisted = await saved(page);
    expect(persisted.reservations.find(row => row.id === target.id)).toEqual(run.after);
    expect(persisted.audit.filter(entry => entry.runId === run.id && entry.eventType === "run_approved")).toHaveLength(1);
    const committedEvent = persisted.audit.find(entry => entry.runId === run.id && entry.eventType === "run_committed")!;
    expect(committedEvent.actor).toBe("Human");
    await workspace(page, "History");
    const expectedAuditTime = await page.evaluate(
      ({ at, timeZone }) => new Date(at).toLocaleString("en", { timeZone }),
      { at: committedEvent.at, timeZone: persisted.timeZone },
    );
    await expect(page.locator(".core-audit time").first()).toHaveText(expectedAuditTime);
    await page.reload(); await ready(page);
    expect(data(await tool<PreparedRun>(page, "teachback_get_run", { run_id: run.id }))).toEqual(applied);
  });
});

test("expires a restored approval without renewing it and requires a fresh unapproved proposal", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-08-31T10:00:00.000Z") });
  await open(page);
  const [source, target] = await cases(page);
  const recording = await recordCase(page, source, true);
  const published = await submitAndPublish(page, recording);
  const run = await prepareCase(page, target, published);
  const approved = await restorePreviouslyApprovedRun(page, run);
  await expect(page.getByRole("button", { name: "Apply approved changes", exact: true })).toBeVisible();
  await page.clock.fastForward(5 * 60 * 1000 + 1_000);
  await expect(page.getByText("Approval expired", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply approved changes", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve and apply", exact: true })).toHaveCount(0);
  const expiredResult = await tool<PreparedRun>(page, "teachback_get_run", { run_id: run.id });
  expect(expiredResult.code).toBe("APPROVAL_EXPIRED");
  const expired = data(expiredResult);
  expect(expired.approval?.expiresAt).toBe(approved.approval?.expiresAt);
  expect(expired.approval?.used).toBe(false);
  expect((await saved(page)).reservations.find(row => row.id === target.id)).toEqual(run.before);
  expect((await cases(page)).find(row => row.id === target.id)?.handled).toBe(false);
  await page.getByRole("button", { name: "Discard proposal", exact: true }).click();
  await selectCase(page, source);
  const agentActivity = page.locator(".core-feedback").filter({ hasText: "Agent activity for:" });
  await expect(agentActivity).toContainText(target.guestDisplayName);
  await expect(agentActivity).toContainText("Unhandled");
  await expect(agentActivity).not.toContainText(/awaiting (human )?review|I approved it|please continue/i);
  const next = await prepareCase(page, target, published);
  expect(next.id).not.toBe(run.id);
  expect(next.status).toBe("awaiting_review");
  expect(next.approval).toBeNull();
});

test("surfaces failed saves and reset without losing already saved work", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await page.getByLabel("Time", { exact: true }).fill("21:30");
  await page.getByRole("button", { name: "Save arrival", exact: true }).click();
  await expect(page.locator(".core-records li")).toHaveCount(1);
  const original = await saved(page);
  await page.evaluate(key => {
    const originalSetItem = Storage.prototype.setItem;
    (window as TestWindow).__restoreCoreStorage = () => { Storage.prototype.setItem = originalSetItem; };
    Storage.prototype.setItem = function(name: string, value: string) {
      if (name === key) throw new DOMException("Test quota failure", "QuotaExceededError");
      originalSetItem.call(this, name, value);
    };
  }, SESSION_KEY);
  await page.getByLabel("Handoff text", { exact: true }).fill("Saved work must survive a quota error.");
  await page.getByRole("button", { name: "Save handoff", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".core-records li")).toHaveCount(1);
  expect(await saved(page)).toEqual(original);
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Reset session", exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(await saved(page)).toEqual(original);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(() => (window as TestWindow).__restoreCoreStorage?.());
  await page.getByRole("button", { name: "Save handoff", exact: true }).click();
  await expect(page.locator(".core-records li")).toHaveCount(2);
  await page.reload(); await ready(page);
  await expect(page.getByRole("heading", { name: "Recording your work", exact: true })).toBeVisible();
  await expect(page.getByLabel("Handoff text", { exact: true })).toHaveValue("Saved work must survive a quota error.");
});

test("shows manual-copy guidance when the Clipboard API is missing or throws synchronously", async ({ page }) => {
  await open(page);
  const [source] = await cases(page);
  await recordCase(page, source, true);
  const copy = page.getByRole("button", { name: "Copy request for agent", exact: true });
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  });
  await copy.click();
  await expect(page.getByRole("alert")).toHaveText("Select and copy the request above.");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      get() { throw new DOMException("Clipboard blocked", "SecurityError"); },
    });
  });
  await copy.click();
  await expect(page.getByRole("alert")).toHaveText("Select and copy the request above.");
});

test("shows the saved-work error UI when acquiring localStorage throws", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() { throw new DOMException("Storage blocked", "SecurityError"); },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Saved work could not be loaded", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start recording", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys((window as TestWindow).__teachbackTestTools ?? {}))).toEqual([]);
});

test("opens cases directly and keeps legacy records read-only in History", async ({ page }) => {
  const legacy = {
    "teachback-demo-v1": JSON.stringify({ oldAudit: "Retain previous submission evidence" }),
    "teachback-teaching-v4": "{old draft}",
    "teachback-teaching-scenario-version": "",
  };
  await page.addInitScript(records => {
    for (const [key, value] of Object.entries(records)) {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    }
  }, legacy);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start recording", exact: true })).toBeVisible();
  await ready(page);
  await expect(page.getByRole("heading", { name: "Your previous demo records are safe", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "View previous demo records", exact: true })).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), SESSION_KEY)).toBeNull();
  expect(data(await tool<PlaybooksData>(page, "teachback_list_playbooks")).playbooks).toEqual([]);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath("legacy-direct-entry.png"), scale: "css", animations: "disabled" });
  await workspace(page, "History");
  await expect(page.getByRole("heading", { name: "No activity yet", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "View previous demo records", exact: true }).click();
  const archive = page.getByRole("dialog", { name: "Previous demo data", exact: true });
  await expect(archive).toBeVisible();
  await expect(archive.locator("pre")).toHaveText(JSON.stringify({ legacy }, null, 2));
  const downloadPromise = page.waitForEvent("download");
  await archive.getByRole("button", { name: "Export previous data", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("teachback-legacy-backup.json");
  expect(JSON.parse(await readFile((await download.path())!, "utf8"))).toEqual({ legacy });
  expect(await page.evaluate(key => localStorage.getItem(key), SESSION_KEY)).toBeNull();
  await archive.getByRole("button", { name: "Close / 閉じる", exact: true }).click();
  await noHorizontalOverflow(page);
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  await noHorizontalOverflow(page);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(page.getByRole("heading", { name: "操作履歴", exact: true })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath("legacy-history-ja.png"), scale: "css", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "以前のデモの記録を見る", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "前のデモの保存データ", exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("legacy-archive-ja.png"), scale: "css", animations: "disabled" });
  await page.getByRole("dialog").getByRole("button", { name: "Close / 閉じる", exact: true }).click();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await workspace(page, "Cases");
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await page.getByLabel("Time", { exact: true }).fill("21:30");
  await page.getByRole("button", { name: "Save arrival", exact: true }).click();
  const original = await saved(page);
  await page.reload(); await ready(page);
  await expect(page.getByRole("heading", { name: "Recording your work", exact: true })).toBeVisible();
  expect(await saved(page)).toEqual(original);
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await saved(page)).toEqual(original);
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset session", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await saved(page)).demonstrations).toEqual([]);
  expect(await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(legacy))).toEqual(legacy);
  await workspace(page, "History");
  await expect(page.getByRole("button", { name: "View previous demo records", exact: true })).toBeVisible();
});

test("hides the legacy archive action when no previous records exist", async ({ page }) => {
  await open(page);
  await workspace(page, "History");
  await expect(page.getByRole("heading", { name: "No activity yet", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "View previous demo records", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export this session", exact: true })).toBeVisible();
});

test("keeps corrupt current storage blocked and exportable even with legacy records", async ({ page }) => {
  const rawSession = "{broken current work";
  const legacy = { "teachback-demo-v1": '{"old":"untouched"}' };
  await page.addInitScript(({ key, raw, records }) => {
    localStorage.setItem(key, raw);
    for (const [name, value] of Object.entries(records)) localStorage.setItem(name, value);
  }, { key: SESSION_KEY, raw: rawSession, records: legacy });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Saved work could not be loaded", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start recording", exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("button", { name: "History", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => Object.keys((window as TestWindow).__teachbackTestTools ?? {}))).toEqual([]);
  await page.getByRole("button", { name: "Inspect / export saved data", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Saved data", exact: true });
  await expect(dialog).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export saved data", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("teachback-session-backup.json");
  expect(JSON.parse(await readFile((await download.path())!, "utf8"))).toEqual({ legacy, rawSession });
  await dialog.getByRole("button", { name: "Close / 閉じる", exact: true }).click();
  await page.getByRole("button", { name: "Start a new session", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Saved work could not be loaded", exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), SESSION_KEY)).toBe(rawSession);
  expect(await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(legacy))).toEqual(legacy);
});

test("shows draft validation and publication guidance in Japanese", async ({ page }) => {
  await open(page);
  const [source] = await cases(page);
  const recording = await recordCase(page, source, true);
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  const submitted = data(await tool<PlaybookDraft>(page, "teachback_create_draft", {
    demonstration_id: recording.demonstrationId, source_digest: recording.sourceDigest,
    request_id: crypto.randomUUID(), proposal: proposalFrom(recording, "23:00"),
  }));
  expect(submitted.validationIssues.some(issue => issue.code === "BOUNDARY_TOO_WIDE")).toBe(true);
  await page.getByRole("tab", { name: "確認・公開", exact: true }).click();
  await expect(page.getByRole("heading", { name: "公開前に確認が必要です", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("施設の上限は22:00です。それ以前の時刻を指定してください。");
  await expect(page.getByRole("alert")).not.toContainText("The facility limit");
  await expect(page.getByRole("button", { name: "この手順を公開する", exact: true })).toBeDisabled();
  await page.getByRole("tab", { name: "適用条件", exact: true }).click();
  await page.getByLabel("対応する最終到着時刻（22:00まで）", { exact: true }).fill("22:00");
  await page.getByRole("button", { name: "修正して再検査", exact: true }).click();
  await page.getByRole("tab", { name: "確認・公開", exact: true }).click();
  const confirm = page.getByRole("checkbox", { name: "元の対応、変数、適用条件を確認しました", exact: true });
  await expect(confirm).toBeEnabled();
  await confirm.check();
  await page.getByRole("button", { name: "この手順を公開する", exact: true }).click();
  await expect(page.locator(".published-procedure").getByRole("heading", { name: submitted.proposal.name, exact: true })).toBeVisible();
  expect(data(await tool<PlaybooksData>(page, "teachback_list_playbooks")).playbooks[0].boundary.latestArrivalTime).toBe("22:00");
});

test("rejects out-of-bound requests through both UI and tools without changing reservations", async ({ page }) => {
  await open(page);
  const [source, , outside] = await cases(page);
  const recording = await recordCase(page, source, true);
  const published = await submitAndPublish(page, recording);
  await selectCase(page, outside);
  const before = await cases(page);
  await page.getByRole("button", { name: "Check conditions and prepare", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("The requested arrival exceeds this playbook's allowed time.");
  await expect(page.getByRole("alert")).toContainText("A taxi request");
  await expect(page.getByRole("button", { name: "Approve and apply", exact: true })).toHaveCount(0);
  const refused = await tool(page, "teachback_prepare_run", {
    case_id: outside.id, expected_case_version: outside.version,
    playbook_id: published.id, playbook_version: published.version, request_id: crypto.randomUUID(),
  });
  expect(refused.code).toBe("PLAYBOOK_NOT_APPLICABLE");
  expect(refused.issues?.map(issue => issue.code)).toContain("ARRIVAL_AFTER_BOUNDARY");
  expect(refused.issues?.filter(issue => issue.code === "REQUEST_REQUIRES_PERSON").length).toBeGreaterThan(0);
  expect(await cases(page)).toEqual(before);
  const state = await saved(page);
  expect(state.runsById).toEqual({});
  expect(state.audit.filter(entry => entry.eventType === "run_rejected").map(entry => entry.actor)).toEqual(expect.arrayContaining(["Human", "Agent"]));
  expect(state.audit.filter(entry => entry.eventType === "run_policy_refused").map(entry => entry.actor)).toEqual(expect.arrayContaining(["Website"]));
});

test("keeps the current record visible with zero search results and blocks switching its case", async ({ page }) => {
  await open(page);
  const [other, source] = await cases(page);
  await selectCase(page, source);
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await page.getByLabel("Time", { exact: true }).fill(source.requestedArrivalTime!);
  await page.getByRole("button", { name: "Save arrival", exact: true }).click();
  await expect(page.locator(".core-records li")).toHaveCount(1);
  const before = await saved(page);
  const search = page.getByRole("searchbox", { name: "Search reservations", exact: true });
  await search.fill("no-reservation-matches-this-query");
  await expect(page.getByText("No matching reservations. The displayed case has not changed.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: source.guestDisplayName, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save arrival", exact: true })).toBeVisible();
  await search.fill(other.guestDisplayName);
  await page.locator(".core-case-rail").getByRole("button", { name: new RegExp(other.id) }).click();
  await expect(page.getByRole("alert")).toContainText("Finish or cancel the recording before switching cases.");
  await expect(page.getByRole("heading", { name: source.guestDisplayName, exact: true })).toBeVisible();
  expect(await saved(page)).toEqual(before);
  await search.fill("");
  await expect(page.locator(".core-case-rail").getByRole("button", { name: new RegExp(source.id) })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Finish recording", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ask an agent to draft from this work", exact: true })).toBeVisible();
  await selectCase(page, other);
  expect((await saved(page)).reservations.find(row => row.id === source.id)?.estimatedArrivalTime).toBe(source.requestedArrivalTime);
});

test("keeps typed recording edits when leaving is cancelled and requires saving them before finishing", async ({ page }) => {
  await open(page);
  const [source] = await cases(page);
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await page.getByLabel("Time", { exact: true }).fill(source.requestedArrivalTime!);
  await page.getByRole("button", { name: "Save arrival", exact: true }).click();
  await expect(page.locator(".core-records li")).toHaveCount(1);
  const savedBeforeTyping = await saved(page);
  const message = `Hello ${source.guestDisplayName}, reception expects you at ${source.requestedArrivalTime}.`;
  const messageField = page.getByLabel("Message to the guest", { exact: true });
  await messageField.fill(message);
  const finish = page.getByRole("button", { name: "Finish recording", exact: true });
  await expect(finish).toBeDisabled();
  await expect(page.getByText("You have unsaved edits. Save each changed field before finishing the recording.", { exact: true })).toBeVisible();
  await workspace(page, "Playbooks");
  const dialog = page.getByRole("dialog", { name: "You have unsaved changes", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(messageField).toHaveValue(message);
  expect(await saved(page)).toEqual(savedBeforeTyping);
  await page.getByRole("button", { name: "Save message draft", exact: true }).click();
  await expect(page.locator(".core-records li")).toHaveCount(2);
  await expect(finish).toBeEnabled();
  await finish.click();
  await expect(page.getByRole("heading", { name: "Ask an agent to draft from this work", exact: true })).toBeVisible();
  const recording = data(await tool<DemonstrationData>(page, "teachback_get_demonstration"));
  expect(recording.commands).toHaveLength(2);
  expect(recording.commands.find(command => command.type === "draft_guest_message")?.input).toEqual({ text: message });
});

test("allows only one editing tab and resumes saved work after its owner closes", async ({ page, context }) => {
  await open(page);
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await page.getByLabel("Time", { exact: true }).fill("21:30");
  await page.getByRole("button", { name: "Save arrival", exact: true }).click();
  await expect(page.locator(".core-records li")).toHaveCount(1);
  const original = await saved(page);
  const otherTab = await context.newPage();
  try {
    await otherTab.goto("/");
    await expect(otherTab.getByRole("heading", { name: "Teachback is open in another tab", exact: true })).toBeVisible();
    await expect(otherTab.getByRole("button", { name: "Start recording", exact: true })).toHaveCount(0);
    await expect(otherTab.getByRole("button", { name: "Save arrival", exact: true })).toHaveCount(0);
    expect(await saved(otherTab)).toEqual(original);
    await page.close();
    await otherTab.getByRole("button", { name: "Reload", exact: true }).click();
    await expect(otherTab.getByRole("heading", { name: "Recording your work", exact: true })).toBeVisible();
    expect((await saved(otherTab)).recordingId).toBe(original.recordingId);
    await otherTab.getByLabel("Handoff text", { exact: true }).fill("The new owner continued the existing recording.");
    await otherTab.getByRole("button", { name: "Save handoff", exact: true }).click();
    await expect(otherTab.locator(".core-records li")).toHaveCount(2);
  } finally { await otherTab.close(); }
});

test("restores an in-progress recording on its own case instead of the first reservation", async ({ page }) => {
  await open(page);
  const [first, , , source] = await cases(page);
  await selectCase(page, source);
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await page.getByLabel("Time", { exact: true }).fill(source.requestedArrivalTime!);
  await page.getByRole("button", { name: "Save arrival", exact: true }).click();
  await expect(page.locator(".core-records li")).toHaveCount(1);
  const handoff = `${source.guestDisplayName}'s saved handoff must stay with their case.`;
  await page.getByLabel("Handoff text", { exact: true }).fill(handoff);
  await page.getByRole("button", { name: "Save handoff", exact: true }).click();
  await expect(page.locator(".core-records li")).toHaveCount(2);
  const original = await saved(page);
  await page.reload(); await ready(page);
  await expect(page.getByRole("heading", { name: source.guestDisplayName, exact: true })).toBeVisible();
  await expect(page.locator(".core-case-rail").getByRole("button", { name: new RegExp(source.id) })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Recording your work", exact: true })).toBeVisible();
  await expect(page.getByLabel("Time", { exact: true })).toHaveValue(source.requestedArrivalTime!);
  await expect(page.getByLabel("Handoff text", { exact: true })).toHaveValue(handoff);
  await expect(page.locator(".core-records li")).toHaveCount(2);
  expect((await saved(page)).recordingId).toBe(original.recordingId);
  await page.getByLabel("Message to the guest", { exact: true }).fill(`Hello ${source.guestDisplayName}.`);
  await page.getByRole("button", { name: "Save message draft", exact: true }).click();
  await expect(page.locator(".core-records li")).toHaveCount(3);
  const updated = await saved(page);
  expect(updated.reservations.find(row => row.id === source.id)?.guestMessageDraft).toBe(`Hello ${source.guestDisplayName}.`);
  expect(updated.reservations.find(row => row.id === first.id)).toEqual(original.reservations.find(row => row.id === first.id));
  expect(updated.demonstrations.find(recording => recording.id === original.recordingId)?.commands.every(command => command.caseId === source.id)).toBe(true);
});

test("resets saved and unsaved form values even when the same reservation remains selected", async ({ page }) => {
  await open(page);
  const [source] = await cases(page);
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await page.getByLabel("Time", { exact: true }).fill("21:05");
  await page.getByRole("button", { name: "Save arrival", exact: true }).click();
  await expect(page.locator(".core-records li")).toHaveCount(1);
  await page.getByLabel("Message to the guest", { exact: true }).fill("This saved message belongs to the old session.");
  await page.getByRole("button", { name: "Save message draft", exact: true }).click();
  await expect(page.locator(".core-records li")).toHaveCount(2);
  const previousRecordingId = (await saved(page)).recordingId;
  await page.getByLabel("Message to the guest", { exact: true }).fill("This unsaved replacement must not survive reset.");
  await page.getByLabel("Handoff text", { exact: true }).fill("An unsaved handoff from the old session.");
  await page.getByLabel("Date", { exact: true }).fill("2026-09-01");
  await page.getByLabel("Time", { exact: true }).fill("23:12");
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset session", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: source.guestDisplayName, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await expect(page.getByLabel("Date", { exact: true })).toHaveValue(source.requestedArrivalDate!);
  await expect(page.getByLabel("Time", { exact: true })).toHaveValue(source.plannedArrivalTime);
  await expect(page.getByLabel("Message to the guest", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Handoff text", { exact: true })).toHaveValue("");
  await expect(page.locator(".core-records li")).toHaveCount(0);
  const restarted = await saved(page);
  expect(restarted.recordingId).not.toBe(previousRecordingId);
  expect(restarted.demonstrations).toHaveLength(1);
  expect(restarted.reservations.find(row => row.id === source.id)).toMatchObject({ version: 1, estimatedArrivalDate: null, estimatedArrivalTime: null, guestMessageDraft: null, shiftHandoff: null });
});

test("discards only unsaved recording inputs and closes cancellation when the same case is restarted", async ({ page }) => {
  await open(page);
  const [source] = await cases(page);
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await page.getByLabel("Time", { exact: true }).fill("21:05");
  await page.getByRole("button", { name: "Save arrival", exact: true }).click();
  await expect(page.locator(".core-records li")).toHaveCount(1);
  const message = "This saved guest message must remain after cancellation.";
  const handoff = "This saved shift handoff must remain after cancellation.";
  await page.getByLabel("Message to the guest", { exact: true }).fill(message);
  await page.getByRole("button", { name: "Save message draft", exact: true }).click();
  await expect(page.locator(".core-records li")).toHaveCount(2);
  await page.getByLabel("Handoff text", { exact: true }).fill(handoff);
  await page.getByRole("button", { name: "Save handoff", exact: true }).click();
  await expect(page.locator(".core-records li")).toHaveCount(3);
  const before = await saved(page);
  const savedReservation = before.reservations.find(row => row.id === source.id)!;
  await page.getByLabel("Date", { exact: true }).fill("2026-09-01");
  await page.getByLabel("Time", { exact: true }).fill("23:12");
  await page.getByLabel("Message to the guest", { exact: true }).fill("Discard this unsaved guest message.");
  await page.getByLabel("Handoff text", { exact: true }).fill("Discard this unsaved shift handoff.");
  await page.getByRole("button", { name: "Cancel recording", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Unsaved edits will be discarded.");
  await page.getByRole("button", { name: "Keep saved work and cancel", exact: true }).click();
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await expect.soft(page.getByLabel("Date", { exact: true })).toHaveValue(savedReservation.estimatedArrivalDate!);
  await expect.soft(page.getByLabel("Time", { exact: true })).toHaveValue("21:05");
  await expect.soft(page.getByLabel("Message to the guest", { exact: true })).toHaveValue(message);
  await expect.soft(page.getByLabel("Handoff text", { exact: true })).toHaveValue(handoff);
  await expect.soft(page.getByRole("button", { name: "Keep saved work and cancel", exact: true })).toHaveCount(0);
  await expect(page.locator(".core-records li")).toHaveCount(0);
  const restarted = await saved(page);
  expect(restarted.recordingId).not.toBe(before.recordingId);
  expect(restarted.demonstrations.find(row => row.id === before.recordingId)?.status).toBe("cancelled");
  expect(restarted.reservations.find(row => row.id === source.id)).toEqual(savedReservation);
});

test("guards sidebar and back navigation while manual draft JSON is unsaved", async ({ page }) => {
  await open(page);
  const [source] = await cases(page);
  const recording = await recordCase(page, source, true);
  await page.getByText("Enter a draft manually without an agent", { exact: true }).click();
  const json = page.getByRole("textbox", { name: "Proposal JSON", exact: true });
  const input = JSON.stringify({ ...proposalFrom(recording), name: "Manual text still being reviewed" }, null, 2);
  await json.fill(input);
  const before = await saved(page);
  const dialog = page.getByRole("dialog", { name: "You have unsaved changes", exact: true });
  await workspace(page, "History");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(json).toHaveValue(input);
  await page.getByRole("button", { name: "Back to playbooks", exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(json).toHaveValue(input);
  expect(await saved(page)).toEqual(before);
  await page.getByRole("button", { name: "Back to playbooks", exact: true }).click();
  await dialog.getByRole("button", { name: "Discard edits and leave", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("region", { name: "Recorded work", exact: true }).getByRole("button", { name: new RegExp(source.id) }).click();
  await page.getByText("Enter a draft manually without an agent", { exact: true }).click();
  await expect(json).toHaveValue("");
  expect(await saved(page)).toEqual(before);
});

test("keeps unsaved manual draft JSON when an agent draft arrives for the same recording", async ({ page }) => {
  await open(page);
  const [source] = await cases(page);
  const recording = await recordCase(page, source, true);
  await page.getByText("Enter a draft manually without an agent", { exact: true }).click();
  const json = page.getByRole("textbox", { name: "Proposal JSON", exact: true });
  const incomplete = '{ "name": "Still writing this manual draft",';
  await json.fill(incomplete);
  const agentProposal = { ...proposalFrom(recording), name: "Agent draft received in the background" };
  const agentDraft = data(await tool<PlaybookDraft>(page, "teachback_create_draft", {
    demonstration_id: recording.demonstrationId, source_digest: recording.sourceDigest,
    request_id: crypto.randomUUID(), proposal: agentProposal,
  }));
  await expect(json).toBeVisible();
  await expect(json).toHaveValue(incomplete);
  await expect(page.getByRole("heading", { name: "Ask an agent to draft from this work", exact: true })).toBeVisible();
  expect((await saved(page)).drafts.find(row => row.id === agentDraft.id)?.proposal).toEqual(agentProposal);
  // A failed parse must not clear the unsaved-input guard either.
  await page.getByRole("button", { name: "Validate manual draft", exact: true }).click();
  await workspace(page, "History");
  const dialog = page.getByRole("dialog", { name: "You have unsaved changes", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(json).toHaveValue(incomplete);
  const manualProposal = { ...agentProposal, name: "Completed manual draft" };
  await json.fill(JSON.stringify(manualProposal, null, 2));
  await page.getByRole("button", { name: "Validate manual draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: manualProposal.name, exact: true })).toBeVisible();
  await expect(page.getByText("Human-authored draft", { exact: true })).toBeVisible();
  await workspace(page, "History");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Audit trail", exact: true })).toBeVisible();
  expect((await saved(page)).drafts).toHaveLength(2);
});

test("preserves Enter and blank lines while typing open questions and saves separate questions", async ({ page }) => {
  await open(page);
  const [source] = await cases(page);
  const recording = await recordCase(page, source, true);
  const draft = data(await tool<PlaybookDraft>(page, "teachback_create_draft", {
    demonstration_id: recording.demonstrationId, source_digest: recording.sourceDigest,
    request_id: crypto.randomUUID(), proposal: proposalFrom(recording),
  }));
  await editorTab(page, "Conditions");
  const questions = page.getByRole("textbox", { name: "Open questions (one per line)", exact: true });
  const first = "Who should review the arrival cutoff?";
  const second = "What should the evening shift verify?";
  await questions.fill(first);
  await questions.press("End");
  await questions.press("Enter");
  await expect(questions).toHaveValue(`${first}\n`);
  await questions.press("Enter");
  await questions.pressSequentially(second);
  await expect(questions).toHaveValue(`${first}\n\n${second}`);
  await questions.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("open-questions-editing.png"), scale: "css" });
  await editorTab(page, "Operations");
  await editorTab(page, "Conditions");
  await expect(questions).toHaveValue(`${first}\n\n${second}`);
  await page.getByRole("button", { name: "Save changes and validate", exact: true }).click();
  await expect.poll(async () => (await saved(page)).drafts.find(row => row.id === draft.id)?.proposal.unresolvedQuestions).toEqual([first, second]);
  await expect(questions).toHaveValue(`${first}\n${second}`);
  await workspace(page, "History");
  await expect(page.getByRole("dialog", { name: "You have unsaved changes", exact: true })).toHaveCount(0);
});

test("opens the exact draft returned by an idempotent create retry instead of the most recent draft", async ({ page }) => {
  await open(page);
  const [source] = await cases(page);
  const recording = await recordCase(page, source, true);
  const firstProposal = { ...proposalFrom(recording), name: "First agent draft" };
  const firstInput = {
    demonstration_id: recording.demonstrationId, source_digest: recording.sourceDigest,
    request_id: crypto.randomUUID(), proposal: firstProposal,
  };
  const first = data(await tool<PlaybookDraft>(page, "teachback_create_draft", firstInput));
  await expect(page.getByRole("heading", { name: firstProposal.name, exact: true })).toBeVisible();
  const secondProposal = { ...firstProposal, name: "Second agent draft" };
  const second = data(await tool<PlaybookDraft>(page, "teachback_create_draft", { ...firstInput, request_id: crypto.randomUUID(), proposal: secondProposal }));
  expect(second.id).not.toBe(first.id);
  await expect(page.getByRole("heading", { name: secondProposal.name, exact: true })).toBeVisible();
  const retried = data(await tool<PlaybookDraft>(page, "teachback_create_draft", firstInput));
  expect(retried.id).toBe(first.id);
  await expect(page.getByRole("heading", { name: firstProposal.name, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: secondProposal.name, exact: true })).toHaveCount(0);
  await editorTab(page, "Review & publish");
  await expect(page.getByLabel("Playbook name", { exact: true })).toHaveValue(firstProposal.name);
  const state = await saved(page);
  expect(state.drafts).toHaveLength(2);
  expect(state.drafts.find(row => row.id === first.id)?.proposal).toEqual(firstProposal);
  expect(state.drafts.find(row => row.id === second.id)?.proposal).toEqual(secondProposal);
});

test("shows one operation at a time and keeps unsaved wording and conditions when switching tabs", async ({ page }) => {
  await open(page);
  const [source] = await cases(page);
  const recording = await recordCase(page, source);
  const originalDemonstration = (await saved(page)).demonstrations.find(row => row.id === recording.demonstrationId);
  const proposal = proposalFrom(recording);
  const draft = data(await tool<PlaybookDraft>(page, "teachback_create_draft", {
    demonstration_id: recording.demonstrationId, source_digest: recording.sourceDigest,
    request_id: crypto.randomUUID(), proposal,
  }));
  await expect(page.getByRole("tab", { name: "Operations", exact: true })).toHaveAttribute("aria-selected", "true");
  const operationList = page.getByRole("navigation", { name: "Playbook operations", exact: true });
  await expect(operationList.getByRole("button")).toHaveCount(4);
  await expect(page.locator(".draft-comparison")).toHaveCount(1);
  const orderedOperations = ["Update arrival", "Prepare meal box", "Draft guest message", "Add shift handoff"];
  for (const [index, operation] of orderedOperations.entries()) {
    await expect(page.getByRole("heading", { name: operation, exact: true })).toBeVisible();
    await expect(operationList.getByRole("button", { name: new RegExp(operation) })).toHaveAttribute("aria-current", "step");
    if (index < orderedOperations.length - 1) {
      await expect(page.getByRole("button", { name: "Review conditions", exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "Next operation", exact: true }).click();
    }
  }
  await expect(page.getByRole("button", { name: "Next operation", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Review conditions", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Conditions", exact: true })).toHaveAttribute("aria-selected", "true");
  await editorTab(page, "Operations");
  await operationList.getByRole("button", { name: /Draft guest message/ }).click();
  const originalText = recording.commands.find(command => command.type === "draft_guest_message")!;
  expect("text" in originalText.input).toBe(true);
  if (!("text" in originalText.input)) throw new Error("Expected a recorded text command");
  await expect(page.locator(".draft-comparison")).toContainText(originalText.input.text);
  await page.getByRole("button", { name: "Edit reusable wording", exact: true }).click();
  const wording = page.getByRole("textbox", { name: /^Reusable wording/ });
  const originalWording = await wording.inputValue();
  const unsavedWording = `${originalWording} This wording still needs review.`;
  await wording.fill(unsavedWording);
  await expect(page.getByRole("button", { name: "Next operation", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save changes and validate", exact: true })).toBeVisible();
  await operationList.getByRole("button", { name: /Add shift handoff/ }).click();
  await expect(page.getByRole("heading", { name: "Add shift handoff", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Draft guest message", exact: true })).toHaveCount(0);
  await operationList.getByRole("button", { name: /Draft guest message/ }).click();
  await expect(wording).toHaveValue(unsavedWording);
  await editorTab(page, "Conditions");
  const boundary = page.getByLabel("Latest arrival (no later than 22:00)", { exact: true });
  await boundary.fill("21:40");
  await editorTab(page, "Operations");
  await expect(wording).toHaveValue(unsavedWording);
  await expect(page.locator(".draft-comparison")).toContainText(originalText.input.text);
  await editorTab(page, "Review & publish");
  const confirmation = page.getByRole("checkbox", { name: "I reviewed the recorded work, bindings and boundary", exact: true });
  const publish = page.getByRole("button", { name: "Publish this playbook", exact: true });
  await expect(confirmation).toBeDisabled();
  await expect(publish).toBeDisabled();
  await expect(page.getByText("Save and validate your edits first.", { exact: true })).toBeVisible();
  expect((await saved(page)).drafts.find(row => row.id === draft.id)?.proposal).toEqual(proposal);
  expect((await saved(page)).playbooks).toEqual([]);
  await workspace(page, "History");
  const leaveDialog = page.getByRole("dialog", { name: "You have unsaved changes", exact: true });
  await expect(leaveDialog).toBeVisible();
  await leaveDialog.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(leaveDialog).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Review & publish", exact: true })).toHaveAttribute("aria-selected", "true");
  await editorTab(page, "Operations");
  // Restore the semantic wording before validating; no invented text is published.
  await wording.fill(originalWording);
  await editorTab(page, "Conditions");
  await expect(boundary).toHaveValue("21:40");
  await page.getByRole("button", { name: "Save changes and validate", exact: true }).click();
  await editorTab(page, "Review & publish");
  await expect(confirmation).toBeEnabled();
  await expect(confirmation).not.toBeChecked();
  await expect(publish).toBeDisabled();
  const after = await saved(page);
  expect(after.drafts.find(row => row.id === draft.id)?.proposal.proposedBoundary.latestArrivalTime).toBe("21:40");
  expect(after.drafts.find(row => row.id === draft.id)?.proposal.steps).toEqual(proposal.steps);
  expect(after.demonstrations.find(row => row.id === recording.demonstrationId)).toEqual(originalDemonstration);
  await noHorizontalOverflow(page);
});

test("keeps a manually authored draft selected when another agent draft arrives for the same recording", async ({ page }) => {
  await open(page);
  const [source] = await cases(page);
  const recording = await recordCase(page, source, true);
  const manualProposal = { ...proposalFrom(recording), name: "Human-authored first draft" };
  await page.getByText("Enter a draft manually without an agent", { exact: true }).click();
  await page.getByLabel("Proposal JSON", { exact: true }).fill(JSON.stringify(manualProposal, null, 2));
  await page.getByRole("button", { name: "Validate manual draft", exact: true }).click();
  await expect(page.getByText("Human-authored draft", { exact: true })).toBeVisible();
  await editorTab(page, "Review & publish");
  const name = page.getByLabel("Playbook name", { exact: true });
  await expect(name).toHaveValue(manualProposal.name);
  await name.fill("Human local edits remain attached to the first draft");
  const manualDraft = (await saved(page)).drafts.find(row => row.createdBy === "Human")!;
  const agentProposal = { ...manualProposal, name: "A separate agent draft" };
  const agentDraft = data(await tool<PlaybookDraft>(page, "teachback_create_draft", {
    demonstration_id: recording.demonstrationId, source_digest: recording.sourceDigest,
    request_id: crypto.randomUUID(), proposal: agentProposal,
  }));
  expect(agentDraft.id).not.toBe(manualDraft.id);
  await expect(name).toHaveValue("Human local edits remain attached to the first draft");
  await expect(page.getByText("Human-authored draft", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "This draft changed while you were editing", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publish this playbook", exact: true })).toBeDisabled();
  const after = await saved(page);
  expect(after.drafts).toHaveLength(2);
  expect(after.drafts.find(row => row.id === manualDraft.id)?.proposal).toEqual(manualProposal);
  expect(after.drafts.find(row => row.id === agentDraft.id)?.proposal).toEqual(agentProposal);
  expect(after.playbooks).toEqual([]);
});

test("preserves local edits when an agent revises the same draft and requires reviewing the latest version", async ({ page }) => {
  await open(page);
  const [source] = await cases(page);
  const recording = await recordCase(page, source, true);
  const proposal = proposalFrom(recording);
  const draft = data(await tool<PlaybookDraft>(page, "teachback_create_draft", {
    demonstration_id: recording.demonstrationId, source_digest: recording.sourceDigest,
    request_id: crypto.randomUUID(), proposal,
  }));
  await editorTab(page, "Review & publish");
  const name = page.getByLabel("Playbook name", { exact: true });
  const confirmation = page.getByRole("checkbox", { name: "I reviewed the recorded work, bindings and boundary", exact: true });
  const publish = page.getByRole("button", { name: "Publish this playbook", exact: true });
  await name.fill("Human edits that must not disappear");
  const remoteProposal = { ...proposal, name: "Agent revision to review", proposedBoundary: { latestArrivalTime: "21:40" } };
  const remote = data(await tool<PlaybookDraft>(page, "teachback_update_draft", {
    draft_id: draft.id, expected_revision: draft.revision, request_id: crypto.randomUUID(), proposal: remoteProposal,
  }));
  await expect(page.getByRole("heading", { name: "This draft changed while you were editing", exact: true })).toBeVisible();
  await expect(name).toHaveValue("Human edits that must not disappear");
  await expect(name).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save changes and validate", exact: true })).toBeDisabled();
  await expect(confirmation).toBeDisabled();
  await expect(publish).toBeDisabled();
  expect((await saved(page)).drafts.find(row => row.id === draft.id)?.proposal).toEqual(remoteProposal);
  expect((await saved(page)).playbooks).toEqual([]);
  await page.getByRole("button", { name: "Discard local edits and load latest draft", exact: true }).click();
  await expect(name).toHaveValue(remoteProposal.name);
  await expect(page.getByRole("heading", { name: "This draft changed while you were editing", exact: true })).toHaveCount(0);
  await expect(confirmation).toBeEnabled();
  await expect(confirmation).not.toBeChecked();
  await confirmation.check();
  await expect(publish).toBeEnabled();
  // Even a clean remote update invalidates a confirmation of the prior revision.
  const cleanProposal = { ...remoteProposal, name: "Latest clean proposal" };
  data(await tool<PlaybookDraft>(page, "teachback_update_draft", {
    draft_id: draft.id, expected_revision: remote.revision, request_id: crypto.randomUUID(), proposal: cleanProposal,
  }));
  await expect(name).toHaveValue(cleanProposal.name);
  await expect(confirmation).not.toBeChecked();
  await expect(publish).toBeDisabled();
  expect((await saved(page)).playbooks).toEqual([]);
});

test("requires saving and re-reviewing JSON edits made after the confirmation checkbox was checked", async ({ page }) => {
  await open(page);
  const [source] = await cases(page);
  const recording = await recordCase(page, source, true);
  const proposal = proposalFrom(recording);
  const draft = data(await tool<PlaybookDraft>(page, "teachback_create_draft", {
    demonstration_id: recording.demonstrationId, source_digest: recording.sourceDigest,
    request_id: crypto.randomUUID(), proposal,
  }));
  await editorTab(page, "Review & publish");
  const confirm = page.getByRole("checkbox", { name: "I reviewed the recorded work, bindings and boundary", exact: true });
  const publish = page.getByRole("button", { name: "Publish this playbook", exact: true });
  await confirm.check();
  await expect(publish).toBeEnabled();
  await page.getByText("Edit structured proposal", { exact: true }).click();
  const edited = { ...proposal, name: "A revision that still needs review" };
  await page.getByLabel("Proposal JSON", { exact: true }).fill(JSON.stringify(edited, null, 2));
  await expect(confirm).not.toBeChecked();
  await expect(confirm).toBeDisabled();
  await expect(publish).toBeDisabled();
  await expect(page.getByText("Save and validate your edits first.", { exact: true })).toBeVisible();
  const unmodified = await saved(page);
  expect(unmodified.drafts.find(row => row.id === draft.id)?.proposal).toEqual(proposal);
  expect(unmodified.playbooks).toEqual([]);
  await page.getByRole("button", { name: "Validate and save structured proposal", exact: true }).click();
  await expect(confirm).toBeEnabled();
  await expect(confirm).not.toBeChecked();
  await expect(publish).toBeDisabled();
  await expect(page.getByLabel("Playbook name", { exact: true })).toHaveValue(edited.name);
  await confirm.check();
  await publish.click();
  await expect(page.locator(".published-procedure").getByRole("heading", { name: edited.name, exact: true })).toBeVisible();
  expect(data(await tool<PlaybooksData>(page, "teachback_list_playbooks")).playbooks[0].name).toBe(edited.name);
});

test("keeps draft provenance separate from the selected case and returns to that case", async ({ page }) => {
  await open(page);
  const [source, selected] = await cases(page);
  const recording = await recordCase(page, source, true);
  data(await tool<PlaybookDraft>(page, "teachback_create_draft", {
    demonstration_id: recording.demonstrationId, source_digest: recording.sourceDigest,
    request_id: crypto.randomUUID(), proposal: proposalFrom(recording),
  }));
  await selectCase(page, selected);
  await expect(page.getByRole("heading", { name: selected.guestDisplayName, exact: true })).toBeVisible();
  await workspace(page, "Playbooks");
  await page.getByRole("region", { name: "Drafts", exact: true }).getByRole("button", { name: /Recorded reception response/ }).click();
  // Opening the draft never presents the separately selected case as its source.
  await expect(page.getByRole("tab", { name: "Operations", exact: true })).toBeVisible();
  await expect(page.locator(".draft-editor")).toContainText(source.guestDisplayName);
  await expect(page.locator(".draft-editor")).toContainText(source.id);
  await expect(page.getByRole("heading", { name: selected.guestDisplayName, exact: true })).toHaveCount(0);
  await expect(page.locator(".core-case-rail")).toHaveCount(0);
  await workspace(page, "Cases");
  await expect(page.getByRole("heading", { name: selected.guestDisplayName, exact: true })).toBeVisible();
  await expect(page.locator(".core-case-rail").getByRole("button", { name: new RegExp(selected.id) })).toHaveAttribute("aria-pressed", "true");
});

test("publishes a reviewed second version without modifying the first published version", async ({ page }) => {
  await open(page);
  const [source, target, , fresh] = await cases(page);
  const recording = await recordCase(page, source, true);
  const first = await submitAndPublish(page, recording);
  expect(first.version).toBe(1);
  const activeFirstVersion = await prepareCase(page, target, first);
  await openPublishedPlaybook(page, first);
  await page.getByRole("button", { name: "Create the next version", exact: true }).click();
  await editorTab(page, "Conditions");
  await expect(page.getByLabel("Latest arrival (no later than 22:00)", { exact: true })).toHaveValue("22:00");
  await page.getByLabel("Latest arrival (no later than 22:00)", { exact: true }).fill("21:40");
  await page.getByRole("button", { name: "Save changes and validate", exact: true }).click();
  await editorTab(page, "Review & publish");
  const confirm = page.getByRole("checkbox", { name: "I reviewed the recorded work, bindings and boundary", exact: true });
  await expect(confirm).toBeEnabled();
  await confirm.check();
  await page.getByRole("button", { name: "Publish this playbook", exact: true }).click();
  await expect(page.locator(".published-procedure").getByRole("heading", { name: first.name, exact: true })).toBeVisible();
  const published = data(await tool<PlaybooksData>(page, "teachback_list_playbooks")).playbooks;
  expect(published.filter(book => book.id === first.id)).toHaveLength(2);
  expect(published.find(book => book.id === first.id && book.version === 1)).toEqual(first);
  const second = published.find(book => book.id === first.id && book.version === 2)!;
  expect(second).toMatchObject({ sourceDemonstrationId: first.sourceDemonstrationId, sourceDigest: first.sourceDigest, publishedBy: "Human", boundary: { latestArrivalTime: "21:40" } });
  expect(second.steps).toEqual(first.steps);
  expect(second.contentDigest).not.toBe(first.contentDigest);
  await page.getByRole("button", { name: "Reuse on a case", exact: true }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a case to reuse this playbook", exact: true });
  const conflictingTarget = chooser.getByRole("button", { name: new RegExp(target.id) });
  await expect(conflictingTarget).toContainText("Reviewing another playbook");
  await expect(conflictingTarget).toBeDisabled();
  await expect(chooser.getByRole("button", { name: new RegExp(source.id) })).toHaveCount(0);
  const freshChoice = chooser.getByRole("button", { name: new RegExp(fresh.id) });
  await expect(freshChoice).toBeEnabled();
  await freshChoice.click();
  await expect(page.getByRole("heading", { name: fresh.guestDisplayName, exact: true })).toBeVisible();
  await expect(page.locator(".workspace-playbook-reference")).toContainText("v2");
  await expect(page.locator(".workspace-playbook-reference")).not.toContainText("v1");
  const afterChoosing = await saved(page);
  expect(afterChoosing.runsById[activeFirstVersion.id]).toEqual(activeFirstVersion);
  expect(afterChoosing.activeRunIdByCaseId[target.id]).toBe(activeFirstVersion.id);
  expect(afterChoosing.activeRunIdByCaseId[fresh.id]).toBeUndefined();
  await openPublishedPlaybook(page, first);
  await expect(page.locator(".published-procedure").getByText("v1 · Published", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "View latest version", exact: true })).toBeVisible();
  await editorTab(page, "Conditions");
  await expect(page.locator(".published-procedure .core-meta")).toContainText("22:00");
  await page.getByRole("button", { name: "View latest version", exact: true }).click();
  await expect(page.locator(".published-procedure").getByText("v2 · Published", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "View latest version", exact: true })).toHaveCount(0);
  await editorTab(page, "Conditions");
  await expect(page.locator(".published-procedure .core-meta")).toContainText("21:40");
  await page.reload(); await ready(page);
  const restored = data(await tool<PlaybooksData>(page, "teachback_list_playbooks")).playbooks;
  expect(restored.find(book => book.version === 1)).toEqual(first);
  expect(restored.find(book => book.version === 2)).toEqual(second);
});

test("opens reset by keyboard, contains Tab focus and restores the trigger after Escape or Cancel", async ({ page }) => {
  await open(page);
  const trigger = page.getByRole("button", { name: "Reset demo", exact: true });
  const before = await page.evaluate(key => localStorage.getItem(key), SESSION_KEY);
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Start a fresh session?", exact: true })).toBeVisible();
  // Cross the end of the dialog's four controls, not just its first Tab stop.
  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press("Tab");
    await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(key => localStorage.getItem(key), SESSION_KEY)).toBe(before);
});
