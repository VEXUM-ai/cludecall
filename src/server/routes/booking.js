import { Router } from "express";
import { ensureLoggedIn, takeErrorScreenshot } from "../../browser/session-manager.js";
import { navigateToDate } from "../../browser/calendar.js";
import { bookAppointment } from "../../browser/booking.js";
import { withTimeout } from "../middleware/error-handler.js";
import { logger } from "../../utils/logger.js";

const router = Router();

/**
 * POST /api/register-appointment
 * アポツールに新規患者の予約を登録する（TC 30分 + 初診 60分の2回登録）
 * タイムアウト45秒（2回の連続登録のため長め）
 */
router.post(
    "/",
    withTimeout(async (req, res) => {
        const {
            patient_name_kana,
            phone_number,
            date,
            tc_start_time,
            tc_unit,
            treatment_start_time,
            treatment_unit,
        } = req.body;

        // バリデーション
        const missing = [];
        if (!patient_name_kana) missing.push("patient_name_kana");
        if (!date) missing.push("date");
        if (!tc_start_time) missing.push("tc_start_time");
        if (!tc_unit) missing.push("tc_unit");
        if (!treatment_start_time) missing.push("treatment_start_time");
        if (!treatment_unit) missing.push("treatment_unit");

        if (missing.length > 0) {
            return res.status(400).json({
                success: false,
                message: `必須パラメータが不足: ${missing.join(", ")}`,
            });
        }

        try {
            const page = await ensureLoggedIn();

            // 指定日のカレンダーに遷移
            await navigateToDate(page, date);

            // 予約登録（TC → 初診の2回）
            const result = await bookAppointment(page, {
                patient_name_kana,
                phone_number: phone_number || "",
                tc_start_time,
                tc_unit,
                treatment_start_time,
                treatment_unit,
            });

            logger.info(`予約登録結果: ${result.success ? "成功" : "失敗"}`);
            return res.json(result);
        } catch (error) {
            logger.error("予約登録エラー:", error.message);
            await takeErrorScreenshot("booking-error");
            return res.json({
                success: false,
                message: "予約登録に失敗しました。後ほどスタッフからご連絡いたします。",
                tc_orphaned: false,
            });
        }
    }, 45000)
);

export default router;
