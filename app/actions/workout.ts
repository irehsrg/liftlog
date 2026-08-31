"use server";

import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function startWorkout(formData: FormData) {
  const programDayId = formData.get("programDayId") as string | null;

  const workout = await prisma.workout.create({
    data: {
      programDayId: programDayId || null,
    },
  });

  redirect(`/workout/${workout.id}`);
}

export async function addSet(formData: FormData) {
  const workoutId = formData.get("workoutId") as string;
  const exerciseId = formData.get("exerciseId") as string;
  const weight = parseFloat(formData.get("weight") as string);
  const reps = parseInt(formData.get("reps") as string);
  const rpe = formData.get("rpe") ? parseFloat(formData.get("rpe") as string) : null;
  const isWarmup = formData.get("isWarmup") === "true";

  const lastSet = await prisma.workoutSet.findFirst({
    where: { workoutId, exerciseId },
    orderBy: { setOrder: "desc" },
  });

  const created = await prisma.workoutSet.create({
    data: {
      workoutId,
      exerciseId,
      weight,
      reps,
      rpe,
      isWarmup,
      setOrder: (lastSet?.setOrder ?? 0) + 1,
    },
  });

  revalidatePath(`/workout/${workoutId}`);
  return { id: created.id };
}

export async function deleteSet(formData: FormData) {
  const setId = formData.get("setId") as string;
  const workoutId = formData.get("workoutId") as string;

  await prisma.workoutSet.delete({ where: { id: setId } });
  revalidatePath(`/workout/${workoutId}`);
}

export async function finishWorkout(formData: FormData) {
  const workoutId = formData.get("workoutId") as string;
  const reported = parseInt(formData.get("duration") as string) || null;
  const notes = (formData.get("notes") as string) || null;

  const duration = await clampDuration(workoutId, reported);

  await prisma.workout.update({
    where: { id: workoutId },
    data: { duration, notes, finishedAt: new Date() },
  });

  redirect(`/workout/${workoutId}/summary`);
}

// `duration` is the live elapsed timer (seconds) at the moment Finish is tapped.
// If a session is left open for hours, that timer records the wall-clock gap
// rather than real training time (e.g. the 1662-min entry). Clamp the reported
// value against the user's own history so a forgotten workout can't store a
// wildly inflated duration.
async function clampDuration(
  workoutId: string,
  reported: number | null
): Promise<number | null> {
  if (reported == null || reported <= 0) return reported;

  // Only learn from past sessions of a plausible length, so one already-inflated
  // entry can't drag the cap upward and defeat the guard.
  const PLAUSIBLE_MAX = 6 * 60 * 60; // 6h
  const history = await prisma.workout.findMany({
    where: {
      id: { not: workoutId },
      finishedAt: { not: null },
      duration: { not: null, lte: PLAUSIBLE_MAX },
    },
    select: { duration: true },
  });
  const durations = history
    .map((w) => w.duration ?? 0)
    .filter((d) => d > 0);

  // Cap = 1.5x the longest plausible past session, with a 3h floor so a few short
  // early sessions don't clamp a genuinely long one, and a default before any
  // history exists.
  const FLOOR = 3 * 60 * 60; // 3h
  const cap =
    durations.length > 0
      ? Math.max(FLOOR, Math.round(Math.max(...durations) * 1.5))
      : FLOOR;

  if (reported <= cap) return reported;

  // Over the cap: prefer the time of the last logged set (a far better proxy for
  // when training actually stopped); fall back to the cap itself.
  const [lastSet, workout] = await Promise.all([
    prisma.workoutSet.findFirst({
      where: { workoutId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.workout.findUnique({
      where: { id: workoutId },
      select: { date: true },
    }),
  ]);

  if (lastSet && workout) {
    const estimate = Math.round(
      (lastSet.createdAt.getTime() - workout.date.getTime()) / 1000
    );
    if (estimate > 0 && estimate <= cap) return estimate;
  }

  return cap;
}

// Re-open a finished workout — clears the finished flag so it becomes the active
// in-progress workout again and drops the user back on the live logging screen.
// Used to recover from an accidental "Finish".
export async function continueWorkout(formData: FormData) {
  const workoutId = formData.get("workoutId") as string;

  await prisma.workout.update({
    where: { id: workoutId },
    data: { finishedAt: null },
  });

  redirect(`/workout/${workoutId}`);
}

export async function saveWorkoutNotes(formData: FormData) {
  const workoutId = formData.get("workoutId") as string;
  const notes = formData.get("notes") as string;

  await prisma.workout.update({
    where: { id: workoutId },
    data: { notes },
  });

  revalidatePath(`/workout/${workoutId}/summary`);
}

export async function deleteWorkout(formData: FormData) {
  const workoutId = formData.get("workoutId") as string;

  await prisma.workout.delete({ where: { id: workoutId } });
  redirect("/");
}
