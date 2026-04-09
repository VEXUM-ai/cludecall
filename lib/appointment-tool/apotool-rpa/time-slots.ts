export function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function addMinutes(time: string, increment: number) {
  return minutesToTime(timeToMinutes(time) + increment);
}

export function getCells(startTime: string, durationMinutes: number, interval = 15) {
  const cells: string[] = [];
  let current = timeToMinutes(startTime);
  const end = current + durationMinutes;
  while (current < end) {
    cells.push(minutesToTime(current));
    current += interval;
  }
  return cells;
}

export function areCellsFree(cells: string[], occupiedSet: Set<string>) {
  return cells.every((cell) => !occupiedSet.has(cell));
}
