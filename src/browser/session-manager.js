import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../utils/logger.js";
import { loginToApotool, selectClinic } from "./login.js";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.resolve(__dirname, "../../playwright-state");
const SCREENSHOT_DIR = path.resolve(__dirname, "../../screenshots");

let browser = null;
let context = null;
let page = null;
let healthCheckInterval = null;

/** ブラウザを起動し、ログイン済みページを返す */
export async function initialize() {
    logger.info("ブラウザセッションを初期化中...");

    browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    context = await browser.newContext({
        locale: "ja-JP",
        timezoneId: "Asia/Tokyo",
        viewport: { width: 1920, height: 1080 },
    });

    page = await context.newPage();
    page.setDefaultTimeout(15000);

    await loginToApotool(page);
    await selectClinic(page);

    startHealthCheck();
    logger.info("ブラウザセッション初期化完了");
    return page;
}

/** 現在のページを取得（未初期化なら初期化） */
export async function getPage() {
    if (!page || page.isClosed()) {
        await initialize();
    }
    return page;
}

/** ログイン状態を確認し、切れていたら再ログイン */
export async function ensureLoggedIn() {
    try {
        const p = await getPage();
        const url = p.url();

        if (url.includes("/login") || url === "about:blank") {
            logger.warn("セッション切れを検知。再ログイン中...");
            await loginToApotool(p);
            await selectClinic(p);
            logger.info("再ログイン完了");
        }
        return p;
    } catch (error) {
        logger.error("セッション復旧に失敗:", error.message);
        await cleanup();
        return await initialize();
    }
}

/** 定期ヘルスチェック（5分ごと） */
function startHealthCheck() {
    if (healthCheckInterval) clearInterval(healthCheckInterval);

    healthCheckInterval = setInterval(async () => {
        try {
            await ensureLoggedIn();
            logger.debug("ヘルスチェック: OK");
        } catch (error) {
            logger.error("ヘルスチェック失敗:", error.message);
        }
    }, 5 * 60 * 1000);
}

/** エラー時のスクリーンショット保存 */
export async function takeErrorScreenshot(name) {
    try {
        const p = await getPage();
        const filename = `${name}-${Date.now()}.png`;
        await p.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: true });
        logger.info(`スクリーンショット保存: ${filename}`);
        return filename;
    } catch (error) {
        logger.error("スクリーンショット保存失敗:", error.message);
        return null;
    }
}

/** ブラウザを終了 */
export async function cleanup() {
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
    }
    if (page && !page.isClosed()) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    page = null;
    context = null;
    browser = null;
    logger.info("ブラウザセッションをクリーンアップ");
}
