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

export async function reorderExercise(formData: FormData) {
  const id = formData.get("id") as string;
  const direction = formData.get("direction") as string;

  const current = await prisma.programExercise.findUnique({ where: { id } });
  if (!current) return;

  const sibling = await prisma.programExercise.findFirst({
    where: {
      programDayId: current.programDayId,
      exerciseOrder: direction === "up" ? { lt: current.exerciseOrder } : { gt: current.exerciseOrder },
    },
    orderBy: { exerciseOrder: direction === "up" ? "desc" : "asc" },
  });
  if (!sibling) return;

  await prisma.$transaction([
    prisma.programExercise.update({ where: { id: current.id }, data: { exerciseOrder: sibling.exerciseOrder } }),
    prisma.programExercise.update({ where: { id: sibling.id }, data: { exerciseOrder: current.exerciseOrder } }),
  ]);

  revalidatePath("/programs");
  revalidatePath("/programs/edit");
}

export async function reorderDay(formData: FormData) {
  const id = formData.get("id") as string;
  const direction = formData.get("direction") as string;

  const current = await prisma.programDay.findUnique({ where: { id } });
  if (!current) return;

  const sibling = await prisma.programDay.findFirst({
    where: {
      programId: current.programId,
      dayOrder: direction === "up" ? { lt: current.dayOrder } : { gt: current.dayOrder },
    },
    orderBy: { dayOrder: direction === "up" ? "desc" : "asc" },
  });
  if (!sibling) return;

  await prisma.$transaction([
    prisma.programDay.update({ where: { id: current.id }, data: { dayOrder: sibling.dayOrder } }),
    prisma.programDay.update({ where: { id: sibling.id }, data: { dayOrder: current.dayOrder } }),
  ]);

  revalidatePath("/programs");
  revalidatePath("/programs/edit");
}

export async function addProgramDay(formData: FormData) {
  const programId = formData.get("programId") as string;
  const name = (formData.get("name") as string).trim();
  if (!name) return;

  const lastDay = await prisma.programDay.findFirst({
    where: { programId },
    orderBy: { dayOrder: "desc" },
  });

  await prisma.programDay.create({
    data: { programId, name, dayOrder: (lastDay?.dayOrder ?? 0) + 1 },
  });

  revalidatePath("/programs");
  revalidatePath("/programs/edit");
}

export async function deleteProgramDay(formData: FormData) {
  const id = formData.get("id") as string;
  await prisma.programDay.delete({ where: { id } });
  revalidatePath("/programs");
  revalidatePath("/programs/edit");
}

export async function createAndAddExercise(formData: FormData) {
  const programDayId = formData.get("programDayId") as string;
  const name = (formData.get("name") as string).trim();
  const category = (formData.get("category") as string).trim();
  const bodyPart = (formData.get("bodyPart") as string).trim();
  const targetSets = parseInt(formData.get("targetSets") as string) || 3;
  const targetReps = (formData.get("targetReps") as string) || "8-10";
  const restSeconds = parseInt(formData.get("restSeconds") as string) || 90;
  const isMain = formData.get("isMain") === "on";

  if (!name || !category || !bodyPart) return;

  const exercise = await prisma.exercise.upsert({
    where: { name },
    create: { name, category, bodyPart },
    update: {},
  });

  const lastEx = await prisma.programExercise.findFirst({
    where: { programDayId },
    orderBy: { exerciseOrder: "desc" },
  });

  await prisma.programExercise.create({
    data: {
      programDayId,
      exerciseId: exercise.id,
      exerciseOrder: (lastEx?.exerciseOrder ?? 0) + 1,
      targetSets,
      targetReps,
      targetRpe: null,
      restSeconds,
      isMain,
      notes: null,
    },
  });

  revalidatePath("/programs");
  revalidatePath("/programs/edit");
}
