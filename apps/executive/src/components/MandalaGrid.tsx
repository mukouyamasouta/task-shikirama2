import type { MandalaCell } from "@/lib/types";
import { rateColor, colorClass } from "@/lib/colors";

export function MandalaGrid({ cells }: { cells: MandalaCell[] }) {
  // position 0..8 で 3x3 (4 = 中央 KGI)
  const ordered = [...cells].sort((a, b) => a.position - b.position);
  return (
    <div className="grid grid-cols-3 gap-2">
      {ordered.map((cell) => {
        const c = colorClass[rateColor(cell.rate)];
        const isKgi = cell.isKgi;
        return (
          <div
            key={cell.position}
            className={[
              "aspect-square rounded-lg border-2 p-2 flex flex-col items-center justify-center text-center transition-colors",
              isKgi
                ? "bg-accent3 border-accent"
                : `bg-bg2 ${c.border} hover:bg-surface`,
            ].join(" ")}
          >
            <span className="text-[11px] font-bold text-text leading-tight">
              {cell.title}
            </span>
            <span className={`mt-1 text-[10px] font-mono px-1.5 py-px rounded ${c.text} ${c.bg}`}>
              {cell.rate}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
