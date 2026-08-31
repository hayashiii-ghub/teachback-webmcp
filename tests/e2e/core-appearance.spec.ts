import { expect, test, type Locator, type Page } from "@playwright/test";

// Each Playwright test owns a fresh context. This registration-only shim makes
// connection styling deterministic; it does not invoke tools or simulate an AI.
const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", error => errors.push(`[pageerror] ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") errors.push(`[console.error] ${message.text()}`);
  });
  await page.addInitScript(() => {
    localStorage.setItem("teachback-ui-locale-v1", "en");
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool() {} },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main navigation", exact: true })).toBeVisible();
  await expect(page.locator(".workspace-connection")).toHaveAccessibleName("WebMCP connected");
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? [], "No page errors or console.error during the appearance flow").toEqual([]);
});

async function expectFontRole(locator: Locator, role: "editorial" | "ui") {
  const families = await locator.evaluateAll((elements, role) => elements.map(element => {
    const style = getComputedStyle(element);
    const normalize = (value: string) => value.replace(/[\s"']/g, "").toLowerCase();
    // Resolve through CSSOM on both sides: WebKit/Chromium may canonicalize
    // aliases such as BlinkMacSystemFont to system-ui in computed font-family.
    const probe = document.createElement("span");
    probe.style.setProperty(`--font-${role}`, style.getPropertyValue(`--font-${role}`));
    probe.style.fontFamily = `var(--font-${role})`;
    element.parentElement!.append(probe);
    const expected = normalize(getComputedStyle(probe).fontFamily);
    probe.remove();
    return {
      actual: normalize(style.fontFamily),
      expected,
    };
  }), role);
  expect(families.length, `At least one ${role} element is rendered`).toBeGreaterThan(0);
  for (const family of families) expect(family.actual, `Use the shared ${role} typeface`).toBe(family.expected);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document, "The workspace must not create page-wide horizontal scrolling").toBeLessThanOrEqual(dimensions.viewport);
}

async function expectRecordingTypography(page: Page) {
  await expectFontRole(page.locator(".workspace-nav button"), "ui");
  await expectFontRole(page.locator(".core-fields legend"), "editorial");
  await expectFontRole(page.locator(".core-fields .core-secondary"), "editorial");
  await expectFontRole(page.locator(".core-fields input, .core-fields textarea"), "ui");
}

async function startFirstRecording(page: Page) {
  await page.getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("button", { name: "Playbooks", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No playbooks yet", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record the first response", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose a case to record", exact: true });
  await picker.getByRole("button", { name: /R-2041.*Aiko Tanaka/ }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Aiko Tanaka", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recording your work", exact: true })).toBeVisible();
}

test("keeps navigation, connection status and recording fields within narrow and wide viewports", async ({ page }) => {
  await startFirstRecording(page);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const locale of ["en", "ja"] as const) {
      await test.step(`${width}px / ${locale}`, async () => {
        await page.getByRole("button", { name: locale === "en" ? "EN" : "日本語", exact: true }).click();
        await expect(page.locator(".core-app")).toHaveAttribute("data-locale", locale);
        await expectNoHorizontalOverflow(page);
        await expectRecordingTypography(page);

        const icons = page.locator(".workspace-nav button svg");
        await expect(icons).toHaveCount(3);
        for (const icon of await icons.all()) {
          await expect(icon).toHaveCSS("width", width <= 650 ? "18px" : "23px");
          await expect(icon).toHaveAttribute("aria-hidden", "true");
        }
        const connection = page.locator(".workspace-connection");
        await expect(connection).toHaveAccessibleName(locale === "en" ? "WebMCP connected" : "WebMCP 接続済み");
        if (width > 650) {
          const label = await connection.locator("span").evaluate(element => {
            const range = document.createRange();
            range.selectNodeContents(element);
            const bounds = element.getBoundingClientRect();
            const button = element.closest("button")!.getBoundingClientRect();
            // React renders the prefix and translated status as separate text
            // nodes. Multiple rectangles at the same top are still one line.
            const lineTops: number[] = [];
            for (const rect of range.getClientRects()) {
              if (!lineTops.some(top => Math.abs(top - rect.top) <= 1)) lineTops.push(rect.top);
            }
            return { lines: lineTops.length, left: bounds.left, right: bounds.right, buttonLeft: button.left, buttonRight: button.right };
          });
          expect(label.lines, "Connection status stays on one intentional line").toBe(1);
          expect(label.left).toBeGreaterThanOrEqual(label.buttonLeft);
          expect(label.right).toBeLessThanOrEqual(label.buttonRight + 1);
        }
      });
    }
  }
});

test("preserves native recording controls, blank-draft guards and dialog focus in both languages", async ({ page }, testInfo) => {
  const connection = page.locator(".workspace-connection");
  await connection.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "WebMCP connection", exact: true });
  const close = dialog.getByRole("button", { name: "Close / 閉じる", exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "View audit trail", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(connection).toBeFocused();
  await page.keyboard.press("Enter");
  await close.click();
  await expect(dialog).toHaveCount(0);
  await expect(connection).toBeFocused();

  await startFirstRecording(page);
  const date = page.getByLabel("Date", { exact: true });
  const time = page.getByLabel("Time", { exact: true });
  await expect(date).toHaveAttribute("type", "date");
  await expect(time).toHaveAttribute("type", "time");
  await expect(page.getByRole("button", { name: "Save message draft", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save handoff", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Finish recording", exact: true })).toBeDisabled();
  await time.fill("21:30");
  await page.getByRole("button", { name: "Save arrival", exact: true }).click();
  await expect(page.locator(".core-records li")).toHaveCount(1);
  await expect(page.locator(".core-records li")).toContainText("21:30");
  await expect(page.getByRole("button", { name: "Finish recording", exact: true })).toBeEnabled();

  for (const locale of ["en", "ja"] as const) {
    await page.getByRole("button", { name: locale === "en" ? "EN" : "日本語", exact: true }).click();
    await expect(page.locator(".core-app")).toHaveAttribute("data-locale", locale);
    await expect(page.getByLabel(locale === "en" ? "Time" : "時刻", { exact: true })).toHaveValue("21:30");
    await expect(page.getByRole("button", { name: locale === "en" ? "Save message draft" : "案内文の下書きを保存", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: locale === "en" ? "Save handoff" : "引き継ぎを保存", exact: true })).toBeDisabled();
    await expectRecordingTypography(page);
    await expectNoHorizontalOverflow(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(page.locator(".workspace-nav")).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`recording-${locale}.png`), fullPage: true, animations: "disabled" });
  }
});
