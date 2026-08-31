/**
 * Explains the weekly streak against the real training log: which weeks met the
 * goal, which one ends the streak, and why.
 *
 * Read-only — it issues SELECTs and nothing else.
 *
 *   npx tsx scripts/check-my-streak.ts
 *   npx tsx scripts/check-my-streak.ts --weeks 30
 *
 * Needs TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN) in .env.local.
 *
 * The streak number itself comes from computeStreak, the same function the app
 * calls, so this can't drift from what the badge shows. Everything else here is
 * just the working shown.
 */
import dotenv from "dotenv";
import { createClient, type Row } from "@libsql/client";
import { computeStreak, DEFAULT_WEEKLY_GOAL } from "../lib/streak";
import { dayKey, weekKey, weeksBefore } from "../lib/week";

dotenv.config({ path: ".env.local" });

const WEEKS_SHOWN = (() => {
  const i = process.argv.indexOf("--weeks");
  const n = i === -1 ? NaN : Number(process.argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
})();

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error(
    "TURSO_DATABASE_URL is not set.\n" +
      "Run this where .env.local has your Turso credentials."
  );
  process.exit(1);
}

const db = createClient({
  url: url.replace(/^libsql:\/\//, "https://"),
  authToken: process.env.TURSO_AUTH_TOKEN,
});

/** Prisma writes SQLite DATETIME as epoch ms; hand-written rows may be ISO. */
function toDate(v: unknown): Date {
  if (typeof v === "bigint") return new Date(Number(v));
  if (typeof v === "number") return new Date(v);
  return new Date(String(v));
}

const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
const rpad = (s: string, n: number) => s.padStart(n);

async function main() {
  // Goal: the active program's day count, exactly as lib/streak resolves it.
  const programRows = await db.execute(
    `SELECT p.name AS name, COUNT(d.id) AS days
     FROM "Program" p LEFT JOIN "ProgramDay" d ON d.programId = p.id
     WHERE p.active = 1 GROUP BY p.id`
  );
  const program = programRows.rows[0];
  const programDays = program ? Number(program.days) : 0;
  const goal = programDays || DEFAULT_WEEKLY_GOAL;

  // A training day is a workout with at least one working set — the same rule
  // getStreak uses. Warm-up-only sessions deliberately do not count.
  const workoutRows = await db.execute(
    `SELECT w.id AS id, w.date AS date, d.name AS day,
            (SELECT COUNT(*) FROM "WorkoutSet" s
              WHERE s.workoutId = w.id AND s.isWarmup = 0) AS working
     FROM "Workout" w
     LEFT JOIN "ProgramDay" d ON d.id = w.programDayId
     ORDER BY w.date ASC`
  );

  const all = workoutRows.rows.map((r: Row) => ({
    id: String(r.id),
    date: toDate(r.date),
    day: r.day ? String(r.day) : "",
    working: Number(r.working ?? 0),
  }));
  const counted = all.filter((w) => w.working > 0);
  const skipped = all.filter((w) => w.working === 0);

  const streak = computeStreak(counted.map((w) => w.date), goal);

  console.log(`\n${"=".repeat(70)}`);
  console.log("STREAK EXPLAINER");
  console.log("=".repeat(70));
  console.log(
    `\n  Program:  ${program ? `${String(program.name)} (${programDays} days)` : "none active"}`
  );
  console.log(
    `  Goal:     ${goal} training days/week` +
      (programDays ? " — from the program's day count" : ` — default, no active program`)
  );
  console.log(`  Badge:    ${streak.weeks}w streak · ${streak.thisWeek}/${streak.goal} this week`);
  console.log(`  Counted:  ${counted.length} workouts with >=1 working set`);
  if (skipped.length) {
    console.log(
      `  Ignored:  ${skipped.length} workout(s) with no working sets — these never count as a training day`
    );
  }

  // --- Week by week --------------------------------------------------------
  const daysByWeek = new Map<string, Map<string, number>>();
  for (const w of counted) {
    const day = dayKey(w.date);
    const week = weekKey(day);
    let days = daysByWeek.get(week);
    if (!days) daysByWeek.set(week, (days = new Map()));
    days.set(day, (days.get(day) ?? 0) + 1);
  }

  const thisMonday = weekKey(dayKey(new Date()));
  const weeksBack: string[] = [];
  for (let back = 0; back < WEEKS_SHOWN; back++) weeksBack.push(weeksBefore(thisMonday, back));

  console.log(`\n  Last ${WEEKS_SHOWN} weeks, newest first (a day counts once, however many sessions):\n`);
  console.log(`  ${pad("week of", 12)}${rpad("days", 5)}  ${pad("", 8)}dates`);

  // The streak stops at the first missed week below the current one.
  let breakWeek: string | null = null;
  for (const week of weeksBack) {
    const days = daysByWeek.get(week);
    const count = days?.size ?? 0;
    const met = count >= goal;
    const isCurrent = week === thisMonday;
    if (!met && !isCurrent && breakWeek === null) breakWeek = week;

    const marker = isCurrent ? "now " : met ? "ok  " : "MISS";
    const dayList = days
      ? [...days.entries()]
          .sort()
          .map(([d, n]) => `${d.slice(5)}${n > 1 ? `(x${n})` : ""}`)
          .join(" ")
      : "—";
    console.log(`  ${pad(week, 12)}${rpad(`${count}/${goal}`, 5)}  ${marker}    ${dayList}`);
  }

  // --- Why it stops --------------------------------------------------------
  console.log("\n  Why the streak is where it is\n");
  if (breakWeek === null) {
    console.log(
      `  No missed week in the last ${WEEKS_SHOWN}. The streak is limited by how far\n` +
        "  back the log goes, or by a gap older than this window (--weeks to widen)."
    );
  } else {
    const had = daysByWeek.get(breakWeek)?.size ?? 0;
    console.log(
      `  The week of ${breakWeek} had ${had} of ${goal} training days, so counting\n` +
        `  back stops there. Everything before it is intact but unreachable — a\n` +
        "  streak only ever reaches back to its most recent gap."
    );
  }

  // A goal that grew is the other way a long streak collapses without any
  // training being missed, so show what the streak would be at lower goals.
  if (goal > 1) {
    console.log("\n  If the weekly goal were lower\n");
    for (let g = goal - 1; g >= Math.max(1, goal - 2); g--) {
      const alt = computeStreak(counted.map((w) => w.date), g);
      console.log(`  goal ${g}: ${alt.weeks}w streak`);
    }
    console.log(
      "\n  A much longer streak at a lower goal means the goal grew — adding a day to\n" +
        "  the program retroactively fails every week that met the old target."
    );
  }

  // --- Days that look like an uncorrected backfill -------------------------
  const doubled: string[] = [];
  for (const [week, days] of daysByWeek) {
    for (const [day, n] of days) if (n > 1) doubled.push(`${day} (${n} sessions, week of ${week})`);
  }
  if (doubled.length) {
    console.log("\n  Days with more than one session\n");
    for (const d of doubled.sort()) console.log(`  ${d}`);
    console.log(
      "\n  Each of these counts as ONE training day. If any is really two days entered\n" +
        "  in one sitting, open the workout's summary and set its date to the day it\n" +
        "  was trained — that gives the week its second day back."
    );
  }

  console.log("");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.close());
