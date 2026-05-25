export default function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0) return null;
  return (
    <div className="flex items-center gap-1 bg-orange-500/20 text-orange-400 px-3 py-1 rounded-full text-sm font-semibold">
      <span>🔥</span>
      <span>{streak}w streak</span>
    </div>
  );
}
