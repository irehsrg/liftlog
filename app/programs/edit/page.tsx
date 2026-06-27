export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  updateProgramExercise,
  updateProgramDayName,
  addExerciseToDay,
  removeExerciseFromDay,
  reorderExercise,
  reorderDay,
  addProgramDay,
  deleteProgramDay,
  createAndAddExercise,
} from "@/app/actions/program";

const inputCls = "bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-1.5 text-sm focus:border-purple-400 focus:outline-none";
const iconBtnCls = "text-gray-500 hover:text-gray-300 px-2 py-1.5 border border-[#333] rounded-lg text-xs transition-colors leading-none";

export default async function EditProgramPage() {
  const [program, exercises] = await Promise.all([
    prisma.program.findFirst({
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
    }),
    prisma.exercise.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!program) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-6">
        <p className="text-gray-500 text-center py-10">No active program.</p>
      </div>
    );
  }

  const exercisesByBodyPart = exercises.reduce<Record<string, typeof exercises>>(
    (acc, ex) => {
      if (!acc[ex.bodyPart]) acc[ex.bodyPart] = [];
      acc[ex.bodyPart].push(ex);
      return acc;
    },
    {}
  );
  const bodyParts = Object.keys(exercisesByBodyPart).sort();
  const uniqueCategories = [...new Set(exercises.map((e) => e.category))].sort();
  const uniqueBodyParts = [...new Set(exercises.map((e) => e.bodyPart))].sort();

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-8 space-y-6">
      {/* Datalists for new exercise autocomplete */}
      <datalist id="categories-list">
        {uniqueCategories.map((c) => <option key={c} value={c} />)}
      </datalist>
      <datalist id="bodyparts-list">
        {uniqueBodyParts.map((b) => <option key={b} value={b} />)}
      </datalist>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit Program</h1>
        <Link href="/programs" className="text-purple-400 font-semibold text-sm">Done</Link>
      </div>

      {program.days.map((day) => (
        <div key={day.id} className="space-y-3">
          {/* Day header: rename + reorder + delete */}
          <form action={updateProgramDayName} className="flex gap-2 items-center">
            <input type="hidden" name="id" value={day.id} />
            <input
              type="text"
              name="name"
              defaultValue={day.name}
              className={`flex-1 font-semibold ${inputCls}`}
            />
            <button formAction={reorderDay} name="direction" value="up" type="submit" className={iconBtnCls} title="Move day up">↑</button>
            <button formAction={reorderDay} name="direction" value="down" type="submit" className={iconBtnCls} title="Move day down">↓</button>
            <button type="submit" className="text-xs text-purple-400 hover:text-purple-300 px-2 py-1.5 border border-[#333] rounded-lg">
              Save
            </button>
            <button
              formAction={deleteProgramDay}
              type="submit"
              className="text-xs text-red-500 hover:text-red-400 px-2 py-1.5 border border-[#333] rounded-lg"
              title="Delete day and all its exercises"
            >
              Del
            </button>
          </form>

          {/* Exercise cards */}
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
                  <input type="checkbox" name="isMain" defaultChecked={pe.isMain} className="accent-purple-400" />
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

              <label className="space-y-1 block">
                <span className="text-xs text-gray-500">Superset group</span>
                <input type="text" name="supersetGroup" defaultValue={pe.supersetGroup ?? ""} placeholder="e.g. A" className={`w-full ${inputCls}`} />
              </label>

              <div className="flex gap-2">
                <button formAction={reorderExercise} name="direction" value="up" type="submit" className={iconBtnCls} title="Move up">↑</button>
                <button formAction={reorderExercise} name="direction" value="down" type="submit" className={iconBtnCls} title="Move down">↓</button>
                <button type="submit" className="flex-1 bg-purple-400 hover:bg-purple-500 text-white font-semibold py-2 rounded-lg text-sm transition-colors">
                  Save
                </button>
                <button
                  type="submit"
                  formAction={removeExerciseFromDay}
                  name="id"
                  value={pe.id}
                  className="text-xs text-red-500 hover:text-red-400 px-3 py-2 border border-[#222] rounded-lg transition-colors"
                >
                  Remove
                </button>
              </div>
            </form>
          ))}

          {/* Add existing exercise */}
          <form action={addExerciseToDay} className="bg-[#111] border border-[#222] rounded-xl p-4 space-y-3">
            <input type="hidden" name="programDayId" value={day.id} />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Add Exercise</p>

            <label className="space-y-1 block">
              <span className="text-xs text-gray-500">Exercise</span>
              <select name="exerciseId" required className={`w-full ${inputCls}`}>
                {bodyParts.map((bp) => (
                  <optgroup key={bp} label={bp}>
                    {exercisesByBodyPart[bp].map((ex) => (
                      <option key={ex.id} value={ex.id}>{ex.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-xs text-gray-500">Sets</span>
                <input type="number" name="targetSets" defaultValue={3} min={1} className={`w-full ${inputCls}`} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-gray-500">Reps</span>
                <input type="text" name="targetReps" defaultValue="8-10" className={`w-full ${inputCls}`} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-gray-500">Target RPE</span>
                <input type="text" name="targetRpe" placeholder="e.g. 8" className={`w-full ${inputCls}`} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-gray-500">Rest (seconds)</span>
                <input type="number" name="restSeconds" defaultValue={90} min={0} className={`w-full ${inputCls}`} />
              </label>
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input type="checkbox" name="isMain" className="accent-purple-400" />
              Main lift
            </label>

            <button type="submit" className="w-full bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-purple-400 font-semibold py-2 rounded-lg text-sm transition-colors">
              Add to Day
            </button>
          </form>

          {/* Create new exercise */}
          <form action={createAndAddExercise} className="bg-[#111] border border-[#222] rounded-xl p-4 space-y-3">
            <input type="hidden" name="programDayId" value={day.id} />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Create New Exercise</p>

            <label className="space-y-1 block">
              <span className="text-xs text-gray-500">Name</span>
              <input type="text" name="name" required placeholder="e.g. Cable Fly" className={`w-full ${inputCls}`} />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-xs text-gray-500">Category</span>
                <input list="categories-list" type="text" name="category" required placeholder="e.g. Strength" className={`w-full ${inputCls}`} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-gray-500">Body part</span>
                <input list="bodyparts-list" type="text" name="bodyPart" required placeholder="e.g. Chest" className={`w-full ${inputCls}`} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-gray-500">Sets</span>
                <input type="number" name="targetSets" defaultValue={3} min={1} className={`w-full ${inputCls}`} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-gray-500">Reps</span>
                <input type="text" name="targetReps" defaultValue="8-10" className={`w-full ${inputCls}`} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-gray-500">Rest (seconds)</span>
                <input type="number" name="restSeconds" defaultValue={90} min={0} className={`w-full ${inputCls}`} />
              </label>
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input type="checkbox" name="isMain" className="accent-purple-400" />
              Main lift
            </label>

            <button type="submit" className="w-full bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-purple-400 font-semibold py-2 rounded-lg text-sm transition-colors">
              Create &amp; Add to Day
            </button>
          </form>
        </div>
      ))}

      {/* Add training day */}
      <form action={addProgramDay} className="bg-[#111] border border-[#222] rounded-xl p-4 space-y-3">
        <input type="hidden" name="programId" value={program.id} />
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Add Training Day</p>
        <div className="flex gap-2">
          <input
            type="text"
            name="name"
            required
            placeholder="e.g. Lower B"
            className={`flex-1 ${inputCls}`}
          />
          <button type="submit" className="bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-purple-400 font-semibold px-4 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap">
            Add Day
          </button>
        </div>
      </form>
    </div>
  );
}
