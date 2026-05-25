import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { format } from "date-fns";
import { saveWorkoutNotes, deleteWorkout } from "@/app/actions/workout";
import NotesForm from "./NotesForm";

function epley1RM(weight: number, reps: number) {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

export default async function WorkoutSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const workout = await prisma.workout.findUnique({
    where: { id },
    include: {
      programDay: true,
      sets: {
        orderBy: [{ exerciseId: "asc" }, { setOrder: "asc" }],
        include: { exercise: true },
      },
    },
  });

  if (!workout) notFound();

  const workingSets = workout.sets.filter((s) => !s.isWarmup);
  const totalVolume = workingSets.reduce((sum: number, s) => sum + s.weight * s.reps, 0);

  // Group by exercise
  const byExercise = workingSets.reduce<Record<string, typeof workingSets>>((acc, s) => {
    if (!acc[s.exerciseId]) acc[s.exerciseId] = [];
    acc[s.exerciseId].push(s);
    return acc;
  }, {});

  // Get previous workout performance for comparison
  const prevData: Record<string, { totalVolume: number; bestSet: { weight: number; reps: number } }> = {};
  for (const exId of Object.keys(byExercise)) {
    const prevSets = await prisma.workoutSet.findMany({
      where: { exerciseId: exId, workoutId: { not: id }, isWarmup: false },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    if (!prevSets.length) continue;
    // Get sets from the most recent prior workout containing this exercise
    const prevWorkoutId = prevSets[0].workoutId;
    const prevWorkoutSets = prevSets.filter((s) => s.workoutId === prevWorkoutId);
    prevData[exId] = {
      totalVolume: prevWorkoutSets.reduce((sum: number, s) => sum + s.weight * s.reps, 0),
      bestSet: prevWorkoutSets.reduce(
        (best: typeof prevWorkoutSets[0], s: typeof prevWorkoutSets[0]) => (epley1RM(s.weight, s.reps) > epley1RM(best.weight, best.reps) ? s : best),
        prevWorkoutSets[0]
      ),
    };
  }

  const durationMin = workout.duration ? Math.round(workout.duration / 60) : null;

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{workout.programDay?.name ?? "Quick Workout"}</h1>
          <p className="text-sm text-gray-500">
            {format(new Date(workout.date), "EEEE, MMM d")}
            {durationMin && ` · ${durationMin}min`}
          </p>
        </div>
        <Link href="/" className="text-orange-500 font-semibold text-sm">
          Done
        </Link>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Sets" value={workingSets.length.toString()} />
        <StatCard label="Volume" value={`${Math.round(totalVolume).toLocaleString()}`} sub="lb" />
        {durationMin && <StatCard label="Duration" value={`${durationMin}`} sub="min" />}
      </div>

      {/* Per-exercise breakdown */}
      <div className="space-y-3">
        {Object.entries(byExercise).map(([exId, exSets]) => {
          const bestSet = exSets.reduce(
            (best: typeof exSets[0], s: typeof exSets[0]) => (epley1RM(s.weight, s.reps) > epley1RM(best.weight, best.reps) ? s : best),
            exSets[0]
          );
          const volume = exSets.reduce((sum: number, s) => sum + s.weight * s.reps, 0);
          const prev = prevData[exId];
          const volumeDelta = prev ? ((volume - prev.totalVolume) / prev.totalVolume) * 100 : null;

          return (
            <Link
              key={exId}
              href={`/exercises/${exId}`}
              className="block bg-[#111] border border-[#222] rounded-xl p-4 hover:border-[#444] transition-colors"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">{exSets[0].exercise.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Best: {bestSet.weight} lb × {bestSet.reps}
                    {bestSet.rpe ? ` @ RPE ${bestSet.rpe}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-400">{Math.round(volume).toLocaleString()} lb</p>
                  {volumeDelta !== null && (
                    <p
                      className={`text-xs ${
                        volumeDelta >= 0 ? "text-green-500" : "text-red-400"
                      }`}
                    >
                      {volumeDelta >= 0 ? "+" : ""}
                      {volumeDelta.toFixed(1)}%
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-2 flex gap-1 flex-wrap">
                {exSets.map((s, i) => (
                  <span
                    key={i}
                    className="text-xs bg-[#1a1a1a] px-2 py-0.5 rounded text-gray-400"
                  >
                    {s.weight}×{s.reps}
                  </span>
                ))}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Notes */}
      <NotesForm workoutId={workout.id} initialNotes={workout.notes ?? ""} />

      {/* Delete */}
      <form action={deleteWorkout}>
        <input type="hidden" name="workoutId" value={workout.id} />
        <button
          type="submit"
          className="w-full text-sm text-red-600 hover:text-red-400 py-2"
        >
          Delete Workout
        </button>
      </form>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#111] border border-[#222] rounded-xl p-3 text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold">
        {value}
        {sub && <span className="text-sm text-gray-500 ml-1">{sub}</span>}
      </p>
    </div>
  );
}
