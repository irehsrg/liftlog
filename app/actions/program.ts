"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function updateProgramExercise(formData: FormData) {
  const id = formData.get("id") as string;
  const rawRpe = (formData.get("targetRpe") as string).trim();
  const rawNotes = (formData.get("notes") as string).trim();
  const rawSupersetGroup = (formData.get("supersetGroup") as string).trim();

  await prisma.programExercise.update({
    where: { id },
    data: {
      targetSets: parseInt(formData.get("targetSets") as string),
      targetReps: formData.get("targetReps") as string,
      targetRpe: rawRpe || null,
      restSeconds: parseInt(formData.get("restSeconds") as string),
      isMain: formData.get("isMain") === "on",
      notes: rawNotes || null,
      supersetGroup: rawSupersetGroup || null,
    },
  });

  revalidatePath("/programs");
  revalidatePath("/programs/edit");
}

export async function updateProgramDayName(formData: FormData) {
  const id = formData.get("id") as string;
  const name = (formData.get("name") as string).trim();
  if (!name) return;

  await prisma.programDay.update({ where: { id }, data: { name } });
  revalidatePath("/programs");
  revalidatePath("/programs/edit");
}

export async function addExerciseToDay(formData: FormData) {
  const programDayId = formData.get("programDayId") as string;
  const exerciseId = formData.get("exerciseId") as string;
  const targetSets = parseInt(formData.get("targetSets") as string) || 3;
  const targetReps = (formData.get("targetReps") as string) || "8-10";
  const targetRpe = (formData.get("targetRpe") as string).trim() || null;
  const restSeconds = parseInt(formData.get("restSeconds") as string) || 90;
  const isMain = formData.get("isMain") === "on";

  // Find current max exerciseOrder for this day
  const lastEx = await prisma.programExercise.findFirst({
    where: { programDayId },
    orderBy: { exerciseOrder: "desc" },
  });

  await prisma.programExercise.create({
    data: {
      programDayId,
      exerciseId,
      exerciseOrder: (lastEx?.exerciseOrder ?? 0) + 1,
      targetSets,
      targetReps,
      targetRpe,
      restSeconds,
      isMain,
      notes: null,
    },
  });

  revalidatePath("/programs");
  revalidatePath("/programs/edit");
}

export async function removeExerciseFromDay(formData: FormData) {
  const id = formData.get("id") as string;
  await prisma.programExercise.delete({ where: { id } });
  revalidatePath("/programs");
  revalidatePath("/programs/edit");
}
