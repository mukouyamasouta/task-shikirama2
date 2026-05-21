export default function Page() {
  return (
    <main className="p-6">
      <header className="bg-bg2 border-b border-border2 px-4 py-3.5 flex items-center justify-between -mx-6 mb-6">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[14px] font-bold tracking-wider">SHIKIRAMA</span>
          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded tracking-widest text-[#9B6EF6] bg-[rgba(155,110,246,0.15)] border border-[#9B6EF6]">
            / MANAGER（上長）
          </span>
        </div>
      </header>
      <h1 className="text-2xl font-black mb-2">上長画面</h1>
      <p className="text-text2">この画面は今後実装予定です。役員画面の実装パターン (apps/executive) を参考に構築します。</p>
    </main>
  );
}
