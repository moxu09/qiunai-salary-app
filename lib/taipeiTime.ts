export const TAIPEI_TIME_ZONE = "Asia/Taipei";
export const TAIPEI_OFFSET = "+08:00";

function getTaipeiParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIPEI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value || "00";

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

export function getTaipeiDateInput(date = new Date()) {
  const parts = getTaipeiParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getTaipeiDateTimeInput(date = new Date()) {
  const parts = getTaipeiParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function getTaipeiMonthInput(date = new Date()) {
  const parts = getTaipeiParts(date);
  return `${parts.year}-${parts.month}`;
}

export function getTaipeiMonthStartInput(date = new Date()) {
  const month = getTaipeiMonthInput(date);
  return `${month}-01`;
}

export function getPreviousTaipeiMonthStartInput(date = new Date()) {
  const parts = getTaipeiParts(date);
  const previousMonth = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 2, 1, 12)
  );
  return getTaipeiMonthStartInput(previousMonth);
}

export function getPreviousTaipeiMonthEndInput(date = new Date()) {
  const parts = getTaipeiParts(date);
  const end = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, 0, 15, 59)
  );
  return getTaipeiDateTimeInput(end);
}

export function dateInputToTaipeiStartIso(value: string) {
  if (!value) return null;
  return new Date(`${value}T00:00:00${TAIPEI_OFFSET}`).toISOString();
}

export function dateInputToTaipeiEndIso(value: string) {
  if (!value) return null;
  return new Date(`${value}T23:59:59.999${TAIPEI_OFFSET}`).toISOString();
}

export function dateTimeInputToTaipeiIso(value: string) {
  if (!value) return new Date().toISOString();
  return new Date(`${value}:00${TAIPEI_OFFSET}`).toISOString();
}

export function monthInputToTaipeiRange(monthText: string) {
  const [yearText, monthTextValue] = monthText.split("-");
  const year = Number(yearText);
  const month = Number(monthTextValue);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1) {
    const currentMonth = getTaipeiMonthInput();
    return monthInputToTaipeiRange(currentMonth);
  }

  const monthStart = `${yearText}-${String(month).padStart(2, "0")}-01`;
  const nextMonthDate = new Date(Date.UTC(year, month, 1, 12));
  const nextMonthParts = getTaipeiParts(nextMonthDate);
  const nextMonthStart = `${nextMonthParts.year}-${nextMonthParts.month}-01`;
  const end = new Date(
    new Date(`${nextMonthStart}T00:00:00${TAIPEI_OFFSET}`).getTime() - 1
  );

  return {
    startIso: new Date(`${monthStart}T00:00:00${TAIPEI_OFFSET}`).toISOString(),
    endIso: end.toISOString(),
  };
}

export function formatTaipeiDateTime(
  value?: string | null,
  options: Intl.DateTimeFormatOptions = {}
) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("zh-TW", {
    timeZone: TAIPEI_TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  });
}

export function getTaipeiYear(value?: string | Date | null) {
  const date = value ? new Date(value) : new Date();
  return Number(getTaipeiParts(date).year);
}

export function getTaipeiMonthText(value?: string | Date | null) {
  const date = value ? new Date(value) : new Date();
  const parts = getTaipeiParts(date);
  return `${parts.year}-${parts.month}`;
}

export function getNextTaipeiMonthText(value?: string | Date | null) {
  const date = value ? new Date(value) : new Date();
  const parts = getTaipeiParts(date);
  const next = new Date(Date.UTC(Number(parts.year), Number(parts.month), 1, 12));
  return getTaipeiMonthText(next);
}
