import { describe, it, expect } from "vitest";
import {
    timeToMinutes,
    minutesToTime,
    addMinutes,
    generateTimeSlots,
    getCells,
    areCellsFree,
} from "../../src/utils/time-slots.js";

describe("timeToMinutes", () => {
    it("09:30 → 570", () => {
        expect(timeToMinutes("09:30")).toBe(570);
    });
    it("18:00 → 1080", () => {
        expect(timeToMinutes("18:00")).toBe(1080);
    });
    it("00:00 → 0", () => {
        expect(timeToMinutes("00:00")).toBe(0);
    });
});

describe("minutesToTime", () => {
    it("570 → 09:30", () => {
        expect(minutesToTime(570)).toBe("09:30");
    });
    it("1080 → 18:00", () => {
        expect(minutesToTime(1080)).toBe("18:00");
    });
});

describe("addMinutes", () => {
    it("10:00 + 30 → 10:30", () => {
        expect(addMinutes("10:00", 30)).toBe("10:30");
    });
    it("16:30 + 60 → 17:30", () => {
        expect(addMinutes("16:30", 60)).toBe("17:30");
    });
    it("17:00 + 60 → 18:00", () => {
        expect(addMinutes("17:00", 60)).toBe("18:00");
    });
});

describe("generateTimeSlots", () => {
    it("09:30〜10:30 を15分刻みで生成", () => {
        const slots = generateTimeSlots("09:30", "10:30", 15);
        expect(slots).toEqual(["09:30", "09:45", "10:00", "10:15"]);
    });
    it("09:30〜18:00 で34スロット", () => {
        const slots = generateTimeSlots("09:30", "18:00", 15);
        expect(slots.length).toBe(34);
        expect(slots[0]).toBe("09:30");
        expect(slots[slots.length - 1]).toBe("17:45");
    });
});

describe("getCells", () => {
    it("10:00から30分 → 2セル", () => {
        expect(getCells("10:00", 30)).toEqual(["10:00", "10:15"]);
    });
    it("10:00から60分 → 4セル", () => {
        expect(getCells("10:00", 60)).toEqual(["10:00", "10:15", "10:30", "10:45"]);
    });
});

describe("areCellsFree", () => {
    it("すべて空き → true", () => {
        const occupied = new Set(["11:00", "11:15"]);
        expect(areCellsFree(["10:00", "10:15"], occupied)).toBe(true);
    });
    it("1つでも占有 → false", () => {
        const occupied = new Set(["10:15"]);
        expect(areCellsFree(["10:00", "10:15"], occupied)).toBe(false);
    });
    it("空のSet → 全て空き", () => {
        expect(areCellsFree(["10:00", "10:15"], new Set())).toBe(true);
    });
});
