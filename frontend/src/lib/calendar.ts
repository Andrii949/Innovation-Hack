/** Calendar math and Polish month labels. Presentation only; deadlines come from the API. */

const MONTHS = [
  "styczeń",
  "luty",
  "marzec",
  "kwiecień",
  "maj",
  "czerwiec",
  "lipiec",
  "sierpień",
  "wrzesień",
  "październik",
  "listopad",
  "grudzień",
];

const WEEKDAYS = ["poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota", "niedziela"];

export const WEEKDAY_LABELS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];

function monthParts(ym: string): { year: number; month: number } {
  const [yearPart = "0", monthPart = "1"] = ym.split("-");
  return { year: Number(yearPart), month: Number(monthPart) };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function shiftMonth(ym: string, delta: number): string {
  const { year, month } = monthParts(ym);
  const total = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (((total % 12) + 12) % 12) + 1;
  return `${nextYear}-${pad(nextMonth)}`;
}

export function daysInMonth(ym: string): number {
  const { year, month } = monthParts(ym);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export type CalendarCell = {
  date: string;
  inMonth: boolean;
};

function isoDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10);
}

/** Monday-first grid; adjacent-month dates fill leading/trailing weeks. */
export function monthGrid(ym: string): CalendarCell[] {
  const { year, month } = monthParts(ym);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const leading = (firstWeekday + 6) % 7;
  const total = daysInMonth(ym);
  const cells: CalendarCell[] = [];

  for (let offset = leading; offset > 0; offset -= 1) {
    cells.push({ date: isoDate(year, month, 1 - offset), inMonth: false });
  }
  for (let day = 1; day <= total; day += 1) {
    cells.push({ date: isoDate(year, month, day), inMonth: true });
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ date: isoDate(year, month + 1, nextDay), inMonth: false });
    nextDay += 1;
  }
  return cells;
}

export function monthLabel(ym: string): string {
  const { year, month } = monthParts(ym);
  return `${MONTHS[month - 1] ?? ym} ${year}`;
}

export function dayLabel(date: string): string {
  const { year, month } = monthParts(date);
  const weekday = new Date(Date.UTC(year, month - 1, Number(date.slice(8, 10)))).getUTCDay();
  const weekdayName = WEEKDAYS[(weekday + 6) % 7] ?? "";
  return `${weekdayName} · ${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;
}
