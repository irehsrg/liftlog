import { format, startOfWeek, subDays, subWeeks } from "date-fns";
import { prisma } from "@/lib/db";

export const COACH_SYSTEM_PROMPT = `You are SwoleGuyAI — the resident gym-bro AI coach built into the user's LiftLog workout tracking app. Under the bro persona you are a serious evidence-based strength coach. You have two jobs: answer questions about the user's actual training (using the data tools), and give advice grounded in exercise science research.

## Persona
- Voice: enthusiastic gym bro. Greet casually ("yo", "what's up brother"), celebrate PRs hard (an occasional ALL-CAPS hype word is fine), sprinkle in bro slang (gains, cooked, sending it, plates).
- The bit never compromises the substance: the numbers, dates, and recommendations stay precise and evidence-based. Comedy is seasoning, not the meal — at most a line or two of flavor per answer.
- When the data shows something negative (stalled lift, missed sessions, junk volume), deliver it straight, bro-style honesty: "gonna keep it real with you brother..."

## Using the data tools
The tools query the user's real workout log. Always check the data before making claims about their training — never guess what they lifted, how often they train, or how they're progressing. Typical flow: for questions about progress on a lift, call get_exercise_history; for "what should I focus on" or program critique, call get_training_overview plus get_current_program (and get_volume_by_bodypart if volume is relevant); for questions about a specific session, call get_workout_detail. If an exercise name doesn't match, call list_exercises to find the right one. All weights are in pounds (lbs).

## Evidence base
Ground recommendations in the established training literature rather than gym folklore. Key principles to draw on (attribute claims to the research consensus, e.g. "meta-analyses on training volume suggest..." — don't fabricate specific citations):
- Progressive overload drives adaptation; track it via added weight, reps, or sets over time. Estimated 1RM trends are a good proxy for strength progress.
- Hypertrophy: roughly 10–20 hard sets per muscle group per week for most trained lifters; more is not always better, and per-session volume beyond ~6-8 hard sets per muscle has diminishing returns. Muscles respond similarly across ~5–30 rep sets when taken close to failure.
- Proximity to failure matters: most working sets should land around 0–3 reps in reserve (RPE 7–10). Chronic training far from failure blunts hypertrophy.
- Frequency: hitting a muscle 2x/week tends to beat 1x at equal volume mainly by making volume distribution easier.
- Strength is specific: for 1RM strength, include heavier work (~1–5 reps, 80%+ 1RM) on the competition/main lifts.
- Fatigue management: deload or reduce volume when performance stalls or drops across sessions alongside high fatigue; sleep (7–9h) and adequate protein (~0.7–1g/lb/day) are the biggest recovery levers.
- RPE/RIR autoregulation is a valid way to prescribe load; estimated 1RM (Epley: weight x (1 + reps/30)) is reliable for tracking trends in moderate rep ranges.
- Plateaus: first check volume, proximity to failure, exercise rotation, sleep, and bodyweight trend before assuming a program change is needed.

## Communication style
- Be direct and specific. Reference the user's actual numbers and dates from the tool results ("your top bench set went from 185x5 on Jun 12 to 200x4 on Jul 18").
- Keep answers short — a few sentences to a few short paragraphs. Use simple "- " bullet lists when listing items. No markdown headers or tables.
- Give a concrete recommendation, not a survey of options. If data is thin (few logged workouts), say so and base advice on what's there.
- You're a coach, not a doctor: for pain or injury questions, give general load-management guidance and recommend a professional for anything persistent.`;

export type CoachTool = {
  name: string;
  description: string;
  /** Plain JSON Schema for the tool's arguments; omitted for no-arg tools */
  parameters?: Record<string, unknown>;
  run: (args: Record<string, unknown>) => Promise<string>;
};

const EPLEY = (weight: number, reps: number) =>
  reps <= 1 ? weight : Math.round(weight * (1 + reps / 30));

function fmtDate(d: Date | string) {
  return format(new Date(d), "yyyy-MM-dd");
}

export const coachTools: CoachTool[] = [
  {
    name: "get_training_overview",
    description:
      "Get a summary of the user's recent training: the last 12 completed workouts (date, program day, duration, working sets, total volume in lbs, bodyweight, energy 1-5, sleep hours, notes) plus workout counts for the last 30 days. Call this first for broad questions about how training is going.",
    run: async () => {
      const since = subDays(new Date(), 30);
      const [recent, last30Count] = await Promise.all([
        prisma.workout.findMany({
          where: { finishedAt: { not: null } },
          orderBy: { date: "desc" },
          take: 12,
          select: {
            date: true,
            duration: true,
            bodyweight: true,
            energy: true,
            sleepHours: true,
            notes: true,
            programDay: { select: { name: true } },
            sets: { where: { isWarmup: false }, select: { weight: true, reps: true } },
          },
        }),
        prisma.workout.count({
          where: { finishedAt: { not: null }, date: { gte: since } },
        }),
      ]);
      const workouts = recent.map((w) => ({
        date: fmtDate(w.date),
        day: w.programDay?.name ?? null,
        durationMin: w.duration ? Math.round(w.duration / 60) : null,
        workingSets: w.sets.length,
        volumeLbs: Math.round(w.sets.reduce((s, x) => s + x.weight * x.reps, 0)),
        bodyweight: w.bodyweight,
        energy: w.energy,
        sleepHours: w.sleepHours,
        notes: w.notes,
      }));
      return JSON.stringify({ workoutsLast30Days: last30Count, recentWorkouts: workouts });
    },
  },
  {
    name: "get_current_program",
    description:
      "Get the user's active training program: its days in order, and each day's exercises with target sets, target reps, target RPE, rest time, and whether it's a main lift.",
    run: async () => {
      const program = await prisma.program.findFirst({
        where: { active: true },
        select: {
          name: true,
          days: {
            orderBy: { dayOrder: "asc" },
            select: {
              name: true,
              exercises: {
                orderBy: { exerciseOrder: "asc" },
                select: {
                  targetSets: true,
                  targetReps: true,
                  targetRpe: true,
                  restSeconds: true,
                  isMain: true,
                  notes: true,
                  supersetGroup: true,
                  exercise: { select: { name: true, bodyPart: true } },
                },
              },
            },
          },
        },
      });
      if (!program) return "No active program found.";
      return JSON.stringify({
        name: program.name,
        days: program.days.map((d) => ({
          name: d.name,
          exercises: d.exercises.map((e) => ({
            exercise: e.exercise.name,
            bodyPart: e.exercise.bodyPart,
            sets: e.targetSets,
            reps: e.targetReps,
            rpe: e.targetRpe,
            restSec: e.restSeconds,
            main: e.isMain,
            superset: e.supersetGroup,
            notes: e.notes,
          })),
        })),
      });
    },
  },
  {
    name: "list_exercises",
    description:
      "List all exercises in the app with their category, body part, and how many sets have ever been logged for each. Use this to resolve an exercise name when get_exercise_history can't find a match.",
    run: async () => {
      const exercises = await prisma.exercise.findMany({
        orderBy: { name: "asc" },
        select: {
          name: true,
          category: true,
          bodyPart: true,
          _count: { select: { sets: true } },
        },
      });
      return JSON.stringify(
        exercises.map((e) => ({
          name: e.name,
          category: e.category,
          bodyPart: e.bodyPart,
          loggedSets: e._count.sets,
        }))
      );
    },
  },
  {
    name: "get_exercise_history",
    description:
      "Get the user's history for one exercise across their most recent workouts containing it: every working set (weight x reps @ RPE) plus the best estimated 1RM (Epley) per workout, newest first. Use this for any question about progress or performance on a specific lift.",
    parameters: {
      type: "object",
      properties: {
        exercise: {
          type: "string",
          description:
            "Exercise name or a distinctive part of it, e.g. 'bench' or 'Romanian Deadlift'",
        },
        workouts: {
          type: "number",
          description: "How many recent workouts to include (default 10, max 20)",
        },
      },
      required: ["exercise"],
    },
    run: async (args) => {
      const query = String(args.exercise ?? "").trim();
      if (!query) return "Missing required argument: exercise.";
      const take = Math.min(Math.max(Math.round(Number(args.workouts) || 10), 1), 20);
      const matches = await prisma.exercise.findMany({
        where: { name: { contains: query } },
        select: { id: true, name: true },
        take: 5,
      });
      if (matches.length === 0) {
        return `No exercise matching "${query}". Call list_exercises to see available names.`;
      }
      const exact = matches.find((m) => m.name.toLowerCase() === query.toLowerCase());
      const ex = exact ?? matches[0];
      const history = await prisma.workout.findMany({
        where: {
          finishedAt: { not: null },
          sets: { some: { exerciseId: ex.id, isWarmup: false } },
        },
        orderBy: { date: "desc" },
        take,
        select: {
          date: true,
          sets: {
            where: { exerciseId: ex.id, isWarmup: false },
            orderBy: { setOrder: "asc" },
            select: { weight: true, reps: true, rpe: true },
          },
        },
      });
      return JSON.stringify({
        exercise: ex.name,
        otherMatches: matches.filter((m) => m.id !== ex.id).map((m) => m.name),
        workouts: history.map((w) => ({
          date: fmtDate(w.date),
          sets: w.sets.map((s) => `${s.weight}x${s.reps}${s.rpe ? `@${s.rpe}` : ""}`),
          bestEst1RM: Math.max(...w.sets.map((s) => EPLEY(s.weight, s.reps))),
        })),
      });
    },
  },
  {
    name: "get_workout_detail",
    description:
      "Get the full detail of workouts on a specific date: all sets grouped by exercise (including warmups), plus session notes, duration, bodyweight, energy, and sleep.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
      },
      required: ["date"],
    },
    run: async (args) => {
      const date = String(args.date ?? "");
      const start = new Date(`${date}T00:00:00`);
      if (isNaN(start.getTime())) return `Invalid date "${date}" — use YYYY-MM-DD.`;
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      const workouts = await prisma.workout.findMany({
        where: { date: { gte: start, lt: end } },
        select: {
          date: true,
          notes: true,
          duration: true,
          bodyweight: true,
          energy: true,
          sleepHours: true,
          finishedAt: true,
          programDay: { select: { name: true } },
          sets: {
            orderBy: { createdAt: "asc" },
            select: {
              weight: true,
              reps: true,
              rpe: true,
              isWarmup: true,
              exercise: { select: { name: true } },
            },
          },
        },
      });
      if (workouts.length === 0) return `No workout logged on ${date}.`;
      return JSON.stringify(
        workouts.map((w) => {
          const byExercise = new Map<string, string[]>();
          for (const s of w.sets) {
            const key = s.exercise.name;
            if (!byExercise.has(key)) byExercise.set(key, []);
            byExercise
              .get(key)!
              .push(
                `${s.isWarmup ? "warmup " : ""}${s.weight}x${s.reps}${s.rpe ? `@${s.rpe}` : ""}`
              );
          }
          return {
            date: fmtDate(w.date),
            day: w.programDay?.name ?? null,
            finished: !!w.finishedAt,
            durationMin: w.duration ? Math.round(w.duration / 60) : null,
            bodyweight: w.bodyweight,
            energy: w.energy,
            sleepHours: w.sleepHours,
            notes: w.notes,
            exercises: Object.fromEntries(byExercise),
          };
        })
      );
    },
  },
  {
    name: "get_volume_by_bodypart",
    description:
      "Get weekly training volume per body part (working set count and tonnage in lbs) for the last N weeks. Use this to judge whether volume is adequate, imbalanced, or trending up/down.",
    parameters: {
      type: "object",
      properties: {
        weeks: {
          type: "number",
          description: "How many weeks back to include (default 4, max 8)",
        },
      },
    },
    run: async (args) => {
      const n = Math.min(Math.max(Math.round(Number(args.weeks) || 4), 1), 8);
      const since = startOfWeek(subWeeks(new Date(), n - 1), { weekStartsOn: 1 });
      const sets = await prisma.workoutSet.findMany({
        where: {
          isWarmup: false,
          workout: { finishedAt: { not: null }, date: { gte: since } },
        },
        select: {
          weight: true,
          reps: true,
          exercise: { select: { bodyPart: true } },
          workout: { select: { date: true } },
        },
      });
      // week (Monday) -> bodyPart -> {sets, tonnage}
      const byWeek = new Map<string, Map<string, { sets: number; tonnage: number }>>();
      for (const s of sets) {
        const week = fmtDate(startOfWeek(new Date(s.workout.date), { weekStartsOn: 1 }));
        if (!byWeek.has(week)) byWeek.set(week, new Map());
        const parts = byWeek.get(week)!;
        const bp = s.exercise.bodyPart || "Other";
        const agg = parts.get(bp) ?? { sets: 0, tonnage: 0 };
        agg.sets += 1;
        agg.tonnage += s.weight * s.reps;
        parts.set(bp, agg);
      }
      const result = [...byWeek.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([weekOf, parts]) => ({
          weekOf,
          bodyParts: Object.fromEntries(
            [...parts.entries()].map(([bp, v]) => [
              bp,
              { sets: v.sets, tonnageLbs: Math.round(v.tonnage) },
            ])
          ),
        }));
      return JSON.stringify(result.length ? result : "No completed workouts in this window.");
    },
  },
];
