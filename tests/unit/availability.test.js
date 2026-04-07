import { describe, it, expect } from "vitest";
import { findAvailableSlots } from "../../src/browser/availability.js";
import {
    createEmptyCalendar,
    createPartialCalendar,
    createFullCalendar,
    createTcFullCalendar,
    createTreatmentFullCalendar,
} from "../fixtures/calendar-mock.js";

describe("findAvailableSlots", () => {
    it("空のカレンダーでは全時間帯が候補になる", () => {
        const slots = findAvailableSlots(createEmptyCalendar());
        expect(slots.length).toBeGreaterThan(0);

        // 最初の候補は09:30開始（TC 09:30-10:00, 治療 10:00-11:00）
        expect(slots[0].start_time).toBe("09:30");
        expect(slots[0].treatment_unit).toBe("①治療"); // 番号小さい方優先
    });

    it("空のカレンダーで治療枠は①が優先される", () => {
        const slots = findAvailableSlots(createEmptyCalendar());
        // すべての候補で①治療が選ばれるはず
        for (const slot of slots) {
            expect(slot.treatment_unit).toBe("①治療");
        }
    });

    it("最後の有効な開始時間は16:30（TC 16:30-17:00, 治療 17:00-18:00）", () => {
        const slots = findAvailableSlots(createEmptyCalendar());
        const lastSlot = slots[slots.length - 1];
        expect(lastSlot.start_time).toBe("16:30");
    });

    it("16:45開始は無効（治療が18:15まで必要で診療時間超過）", () => {
        const slots = findAvailableSlots(createEmptyCalendar());
        const has1645 = slots.some((s) => s.start_time === "16:45");
        expect(has1645).toBe(false);
    });

    it("完全に埋まったカレンダーでは候補0件", () => {
        const slots = findAvailableSlots(createFullCalendar());
        expect(slots.length).toBe(0);
    });

    it("TC枠が埋まっていても治療枠にTCを入れられる", () => {
        const slots = findAvailableSlots(createTcFullCalendar());
        // 右2列は全て埋まっているが、左5列（治療枠）にTCを入れるパターンBで候補が出る
        expect(slots.length).toBeGreaterThan(0);
        // 全候補のtc_unitが治療枠であること
        for (const slot of slots) {
            expect(["①治療", "②治療", "③治療", "④t/s", "⑤t/s"]).toContain(slot.tc_unit);
        }
    });

    it("治療枠のみ埋まっている場合は候補0件", () => {
        const slots = findAvailableSlots(createTreatmentFullCalendar());
        expect(slots.length).toBe(0);
    });

    it("部分的に埋まったカレンダーで正しい空き枠が返る", () => {
        const slots = findAvailableSlots(createPartialCalendar());
        expect(slots.length).toBeGreaterThan(0);

        // 15:30はTC枠（初診・待合）が埋まっているが、カウンセリングは空き
        // ①治療は15:15から埋まっている
        // ③治療は空いている → 15:30開始候補でカウンセリング + ③治療が見つかるはず
        const slot1530 = slots.find((s) => s.start_time === "15:30");
        if (slot1530) {
            expect(slot1530.tc_unit).toBe("カウンセリング");
            expect(slot1530.treatment_unit).toBe("③治療"); // ①②は埋まっているので③
        }
    });

    it("TC枠はカウンセリングと初診・待合のどちらも使える", () => {
        const slots = findAvailableSlots(createEmptyCalendar());
        // 空のカレンダーでは最初に見つかるTC枠（カウンセリング）が使われる
        expect(["カウンセリング", "初診・待合"]).toContain(slots[0].tc_unit);
    });
});
