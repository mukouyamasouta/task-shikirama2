export function AppHeader({ userName = "田中 誠一" }: { userName?: string }) {
  return (
    <header className="bg-bg2 border-b border-border2 px-4 py-3.5 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[14px] font-bold tracking-wider">SHIKIRAMA</span>
        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded tracking-widest text-pink bg-pink2 border border-pink">
          / EXECUTIVE
        </span>
      </div>
      <span className="inline-flex items-center gap-1.5 text-[11px] text-text2 font-mono px-2.5 py-1 border border-border2 rounded-md">
        <span className="w-1.5 h-1.5 rounded-full bg-accent2" />
        {userName}
      </span>
    </header>
  );
}
