"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function updateProgramExercise(formData: FormData) {
  const id = formData.get("id") as string;
  const rawRpe = (formData.get("targetRpe") as string).trim();
  const rawNotes = (formData.get("notes") as string).trim();

  await prisma.programExercise.update({
    where: { id },
    data: {
      targetSets: parseInt(formData.get("targetSets") as string),
      targetReps: formData.get("targetReps") as string,
      targetRpe: rawRpe || null,
      restSeconds: parseInt(formData.get("restSeconds") as string),
      isMain: formData.get("isMain") === "on",
      notes: rawNotes || null,
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
