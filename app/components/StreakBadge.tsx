export default function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0) return null;
  return (
    <div className="flex items-center gap-1 bg-purple-400/20 text-purple-300 px-3 py-1 rounded-full text-sm font-semibold">
      <span>🔥</span>
      <span>{streak}w streak</span>
    </div>
  );
}
