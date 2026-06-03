"use client";

import { useState, useEffect, useRef } from "react";
import {
  scheduleRestNotification,
  cancelRestNotification,
} from "@/lib/restNotification";

export default function RestTimer({
  seconds,
  onDismiss,
}: {
  seconds: number;
  onDismiss: () => void;
}) {
  // Wall-clock end time — accurate even when tab is backgrounded
  const endTimeRef = useRef(Date.now() + seconds * 1000);
  const [remaining, setRemaining] = useState(seconds);
  const [done, setDone] = useState(false);
  const firedRef = useRef(false);
  // True once the OS-scheduled notification is armed — when so, we skip the
  // in-page Notification on completion so the user isn't notified twice.
  const scheduledRef = useRef(false);

  // Request permission, then arm an OS-scheduled notification that fires at the
  // rest end time even if the app is backgrounded or closed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if ("Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
      if (cancelled) return;
      scheduledRef.current = await scheduleRestNotification(endTimeRef.current);
    })();
    return () => {
      cancelled = true;
      cancelRestNotification();
    };
  }, []);

  // Poll wall clock every 500ms — stays accurate in background
  useEffect(() => {
    const t = setInterval(() => {
      const rem = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
      setRemaining(rem);
      if (rem <= 0 && !firedRef.current) {
        firedRef.current = true;
        setDone(true);
        playBeep();
        // The OS-scheduled notification already covers the closed-app case;
        // only fall back to an in-page notification when it isn't armed.
        if (!scheduledRef.current) fireNotification();
      }
    }, 500);
    return () => clearInterval(t);
  }, []);

  // Auto-dismiss 4 seconds after "Go!"
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [done, onDismiss]);

  function adjust(delta: number) {
    endTimeRef.current = Math.max(Date.now() + 5000, endTimeRef.current + delta * 1000);
    setRemaining(Math.max(5, Math.ceil((endTimeRef.current - Date.now()) / 1000)));
    // Re-arm the scheduled notification at the new end time.
    if (!firedRef.current) {
      scheduleRestNotification(endTimeRef.current).then((ok) => {
        scheduledRef.current = ok;
      });
    }
  }

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
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

  function fireNotification() {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Rest complete — Go!", {
        body: "Time for your next set",
        icon: "/logo.png",
      });
    }
  }

  const pct = Math.min(100, (remaining / seconds) * 100);

  return (
    <div
      className={`relative rounded-xl p-4 flex items-center justify-between overflow-hidden border ${
        done ? "border-green-600 bg-green-900/20" : "border-[#333] bg-[#111]"
      }`}
    >
      {!done && (
        <div
          className="absolute inset-0 bg-purple-400/10 transition-all duration-500"
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
      {!done && (
        <div className="relative flex items-center gap-2">
          <button
            onClick={() => adjust(-30)}
            className="text-xs text-gray-400 bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 hover:bg-[#222] active:bg-[#2a2a2a]"
          >
            −30
          </button>
          <button
            onClick={() => adjust(30)}
            className="text-xs text-gray-400 bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 hover:bg-[#222] active:bg-[#2a2a2a]"
          >
            +30
          </button>
        </div>
      )}
      <button onClick={onDismiss} className="relative text-gray-500 hover:text-gray-300 text-2xl px-2">
        ✕
      </button>
    </div>
  );
}
