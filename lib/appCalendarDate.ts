/**
 * Single definition of “calendar day” for Ready Today, daily plan limits, and other
 * same-day app logic: the device’s local date (matches the phone’s “today”).
 *
 * Always use this instead of `toISOString().split('T')[0]` (UTC) or ad-hoc timezones.
 * Server-side cron cannot know each user’s timezone; client reset (useProfile) is authoritative.
 */
export function appCalendarDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
