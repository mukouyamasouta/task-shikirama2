// [E-1] 全社ダッシュボード
"use client";
import { useState } from "react";
import { companyOverall, teams, spotlightTasks } from "@/lib/mock";
import { rateColor, colorClass } from "@/lib/colors";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import type { SpotlightTask } from "@/lib/types";

export default function DashboardPage() {
  const [openTask, setOpenTask] = useState<SpotlightTask | null>(null);

  return (
    <>
      <p className="page-title">Executive 01 / Company Dashboard</p>
      <h1 className="page-heading">全社ダッシュボード</h1>
      <p className="page-sub">全部門のKGI達成率と注目タスクを俯瞰します。</p>

      {/* 全社サマリー */}
      <div className="card" style={{ background: "linear-gradient(135deg, rgba(232,121,160,0.15), rgba(123,110,246,0.15))" }}>
        <p className="text-[10px] text-accent2 font-mono tracking-widest">◇ COMPANY OVERALL</p>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-3xl font-black text-green font-mono">{companyOverall.rate}%</span>
          <span className="text-[12px] text-text2">/ 100%</span>
        </div>
        <p className="text-[11px] text-text2 mt-1">
          KGI {companyOverall.kgiTotal}件 ／ 達成 {companyOverall.kgiAchieved}件 ／ 進行中 {companyOverall.kgiInProgress}件
        </p>
      </div>

      {/* チーム別 */}
      <div className="grid grid-cols-2 gap-2.5">
        {teams.map((t) => {
          const c = colorClass[rateColor(t.rate)];
          return (
            <div key={t.id} className="card !mb-0">
              <p className="text-[10px] text-text3 font-mono">{t.name}</p>
              <p className={`text-[22px] font-black font-mono ${c.text}`}>{t.rate}%</p>
              <div className="h-[5px] bg-bg3 rounded-[3px] overflow-hidden">
                <div className={`h-full ${c.text.replace("text-", "bg-")}`} style={{ width: `${t.rate}%` }} />
              </div>
              <p className="text-[10px] text-text3 mt-1">{t.members}名 ／ 上長: {t.leaderName}</p>
            </div>
          );
        })}
      </div>

      {/* 注目タスク */}
      <div className="card mt-3">
        <p className="section-title">▸ 今月の注目タスク</p>
        <div className="flex flex-col gap-1.5">
          {spotlightTasks.map((task) => {
            const isOverdue = task.flag === "overdue";
            return (
              <button
                key={task.id}
                onClick={() => setOpenTask(task)}
                className={[
                  "px-2.5 py-2 rounded-md flex justify-between items-center text-[12px] text-left transition-colors",
                  isOverdue ? "bg-coral2 hover:bg-coral2/80" : "bg-amber2 hover:bg-amber2/80",
                ].join(" ")}
              >
                <span>{task.title}（{task.assigneeName}）</span>
                <span className={isOverdue ? "pill pill-coral" : "pill pill-amber"}>
                  {isOverdue ? "期限切れ" : "高優先度"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <TaskDetailModal open={!!openTask} onClose={() => setOpenTask(null)} task={openTask} />
    </>
  );
}
