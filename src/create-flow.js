// Conversation Flow 作成スクリプト
// えみは総合歯科 - AI電話対応エージェント用の会話フローを構築
import { retellClient } from "./retell-client.js";
import { config } from "./config.js";

/**
 * 会話フローのノード定義
 * 挨拶 → 症状聞き取り → 緊急判定 → 情報収集 → 空き確認 → 日時提案 → 予約登録 → 確認・終了
 */
function buildNodes() {
    return [
        // ─────────────────────────────────────────────
        // ノード1: 挨拶
        // ─────────────────────────────────────────────
        {
            id: "greeting",
            type: "conversation",
            instruction: {
                type: "prompt",
                text: `あなたは「${config.clinicName}」の受付AIです。
温かく丁寧に挨拶してください。

以下のように話してください：
「お電話ありがとうございます。${config.clinicName}でございます。本日はご予約やご相談でしょうか？どのようなご用件でしょうか？」

患者さんが用件を話し始めたら、次のステップに進んでください。`,
            },
            edges: [
                {
                    id: "edge_greeting_to_symptom",
                    transition_condition: {
                        type: "prompt",
                        prompt:
                            "患者が症状や歯の悩み、予約について話し始めた場合に遷移する",
                    },
                    destination_node_id: "symptom_inquiry",
                },
            ],
        },

        // ─────────────────────────────────────────────
        // ノード2: 症状聞き取り
        // ─────────────────────────────────────────────
        {
            id: "symptom_inquiry",
            type: "conversation",
            instruction: {
                type: "prompt",
                text: `患者さんの症状を詳しく聞き取ってください。以下の情報を確認してください：

1. どのような症状ですか？（虫歯、歯周病、詰め物が取れた、歯が欠けた、歯のクリーニング、ホワイトニング、定期検診など）
2. 痛みはありますか？痛みがある場合、どの程度の痛みですか？（軽い痛み、中程度の痛み、強い痛み・我慢できない痛み）
3. いつ頃から症状がありますか？

共感を示しながら丁寧にヒアリングしてください。
例：「それはおつらいですね」「お痛みがあるのですね、ご心配ですよね」

すべて聞き取れたら、痛みの程度に応じて次のステップに進んでください。`,
            },
            edges: [
                {
                    id: "edge_symptom_to_emergency",
                    transition_condition: {
                        type: "prompt",
                        prompt:
                            "患者が「強い痛み」「我慢できない痛み」「ズキズキする」「夜も眠れない」「腫れている」「出血がひどい」など、緊急性の高い症状を訴えた場合に遷移する",
                    },
                    destination_node_id: "emergency_handling",
                },
                {
                    id: "edge_symptom_to_collect_info",
                    transition_condition: {
                        type: "prompt",
                        prompt:
                            "患者の症状が通常レベル（軽い痛み、定期検診、クリーニングなど緊急性が低い）場合に遷移する",
                    },
                    destination_node_id: "collect_info",
                },
            ],
        },

        // ─────────────────────────────────────────────
        // ノード3: 緊急対応（スタッフ転送案内）
        // ─────────────────────────────────────────────
        {
            id: "emergency_handling",
            type: "conversation",
            instruction: {
                type: "prompt",
                text: `患者さんが強い痛みや緊急性の高い症状を訴えています。
落ち着いて、以下のように対応してください：

1. まず共感と安心を伝える：
   「お痛みが強いとのこと、大変おつらいですね。」

2. スタッフへの転送を案内：
   「恐れ入りますが、緊急のご症状については、スタッフが直接対応させていただきます。
   お電話番号 ${config.clinicPhone} に直接おかけいただくか、このまま少々お待ちいただけますでしょうか。」

3. 応急処置のアドバイス（必要に応じて）：
   - 「お痛みが強い場合は、市販の痛み止めをお飲みいただいても構いません」
   - 「患部を冷やすと痛みが和らぐことがあります」

緊急の場合はAIでの予約は行わず、スタッフに対応を引き継いでください。`,
            },
            edges: [
                {
                    id: "edge_emergency_to_end",
                    transition_condition: {
                        type: "prompt",
                        prompt:
                            "患者がスタッフへの転送を了承した場合、または電話番号を確認した場合に遷移する",
                    },
                    destination_node_id: "end_call",
                },
            ],
        },

        // ─────────────────────────────────────────────
        // ノード4: 情報収集（名前・電話番号・希望日時）
        // ─────────────────────────────────────────────
        {
            id: "collect_info",
            type: "conversation",
            instruction: {
                type: "prompt",
                text: `患者さんの予約に必要な情報を収集してください。
以下の3つの情報を一つずつ丁寧に確認してください：

1. **お名前**（フルネーム・ひらがな）
   「恐れ入りますが、お名前をフルネームでお願いいたします。」
   ※ひらがなでの確認：「ひらがなで、苗字とお名前を教えていただけますか？」
   ※例：「やまだ はなこ」のように苗字とお名前をお願いします。

2. **お電話番号**
   「ご連絡先のお電話番号をお願いいたします。」
   ※復唱して確認：「確認いたします。○○○-○○○○-○○○○でよろしいですか？」

3. **希望日時**
   「ご希望の日時はございますか？」
   「当院の診療時間は${config.businessHours}でございます。」

すべての情報が揃ったら、空き状況の確認に進んでください。
情報は正確に聞き取り、必ず復唱して確認してください。

重要：お名前は必ずひらがなで確認してください。予約システムへの登録に必要です。`,
            },
            edges: [
                {
                    id: "edge_collect_to_check_availability",
                    transition_condition: {
                        type: "prompt",
                        prompt:
                            "患者の名前（ひらがな）、電話番号、希望日時がすべて収集できた場合に遷移する",
                    },
                    destination_node_id: "check_availability",
                },
            ],
        },

        // ─────────────────────────────────────────────
        // ノード5: 空き状況確認（Custom Toolを呼び出す）
        // ─────────────────────────────────────────────
        {
            id: "check_availability",
            type: "conversation",
            instruction: {
                type: "prompt",
                text: `空き状況を確認します。

患者さんに「ただいま空き状況を確認いたしますので、少々お待ちください。」と伝えてから、
check_apotool_availability ツールを呼び出してください。
preferred_date には患者が希望した日付をYYYY-MM-DD形式で指定してください。

ツールの結果に基づいて対応してください：

【空き枠がある場合】
結果のslotsから2〜3個の候補を提案してください。
start_timeは治療前カウンセリングの開始時間です。
カウンセリング30分の後に60分の治療がありますので、合計1時間30分のご案内になります。

例：「確認いたしました。○月○日は、10時からと14時からにお時間がございます。
カウンセリング30分と治療60分で、合計1時間30分のご予約になります。
いかがでしょうか？」

【空き枠がない場合】
「申し訳ございません。ご希望のお日にちは空きがございません。
別のお日にちはいかがでしょうか？」

【エラーの場合】
「申し訳ございません。確認ができませんでしたので、後ほどスタッフからお折り返しいたします。
お電話番号を確認させてください。」`,
            },
            edges: [
                {
                    id: "edge_availability_to_register",
                    transition_condition: {
                        type: "prompt",
                        prompt:
                            "患者が日時を選択し、その日時で予約を希望した場合に遷移する",
                    },
                    destination_node_id: "register_appointment",
                },
                {
                    id: "edge_availability_to_collect_info",
                    transition_condition: {
                        type: "prompt",
                        prompt:
                            "提案した日時がすべて合わない場合、別の希望日時を確認するために情報収集に戻る",
                    },
                    destination_node_id: "collect_info",
                },
                {
                    id: "edge_availability_error_to_end",
                    transition_condition: {
                        type: "prompt",
                        prompt:
                            "システムエラーで空き確認ができず、折り返し電話を案内した場合に遷移する",
                    },
                    destination_node_id: "end_call",
                },
            ],
        },

        // ─────────────────────────────────────────────
        // ノード6: 予約登録（Custom Toolを呼び出す）
        // ─────────────────────────────────────────────
        {
            id: "register_appointment",
            type: "conversation",
            instruction: {
                type: "prompt",
                text: `予約を登録します。

まず患者さんに予約内容を復唱し、最終確認をしてください：

「では、ご予約内容を確認させていただきます。
  お名前: ○○様
  お日にち: ○月○日
  お時間: ○時から（カウンセリング30分＋治療60分）

以上の内容でよろしいでしょうか？」

患者が「はい」と確認したら、register_apotool_booking ツールを呼び出して予約を登録してください。
パラメータには以下を指定してください：
- patient_name_kana: ひらがなの患者名（苗字 名前）
- phone_number: 患者の電話番号
- date: 予約日（YYYY-MM-DD形式）
- tc_start_time: 空き確認で選択されたstart_time
- tc_unit: 空き確認で選択されたtc_unit
- treatment_start_time: tc_start_timeの30分後（HH:MM形式）
- treatment_unit: 空き確認で選択されたtreatment_unit

【登録成功の場合】
確認・終了ノードに進んでください。

【登録失敗の場合】
「申し訳ございません。予約登録に問題が発生しました。
後ほどスタッフからお電話いたしますので、少々お待ちください。」
と伝えて通話を終了してください。`,
            },
            edges: [
                {
                    id: "edge_register_to_confirmation",
                    transition_condition: {
                        type: "prompt",
                        prompt: "予約登録が成功した場合に遷移する",
                    },
                    destination_node_id: "confirmation",
                },
                {
                    id: "edge_register_to_availability",
                    transition_condition: {
                        type: "prompt",
                        prompt:
                            "患者が予約内容を変更したい場合、空き状況確認に戻る",
                    },
                    destination_node_id: "check_availability",
                },
                {
                    id: "edge_register_error_to_end",
                    transition_condition: {
                        type: "prompt",
                        prompt:
                            "予約登録に失敗し、折り返し電話を案内した場合に遷移する",
                    },
                    destination_node_id: "end_call",
                },
            ],
        },

        // ─────────────────────────────────────────────
        // ノード7: 確認・終了
        // ─────────────────────────────────────────────
        {
            id: "confirmation",
            type: "conversation",
            instruction: {
                type: "prompt",
                text: `ご予約の最終案内をしてください。

以下の内容を伝えてください：

1. 予約日時の確認：
   「○月○日○曜日、○時からご予約をお取りいたしました。」

2. 15分前来院の案内：
   「初診の方は、問診票のご記入がございますので、ご予約の15分前にお越しください。」

3. 当日の持ち物：
   「当日は保険証をお持ちください。お薬手帳をお持ちの方はそちらもご持参ください。」

4. 注意事項：
   「ご予約の変更やキャンセルは、前日までにお電話ください。」

5. 終わりの挨拶：
   「それでは、○○様のご来院を心よりお待ちしております。
   ${config.clinicName}でした。お大事になさってください。失礼いたします。」`,
            },
            edges: [
                {
                    id: "edge_confirmation_to_end",
                    transition_condition: {
                        type: "prompt",
                        prompt: "患者が挨拶を返し、通話が終了する場合に遷移する",
                    },
                    destination_node_id: "end_call",
                },
            ],
        },

        // ─────────────────────────────────────────────
        // ノード8: 通話終了
        // ─────────────────────────────────────────────
        {
            id: "end_call",
            type: "end",
            instruction: {
                type: "prompt",
                text: "通話を正常に終了します。患者さんに感謝を伝えてお大事になさってくださいと言って終了します。",
            },
        },
    ];
}

/**
 * Conversation Flow を Retell AI API に作成
 */
export async function createConversationFlow() {
    console.log("📋 Conversation Flow を作成中...");
    console.log(`   クリニック: ${config.clinicName}`);

    try {
        const flowResponse = await retellClient.conversationFlow.create({
            // AI モデル設定
            model_choice: {
                type: "cascading",
                model: config.modelChoice,
            },

            // 会話温度（低めで安定した応答）
            model_temperature: 0.4,

            // エージェントが先に話す
            start_speaker: "agent",

            // 開始ノードID
            start_node_id: "greeting",

            // グローバルプロンプト（全ノード共通の指示）
            global_prompt: `あなたは「${config.clinicName}」の受付AIアシスタントです。

## 基本ルール
- 常に丁寧な敬語で話してください
- 患者さんに寄り添い、共感を示してください
- 医療の診断は絶対にしないでください。症状の聞き取りのみ行ってください
- 歯科に関係のない相談には「申し訳ございませんが、歯科に関するご相談のみ承っております」と答えてください
- 情報は必ず復唱して確認してください
- 自然で温かみのある会話を心がけてください
- 日本語で会話してください
- お名前は必ずひらがなで確認してください

## クリニック情報
- 名称: ${config.clinicName}
- 診療時間: ${config.businessHours}
- 電話番号: ${config.clinicPhone}

## 予約について
- 初診の方は、カウンセリング30分＋治療60分＝合計1時間30分の予約になります
- 初診の方は予約の15分前に来院してください（問診票記入のため）
- 緊急の場合はスタッフに直接お電話いただくようご案内ください`,

            // 動的変数のデフォルト値
            default_dynamic_variables: {
                clinic_name: config.clinicName,
                business_hours: config.businessHours,
                clinic_phone: config.clinicPhone,
            },

            // 会話ノード
            nodes: buildNodes(),
        });

        console.log("✅ Conversation Flow の作成が完了しました！");
        console.log(`   Flow ID: ${flowResponse.conversation_flow_id}`);
        console.log(`   Version: ${flowResponse.version}`);

        return flowResponse;
    } catch (error) {
        console.error("❌ Conversation Flow の作成に失敗しました:");
        console.error(`   ${error.message}`);
        if (error.status) {
            console.error(`   HTTPステータス: ${error.status}`);
        }
        throw error;
    }
}

// 直接実行された場合
const isMainModule =
    import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`;
if (isMainModule) {
    createConversationFlow()
        .then((flow) => {
            console.log("\n📝 作成されたフロー情報:");
            console.log(JSON.stringify(flow, null, 2));
        })
        .catch(() => {
            process.exit(1);
        });
}
