export const dynamic = "force-dynamic";
import { prisma } from "@/lib/db";

export default async function ProgramsPage() {
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

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
      <h1 className="text-2xl font-bold">Program</h1>

      {!program && (
        <p className="text-gray-500 text-center py-10">No active program.</p>
      )}

      {program && (
        <>
          <div className="bg-[#111] border border-[#222] rounded-xl p-4">
            <p className="font-semibold text-lg">{program.name}</p>
            <p className="text-sm text-gray-500">{program.days.length} training days</p>
          </div>

          <div className="space-y-4">
            {program.days.map((day) => (
              <div key={day.id} className="bg-[#111] border border-[#222] rounded-xl overflow-hidden">
                <div className="p-4 border-b border-[#222]">
                  <p className="font-semibold">Day {day.dayOrder} — {day.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {day.exercises.length} exercises
                  </p>
                </div>
                <div className="divide-y divide-[#1a1a1a]">
                  {day.exercises.map((pe) => (
                    <div key={pe.id} className="px-4 py-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className={`text-sm ${pe.isMain ? "font-semibold text-purple-300" : ""}`}>
                            {pe.exercise.name}
                          </p>
                          {pe.notes && (
                            <p className="text-xs text-gray-600 mt-0.5">{pe.notes}</p>
                          )}
                        </div>
                        <div className="text-right text-xs text-gray-500 ml-3">
                          <p>
                            {pe.targetSets}×{pe.targetReps}
                            {pe.targetRpe ? ` @ RPE ${pe.targetRpe}` : ""}
                          </p>
                          <p>{pe.restSeconds}s rest</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
