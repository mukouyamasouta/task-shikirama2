// モックデータ — Prisma 接続前の暫定。後で `@shikirama/db` のクエリに置換。
import type {
  CompanyOverall, TeamSummary, SpotlightTask, MandalaCell,
  ProgressPoint, EvaluationHistoryItem, EmployeeOption, EvaluationRecord,
} from "./types";

export const companyOverall: CompanyOverall = {
  rate: 78, kgiTotal: 5, kgiAchieved: 1, kgiInProgress: 4,
};

export const teams: TeamSummary[] = [
  { id: "t1", name: "第1チーム", rate: 82, members: 4, leaderName: "北中" },
  { id: "t2", name: "第2チーム", rate: 65, members: 3, leaderName: "山田" },
];

export const spotlightTasks: SpotlightTask[] = [
  { id: "tk1", title: "予約LPのCTA改修", assigneeName: "近藤", flag: "overdue" },
  { id: "tk2", title: "Instagramリール×5本", assigneeName: "スタッフA", flag: "high_priority" },
];

export const employees: EmployeeOption[] = [
  { id: "e1", name: "近藤 真実", teamName: "第1チーム" },
  { id: "e2", name: "スタッフA", teamName: "第1チーム" },
  { id: "e3", name: "鈴木 花子", teamName: "第2チーム" },
];

export const mandalaCells: Record<string, MandalaCell[]> = {
  e1: [
    { position: 0, title: "集客強化", rate: 85 },
    { position: 1, title: "顧客対応", rate: 60 },
    { position: 2, title: "SNS運用", rate: 75 },
    { position: 3, title: "業務効率", rate: 28 },
    { position: 4, title: "売上120%", rate: 78, isKgi: true },
    { position: 5, title: "連携",     rate: 55 },
    { position: 6, title: "スキルUP", rate: 90 },
    { position: 7, title: "数値管理", rate: 62 },
    { position: 8, title: "新規開拓", rate: 35 },
  ],
  e2: [
    { position: 0, title: "集客強化", rate: 70 },
    { position: 1, title: "顧客対応", rate: 80 },
    { position: 2, title: "SNS運用", rate: 95 },
    { position: 3, title: "業務効率", rate: 55 },
    { position: 4, title: "売上110%", rate: 65, isKgi: true },
    { position: 5, title: "連携",     rate: 60 },
    { position: 6, title: "スキルUP", rate: 75 },
    { position: 7, title: "数値管理", rate: 45 },
    { position: 8, title: "新規開拓", rate: 50 },
  ],
  e3: [
    { position: 0, title: "顧客満足", rate: 88 },
    { position: 1, title: "リピート", rate: 72 },
    { position: 2, title: "口コミ",   rate: 65 },
    { position: 3, title: "オペ改善", rate: 40 },
    { position: 4, title: "客単価UP", rate: 82, isKgi: true },
    { position: 5, title: "アップセル", rate: 58 },
    { position: 6, title: "教育",     rate: 90 },
    { position: 7, title: "在庫管理", rate: 50 },
    { position: 8, title: "店販強化", rate: 30 },
  ],
};

export const progressTrend: ProgressPoint[] = [
  { month: "12月", rate: 30 },
  { month: "1月",  rate: 45 },
  { month: "2月",  rate: 58 },
  { month: "3月",  rate: 65 },
  { month: "4月",  rate: 72 },
  { month: "5月",  rate: 78 },
];

export const evaluationHistory: EvaluationHistoryItem[] = [
  { id: "h1", periodLabel: "2025年下半期", status: "completed", adminStars: 4, managerStars: 4, executiveName: "田中" },
  { id: "h2", periodLabel: "2025年上半期", status: "completed", adminStars: 3, managerStars: 4 },
];

export const evaluationRecords: EvaluationRecord[] = [
  { id: "r1", subjectName: "近藤 真実", status: "completed",
    selfStars: 4, managerStars: 3, adminStars: 4, executiveStars: 4 },
  { id: "r2", subjectName: "スタッフA", status: "pending_executive",
    selfStars: 5, managerStars: 4, adminStars: 4 },
];
