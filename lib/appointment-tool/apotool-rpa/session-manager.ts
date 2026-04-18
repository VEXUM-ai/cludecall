import { promises as fs } from "node:fs";
import path from "node:path";

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import { getAppointmentScreenshotDir } from "@/lib/appointment-tool/audit";
import { appointmentToolLogger } from "@/lib/appointment-tool/logger";
import { getServerConfig } from "@/lib/env";
import { loginToApotool, selectClinic } from "@/lib/appointment-tool/apotool-rpa/login";

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;
let healthCheckInterval: NodeJS.Timeout | null = null;

async function launchBrowser() {
  const config = getServerConfig();
  browser = await chromium.launch({
    headless: config.apotoolHeadless,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  context = await browser.newContext({
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    viewport: { width: 1920, height: 1080 },
  });
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  return page;
}

export async function initializeApotoolSession() {
  appointmentToolLogger.info("Initializing Apotool browser session.");
  const currentPage = await launchBrowser();
  await loginToApotool(currentPage);
  await selectClinic(currentPage);
  startHealthCheck();
  return currentPage;
}

export async function getApotoolPage() {
  if (!page || page.isClosed()) {
    return initializeApotoolSession();
  }
  return page;
}

export async function ensureLoggedIn() {
  try {
    const currentPage = await getApotoolPage();
    const url = currentPage.url();

    if (url.includes("/login") || url === "about:blank") {
      appointmentToolLogger.warn("Apotool session appears logged out. Re-authenticating.");
      await loginToApotool(currentPage);
      await selectClinic(currentPage);
    }

    return currentPage;
  } catch (error) {
    appointmentToolLogger.error("Apotool session recovery failed.", error);
    await cleanupApotoolSession();
    return initializeApotoolSession();
  }
}

function startHealthCheck() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  healthCheckInterval = setInterval(() => {
    void ensureLoggedIn().catch((error) => {
      appointmentToolLogger.error("Apotool health check failed.", error);
    });
  }, 5 * 60 * 1000);
}

export async function takeErrorScreenshot(name: string) {
  try {
    const currentPage = await getApotoolPage();
    const screenshotDir = getAppointmentScreenshotDir();
    await fs.mkdir(screenshotDir, { recursive: true });
    const filePath = path.join(screenshotDir, `${name}-${Date.now()}.png`);
    await currentPage.screenshot({ path: filePath, fullPage: true });
    return filePath;
  } catch (error) {
    appointmentToolLogger.error("Failed to capture Apotool screenshot.", error);
    return null;
  }
}

export async function cleanupApotoolSession() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }

  if (page && !page.isClosed()) {
    await page.close().catch(() => undefined);
  }
  if (context) {
    await context.close().catch(() => undefined);
  }
  if (browser) {
    await browser.close().catch(() => undefined);
  }

  browser = null;
  context = null;
  page = null;
}

export function getApotoolSessionState() {
  return {
    browserReady: Boolean(browser),
    contextReady: Boolean(context),
    pageReady: Boolean(page && !page.isClosed()),
  };
}
