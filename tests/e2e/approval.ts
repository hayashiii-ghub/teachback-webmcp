import type { Page } from "@playwright/test";
import { UI_COPY, type UiLocale } from "../../src/i18n";

export async function approveForAgent(page: Page, locale: UiLocale = "en") {
  const options = page.locator(".agent-approval-options");
  if (await options.getAttribute("open") === null) await options.locator("summary").click();
  await options.getByRole("button", { name: UI_COPY[locale].approvePreview, exact: true }).click();
}
