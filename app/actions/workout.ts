"use server";

import { prisma } from "@/lib/db";
import { instantOnDay } from "@/lib/week";
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
  const duration = parseInt(formData.get("duration") as string) || null;
  const notes = (formData.get("notes") as string) || null;

  await prisma.workout.update({
    where: { id: workoutId },
    data: { duration, notes, finishedAt: new Date() },
  });

  redirect(`/workout/${workoutId}/summary`);
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

/**
 * Move a workout to the calendar day it actually happened on.
 *
 * A session is stamped with the moment it is logged, so entering two days of
 * training in one sitting files both under today. The streak counts *distinct*
 * days, so a genuine two-day week then reads as one and can break a streak that
 * was never actually missed. This puts the backfilled session back on its day.
 */
export async function setWorkoutDate(formData: FormData) {
  const workoutId = formData.get("workoutId") as string;
  const day = ((formData.get("date") as string | null) ?? "").trim();

  // The value comes from a native date input; anything else is a malformed
  // submission and is better ignored than written as an Invalid Date.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  const date = instantOnDay(day);
  if (Number.isNaN(date.getTime())) return;

  await prisma.workout.update({
    where: { id: workoutId },
    data: { date },
  });

  // The streak, the calendar and the history list all key off this date.
  revalidatePath(`/workout/${workoutId}/summary`);
  revalidatePath("/");
  revalidatePath("/history");
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
