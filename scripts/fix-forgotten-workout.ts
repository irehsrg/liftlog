/**
 * Investigate (and optionally fix) workouts with an implausibly long duration,
 * e.g. one where you forgot to hit "Finish" so the timer kept running for hours.
 *
 * Background: `Workout.duration` is stored in SECONDS (it's the live elapsed
 * timer at the moment "Finish" is tapped). The UI shows `duration / 60` minutes.
 * If you forget to finish a session, `duration` ends up as the wall-clock gap
 * between starting the workout and finally tapping Finish — e.g. 1662 min.
 *
 * A better estimate of the real session length is:
 *   (timestamp of the last logged set) - (workout start time).
 *
 * Usage:
 *   npx tsx scripts/fix-forgotten-workout.ts                 # report only (dry run)
 *   npx tsx scripts/fix-forgotten-workout.ts --fix           # apply estimates
 *   npx tsx scripts/fix-forgotten-workout.ts --id <id> --fix # only this workout
 *   npx tsx scripts/fix-forgotten-workout.ts --threshold 180 # flag > 180 min
 *   npx tsx scripts/fix-forgotten-workout.ts --id <id> --set-minutes 75 --fix
 */
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

dotenv.config({ path: ".env.local" });

const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const valueOf = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const APPLY = has("--fix");
const ONLY_ID = valueOf("--id");
const SET_MINUTES = valueOf("--set-minutes");
// Flag anything longer than this many minutes as suspicious (default 3 hours).
const THRESHOLD_MIN = Number(valueOf("--threshold") ?? 180);
const THRESHOLD_SEC = THRESHOLD_MIN * 60;

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const fmtMin = (sec: number | null) =>
  sec == null ? "—" : `${Math.round(sec / 60)} min (${sec}s)`;

async function run() {
  const where = ONLY_ID
    ? "WHERE id = ?"
    : "WHERE duration IS NOT NULL AND duration > ?";
  const params: (string | number)[] = ONLY_ID ? [ONLY_ID] : [THRESHOLD_SEC];

  const workouts = await client.execute({
    sql: `SELECT id, date, finishedAt, duration, notes FROM Workout ${where} ORDER BY date DESC`,
    args: params,
  });

  if (workouts.rows.length === 0) {
    console.log(
      ONLY_ID
        ? `No workout found with id ${ONLY_ID}.`
        : `No workouts with duration over ${THRESHOLD_MIN} min. Nothing to fix.`
    );
    await client.close();
    return;
  }

  console.log(
    `Found ${workouts.rows.length} suspicious workout(s)` +
      (ONLY_ID ? "" : ` (duration > ${THRESHOLD_MIN} min)`) +
      `:\n`
  );

  for (const w of workouts.rows) {
    const id = w.id as string;
    const startMs = new Date(w.date as string).getTime();
    const storedSec = w.duration as number | null;

    // Pull the set timestamps to estimate the real session length.
    const sets = await client.execute({
      sql: `SELECT createdAt FROM WorkoutSet WHERE workoutId = ? ORDER BY createdAt ASC`,
      args: [id],
    });

    let estimateSec: number | null = null;
    if (sets.rows.length > 0) {
      const lastSetMs = new Date(
        sets.rows[sets.rows.length - 1].createdAt as string
      ).getTime();
      estimateSec = Math.max(0, Math.round((lastSetMs - startMs) / 1000));
    }

    console.log(`Workout ${id}`);
    console.log(`  Started:     ${w.date}`);
    console.log(`  Finished:    ${w.finishedAt ?? "(never finished)"}`);
    console.log(`  Stored:      ${fmtMin(storedSec)}`);
    console.log(`  Sets logged: ${sets.rows.length}`);
    console.log(`  Estimate:    ${fmtMin(estimateSec)}  (last set − start)`);

    // Decide the corrected value.
    let newSec: number | null;
    if (SET_MINUTES != null && ONLY_ID) {
      newSec = Math.round(Number(SET_MINUTES) * 60);
    } else if (estimateSec != null && estimateSec > 0) {
      newSec = estimateSec;
    } else {
      // No sets to estimate from — clear the bogus value rather than guess.
      newSec = null;
    }

    console.log(`  → Proposed:  ${fmtMin(newSec)}`);

    if (APPLY) {
      await client.execute({
        sql: `UPDATE Workout SET duration = ? WHERE id = ?`,
        args: [newSec, id],
      });
      console.log(`  ✓ Updated.`);
    }
    console.log("");
  }

  if (!APPLY) {
    console.log("Dry run — nothing changed. Re-run with --fix to apply.");
  }

  await client.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
