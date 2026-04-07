/**
 * カレンダーモックデータ
 * テスト用の予約占有状況を提供する
 */

/** 空のカレンダー（全枠空き） */
export function createEmptyCalendar() {
    return new Map([
        ["①治療", new Set()],
        ["②治療", new Set()],
        ["③治療", new Set()],
        ["④t/s", new Set()],
        ["⑤t/s", new Set()],
        ["カウンセリング", new Set()],
        ["初診・待合", new Set()],
    ]);
}

/** 部分的に埋まったカレンダー（4月10日の例に近い） */
export function createPartialCalendar() {
    return new Map([
        ["①治療", new Set(["15:15", "15:30", "15:45", "16:00", "16:15", "16:30", "16:45", "17:00", "17:15", "17:30", "17:45"])],
        ["②治療", new Set(["16:00", "16:15", "16:30", "16:45", "17:00", "17:15", "17:30"])],
        ["③治療", new Set()],
        ["④t/s", new Set(["15:30", "15:45", "16:30", "16:45"])],
        ["⑤t/s", new Set()],
        ["カウンセリング", new Set()],
        ["初診・待合", new Set(["15:30", "15:45"])],
    ]);
}

/** 完全に埋まったカレンダー */
export function createFullCalendar() {
    const allSlots = new Set();
    for (let h = 9; h < 18; h++) {
        for (const m of ["00", "15", "30", "45"]) {
            if (h === 9 && m === "00") continue; // 09:00はスキップ（09:30開始）
            if (h === 9 && m === "15") continue;
            allSlots.add(`${String(h).padStart(2, "0")}:${m}`);
        }
    }

    return new Map([
        ["①治療", new Set(allSlots)],
        ["②治療", new Set(allSlots)],
        ["③治療", new Set(allSlots)],
        ["④t/s", new Set(allSlots)],
        ["⑤t/s", new Set(allSlots)],
        ["カウンセリング", new Set(allSlots)],
        ["初診・待合", new Set(allSlots)],
    ]);
}

/** TC枠のみ埋まっている（治療枠は空き） */
export function createTcFullCalendar() {
    const allSlots = new Set();
    for (let h = 9; h < 18; h++) {
        for (const m of ["00", "15", "30", "45"]) {
            if (h === 9 && (m === "00" || m === "15")) continue;
            allSlots.add(`${String(h).padStart(2, "0")}:${m}`);
        }
    }

    return new Map([
        ["①治療", new Set()],
        ["②治療", new Set()],
        ["③治療", new Set()],
        ["④t/s", new Set()],
        ["⑤t/s", new Set()],
        ["カウンセリング", new Set(allSlots)],
        ["初診・待合", new Set(allSlots)],
    ]);
}

/** 治療枠のみ埋まっている（TC枠は空き） */
export function createTreatmentFullCalendar() {
    const allSlots = new Set();
    for (let h = 9; h < 18; h++) {
        for (const m of ["00", "15", "30", "45"]) {
            if (h === 9 && (m === "00" || m === "15")) continue;
            allSlots.add(`${String(h).padStart(2, "0")}:${m}`);
        }
    }

    return new Map([
        ["①治療", new Set(allSlots)],
        ["②治療", new Set(allSlots)],
        ["③治療", new Set(allSlots)],
        ["④t/s", new Set(allSlots)],
        ["⑤t/s", new Set(allSlots)],
        ["カウンセリング", new Set()],
        ["初診・待合", new Set()],
    ]);
}
