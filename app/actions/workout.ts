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
  const duration = parseInt(formData.get("duration") as string) || null;
  const notes = (formData.get("notes") as string) || null;

  await prisma.workout.update({
    where: { id: workoutId },
    data: { duration, notes },
  });

  redirect(`/workout/${workoutId}/summary`);
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
