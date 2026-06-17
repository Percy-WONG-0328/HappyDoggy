const DEFAULT_TIMEZONE = "Asia/Hong_Kong";
const MINUTES_PER_DAY = 1440;

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timezone: string) {
  const cached = formatterCache.get(timezone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  formatterCache.set(timezone, formatter);
  return formatter;
}

export function getDefaultTimezone() {
  return DEFAULT_TIMEZONE;
}

export function getLocalDateKey(date: Date, timezone = DEFAULT_TIMEZONE) {
  const parts = getZonedParts(date, timezone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function getZonedParts(date: Date, timezone = DEFAULT_TIMEZONE): ZonedParts {
  const partList = getFormatter(timezone).formatToParts(date);
  const values: Record<string, number> = {};

  for (const part of partList) {
    if (part.type !== "literal") {
      values[part.type] = Number(part.value);
    }
  }

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second
  };
}

export function localMinutes(date: Date, timezone = DEFAULT_TIMEZONE) {
  const parts = getZonedParts(date, timezone);
  return parts.hour * 60 + parts.minute + parts.second / 60;
}

export function zonedTimeToUtc(
  dateKey: string,
  minutes: number,
  timezone = DEFAULT_TIMEZONE
) {
  const { year, month, day } = parseDateKey(dateKey);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);

  for (let i = 0; i < 3; i += 1) {
    const rendered = getZonedParts(new Date(guess), timezone);
    const renderedAsUtc = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
      rendered.second
    );
    const wantedAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    guess += wantedAsUtc - renderedAsUtc;
  }

  return new Date(guess);
}

export function addDays(dateKey: string, delta: number) {
  const { year, month, day } = parseDateKey(dateKey);
  const date = new Date(Date.UTC(year, month - 1, day + delta, 12, 0, 0));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function getDayBoundsUtc(dateKey: string, timezone = DEFAULT_TIMEZONE) {
  const start = zonedTimeToUtc(dateKey, 0, timezone);
  const end = zonedTimeToUtc(addDays(dateKey, 1), 0, timezone);
  return { start, end };
}

export function formatDateLabel(dateKey: string) {
  const { year, month, day } = parseDateKey(dateKey);
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function formatTime(minutes: number) {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY, minutes));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${pad(hour)}:${pad(minute)}`;
}

export function snapMinutes(minutes: number) {
  return Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(minutes / 15) * 15));
}

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
