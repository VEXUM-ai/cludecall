// 設定ファイル - 環境変数の読み込み
import dotenv from "dotenv";
dotenv.config();

export const config = {
    // Retell AI APIキー
    retellApiKey: process.env.RETELL_API_KEY,

    // クリニック情報
    clinicName: "えみは総合歯科",
    clinicPhone: "06-4256-5871",

    // 診療時間
    businessHours: "月〜土 9:30〜18:00（日・祝休診）",
    businessStart: "09:30",
    businessEnd: "18:00",
    slotInterval: 15, // 分

    // エージェント設定
    voiceId: "openai-Alloy",
    language: "ja-JP",
    modelChoice: "gpt-4o-mini",

    // Apotool & Box 接続情報
    apotoolEmail: process.env.APOTOOL_EMAIL,
    apotoolPassword: process.env.APOTOOL_PASSWORD,
    apotoolLoginUrl: "https://user.stransa.co.jp/login",
    apotoolClinicName: "えみは総合歯科 大阪梅田院",

    // サーバー設定
    serverPort: parseInt(process.env.SERVER_PORT || "3000"),
    serverBaseUrl: process.env.SERVER_BASE_URL || "http://localhost:3000",
};

// APIキーの存在確認（デプロイ時のみ必須）
if (!config.retellApiKey && process.argv[1]?.includes("deploy")) {
    console.error("❌ エラー: RETELL_API_KEY が .env ファイルに設定されていません。");
    console.error("   .env.example を参考に .env ファイルを作成してください。");
    process.exit(1);
}

// Apotool認証情報の確認（サーバー起動時のみ必須）
if (!config.apotoolEmail || !config.apotoolPassword) {
    if (process.argv[1]?.includes("server")) {
        console.error("❌ エラー: APOTOOL_EMAIL / APOTOOL_PASSWORD が .env ファイルに設定されていません。");
        process.exit(1);
    }
}
