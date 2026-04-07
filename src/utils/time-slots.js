/**
 * 時間枠ユーティリティ
 * 15分刻みの時間グリッドで予約枠を管理する
 */

/** "HH:MM" → 分数 */
export function timeToMinutes(time) {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

/** 分数 → "HH:MM" */
export function minutesToTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 指定分数を加算した時刻を返す */
export function addMinutes(time, add) {
    return minutesToTime(timeToMinutes(time) + add);
}

/** start から end まで interval 分刻みの時刻配列を生成 */
export function generateTimeSlots(start, end, interval) {
    const slots = [];
    let current = timeToMinutes(start);
    const endMin = timeToMinutes(end);
    while (current < endMin) {
        slots.push(minutesToTime(current));
        current += interval;
    }
    return slots;
}

/** 指定時刻から duration 分間の15分セル配列を返す */
export function getCells(startTime, durationMinutes, interval = 15) {
    const cells = [];
    let current = timeToMinutes(startTime);
    const end = current + durationMinutes;
    while (current < end) {
        cells.push(minutesToTime(current));
        current += interval;
    }
    return cells;
}

/** 指定セルがすべて空いているか判定 */
export function areCellsFree(cells, occupiedSet) {
    return cells.every((cell) => !occupiedSet.has(cell));
}
