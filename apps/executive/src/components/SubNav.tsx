"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/",        label: "全社ダッシュボード" },
  { href: "/employees", label: "社員別ビュー" },
  { href: "/evaluations", label: "評価記録" },
];

export function SubNav() {
  const path = usePathname();
  return (
    <nav className="flex gap-0.5 px-3 bg-bg2 border-b border-border2 overflow-x-auto">
      {items.map((it) => {
        const active = path === it.href || (it.href !== "/" && path.startsWith(it.href));
        return (
          <Link
            key={it.href}
            href={it.href}
            className={[
              "flex-shrink-0 px-3.5 py-3 text-[12px] font-semibold border-b-2 transition-colors",
              active ? "text-text border-accent" : "text-text3 border-transparent",
            ].join(" ")}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
