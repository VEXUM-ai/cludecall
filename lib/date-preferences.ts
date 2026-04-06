type ResolveDatePreferenceArgs = {
  label: string;
  rawDateText: string | null;
  rawTimeRange: string | null;
  anchorAt: string;
  timeZone: string;
};

export type ResolvedPreferredSlot = {
  slot: {
    label: string;
    date: string | null;
    timeRange: string | null;
  };
  reviewNote: string | null;
  handoffNote: string | null;
  requiresConfirmation: boolean;
};

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"] as const;
const JAPANESE_NUMBER_DIGITS: Record<string, number> = {
  "〇": 0,
  "零": 0,
  "一": 1,
  "二": 2,
  "三": 3,
  "四": 4,
  "五": 5,
  "六": 6,
  "七": 7,
  "八": 8,
  "九": 9,
};

function normalizeText(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatPlainDate(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )}`;
}

function createPlainDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

function addPlainDays(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfWeekMonday(date: Date) {
  const weekday = date.getUTCDay();
  const offset = weekday === 0 ? 6 : weekday - 1;
  return addPlainDays(date, -offset);
}

function getLocalAnchorDate(anchorAt: string, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(anchorAt));
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return createPlainDate(year, month, day);
}

function detectRelativeWeekOffset(text: string) {
  if (text.includes("再来週")) {
    return 2;
  }
  if (text.includes("来週")) {
    return 1;
  }
  if (text.includes("今週")) {
    return 0;
  }
  return null;
}

function detectWeekday(text: string) {
  const match = text.match(
    /(?:^|[^\d一二三四五六七八九十百千〇零])([月火水木金土日])(?:曜日|曜)(?=$|[^\d一二三四五六七八九十百千〇零])/
  );
  if (!match) {
    return null;
  }
  const index = WEEKDAY_LABELS.indexOf(match[1] as (typeof WEEKDAY_LABELS)[number]);
  return index === -1 ? null : index + 1;
}

function detectWeekendPreference(text: string) {
  if (text.includes("平日")) {
    return "平日";
  }
  if (text.includes("土日") || text.includes("週末")) {
    return "土日";
  }
  return null;
}

function detectDayPart(text: string) {
  if (text.includes("午前") || text.includes("朝")) {
    return "午前";
  }
  if (text.includes("午後")) {
    return "午後";
  }
  if (text.includes("夕方")) {
    return "夕方";
  }
  if (text.includes("夜")) {
    return "夜";
  }
  return null;
}

function hasExactTime(text: string) {
  if (!text) {
    return false;
  }
  if (/(以降|以後|ごろ|頃|くらい|位|あたり)/.test(text)) {
    return false;
  }
  return /(?:^|[^\d])([01]?\d|2[0-3])(?::([0-5]\d)|時(?:半|[0-5]?\d分?)?)?/.test(text);
}

function parseJapaneseNumber(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  let total = 0;
  let current = 0;

  for (const char of normalized) {
    if (char === "十") {
      total += (current === 0 ? 1 : current) * 10;
      current = 0;
      continue;
    }

    const digit = JAPANESE_NUMBER_DIGITS[char];
    if (digit === undefined) {
      return null;
    }
    current += digit;
  }

  return total + current;
}

function parseExplicitDate(text: string, anchorDate: Date) {
  if (!text) {
    return null;
  }

  const fullMatch = text.match(
    /(?<year>20\d{2})[\/\-.年](?<month>\d{1,2})[\/\-.月](?<day>\d{1,2})日?/
  );
  if (fullMatch?.groups) {
    return createPlainDate(
      Number(fullMatch.groups.year),
      Number(fullMatch.groups.month),
      Number(fullMatch.groups.day)
    );
  }

  const monthDayMatch =
    text.match(/(?<month>\d{1,2})月(?<day>\d{1,2})日/) ??
    text.match(/(?<month>\d{1,2})\/(?<day>\d{1,2})(?!\d)/) ??
    text.match(
      /(?<month>[一二三四五六七八九十〇零]{1,3})月(?<day>[一二三四五六七八九十〇零]{1,3})日/
    );

  if (!monthDayMatch?.groups) {
    return null;
  }

  const parsedMonth = parseJapaneseNumber(monthDayMatch.groups.month);
  const parsedDay = parseJapaneseNumber(monthDayMatch.groups.day);
  if (parsedMonth === null || parsedDay === null) {
    return null;
  }

  let year = anchorDate.getUTCFullYear();
  let candidate = createPlainDate(year, parsedMonth, parsedDay);

  if (candidate.getTime() < anchorDate.getTime()) {
    year += 1;
    candidate = createPlainDate(year, parsedMonth, parsedDay);
  }

  return candidate;
}

function nextWeekdayFromAnchor(anchorDate: Date, weekday: number) {
  const current = anchorDate.getUTCDay() === 0 ? 7 : anchorDate.getUTCDay();
  const delta = weekday >= current ? weekday - current : 7 - (current - weekday);
  return addPlainDays(anchorDate, delta);
}

export function resolvePreferredSlot(args: ResolveDatePreferenceArgs): ResolvedPreferredSlot | null {
  const rawDateText = normalizeText(args.rawDateText);
  const rawTimeRange = normalizeText(args.rawTimeRange);
  const combinedText = [rawDateText, rawTimeRange].filter(Boolean).join(" / ");

  if (!combinedText) {
    return null;
  }

  const anchorDate = getLocalAnchorDate(args.anchorAt, args.timeZone);
  const explicitDate = parseExplicitDate(combinedText, anchorDate);
  const relativeWeekOffset = detectRelativeWeekOffset(combinedText);
  const weekday = detectWeekday(combinedText);
  const weekendPreference = detectWeekendPreference(combinedText);
  const dayPart = detectDayPart(combinedText);
  const exactTime = hasExactTime(combinedText);

  let resolvedDate: string | null = null;
  let resolvedTimeRange = rawTimeRange || null;
  let reviewNote: string | null = null;
  let requiresConfirmation = false;

  if (relativeWeekOffset !== null) {
    const weekStart = addPlainDays(startOfWeekMonday(anchorDate), relativeWeekOffset * 7);
    const weekEnd = addPlainDays(weekStart, 6);

    if (weekday !== null) {
      const targetDate = addPlainDays(weekStart, weekday - 1);
      resolvedDate = formatPlainDate(targetDate);
      requiresConfirmation = !exactTime;
      reviewNote = `${args.label}: 相対日時 ${combinedText} -> ${resolvedDate}${
        dayPart ? ` / ${dayPart}` : ""
      }${requiresConfirmation ? " / 具体時刻要確認" : ""}`;
    } else {
      resolvedDate = `${formatPlainDate(weekStart)}〜${formatPlainDate(weekEnd)}`;
      requiresConfirmation = true;
      const dayScope = weekendPreference ? ` / ${weekendPreference}` : "";
      const partScope = dayPart ? ` / ${dayPart}` : "";
      reviewNote = `${args.label}: 相対日時 ${combinedText} -> ${resolvedDate}${dayScope}${partScope} / 具体日程要確認`;
    }
  } else if (explicitDate) {
    resolvedDate = formatPlainDate(explicitDate);
    if (dayPart && !resolvedTimeRange) {
      resolvedTimeRange = dayPart;
    }
    requiresConfirmation = !exactTime;
    if (rawDateText && rawDateText !== resolvedDate) {
      reviewNote = `${args.label}: ${rawDateText} -> ${resolvedDate}${
        requiresConfirmation ? " / 時刻要確認" : ""
      }`;
    } else if (requiresConfirmation && resolvedDate) {
      reviewNote = `${args.label}: ${resolvedDate} / 時刻要確認`;
    }
  } else if (weekday !== null) {
    const targetDate = nextWeekdayFromAnchor(anchorDate, weekday);
    resolvedDate = formatPlainDate(targetDate);
    requiresConfirmation = true;
    reviewNote = `${args.label}: 曜日指定 ${combinedText} -> ${resolvedDate}${
      dayPart ? ` / ${dayPart}` : ""
    } / 週の確認要`;
  } else if (weekendPreference || dayPart) {
    requiresConfirmation = true;
    reviewNote = `${args.label}: ${combinedText} / 相対的な希望のため具体日時要確認`;
  }

  if (!resolvedTimeRange && dayPart) {
    resolvedTimeRange = `${dayPart}${requiresConfirmation ? " / 要確認" : ""}`;
  } else if (resolvedTimeRange && requiresConfirmation && !resolvedTimeRange.includes("要確認")) {
    resolvedTimeRange = `${resolvedTimeRange} / 要確認`;
  }

  const displayDate =
    resolvedDate && rawDateText && rawDateText !== resolvedDate
      ? `${rawDateText} -> ${resolvedDate}`
      : resolvedDate ?? rawDateText ?? null;
  const displayTimeRange =
    resolvedTimeRange ||
    (rawTimeRange ? `${rawTimeRange}${requiresConfirmation ? " / 要確認" : ""}` : null);

  return {
    slot: {
      label: args.label,
      date: displayDate,
      timeRange: displayTimeRange,
    },
    reviewNote,
    handoffNote: reviewNote,
    requiresConfirmation,
  };
}
