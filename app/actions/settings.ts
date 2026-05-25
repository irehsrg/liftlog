"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function saveSettings(formData: FormData) {
  const barWeight = parseFloat(formData.get("barWeight") as string) || 45;
  const plates = (formData.get("plates") as string) || "45,35,25,10,5,2.5";
  const mainRestSecs = parseInt(formData.get("mainRestSecs") as string) || 180;
  const acceRestSecs = parseInt(formData.get("acceRestSecs") as string) || 90;

  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: { barWeight, plates, mainRestSecs, acceRestSecs },
    create: { id: "singleton", barWeight, plates, mainRestSecs, acceRestSecs },
  });

  revalidatePath("/settings");
}

export async function addExercise(formData: FormData) {
  const name = formData.get("name") as string;
  const category = (formData.get("category") as string) || "accessory";
  const bodyPart = (formData.get("bodyPart") as string) || "legs";

  if (!name?.trim()) return;

  await prisma.exercise.upsert({
    where: { name: name.trim() },
    update: {},
    create: { name: name.trim(), category, bodyPart },
  });

  revalidatePath("/settings");
}
