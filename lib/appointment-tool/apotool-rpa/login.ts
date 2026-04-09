import type { Page } from "playwright";

import { getServerConfig } from "@/lib/env";
import { appointmentToolLogger } from "@/lib/appointment-tool/logger";
import { apotoolSelectors } from "@/lib/appointment-tool/apotool-rpa/selectors";

export async function loginToApotool(page: Page) {
  const config = getServerConfig();
  if (!config.apotoolEmail || !config.apotoolPassword) {
    throw new Error("APOTOOL_EMAIL / APOTOOL_PASSWORD are required for the Apotool RPA adapter.");
  }

  appointmentToolLogger.info("Logging into Apotool.");
  await page.goto(config.apotoolLoginUrl, { waitUntil: "networkidle" });

  const emailInput = page.locator(apotoolSelectors.login.emailInput);
  await emailInput.waitFor({ state: "visible", timeout: 10000 });
  await emailInput.fill(config.apotoolEmail);

  const passwordInput = page.locator(apotoolSelectors.login.passwordInput);
  await passwordInput.fill(config.apotoolPassword);

  const submitButton = page.locator(apotoolSelectors.login.submitButton);
  await submitButton.click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3000);
}

export async function selectClinic(page: Page) {
  const config = getServerConfig();
  const url = page.url();

  if (url.includes("/calendar")) {
    appointmentToolLogger.info("Already on Apotool calendar page.");
    return;
  }

  appointmentToolLogger.info("Selecting clinic", config.apotoolClinicName);
  const manageButton = page.locator('a:has-text("管理画面へ"), button:has-text("管理画面へ")');
  const buttonCount = await manageButton.count();

  if (buttonCount === 0) {
    appointmentToolLogger.warn("Clinic selection button not found.", url);
    return;
  }

  const targetRow = page
    .locator(`tr:has-text("${config.apotoolClinicName}"), div:has-text("${config.apotoolClinicName}")`)
    .first();
  const targetButton = targetRow
    .locator('a:has-text("管理画面へ"), button:has-text("管理画面へ")')
    .first();

  if ((await targetButton.count()) > 0) {
    await targetButton.click();
  } else {
    await manageButton.nth(Math.min(1, buttonCount - 1)).click();
  }

  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
}
