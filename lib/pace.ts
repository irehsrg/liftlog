/**
 * Workout pace: how long a set actually takes, measured from the gaps between
 * logged sets rather than from the program's prescribed rest.
 *
 * The gap between one set and the next covers everything real — the rest, the
 * setup, plate changes, the time spent typing it in — so it's a better unit than
 * anything we could assemble from the program. Timings are keyed to the exercise
 * of the set that *precedes* the gap, which makes heavy mains and quick
 * accessories separate automatically, and gives supersets the short
 * move-to-the-next-station gap they actually have.
 *
 * Medians throughout: a single interrupted set shouldn't drag the estimate.
 */

/** Longer than this is someone leaving the gym floor, not resting. */
const MAX_GAP_SECONDS = 20 * 60;
/** Shorter than this is a double-tap or a correction, not a set. */
const MIN_GAP_SECONDS = 10;
/** Work and logging time added to prescribed rest when there's nothing measured. */
export const DEFAULT_OVERHEAD_SECONDS = 45;
/** Gaps needed before one exercise's own timing beats the overall median. */
const MIN_EXERCISE_SAMPLES = 2;
/** Gaps after which today's pace carries its full weight. */
const LIVE_CONFIDENCE_GAPS = 6;
/** Today's pace never fully displaces the historical baseline. */
const MAX_LIVE_WEIGHT = 0.75;
/** Today can read at most twice as slow or half as fast as usual. */
const MIN_PACE_FACTOR = 0.5;
const MAX_PACE_FACTOR = 2;

export type SetTiming = {
  exerciseId: string;
  /** Epoch milliseconds. */
  at: number;
  isWarmup: boolean;
};

export type PaceModel = {
  /** Median seconds per set for each exercise with enough gaps to be worth trusting. */
  perExercise: Record<string, number>;
  /** Median seconds per set across every exercise. */
  overall: number | null;
  /** Number of gaps behind the model — how much it should be trusted. */
  samples: number;
};

export type RemainingWork = {
  exerciseId: string;
  /** Working sets still to do. */
  sets: number;
  /** The program's prescribed rest, used only as a last-resort fallback. */
  restSeconds: number;
};

export const EMPTY_PACE: PaceModel = { perExercise: {}, overall: null, samples: 0 };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Build a pace model from past sessions — one array of set timings per workout. */
export function buildPaceModel(sessions: SetTiming[][]): PaceModel {
  const byExercise = new Map<string, number[]>();
  const all: number[] = [];

  for (const session of sessions) {
    const ordered = [...session].sort((a, b) => a.at - b.at);
    for (let i = 1; i < ordered.length; i++) {
      const previous = ordered[i - 1];
      // Rest after a warmup isn't the working rest, so it would bias the model
      // down. The gap belongs to the set that opened it.
      if (previous.isWarmup) continue;

      const seconds = (ordered[i].at - previous.at) / 1000;
      if (seconds < MIN_GAP_SECONDS || seconds > MAX_GAP_SECONDS) continue;

      all.push(seconds);
      const gaps = byExercise.get(previous.exerciseId);
      if (gaps) gaps.push(seconds);
      else byExercise.set(previous.exerciseId, [seconds]);
    }
  }

  const perExercise: Record<string, number> = {};
  for (const [exerciseId, gaps] of byExercise) {
    if (gaps.length >= MIN_EXERCISE_SAMPLES) perExercise[exerciseId] = median(gaps);
  }

  return { perExercise, overall: all.length ? median(all) : null, samples: all.length };
}

/**
 * Seconds of work left in the session, or null when nothing is left to do.
 *
 * Today's pace scales the historical baseline rather than replacing it, gaining
 * influence as the session accumulates gaps — so a slow first couple of sets
 * doesn't swing the estimate wildly, but a session that's genuinely dragging
 * moves it.
 */
export function estimateRemainingSeconds({
  remaining,
  history,
  live,
  secondsSinceLastSet,
}: {
  remaining: RemainingWork[];
  history: PaceModel;
  live: PaceModel;
  secondsSinceLastSet: number;
}): number | null {
  const todo = remaining.filter((r) => r.sets > 0);
  if (!todo.length) return null;

  const weight = Math.min(live.samples / LIVE_CONFIDENCE_GAPS, 1) * MAX_LIVE_WEIGHT;
  const factor =
    live.overall && history.overall
      ? 1 + (clamp(live.overall / history.overall, MIN_PACE_FACTOR, MAX_PACE_FACTOR) - 1) * weight
      : 1;

  const secondsFor = (work: RemainingWork) => {
    const baseline = history.perExercise[work.exerciseId] ?? history.overall;
    if (baseline != null) return baseline * factor;
    // No history for this program day yet — today's own pace, then the program.
    return (
      live.perExercise[work.exerciseId] ??
      live.overall ??
      work.restSeconds + DEFAULT_OVERHEAD_SECONDS
    );
  };

  const total = todo.reduce((sum, work) => sum + work.sets * secondsFor(work), 0);

  // Rest after the last logged set is already running, so part of the next set is
  // paid for — but idling between sets shouldn't drain the estimate to nothing.
  const nextSet = secondsFor(todo[0]);
  return Math.max(0, total - Math.min(secondsSinceLastSet, nextSet));
}

/** "45 min", "1h 20m", "<1 min" — for a remaining-time label. */
export function formatRemaining(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
