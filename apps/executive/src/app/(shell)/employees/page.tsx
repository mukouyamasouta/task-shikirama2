// [E-2] 社員別ビュー
"use client";
import { useState } from "react";
import { employees, mandalaCells, progressTrend, evaluationHistory } from "@/lib/mock";
import { MandalaGrid } from "@/components/MandalaGrid";
import { ProgressChart } from "@/components/ProgressChart";
import { ExecCommentModal } from "@/components/ExecCommentModal";
import { StarRating } from "@/components/StarRating";

export default function EmployeesPage() {
  const [employeeId, setEmployeeId] = useState(employees[0].id);
  const [openComment, setOpenComment] = useState(false);
  const employee = employees.find((e) => e.id === employeeId)!;
  const cells = mandalaCells[employeeId] ?? [];

  return (
    <>
      <p className="page-title">Executive 02 / Employee View</p>
      <h1 className="page-heading">社員別ビュー</h1>
      <p className="page-sub">個別の曼荼羅・進捗・評価履歴を確認できます。</p>

      <div className="card">
        <label className="label">社員を選択</label>
        <select
          className="select mb-3.5"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
        >
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name} — {e.teamName}</option>
          ))}
        </select>

        <p className="section-title">▸ 曼荼羅チャート（達成率カラー表示）</p>
        <MandalaGrid cells={cells} />
      </div>

      <div className="card">
        <p className="section-title">▸ KGI/KPI 進捗推移（過去6ヶ月）</p>
        <ProgressChart data={progressTrend} />
      </div>

      <div className="card">
        <p className="section-title">▸ 評価面談履歴</p>
        <div className="flex flex-col gap-2">
          {evaluationHistory.map((h) => (
            <div key={h.id} className="p-2.5 bg-bg3 rounded-lg text-[12px]">
              <div className="flex justify-between items-center">
                <strong>{h.periodLabel}</strong>
                <span className={h.status === "completed" ? "pill pill-green" : "pill pill-amber"}>
                  {h.status === "completed" ? "完了" : "進行中"}
                </span>
              </div>
              <p className="text-text3 font-mono text-[10px] mt-1">
                {h.adminStars != null && (<>管理者 <StarRating value={h.adminStars} /> ／ </>)}
                {h.managerStars != null && (<>上長 <StarRating value={h.managerStars} /></>)}
                {h.executiveName && <> ／ 役員: {h.executiveName}</>}
              </p>
            </div>
          ))}
        </div>
        <button className="btn btn-full mt-3" onClick={() => setOpenComment(true)}>
          ＋ 役員コメントを追加
        </button>
      </div>

      <ExecCommentModal
        open={openComment}
        onClose={() => setOpenComment(false)}
        subjectName={employee.name}
        periodLabel="2026年 上半期"
      />
    </>
  );
}
