export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { dayKey } from "@/lib/week";

/**
 * The whole training log as CSV, one row per set.
 *
 * Set-level rather than workout-level so the file is a faithful export rather
 * than a summary — a pivot table can roll it up, but nothing can recover sets
 * that were aggregated away. Workouts with no sets logged still get a row, so
 * the export accounts for every session in the log.
 */

const COLUMNS = [
  "date",
  "program_day",
  "exercise",
  "category",
  "body_part",
  "set_order",
  "weight_lb",
  "reps",
  "rpe",
  "is_warmup",
  "bodyweight_lb",
  "sleep_hours",
  "energy",
  "duration_min",
  "notes",
  "workout_id",
] as const;

/** RFC 4180: quote anything containing a delimiter, quote or newline; "" escapes ". */
function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csvRow = (cells: (string | number | boolean | null | undefined)[]) =>
  cells.map(csvCell).join(",");

export async function GET() {
  const workouts = await prisma.workout.findMany({
    orderBy: [{ date: "asc" }],
    include: {
      programDay: true,
      sets: {
        orderBy: [{ exerciseId: "asc" }, { setOrder: "asc" }],
        include: { exercise: true },
      },
    },
  });

  const lines = [csvRow([...COLUMNS])];

  for (const workout of workouts) {
    // Repeated on every row of the session so each line stands alone.
    const session = [
      dayKey(new Date(workout.date)),
      workout.programDay?.name ?? "",
    ];
    const context = [
      workout.bodyweight,
      workout.sleepHours,
      workout.energy,
      workout.duration === null ? null : Math.round(workout.duration / 60),
      workout.notes,
      workout.id,
    ];

    if (workout.sets.length === 0) {
      lines.push(csvRow([...session, "", "", "", "", "", "", "", "", ...context]));
      continue;
    }

    for (const set of workout.sets) {
      lines.push(
        csvRow([
          ...session,
          set.exercise.name,
          set.exercise.category,
          set.exercise.bodyPart,
          set.setOrder,
          set.weight,
          set.reps,
          set.rpe,
          set.isWarmup,
          ...context,
        ])
      );
    }
  }

  // Excel reads a bare UTF-8 CSV as the system codepage and mangles any accents
  // in exercise names or notes; the BOM makes it read UTF-8.
  const body = `﻿${lines.join("\r\n")}\r\n`;
  const filename = `liftlog-${dayKey(new Date())}.csv`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
