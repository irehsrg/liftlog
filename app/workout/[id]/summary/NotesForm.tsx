"use client";

import { useRef } from "react";
import { saveWorkoutNotes } from "@/app/actions/workout";

export default function NotesForm({
  workoutId,
  initialNotes,
}: {
  workoutId: string;
  initialNotes: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const handleBlur = async () => {
    const fd = new FormData();
    fd.append("workoutId", workoutId);
    fd.append("notes", ref.current?.value ?? "");
    await saveWorkoutNotes(fd);
  };

  return (
    <div className="bg-[#111] border border-[#222] rounded-xl p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Notes</p>
      <textarea
        ref={ref}
        defaultValue={initialNotes}
        onBlur={handleBlur}
        placeholder="How did it feel? PR notes, anything to remember..."
        rows={3}
        className="w-full bg-transparent text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none"
      />
    </div>
  );
}
