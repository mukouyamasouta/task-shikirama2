# Vercel デプロイ手順（役員アプリ）

このドキュメントは **役員アプリ (`apps/executive`)** を Vercel にデプロイする手順です。所要時間: 10 分。

> 前提: [SUPABASE_SETUP.md](SUPABASE_SETUP.md) を完了し、`DATABASE_URL` / `DIRECT_URL` を手元に控えていること。

---

## STEP 1. Vercel アカウント作成 / ログイン

1. <https://vercel.com/> を開き、右上の **「Sign Up」** または **「Log In」**
2. **「Continue with GitHub」** を選択（`mukouyamasouta` で）
3. 初回の場合、Vercel に GitHub リポジトリへのアクセスを許可

---

## STEP 2. 新規プロジェクト作成

1. ダッシュボード右上の **「Add New...」** → **「Project」**
2. **Import Git Repository** 一覧から `task-shikirama2` を探して **「Import」**

> 一覧に出てこない場合は **「Adjust GitHub App Permissions」** で `task-shikirama2` を許可リポジトリに追加。

---

## STEP 3. Configure Project — ここが最重要

### Project Name
```
shikirama-executive
```

### Framework Preset
自動で **Next.js** が選択されている（手動指定不要）

### Root Directory
**「Edit」をクリックして** 以下を入力:
```
apps/executive
```
チェック「**Include source files outside of the Root Directory in the Build Step**」を **必ずON** にする（モノレポで `packages/db` を参照するため）

### Build and Output Settings

`vercel.json` を配置済みなので **そのままで OK**（自動で以下が適用されます）:

| 項目 | 値 |
|------|----|
| Build Command | `cd ../.. && npm run build -w @shikirama/executive` |
| Install Command | `cd ../.. && npm install` |
| Output Directory | `.next`（自動） |

---

## STEP 4. Environment Variables（環境変数）

「**Environment Variables**」セクションを展開し、以下 2 つを追加:

| Name | Value | Environment |
|------|-------|-------------|
| `DATABASE_URL` | (Supabase の pooler 6543 URL) | Production / Preview / Development すべて ✓ |
| `DIRECT_URL` | (Supabase の 5432 URL) | Production / Preview / Development すべて ✓ |

> 値は Supabase で取得した接続文字列をそのまま貼る。`[YOUR-PASSWORD]` は実パスワードに置換済みのものを。

---

## STEP 5. デプロイ実行

1. 一番下の **「Deploy」** をクリック
2. ビルドログが流れる（約 2-3 分）
3. 完了すると 🎉 と共に URL が表示される:

```
https://shikirama-executive-xxxx.vercel.app
```

このURLが役員アプリの本番URLです。

---

## STEP 6. 動作確認

1. デプロイURLを開く
2. 役員画面のトップ（全社ダッシュボード）が表示されることを確認
3. サブナビで「社員別ビュー」「評価記録」に切り替わることを確認
4. 「＋ 役員コメントを追加」ボタンでモーダルが開くことを確認
5. 注目タスクをクリックでタスク詳細モーダルが開くことを確認

---

## STEP 7. カスタムドメイン設定（任意）

1. プロジェクトの **Settings** → **Domains**
2. 独自ドメイン（例: `executive.shikirama.com`）を追加
3. 表示される CNAME/A レコードを DNS に登録

---

## トラブルシューティング

### ビルドエラー: `Module not found: Can't resolve '@shikirama/db'`
→ Root Directory 設定で「Include source files outside...」のチェックが外れている。Settings → General で確認。

### ビルドエラー: `PrismaClientInitializationError`
→ Environment Variables の `DATABASE_URL` を Production にも設定しているか確認。

### ビルドエラー: `Cannot find module 'prisma'`
→ `apps/executive/package.json` の devDependencies に `prisma` が含まれているか確認（追加済み）。

### 真っ白な画面 / フォントが汚い
→ ハードリロード（Cmd+Shift+R）。Google Fonts のキャッシュ待ち。

### 自動デプロイが動かない
→ Settings → Git でブランチ連携が `main` になっているか確認。

---

## 自動デプロイの仕組み

`main` ブランチに `git push` するたびに Vercel が自動でビルド & デプロイします。プルリクエストごとに Preview URL も発行されます。

```bash
# ローカルで変更
git add .
git commit -m "feat: ..."
git push                     # ← 自動デプロイ
```

---

## 4つのアプリすべてをデプロイする場合（将来）

同じ手順を上長 / 従業員 / 管理者アプリにも適用:

| アプリ | Vercel Project Name | Root Directory |
|--------|--------------------|----------------|
| 役員 | `shikirama-executive` | `apps/executive` |
| 上長 | `shikirama-manager`   | `apps/manager`   |
| 従業員 | `shikirama-employee` | `apps/employee`  |
| 管理者 | `shikirama-admin`     | `apps/admin`     |

それぞれ別の URL が発行され、同じ Supabase DB を共有します。
