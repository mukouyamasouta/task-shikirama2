// デモ用ロール切替バー — モック画面の上部に常時表示するアクセシビリティ要素
// 本番では各ロール用アプリのURLにリンクする想定
const roles = [
  { key: "LOGIN",       label: "ログイン",   accent: "text-text2"  },
  { key: "EXECUTIVE",   label: "役員",       accent: "text-pink",        bg: "bg-pink2",       border: "border-pink" },
  { key: "FULL_VIEWER", label: "全閲覧者",   accent: "text-cyan"   },
  { key: "ADMIN",       label: "管理者",     accent: "text-amber"  },
  { key: "MANAGER",     label: "上長",       accent: "text-[#9B6EF6]" },
  { key: "EMPLOYEE",    label: "従業員",     accent: "text-green"  },
] as const;

export function RoleSwitcher({ active = "EXECUTIVE" }: { active?: string }) {
  return (
    <div className="sticky top-0 z-[100] bg-bg2 border-b border-border2 px-3 py-2 flex gap-1 overflow-x-auto">
      {roles.map((r) => {
        const isActive = r.key === active;
        if (isActive && "bg" in r) {
          return (
            <button
              key={r.key}
              className={[
                "flex-shrink-0 px-2.5 py-1 rounded-md text-[11px] font-mono tracking-wider border transition-colors",
                r.accent, r.bg, r.border,
              ].join(" ")}
            >
              {r.label}
            </button>
          );
        }
        return (
          <button
            key={r.key}
            className="flex-shrink-0 px-2.5 py-1 rounded-md text-[11px] font-mono tracking-wider border border-border1 text-text3 hover:text-text hover:border-border2 transition-colors"
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
