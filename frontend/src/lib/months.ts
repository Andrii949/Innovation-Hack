/** Month input/display helpers (T19): UI shows MM/RRRR, the API takes YYYY-MM. */

const MONTH_INPUT = /^(?:(\d{1,2})[/.](\d{4})|(\d{4})-(\d{1,2}))$/;

export function formatMonth(ym: string): string {
  const [year = "", month = ""] = ym.split("-");
  return `${month}/${year}`;
}

export function parseMonthInput(text: string): string | null {
  const match = MONTH_INPUT.exec(text.trim());
  if (!match) {
    return null;
  }
  const month = Number(match[1] ?? match[4]);
  const year = Number(match[2] ?? match[3]);
  if (!Number.isInteger(month) || month < 1 || month > 12 || year < 1900 || year > 2200) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}
