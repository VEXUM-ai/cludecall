import { logger } from "../utils/logger.js";
import { config } from "../config.js";

/** カラム名の定義 */
export const COLUMNS = {
    TREATMENT: ["①治療", "②治療", "③治療", "④t/s", "⑤t/s"],
    TC: ["カウンセリング", "初診・待合"],
    ALL: ["①治療", "②治療", "③治療", "④t/s", "⑤t/s", "カウンセリング", "初診・待合"],
};

export const COLUMN_INDEX_MAP = {
    "①治療": 0,
    "②治療": 1,
    "③治療": 2,
    "④t/s": 3,
    "⑤t/s": 4,
    "カウンセリング": 5,
    "初診・待合": 6,
};

const COLUMN_NAMES = ["①治療", "②治療", "③治療", "④t/s", "⑤t/s", "カウンセリング", "初診・待合"];

/** 日付ナビゲーション: ›ボタンで日送り */
export async function navigateToDate(page, dateString) {
    logger.info(`カレンダー遷移: ${dateString}`);

    const [year, month, day] = dateString.split("-").map(Number);

    // 現在の表示日を取得
    const currentDate = await page.evaluate(() => {
        for (const el of document.querySelectorAll("*")) {
            const m = el.textContent.trim().match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
            if (m && el.children.length < 3) {
                return { year: parseInt(m[1]), month: parseInt(m[2]), day: parseInt(m[3]) };
            }
        }
        return null;
    });

    if (!currentDate) {
        logger.warn("現在の日付を取得できません");
        return;
    }

    // 日数差を計算
    const current = new Date(currentDate.year, currentDate.month - 1, currentDate.day);
    const target = new Date(year, month - 1, day);
    const diffDays = Math.round((target - current) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        logger.info("既に正しい日付です");
        return;
    }

    // ›（次の日）または‹（前の日）をクリック
    const buttonText = diffDays > 0 ? "›" : "‹";
    const btn = page.locator(`a.btn:has-text("${buttonText}")`).first();
    const clicks = Math.abs(diffDays);

    logger.info(`${clicks}日${diffDays > 0 ? "進め" : "戻し"}ます`);

    for (let i = 0; i < clicks; i++) {
        await btn.click();
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(1500);
    }

    logger.info(`カレンダー遷移完了: ${dateString}`);
}

/**
 * カレンダーグリッドを読み取り、各カラムの占有状況を返す
 * a.waku要素のdata-minutes + height から正確な占有範囲を計算
 * @returns {Map<string, Set<string>>} カラム名 → 占有されている15分スロットのSet
 */
export async function readCalendarGrid(page) {
    logger.info("カレンダーグリッドを読み取り中...");

    // 全a.waku要素の情報を取得（キャンセル済み・休診日を除外）
    const appointments = await page.evaluate(() => {
        const appts = document.querySelectorAll("a.waku");
        return Array.from(appts).map((a) => {
            const minutes = parseInt(a.dataset.minutes);
            const inner = a.querySelector(".inner");
            if (!inner) return null;

            const height = parseInt(inner.style.height) || 0;
            const cellHeight = 80; // 各セルの高さ = 15分
            const durationCells = Math.round(height / cellHeight);
            const durationMin = durationCells * 15;

            // キャンセル済み（bg_gray）や休診日（closed）の予約は除外
            const classes = inner.className;
            const isCancelled = classes.includes("bg_gray") || classes.includes("closed");

            // 親tdからカラムインデックスを取得
            const td = a.closest("td");
            const tr = td?.closest("tr");
            const tds = tr ? Array.from(tr.querySelectorAll("td")) : [];
            const colIndex = tds.indexOf(td);

            return { minutes, durationMin, colIndex, isCancelled };
        }).filter((a) => a && a.colIndex >= 0 && a.colIndex < 7 && !a.isCancelled);
    });

    // 結果Map作成
    const calendarData = new Map();
    for (const col of COLUMNS.ALL) {
        calendarData.set(col, new Set());
    }

    // 各予約の占有スロットを計算
    for (const appt of appointments) {
        const colName = COLUMN_NAMES[appt.colIndex];
        if (!colName) continue;

        const startMin = appt.minutes;
        const endMin = startMin + appt.durationMin;

        // 15分刻みでスロットを占有
        for (let m = startMin; m < endMin; m += 15) {
            const h = Math.floor(m / 60);
            const mi = m % 60;
            const timeStr = `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
            calendarData.get(colName).add(timeStr);
        }
    }

    // ログ出力
    for (const [col, occupied] of calendarData) {
        if (occupied.size > 0) {
            logger.debug(`${col}: ${occupied.size}スロット占有`);
        }
    }

    const totalOccupied = [...calendarData.values()].reduce((sum, s) => sum + s.size, 0);
    logger.info(`カレンダー読み取り完了: ${appointments.length}件の予約, ${totalOccupied}スロット占有`);
    return calendarData;
}
