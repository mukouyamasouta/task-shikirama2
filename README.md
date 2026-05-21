# シキラマ評価管理システム (task-shikirama2)

4つのロール（役員 / 管理者 / 上長 / 従業員）別の管理画面を Next.js (App Router) + Prisma + Supabase で構築するモノレポです。

## 構成

```
apps/
  executive/   役員画面 (EXECUTIVE)
  manager/     管理者画面 (ADMIN)
  employee/    従業員画面 (EMPLOYEE)
  admin/       上長画面 (MANAGER) — Note: 上長=MANAGER, 管理者=ADMIN
packages/
  db/          Prisma schema + クライアント (共有)
  ui/          共通UIコンポーネント (将来)
```

> ロール名のマッピング（モックHTMLに準拠）:
> - EXECUTIVE = 役員
> - ADMIN = 管理者
> - MANAGER = 上長
> - EMPLOYEE = 従業員

## 📘 セットアップガイド

1. **[Supabase セットアップ](docs/SUPABASE_SETUP.md)** — DB を準備（15分）
2. **[Vercel デプロイ](docs/VERCEL_DEPLOY.md)** — 役員アプリを本番公開（10分）

## ローカル開発

```bash
npm install
cp .env.example .env   # Supabase の DATABASE_URL を設定
npm run db:generate
npm run db:push
npm run dev:executive  # http://localhost:3001
```

## デプロイ (Vercel)

各 `apps/*` ディレクトリを別プロジェクトとして Vercel に登録し、4つの独立した URL を発行します。

## 技術スタック

- Next.js 15 (App Router) / TypeScript
- Tailwind CSS
- Prisma + Supabase (Postgres)
- npm workspaces
