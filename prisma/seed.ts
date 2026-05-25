import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? "./dev.db";
const adapter = new PrismaBetterSqlite3({ url: path.resolve(dbPath) });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Settings singleton
  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  // Exercises
  const exercises = [
    { name: "Box Jump", category: "plyometric", bodyPart: "legs" },
    { name: "Back Squat", category: "compound", bodyPart: "legs" },
    { name: "Pause Squat", category: "compound", bodyPart: "legs" },
    { name: "Bulgarian Split Squat", category: "accessory", bodyPart: "legs" },
    { name: "Leg Extension", category: "accessory", bodyPart: "legs" },
    { name: "Standing Calf Raise", category: "accessory", bodyPart: "legs" },
    { name: "Bench Press", category: "compound", bodyPart: "push" },
    { name: "Standing OHP", category: "compound", bodyPart: "push" },
    { name: "Incline DB Press", category: "accessory", bodyPart: "push" },
    { name: "Cable Lateral Raise", category: "accessory", bodyPart: "push" },
    { name: "Cable Tricep Pushdown", category: "accessory", bodyPart: "push" },
    { name: "Overhead Tricep Extension", category: "accessory", bodyPart: "push" },
    { name: "Broad Jump", category: "plyometric", bodyPart: "legs" },
    { name: "Conventional Deadlift", category: "compound", bodyPart: "legs" },
    { name: "Romanian Deadlift", category: "accessory", bodyPart: "legs" },
    { name: "Hamstring Curl", category: "accessory", bodyPart: "legs" },
    { name: "Single-Leg RDL", category: "accessory", bodyPart: "legs" },
    { name: "Seated Calf Raise", category: "accessory", bodyPart: "legs" },
    { name: "Weighted Pull-Up", category: "compound", bodyPart: "pull" },
    { name: "Pendlay Row", category: "compound", bodyPart: "pull" },
    { name: "Cable Pullover", category: "accessory", bodyPart: "pull" },
    { name: "Chest-Supported DB Row", category: "accessory", bodyPart: "pull" },
    { name: "Face Pull", category: "accessory", bodyPart: "pull" },
    { name: "Barbell Curl", category: "accessory", bodyPart: "pull" },
    { name: "Hammer Curl", category: "accessory", bodyPart: "pull" },
  ];

  const exerciseMap: Record<string, string> = {};
  for (const ex of exercises) {
    const record = await prisma.exercise.upsert({
      where: { name: ex.name },
      update: {},
      create: ex,
    });
    exerciseMap[ex.name] = record.id;
  }

  // Program
  const program = await prisma.program.upsert({
    where: { id: "program_main" },
    update: {},
    create: {
      id: "program_main",
      name: "4-Day Upper/Lower",
      active: true,
    },
  });

  // Helper to create or update a program day
  async function upsertDay(
    id: string,
    name: string,
    dayOrder: number,
    exList: Array<{
      name: string;
      order: number;
      sets: number;
      reps: string;
      rpe: string | null;
      rest: number;
      isMain: boolean;
      notes?: string;
    }>
  ) {
    const day = await prisma.programDay.upsert({
      where: { id },
      update: { name, dayOrder },
      create: { id, programId: program.id, name, dayOrder },
    });

    for (const ex of exList) {
      const exId = exerciseMap[ex.name];
      await prisma.programExercise.upsert({
        where: { id: `${id}_${ex.order}` },
        update: {},
        create: {
          id: `${id}_${ex.order}`,
          programDayId: day.id,
          exerciseId: exId,
          exerciseOrder: ex.order,
          targetSets: ex.sets,
          targetReps: ex.reps,
          targetRpe: ex.rpe,
          restSeconds: ex.rest,
          isMain: ex.isMain,
          notes: ex.notes,
        },
      });
    }
    return day;
  }

  await upsertDay("day_lower1", "Lower 1 — Squat-Focused", 1, [
    { name: "Box Jump", order: 1, sets: 4, reps: "3", rpe: null, rest: 90, isMain: false },
    { name: "Back Squat", order: 2, sets: 4, reps: "5", rpe: "8", rest: 180, isMain: true, notes: "Start 95-115 lb (Phase 1). Add 5 lb when 4×5 hits clean." },
    { name: "Pause Squat", order: 3, sets: 3, reps: "6", rpe: "7", rest: 120, isMain: false, notes: "Skip Phase 1. Add Week 3. ~80% of back squat." },
    { name: "Bulgarian Split Squat", order: 4, sets: 3, reps: "8/leg", rpe: "8", rest: 90, isMain: false },
    { name: "Leg Extension", order: 5, sets: 3, reps: "12", rpe: "9", rest: 60, isMain: false },
    { name: "Standing Calf Raise", order: 6, sets: 4, reps: "8", rpe: "8", rest: 60, isMain: false },
  ]);

  await upsertDay("day_upper1", "Upper 1 — Push-Focused", 2, [
    { name: "Bench Press", order: 1, sets: 4, reps: "6", rpe: "8", rest: 180, isMain: true },
    { name: "Standing OHP", order: 2, sets: 4, reps: "6", rpe: "8", rest: 120, isMain: true },
    { name: "Incline DB Press", order: 3, sets: 3, reps: "10", rpe: "8", rest: 90, isMain: false },
    { name: "Cable Lateral Raise", order: 4, sets: 4, reps: "12", rpe: "9", rest: 60, isMain: false },
    { name: "Cable Tricep Pushdown", order: 5, sets: 3, reps: "12", rpe: "9", rest: 60, isMain: false },
    { name: "Overhead Tricep Extension", order: 6, sets: 3, reps: "10", rpe: "8", rest: 60, isMain: false },
  ]);

  await upsertDay("day_lower2", "Lower 2 — Posterior-Focused", 3, [
    { name: "Broad Jump", order: 1, sets: 3, reps: "3", rpe: null, rest: 90, isMain: false },
    { name: "Conventional Deadlift", order: 2, sets: 4, reps: "5", rpe: "8", rest: 180, isMain: true, notes: "Start 115-135 lb (Phase 1). Lower under control — wood floor." },
    { name: "Romanian Deadlift", order: 3, sets: 3, reps: "8", rpe: "7", rest: 120, isMain: false },
    { name: "Hamstring Curl", order: 4, sets: 4, reps: "10", rpe: "8", rest: 90, isMain: false },
    { name: "Single-Leg RDL", order: 5, sets: 3, reps: "8/leg", rpe: "7", rest: 60, isMain: false },
    { name: "Seated Calf Raise", order: 6, sets: 4, reps: "12", rpe: "8", rest: 60, isMain: false },
  ]);

  await upsertDay("day_upper2", "Upper 2 — Pull-Focused", 4, [
    { name: "Weighted Pull-Up", order: 1, sets: 4, reps: "6", rpe: "8", rest: 180, isMain: true },
    { name: "Pendlay Row", order: 2, sets: 4, reps: "6", rpe: "8", rest: 120, isMain: true },
    { name: "Cable Pullover", order: 3, sets: 3, reps: "12", rpe: "8", rest: 90, isMain: false },
    { name: "Chest-Supported DB Row", order: 4, sets: 3, reps: "10", rpe: "8", rest: 90, isMain: false },
    { name: "Face Pull", order: 5, sets: 4, reps: "15", rpe: "8", rest: 60, isMain: false },
    { name: "Barbell Curl", order: 6, sets: 3, reps: "10", rpe: "8", rest: 60, isMain: false },
    { name: "Hammer Curl", order: 7, sets: 3, reps: "10", rpe: "8", rest: 60, isMain: false },
  ]);

  console.log("Seed complete.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
