import { COLUMNS } from "./calendar.js";
import { getCells, areCellsFree, timeToMinutes } from "../utils/time-slots.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

/**
 * 空き枠検索アルゴリズム
 * TC(30分) + 初診(60分) の連続1.5時間枠を見つける
 *
 * 検索優先順:
 *   パターンA: TC → 右2列（カウンセリング/初診・待合）、初診 → 左5列（①→⑤優先）
 *   パターンB: TC → 左5列（治療枠）、初診 → 左5列（同じ列 or 別の列）
 *
 * TCと初診は別の列でもOK。連続1.5時間であればよい。
 *
 * @param {Map<string, Set<string>>} calendarData - カラム名 → 占有スロットSet
 * @returns {Array<{start_time: string, tc_unit: string, treatment_unit: string}>}
 */
export function findAvailableSlots(calendarData) {
    const results = [];
    const seen = new Set(); // 同じ start_time の重複を防ぐ
    const startMin = timeToMinutes(config.businessStart);
    const endMin = timeToMinutes(config.businessEnd);

    for (let tcStartMin = startMin; tcStartMin < endMin; tcStartMin += 15) {
        const tcStart = minutesToTimeLocal(tcStartMin);
        const tcEnd = minutesToTimeLocal(tcStartMin + 30);
        const treatmentEnd = minutesToTimeLocal(tcStartMin + 90);

        // 治療終了が診療時間を超える場合はスキップ
        if (tcStartMin + 90 > endMin) continue;

        const tcCells = getCells(tcStart, 30);
        const treatCells = getCells(tcEnd, 60);

        // パターンA: TC → 右2列（優先）
        let found = false;
        for (const tcCol of COLUMNS.TC) {
            const tcOccupied = calendarData.get(tcCol) || new Set();
            if (!areCellsFree(tcCells, tcOccupied)) continue;

            for (const treatCol of COLUMNS.TREATMENT) {
                const treatOccupied = calendarData.get(treatCol) || new Set();
                if (!areCellsFree(treatCells, treatOccupied)) continue;

                if (!seen.has(tcStart)) {
                    results.push({ start_time: tcStart, tc_unit: tcCol, treatment_unit: treatCol });
                    seen.add(tcStart);
                    found = true;
                }
                break; // 最も番号の小さい治療枠を使う
            }
            if (found) break;
        }

        if (found) continue;

        // パターンB: TC → 左5列（治療枠にTCを入れる）
        for (const tcCol of COLUMNS.TREATMENT) {
            const tcOccupied = calendarData.get(tcCol) || new Set();
            if (!areCellsFree(tcCells, tcOccupied)) continue;

            for (const treatCol of COLUMNS.TREATMENT) {
                const treatOccupied = calendarData.get(treatCol) || new Set();
                if (!areCellsFree(treatCells, treatOccupied)) continue;

                if (!seen.has(tcStart)) {
                    results.push({ start_time: tcStart, tc_unit: tcCol, treatment_unit: treatCol });
                    seen.add(tcStart);
                    found = true;
                }
                break;
            }
            if (found) break;
        }
    }

    logger.info(`空き枠検索完了: ${results.length}件の候補`);
    return results;
}

/** 分数 → "HH:MM" */
function minutesToTimeLocal(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
