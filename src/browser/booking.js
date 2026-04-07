import { logger } from "../utils/logger.js";
import { takeErrorScreenshot } from "./session-manager.js";
import { addMinutes } from "../utils/time-slots.js";

/**
 * 治療前TC（30分）を登録する
 * メニュー1: 初診（60分）、メニュー2: 治療前TC（30分）
 */
export async function registerTC(page, params) {
    logger.info(`TC登録開始: ${params.patient_name_kana} ${params.tc_start_time} ${params.tc_unit}`);

    try {
        await clickCalendarCell(page, params.tc_unit, params.tc_start_time);
        await page.waitForTimeout(2000);

        await clickNewPatientLink(page);
        await fillNewPatientName(page, params.patient_name_kana, params.phone_number);

        const endTime = addMinutes(params.tc_start_time, 30);
        await setTimeRange(page, params.tc_start_time, endTime);

        // メニュー1: 初診（60分）を先に選択（メニュー2が動的にロードされる）
        await selectDropdownByName(page, "menu_id", "初診   (60分)");
        await page.waitForTimeout(1500); // メニュー2のロードを待つ

        // メニュー2: 治療前TC（30分）
        await selectDropdownByName(page, "menu2_id", "治療前TC");

        // 担当1: WEB
        await selectDropdownByName(page, "staff_id", "WEB");

        // ユニットはクリックしたセルから自動設定 → スキップ

        await clickRegisterButton(page);

        logger.info("TC登録完了");
        return { success: true };
    } catch (error) {
        logger.error("TC登録失敗:", error.message);
        await takeErrorScreenshot("tc-register-error");
        return { success: false, error: error.message };
    }
}

/**
 * 初診（60分）を登録する
 * メニュー1: 初診（60分）、メニュー2: 空欄
 */
export async function registerTreatment(page, params) {
    logger.info(`初診登録開始: ${params.patient_name_kana} ${params.treatment_start_time} ${params.treatment_unit}`);

    try {
        await clickCalendarCell(page, params.treatment_unit, params.treatment_start_time);
        await page.waitForTimeout(2000);

        await clickNewPatientLink(page);
        await fillNewPatientName(page, params.patient_name_kana, "");

        const endTime = addMinutes(params.treatment_start_time, 60);
        await setTimeRange(page, params.treatment_start_time, endTime);

        // メニュー1: 初診（60分）
        await selectDropdownByName(page, "menu_id", "初診   (60分)");

        // メニュー2: 空欄（何も選択しない）

        // 担当1: WEB
        await selectDropdownByName(page, "staff_id", "WEB");

        // ユニットは自動設定 → スキップ

        await clickRegisterButton(page);

        logger.info("初診登録完了");
        return { success: true };
    } catch (error) {
        logger.error("初診登録失敗:", error.message);
        await takeErrorScreenshot("treatment-register-error");
        return { success: false, error: error.message };
    }
}

/**
 * 予約登録オーケストレーター（TC → 初診の2回登録）
 */
export async function bookAppointment(page, params) {
    logger.info(`予約登録開始: ${params.patient_name_kana}`);

    // 1回目: TC登録
    const tcResult = await registerTC(page, {
        patient_name_kana: params.patient_name_kana,
        phone_number: params.phone_number,
        tc_start_time: params.tc_start_time,
        tc_unit: params.tc_unit,
    });

    if (!tcResult.success) {
        return {
            success: false,
            message: "予約登録に失敗しました。後ほどスタッフからご連絡いたします。",
            tc_orphaned: false,
        };
    }

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // 2回目: 初診登録
    const treatResult = await registerTreatment(page, {
        patient_name_kana: params.patient_name_kana,
        phone_number: params.phone_number,
        treatment_start_time: params.treatment_start_time,
        treatment_unit: params.treatment_unit,
    });

    if (!treatResult.success) {
        logger.warn("TC登録済みだが初診登録に失敗。手動フォローアップが必要。");
        return {
            success: false,
            message: "予約登録に失敗しました。後ほどスタッフからご連絡いたします。",
            tc_orphaned: true,
        };
    }

    logger.info("予約登録完了（TC + 初診）");
    return { success: true, message: "予約登録が完了しました", tc_orphaned: false };
}

// ─── ヘルパー関数 ───

/** カレンダーの特定カラム・時間のセルをスクロール+クリック */
async function clickCalendarCell(page, columnName, time) {
    const colIndex = getColumnIndex(columnName);
    const [hour, minute] = time.split(":");
    const timeStr = `${parseInt(hour)}:${minute}`;

    const scrolled = await page.evaluate(({ timeStr, colIndex }) => {
        for (const row of document.querySelectorAll("tr")) {
            const th = row.querySelector("th");
            if (!th || th.textContent.trim() !== timeStr) continue;
            const tds = row.querySelectorAll("td");
            if (tds.length > colIndex) {
                tds[colIndex].scrollIntoView({ block: "center" });
                return true;
            }
        }
        return false;
    }, { timeStr, colIndex });

    if (!scrolled) throw new Error(`セルが見つかりません: ${columnName} ${time}`);
    await page.waitForTimeout(500);

    const cellBox = await page.evaluate(({ timeStr, colIndex }) => {
        for (const row of document.querySelectorAll("tr")) {
            const th = row.querySelector("th");
            if (!th || th.textContent.trim() !== timeStr) continue;
            const tds = row.querySelectorAll("td");
            if (tds.length > colIndex) {
                const rect = tds[colIndex].getBoundingClientRect();
                return { x: rect.x + rect.width - 5, y: rect.y + 5 };
            }
        }
        return null;
    }, { timeStr, colIndex });

    if (!cellBox) throw new Error(`セル座標取得失敗: ${columnName} ${time}`);

    await page.mouse.click(cellBox.x, cellBox.y);
    await page.waitForTimeout(1000);

    const dialogTitle = await page.evaluate(() => {
        for (const t of document.querySelectorAll(".ui-dialog-title")) {
            if (t.offsetParent !== null) return t.textContent.trim();
        }
        return null;
    });

    if (dialogTitle === "予約編集") {
        logger.warn("既存予約のダイアログ。閉じて再試行...");
        await page.evaluate(() => {
            for (const btn of document.querySelectorAll(".ui-dialog-titlebar-close")) {
                if (btn.offsetParent !== null) { btn.click(); break; }
            }
        });
        await page.waitForTimeout(500);
        throw new Error(`セル ${columnName} ${time} は予約済みです`);
    }

    logger.debug(`セルクリック: ${columnName} ${time} → 「${dialogTitle}」`);
}

/** カラム名からインデックスを取得 */
function getColumnIndex(columnName) {
    if (columnName.includes("①")) return 0;
    if (columnName.includes("②")) return 1;
    if (columnName.includes("③")) return 2;
    if (columnName.includes("④")) return 3;
    if (columnName.includes("⑤")) return 4;
    if (columnName.includes("カウンセリング")) return 5;
    if (columnName.includes("初診")) return 6;
    throw new Error(`不明なカラム名: ${columnName}`);
}

/** 「新患登録」リンクをクリック */
async function clickNewPatientLink(page) {
    const clicked = await page.evaluate(() => {
        for (const el of document.querySelectorAll("a, span, button")) {
            if (el.textContent.trim() === "新患登録" && el.offsetParent !== null) {
                el.click();
                return true;
            }
        }
        return false;
    });
    if (!clicked) throw new Error("「新患登録」リンクが見つかりません");
    await page.waitForTimeout(1000);
}

/** 新規患者名と電話番号を入力 */
async function fillNewPatientName(page, name, phone) {
    const nameInput = page.locator('input[name="new_patient_name"]');
    await nameInput.waitFor({ state: "visible", timeout: 3000 });
    await nameInput.fill(name);

    if (phone) {
        const phoneInput = page.locator('input[name="patient_tel"]');
        if (await phoneInput.count() > 0) {
            await phoneInput.fill(phone);
        }
    }

    await nameInput.press("Enter");
    await page.waitForTimeout(1500);
    logger.debug(`患者名入力: ${name}`);
}

/** ドロップダウンからオプションを選択（部分一致、ただし先頭一致優先） */
async function selectDropdownByName(page, name, optionText) {
    const select = page.locator(`select[name="${name}"]`).first();
    await select.waitFor({ state: "visible", timeout: 5000 });

    const value = await select.evaluate((sel, text) => {
        // まず完全一致を試す
        for (const opt of sel.options) {
            if (opt.text.trim() === text) return opt.value;
        }
        // 次にテキストの先頭が一致するものを探す（空白を正規化）
        const normalized = text.replace(/\s+/g, "");
        for (const opt of sel.options) {
            const optNormalized = opt.text.trim().replace(/\s+/g, "");
            if (optNormalized.startsWith(normalized) || optNormalized === normalized) return opt.value;
        }
        // 最後に部分一致
        for (const opt of sel.options) {
            if (opt.text.includes(text)) return opt.value;
        }
        return null;
    }, optionText);

    if (value === null) {
        // デバッグ: 利用可能なオプションを出力
        const options = await select.evaluate((sel) =>
            Array.from(sel.options).map((o) => o.text.trim()).filter((t) => t.length > 0)
        );
        logger.warn(`オプション一覧 (${name}): ${options.join(" | ")}`);
        throw new Error(`オプション "${optionText}" が見つかりません（name: ${name}）`);
    }

    await select.selectOption(value);
    logger.debug(`ドロップダウン選択: ${name} → ${optionText}`);
}

/** 開始・終了時間を設定 */
async function setTimeRange(page, startTime, endTime) {
    const [startH, startM] = startTime.split(":");
    const [endH, endM] = endTime.split(":");

    await page.locator('select[name="starts_at_hr"]').first().selectOption(startH);
    await page.locator('select[name="starts_at_mi"]').first().selectOption(startM);
    await page.locator('select[name="ends_at_hr"]').first().selectOption(endH);

    // 終了分は "15（15分）" 形式の場合がある
    const endMinSelect = page.locator('select[name="ends_at_mi"]').first();
    const endMinValue = await endMinSelect.evaluate((sel, targetMin) => {
        for (const opt of sel.options) {
            if (opt.value === targetMin || opt.text.startsWith(targetMin)) return opt.value;
        }
        return null;
    }, endM);

    if (endMinValue) {
        await endMinSelect.selectOption(endMinValue);
    }

    logger.debug(`時間設定: ${startTime} 〜 ${endTime}`);
}

/** 登録ボタンをクリック */
async function clickRegisterButton(page) {
    const clicked = await page.evaluate(() => {
        for (const btn of document.querySelectorAll("button, input[type=submit], a")) {
            const text = btn.textContent.trim().replace(/\s+/g, "");
            if (text === "登録" && btn.offsetParent !== null) {
                if (text.includes("連続") || text.includes("新患")) continue;
                btn.click();
                return true;
            }
        }
        return false;
    });
    if (!clicked) throw new Error("登録ボタンが見つかりません");

    await page.waitForTimeout(3000);
    await page.waitForLoadState("networkidle");
    logger.debug("登録ボタンクリック完了");
}
