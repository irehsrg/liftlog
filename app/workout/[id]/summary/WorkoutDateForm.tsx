"use client";

import { useState } from "react";
import { setWorkoutDate } from "@/app/actions/workout";

/**
 * Corrects the day a workout is filed under.
 *
 * Exists because sessions are stamped when they're logged, not when they're
 * trained: backfill two days in one sitting and both land on today, which the
 * streak reads as a single training day.
 */
export default function WorkoutDateForm({
  workoutId,
  initialDay,
}: {
  workoutId: string;
  initialDay: string;
}) {
  const [day, setDay] = useState(initialDay);
  // What the server holds. The prop can't play this role: it stays at the
  // original day until the route re-renders, so the form would read as unsaved
  // immediately after a successful save.
  const [savedDay, setSavedDay] = useState(initialDay);
  const [saving, setSaving] = useState(false);

  const dirty = day !== savedDay;

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
    <div className="bg-[#111] border border-[#222] rounded-xl p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Date</p>
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
