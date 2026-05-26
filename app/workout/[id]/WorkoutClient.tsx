"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { addSet, deleteSet, finishWorkout } from "@/app/actions/workout";
import PlateCalculator from "@/app/components/PlateCalculator";
import RestTimer from "@/app/components/RestTimer";

type Exercise = { id: string; name: string; category: string; bodyPart: string };
type ProgramExercise = {
  id: string;
  exerciseId: string;
  exercise: Exercise;
  targetSets: number;
  targetReps: string;
  targetRpe: string | null;
  restSeconds: number;
  isMain: boolean;
  notes: string | null;
};
type WorkoutSet = {
  id: string;
  exerciseId: string;
  exercise: Exercise;
  setOrder: number;
  weight: number;
  reps: number;
  rpe: number | null;
  isWarmup: boolean;
};
type Workout = {
  id: string;
  programDay: {
    name: string;
    exercises: ProgramExercise[];
  } | null;
  sets: WorkoutSet[];
};

type PrevSet = { weight: number; reps: number; rpe: number | null; date: Date };
type Settings = { barWeight: number; plates: string; mainRestSecs: number; acceRestSecs: number };

export default function WorkoutClient({
  workout,
  prevPerformance,
  settings,
}: {
  workout: Workout;
  prevPerformance: Record<string, PrevSet[]>;
  settings: Settings;
}) {
  const [sets, setSets] = useState<WorkoutSet[]>(workout.sets);
  const [restTimer, setRestTimer] = useState<{ seconds: number; active: boolean } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showPlateCalc, setShowPlateCalc] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const startTime = useRef(Date.now());

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleAddSet = useCallback(
    async (exerciseId: string, weight: number, reps: number, rpe: string, isWarmup: boolean, restSeconds: number) => {
      const fd = new FormData();
      fd.append("workoutId", workout.id);
      fd.append("exerciseId", exerciseId);
      fd.append("weight", weight.toString());
      fd.append("reps", reps.toString());
      if (rpe) fd.append("rpe", rpe);
      fd.append("isWarmup", isWarmup.toString());

      await addSet(fd);

      if (!isWarmup) {
        setRestTimer({ seconds: restSeconds, active: true });
      }

      // Optimistic update
      setSets((prev) => [
        ...prev,
        {
          id: `temp_${Date.now()}`,
          exerciseId,
          exercise: { id: exerciseId, name: "", category: "", bodyPart: "" },
          setOrder: prev.filter((s) => s.exerciseId === exerciseId).length + 1,
          weight,
          reps,
          rpe: rpe ? parseFloat(rpe) : null,
          isWarmup,
        },
      ]);
    },
    [workout.id]
  );

  const handleDeleteSet = useCallback(
    async (setId: string) => {
      setSets((prev) => prev.filter((s) => s.id !== setId));
      const fd = new FormData();
      fd.append("setId", setId);
      fd.append("workoutId", workout.id);
      await deleteSet(fd);
    },
    [workout.id]
  );

  const handleFinish = async () => {
    setFinishing(true);
    const fd = new FormData();
    fd.append("workoutId", workout.id);
    fd.append("duration", elapsed.toString());
    await finishWorkout(fd);
  };

  // Build exercise list: from program or from sets logged so far
  const programExercises = workout.programDay?.exercises ?? [];
  const loggedExerciseIds = new Set(sets.map((s) => s.exerciseId));
  const extraExercises = sets
    .filter((s) => !programExercises.some((pe) => pe.exerciseId === s.exerciseId))
    .reduce<WorkoutSet["exercise"][]>((acc, s) => {
      if (!acc.find((e) => e.id === s.exerciseId)) acc.push(s.exercise);
      return acc;
    }, []);

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg leading-tight">
            {workout.programDay?.name ?? "Quick Workout"}
          </h1>
          <p className="text-sm text-gray-500">{formatElapsed(elapsed)}</p>
        </div>
        <button
          onClick={() => setShowPlateCalc((v) => !v)}
          className="text-xs border border-[#333] px-3 py-1.5 rounded-lg text-gray-400 hover:border-[#555]"
        >
          Plates
        </button>
      </div>

      {/* Plate calculator */}
      {showPlateCalc && (
        <PlateCalculator barWeight={settings.barWeight} platesStr={settings.plates} />
      )}

      {/* Rest timer */}
      {restTimer && (
        <RestTimer
          seconds={restTimer.seconds}
          onDismiss={() => setRestTimer(null)}
        />
      )}

      {/* Program exercises */}
      {programExercises.map((pe) => {
        const exerciseSets = sets.filter((s) => s.exerciseId === pe.exerciseId);
        const prev = prevPerformance[pe.exerciseId] ?? [];
        return (
          <ExerciseCard
            key={pe.id}
            programExercise={pe}
            sets={exerciseSets}
            prevSets={prev}
            workoutId={workout.id}
            onAddSet={(w, r, rpe, wu) => handleAddSet(pe.exerciseId, w, r, rpe, wu, pe.restSeconds)}
            onDeleteSet={handleDeleteSet}
          />
        );
      })}

      {/* Extra exercises logged outside program */}
      {extraExercises.map((ex) => {
        const exerciseSets = sets.filter((s) => s.exerciseId === ex.id);
        return (
          <ExerciseCard
            key={ex.id}
            programExercise={null}
            exercise={ex}
            sets={exerciseSets}
            prevSets={prevPerformance[ex.id] ?? []}
            workoutId={workout.id}
            onAddSet={(w, r, rpe, wu) => handleAddSet(ex.id, w, r, rpe, wu, 90)}
            onDeleteSet={handleDeleteSet}
          />
        );
      })}

      {/* Finish */}
      <button
        onClick={handleFinish}
        disabled={finishing}
        className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-50 text-white font-bold text-lg py-4 rounded-2xl transition-colors mt-4"
      >
        {finishing ? "Saving..." : "Finish Workout"}
      </button>
    </div>
  );
}

function ExerciseCard({
  programExercise,
  exercise,
  sets,
  prevSets,
  workoutId,
  onAddSet,
  onDeleteSet,
}: {
  programExercise: ProgramExercise | null;
  exercise?: Exercise;
  sets: WorkoutSet[];
  prevSets: PrevSet[];
  workoutId: string;
  onAddSet: (weight: number, reps: number, rpe: string, isWarmup: boolean) => void;
  onDeleteSet: (setId: string) => void;
}) {
  const ex = programExercise?.exercise ?? exercise!;
  const workingSets = sets.filter((s) => !s.isWarmup);
  const warmupSets = sets.filter((s) => s.isWarmup);

  // Progressive overload: if prev session hit all target sets at target reps, bump weight
  const targetRepsMin = programExercise ? (parseInt(programExercise.targetReps.split("-")[0]) || 0) : 0;
  const increment = programExercise?.isMain ? 5 : 2.5;
  const prevHitTarget =
    programExercise !== null &&
    prevSets.length >= programExercise.targetSets &&
    targetRepsMin > 0 &&
    prevSets.every((s) => s.reps >= targetRepsMin);
  const suggestedWeight = prevHitTarget && prevSets[0] ? prevSets[0].weight + increment : null;

  const lastWeight = sets.length > 0
    ? sets[sets.length - 1].weight
    : (suggestedWeight ?? prevSets[0]?.weight ?? 0);
  const lastReps = sets.length > 0 ? sets[sets.length - 1].reps : prevSets[0]?.reps ?? (parseInt(programExercise?.targetReps ?? "0") || 5);

  const [weight, setWeight] = useState(lastWeight.toString());
  const [reps, setReps] = useState(lastReps.toString());
  const [rpe, setRpe] = useState("");
  const [showPrev, setShowPrev] = useState(false);

  const target = programExercise
    ? `${programExercise.targetSets}×${programExercise.targetReps}${programExercise.targetRpe ? ` @ RPE ${programExercise.targetRpe}` : ""}`
    : null;

  return (
    <div className="bg-[#111] border border-[#222] rounded-xl p-4 space-y-3">
      <div>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-base">{ex.name}</h3>
            {target && <p className="text-xs text-gray-500 mt-0.5">{target}</p>}
          </div>
          {prevSets.length > 0 && (
            <button
              onClick={() => setShowPrev((v) => !v)}
              className="text-xs text-gray-600 hover:text-gray-400 ml-2 mt-0.5"
            >
              {showPrev ? "hide" : "prev"}
            </button>
          )}
        </div>

        {showPrev && prevSets.length > 0 && (
          <div className="mt-2 text-xs text-gray-500 space-y-0.5">
            <p className="text-gray-600 mb-1">Last session:</p>
            {prevSets.map((s, i) => (
              <p key={i}>
                {s.weight} lb × {s.reps}{s.rpe ? ` @ RPE ${s.rpe}` : ""}
              </p>
            ))}
          </div>
        )}

        {prevHitTarget && !sets.length && (
          <p className="text-xs text-green-400 mt-1">
            📈 Hit target last session — weight bumped +{increment} lb
          </p>
        )}
        {programExercise?.notes && (
          <p className="text-xs text-purple-300/80 mt-1">💡 {programExercise.notes}</p>
        )}
      </div>

      {/* Logged sets */}
      {(warmupSets.length > 0 || workingSets.length > 0) && (
        <div className="space-y-1">
          <div className="grid grid-cols-4 gap-2 text-xs text-gray-600 px-1">
            <span>Set</span><span>Weight</span><span>Reps</span><span>RPE</span>
          </div>
          {warmupSets.map((s, i) => (
            <SetRow key={s.id} set={s} index={i + 1} label="W" onDelete={() => onDeleteSet(s.id)} />
          ))}
          {workingSets.map((s, i) => (
            <SetRow key={s.id} set={s} index={i + 1} onDelete={() => onDeleteSet(s.id)} />
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex gap-2 items-center">
        <input
          type="number"
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="lb"
          className="w-20 bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2.5 text-center text-sm focus:border-purple-400 focus:outline-none"
        />
        <input
          type="number"
          inputMode="numeric"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          placeholder="reps"
          className="w-16 bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2.5 text-center text-sm focus:border-purple-400 focus:outline-none"
        />
        <input
          type="number"
          inputMode="decimal"
          value={rpe}
          onChange={(e) => setRpe(e.target.value)}
          placeholder="RPE"
          className="w-16 bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2.5 text-center text-sm focus:border-purple-400 focus:outline-none"
        />
        <button
          onClick={() => {
            const w = parseFloat(weight) || 0;
            const r = parseInt(reps) || 0;
            if (r > 0) {
              onAddSet(w, r, rpe, false);
              setWeight(weight); // keep weight
            }
          }}
          className="flex-1 bg-purple-400 hover:bg-purple-500 active:bg-purple-600 text-white font-bold py-2.5 rounded-lg transition-colors text-sm"
        >
          ✓
        </button>
      </div>

      {/* Warmup button */}
      <button
        onClick={() => {
          const w = parseFloat(weight) || 0;
          const r = parseInt(reps) || 0;
          if (r > 0) onAddSet(w, r, rpe, true);
        }}
        className="w-full text-xs text-gray-600 hover:text-gray-400 py-1"
      >
        + Add Warmup Set
      </button>
    </div>
  );
}

function SetRow({
  set,
  index,
  label,
  onDelete,
}: {
  set: WorkoutSet;
  index: number;
  label?: string;
  onDelete: () => void;
}) {
  return (
    <div
      className={`grid grid-cols-4 gap-2 text-sm px-1 py-1 rounded items-center group ${
        set.isWarmup ? "text-gray-600" : "text-gray-200"
      }`}
    >
      <span>{label ?? index}</span>
      <span>{set.weight}</span>
      <span>{set.reps}</span>
      <div className="flex items-center justify-between">
        <span>{set.rpe ?? "—"}</span>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 text-red-500 text-xs px-1"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
