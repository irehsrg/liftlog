"use client";

import { useState } from "react";

export default function PlateCalculator({
  barWeight,
  platesStr,
}: {
  barWeight: number;
  platesStr: string;
}) {
  const [target, setTarget] = useState("");
  const availablePlates = platesStr
    .split(",")
    .map(parseFloat)
    .filter(Boolean)
    .sort((a, b) => b - a);

  function calcPlates(targetWeight: number, bar: number): { plate: number; count: number }[] {
    let remaining = (targetWeight - bar) / 2;
    if (remaining < 0) return [];
    const result: { plate: number; count: number }[] = [];
    for (const plate of availablePlates) {
      const count = Math.floor(remaining / plate);
      if (count > 0) {
        result.push({ plate, count });
        remaining -= count * plate;
        remaining = Math.round(remaining * 100) / 100;
      }
    }
    return result;
  }

  const targetNum = parseFloat(target);
  const plates = !isNaN(targetNum) && targetNum > barWeight ? calcPlates(targetNum, barWeight) : [];
  const achievable = barWeight + plates.reduce((sum, p) => sum + p.plate * p.count * 2, 0);

  return (
    <div className="bg-[#111] border border-[#222] rounded-xl p-4 space-y-3">
      <p className="text-xs text-gray-500 uppercase tracking-wider">Plate Calculator</p>
      <div className="flex gap-2 items-center">
        <input
          type="number"
          inputMode="decimal"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={`Target lb (bar = ${barWeight})`}
          className="flex-1 bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2.5 text-sm focus:border-purple-400 focus:outline-none"
        />
      </div>
      {plates.length > 0 && (
        <div>
          <p className="text-xs text-gray-600 mb-2">Per side ({achievable} lb total):</p>
          <div className="flex flex-wrap gap-2">
            {plates.map(({ plate, count }) => (
              <span
                key={plate}
                className="bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-1.5 text-sm font-semibold"
              >
                {count}×{plate}
              </span>
            ))}
          </div>
        </div>
      )}
      {target && (isNaN(targetNum) || targetNum <= barWeight) && (
        <p className="text-xs text-gray-600">Enter a weight above {barWeight} lb</p>
      )}
    </div>
  );
}
