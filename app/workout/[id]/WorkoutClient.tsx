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
  supersetGroup: string | null;
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
  allExercises,
}: {
  workout: Workout;
  prevPerformance: Record<string, PrevSet[]>;
  settings: Settings;
  allExercises: Exercise[];
}) {
  const [sets, setSets] = useState<WorkoutSet[]>(workout.sets);
  const [restTimer, setRestTimer] = useState<{ seconds: number; active: boolean } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showPlateCalc, setShowPlateCalc] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [manualExercises, setManualExercises] = useState<Exercise[]>([]);
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

  const handleSelectExercise = (ex: Exercise) => {
    // Don't add if already in program or already manually added
    const inProgram = (workout.programDay?.exercises ?? []).some((pe) => pe.exerciseId === ex.id);
    const alreadyAdded = manualExercises.some((e) => e.id === ex.id);
    if (!inProgram && !alreadyAdded) {
      setManualExercises((prev) => [...prev, ex]);
    }
    setShowAddExercise(false);
    setExerciseSearch("");
  };

  // Build exercise list: from program or from sets logged so far
  const programExercises = workout.programDay?.exercises ?? [];
  const extraExercises = sets
    .filter((s) => !programExercises.some((pe) => pe.exerciseId === s.exerciseId))
    .reduce<WorkoutSet["exercise"][]>((acc, s) => {
      if (!acc.find((e) => e.id === s.exerciseId)) acc.push(s.exercise);
      return acc;
    }, []);

  // Merge manual exercises with any extra exercises already in sets
  const allManualExercises = [
    ...manualExercises,
    ...extraExercises.filter((e) => !manualExercises.some((m) => m.id === e.id)),
  ];

  const filteredExercises = allExercises.filter((e) =>
    e.name.toLowerCase().includes(exerciseSearch.toLowerCase())
  );

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

      {/* Program exercises — render superset groups together, standalone exercises on their own */}
      {(() => {
        const rendered: React.ReactNode[] = [];
        const seen = new Set<string>();

        for (const pe of programExercises) {
          if (seen.has(pe.id)) continue;
          seen.add(pe.id);

          if (pe.supersetGroup) {
            // Collect all exercises sharing this superset group (in order)
            const group = programExercises.filter(
              (x) => x.supersetGroup === pe.supersetGroup
            );
            // Mark them all as seen
            group.forEach((x) => seen.add(x.id));

            rendered.push(
              <div
                key={`superset-${pe.supersetGroup}`}
                className="border-l-2 border-purple-400 pl-3 space-y-3"
              >
                <p className="text-xs font-semibold text-purple-400 uppercase tracking-wide">
                  Superset {pe.supersetGroup}
                </p>
                {group.map((gpe) => (
                  <ExerciseCard
                    key={gpe.id}
                    programExercise={gpe}
                    sets={sets.filter((s) => s.exerciseId === gpe.exerciseId)}
                    prevSets={prevPerformance[gpe.exerciseId] ?? []}
                    workoutId={workout.id}
                    onAddSet={(w, r, rpe, wu) =>
                      handleAddSet(gpe.exerciseId, w, r, rpe, wu, gpe.restSeconds)
                    }
                    onDeleteSet={handleDeleteSet}
                  />
                ))}
              </div>
            );
          } else {
            rendered.push(
              <ExerciseCard
                key={pe.id}
                programExercise={pe}
                sets={sets.filter((s) => s.exerciseId === pe.exerciseId)}
                prevSets={prevPerformance[pe.exerciseId] ?? []}
                workoutId={workout.id}
                onAddSet={(w, r, rpe, wu) =>
                  handleAddSet(pe.exerciseId, w, r, rpe, wu, pe.restSeconds)
                }
                onDeleteSet={handleDeleteSet}
              />
            );
          }
        }

        return rendered;
      })()}

      {/* Manual / extra exercises */}
      {allManualExercises.map((ex) => {
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

      {/* Add Exercise button */}
      <button
        onClick={() => setShowAddExercise(true)}
        className="w-full border border-[#333] text-gray-400 hover:border-[#555] hover:text-gray-300 font-medium py-3 rounded-xl transition-colors text-sm"
      >
        ＋ Add Exercise
      </button>

      {/* Finish */}
      <button
        onClick={handleFinish}
        disabled={finishing}
        className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-50 text-white font-bold text-lg py-4 rounded-2xl transition-colors mt-4"
      >
        {finishing ? "Saving..." : "Finish Workout"}
      </button>

      {/* Add Exercise Modal */}
      {showAddExercise && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70"
          onClick={() => { setShowAddExercise(false); setExerciseSearch(""); }}
        >
          <div
            className="bg-[#111] border border-[#222] rounded-t-2xl w-full max-w-lg p-4 space-y-3 max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base">Add Exercise</h2>
              <button
                onClick={() => { setShowAddExercise(false); setExerciseSearch(""); }}
                className="text-gray-500 hover:text-gray-300 text-sm"
              >
                ✕
              </button>
            </div>
            <input
              type="text"
              autoFocus
              value={exerciseSearch}
              onChange={(e) => setExerciseSearch(e.target.value)}
              placeholder="Search exercises…"
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2.5 text-sm focus:border-purple-400 focus:outline-none"
            />
            <div className="overflow-y-auto flex-1 space-y-1">
              {filteredExercises.length === 0 && (
                <p className="text-sm text-gray-600 text-center py-4">No exercises found</p>
              )}
              {filteredExercises.map((ex) => {
                const inProgram = programExercises.some((pe) => pe.exerciseId === ex.id);
                const alreadyAdded = manualExercises.some((m) => m.id === ex.id);
                const disabled = inProgram || alreadyAdded;
                return (
                  <button
                    key={ex.id}
                    disabled={disabled}
                    onClick={() => handleSelectExercise(ex)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm ${
                      disabled
                        ? "text-gray-600 cursor-not-allowed"
                        : "hover:bg-[#1a1a1a] text-gray-200"
                    }`}
                  >
                    <span className="font-medium">{ex.name}</span>
                    <span className="text-gray-600 ml-2 text-xs">{ex.bodyPart}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
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

  // RPE-aware progressive overload
  const targetRpeMax = programExercise?.targetRpe
    ? parseFloat(programExercise.targetRpe.split("-").pop() ?? "0")
    : null;

  const prevRpeSets = prevSets.filter((s) => s.rpe !== null);
  const prevAvgRpe =
    prevRpeSets.length > 0
      ? prevRpeSets.reduce((sum, s) => sum + (s.rpe as number), 0) / prevRpeSets.length
      : null;

  // Determine overload action
  let suggestedWeight: number | null = null;
  let overloadMessage: { text: string; color: string } | null = null;

  if (prevHitTarget && prevSets[0]) {
    if (targetRpeMax !== null && prevAvgRpe !== null) {
      if (prevAvgRpe > targetRpeMax + 0.5) {
        // Too hard — don't bump
        suggestedWeight = null;
        overloadMessage = { text: "💪 Hit reps but RPE was high — hold weight", color: "text-yellow-400" };
      } else if (prevAvgRpe < targetRpeMax - 1) {
        // Felt very easy — double bump
        suggestedWeight = prevSets[0].weight + increment * 2;
        overloadMessage = { text: `📈 Felt easy — bumped +${increment * 2} lb`, color: "text-green-400" };
      } else {
        // Normal bump
        suggestedWeight = prevSets[0].weight + increment;
        overloadMessage = { text: `📈 Hit target last session — weight bumped +${increment} lb`, color: "text-green-400" };
      }
    } else {
      // No RPE data — normal bump
      suggestedWeight = prevSets[0].weight + increment;
      overloadMessage = { text: `📈 Hit target last session — weight bumped +${increment} lb`, color: "text-green-400" };
    }
  }

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

        {overloadMessage && !sets.length && (
          <p className={`text-xs mt-1 ${overloadMessage.color}`}>
            {overloadMessage.text}
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
