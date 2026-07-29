/**
 * Calendar-day and Mon–Sun week helpers, shared by the streak logic.
 *
 * Everything here works on "YYYY-MM-DD" day strings rather than Date objects.
 * Week arithmetic is done in UTC on midnight-anchored days, so it can't be
 * knocked sideways by DST the way `setDate()` on a local Date can.
 *
 * Workout timestamps are stored as UTC instants, but "did I train on Sunday" is
 * a question about the *local* calendar. Set LIFTLOG_TIMEZONE (e.g.
 * "America/New_York") to pin day boundaries to your own zone. Left unset, days
 * fall on the server's timezone — which is UTC in production, so a Sunday
 * evening session can be recorded as Monday and land in the wrong week.
 */

const TIME_ZONE = process.env.LIFTLOG_TIMEZONE;

// en-CA with 2-digit parts renders ISO-style "2026-07-29".
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  ...(TIME_ZONE ? { timeZone: TIME_ZONE } : {}),
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DAY_MS = 86_400_000;

const midnightUtc = (day: string) => Date.parse(`${day}T00:00:00Z`);
const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The calendar day an instant falls on, as "YYYY-MM-DD". */
export function dayKey(date: Date): string {
  return dayFormatter.format(date);
}

/** The Monday that starts the week containing `day`, as "YYYY-MM-DD". */
export function weekKey(day: string): string {
  const ms = midnightUtc(day);
  const backToMonday = (new Date(ms).getUTCDay() + 6) % 7; // getUTCDay: 0=Sun
  return toDay(ms - backToMonday * DAY_MS);
}

/** The Monday `n` weeks before `week` (itself a Monday key). */
export function weeksBefore(week: string, n: number): string {
  return toDay(midnightUtc(week) - n * 7 * DAY_MS);
}
