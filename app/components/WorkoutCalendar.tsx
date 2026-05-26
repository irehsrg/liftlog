// Server component — no "use client" directive

interface WorkoutCalendarProps {
  workoutDates: Date[];
}

const WEEKS = 16;
const DAY_LABELS = ["M", "", "W", "", "F", "", "S"];

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Distance back to Monday
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default function WorkoutCalendar({ workoutDates }: WorkoutCalendarProps) {
  // Build a Set of date strings for O(1) lookup (YYYY-MM-DD in local time)
  const workoutSet = new Set(
    workoutDates.map((d) => {
      const local = new Date(d);
      return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
    })
  );

  // The grid runs from 16 weeks ago (Monday) through the current week's Sunday.
  // "Today" is the rightmost week.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisMonday = getMondayOfWeek(today);

  // Start Monday = thisMonday - (WEEKS - 1) * 7 days
  const startMonday = addDays(thisMonday, -(WEEKS - 1) * 7);

  // Build weeks: array of 16, each containing 7 Date objects (Mon..Sun)
  const weeks: Date[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    const weekStart = addDays(startMonday, w * 7);
    const days: Date[] = [];
    for (let d = 0; d < 7; d++) {
      days.push(addDays(weekStart, d));
    }
    weeks.push(days);
  }

  // Build month labels: for each column, show the month abbreviation if the
  // month changes from the previous column (or it's the first column).
  const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthLabels: (string | null)[] = weeks.map((week, i) => {
    const firstDay = week[0]; // Monday of this week
    if (i === 0) return MONTH_ABBR[firstDay.getMonth()];
    const prevFirstDay = weeks[i - 1][0];
    if (firstDay.getMonth() !== prevFirstDay.getMonth()) {
      return MONTH_ABBR[firstDay.getMonth()];
    }
    return null;
  });

  function dateKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

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
            {week.map((day, dIdx) => {
              const key = dateKey(day);
              const hasWorkout = workoutSet.has(key);
              const isFuture = day > today;
              return (
                <div
                  key={dIdx}
                  title={key}
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
