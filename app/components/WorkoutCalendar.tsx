// Server component — no "use client" directive
import { dayKey, daysAfter, monthOf, weekKey, weeksBefore } from "@/lib/week";

interface WorkoutCalendarProps {
  workoutDates: Date[];
}

const WEEKS = 16;
const DAY_LABELS = ["M", "", "W", "", "F", "", "S"];
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function WorkoutCalendar({ workoutDates }: WorkoutCalendarProps) {
  // Days come from lib/week so the heatmap and the streak agree on which
  // calendar day a workout landed on, and on where each Mon–Sun week begins.
  const workoutSet = new Set(workoutDates.map(dayKey));

  const today = dayKey(new Date());
  const thisMonday = weekKey(today);

  // The grid runs from 15 weeks before this one through the current week's
  // Sunday, so "today" sits in the rightmost column.
  const weeks: string[][] = Array.from({ length: WEEKS }, (_, w) => {
    const weekStart = weeksBefore(thisMonday, WEEKS - 1 - w);
    return Array.from({ length: 7 }, (_, d) => daysAfter(weekStart, d));
  });

  // Label a column with its month only when the month changes from the column
  // before it (or it's the first column).
  const monthLabels = weeks.map((week, i) => {
    const month = monthOf(week[0]);
    if (i === 0 || month !== monthOf(weeks[i - 1][0])) return MONTH_ABBR[month];
    return null;
  });

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex gap-1" style={{ minWidth: "min-content" }}>
        {/* Day-of-week labels column */}
        <div className="flex flex-col gap-1">
          {/* Spacer to align with month label row */}
          <div className="h-4" />
          {DAY_LABELS.map((label, i) => (
            <div
              key={i}
              className="w-4 h-[10px] flex items-center justify-end pr-0.5 text-[9px] leading-none text-gray-500"
            >
              {label}
            </div>
          ))}
        </div>

        {/* Week columns */}
        {weeks.map((week, wIdx) => (
          <div key={wIdx} className="flex flex-col gap-1">
            {/* Month label */}
            <div className="h-4 flex items-end text-[9px] leading-none text-gray-500 whitespace-nowrap">
              {monthLabels[wIdx] ?? ""}
            </div>

            {/* Day cells (Mon=0 .. Sun=6) */}
            {week.map((day) => {
              const hasWorkout = workoutSet.has(day);
              const isFuture = day > today; // ISO day strings sort chronologically
              return (
                <div
                  key={day}
                  title={day}
                  className={[
                    "w-[10px] h-[10px] rounded-sm",
                    isFuture
                      ? "bg-[#1a1a1a]"
                      : hasWorkout
                      ? "bg-purple-400"
                      : "bg-[#222]",
                  ].join(" ")}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
