// Sanity checks for the workout pace / finish-time estimate. Pure functions, no
// database. Run with:  npx tsx scripts/check-pace.ts
import {
  buildPaceModel,
  estimateRemainingSeconds,
  formatRemaining,
  EMPTY_PACE,
  type SetTiming,
} from "../lib/pace";

/** A session from [exerciseId, secondsFromStart, isWarmup?] triples. */
function session(rows: [string, number, boolean?][]): SetTiming[] {
  return rows.map(([exerciseId, seconds, isWarmup]) => ({
    exerciseId,
    at: seconds * 1000,
    isWarmup: isWarmup ?? false,
  }));
}

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// --- buildPaceModel -------------------------------------------------------

check(
  "median gap per exercise, keyed to the set that opened the gap",
  buildPaceModel([session([["A", 0], ["A", 120], ["A", 240]])]),
  { perExercise: { A: 120 }, overall: 120, samples: 2 }
);

check(
  "one gap isn't enough to trust an exercise on its own",
  buildPaceModel([session([["A", 0], ["A", 120]])]),
  { perExercise: {}, overall: 120, samples: 1 }
);

// The 100s move from the last main set to the first accessory is real time and
// counts against "main" — the median keeps it from dragging that exercise down.
check(
  "heavy mains and quick accessories separate out",
  buildPaceModel([
    session([["main", 0], ["main", 180], ["main", 360], ["acc", 460], ["acc", 550], ["acc", 640]]),
  ]),
  { perExercise: { main: 180, acc: 90 }, overall: 100, samples: 5 }
);

check(
  "a gap that follows a warmup is not working rest",
  buildPaceModel([session([["A", 0, true], ["A", 30], ["A", 150]])]),
  { perExercise: {}, overall: 120, samples: 1 }
);

check(
  "walking away for half an hour doesn't count as rest",
  buildPaceModel([session([["A", 0], ["A", 120], ["A", 240], ["A", 2040]])]),
  { perExercise: { A: 120 }, overall: 120, samples: 2 }
);

check(
  "a double-tapped set isn't a gap",
  buildPaceModel([session([["A", 0], ["A", 3], ["A", 123]])]),
  { perExercise: {}, overall: 120, samples: 1 }
);

check(
  "sessions are independent — no gap spans two workouts",
  buildPaceModel([session([["A", 0], ["A", 120]]), session([["A", 0], ["A", 120]])]),
  { perExercise: { A: 120 }, overall: 120, samples: 2 }
);

check("no sets at all", buildPaceModel([[]]), { perExercise: {}, overall: null, samples: 0 });

// --- estimateRemainingSeconds --------------------------------------------

const history = buildPaceModel([session([["A", 0], ["A", 120], ["A", 240]])]);
const base = { history, live: EMPTY_PACE, secondsSinceLastSet: 0 };

check(
  "three sets left at two minutes a set",
  estimateRemainingSeconds({ ...base, remaining: [{ exerciseId: "A", sets: 3, restSeconds: 180 }] }),
  360
);

check(
  "nothing left to do",
  estimateRemainingSeconds({ ...base, remaining: [{ exerciseId: "A", sets: 0, restSeconds: 180 }] }),
  null
);

check(
  "no program targets at all",
  estimateRemainingSeconds({ ...base, remaining: [] }),
  null
);

check(
  "rest already running is credited against the next set",
  estimateRemainingSeconds({
    ...base,
    remaining: [{ exerciseId: "A", sets: 3, restSeconds: 180 }],
    secondsSinceLastSet: 60,
  }),
  300
);

check(
  "idling between sets never drains past one set's worth",
  estimateRemainingSeconds({
    ...base,
    remaining: [{ exerciseId: "A", sets: 3, restSeconds: 180 }],
    secondsSinceLastSet: 3600,
  }),
  240
);

// Six live gaps at 180s against a 120s baseline: 1.5x, damped to 0.75 weight.
const slowToday = buildPaceModel([
  session([["A", 0], ["A", 180], ["A", 360], ["A", 540], ["A", 720], ["A", 900], ["A", 1080]]),
]);
check(
  "a dragging session pushes the finish out",
  estimateRemainingSeconds({
    remaining: [{ exerciseId: "A", sets: 3, restSeconds: 180 }],
    history,
    live: slowToday,
    secondsSinceLastSet: 0,
  }),
  495 // 3 x 120 x 1.375
);

// Two live gaps carry a third of the weight six would.
const slowEarly = buildPaceModel([session([["A", 0], ["A", 180], ["A", 360]])]);
check(
  "two slow sets barely move it — not enough to go on yet",
  estimateRemainingSeconds({
    remaining: [{ exerciseId: "A", sets: 3, restSeconds: 180 }],
    history,
    live: slowEarly,
    secondsSinceLastSet: 0,
  }),
  405 // 3 x 120 x 1.125
);

check(
  "an exercise with no history of its own falls back to the overall median",
  estimateRemainingSeconds({ ...base, remaining: [{ exerciseId: "Z", sets: 2, restSeconds: 90 }] }),
  240
);

check(
  "first ever session of a day falls back to prescribed rest plus overhead",
  estimateRemainingSeconds({
    remaining: [{ exerciseId: "Z", sets: 2, restSeconds: 90 }],
    history: EMPTY_PACE,
    live: EMPTY_PACE,
    secondsSinceLastSet: 0,
  }),
  270 // 2 x (90 + 45)
);

check(
  "with no history, today's own pace takes over",
  estimateRemainingSeconds({
    remaining: [{ exerciseId: "A", sets: 2, restSeconds: 90 }],
    history: EMPTY_PACE,
    live: history,
    secondsSinceLastSet: 0,
  }),
  240
);

check(
  "mixed remaining work sums per exercise",
  estimateRemainingSeconds({
    remaining: [
      { exerciseId: "main", sets: 2, restSeconds: 180 },
      { exerciseId: "acc", sets: 3, restSeconds: 90 },
    ],
    history: buildPaceModel([
      session([["main", 0], ["main", 180], ["main", 360], ["acc", 460], ["acc", 550], ["acc", 640]]),
    ]),
    live: EMPTY_PACE,
    secondsSinceLastSet: 0,
  }),
  630 // 2 x 180 + 3 x 90
);

// --- formatRemaining ------------------------------------------------------

check("formats under a minute", formatRemaining(20), "<1 min");
check("formats minutes", formatRemaining(32 * 60), "32 min");
check("formats past an hour", formatRemaining(80 * 60), "1h 20m");

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
