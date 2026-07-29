import type { Streak } from "@/lib/streak";

export default function StreakBadge({ weeks, thisWeek, goal }: Streak) {
  if (!weeks && !thisWeek) return null;
  const goalMet = thisWeek >= goal;

  return (
    <div className="flex items-center gap-2">
      {weeks > 0 && (
        <div className="flex items-center gap-1 bg-purple-400/20 text-purple-300 px-3 py-1 rounded-full text-sm font-semibold">
          <span>🔥</span>
          <span>{weeks}w streak</span>
        </div>
      )}
      {/* Progress against this week's goal — the streak itself never counts the
          week in progress, so this is what says how much is left to keep it. */}
      <div
        className={`px-3 py-1 rounded-full text-sm font-semibold ${
          goalMet
            ? "bg-purple-400/20 text-purple-300"
            : "bg-[#111] border border-[#222] text-gray-400"
        }`}
        title={`${thisWeek} of ${goal} training days this week`}
      >
        {thisWeek}/{goal} this week
      </div>
    </div>
  );
}
