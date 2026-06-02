# VEXUM (Design D) — デプロイ手順書 / Runbook ④

統括・幹部・リーダー・個人の4画面（PC=サイドバー / スマホ=上部横並びタブ）を
Supabase + Vercel で公開するための手順。**認証情報を要する操作・破壊的操作・アカウント作成は
あなたが実施**します（私は代行不可）。各ステップの成果物は本リポジトリに用意済みです。

---

## 0. 構成
```
design-D_統括.html / 幹部.html / リーダー.html / 個人.html   … 4画面（連携ブロック組込済）
web/
  ├ api.js              … Supabase接続・データ変換（window.VexumAPI）
  ├ config.example.js   … config.js の雛形（URL/anonキー）
  ├ auth.html           … ログイン（role別に画面へ振り分け）
  └ INTEGRATION.md      … 連携の技術詳細
supabase/
  ├ 01_schema.sql       … テーブル/ENUM/RLS/関数
  ├ 02_seed_core.sql    … アカウント16・チーム3・所属
  ├ 03_seed_mandala.sql … 曼荼羅14（自動生成）
  └ 04_seed_activity.sql… タスク/日報/評価/評価記録（自動生成）
vercel.json             … 静的ホスティング設定
```
**動作原理**: 画面は内蔵デモで描画 → `web/config.js` 設定時のみ Supabase 実データで上書き再描画。
未設定なら従来と完全に同一動作（フォールバック）。

---

## 1. Supabase プロジェクト準備
1. https://supabase.com でプロジェクト作成（リージョンは Tokyo 推奨）。
2. **SQL Editor** で以下を順に貼り付けて実行（SQL Editor は service_role 権限で動くため RLS を気にせず投入可）:
   1. `supabase/01_schema.sql`
   2. `supabase/02_seed_core.sql`
   3. `supabase/03_seed_mandala.sql`
   4. `supabase/04_seed_activity.sql`
3. Table Editor で `profiles`(16) / `teams`(3) / `mandala_charts`(14) / `tasks` / `daily_reports` / `evaluations` / `eval_records` に行が入っていることを確認。

> 再実行する場合: `01` のポリシーは重複作成でエラーになります。やり直す時は新規プロジェクト推奨、
> または各 `create policy` の前に `drop policy if exists "<名前>" on <table>;` を追加してください。

---

## 2. 認証ユーザー作成（← あなたが実施 / 私は代行不可）
**A. ダッシュボードで作成**: Authentication → Users → "Add user" で各メールを登録（初期パスワードを設定）。
16アカウント分（最低限ログインさせたい役割: yamada/kimura/tanaka/nakamura）。

**B. profiles と紐付け**（メール一致で auth_user_id を更新）:
```sql
update profiles p
set    auth_user_id = u.id
from   auth.users u
where  lower(u.email) = lower(p.email);
```
> パスワードは強度のあるものを各自設定してください（私はパスワードを設定・入力できません）。

### アカウント一覧（role → ログイン後の遷移先）
| 氏名 | メール | role | 遷移先 |
|---|---|---|---|
| 山田 太郎 | yamada@vexum.co.jp | admin | 統括画面 |
| 木村 雅人 | kimura@vexum.co.jp | executive | 幹部画面 |
| 田中 花子 | tanaka@vexum.co.jp | leader | リーダー画面 |
| 鈴木 一郎 | suzuki@vexum.co.jp | leader | リーダー画面 |
| 佐藤 美咲 | sato@vexum.co.jp | leader | リーダー画面 |
| 中村 健太 | nakamura@vexum.co.jp | member | 個人画面 |
| 伊藤 さくら / 小林 大輔 / 山本 浩二 / 加藤 洋平 / 松田 奈緒 / 井上 大樹 | （各メール） | member | 個人画面 |
| 高橋 健 / 渡辺 由美 / 山口 翔 / 小川 真央 | （各メール） | member | 未所属（リーダー画面の追加候補） |

---

## 3. フロント設定
1. `web/config.example.js` を `web/config.js` にコピー。
2. Supabase の **Project Settings → API** から `Project URL` と `anon public` キーを取得し設定:
   ```js
   window.SUPABASE_CONFIG = { url: 'https://xxxx.supabase.co', anonKey: 'eyJ...anon...' };
   ```
   > **service_role キーは絶対に置かないこと**（フロント公開される）。anon のみ。RLSで保護。

---

## 4. デプロイ（Vercel）
あなたの選択は「既存の Git/Vercel を上書き」です。**Git履歴の上書きは不可逆**なので、念のため事前に
`git branch backup-pre-designD` でバックアップを取ることを強く推奨します。

### A. Git に反映（あなたが実施）
```bash
# 既存リポジトリのルートにこの一式（design-D_*.html, web/, supabase/, vercel.json, index.html）を配置
git checkout -b design-d-migration        # 直接 main 上書きより安全
git add -A
git commit -m "Replace app with Design D screens (Supabase連携)"
git push origin design-d-migration         # 確認後に main へマージ/上書き
```

### B. Vercel
- 既存プロジェクトに上記ブランチ/コミットが連携されていれば自動デプロイ。
- もしくは CLI:
  ```bash
  npm i -g vercel
  vercel            # プレビュー
  vercel --prod     # 本番
  ```
- ビルド不要（静的）。Framework Preset は「Other」。Output はリポジトリルート。

### 入口URL
- ログイン: `https://<your-domain>/web/auth.html`
- 直接プレビュー: `/design-D_統括.html` `/design-D_幹部.html` `/design-D_リーダー.html` `/design-D_個人.html`
- ギャラリー: `/index.html`

---

## 5. 動作確認チェックリスト
- [ ] `web/auth.html` で tanaka でログイン → リーダー画面に遷移
- [ ] 各画面でブラウザのコンソールに `[VEXUM] Supabaseデータを反映しました` が出る
- [ ] 幹部画面: アカウント管理にチーム3・メンバーが表示
- [ ] リーダー画面: ダッシュボード/評価/日報カレンダーに実データ
- [ ] 個人画面: 評価管理にリーダー/幹部のCSFコメント、割当の過去履歴、日報カレンダー
- [ ] スマホ幅でタブが上部に横並び
- [ ] `web/config.js` を外すと従来の内蔵デモで動く（フォールバック）

---

## 6. セキュリティ注意
- フロントに置くのは **anon キーのみ**。`service_role` は Supabase 管理画面/サーバ専用。
- RLS 有効。閲覧=認証ユーザー、更新=本人/自チームのリーダー/admin・executive。
- シード投入は SQL Editor（service_role 相当）で実施。anon ではRLSで弾かれます。

---

## 7. 既知の制限 / 次の改善余地
- 各画面は代表アカウント（個人=中村, リーダー=営業A）を読み込みます。**ログインユーザーに応じて
  動的に切替**するには、bootstrap で `VexumAPI.currentProfile()` の role/所属から
  `loadPersonalData(<自分>)` / `loadLeaderData(<自チーム>)` を呼ぶ形に拡張します。
- リーダー画面の `kpis/stats` は `tasks` 集計＋CSFから導出しています。厳密値が必要なら
  `team_members` に列追加で対応可能。
- 書き込み（評価保存・タスク追加・日報提出）の Supabase 反映は read 連携の次フェーズで対応可能
  （現状は画面内状態の更新。スキーマ側は受け入れ可能な構造です）。
