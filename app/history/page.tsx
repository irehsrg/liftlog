import Link from "next/link";
import { prisma } from "@/lib/db";
import { format } from "date-fns";

export default async function HistoryPage() {
  const workouts = await prisma.workout.findMany({
    orderBy: { date: "desc" },
    include: {
      programDay: true,
      sets: true,
    },
  });

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
      <h1 className="text-2xl font-bold">History</h1>

      {workouts.length === 0 && (
        <p className="text-gray-500 text-center py-10">No workouts logged yet.</p>
      )}

      <div className="space-y-2">
        {workouts.map((w) => {
          const workingSets = w.sets.filter((s) => !s.isWarmup);
          const volume = workingSets.reduce((sum, s) => sum + s.weight * s.reps, 0);
          const durationMin = w.duration ? Math.round(w.duration / 60) : null;

          return (
            <Link
              key={w.id}
              href={`/workout/${w.id}/summary`}
              className="block bg-[#111] border border-[#222] rounded-xl p-4 hover:border-[#444] transition-colors"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold">{w.programDay?.name ?? "Quick Workout"}</p>
                  <p className="text-sm text-gray-500">
                    {format(new Date(w.date), "EEE, MMM d, yyyy")}
                    {durationMin && ` · ${durationMin}min`}
                  </p>
                </div>
                <div className="text-right text-sm text-gray-400">
                  <p>{workingSets.length} sets</p>
                  {volume > 0 && (
                    <p>{Math.round(volume).toLocaleString()} lb</p>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
