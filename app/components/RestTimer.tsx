"use client";

import { useState, useEffect, useRef } from "react";

export default function RestTimer({
  seconds,
  onDismiss,
}: {
  seconds: number;
  onDismiss: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const [done, setDone] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    setRemaining(seconds);
    setDone(false);
  }, [seconds]);

  useEffect(() => {
    if (remaining <= 0) {
      setDone(true);
      playBeep();
      return;
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining]);

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      audioCtxRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } catch {}
  }

  const pct = (remaining / seconds) * 100;

  return (
    <div
      className={`relative rounded-xl p-4 flex items-center justify-between overflow-hidden border ${
        done
          ? "border-green-600 bg-green-900/20"
          : "border-[#333] bg-[#111]"
      }`}
    >
      {/* Progress bar */}
      {!done && (
        <div
          className="absolute inset-0 bg-purple-400/10 transition-all duration-1000"
          style={{ width: `${pct}%` }}
        />
      )}
      <div className="relative">
        <p className="text-xs text-gray-500 uppercase tracking-wider">
          {done ? "Rest done!" : "Rest"}
        </p>
        <p className={`text-2xl font-mono font-bold ${done ? "text-green-400" : "text-white"}`}>
          {done ? "Go!" : `${Math.floor(remaining / 60)}:${(remaining % 60).toString().padStart(2, "0")}`}
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="relative text-gray-500 hover:text-gray-300 text-2xl px-2"
      >
        ✕
      </button>
    </div>
  );
}
