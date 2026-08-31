import { expect, type Page } from "@playwright/test";
import { UI_COPY, type UiLocale } from "../../src/i18n";

export async function resetDemo(page: Page, locale: UiLocale = "en") {
  const copy = UI_COPY[locale];
  await page.getByRole("button", { name: copy.resetDemo, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: copy.resetConfirmTitle, exact: true });
  await dialog.getByRole("button", { name: copy.resetConfirm, exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
