import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDistanceToNow, format } from "date-fns";
import { startWorkout } from "./actions/workout";
import StreakBadge from "./components/StreakBadge";

async function getTodayRecommendedDay() {
  const program = await prisma.program.findFirst({
    where: { active: true },
    include: { days: { orderBy: { dayOrder: "asc" } } },
  });
  if (!program) return null;

  const lastWorkout = await prisma.workout.findFirst({
    where: { programDayId: { not: null } },
    orderBy: { date: "desc" },
    include: { programDay: true },
  });

  const days = program.days;
  if (!lastWorkout?.programDay) return days[0] ?? null;

  const lastOrder = lastWorkout.programDay.dayOrder;
  const next = days.find((d) => d.dayOrder > lastOrder) ?? days[0];
  return next;
}

async function getRecentWorkouts() {
  return prisma.workout.findMany({
    orderBy: { date: "desc" },
    take: 5,
    include: {
      programDay: true,
      sets: true,
    },
  });
}

async function getStreak() {
  const workouts = await prisma.workout.findMany({
    orderBy: { date: "desc" },
    select: { date: true },
  });

  if (!workouts.length) return 0;

  const getWeek = (d: Date) => {
    const jan1 = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  };

  let streak = 0;
  let currentWeek = getWeek(new Date());
  const workoutsByWeek = new Map<number, number>();

  for (const w of workouts) {
    const wk = getWeek(new Date(w.date));
    workoutsByWeek.set(wk, (workoutsByWeek.get(wk) ?? 0) + 1);
  }

  while (workoutsByWeek.get(currentWeek) !== undefined) {
    if ((workoutsByWeek.get(currentWeek) ?? 0) >= 3) streak++;
    else break;
    currentWeek--;
  }

  return streak;
}

export default async function Home() {
  const [todayDay, recentWorkouts, streak] = await Promise.all([
    getTodayRecommendedDay(),
    getRecentWorkouts(),
    getStreak(),
  ]);

  return (
    <div className="px-4 pt-6 max-w-lg mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Lift Log</h1>
        <StreakBadge streak={streak} />
      </div>

      {/* Start Workout */}
      <form action={startWorkout}>
        {todayDay && (
          <input type="hidden" name="programDayId" value={todayDay.id} />
        )}
        <button
          type="submit"
          className="w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold text-xl py-5 rounded-2xl transition-colors"
        >
          Start Workout
        </button>
      </form>

      {/* Today's recommended day */}
      {todayDay && (
        <div className="bg-[#111] border border-[#222] rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Up Next</p>
          <p className="font-semibold text-lg">{todayDay.name}</p>
        </div>
      )}

      {/* Quick log without program */}
      <form action={startWorkout}>
        <button
          type="submit"
          className="w-full border border-[#333] text-gray-400 py-3 rounded-xl text-sm hover:border-[#555] transition-colors"
        >
          Quick Log (no program)
        </button>
      </form>

      {/* Recent workouts */}
      {recentWorkouts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Recent Workouts
          </h2>
          <div className="space-y-2">
            {recentWorkouts.map((w) => {
              const volume = w.sets
                .filter((s) => !s.isWarmup)
                .reduce((sum: number, s) => sum + s.weight * s.reps, 0);
              return (
                <Link
                  key={w.id}
                  href={`/workout/${w.id}/summary`}
                  className="block bg-[#111] border border-[#222] rounded-xl p-4 hover:border-[#444] transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{w.programDay?.name ?? "Quick Workout"}</p>
                      <p className="text-sm text-gray-500">
                        {formatDistanceToNow(new Date(w.date), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="text-right text-sm text-gray-400">
                      <p>{w.sets.filter((s) => !s.isWarmup).length} sets</p>
                      {volume > 0 && <p>{Math.round(volume).toLocaleString()} lb</p>}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {recentWorkouts.length === 0 && (
        <div className="text-center text-gray-500 py-8">
          <p className="text-4xl mb-3">🏋️</p>
          <p>No workouts yet. Hit Start Workout to begin.</p>
        </div>
      )}
    </div>
  );
}
