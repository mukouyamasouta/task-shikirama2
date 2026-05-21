import type { ProgressPoint } from "@/lib/types";

export function ProgressChart({ data }: { data: ProgressPoint[] }) {
  const W = 320, H = 180, padX = 20, padR = 20, top = 10, bottom = 30;
  const innerW = W - padX - padR;
  const innerH = H - top - bottom;
  const step = innerW / Math.max(1, data.length - 1);
  // y: 0% -> bottom (H-bottom), 100% -> top
  const yFor = (rate: number) => top + innerH - (rate / 100) * innerH;

  const points = data
    .map((p, i) => `${padX + i * step},${yFor(p.rate).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full h-[180px] bg-bg3 rounded-lg p-2.5"
    >
      {[20, 60, 100, 140].map((y) => (
        <line key={y} x1="20" y1={y} x2={W - padR} y2={y} stroke="#2A2740" strokeDasharray="3,3" />
      ))}
      <line x1="20" y1={yFor(100)} x2={W - padR} y2={yFor(100)} stroke="#F5A623" strokeDasharray="5,5" opacity="0.5" />
      <text x={W - 30} y={yFor(100) - 4} fontSize="9" fill="#F5A623" fontFamily="DM Mono">100%</text>

      <polyline points={points} fill="none" stroke="#7B6EF6" strokeWidth="2" />
      {data.map((p, i) => (
        <circle
          key={p.month}
          cx={padX + i * step}
          cy={yFor(p.rate)}
          r="4"
          fill={i === data.length - 1 ? "#A99BFF" : "#7B6EF6"}
        />
      ))}
      {data.map((p, i) => (
        <text
          key={p.month}
          x={padX + i * step}
          y={H - 10}
          fontSize="9"
          fill="#6B6880"
          fontFamily="DM Mono"
          textAnchor="middle"
        >
          {p.month}
        </text>
      ))}
    </svg>
  );
}
