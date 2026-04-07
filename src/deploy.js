// 一括デプロイスクリプト
// Conversation Flow → Voice Agent を順番に作成
import { createConversationFlow } from "./create-flow.js";
import { createVoiceAgent } from "./create-agent.js";
import { config } from "./config.js";

async function deploy() {
    console.log("╔══════════════════════════════════════════════╗");
    console.log("║  えみは総合歯科 - AI電話対応エージェント     ║");
    console.log("║  デプロイスクリプト（Apotool連携版）         ║");
    console.log("╚══════════════════════════════════════════════╝");
    console.log();
    console.log(`🏥 クリニック名: ${config.clinicName}`);
    console.log(`📞 診療時間: ${config.businessHours}`);
    console.log(`🌐 サーバーURL: ${config.serverBaseUrl}`);
    console.log(`🔑 APIキー: ${config.retellApiKey.substring(0, 10)}...`);
    console.log();

    // ステップ1: Conversation Flow の作成
    console.log("━━━ ステップ 1/2: Conversation Flow 作成 ━━━");
    const flowResponse = await createConversationFlow();
    console.log();

    // ステップ2: Voice Agent の作成
    console.log("━━━ ステップ 2/2: Voice Agent 作成 ━━━");
    const agentResponse = await createVoiceAgent(
        flowResponse.conversation_flow_id
    );
    console.log();

    // 完了サマリー
    console.log("╔══════════════════════════════════════════════╗");
    console.log("║  🎉 デプロイ完了！                          ║");
    console.log("╚══════════════════════════════════════════════╝");
    console.log();
    console.log("📋 作成されたリソース:");
    console.log(`   Conversation Flow ID: ${flowResponse.conversation_flow_id}`);
    console.log(`   Voice Agent ID:       ${agentResponse.agent_id}`);
    console.log();
    console.log("📌 次のステップ（ツール設定）:");
    console.log("   1. Retell AI ダッシュボード（https://dashboard.retellai.com）を開く");
    console.log("   2. 作成されたエージェントの設定を開く");
    console.log("   3. 以下の2つのWebhook Toolを手動で追加:");
    console.log();
    console.log("   【Tool 1: check_apotool_availability】");
    console.log(`   URL: ${config.serverBaseUrl}/api/check-availability`);
    console.log("   Method: POST");
    console.log("   Parameter: preferred_date (string, required)");
    console.log();
    console.log("   【Tool 2: register_apotool_booking】");
    console.log(`   URL: ${config.serverBaseUrl}/api/register-appointment`);
    console.log("   Method: POST");
    console.log("   Parameters: patient_name_kana, phone_number, date,");
    console.log("               tc_start_time, tc_unit, treatment_start_time, treatment_unit");
    console.log();
    console.log("   4. 「Test」ボタンから Web Call でテスト通話を実施");
    console.log();

    return { flowResponse, agentResponse };
}

deploy().catch((error) => {
    console.error("\n❌ デプロイに失敗しました:", error.message);
    process.exit(1);
});
