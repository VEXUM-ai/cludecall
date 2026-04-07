import { Router } from "express";
import { ensureLoggedIn, takeErrorScreenshot } from "../../browser/session-manager.js";
import { navigateToDate, readCalendarGrid } from "../../browser/calendar.js";
import { findAvailableSlots } from "../../browser/availability.js";
import { withTimeout } from "../middleware/error-handler.js";
import { logger } from "../../utils/logger.js";

const router = Router();

/**
 * POST /api/check-availability
 * アポツールから指定日の空き枠を取得する
 */
router.post(
    "/",
    withTimeout(async (req, res) => {
        const { preferred_date } = req.body;

        // バリデーション
        if (!preferred_date || !/^\d{4}-\d{2}-\d{2}$/.test(preferred_date)) {
            return res.status(400).json({
                slots: [],
                error: "preferred_date は YYYY-MM-DD 形式で指定してください",
            });
        }

        try {
            const page = await ensureLoggedIn();

            // 指定日のカレンダーに遷移
            await navigateToDate(page, preferred_date);

            // カレンダーグリッドを読み取る
            const calendarData = await readCalendarGrid(page);

            // 空き枠を算出
            const slots = findAvailableSlots(calendarData);

            logger.info(`空き枠確認完了: ${preferred_date} → ${slots.length}件`);
            return res.json({ slots });
        } catch (error) {
            logger.error("空き枠確認エラー:", error.message);
            await takeErrorScreenshot("availability-error");
            return res.json({
                slots: [],
                error: "システムに接続できませんでした",
            });
        }
    })
);

export default router;
