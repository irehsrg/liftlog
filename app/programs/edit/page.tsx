export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { updateProgramExercise, updateProgramDayName } from "@/app/actions/program";

const inputCls = "bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-1.5 text-sm focus:border-purple-400 focus:outline-none";

export default async function EditProgramPage() {
  const program = await prisma.program.findFirst({
    where: { active: true },
    include: {
      days: {
        orderBy: { dayOrder: "asc" },
        include: {
          exercises: {
            orderBy: { exerciseOrder: "asc" },
            include: { exercise: true },
          },
        },
      },
    },
  });

  if (!program) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-6">
        <p className="text-gray-500 text-center py-10">No active program.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit Program</h1>
        <Link href="/programs" className="text-purple-400 font-semibold text-sm">Done</Link>
      </div>

      {program.days.map((day) => (
        <div key={day.id} className="space-y-3">
          {/* Day name */}
          <form action={updateProgramDayName} className="flex gap-2 items-center">
            <input type="hidden" name="id" value={day.id} />
            <input
              type="text"
              name="name"
              defaultValue={day.name}
              className={`flex-1 font-semibold ${inputCls}`}
            />
            <button type="submit" className="text-xs text-purple-400 hover:text-purple-300 px-2 py-1.5 border border-[#333] rounded-lg">
              Save
            </button>
          </form>

          {/* Exercises */}
          {day.exercises.map((pe) => (
            <form
              key={pe.id}
              action={updateProgramExercise}
              className="bg-[#111] border border-[#222] rounded-xl p-4 space-y-3"
            >
              <input type="hidden" name="id" value={pe.id} />

              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">{pe.exercise.name}</p>
                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    name="isMain"
                    defaultChecked={pe.isMain}
                    className="accent-purple-400"
                  />
                  Main lift
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-xs text-gray-500">Sets</span>
                  <input type="number" name="targetSets" defaultValue={pe.targetSets} className={`w-full ${inputCls}`} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-gray-500">Reps (e.g. 5 or 8-10)</span>
                  <input type="text" name="targetReps" defaultValue={pe.targetReps} className={`w-full ${inputCls}`} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-gray-500">Target RPE</span>
                  <input type="text" name="targetRpe" defaultValue={pe.targetRpe ?? ""} placeholder="e.g. 8" className={`w-full ${inputCls}`} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-gray-500">Rest (seconds)</span>
                  <input type="number" name="restSeconds" defaultValue={pe.restSeconds} className={`w-full ${inputCls}`} />
                </label>
              </div>

              <label className="space-y-1 block">
                <span className="text-xs text-gray-500">Notes / cues</span>
                <input type="text" name="notes" defaultValue={pe.notes ?? ""} placeholder="Optional coaching note" className={`w-full ${inputCls}`} />
              </label>

              <button
                type="submit"
                className="w-full bg-purple-400 hover:bg-purple-500 text-white font-semibold py-2 rounded-lg text-sm transition-colors"
              >
                Save
              </button>
            </form>
          ))}
        </div>
      ))}
    </div>
  );
}
