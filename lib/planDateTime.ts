/**
 * Plan event_date is YYYY-MM-DD (local calendar day) and event_time is HH:mm (24h, local).
 * Never use `new Date("YYYY-MM-DD")` — it is UTC midnight and breaks "today" / past checks off US timezones.
 */

export function parseLocalYyyyMmDd(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function formatLocalYyyyMmDd(
  dateStr: string,
  locale: string = 'en-US',
  options?: Intl.DateTimeFormatOptions
): string {
  const dt = parseLocalYyyyMmDd(dateStr);
  if (!dt) return dateStr;
  return dt.toLocaleDateString(locale, options);
}

/**
 * Device-local wall time for notifications / chat meetups (same semantics as plan cards).
 * Avoids `new Date("YYYY-MM-DDTHH:mm")`, which can be treated as UTC in some runtimes.
 */
export function parseDeviceLocalEventDateTime(eventDate: string, eventTime: string): Date | null {
  const parts = eventTime.trim().split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] ?? '0', 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return buildLocalPlanDateTime(eventDate, h, m);
}

/** Calendar day in local TZ + wall-clock time (24h hour, minute). */
export function buildLocalPlanDateTime(dateStr: string, hour24: number, minute: number): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isInteger(hour24) || hour24 < 0 || hour24 > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return new Date(y, mo - 1, d, hour24, minute, 0, 0);
}

/** True if plan local date+time is not strictly after `now` (same instant or past). */
export function isPlanLocalDateTimePast(event_date: string, event_time: string, nowMs: number = Date.now()): boolean {
  const parts = event_time.trim().split(':');
  const h = parseInt(parts[0], 10);
  const min = parseInt(parts[1] ?? '0', 10);
  if (Number.isNaN(h) || Number.isNaN(min)) return true;
  const dt = buildLocalPlanDateTime(event_date, h, min);
  if (!dt) return true;
  return dt.getTime() <= nowMs;
}

/**
 * True if the plan's calendar day has fully ended in device-local time.
 * Use this for **display lists**: today's plans remain visible until midnight,
 * even after their scheduled time. Compare against `isPlanLocalDateTimePast`
 * which is used for **validation** when creating/editing.
 */
export function isPlanDayPast(event_date: string, now: Date = new Date()): boolean {
  const planDay = parseLocalYyyyMmDd(event_date);
  if (!planDay) return true;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return planDay.getTime() < todayStart.getTime();
}

/** Concise local calendar date for lists, e.g. `4/8/26`. */
export function formatPlanDisplayDateConcise(dateStr: string): string {
  const dt = parseLocalYyyyMmDd(dateStr);
  if (!dt) return dateStr;
  const m = dt.getMonth() + 1;
  const d = dt.getDate();
  const y = dt.getFullYear() % 100;
  return `${m}/${d}/${String(y).padStart(2, '0')}`;
}

/** Group chat list/header: expiry is end of the plan's `event_date` calendar day. */
export function formatPlanGroupChatExpiryLabel(eventDate: string): string {
  const day = formatLocalYyyyMmDd(eventDate, 'en-US', { month: 'short', day: 'numeric' });
  return `Expires end of day · ${day}`;
}

/** `event_time` as HH:mm → `6:00 PM` style (local wall clock). */
export function formatPlanTime12hShort(eventTime: string): string {
  const parts = eventTime.trim().split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] ?? '0', 10);
  if (Number.isNaN(h)) return eventTime;
  const d = new Date(2000, 0, 1, h, Number.isNaN(m) ? 0 : m, 0);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
