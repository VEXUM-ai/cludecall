import type { Page } from "playwright";

import { appointmentToolLogger } from "@/lib/appointment-tool/logger";

export type CalendarGrid = Map<string, Set<string>>;

type CalendarColumn = {
  className: string;
  displayName: string;
};

const DATE_LABEL_SELECTOR = "#target_date";
const DATE_PATTERN = /(\d{4})\u5e74(\d{1,2})\u6708(\d{1,2})\u65e5/u;
const YEAR_RANGE_PATTERN = /(\d{4}).*?(\d{4})/u;
const CHAIR_PREFIX = "\u30c1\u30a7\u30a2";
const COUNSELING_TOKEN = "\u30ab\u30a6\u30f3\u30bb\u30ea\u30f3\u30b0";
const URGENT_LABEL = "\u6025\u60a3";
const MEMO_LABEL = "\u30e1\u30e2";
const WEB_LABEL = "WEB";

export function normalizeCalendarText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function looksLikeCalendarHeader(value: string | null | undefined) {
  const normalized = normalizeCalendarText(value);
  return (
    new RegExp(`^${CHAIR_PREFIX}\\d+$`, "u").test(normalized) ||
    new RegExp(`^\\u7b2c\\d+${COUNSELING_TOKEN}$`, "u").test(normalized) ||
    normalized === URGENT_LABEL ||
    normalized === MEMO_LABEL ||
    normalized === WEB_LABEL ||
    /^T\/S\d*$/iu.test(normalized)
  );
}

function parseDisplayedDate(value: string | null | undefined) {
  const normalized = normalizeCalendarText(value);
  const match = normalized.match(DATE_PATTERN);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  return {
    year: Number.parseInt(year ?? "", 10),
    month: Number.parseInt(month ?? "", 10),
    day: Number.parseInt(day ?? "", 10),
    isoDate: `${year}-${(month ?? "").padStart(2, "0")}-${(day ?? "").padStart(2, "0")}`,
  };
}

async function readDisplayedDate(page: Page) {
  await page.locator(DATE_LABEL_SELECTOR).waitFor({ state: "visible", timeout: 5000 });
  const text = await page.locator(DATE_LABEL_SELECTOR).innerText();
  return parseDisplayedDate(text);
}

async function waitForTargetDate(page: Page, targetIsoDate: string) {
  await page.waitForFunction(
    ({ selector, target }) => {
      const text = document.querySelector(selector)?.textContent ?? "";
      const match = text.match(/(\d{4})\u5e74(\d{1,2})\u6708(\d{1,2})\u65e5/u);
      if (!match) {
        return false;
      }

      const nextIsoDate = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
      return nextIsoDate === target;
    },
    { selector: DATE_LABEL_SELECTOR, target: targetIsoDate },
    { timeout: 15000 }
  );
}

function diffDaysBetweenIsoDates(leftIsoDate: string, rightIsoDate: string) {
  const toUtcTime = (isoDate: string) => {
    const [year, month, day] = isoDate.split("-").map((value) => Number.parseInt(value, 10));
    return Date.UTC(year, month - 1, day);
  };

  return Math.round((toUtcTime(rightIsoDate) - toUtcTime(leftIsoDate)) / (24 * 60 * 60 * 1000));
}

async function clickOffsetButton(page: Page, offset: 1 | -1 | 7 | -7) {
  const button = page.locator(`#target_date_move a[data-offset="${offset}"]`).first();
  await button.waitFor({ state: "visible", timeout: 5000 });

  const previous = normalizeCalendarText(await page.locator(DATE_LABEL_SELECTOR).innerText());
  await button.click();
  await page.waitForFunction(
    ({ selector, lastValue }) => {
      const current = (document.querySelector(selector)?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim();
      return current.length > 0 && current !== lastValue;
    },
    { selector: DATE_LABEL_SELECTOR, lastValue: previous },
    { timeout: 15000 }
  );
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(200);
}

async function navigateWithOffsetButtons(
  page: Page,
  currentIsoDate: string,
  targetIsoDate: string
) {
  let remainingDays = diffDaysBetweenIsoDates(currentIsoDate, targetIsoDate);

  while (Math.abs(remainingDays) >= 7) {
    const step = remainingDays > 0 ? 7 : -7;
    await clickOffsetButton(page, step as 7 | -7);
    remainingDays -= step;
  }

  while (remainingDays !== 0) {
    const step = remainingDays > 0 ? 1 : -1;
    await clickOffsetButton(page, step as 1 | -1);
    remainingDays -= step;
  }
}

async function openMonthPicker(page: Page) {
  await page
    .locator("#navigation_calendar .datepicker-days th.datepicker-switch")
    .click({ timeout: 5000 });
  await page.waitForTimeout(150);
}

async function openYearPicker(page: Page) {
  await page
    .locator("#navigation_calendar .datepicker-months th.datepicker-switch")
    .click({ timeout: 5000 });
  await page.waitForTimeout(150);
}

async function chooseYear(page: Page, targetYear: number) {
  while (true) {
    const yearButtons = page.locator("#navigation_calendar .datepicker-years span.year");
    const visibleYears = (await yearButtons.allInnerTexts()).map((value) => value.trim());
    const targetIndex = visibleYears.findIndex(
      (value) => Number.parseInt(value, 10) === targetYear
    );

    if (targetIndex >= 0) {
      await yearButtons.nth(targetIndex).click();
      await page.waitForTimeout(150);
      return;
    }

    const switchText = normalizeCalendarText(
      await page
        .locator("#navigation_calendar .datepicker-years th.datepicker-switch")
        .innerText()
    );
    const match = switchText.match(YEAR_RANGE_PATTERN);
    if (!match) {
      throw new Error("Failed to resolve Apotool year picker range.");
    }

    const startYear = Number.parseInt(match[1] ?? "", 10);
    const endYear = Number.parseInt(match[2] ?? "", 10);

    if (targetYear < startYear) {
      await page.locator("#navigation_calendar .datepicker-years th.prev").click();
      await page.waitForTimeout(150);
      continue;
    }

    if (targetYear > endYear) {
      await page.locator("#navigation_calendar .datepicker-years th.next").click();
      await page.waitForTimeout(150);
      continue;
    }

    throw new Error(`Target year ${targetYear} is not visible in the Apotool year picker.`);
  }
}

async function chooseMonth(page: Page, targetMonth: number) {
  const monthIndex = targetMonth - 1;
  if (monthIndex < 0 || monthIndex > 11) {
    throw new Error(`Invalid Apotool target month: ${targetMonth}`);
  }

  await page.locator("#navigation_calendar .datepicker-months span.month").nth(monthIndex).click();
  await page.waitForTimeout(150);
}

async function chooseDay(page: Page, targetDay: number) {
  const dayCells = page.locator(
    "#navigation_calendar .datepicker-days td.day:not(.old):not(.new)"
  );
  const count = await dayCells.count();
  for (let index = 0; index < count; index += 1) {
    const cell = dayCells.nth(index);
    const value = Number.parseInt((await cell.innerText()).trim(), 10);
    if (value !== targetDay) {
      continue;
    }

    await cell.click();
    return;
  }

  throw new Error(`Failed to find target day ${targetDay} in the Apotool datepicker.`);
}

export function isTreatmentColumnName(value: string | null | undefined) {
  const normalized = normalizeCalendarText(value);
  return new RegExp(`^${CHAIR_PREFIX}\\d+$`, "u").test(normalized) || /^T\/S\d*$/iu.test(normalized);
}

export function isCounselingColumnName(value: string | null | undefined) {
  return normalizeCalendarText(value).includes(COUNSELING_TOKEN);
}

export const isTcColumnName = isCounselingColumnName;

export function parseApotoolTargetDate(value: string | null | undefined) {
  return parseDisplayedDate(value)?.isoDate ?? null;
}

export function resolveCalendarHeaderNames(rows: string[][]) {
  let bestHeaders: string[] = [];

  for (const row of rows) {
    const headers = row
      .map((cell) => normalizeCalendarText(cell))
      .filter((cell) => looksLikeCalendarHeader(cell));
    if (headers.length > bestHeaders.length) {
      bestHeaders = headers;
    }
  }

  return bestHeaders;
}

export function resolveCalendarColumnIndex(headers: string[], desiredColumnName: string) {
  const normalizedDesired = normalizeCalendarText(desiredColumnName);

  const exactIndex = headers.findIndex(
    (header) => normalizeCalendarText(header) === normalizedDesired
  );
  if (exactIndex >= 0) {
    return exactIndex;
  }

  if (normalizedDesired === COUNSELING_TOKEN) {
    return headers.findIndex((header) => isCounselingColumnName(header));
  }

  if (normalizedDesired.includes(COUNSELING_TOKEN)) {
    return headers.findIndex((header) =>
      normalizeCalendarText(header).includes(COUNSELING_TOKEN)
    );
  }

  if (normalizedDesired.includes(CHAIR_PREFIX) || normalizedDesired.includes("\u6cbb\u7642")) {
    return headers.findIndex((header) => isTreatmentColumnName(header));
  }

  if (normalizedDesired.toLowerCase().includes("t/s")) {
    return headers.findIndex((header) => /^T\/S\d*$/iu.test(normalizeCalendarText(header)));
  }

  return -1;
}

export async function getCalendarColumns(page: Page): Promise<CalendarColumn[]> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll("tr.caption td"))
      .map((cell) => {
        const className =
          cell.className
            .split(/\s+/)
            .map((value) => value.trim())
            .find((value) => /^col\d+$/i.test(value)) ?? "";
        const displayName = cell.textContent?.replace(/\s+/g, " ").trim() ?? "";
        return { className, displayName };
      })
      .filter((column) => column.className || column.displayName);
  });
}

export async function readCalendarHeaders(page: Page) {
  const columns = await getCalendarColumns(page);
  return columns
    .map((column) => normalizeCalendarText(column.displayName))
    .filter((header) => looksLikeCalendarHeader(header));
}

export async function resolveCalendarColumnClassName(page: Page, desiredColumnName: string) {
  const columns = await getCalendarColumns(page);
  const normalizedDesired = normalizeCalendarText(desiredColumnName);

  const exactMatch = columns.find(
    (column) => normalizeCalendarText(column.displayName) === normalizedDesired
  );
  if (exactMatch?.className) {
    return exactMatch.className;
  }

  if (normalizedDesired === COUNSELING_TOKEN) {
    const counselingColumn = columns.find((column) => isCounselingColumnName(column.displayName));
    if (counselingColumn?.className) {
      return counselingColumn.className;
    }
  }

  if (normalizedDesired.includes(COUNSELING_TOKEN)) {
    const counselingColumn = columns.find((column) =>
      normalizeCalendarText(column.displayName).includes(COUNSELING_TOKEN)
    );
    if (counselingColumn?.className) {
      return counselingColumn.className;
    }
  }

  if (normalizedDesired.includes(CHAIR_PREFIX) || normalizedDesired.includes("\u6cbb\u7642")) {
    const treatmentColumn = columns.find((column) => isTreatmentColumnName(column.displayName));
    if (treatmentColumn?.className) {
      return treatmentColumn.className;
    }
  }

  if (normalizedDesired.toLowerCase().includes("t/s")) {
    const tsColumn = columns.find((column) =>
      /^T\/S\d*$/iu.test(normalizeCalendarText(column.displayName))
    );
    if (tsColumn?.className) {
      return tsColumn.className;
    }
  }

  throw new Error(`Unknown Apotool column: ${desiredColumnName}`);
}

export async function navigateToDate(page: Page, dateString: string) {
  appointmentToolLogger.info("Navigating Apotool calendar.", { dateString });

  const currentDate = await readDisplayedDate(page);
  if (!currentDate) {
    throw new Error("Failed to resolve current Apotool calendar date.");
  }

  if (currentDate.isoDate === dateString) {
    return;
  }

  const [yearValue, monthValue, dayValue] = dateString.split("-");
  const targetYear = Number.parseInt(yearValue ?? "", 10);
  const targetMonth = Number.parseInt(monthValue ?? "", 10);
  const targetDay = Number.parseInt(dayValue ?? "", 10);

  if (
    !Number.isFinite(targetYear) ||
    !Number.isFinite(targetMonth) ||
    !Number.isFinite(targetDay)
  ) {
    throw new Error(`Invalid Apotool date string: ${dateString}`);
  }

  try {
    await openMonthPicker(page);
    await openYearPicker(page);
    await chooseYear(page, targetYear);
    await chooseMonth(page, targetMonth);
    await chooseDay(page, targetDay);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await waitForTargetDate(page, dateString);
    await page.waitForTimeout(300);
  } catch (error) {
    appointmentToolLogger.warn(
      "Apotool datepicker navigation failed. Falling back to toolbar date navigation.",
      {
        dateString,
        error: error instanceof Error ? error.message : String(error),
      }
    );
    await navigateWithOffsetButtons(page, currentDate.isoDate, dateString);
    await waitForTargetDate(page, dateString);
  }
}

export async function readCalendarGrid(page: Page): Promise<CalendarGrid> {
  appointmentToolLogger.info("Reading Apotool calendar grid.");

  const columns = await getCalendarColumns(page);
  if (columns.length === 0) {
    throw new Error("Failed to resolve Apotool calendar headers.");
  }

  const snapshot = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("a.waku"))
      .map((slot) => {
        const minutes = Number(slot.getAttribute("data-minutes"));
        const inner = slot.querySelector(".inner");
        if (!(inner instanceof HTMLElement)) {
          return null;
        }

        const height = Number.parseInt(inner.style.height || "0", 10) || 0;
        const durationCells = Math.max(1, Math.round(height / 80));
        const durationMin = durationCells * 15;
        const isCancelled =
          inner.className.includes("bg_gray") || inner.className.includes("closed");
        const td = slot.closest("td");
        const className =
          td?.className
            .split(/\s+/)
            .map((value) => value.trim())
            .find((value) => /^col\d+$/i.test(value)) ?? null;

        return {
          minutes,
          durationMin,
          className,
          isCancelled,
        };
      })
      .filter(
        (
          value
        ): value is {
          minutes: number;
          durationMin: number;
          className: string;
          isCancelled: boolean;
        } =>
          value !== null &&
          value.className !== null &&
          Number.isFinite(value.minutes) &&
          !value.isCancelled
      );
  });

  const classNameToDisplayName = new Map(
    columns
      .filter((column) => column.className && column.displayName)
      .map((column) => [column.className, normalizeCalendarText(column.displayName)])
  );

  const calendarData: CalendarGrid = new Map();
  for (const column of columns) {
    const displayName = normalizeCalendarText(column.displayName);
    if (displayName) {
      calendarData.set(displayName, new Set());
    }
  }

  for (const appointment of snapshot) {
    const displayName = classNameToDisplayName.get(appointment.className);
    if (!displayName) {
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
      calendarData.get(displayName)?.add(key);
    }
  }

  return calendarData;
}
