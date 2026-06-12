# VEXUM (Design D) — デプロイ手順書 / Runbook ④

統括・幹部・リーダー・個人の4画面（PC=サイドバー / スマホ=上部横並びタブ）を
Supabase + Vercel で公開するための手順。**認証情報を要する操作・破壊的操作・アカウント作成は
あなたが実施**します（私は代行不可）。各ステップの成果物は本リポジトリに用意済みです。

---

## 0. 構成
```
index.html / signup.html                          … ログイン / セルフ登録
admin.html / executive.html / leader.html / employee.html … 4画面（連携ブロック組込済）
web/
  ├ api.js              … Supabase接続・データ変換（window.VexumAPI）
  ├ config.example.js   … config.js の雛形（URL/anonキー）
  └ INTEGRATION.md      … 連携の技術詳細
supabase/
  ├ REBUILD.sql              … バックエンド一括構築（テーブル/RLS/RPC/シード/Auth）
  ├ 15_backend_complete.sql  … 既存DB用 同期パッチ（冪等）
  └ 12〜14_*.sql             … 過去の個別パッチ（履歴・15が包含）
vercel.json             … 静的ホスティング設定
```
**動作原理**: 画面は内蔵デモで描画 → `web/config.js` 設定時のみ Supabase 実データで上書き再描画。
未設定なら従来と完全に同一動作（フォールバック）。

---

## 1. Supabase プロジェクト準備（← SQLの実行はあなたが実施）
1. https://supabase.com でプロジェクト作成（リージョンは Tokyo 推奨）。
2. **SQL Editor** で以下を順に貼り付けて実行（SQL Editor は service_role 権限で動くため RLS を気にせず投入可）:
   1. `supabase/REBUILD.sql` … 全テーブル/RLS/RPC/シード/Authユーザーを一括作成（既存データは破棄）
   2. `supabase/15_backend_complete.sql` … adminログイン復旧＋列の最終確認（冪等）
3. 15 の末尾の確認クエリが `1 / 1 / 1 / 1` を返せば完了。

---

## 2. ログインアカウント（REBUILD が自動作成 / 共通PW: vexum2025）
認証ユーザーは REBUILD.sql が profiles と紐付けて自動作成します。手動作成は不要です。

| 氏名 | メール | role | 遷移先 |
|---|---|---|---|
| 山田 太郎 | yamada@com | admin | 統括画面 |
| 山本（幹部） | yamamoto@com | executive | 幹部画面 |
| 田中 花子 | tanaka@vexum.co.jp | leader | リーダー画面（営業チームA） |
| 中村 健太 | nakamura@vexum.co.jp | member | 個人画面 |

追加は ①幹部画面「アカウント発行」（`vexum_create_login` RPC・PW自動発行）
②`/signup.html` セルフ登録（`vexum_self_register` RPC・member固定）で行えます。
> 本番運用ではログイン後に各自パスワードを変更してください（個人画面の設定から `updateSelf`）。

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
- ログイン: `https://vexum-deploy.vercel.app/`
- 直接プレビュー: `/admin` `/executive` `/leader` `/employee`（未ログイン時は内蔵デモ表示）

---

## 5. 動作確認チェックリスト
- [ ] `/` で tanaka@vexum.co.jp でログイン → リーダー画面に遷移
- [ ] 各画面でブラウザのコンソールに `[VEXUM] Supabaseデータを反映しました` が出る
- [ ] 幹部画面: アカウント管理にチーム・メンバーが表示／アカウント発行でPWが表示される
- [ ] リーダー画面: ダッシュボード/評価/日報カレンダーに実データ
- [ ] 個人画面（nakamura）:
  - [ ] 割り当てタブで達成度を変えて「保存する」→ リロード後も値が残る
  - [ ] 日報を提出 → リロード後もカレンダーに残る（リーダー画面の日報にも出る）
  - [ ] チャート管理でKPIを編集して「💾 KPI変更を保存」→ リーダー画面の🧿曼荼羅で黄色表示
  - [ ] 新規作成（フォーム/グリッド）→ リロード後もチャート一覧に残る
  - [ ] 自己評価の下書き保存/提出 → リロード後も状態が残る
- [ ] スマホ幅でタブが上部に横並び
- [ ] `web/config.js` を外すと従来の内蔵デモで動く（フォールバック）

---

## 6. セキュリティ注意
- フロントに置くのは **anon キーのみ**。`service_role` は Supabase 管理画面/サーバ専用。
- RLS 有効。閲覧=認証ユーザー、更新=本人/自チームのリーダー/admin・executive。
- シード投入は SQL Editor（service_role 相当）で実施。anon ではRLSで弾かれます。

---

## 7. 対応状況 / 既知の制限
**対応済み（Supabase 永続化）**
- ログインユーザーに応じた画面データの動的切替（`currentProfile()` → role/所属で自動判定）
- 評価保存（リーダー/幹部 → evaluations + eval_records）・自己評価の下書き/提出（submitted）
- タスク: リーダー割当・個人の自作タスク・進捗/ステータス/コメント保存・完了日（tasks）
- 日報提出（daily_reports / 同一日は上書き）
- 曼荼羅: 個人の新規作成（mandala_charts）・KPI本人編集のリーダー可視化（member_kpi_edits）
- チャート送信の保存（chart_sends / 統括・幹部とも）・アカウント/チームのCRUD・PW再発行
- 受信ボックス: リーダー画面（KPIをメンバーへタスク振り分け→個人画面に反映）／
  個人画面（KPIセルへ記入・進捗更新→幹部の送信履歴に記入者・進捗が反映）

**既知の制限（次フェーズ）**
- リーダー画面の `kpis/stats` は `tasks` 集計＋CSFから導出（厳密値が必要なら列追加で対応）
- 統括画面の評価入力・タスク割当フォームはデモ表示（実書き込みは幹部/リーダー画面に集約）
