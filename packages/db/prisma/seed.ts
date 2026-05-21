import { PrismaClient, Role, TaskStatus, TaskPriority, EvaluationPeriodHalf, EvaluationStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 既存データ削除
  await prisma.evaluationScore.deleteMany();
  await prisma.evaluation.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.progressLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.kpi.deleteMany();
  await prisma.subGoal.deleteMany();
  await prisma.kgi.deleteMany();
  await prisma.mandalaChart.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();

  const executive = await prisma.user.create({
    data: { name: "田中 誠一", email: "tanaka@shikirama.example", role: Role.EXECUTIVE },
  });

  const kitanaka = await prisma.user.create({
    data: { name: "北中", email: "kitanaka@shikirama.example", role: Role.MANAGER },
  });
  const yamada = await prisma.user.create({
    data: { name: "山田", email: "yamada@shikirama.example", role: Role.MANAGER },
  });

  const team1 = await prisma.team.create({
    data: { name: "第1チーム", leaderId: kitanaka.id },
  });
  const team2 = await prisma.team.create({
    data: { name: "第2チーム", leaderId: yamada.id },
  });

  const kondo = await prisma.user.create({
    data: { name: "近藤 真実", email: "kondo@shikirama.example", role: Role.EMPLOYEE, teamId: team1.id },
  });
  const staffA = await prisma.user.create({
    data: { name: "スタッフA", email: "staffa@shikirama.example", role: Role.EMPLOYEE, teamId: team1.id },
  });
  const suzuki = await prisma.user.create({
    data: { name: "鈴木 花子", email: "suzuki@shikirama.example", role: Role.EMPLOYEE, teamId: team2.id },
  });

  // 曼荼羅 (近藤)
  const chart = await prisma.mandalaChart.create({
    data: {
      userId: kondo.id,
      title: "今期売上120%達成",
      periodYear: 2026,
      periodHalf: EvaluationPeriodHalf.FIRST,
      kgi: { create: { title: "売上120%", targetValue: 120, actualValue: 93.6, achievementRate: 78 } },
      subGoals: {
        create: [
          { position: 0, title: "集客強化", achievementRate: 85 },
          { position: 1, title: "顧客対応", achievementRate: 60 },
          { position: 2, title: "SNS運用", achievementRate: 75 },
          { position: 3, title: "業務効率", achievementRate: 28 },
          { position: 4, title: "連携",     achievementRate: 55 },
          { position: 5, title: "スキルUP", achievementRate: 90 },
          { position: 6, title: "数値管理", achievementRate: 62 },
          { position: 7, title: "新規開拓", achievementRate: 35 },
        ],
      },
    },
  });

  // タスク
  await prisma.task.create({
    data: {
      assigneeId: kondo.id,
      title: "予約LPのCTA改修",
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      dueDate: new Date("2026-05-13"),
      progressPct: 40,
    },
  });
  await prisma.task.create({
    data: {
      assigneeId: staffA.id,
      title: "Instagramリール×5本",
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      dueDate: new Date("2026-05-31"),
      progressPct: 20,
    },
  });

  // 評価
  const evalKondo = await prisma.evaluation.create({
    data: {
      subjectId: kondo.id,
      periodYear: 2026,
      periodHalf: EvaluationPeriodHalf.FIRST,
      status: EvaluationStatus.COMPLETED,
      scores: {
        create: [
          { evaluatorId: kondo.id,     evaluatorRole: Role.EMPLOYEE,  stars: 4 },
          { evaluatorId: kitanaka.id,  evaluatorRole: Role.MANAGER,   stars: 3 },
          { evaluatorId: executive.id, evaluatorRole: Role.ADMIN,     stars: 4 },
          { evaluatorId: executive.id, evaluatorRole: Role.EXECUTIVE, stars: 4 },
        ],
      },
    },
  });

  await prisma.evaluation.create({
    data: {
      subjectId: staffA.id,
      periodYear: 2026,
      periodHalf: EvaluationPeriodHalf.FIRST,
      status: EvaluationStatus.PENDING_EXECUTIVE,
      scores: {
        create: [
          { evaluatorId: staffA.id,    evaluatorRole: Role.EMPLOYEE, stars: 5 },
          { evaluatorId: kitanaka.id,  evaluatorRole: Role.MANAGER,  stars: 4 },
          { evaluatorId: executive.id, evaluatorRole: Role.ADMIN,    stars: 4 },
        ],
      },
    },
  });

  console.log("✓ Seed completed:", { chart: chart.id, evalKondo: evalKondo.id });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
