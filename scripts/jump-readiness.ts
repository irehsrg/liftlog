/**
 * Jump-readiness report: should the lifter shift from a strength-emphasis block
 * to a jump/power-emphasis block?
 *
 * Read-only — it issues SELECTs and nothing else.
 *
 *   npx tsx scripts/jump-readiness.ts            # last 10 weeks
 *   npx tsx scripts/jump-readiness.ts --weeks 16
 *
 * Needs TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN) in .env.local.
 *
 * The verdict is four explicit gates, printed with the numbers behind each, so
 * a disagreement is a disagreement about a threshold rather than about a black
 * box. Thresholds sit in GATES below.
 */
import dotenv from "dotenv";
import { createClient, type Row } from "@libsql/client";

dotenv.config({ path: ".env.local" });

const WEEKS = (() => {
  const i = process.argv.indexOf("--weeks");
  const n = i === -1 ? NaN : Number(process.argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
})();

const GATES = {
  /** Squat e1RM as a multiple of bodyweight. Past this, added maximal strength
   *  buys progressively less vertical jump and power work is the better spend. */
  relativeSquat: 1.8,
  /** Percent change in main-lift e1RM across the RECENT window under which
   *  strength is treated as stalled. Measured over the trailing weeks rather
   *  than end-to-end: a block that paid in week 2 and has been flat since is
   *  stalled now, but end-to-end change reads that as progress. */
  stalledPct: 2,
  /** Weeks of trailing data the stall check looks at. */
  recentWeeks: 4,
  /** Plyometric sets per week under which there is clear room to add jump work. */
  plyoSetsPerWeek: 6,
  /** Sessions per week under which the problem is adherence, not program design. */
  minSessionsPerWeek: 2.5,
};

/** Lifts whose e1RM trend actually speaks to jump ability. */
const JUMP_RELEVANT = [/squat/i, /deadlift/i, /clean/i, /snatch/i, /lunge/i, /step.?up/i, /hip thrust/i];

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error(
    "TURSO_DATABASE_URL is not set.\n" +
      "Add it (and TURSO_AUTH_TOKEN) to .env.local, or export them, then re-run."
  );
  process.exit(1);
}

const db = createClient({
  // libsql:// is WebSockets; https:// works everywhere. Same as lib/db.ts.
  url: url.replace(/^libsql:\/\//, "https://"),
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const EPLEY = (weight: number, reps: number) => (reps <= 1 ? weight : weight * (1 + reps / 30));

const num = (v: unknown): number | null => {
  const n = typeof v === "bigint" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Prisma writes SQLite DATETIME as epoch ms, but hand-written rows may be ISO. */
function toDate(v: unknown): Date {
  if (typeof v === "bigint") return new Date(Number(v));
  if (typeof v === "number") return new Date(v);
  return new Date(String(v));
}

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Least-squares slope of y over x. Null when x never varies. */
function slope(points: { x: number; y: number }[]): number | null {
  if (points.length < 2) return null;
  const mx = mean(points.map((p) => p.x))!;
  const my = mean(points.map((p) => p.y))!;
  let numer = 0;
  let denom = 0;
  for (const p of points) {
    numer += (p.x - mx) * (p.y - my);
    denom += (p.x - mx) ** 2;
  }
  return denom === 0 ? null : numer / denom;
}

const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
const rpad = (s: string, n: number) => s.padStart(n);
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

type SetRow = {
  date: Date;
  week: number;
  exercise: string;
  category: string;
  bodyPart: string;
  weight: number;
  reps: number;
  rpe: number | null;
  e1rm: number;
};

async function main() {
  const since = new Date(Date.now() - WEEKS * 7 * 86_400_000);

  const workoutRows = await db.execute({
    sql: `SELECT id, date, bodyweight, sleepHours, energy, duration, programDayId
          FROM "Workout"
          WHERE finishedAt IS NOT NULL AND date >= ?
          ORDER BY date ASC`,
    args: [since.getTime()],
  });

  if (workoutRows.rows.length === 0) {
    console.log(`No finished workouts in the last ${WEEKS} weeks. Nothing to analyze.`);
    return;
  }

  const workouts = workoutRows.rows.map((r: Row) => ({
    id: String(r.id),
    date: toDate(r.date),
    bodyweight: num(r.bodyweight),
    sleepHours: num(r.sleepHours),
    energy: num(r.energy),
    duration: num(r.duration),
    programDayId: r.programDayId ? String(r.programDayId) : null,
  }));

  const first = workouts[0].date;
  /** 0-indexed week since the first session in the window. */
  const weekOf = (d: Date) => Math.floor((d.getTime() - first.getTime()) / (7 * 86_400_000));
  const weekCount = weekOf(workouts[workouts.length - 1].date) + 1;

  const setRows = await db.execute({
    sql: `SELECT w.date AS date, e.name AS name, e.category AS category, e.bodyPart AS bodyPart,
                 s.weight AS weight, s.reps AS reps, s.rpe AS rpe
          FROM "WorkoutSet" s
          JOIN "Workout" w ON w.id = s.workoutId
          JOIN "Exercise" e ON e.id = s.exerciseId
          WHERE w.finishedAt IS NOT NULL AND w.date >= ? AND s.isWarmup = 0`,
    args: [since.getTime()],
  });

  const sets: SetRow[] = setRows.rows.map((r: Row) => {
    const date = toDate(r.date);
    const weight = num(r.weight) ?? 0;
    const reps = num(r.reps) ?? 0;
    return {
      date,
      week: weekOf(date),
      exercise: String(r.name),
      category: String(r.category),
      bodyPart: String(r.bodyPart),
      weight,
      reps,
      rpe: num(r.rpe),
      e1rm: EPLEY(weight, reps),
    };
  });

  // --- Program ------------------------------------------------------------
  const programRows = await db.execute(
    `SELECT p.name AS program, d.name AS day, d.dayOrder AS dayOrder,
            e.name AS exercise, e.category AS category, e.bodyPart AS bodyPart,
            pe.targetSets AS targetSets, pe.targetReps AS targetReps, pe.isMain AS isMain
     FROM "Program" p
     JOIN "ProgramDay" d ON d.programId = p.id
     LEFT JOIN "ProgramExercise" pe ON pe.programDayId = d.id
     LEFT JOIN "Exercise" e ON e.id = pe.exerciseId
     WHERE p.active = 1
     ORDER BY d.dayOrder ASC, pe.exerciseOrder ASC`
  );

  console.log(`\n${"=".repeat(72)}`);
  console.log(`JUMP-READINESS REPORT — last ${WEEKS} weeks`);
  console.log(`${fmtDate(first)} to ${fmtDate(workouts[workouts.length - 1].date)}`);
  console.log("=".repeat(72));

  console.log("\n## Active program\n");
  if (programRows.rows.length === 0) {
    console.log("  (no active program)");
  } else {
    console.log(`  ${String(programRows.rows[0].program)}`);
    let currentDay = "";
    for (const r of programRows.rows) {
      const day = String(r.day);
      if (day !== currentDay) {
        currentDay = day;
        console.log(`\n  ${day}`);
      }
      if (!r.exercise) continue;
      const main = num(r.isMain) ? " *" : "";
      console.log(
        `    ${pad(String(r.exercise), 28)} ${rpad(String(r.targetSets), 2)}x${pad(
          String(r.targetReps),
          6
        )} ${pad(String(r.category), 11)}${main}`
      );
    }
  }

  // --- Week by week -------------------------------------------------------
  console.log("\n## Week by week\n");
  console.log(
    `  ${pad("wk", 4)}${rpad("sess", 5)}${rpad("sets", 6)}${rpad("leg sets", 10)}${rpad(
      "plyo",
      6
    )}${rpad("tonnage", 10)}${rpad("bw", 7)}${rpad("sleep", 7)}${rpad("energy", 8)}`
  );

  type Week = {
    sessions: number;
    sets: number;
    legSets: number;
    plyoSets: number;
    tonnage: number;
    bw: number[];
    sleep: number[];
    energy: number[];
  };
  const weeks: Week[] = Array.from({ length: weekCount }, () => ({
    sessions: 0,
    sets: 0,
    legSets: 0,
    plyoSets: 0,
    tonnage: 0,
    bw: [],
    sleep: [],
    energy: [],
  }));

  for (const w of workouts) {
    const wk = weeks[weekOf(w.date)];
    wk.sessions++;
    if (w.bodyweight !== null) wk.bw.push(w.bodyweight);
    if (w.sleepHours !== null) wk.sleep.push(w.sleepHours);
    if (w.energy !== null) wk.energy.push(w.energy);
  }
  for (const s of sets) {
    const wk = weeks[s.week];
    if (!wk) continue;
    wk.sets++;
    wk.tonnage += s.weight * s.reps;
    if (s.bodyPart === "legs") wk.legSets++;
    if (s.category === "plyometric") wk.plyoSets++;
  }

  weeks.forEach((wk, i) => {
    const show = (v: number | null, digits = 1) => (v === null ? "—" : v.toFixed(digits));
    console.log(
      `  ${pad(String(i + 1), 4)}${rpad(String(wk.sessions), 5)}${rpad(String(wk.sets), 6)}${rpad(
        String(wk.legSets),
        10
      )}${rpad(String(wk.plyoSets), 6)}${rpad(Math.round(wk.tonnage).toLocaleString(), 10)}${rpad(
        show(mean(wk.bw)),
        7
      )}${rpad(show(mean(wk.sleep)), 7)}${rpad(show(mean(wk.energy)), 8)}`
    );
  });

  const totalSessions = workouts.length;
  const sessionsPerWeek = totalSessions / weekCount;
  const plyoPerWeek = weeks.reduce((a, w) => a + w.plyoSets, 0) / weekCount;
  const legPerWeek = weeks.reduce((a, w) => a + w.legSets, 0) / weekCount;

  console.log(
    `\n  ${totalSessions} sessions over ${weekCount} weeks — ${sessionsPerWeek.toFixed(
      1
    )}/wk, ${legPerWeek.toFixed(1)} leg sets/wk, ${plyoPerWeek.toFixed(1)} plyo sets/wk`
  );

  // --- Strength trend -----------------------------------------------------
  console.log("\n## Main lift trend (best e1RM per week, Epley, reps <= 12)\n");
  console.log(
    `  ${pad("exercise", 26)} ${rpad("from", 5)}    ${rpad("to", 5)}  ${rpad("all", 8)} ${rpad(
      `last ${GATES.recentWeeks}wk`,
      9
    )} ${rpad("slope", 10)}  weekly best`
  );

  const byExercise = new Map<string, SetRow[]>();
  for (const s of sets) {
    if (s.reps > 12 || s.reps < 1 || s.weight <= 0) continue;
    if (!byExercise.has(s.exercise)) byExercise.set(s.exercise, []);
    byExercise.get(s.exercise)!.push(s);
  }

  type Trend = {
    exercise: string;
    startE1rm: number;
    endE1rm: number;
    changePct: number;
    recentPct: number | null;
    weeks: number;
  };
  const trends: Trend[] = [];

  const ranked = [...byExercise.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [exercise, exSets] of ranked) {
    const bestByWeek = new Map<number, number>();
    for (const s of exSets) {
      bestByWeek.set(s.week, Math.max(bestByWeek.get(s.week) ?? 0, s.e1rm));
    }
    if (bestByWeek.size < 3) continue; // too thin to call a trend

    const points = [...bestByWeek.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([x, y]) => ({ x, y }));
    const perWeek = slope(points);
    const startE1rm = points[0].y;
    const endE1rm = points[points.length - 1].y;
    const changePct = ((endE1rm - startE1rm) / startE1rm) * 100;

    // Trailing-window change: what the lift has done lately, which is the
    // question a program switch actually turns on.
    const recent = points.filter((p) => p.x >= weekCount - GATES.recentWeeks);
    const recentPct =
      recent.length >= 2 ? ((endE1rm - recent[0].y) / recent[0].y) * 100 : null;

    trends.push({ exercise, startE1rm, endE1rm, changePct, recentPct, weeks: points.length });

    const spark = points.map((p) => Math.round(p.y)).join(" ");
    console.log(
      `  ${pad(exercise, 26)} ${rpad(Math.round(startE1rm).toString(), 5)} -> ${rpad(
        Math.round(endE1rm).toString(),
        5
      )}  ${rpad(pct(changePct), 8)} ${rpad(
        recentPct === null ? "—" : pct(recentPct),
        9
      )} ${rpad(perWeek === null ? "—" : `${perWeek >= 0 ? "+" : ""}${perWeek.toFixed(1)}/wk`, 10)}  ${spark}`
    );
  }

  // --- Gates --------------------------------------------------------------
  const squatTrend = trends.find((t) => /back squat|^squat/i.test(t.exercise));
  const latestBw = [...workouts].reverse().find((w) => w.bodyweight !== null)?.bodyweight ?? null;
  const relSquat = squatTrend && latestBw ? squatTrend.endE1rm / latestBw : null;

  const jumpTrends = trends.filter((t) => JUMP_RELEVANT.some((re) => re.test(t.exercise)));
  const jumpChange = mean(
    jumpTrends.map((t) => t.recentPct).filter((p): p is number => p !== null)
  );

  console.log("\n## Gates\n");

  const gate = (name: string, passed: boolean | null, detail: string) => {
    const mark = passed === null ? "?" : passed ? "YES" : "no ";
    console.log(`  [${mark}] ${pad(name, 34)} ${detail}`);
    return passed;
  };

  const g1 = gate(
    "Strong enough to shift emphasis",
    relSquat === null ? null : relSquat >= GATES.relativeSquat,
    relSquat === null
      ? "no squat e1RM and/or bodyweight logged"
      : `squat e1RM ${Math.round(squatTrend!.endE1rm)} / bw ${latestBw!.toFixed(
          0
        )} = ${relSquat.toFixed(2)}x  (gate ${GATES.relativeSquat}x)`
  );

  const g2 = gate(
    "Strength gains have flattened",
    jumpChange === null ? null : jumpChange < GATES.stalledPct,
    jumpChange === null
      ? "no jump-relevant lift with 2+ weeks in the trailing window"
      : `jump-relevant lifts ${pct(jumpChange)} over last ${GATES.recentWeeks} wks  (gate <${
          GATES.stalledPct
        }%)`
  );

  const g3 = gate(
    "Room to add jump work",
    plyoPerWeek < GATES.plyoSetsPerWeek,
    `${plyoPerWeek.toFixed(1)} plyo sets/wk  (gate <${GATES.plyoSetsPerWeek})`
  );

  const g4 = gate(
    "Adherence is not the bottleneck",
    sessionsPerWeek >= GATES.minSessionsPerWeek,
    `${sessionsPerWeek.toFixed(1)} sessions/wk  (gate >=${GATES.minSessionsPerWeek})`
  );

  const passed = [g1, g2, g3, g4].filter((g) => g === true).length;
  const unknown = [g1, g2, g3, g4].filter((g) => g === null).length;

  console.log("\n## Verdict\n");

  // The reasons are read back off the gates rather than written into each
  // branch, so the prose can never drift from the numbers above it.
  const reasons: string[] = [];
  if (g1 === true) reasons.push(`squat is ${relSquat!.toFixed(2)}x bw, past the point of diminishing jump return`);
  if (g1 === false) reasons.push(`squat is only ${relSquat!.toFixed(2)}x bw, still the cheapest jump gains available`);
  if (g2 === true) reasons.push(`jump-relevant lifts are flat (${pct(jumpChange!)} over ${GATES.recentWeeks} wks)`);
  if (g2 === false) reasons.push(`jump-relevant lifts are still climbing (${pct(jumpChange!)} over ${GATES.recentWeeks} wks)`);
  if (g3 === true) reasons.push(`only ${plyoPerWeek.toFixed(1)} plyo sets/wk, so jump work has room`);
  if (g3 === false) reasons.push(`already ${plyoPerWeek.toFixed(1)} plyo sets/wk`);

  if (g4 === false) {
    console.log(
      `  Hold. At ${sessionsPerWeek.toFixed(1)} sessions/wk the limiter is consistency, not\n` +
        "  program design — a new block will not fix a missed one."
    );
  } else if (passed >= 3) {
    console.log(`  Switch. ${passed}/4 gates met.`);
  } else if (passed === 2) {
    console.log(
      `  Partial — ${passed}/4 gates met. Keep the strength base and graft jump work onto\n` +
        "  it: add plyos before the main lifts rather than replacing the block wholesale."
    );
  } else {
    console.log(
      `  Stay. ${passed}/4 gates met — the current block is still producing, and strength\n` +
        "  built now is what a later power block converts into jump height."
    );
  }
  for (const r of reasons) console.log(`    - ${r}`);

  if (unknown > 0) {
    console.log(`\n  ${unknown} gate(s) undetermined — see the '?' rows above for what is missing.`);
  }

  console.log(
    "\n  Note: no vertical-jump measurement exists in the schema, so every gate above\n" +
      "  is inferred from barbell numbers. Logging a jump test would settle it directly.\n"
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.close());
