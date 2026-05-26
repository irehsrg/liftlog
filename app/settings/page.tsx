export const dynamic = "force-dynamic";
import { prisma } from "@/lib/db";
import { saveSettings, addExercise } from "@/app/actions/settings";

export default async function SettingsPage() {
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } }) ?? {
    barWeight: 45,
    plates: "45,35,25,10,5,2.5",
    mainRestSecs: 180,
    acceRestSecs: 90,
  };

  const exercises = await prisma.exercise.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Equipment */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Equipment
        </h2>
        <form action={saveSettings} className="bg-[#111] border border-[#222] rounded-xl divide-y divide-[#1a1a1a]">
          <label className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm">Bar Weight (lb)</span>
            <input
              type="number"
              inputMode="decimal"
              name="barWeight"
              defaultValue={settings.barWeight}
              className="w-20 bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-1.5 text-sm text-right focus:border-purple-400 focus:outline-none"
            />
          </label>
          <label className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm">Plate Inventory</p>
              <p className="text-xs text-gray-600">Comma-separated (pairs)</p>
            </div>
            <input
              type="text"
              name="plates"
              defaultValue={settings.plates}
              className="w-40 bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-1.5 text-sm text-right focus:border-purple-400 focus:outline-none"
            />
          </label>
          <label className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm">Main Lift Rest (s)</span>
            <input
              type="number"
              inputMode="numeric"
              name="mainRestSecs"
              defaultValue={settings.mainRestSecs}
              className="w-20 bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-1.5 text-sm text-right focus:border-purple-400 focus:outline-none"
            />
          </label>
          <label className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm">Accessory Rest (s)</span>
            <input
              type="number"
              inputMode="numeric"
              name="acceRestSecs"
              defaultValue={settings.acceRestSecs}
              className="w-20 bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-1.5 text-sm text-right focus:border-purple-400 focus:outline-none"
            />
          </label>
          <div className="px-4 py-3">
            <button
              type="submit"
              className="w-full bg-purple-400 hover:bg-purple-500 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              Save Settings
            </button>
          </div>
        </form>
      </section>

      {/* Add Exercise */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Add Exercise
        </h2>
        <form action={addExercise} className="bg-[#111] border border-[#222] rounded-xl p-4 space-y-3">
          <input
            type="text"
            name="name"
            placeholder="Exercise name"
            required
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2.5 text-sm focus:border-purple-400 focus:outline-none"
          />
          <div className="flex gap-2">
            <select
              name="category"
              className="flex-1 bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2.5 text-sm focus:border-purple-400 focus:outline-none"
            >
              <option value="compound">Compound</option>
              <option value="accessory">Accessory</option>
              <option value="plyometric">Plyometric</option>
            </select>
            <select
              name="bodyPart"
              className="flex-1 bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2.5 text-sm focus:border-purple-400 focus:outline-none"
            >
              <option value="legs">Legs</option>
              <option value="push">Push</option>
              <option value="pull">Pull</option>
              <option value="core">Core</option>
            </select>
          </div>
          <button
            type="submit"
            className="w-full border border-[#333] hover:border-[#555] text-gray-300 font-semibold py-2.5 rounded-lg text-sm transition-colors"
          >
            Add Exercise
          </button>
        </form>
      </section>

      {/* Exercise list */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Exercises ({exercises.length})
        </h2>
        <div className="bg-[#111] border border-[#222] rounded-xl divide-y divide-[#1a1a1a]">
          {exercises.map((ex) => (
            <div key={ex.id} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm">{ex.name}</span>
              <span className="text-xs text-gray-600 capitalize">{ex.bodyPart}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
