"use client";

import { useState } from "react";
import { setWorkoutDate } from "@/app/actions/workout";

/**
 * Corrects the day a workout is filed under.
 *
 * Exists because sessions are stamped when they're logged, not when they're
 * trained: backfill two days in one sitting and both land on today, which the
 * streak reads as a single training day.
 *
 * `alsoOnThisDay` names the other counting sessions already filed on this day.
 * When it's non-empty this session is, right now, costing the week a training
 * day — so the control stops being a quiet footnote and says so. A silent date
 * field only helps someone who already knows to look for it; the case that
 * actually breaks a streak is the one where the user has no idea anything is
 * wrong until the badge has already dropped.
 */
export default function WorkoutDateForm({
  workoutId,
  initialDay,
  alsoOnThisDay = [],
}: {
  workoutId: string;
  initialDay: string;
  alsoOnThisDay?: string[];
}) {
  const [day, setDay] = useState(initialDay);
  // What the server holds. The prop can't play this role: it stays at the
  // original day until the route re-renders, so the form would read as unsaved
  // immediately after a successful save.
  const [savedDay, setSavedDay] = useState(initialDay);
  const [saving, setSaving] = useState(false);

  const dirty = day !== savedDay;
  // Only while it's still filed on the day that collided. Once the date is
  // moved the collision is resolved, and a stale warning would be worse than
  // none — it would send the user looking for a problem they just fixed.
  const collides = alsoOnThisDay.length > 0 && savedDay === initialDay;

  const save = async () => {
    setSaving(true);
    const fd = new FormData();
    fd.append("workoutId", workoutId);
    fd.append("date", day);
    await setWorkoutDate(fd);
    setSavedDay(day);
    setSaving(false);
  };

  return (
    <div
      className={`bg-[#111] border rounded-xl p-4 ${
        collides ? "border-amber-500/50" : "border-[#222]"
      }`}
    >
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Date</p>

      {collides && (
        <div className="mb-3 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          <p className="text-sm text-amber-300 font-semibold mb-1">
            Two sessions on one day
          </p>
          <p className="text-xs text-amber-200/80">
            {alsoOnThisDay.length === 1 ? (
              <>
                <span className="font-medium">{alsoOnThisDay[0]}</span> is already filed
                on this day.
              </>
            ) : (
              <>
                {alsoOnThisDay.length} other sessions are already filed on this day.
              </>
            )}{" "}
            A day counts once toward your weekly goal, so together these count as
            one training day. If this session was trained on a different day, set
            the date below and the week gets its day back.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="flex-1 bg-transparent text-sm text-gray-200 focus:outline-none"
        />
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="text-sm font-semibold text-purple-300 hover:text-purple-200 disabled:opacity-50 px-2 py-1"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        )}
        {!dirty && savedDay !== initialDay && (
          <span className="text-xs text-gray-500">Saved</span>
        )}
      </div>
      <p className="text-xs text-gray-600 mt-2">
        Logging a past session? Set the day you actually trained so it counts toward
        that week&apos;s streak.
      </p>
    </div>
  );
}
