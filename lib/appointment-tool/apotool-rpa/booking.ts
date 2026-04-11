import type { Page } from "playwright";

import type {
  AppointmentAvailabilityCandidate,
  ServiceMenuMapping,
} from "@/lib/types";
import { appointmentToolLogger } from "@/lib/appointment-tool/logger";
import * as calendar from "@/lib/appointment-tool/apotool-rpa/calendar";
import { takeErrorScreenshot } from "@/lib/appointment-tool/apotool-rpa/session-manager";

type BookingParams = {
  patientName: string;
  phoneNumber: string;
  candidate: AppointmentAvailabilityCandidate;
  menuMapping: ServiceMenuMapping;
};

type BookingResult = {
  success: boolean;
  message: string;
  tc_orphaned: boolean;
};

const NEW_PATIENT_LABEL = "\u65b0\u60a3\u8ffd\u52a0";
const RESERVATION_DETAIL_LABEL = "\u4e88\u7d04\u8a73\u7d30";
const REGISTER_LABEL = "\u767b\u9332";
const DEFAULT_TC_MENU = "TC (30\u5206)";
const DEFAULT_TREATMENT_MENU = "\u521d\u8a3a (30\u5206)";

export async function bookAppointment(
  page: Page,
  params: BookingParams
): Promise<BookingResult> {
  appointmentToolLogger.info("Starting Apotool booking execution.", {
    patientName: params.patientName,
    candidateId: params.candidate.id,
  });

  const tcResult = await registerTc(page, params);
  if (!tcResult.success) {
    return {
      success: false,
      message:
        "\u4e88\u7d04\u767b\u9332\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u5f8c\u307b\u3069\u30b9\u30bf\u30c3\u30d5\u304b\u3089\u3054\u9023\u7d61\u3044\u305f\u3057\u307e\u3059\u3002",
      tc_orphaned: false,
    };
  }

  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  const treatmentResult = await registerTreatment(page, params);
  if (!treatmentResult.success) {
    appointmentToolLogger.warn(
      "TC registration succeeded but treatment registration failed."
    );
    return {
      success: false,
      message:
        "\u4e88\u7d04\u767b\u9332\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u5f8c\u307b\u3069\u30b9\u30bf\u30c3\u30d5\u304b\u3089\u3054\u9023\u7d61\u3044\u305f\u3057\u307e\u3059\u3002",
      tc_orphaned: true,
    };
  }

  return {
    success: true,
    message: "\u4e88\u7d04\u767b\u9332\u304c\u5b8c\u4e86\u3057\u307e\u3057\u305f\u3002",
    tc_orphaned: false,
  };
}

async function registerTc(page: Page, params: BookingParams) {
  try {
    await clickCalendarCell(page, params.candidate.tcUnit, params.candidate.tcStartTime);
    await page.waitForTimeout(1000);

    await clickNewPatientLink(page);
    await fillNewPatientName(page, params.patientName, params.phoneNumber);
    await setTimeRange(page, params.candidate.tcStartTime, params.candidate.tcEndTime);
    await selectDropdownByName(
      page,
      "menu_id",
      params.menuMapping.apotoolTcMenu ??
        params.menuMapping.apotoolMenuSecondary ??
        params.menuMapping.apotoolMenuPrimary ??
        DEFAULT_TC_MENU
    );
    await page.waitForTimeout(500);

    if (params.menuMapping.apotoolMenuSecondary) {
      await selectDropdownByName(page, "menu2_id", params.menuMapping.apotoolMenuSecondary);
    }

    await selectDropdownByName(page, "staff_id", WEB_STAFF_LABEL);
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
    await page.waitForTimeout(1000);

    await clickNewPatientLink(page);
    await fillNewPatientName(page, params.patientName, "");
    await setTimeRange(
      page,
      params.candidate.treatmentStartTime,
      params.candidate.treatmentEndTime
    );
    await selectDropdownByName(
      page,
      "menu_id",
      params.menuMapping.apotoolTreatmentMenu ??
        params.menuMapping.apotoolMenuPrimary ??
        DEFAULT_TREATMENT_MENU
    );
    await selectDropdownByName(page, "staff_id", WEB_STAFF_LABEL);
    await clickRegisterButton(page);
    return { success: true };
  } catch (error) {
    appointmentToolLogger.error("Treatment registration failed.", error);
    await takeErrorScreenshot("treatment-register-error");
    return { success: false };
  }
}

const WEB_STAFF_LABEL = "Web予約専用";

async function clickCalendarCell(page: Page, columnName: string, time: string) {
  const headers = await calendar.readCalendarHeaders(page);
  const columnIndex = calendar.resolveCalendarColumnIndex(headers, columnName);
  if (columnIndex < 0) {
    throw new Error(
      `Unknown Apotool column: ${columnName}. Resolved headers: ${headers.join(", ")}`
    );
  }
  const [hour, minute] = time.split(":");
  const targetTime = `${Number(hour)}:${minute}`;

  const cellBox = await page.evaluate(
    ({ resolvedColumnIndex, targetTimeText }) => {
      for (const row of Array.from(document.querySelectorAll("tr"))) {
        const th = row.querySelector("th");
        const rowLabel = (th?.textContent ?? "").replace(/\s+/g, " ").trim();
        if (!th || rowLabel !== targetTimeText) {
          continue;
        }

        const tds = Array.from(row.querySelectorAll("td"));
        const td = tds[resolvedColumnIndex] as HTMLElement | undefined;
        if (!td) {
          return null;
        }

        td.scrollIntoView({ block: "center", inline: "center" });
        const rect = td.getBoundingClientRect();
        return {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
        };
      }

      return null;
    },
    {
      resolvedColumnIndex: columnIndex,
      targetTimeText: targetTime,
    }
  );

  if (!cellBox) {
    throw new Error(`Calendar cell not found: ${calendar.normalizeCalendarText(columnName)} ${time}`);
  }

  await page.mouse.click(cellBox.x, cellBox.y);
  await page.waitForTimeout(1000);

  const visibleDialogTitle = await page.evaluate(() => {
    return (
      Array.from(document.querySelectorAll(".ui-dialog-title"))
        .find((title) => (title as HTMLElement).offsetParent !== null)
        ?.textContent?.trim() ?? null
    );
  });

  if (!visibleDialogTitle) {
    throw new Error(`Apotool dialog did not open: ${columnName} ${time}`);
  }

  if (visibleDialogTitle === RESERVATION_DETAIL_LABEL) {
    await page.evaluate(() => {
      const closeButton = Array.from(
        document.querySelectorAll(".ui-dialog-titlebar-close")
      ).find((button) => (button as HTMLElement).offsetParent !== null);
      if (closeButton instanceof HTMLElement) {
        closeButton.click();
      }
    });
    await page.waitForTimeout(500);
    throw new Error(`Cell ${columnName} ${time} is already occupied.`);
  }
}

async function clickNewPatientLink(page: Page) {
  const link = page.locator("#new_patient");
  if ((await link.count()) > 0 && (await link.isVisible())) {
    await link.click();
    await page.waitForTimeout(500);
    return;
  }

  const clicked = await page.evaluate((label) => {
    const target = Array.from(document.querySelectorAll("a, span, button")).find(
      (element) =>
        element.textContent?.trim() === label && (element as HTMLElement).offsetParent !== null
    );

    if (!(target instanceof HTMLElement)) {
      return false;
    }

    target.click();
    return true;
  }, NEW_PATIENT_LABEL);

  if (!clicked) {
    throw new Error(`${NEW_PATIENT_LABEL} link not found.`);
  }

  await page.waitForTimeout(500);
}

async function fillNewPatientName(page: Page, name: string, phone: string) {
  const nameInput = page.locator('input[name="new_patient_name"]').first();
  await nameInput.waitFor({ state: "visible", timeout: 5000 });
  await nameInput.fill(name);

  if (phone) {
    const phoneInput = page.locator('input[name="patient_tel"]').first();
    if ((await phoneInput.count()) > 0) {
      await phoneInput.fill(phone);
    }
  }
}

async function selectDropdownByName(page: Page, name: string, optionText: string) {
  const select = page.locator(`select[name="${name}"]`).first();
  await select.waitFor({ state: "visible", timeout: 5000 });

  const value = await select.evaluate((element, text) => {
    const selectElement = element as HTMLSelectElement;
    const normalizedText = text.replace(/\s+/g, "").trim();

    for (const option of Array.from(selectElement.options)) {
      if (option.text.trim() === text) {
        return option.value;
      }
    }

    for (const option of Array.from(selectElement.options)) {
      const normalizedOption = option.text.trim().replace(/\s+/g, "");
      if (normalizedOption === normalizedText || normalizedOption.startsWith(normalizedText)) {
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
  const registerButton = page.locator("#submit_entry");
  if ((await registerButton.count()) > 0 && (await registerButton.isVisible())) {
    await registerButton.click();
  } else {
    const clicked = await page.evaluate((label) => {
      const target = Array.from(
        document.querySelectorAll("button, input[type=submit], a")
      ).find(
        (button) =>
          button.textContent?.trim().replace(/\s+/g, "") === label &&
          (button as HTMLElement).offsetParent !== null
      );

      if (!(target instanceof HTMLElement)) {
        return false;
      }

      target.click();
      return true;
    }, REGISTER_LABEL);

    if (!clicked) {
      throw new Error("Register button not found.");
    }
  }

  await page.waitForTimeout(3000);
  await page.waitForLoadState("networkidle");
}
