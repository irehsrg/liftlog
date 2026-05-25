import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { format } from "date-fns";
import ExerciseCharts from "./ExerciseCharts";

function epley1RM(weight: number, reps: number) {
  return Math.round(weight * (1 + reps / 30));
}

export default async function ExercisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const exercise = await prisma.exercise.findUnique({ where: { id } });
  if (!exercise) notFound();

  const allSets = await prisma.workoutSet.findMany({
    where: { exerciseId: id, isWarmup: false },
    orderBy: { createdAt: "asc" },
    include: { workout: { select: { date: true } } },
  });

  // Group by workout date for charting
  const byWorkout = new Map<string, { date: Date; sets: typeof allSets }>();
  for (const s of allSets) {
    const key = s.workoutId;
    if (!byWorkout.has(key)) byWorkout.set(key, { date: new Date(s.workout.date), sets: [] });
    byWorkout.get(key)!.sets.push(s);
  }

  const chartData = [...byWorkout.values()].map(({ date, sets }) => {
    const bestSet = sets.reduce(
      (best: typeof allSets[0], s: typeof allSets[0]) => (epley1RM(s.weight, s.reps) > epley1RM(best.weight, best.reps) ? s : best),
      sets[0]
    );
    return {
      date: format(date, "MMM d"),
      weight: bestSet.weight,
      e1rm: epley1RM(bestSet.weight, bestSet.reps),
      volume: sets.reduce((sum, s) => sum + s.weight * s.reps, 0),
    };
  });

  // PRs
  const prWeight = allSets.reduce((max, s) => (s.weight > max ? s.weight : max), 0);
  const prReps = allSets.reduce(
    (max, s) => (s.reps > max.reps ? s : max),
    allSets[0] ?? { weight: 0, reps: 0 }
  );
  const prE1RM = allSets.reduce(
    (max, s) => (epley1RM(s.weight, s.reps) > epley1RM(max.weight, max.reps) ? s : max),
    allSets[0] ?? { weight: 0, reps: 0 }
  );

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{exercise.name}</h1>
        <p className="text-sm text-gray-500 capitalize">
          {exercise.category} · {exercise.bodyPart}
        </p>
      </div>

      {allSets.length === 0 && (
        <p className="text-gray-500 text-center py-10">No sets logged yet.</p>
      )}

      {allSets.length > 0 && (
        <>
          {/* PRs */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#111] border border-[#222] rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Heaviest</p>
              <p className="text-lg font-bold">{prWeight}</p>
              <p className="text-xs text-gray-600">lb</p>
            </div>
            <div className="bg-[#111] border border-[#222] rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Most Reps</p>
              <p className="text-lg font-bold">{prReps.reps}</p>
              <p className="text-xs text-gray-600">@ {prReps.weight} lb</p>
            </div>
            <div className="bg-[#111] border border-[#222] rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Est. 1RM</p>
              <p className="text-lg font-bold">{epley1RM(prE1RM.weight, prE1RM.reps)}</p>
              <p className="text-xs text-gray-600">lb</p>
            </div>
          </div>

          {/* Charts */}
          <ExerciseCharts data={chartData} />

          {/* All sets table */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              All Sets
            </h2>
            <div className="bg-[#111] border border-[#222] rounded-xl overflow-hidden">
              <div className="grid grid-cols-4 gap-2 text-xs text-gray-600 px-4 py-2 border-b border-[#222]">
                <span>Date</span>
                <span>Weight</span>
                <span>Reps</span>
                <span>RPE</span>
              </div>
              <div className="divide-y divide-[#1a1a1a] max-h-80 overflow-y-auto">
                {[...allSets].reverse().map((s) => (
                  <div key={s.id} className="grid grid-cols-4 gap-2 text-sm px-4 py-2.5">
                    <span className="text-gray-500">
                      {format(new Date(s.workout.date), "MMM d")}
                    </span>
                    <span>{s.weight}</span>
                    <span>{s.reps}</span>
                    <span className="text-gray-500">{s.rpe ?? "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
