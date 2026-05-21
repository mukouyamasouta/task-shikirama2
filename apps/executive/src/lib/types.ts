// 役員画面のデータ型 — Prisma に対応する DTO
export type RateColor = "green" | "amber" | "coral";

export interface CompanyOverall {
  rate: number;          // 0-100
  kgiTotal: number;
  kgiAchieved: number;
  kgiInProgress: number;
}

export interface TeamSummary {
  id: string;
  name: string;
  rate: number;
  members: number;
  leaderName: string;
}

export interface SpotlightTask {
  id: string;
  title: string;
  assigneeName: string;
  flag: "overdue" | "high_priority";
}

export interface MandalaCell {
  position: number;       // 0..7, 4 = center (KGI)
  title: string;
  rate: number;
  isKgi?: boolean;
}

export interface ProgressPoint { month: string; rate: number; }

export interface EvaluationHistoryItem {
  id: string;
  periodLabel: string;
  status: "completed" | "pending";
  adminStars?: number;
  managerStars?: number;
  executiveName?: string;
}

export interface EmployeeOption {
  id: string;
  name: string;
  teamName: string;
}

export interface EvaluationRecord {
  id: string;
  subjectName: string;
  status: "completed" | "pending_executive";
  selfStars?: number;
  managerStars?: number;
  adminStars?: number;
  executiveStars?: number;
}
