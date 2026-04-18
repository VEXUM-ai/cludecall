import type { Page } from "playwright";

import { getServerConfig } from "@/lib/env";
import { appointmentToolLogger } from "@/lib/appointment-tool/logger";
import { apotoolSelectors } from "@/lib/appointment-tool/apotool-rpa/selectors";

async function waitForApotoolPageReady(page: Page, timeout = 15000) {
  await page.waitForLoadState("domcontentloaded", { timeout }).catch(() => undefined);
  await page.waitForLoadState("load", { timeout }).catch(() => undefined);
}

async function findClinicRowIndex(page: Page, clinicName: string) {
  const rows = await page.locator("tr").evaluateAll((elements) =>
    elements.map((element, index) => ({
      index,
      text: (element.textContent ?? "").replace(/\s+/g, " ").trim(),
    }))
  );

  return rows.find((row) => row.text.includes(clinicName))?.index ?? -1;
}

async function waitForPostLoginReady(page: Page, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const url = page.url();
    if (url.includes("/calendar")) {
      return;
    }

    if (url.includes("/offices")) {
      const clinicRowCount = await page.locator("tr").count().catch(() => 0);
      if (clinicRowCount > 2) {
        return;
      }
    }

    const emailInput = page.locator(apotoolSelectors.login.emailInput).first();
    const emailVisible =
      (await emailInput.count().catch(() => 0)) > 0 &&
      (await emailInput.isVisible().catch(() => false));
    if (!emailVisible && !url.includes("/login")) {
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error("Timed out waiting for the authenticated Apotool page.");
}

async function waitForClinicRowIndex(page: Page, clinicName: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const rowIndex = await findClinicRowIndex(page, clinicName);
    if (rowIndex >= 0) {
      return rowIndex;
    }
    await page.waitForTimeout(1000);
  }

  return -1;
}

export async function loginToApotool(page: Page) {
  const config = getServerConfig();
  if (!config.apotoolEmail || !config.apotoolPassword) {
    throw new Error("APOTOOL_EMAIL / APOTOOL_PASSWORD are required for the Apotool RPA adapter.");
  }

  appointmentToolLogger.info("Logging into Apotool.");
  await page.goto(config.apotoolLoginUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await waitForApotoolPageReady(page, 10000);

  const emailInput = page.locator(apotoolSelectors.login.emailInput);
  await emailInput.waitFor({ state: "visible", timeout: 10000 });
  await emailInput.fill(config.apotoolEmail);

  const passwordInput = page.locator(apotoolSelectors.login.passwordInput);
  await passwordInput.fill(config.apotoolPassword);

  const submitButton = page.locator(apotoolSelectors.login.submitButton);
  await submitButton.click();
  await waitForPostLoginReady(page, 30000);
  await waitForApotoolPageReady(page, 10000);
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
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const rowIndex = await waitForClinicRowIndex(page, config.apotoolClinicName);
    if (rowIndex < 0) {
      appointmentToolLogger.warn("Clinic row not found.", {
        url: page.url(),
        clinicName: config.apotoolClinicName,
        attempt: attempt + 1,
      });
      continue;
    }

    const targetButton = page.locator("tr").nth(rowIndex).locator("button").first();
    await targetButton.click();

    await page.waitForTimeout(500);
    await page
      .waitForURL((nextUrl) => nextUrl.toString().includes("/calendar"), { timeout: 20000 })
      .catch(() => undefined);
    await waitForApotoolPageReady(page, 10000);

    const targetDateVisible = await page
      .locator("#target_date")
      .isVisible({ timeout: 15000 })
      .catch(() => false);
    if (targetDateVisible) {
      await page.waitForTimeout(2000);
      return;
    }
  }

  appointmentToolLogger.warn("Failed to land on the Apotool calendar after clinic selection.", {
    clinicName: config.apotoolClinicName,
    url: page.url(),
  });
}
