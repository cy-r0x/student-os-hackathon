export const TZ = "Asia/Dhaka";

export function todayKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

/** Notion datetimes carry an offset; one without it is already wall-clock time, so never reinterpret it in the server's zone. */
function zonedDate(iso: string): Date | null {
  if (!/T\d{2}:\d{2}/.test(iso) || !HAS_OFFSET.test(iso)) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function calendarDay(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  if (!HAS_OFFSET.test(iso)) return iso.slice(0, 10);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** HH:mm in the radar timezone, or null for date-only values. */
export function clockTime(iso: string): string | null {
  const date = zonedDate(iso);
  if (!date) {
    const match = iso.match(/T(\d{2}:\d{2})/);
    return match ? match[1] : null;
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function addDays(day: string, days: number): string {
  const t = Date.parse(`${day}T00:00:00Z`) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export function diffDays(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export function formatDue(due: string | null, now = new Date()): string {
  if (!due) return "No date";
  const day = calendarDay(due);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return due;
  const today = todayKey(now);
  const diff = diffDays(today, day);
  const pretty = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
  const time = clockTime(due);
  const when = time ? `${pretty} ${time}` : pretty;
  if (!Number.isFinite(diff)) return when;
  if (diff < 0) return `${Math.abs(diff)}d overdue · ${when}`;
  if (diff === 0) return `Today · ${when}`;
  if (diff === 1) return `Tomorrow · ${when}`;
  return when;
}
