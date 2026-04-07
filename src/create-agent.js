// Voice Agent 作成スクリプト
// えみは総合歯科 - AI電話対応エージェントの作成
import { retellClient } from "./retell-client.js";
import { config } from "./config.js";

/**
 * Voice Agent を Retell AI API に作成
 * @param {string} conversationFlowId - 事前に作成したConversation FlowのID
 * @param {string[]} toolIds - エージェントに紐付けるツールIDの配列
 */
export async function createVoiceAgent(conversationFlowId, toolIds = []) {
    console.log("🤖 Voice Agent を作成中...");

    try {
        const agentResponse = await retellClient.agent.create({
            // レスポンスエンジン: Conversation Flow を使用
            response_engine: {
                type: "conversation-flow",
                conversation_flow_id: conversationFlowId,
            },

            // 音声設定
            voice_id: config.voiceId,
            voice_speed: 0.95, // 少しゆっくり（聞き取りやすく）
            voice_temperature: 0.8, // 自然な抑揚
            enable_dynamic_voice_speed: true, // 動的速度調整
            enable_dynamic_responsiveness: true, // 動的応答性調整
            volume: 1,

            // エージェント基本情報
            agent_name: `${config.clinicName} 受付AI`,

            // 言語設定
            language: config.language,

            // 応答性の設定
            responsiveness: 0.8, // やや控えめ（患者の話を最後まで聞く）
            interruption_sensitivity: 0.5, // 中程度の割り込み感度

            // 相槌設定
            enable_backchannel: true,
            backchannel_frequency: 0.7,
            backchannel_words: ["はい", "ええ", "そうですね", "承知しました"],

            // リマインダー設定（10秒間沈黙したら促す）
            reminder_trigger_ms: 10000,
            reminder_max_count: 2,

            // 環境音（コールセンター風 - 受付の雰囲気）
            ambient_sound: "call-center",
            ambient_sound_volume: 0.3,

            // 通話設定
            end_call_after_silence_ms: 30000, // 30秒沈黙で終了
            max_call_duration_ms: 600000, // 最大10分

            // ボイスメール検知
            enable_voicemail_detection: true,
            voicemail_message: `お電話ありがとうございます。${config.clinicName}でございます。ただいま電話に出ることができません。お手数ですが、診療時間内におかけ直しください。診療時間は${config.businessHours}でございます。`,

            // カスタムキーワード（音声認識精度向上）
            boosted_keywords: [
                "えみは総合歯科",
                "予約",
                "歯",
                "虫歯",
                "歯周病",
                "痛い",
                "痛み",
                "腫れ",
                "クリーニング",
                "定期検診",
                "ホワイトニング",
                "詰め物",
                "差し歯",
                "入れ歯",
                "親知らず",
                "矯正",
                "インプラント",
            ],

            // ノイズキャンセル
            denoising_mode: "noise-cancellation",

            // ─────────────────────────────────────────────
            // 通話後分析ワークフロー（ワークフロー3）
            // ─────────────────────────────────────────────
            post_call_analysis_data: [
                {
                    type: "string",
                    name: "patient_name",
                    description: "患者のフルネーム",
                    examples: ["田中太郎", "山田花子", "佐藤一郎"],
                    required: true,
                },
                {
                    type: "string",
                    name: "phone_number",
                    description: "患者の電話番号",
                    examples: ["090-1234-5678", "03-1234-5678"],
                    required: true,
                },
                {
                    type: "string",
                    name: "symptom",
                    description: "患者が訴えた症状の詳細",
                    examples: [
                        "右下の奥歯が2日前から痛い",
                        "定期検診希望",
                        "詰め物が取れた",
                    ],
                    required: true,
                },
                {
                    type: "enum",
                    name: "urgency_level",
                    description: "症状の緊急度",
                    choices: ["緊急", "通常", "定期"],
                    required: true,
                },
                {
                    type: "string",
                    name: "preferred_datetime",
                    description: "患者が希望した日時",
                    examples: ["3月15日 10時", "明日の午前中", "来週の月曜日"],
                    required: true,
                },
                {
                    type: "string",
                    name: "scheduled_datetime",
                    description: "実際に予約が取れた日時（予約できなかった場合は「未予約」）",
                    examples: ["3月15日 10:00", "未予約"],
                    required: true,
                },
                {
                    type: "boolean",
                    name: "appointment_completed",
                    description: "予約が完了したかどうか",
                    required: true,
                },
            ],

            // 通話後分析のモデル
            post_call_analysis_model: "gpt-4o-mini",

            // 通話成功判定プロンプト
            analysis_successful_prompt:
                "通話が正常に完了し、患者の予約が登録されたか、または患者が予約を希望しなかった場合に成功と判定してください。通話が途中で切れた場合や、エージェントが適切な対応ができなかった場合は失敗と判定してください。",

            // 通話サマリープロンプト
            analysis_summary_prompt:
                "この通話の内容を日本語で2〜3文で要約してください。患者名、症状、予約状況を含めてください。",

            // ユーザー感情分析プロンプト
            analysis_user_sentiment_prompt:
                "患者の感情と満足度を評価してください。痛みへの不安、対応への満足度、最終的な印象を考慮してください。「満足」「普通」「不満」の3段階で評価し、その理由も簡潔に述べてください。",
        });

        console.log("✅ Voice Agent の作成が完了しました！");
        console.log(`   Agent ID: ${agentResponse.agent_id}`);
        console.log(`   Agent Name: ${agentResponse.agent_name}`);
        console.log(`   Version: ${agentResponse.version}`);

        return agentResponse;
    } catch (error) {
        console.error("❌ Voice Agent の作成に失敗しました:");
        console.error(`   ${error.message}`);
        if (error.status) {
            console.error(`   HTTPステータス: ${error.status}`);
        }
        throw error;
    }
}

// 直接実行された場合（引数にConversation Flow IDが必要）
const isMainModule =
    import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`;
if (isMainModule) {
    const flowId = process.argv[2];
    if (!flowId) {
        console.error(
            "❌ 使用法: node src/create-agent.js <conversation_flow_id>"
        );
        console.error(
            "   先に create-flow.js を実行してConversation Flow IDを取得してください。"
        );
        process.exit(1);
    }

    createVoiceAgent(flowId)
        .then((agent) => {
            console.log("\n📝 作成されたエージェント情報:");
            console.log(JSON.stringify(agent, null, 2));
        })
        .catch(() => {
            process.exit(1);
        });
}
