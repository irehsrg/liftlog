export const dynamic = "force-dynamic";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { formatDistanceToNow, format } from "date-fns";
import { startWorkout } from "./actions/workout";
import StreakBadge from "./components/StreakBadge";

async function getProgramInfo() {
  const program = await prisma.program.findFirst({
    where: { active: true },
    include: { days: { orderBy: { dayOrder: "asc" } } },
  });
  if (!program) return { nextDay: null, allDays: [] };

  const lastWorkout = await prisma.workout.findFirst({
    where: { programDayId: { not: null } },
    orderBy: { date: "desc" },
    include: { programDay: true },
  });

  const days = program.days;
  let nextDay;
  if (!lastWorkout?.programDay) {
    nextDay = days[0] ?? null;
  } else {
    const lastOrder = lastWorkout.programDay.dayOrder;
    nextDay = days.find((d) => d.dayOrder > lastOrder) ?? days[0];
  }
  return { nextDay, allDays: days };
}

async function getRecentWorkouts() {
  return prisma.workout.findMany({
    where: { finishedAt: { not: null } },
    orderBy: { date: "desc" },
    take: 5,
    include: {
      programDay: true,
      sets: true,
    },
  });
}

// The active, not-yet-finished workout (if any). A workout only ends via the
// Finish button — navigating away leaves it in progress and resumable here.
async function getInProgressWorkout() {
  return prisma.workout.findFirst({
    where: { finishedAt: null },
    orderBy: { date: "desc" },
    include: { programDay: true, sets: true },
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
  const [{ nextDay: todayDay, allDays }, recentWorkouts, streak, inProgress] = await Promise.all([
    getProgramInfo(),
    getRecentWorkouts(),
    getStreak(),
    getInProgressWorkout(),
  ]);

  const inProgressWorkingSets = inProgress
    ? inProgress.sets.filter((s) => !s.isWarmup).length
    : 0;

  return (
    <div className="px-4 pt-6 max-w-lg mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Image src="/logo.png" alt="Lift Log" width={40} height={40} className="rounded-xl" />
        <StreakBadge streak={streak} />
      </div>

      {/* Resume in-progress workout */}
      {inProgress && (
        <Link
          href={`/workout/${inProgress.id}`}
          className="block rounded-2xl p-4 bg-purple-400/10 border border-purple-400/40 hover:border-purple-400 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-purple-300 uppercase tracking-wider font-semibold">
                Workout in progress
              </p>
              <p className="font-semibold mt-0.5">
                {inProgress.programDay?.name ?? "Quick Workout"}
              </p>
              <p className="text-sm text-gray-400 mt-0.5">
                {inProgressWorkingSets} set{inProgressWorkingSets === 1 ? "" : "s"} ·{" "}
                started {formatDistanceToNow(new Date(inProgress.date), { addSuffix: true })}
              </p>
            </div>
            <span className="text-purple-300 font-bold text-sm whitespace-nowrap">Resume →</span>
          </div>
        </Link>
      )}

      {/* Program day picker */}
      {allDays.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Choose Day</p>
          {allDays.map((day) => {
            const isNext = day.id === todayDay?.id;
            return (
              <form key={day.id} action={startWorkout}>
                <input type="hidden" name="programDayId" value={day.id} />
                <button
                  type="submit"
                  className={`w-full text-left rounded-xl p-4 transition-colors border ${
                    isNext
                      ? "bg-purple-400 hover:bg-purple-500 active:bg-purple-600 border-purple-400 text-white"
                      : "bg-[#111] border-[#222] hover:border-[#444]"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">{day.name}</span>
                    {isNext && <span className="text-xs opacity-75">Up Next</span>}
                  </div>
                </button>
              </form>
            );
          })}
        </div>
      ) : (
        <form action={startWorkout}>
          <button
            type="submit"
            className="w-full bg-purple-400 hover:bg-purple-500 active:bg-purple-600 text-white font-bold text-xl py-5 rounded-2xl transition-colors"
          >
            Start Workout
          </button>
        </form>
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
