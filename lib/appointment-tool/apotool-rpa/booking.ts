import type { Page } from "playwright";

import type { AppointmentAvailabilityCandidate, ServiceMenuMapping } from "@/lib/types";
import { appointmentToolLogger } from "@/lib/appointment-tool/logger";
import { takeErrorScreenshot } from "@/lib/appointment-tool/apotool-rpa/session-manager";

type BookingParams = {
  patientNameKana: string;
  phoneNumber: string;
  candidate: AppointmentAvailabilityCandidate;
  menuMapping: ServiceMenuMapping;
};

type BookingResult = {
  success: boolean;
  message: string;
  tc_orphaned: boolean;
};

export async function bookAppointment(
  page: Page,
  params: BookingParams
): Promise<BookingResult> {
  appointmentToolLogger.info("Starting Apotool booking execution.", {
    patientNameKana: params.patientNameKana,
    candidateId: params.candidate.id,
  });

  const tcResult = await registerTc(page, params);
  if (!tcResult.success) {
    return {
      success: false,
      message: "予約登録に失敗しました。後ほどスタッフからご連絡いたします。",
      tc_orphaned: false,
    };
  }

  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  const treatmentResult = await registerTreatment(page, params);
  if (!treatmentResult.success) {
    appointmentToolLogger.warn("TC registration succeeded but treatment registration failed.");
    return {
      success: false,
      message: "予約登録に失敗しました。後ほどスタッフからご連絡いたします。",
      tc_orphaned: true,
    };
  }

  return {
    success: true,
    message: "予約登録が完了しました",
    tc_orphaned: false,
  };
}

async function registerTc(page: Page, params: BookingParams) {
  try {
    await clickCalendarCell(page, params.candidate.tcUnit, params.candidate.tcStartTime);
    await page.waitForTimeout(2000);

    await clickNewPatientLink(page);
    await fillNewPatientName(page, params.patientNameKana, params.phoneNumber);
    await setTimeRange(page, params.candidate.tcStartTime, params.candidate.tcEndTime);
    await selectDropdownByName(
      page,
      "menu_id",
      params.menuMapping.apotoolMenuPrimary ?? "初診   (60分)"
    );
    await page.waitForTimeout(1500);

    if (params.menuMapping.apotoolMenuSecondary) {
      await selectDropdownByName(page, "menu2_id", params.menuMapping.apotoolMenuSecondary);
    }

    await selectDropdownByName(page, "staff_id", "WEB");
    await clickRegisterButton(page);
    return { success: true };
  } catch (error) {
    appointmentToolLogger.error("TC registration failed.", error);
    await takeErrorScreenshot("tc-register-error");
    return { success: false };
  }
}

async function registerTreatment(page: Page, params: BookingParams) {
  try {
    await clickCalendarCell(
      page,
      params.candidate.treatmentUnit,
      params.candidate.treatmentStartTime
    );
    await page.waitForTimeout(2000);

    await clickNewPatientLink(page);
    await fillNewPatientName(page, params.patientNameKana, "");
    await setTimeRange(page, params.candidate.treatmentStartTime, params.candidate.treatmentEndTime);
    await selectDropdownByName(
      page,
      "menu_id",
      params.menuMapping.apotoolMenuPrimary ?? "初診   (60分)"
    );
    await selectDropdownByName(page, "staff_id", "WEB");
    await clickRegisterButton(page);
    return { success: true };
  } catch (error) {
    appointmentToolLogger.error("Treatment registration failed.", error);
    await takeErrorScreenshot("treatment-register-error");
    return { success: false };
  }
}

async function clickCalendarCell(page: Page, columnName: string, time: string) {
  const colIndex = getColumnIndex(columnName);
  const [hour, minute] = time.split(":");
  const timeStr = `${Number(hour)}:${minute}`;

  const scrolled = await page.evaluate(
    ({ columnIndex, targetTime }) => {
      for (const row of document.querySelectorAll("tr")) {
        const th = row.querySelector("th");
        if (!th || th.textContent?.trim() !== targetTime) {
          continue;
        }

        const tds = row.querySelectorAll("td");
        if (tds.length > columnIndex) {
          tds[columnIndex]?.scrollIntoView({ block: "center" });
          return true;
        }
      }
      return false;
    },
    { columnIndex: colIndex, targetTime: timeStr }
  );

  if (!scrolled) {
    throw new Error(`Calendar cell not found: ${columnName} ${time}`);
  }

  await page.waitForTimeout(500);
  const cellBox = await page.evaluate(
    ({ columnIndex, targetTime }) => {
      for (const row of document.querySelectorAll("tr")) {
        const th = row.querySelector("th");
        if (!th || th.textContent?.trim() !== targetTime) {
          continue;
        }
        const tds = row.querySelectorAll("td");
        if (tds.length > columnIndex) {
          const rect = tds[columnIndex]?.getBoundingClientRect();
          if (!rect) {
            return null;
          }
          return { x: rect.x + rect.width - 5, y: rect.y + 5 };
        }
      }
      return null;
    },
    { columnIndex: colIndex, targetTime: timeStr }
  );

  if (!cellBox) {
    throw new Error(`Failed to resolve calendar cell coordinates: ${columnName} ${time}`);
  }

  await page.mouse.click(cellBox.x, cellBox.y);
  await page.waitForTimeout(1000);

  const dialogTitle = await page.evaluate(() => {
    for (const title of document.querySelectorAll(".ui-dialog-title")) {
      if ((title as HTMLElement).offsetParent !== null) {
        return title.textContent?.trim() ?? null;
      }
    }
    return null;
  });

  if (dialogTitle === "予約編集") {
    await page.evaluate(() => {
      for (const button of document.querySelectorAll(".ui-dialog-titlebar-close")) {
        if ((button as HTMLElement).offsetParent !== null) {
          (button as HTMLElement).click();
          break;
        }
      }
    });
    await page.waitForTimeout(500);
    throw new Error(`Cell ${columnName} ${time} is already occupied.`);
  }
}

function getColumnIndex(columnName: string) {
  if (columnName.includes("①")) return 0;
  if (columnName.includes("②")) return 1;
  if (columnName.includes("③")) return 2;
  if (columnName.includes("④")) return 3;
  if (columnName.includes("⑤")) return 4;
  if (columnName.includes("カウンセリング")) return 5;
  if (columnName.includes("初診")) return 6;
  throw new Error(`Unknown Apotool column: ${columnName}`);
}

async function clickNewPatientLink(page: Page) {
  const clicked = await page.evaluate(() => {
    for (const element of document.querySelectorAll("a, span, button")) {
      if (element.textContent?.trim() === "新患登録" && (element as HTMLElement).offsetParent !== null) {
        (element as HTMLElement).click();
        return true;
      }
    }
    return false;
  });

  if (!clicked) {
    throw new Error("新患登録 link not found.");
  }

  await page.waitForTimeout(1000);
}

async function fillNewPatientName(page: Page, name: string, phone: string) {
  const nameInput = page.locator('input[name="new_patient_name"]');
  await nameInput.waitFor({ state: "visible", timeout: 3000 });
  await nameInput.fill(name);

  if (phone) {
    const phoneInput = page.locator('input[name="patient_tel"]');
    if ((await phoneInput.count()) > 0) {
      await phoneInput.fill(phone);
    }
  }

  await nameInput.press("Enter");
  await page.waitForTimeout(1500);
}

async function selectDropdownByName(page: Page, name: string, optionText: string) {
  const select = page.locator(`select[name="${name}"]`).first();
  await select.waitFor({ state: "visible", timeout: 5000 });

  const value = await select.evaluate((element, text) => {
    const selectElement = element as HTMLSelectElement;
    for (const option of Array.from(selectElement.options)) {
      if (option.text.trim() === text) {
        return option.value;
      }
    }

    const normalized = text.replace(/\s+/g, "");
    for (const option of Array.from(selectElement.options)) {
      const optionNormalized = option.text.trim().replace(/\s+/g, "");
      if (optionNormalized.startsWith(normalized) || optionNormalized === normalized) {
        return option.value;
      }
    }

    for (const option of Array.from(selectElement.options)) {
      if (option.text.includes(text)) {
        return option.value;
      }
    }

    return null;
  }, optionText);

  if (value === null) {
    throw new Error(`Option not found in ${name}: ${optionText}`);
  }

  await select.selectOption(value);
}

async function setTimeRange(page: Page, startTime: string, endTime: string) {
  const [startHour, startMinute] = startTime.split(":");
  const [endHour, endMinute] = endTime.split(":");

  await page.locator('select[name="starts_at_hr"]').first().selectOption(startHour);
  await page.locator('select[name="starts_at_mi"]').first().selectOption(startMinute);
  await page.locator('select[name="ends_at_hr"]').first().selectOption(endHour);

  const endMinuteSelect = page.locator('select[name="ends_at_mi"]').first();
  const endMinuteValue = await endMinuteSelect.evaluate((element, targetMinute) => {
    const selectElement = element as HTMLSelectElement;
    for (const option of Array.from(selectElement.options)) {
      if (option.value === targetMinute || option.text.startsWith(targetMinute)) {
        return option.value;
      }
    }
    return null;
  }, endMinute);

  if (endMinuteValue) {
    await endMinuteSelect.selectOption(endMinuteValue);
  }
}

async function clickRegisterButton(page: Page) {
  const clicked = await page.evaluate(() => {
    for (const button of document.querySelectorAll("button, input[type=submit], a")) {
      const text = button.textContent?.trim().replace(/\s+/g, "") ?? "";
      if (text === "登録" && (button as HTMLElement).offsetParent !== null) {
        if (text.includes("連続") || text.includes("新患")) {
          continue;
        }
        (button as HTMLElement).click();
        return true;
      }
    }
    return false;
  });

  if (!clicked) {
    throw new Error("Register button not found.");
  }

  await page.waitForTimeout(3000);
  await page.waitForLoadState("networkidle");
}
