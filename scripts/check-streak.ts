// Sanity checks for the weekly-streak calculation. Pure function, no database.
// Run with:  npx tsx scripts/check-streak.ts
import { computeStreak } from "../lib/streak";
import { dayKey, weekKey, instantOnDay } from "../lib/week";

const day = (iso: string) => new Date(`${iso}T18:00:00Z`);

/** n training days in the Mon–Sun week starting `monday`. */
function week(monday: string, n: number): Date[] {
  const start = Date.parse(`${monday}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) =>
    day(new Date(start + i * 86_400_000).toISOString().slice(0, 10))
  );
}

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Wednesday of the week starting Mon 2026-07-27.
const now = day("2026-07-29");

// Nine full weeks of 4 days each, ending with last week (Mon 2026-07-20).
const nineWeeks = Array.from({ length: 9 }, (_, i) =>
  week(new Date(Date.parse("2026-07-20T00:00:00Z") - i * 7 * 86_400_000).toISOString().slice(0, 10), 4)
).flat();

check(
  "partial current week does not break the streak",
  computeStreak([...nineWeeks, ...week("2026-07-27", 2)], 4, now),
  { weeks: 9, thisWeek: 2, goal: 4 }
);

check(
  "current week counts once the goal is met",
  computeStreak([...nineWeeks, ...week("2026-07-27", 4)], 4, now),
  { weeks: 10, thisWeek: 4, goal: 4 }
);

check(
  "nothing logged yet this week still keeps the streak",
  computeStreak(nineWeeks, 4, now),
  { weeks: 9, thisWeek: 0, goal: 4 }
);

check(
  "a missed week ends the streak there",
  computeStreak([...week("2026-07-20", 4), ...week("2026-07-13", 2), ...week("2026-07-06", 4)], 4, now),
  { weeks: 1, thisWeek: 0, goal: 4 }
);

check(
  "goal follows the program's day count (3-day program)",
  computeStreak([...week("2026-07-20", 3), ...week("2026-07-13", 3)], 3, now),
  { weeks: 2, thisWeek: 0, goal: 3 }
);

check(
  "two sessions on one day count as one training day",
  computeStreak(
    // Mon–Wed logged, plus two extra sessions on the Wednesday: 3 days, not 5.
    [...week("2026-07-20", 3), day("2026-07-22"), day("2026-07-22")],
    4,
    now
  ),
  { weeks: 0, thisWeek: 0, goal: 4 }
);

// The old week-number math reset at New Year, so any streak spanning it was cut.
const acrossNewYear = Array.from({ length: 6 }, (_, i) =>
  week(new Date(Date.parse("2026-01-26T00:00:00Z") - i * 7 * 86_400_000).toISOString().slice(0, 10), 4)
).flat();
check(
  "streak survives the year boundary",
  computeStreak(acrossNewYear, 4, day("2026-02-04")),
  { weeks: 6, thisWeek: 0, goal: 4 }
);

// Same week number, different year — must not be merged into one bucket.
check(
  "weeks from different years are distinct",
  computeStreak([...week("2026-07-20", 4), ...week("2025-07-21", 4)], 4, now),
  { weeks: 1, thisWeek: 0, goal: 4 }
);

check("no workouts at all", computeStreak([], 4, now), { weeks: 0, thisWeek: 0, goal: 4 });

// Days are pinned to Central, not the UTC clock the server runs on.
check(
  "9pm Sunday CDT is still Sunday, not Monday",
  dayKey(new Date("2026-07-27T02:00:00Z")),
  "2026-07-26"
);
check(
  "11:30pm Sunday CST (winter, no DST slip) is still Sunday",
  dayKey(new Date("2026-01-05T05:30:00Z")),
  "2026-01-04"
);
check(
  "a late Sunday session counts toward the week that's ending",
  weekKey(dayKey(new Date("2026-07-27T02:00:00Z"))),
  "2026-07-20"
);
check(
  "late Sunday session completes the week it belongs to",
  computeStreak(
    [...week("2026-07-20", 3), new Date("2026-07-27T02:00:00Z")],
    4,
    now
  ),
  { weeks: 1, thisWeek: 0, goal: 4 }
);

// --- Backfilling a session onto the day it was trained ---------------------
// Logging two days of training in one sitting stamps both with today, which the
// streak correctly reads as a single training day. instantOnDay is how the
// second one gets moved back to its real day.

for (const d of ["2026-08-11", "2026-01-04", "2026-03-08", "2026-11-01", "2026-12-31"]) {
  // 03-08 and 11-01 straddle the US DST transitions, where a naive UTC-midnight
  // instant lands on the day before.
  check(`instantOnDay round-trips ${d}`, dayKey(instantOnDay(d)), d);
}

check(
  "UTC midnight would have filed the day before — instantOnDay does not",
  dayKey(new Date("2026-08-11T00:00:00Z")),
  "2026-08-10"
);

check(
  "backfilled second day restores a week that looked short",
  computeStreak(
    // Wednesday logged live; Tuesday's session entered the same evening but
    // corrected to Tuesday. Two distinct days, so a 2-day goal is met.
    [...week("2026-07-20", 1), instantOnDay("2026-07-21"), day("2026-07-22")],
    2,
    now
  ),
  { weeks: 1, thisWeek: 0, goal: 2 }
);

check(
  "uncorrected backfill is what broke the streak",
  computeStreak(
    // Both sessions stamped Wednesday: one distinct day, goal of 2 missed.
    [day("2026-07-22"), day("2026-07-22")],
    2,
    now
  ),
  { weeks: 0, thisWeek: 0, goal: 2 }
);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
