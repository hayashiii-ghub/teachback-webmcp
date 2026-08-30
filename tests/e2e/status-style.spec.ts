import { expect, test } from "@playwright/test";
import { UI_COPY } from "../../src/i18n";

function contrast(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const rgb = hex.trim().replace("#", "").match(/.{2}/g)!.map((part) => {
      const value = parseInt(part, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

for (const locale of ["en", "ja"] as const) {
  test(`keeps ${locale} teaching typography consistent at each step`, async ({ page }, testInfo) => {
    const copy = UI_COPY[locale];
    await page.goto("/");
    await page.getByRole("button", { name: "Reset demo", exact: true }).click();
    if (locale === "ja") await page.getByRole("button", { name: "日本語", exact: true }).click();
    await page.getByRole("button", { name: /R-2050\s+Sofia Rossi/ }).click();
    await page.getByRole("button", { name: copy.teachThisCase, exact: true }).click();

    const family = locale === "ja" ? /Yu Mincho/ : /Iowan Old Style/;
    const record = page.locator(".teaching-record li strong").first();
    const progress = page.locator(".journey-steps strong").first();
    await expect(record).toHaveCSS("font-family", family);
    await expect(record).toHaveCSS("font-weight", "500");
    await expect(record).toHaveCSS("line-height", "28px");
    await expect(progress).toHaveCSS("font-family", family);
    await expect(progress).toHaveCSS("font-weight", "500");
    await expect(page.locator(".teaching-record li > span").first()).toHaveCSS("font-weight", "400");
    await expect(page.locator(".journey-steps li > span").first()).toHaveCSS("font-weight", "400");
    await page.locator(".teaching-record").screenshot({ path: testInfo.outputPath("record.png") });
    await page.locator(".teaching-rule-panel").screenshot({ path: testInfo.outputPath("steps.png") });

    await page.getByRole("button", { name: copy.createAgentDraft, exact: true }).click();
    await expect(page.getByRole("button", { name: copy.publishPlaybook, exact: true })).toBeDisabled();
    await expect(page.locator(".boundary-section-heading strong")).toHaveCSS("font-family", family);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("draft.png"), fullPage: true });

    if (testInfo.project.name === "desktop") {
      await page.setViewportSize({ width: 980, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("draft-tablet.png"), fullPage: true });
    }
  });

  test(`keeps ${locale} approval states legible and expiry distinct`, async ({ page }, testInfo) => {
    const copy = UI_COPY[locale];
    await page.goto("/");
    await page.getByRole("button", { name: "Reset demo", exact: true }).click();
    if (locale === "ja") await page.getByRole("button", { name: "日本語", exact: true }).click();
    await page.clock.install();
    await page.getByRole("button", { name: copy.preparePreview, exact: true }).click();

    const tokens = await page.locator(".app-shell").evaluate((element) => {
      const style = getComputedStyle(element);
      return Object.fromEntries(["--accent", "--accent-dark", "--success", "--bg", "--attention-bg", "--muted"]
        .map((name) => [name, style.getPropertyValue(name).trim()]));
    });
    for (const foreground of ["--success", "--accent", "--accent-dark", "--muted"]) {
      expect(contrast(tokens[foreground], tokens["--bg"])).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast("#ffffff", tokens["--accent"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens["--accent-dark"], tokens["--attention-bg"])).toBeGreaterThanOrEqual(4.5);

    await page.getByRole("button", { name: copy.approvePreview, exact: true }).click();
    const heading = page.locator(".approval-status-title strong");
    await expect(heading).toHaveText(copy.approvedReady);
    await expect(heading).toHaveCSS("font-weight", "500");
    await expect(heading).toHaveCSS("font-family", locale === "ja" ? /Yu Mincho/ : /Iowan Old Style/);
    await page.locator(".review-panel").screenshot({ path: testInfo.outputPath("approved-panel.png") });

    await page.clock.fastForward(5 * 60 * 1000 + 100);
    const expired = page.locator(".expired-status");
    await expect(expired).toHaveText(copy.approvalExpired);
    await expect(expired).toHaveCSS("font-weight", "500");
    await expect(expired).toHaveCSS("border-left-width", "0px");
    await expect(page.locator(".criteria-complete-summary")).toHaveClass(/is-stale/);
    await expect(page.getByRole("button", { name: copy.prepareAgain, exact: true })).toBeVisible();
    const colors = await page.locator(".criteria-complete-summary, .expired-status").evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).color));
    expect(colors[0]).not.toBe(colors[1]);
    const alignment = await page.locator(".criteria-complete-summary, .review-actions")
      .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().left));
    expect(alignment[0]).toBe(alignment[1]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator(".review-panel").screenshot({ path: testInfo.outputPath("expired-panel.png") });
    await page.screenshot({ path: testInfo.outputPath("expired-page.png"), fullPage: true });
  });
}
