import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import WorkoutClient from "./WorkoutClient";
import { buildPaceModel, EMPTY_PACE } from "@/lib/pace";

/** Past sessions used to estimate how long this one will take. */
const PACE_HISTORY_WORKOUTS = 8;

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const workout = await prisma.workout.findUnique({
    where: { id },
    include: {
      programDay: {
        include: {
          exercises: {
            orderBy: { exerciseOrder: "asc" },
            include: { exercise: true },
          },
        },
      },
      sets: {
        orderBy: [{ exerciseId: "asc" }, { setOrder: "asc" }],
        include: { exercise: true },
      },
    },
  });

  if (!workout) notFound();

  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });

  // Previous performance per exercise: for each exercise in this workout, the sets
  // from the most recent *other* workout that trained it. Pulled in a single query
  // (indexed on exerciseId) instead of one query per exercise, then grouped in JS.
  const exerciseIds = workout.programDay?.exercises.map((e) => e.exerciseId) ?? [];
  const prevPerformance: Record<string, { weight: number; reps: number; rpe: number | null; date: Date }[]> = {};

  if (exerciseIds.length > 0) {
    const priorSets = await prisma.workoutSet.findMany({
      where: {
        exerciseId: { in: exerciseIds },
        workoutId: { not: id },
        isWarmup: false,
      },
      orderBy: { createdAt: "desc" },
      include: { workout: { select: { date: true } } },
    });

    // Sets come newest-first. For each exercise, keep only the sets belonging to the
    // first (most recent) workout we see for it.
    const lastWorkoutForEx = new Map<string, string>();
    for (const s of priorSets) {
      const seenWorkout = lastWorkoutForEx.get(s.exerciseId);
      if (seenWorkout === undefined) lastWorkoutForEx.set(s.exerciseId, s.workoutId);
      if (lastWorkoutForEx.get(s.exerciseId) !== s.workoutId) continue;
      (prevPerformance[s.exerciseId] ??= []).push({
        weight: s.weight,
        reps: s.reps,
        rpe: s.rpe,
        date: s.workout.date,
      });
    }
  }

  const allExercises = await prisma.exercise.findMany({ orderBy: { name: "asc" } });

  // How long this day usually takes, from the set timestamps of recent sessions
  // of the same program day. One query for the lot, bounded to the last few
  // workouts so the estimate tracks current pace rather than the whole archive.
  let paceHistory = EMPTY_PACE;
  if (workout.programDayId) {
    const priorSessions = await prisma.workout.findMany({
      where: {
        programDayId: workout.programDayId,
        id: { not: id },
        sets: { some: {} },
      },
      orderBy: { date: "desc" },
      take: PACE_HISTORY_WORKOUTS,
      select: {
        sets: {
          orderBy: { createdAt: "asc" },
          select: { exerciseId: true, createdAt: true, isWarmup: true },
        },
      },
    });

    paceHistory = buildPaceModel(
      priorSessions.map((w) =>
        w.sets.map((s) => ({
          exerciseId: s.exerciseId,
          at: new Date(s.createdAt).getTime(),
          isWarmup: s.isWarmup,
        }))
      )
    );
  }

  return (
    <WorkoutClient
      workout={workout as Parameters<typeof WorkoutClient>[0]["workout"]}
      prevPerformance={prevPerformance}
      settings={settings ?? { barWeight: 45, plates: "45,35,25,10,5,2.5", mainRestSecs: 180, acceRestSecs: 90 }}
      allExercises={allExercises}
      paceHistory={paceHistory}
    />
  );
}
