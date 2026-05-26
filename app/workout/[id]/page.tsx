import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import WorkoutClient from "./WorkoutClient";

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

  // Get previous performance for each exercise in this workout
  const exerciseIds = workout.programDay?.exercises.map((e) => e.exerciseId) ?? [];
  const prevPerformance: Record<string, { weight: number; reps: number; rpe: number | null; date: Date }[]> = {};

  for (const exId of exerciseIds) {
    const lastSets = await prisma.workoutSet.findMany({
      where: {
        exerciseId: exId,
        workoutId: { not: id },
        isWarmup: false,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { workout: { select: { date: true } } },
    });

    const byWorkout = new Map<string, typeof lastSets>();
    for (const s of lastSets) {
      if (!byWorkout.has(s.workoutId)) byWorkout.set(s.workoutId, []);
      byWorkout.get(s.workoutId)!.push(s);
    }
    const lastWorkoutSets = [...byWorkout.values()][0] ?? [];
    prevPerformance[exId] = lastWorkoutSets.map((s) => ({
      weight: s.weight,
      reps: s.reps,
      rpe: s.rpe,
      date: s.workout.date,
    }));
  }

  const allExercises = await prisma.exercise.findMany({ orderBy: { name: "asc" } });

  return (
    <WorkoutClient
      workout={workout as Parameters<typeof WorkoutClient>[0]["workout"]}
      prevPerformance={prevPerformance}
      settings={settings ?? { barWeight: 45, plates: "45,35,25,10,5,2.5", mainRestSecs: 180, acceRestSecs: 90 }}
      allExercises={allExercises}
    />
  );
}
