// Webhook Tool 作成スクリプト
// アポツール連携用のCustom Toolを作成
import { retellClient } from "./retell-client.js";
import { config } from "./config.js";

/**
 * 空き状況確認ツールを作成
 */
async function createAvailabilityTool() {
    console.log("🔧 空き状況確認ツールを作成中...");

    const tool = await retellClient.tool.create({
        name: "check_apotool_availability",
        type: "webhook",
        description: "アポツールから指定日の空き枠を取得する。患者の希望日をYYYY-MM-DD形式で渡すと、予約可能な時間帯のリストを返す。",
        url: `${config.serverBaseUrl}/api/check-availability`,
        method: "POST",
        header: { "Content-Type": "application/json" },
        body: JSON.stringify({
            preferred_date: "{{preferred_date}}",
        }),
        parameters: {
            type: "object",
            properties: {
                preferred_date: {
                    type: "string",
                    description: "患者が希望した日付をYYYY-MM-DD形式で指定。例: 2026-04-10",
                },
            },
            required: ["preferred_date"],
        },
        timeout_ms: 25000,
    });

    console.log(`   ✅ Tool ID: ${tool.tool_id}`);
    return tool;
}

/**
 * 予約登録ツールを作成
 */
async function createBookingTool() {
    console.log("🔧 予約登録ツールを作成中...");

    const tool = await retellClient.tool.create({
        name: "register_apotool_booking",
        type: "webhook",
        description: "アポツールに新規患者の予約を登録する。治療前TC（30分）と初診（60分）の2つの予約を連続で登録する。",
        url: `${config.serverBaseUrl}/api/register-appointment`,
        method: "POST",
        header: { "Content-Type": "application/json" },
        body: JSON.stringify({
            patient_name_kana: "{{patient_name_kana}}",
            phone_number: "{{phone_number}}",
            date: "{{date}}",
            tc_start_time: "{{tc_start_time}}",
            tc_unit: "{{tc_unit}}",
            treatment_start_time: "{{treatment_start_time}}",
            treatment_unit: "{{treatment_unit}}",
        }),
        parameters: {
            type: "object",
            properties: {
                patient_name_kana: {
                    type: "string",
                    description: "ひらがなの患者名（苗字 名前）。例: やまだ はなこ",
                },
                phone_number: {
                    type: "string",
                    description: "患者の電話番号。例: 090-1234-5678",
                },
                date: {
                    type: "string",
                    description: "予約日（YYYY-MM-DD形式）。例: 2026-04-10",
                },
                tc_start_time: {
                    type: "string",
                    description: "TC開始時間（HH:MM形式）。空き確認結果のstart_timeを使用。例: 11:00",
                },
                tc_unit: {
                    type: "string",
                    description: "TC枠名。空き確認結果のtc_unitを使用。例: カウンセリング、初診・待合、①治療 など",
                },
                treatment_start_time: {
                    type: "string",
                    description: "治療開始時間（tc_start_timeの30分後、HH:MM形式）。例: 11:30",
                },
                treatment_unit: {
                    type: "string",
                    description: "治療枠名。空き確認結果のtreatment_unitを使用。例: ①治療、②治療 など",
                },
            },
            required: [
                "patient_name_kana",
                "phone_number",
                "date",
                "tc_start_time",
                "tc_unit",
                "treatment_start_time",
                "treatment_unit",
            ],
        },
        timeout_ms: 50000,
    });

    console.log(`   ✅ Tool ID: ${tool.tool_id}`);
    return tool;
}

/**
 * 両ツールを作成して返す
 */
export async function createTools() {
    const availabilityTool = await createAvailabilityTool();
    const bookingTool = await createBookingTool();

    return {
        availabilityToolId: availabilityTool.tool_id,
        bookingToolId: bookingTool.tool_id,
    };
}
