// [E-3] 評価記録一覧
"use client";
import { useState } from "react";
import { evaluationRecords } from "@/lib/mock";
import { StarRating } from "@/components/StarRating";

const PERIODS = ["2026年 上半期", "2025年 下半期"];

export default function EvaluationsPage() {
  const [period, setPeriod] = useState(PERIODS[0]);

  return (
    <>
      <p className="page-title">Executive 03 / Evaluation Records</p>
      <h1 className="page-heading">評価面談記録</h1>
      <p className="page-sub">期間ごとに全社員の評価まとめを閲覧できます。</p>

      <div className="card">
        <select className="select mb-3.5" value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <div className="flex flex-col gap-2.5">
          {evaluationRecords.map((rec) => {
            const completed = rec.status === "completed";
            return (
              <div key={rec.id} className="p-3 bg-bg3 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <strong>{rec.subjectName}</strong>
                  <span className={completed ? "pill pill-green" : "pill pill-amber"}>
                    {completed ? "全評価完了" : "役員評価待ち"}
                  </span>
                </div>
                <div className="flex gap-1 overflow-x-auto">
                  {rec.selfStars != null && (
                    <button className="btn btn-outline !px-2.5 !py-1 !text-[10px]">
                      自己 <StarRating value={rec.selfStars} />
                    </button>
                  )}
                  {rec.managerStars != null && (
                    <button className="btn btn-outline !px-2.5 !py-1 !text-[10px]">
                      上長 <StarRating value={rec.managerStars} />
                    </button>
                  )}
                  {rec.adminStars != null && (
                    <button className="btn btn-outline !px-2.5 !py-1 !text-[10px]">
                      管理 <StarRating value={rec.adminStars} />
                    </button>
                  )}
                  {rec.executiveStars != null && (
                    <button className="btn btn-outline !px-2.5 !py-1 !text-[10px]">
                      役員 <StarRating value={rec.executiveStars} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
