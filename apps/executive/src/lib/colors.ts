import type { RateColor } from "./types";

export function rateColor(rate: number): RateColor {
  if (rate >= 70) return "green";
  if (rate >= 50) return "amber";
  return "coral";
}

// Tailwind JIT が静的解析できるよう、完全な文字列で記述
export const colorClass = {
  green: { border: "border-green", text: "text-green", bg: "bg-green2", barBg: "bg-green" },
  amber: { border: "border-amber", text: "text-amber", bg: "bg-amber2", barBg: "bg-amber" },
  coral: { border: "border-coral", text: "text-coral", bg: "bg-coral2", barBg: "bg-coral" },
} as const;
