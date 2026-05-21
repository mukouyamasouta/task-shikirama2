import type { RateColor } from "./types";

export function rateColor(rate: number): RateColor {
  if (rate >= 70) return "green";
  if (rate >= 50) return "amber";
  return "coral";
}

export const colorClass = {
  green: { border: "border-green",  text: "text-green",  bg: "bg-green2"  },
  amber: { border: "border-amber",  text: "text-amber",  bg: "bg-amber2"  },
  coral: { border: "border-coral",  text: "text-coral",  bg: "bg-coral2"  },
} as const;
