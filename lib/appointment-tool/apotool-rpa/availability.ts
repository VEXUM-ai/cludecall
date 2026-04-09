import { appointmentToolLogger } from "@/lib/appointment-tool/logger";
import { COLUMNS } from "@/lib/appointment-tool/apotool-rpa/calendar";
import { areCellsFree, getCells, timeToMinutes } from "@/lib/appointment-tool/apotool-rpa/time-slots";

type CalendarGrid = Map<string, Set<string>>;

type RawAvailabilitySlot = {
  start_time: string;
  tc_unit: string;
  treatment_unit: string;
};

export function findAvailableSlots(calendarData: CalendarGrid): RawAvailabilitySlot[] {
  const results: RawAvailabilitySlot[] = [];
  const seen = new Set<string>();
  const startMin = timeToMinutes("10:00");
  const endMin = timeToMinutes("18:00");

  for (let tcStartMin = startMin; tcStartMin < endMin; tcStartMin += 15) {
    const tcStart = `${String(Math.floor(tcStartMin / 60)).padStart(2, "0")}:${String(tcStartMin % 60).padStart(2, "0")}`;
    if (tcStartMin + 90 > endMin) {
      continue;
    }

    const tcCells = getCells(tcStart, 30);
    const treatmentCells = getCells(
      `${String(Math.floor((tcStartMin + 30) / 60)).padStart(2, "0")}:${String((tcStartMin + 30) % 60).padStart(2, "0")}`,
      60
    );

    let found = false;
    for (const tcColumn of COLUMNS.TC) {
      const occupiedTc = calendarData.get(tcColumn) ?? new Set<string>();
      if (!areCellsFree(tcCells, occupiedTc)) {
        continue;
      }

      for (const treatmentColumn of COLUMNS.TREATMENT) {
        const occupiedTreatment = calendarData.get(treatmentColumn) ?? new Set<string>();
        if (!areCellsFree(treatmentCells, occupiedTreatment)) {
          continue;
        }

        if (!seen.has(tcStart)) {
          results.push({
            start_time: tcStart,
            tc_unit: tcColumn,
            treatment_unit: treatmentColumn,
          });
          seen.add(tcStart);
          found = true;
        }
        break;
      }

      if (found) {
        break;
      }
    }

    if (found) {
      continue;
    }

    for (const tcColumn of COLUMNS.TREATMENT) {
      const occupiedTc = calendarData.get(tcColumn) ?? new Set<string>();
      if (!areCellsFree(tcCells, occupiedTc)) {
        continue;
      }

      for (const treatmentColumn of COLUMNS.TREATMENT) {
        const occupiedTreatment = calendarData.get(treatmentColumn) ?? new Set<string>();
        if (!areCellsFree(treatmentCells, occupiedTreatment)) {
          continue;
        }

        if (!seen.has(tcStart)) {
          results.push({
            start_time: tcStart,
            tc_unit: tcColumn,
            treatment_unit: treatmentColumn,
          });
          seen.add(tcStart);
          found = true;
        }
        break;
      }

      if (found) {
        break;
      }
    }
  }

  appointmentToolLogger.info("Apotool slot search complete.", { count: results.length });
  return results;
}
