# Supabase セットアップ手順（丁寧版）

このドキュメントは「Supabase アカウントを作るところ → Prisma で接続 → シード投入」までを順番に踏んでいくチェックリストです。所要時間は 15-20 分程度です。

---

## STEP 1. Supabase アカウント作成

1. ブラウザで <https://supabase.com/> を開く
2. 右上の **「Start your project」** をクリック
3. 「Continue with GitHub」を選択（GitHub アカウント `mukouyamasouta` で連携すると後が楽です）
4. メール認証を済ませる

---

## STEP 2. プロジェクト作成

1. ダッシュボードの **「New project」** をクリック
2. 入力項目:

| 項目 | 値 |
|------|----|
| Organization | デフォルトでOK（個人 org） |
| Name | `shikirama` |
| Database Password | **強いパスワードを生成してメモ帳に保存**（後で使用） |
| Region | **Northeast Asia (Tokyo)** ap-northeast-1 |
| Pricing Plan | **Free** |

3. **「Create new project」** をクリック → プロビジョニングに 1-2 分かかる

> ⚠ **パスワードは絶対に忘れない**。再発行は可能だが手間です。
> 1Password / メモアプリ等に保管推奨。

---

## STEP 3. 接続文字列の取得

1. プロジェクトダッシュボード左サイドバー → **⚙ Project Settings** → **Database**
2. **Connection string** セクションまでスクロール
3. 以下 2 つをコピー：

### ① Connection Pooling（DATABASE_URL に使用）

「**Transaction**」モード（port 6543）を選択し、`URI` をコピー。
形式:
```
postgresql://postgres.xxxxxxxx:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
```

### ② Direct Connection（DIRECT_URL に使用 / マイグレーション用）

「**Session**」モード（port 5432）の `URI` をコピー。
形式:
```
postgresql://postgres.xxxxxxxx:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
```

> 💡 `[YOUR-PASSWORD]` を STEP 2 で保存したパスワードに置換するのを忘れずに！

---

## STEP 4. `.env` ファイル作成

リポジトリのルートで以下を実行:

```bash
cd ~/Desktop/task-shikirama2
cp .env.example .env
```

`.env` を開いて以下のように編集（パスワードを実際のものに置き換え）:

```ini
DATABASE_URL="postgresql://postgres.xxxxxxxx:YourActualPassword@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.xxxxxxxx:YourActualPassword@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
```

> ⚠ `.env` は `.gitignore` でコミット対象外です。GitHub にプッシュされません。

---

## STEP 5. Prisma スキーマを Supabase に反映

```bash
npm run db:generate   # Prisma Client を生成
npm run db:push       # スキーマを Supabase に反映（テーブル作成）
```

成功すると:
```
🚀  Your database is now in sync with your Prisma schema.
```

Supabase ダッシュボード → **Table Editor** に以下のテーブルが作成されたことを確認:
- `User`, `Team`, `MandalaChart`, `Kgi`, `SubGoal`, `Kpi`, `Task`, `ProgressLog`, `Comment`, `Evaluation`, `EvaluationScore`

---

## STEP 6. シードデータを投入

```bash
npx tsx packages/db/prisma/seed.ts
```

出力:
```
✓ Seed completed: { chart: 'xxxx', evalKondo: 'xxxx' }
```

Supabase の Table Editor で `User` テーブルを開き、6名のユーザー（田中、北中、山田、近藤、スタッフA、鈴木）が入っていれば成功です。

---

## STEP 7. Prisma Studio で確認（任意）

```bash
cd packages/db && npx prisma studio
```

ブラウザで <http://localhost:5555> が開き、GUIでデータを閲覧・編集できます。

---

## トラブルシューティング

### `Error: P1001: Can't reach database server`
→ パスワードが間違っている、または Region が違う。`.env` を再確認。

### `Error: P1011: Error opening a TLS connection`
→ Connection Pooling URL に `?pgbouncer=true` が付いているか確認。

### `prisma db push` が hang する
→ `DIRECT_URL` を使うように schema.prisma に書いてあるか確認（既に書いてあります）。

### Supabase のパスワードを忘れた
→ Project Settings → Database → **Reset database password** で再発行可能。

---

## 次のステップ

→ [VERCEL_DEPLOY.md](VERCEL_DEPLOY.md) で役員アプリを Vercel にデプロイ
