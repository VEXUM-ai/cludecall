import { logger } from "../../utils/logger.js";

/** 20秒タイムアウトラッパー */
export function withTimeout(handler, timeoutMs = 20000) {
    return async (req, res, next) => {
        const timer = setTimeout(() => {
            if (!res.headersSent) {
                logger.warn(`リクエストタイムアウト: ${req.path} (${timeoutMs}ms)`);
                res.status(504).json({
                    success: false,
                    message: "システムの応答に時間がかかっています。後ほどスタッフからご連絡いたします。",
                });
            }
        }, timeoutMs);

        try {
            await handler(req, res, next);
        } catch (error) {
            if (!res.headersSent) {
                next(error);
            }
        } finally {
            clearTimeout(timer);
        }
    };
}

/** グローバルエラーハンドラー */
export function globalErrorHandler(err, req, res, _next) {
    logger.error(`エラー [${req.method} ${req.path}]:`, err.message);

    if (res.headersSent) return;

    res.status(500).json({
        success: false,
        message: "システムエラーが発生しました。後ほどスタッフからご連絡いたします。",
    });
}
