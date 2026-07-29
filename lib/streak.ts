import { prisma } from "@/lib/db";
import { dayKey, weekKey, weeksBefore } from "@/lib/week";

/** Weekly goal used when there is no active program to read a day count from. */
export const DEFAULT_WEEKLY_GOAL = 3;

export type Streak = {
  /** Consecutive weeks that met the goal, including this week once it's met. */
  weeks: number;
  /** Distinct days trained so far in the current Mon–Sun week. */
  thisWeek: number;
  /** Training days per week the goal asks for — the active program's day count. */
  goal: number;
};

/**
 * Count consecutive Mon–Sun weeks in which the weekly goal was met.
 *
 * The week in progress can only ever *extend* the streak, never break it. A
 * streak counts weeks you finished, so being two days into an unfinished week
 * proves nothing yet — counting back starts at last week until this week's goal
 * is actually met. (The old version started counting at the current week, so
 * every Monday morning the streak read 0 until the goal was hit again.)
 *
 * `dates` are the timestamps of training days; duplicates on the same calendar
 * day collapse, so two sessions in one day count once.
 */
export function computeStreak(dates: Date[], goal: number, now: Date = new Date()): Streak {
  const target = Math.max(1, goal);

  const daysByWeek = new Map<string, Set<string>>();
  for (const date of dates) {
    const day = dayKey(date);
    const week = weekKey(day);
    let days = daysByWeek.get(week);
    if (!days) daysByWeek.set(week, (days = new Set<string>()));
    days.add(day);
  }

  const met = (week: string) => (daysByWeek.get(week)?.size ?? 0) >= target;

  const thisMonday = weekKey(dayKey(now));
  const thisWeek = daysByWeek.get(thisMonday)?.size ?? 0;

  let weeks = thisWeek >= target ? 1 : 0;
  // Terminates at the first missed week, and every week before the first logged
  // workout is a missed week.
  for (let back = 1; met(weeksBefore(thisMonday, back)); back++) weeks++;

  return { weeks, thisWeek, goal: target };
}

export async function getStreak(): Promise<Streak> {
  const [program, workouts] = await Promise.all([
    prisma.program.findFirst({
      where: { active: true },
      select: { _count: { select: { days: true } } },
    }),
    // A training day is a workout with at least one working set on the board.
    // `finishedAt` is not a reliable historical marker — it was backfilled only
    // for workouts that recorded a duration, and "Continue workout" clears it —
    // so keying the streak off it would erase weeks the user actually trained.
    prisma.workout.findMany({
      where: { sets: { some: { isWarmup: false } } },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
  ]);

  const goal = program?._count.days || DEFAULT_WEEKLY_GOAL;
  return computeStreak(
    workouts.map((w) => new Date(w.date)),
    goal
  );
}
