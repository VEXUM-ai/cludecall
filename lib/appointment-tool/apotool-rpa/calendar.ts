import type { Page } from "playwright";

import { appointmentToolLogger } from "@/lib/appointment-tool/logger";

export const COLUMNS = {
  TREATMENT: ["①治療", "②治療", "③治療", "④t/s", "⑤t/s"],
  TC: ["カウンセリング", "初診・待合"],
  ALL: ["①治療", "②治療", "③治療", "④t/s", "⑤t/s", "カウンセリング", "初診・待合"],
} as const;

const COLUMN_NAMES = [...COLUMNS.ALL];

export async function navigateToDate(page: Page, dateString: string) {
  appointmentToolLogger.info("Navigating Apotool calendar", dateString);
  const [year, month, day] = dateString.split("-").map(Number);

  const currentDate = await page.evaluate(() => {
    for (const element of document.querySelectorAll("*")) {
      const text = element.textContent?.trim() ?? "";
      const match = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
      if (match && element.children.length < 3) {
        return {
          year: Number(match[1]),
          month: Number(match[2]),
          day: Number(match[3]),
        };
      }
    }
    return null;
  });

  if (!currentDate) {
    appointmentToolLogger.warn("Failed to resolve current Apotool calendar date.");
    return;
  }

  const current = new Date(currentDate.year, currentDate.month - 1, currentDate.day);
  const target = new Date(year, month - 1, day);
  const diffDays = Math.round((target.getTime() - current.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return;
  }

  const buttonText = diffDays > 0 ? "›" : "‹";
  const button = page.locator(`a.btn:has-text("${buttonText}")`).first();
  const clicks = Math.abs(diffDays);

  for (let index = 0; index < clicks; index += 1) {
    await button.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
  }
}

export async function readCalendarGrid(page: Page): Promise<Map<string, Set<string>>> {
  appointmentToolLogger.info("Reading Apotool calendar grid.");

  const appointments = await page.evaluate(() => {
    const slots = document.querySelectorAll("a.waku");
    return Array.from(slots)
      .map((slot) => {
        const minutes = Number(slot.getAttribute("data-minutes"));
        const inner = slot.querySelector(".inner") as HTMLElement | null;
        if (!inner) {
          return null;
        }

        const height = Number.parseInt(inner.style.height || "0", 10) || 0;
        const cellHeight = 80;
        const durationCells = Math.round(height / cellHeight);
        const durationMin = durationCells * 15;
        const classes = inner.className;
        const isCancelled = classes.includes("bg_gray") || classes.includes("closed");

        const td = slot.closest("td");
        const tr = td?.closest("tr");
        const tds = tr ? Array.from(tr.querySelectorAll("td")) : [];
        const colIndex = td ? tds.indexOf(td) : -1;

        return { minutes, durationMin, colIndex, isCancelled };
      })
      .filter(
        (value): value is { minutes: number; durationMin: number; colIndex: number; isCancelled: boolean } =>
          value !== null && value.colIndex >= 0 && value.colIndex < 7 && !value.isCancelled
      );
  });

  const calendarData = new Map<string, Set<string>>();
  for (const column of COLUMN_NAMES) {
    calendarData.set(column, new Set());
  }

  for (const appointment of appointments) {
    const columnName = COLUMN_NAMES[appointment.colIndex];
    if (!columnName) {
      continue;
    }

    for (
      let minute = appointment.minutes;
      minute < appointment.minutes + appointment.durationMin;
      minute += 15
    ) {
      const hours = Math.floor(minute / 60);
      const mins = minute % 60;
      const key = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
      calendarData.get(columnName)?.add(key);
    }
  }

  return calendarData;
}
