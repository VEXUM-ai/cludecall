import express from "express";
import cors from "cors";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { initialize, cleanup } from "../browser/session-manager.js";
import { globalErrorHandler } from "./middleware/error-handler.js";
import availabilityRouter from "./routes/availability.js";
import bookingRouter from "./routes/booking.js";

const app = express();

// ミドルウェア
app.use(cors());
app.use(express.json());

// ルート
app.use("/api/check-availability", availabilityRouter);
app.use("/api/register-appointment", bookingRouter);

// ヘルスチェック
app.get("/health", (req, res) => {
    res.json({ status: "ok", clinic: config.clinicName });
});

// グローバルエラーハンドラー
app.use(globalErrorHandler);

// サーバー起動
async function start() {
    logger.info("サーバー起動中...");

    // ブラウザセッション初期化
    try {
        await initialize();
        logger.info("ブラウザセッション初期化完了");
    } catch (error) {
        logger.error("ブラウザセッション初期化失敗:", error.message);
        logger.warn("サーバーは起動しますが、ブラウザ操作は失敗します");
    }

    app.listen(config.serverPort, () => {
        logger.info(`サーバー起動完了: http://localhost:${config.serverPort}`);
        logger.info(`  POST /api/check-availability  - 空き枠確認`);
        logger.info(`  POST /api/register-appointment - 予約登録`);
        logger.info(`  GET  /health                   - ヘルスチェック`);
    });

    // グレースフルシャットダウン
    for (const signal of ["SIGINT", "SIGTERM"]) {
        process.on(signal, async () => {
            logger.info(`${signal} を受信。シャットダウン中...`);
            await cleanup();
            process.exit(0);
        });
    }
}

start().catch((error) => {
    logger.error("サーバー起動失敗:", error.message);
    process.exit(1);
});

export default app;
