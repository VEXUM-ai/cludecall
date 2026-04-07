import { config } from "../config.js";
import { selectors } from "./selectors.js";
import { logger } from "../utils/logger.js";

/** アポツールにログインする */
export async function loginToApotool(page) {
    logger.info("アポツールにログイン中...");

    await page.goto(config.apotoolLoginUrl, { waitUntil: "networkidle" });

    // メールアドレス入力
    const emailInput = page.locator(selectors.login.emailInput);
    await emailInput.waitFor({ state: "visible", timeout: 10000 });
    await emailInput.fill(config.apotoolEmail);

    // パスワード入力
    const passwordInput = page.locator(selectors.login.passwordInput);
    await passwordInput.fill(config.apotoolPassword);

    // ログインボタンクリック
    const submitButton = page.locator(selectors.login.submitButton);
    await submitButton.click();

    // ログイン後のページ遷移を待つ
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    logger.info("ログイン成功");
}

/** クリニックを選択する（選択画面が表示された場合のみ） */
export async function selectClinic(page) {
    const url = page.url();

    // カレンダーに直接遷移した場合はスキップ
    if (url.includes("/calendar")) {
        logger.info("カレンダー画面に直接遷移 → クリニック選択スキップ");
        return;
    }

    logger.info(`クリニック選択: ${config.apotoolClinicName}`);

    // 「管理画面へ」ボタンを探してクリック
    const manageButton = page.locator(
        `a:has-text("管理画面へ"), button:has-text("管理画面へ")`
    );
    const buttonCount = await manageButton.count();

    if (buttonCount > 0) {
        // 複数クリニックがある場合、対象クリニックの行の「管理画面へ」をクリック
        // えみは総合歯科の行を探す
        const targetRow = page.locator(`tr:has-text("${config.apotoolClinicName}"), div:has-text("${config.apotoolClinicName}")`).first();
        const targetButton = targetRow.locator('a:has-text("管理画面へ"), button:has-text("管理画面へ")').first();

        if (await targetButton.count() > 0) {
            await targetButton.click();
        } else {
            // 2番目の「管理画面へ」ボタン（えみは総合歯科は2行目）
            await manageButton.nth(1).click();
        }

        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(2000);
        logger.info("クリニック選択完了 → カレンダー画面");
    } else {
        logger.warn("クリニック選択画面が見つかりません。現在のURL:", url);
    }
}
