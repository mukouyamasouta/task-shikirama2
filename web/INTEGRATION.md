# ③ Supabase 連携 — 構成と組み込み手順

## 方針（重要）
- 各画面の **デザイン・機能・JSロジックは一切変更しない**。
- 画面は従来通り **内蔵デモデータ** で描画 → その直後に **Supabaseが設定されていれば実データで上書き再描画** する「フォールバック方式」。
- よって **未設定でも今と完全に同一**に動作し、設定すると実データに切り替わる。

## ファイル
| ファイル | 役割 |
|---|---|
| `web/config.example.js` | `web/config.js` にコピーして URL / anonキー を設定 |
| `web/api.js` | `window.VexumAPI`（接続・データ取得・短縮キー変換）。UMD前提のクラシックスクリプト |
| `web/auth.html` | メール/パスワードのログインページ。role で各画面へ振り分け |
| `vercel.json` | 静的ホスティング設定（cleanUrls・セキュリティヘッダ） |

## 読み込み順（各画面の `</body>` 直前に追加）
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="./web/config.js" onerror="this.dataset.miss=1"></script>
<script src="./web/api.js"></script>
<script> /* ↓ 画面別 bootstrap（下記） */ </script>
```
`config.js` が無い/プレースホルダのままなら `VexumAPI.ready=false` となり、bootstrap は何もしません（＝内蔵デモのまま）。

## 組み込み済み（リファレンス実装）
### 幹部画面 `design-D_幹部.html` ✅
`VexumAPI.loadAdminData()` が `{TEAMS, MEMBERS, MND, EMP}` を画面と同じ形で返し、
既存グローバルを `Object.assign` で中身ごと差し替え → `renderAccount/renderTeamEval/renderMemberEval` を再実行。
`const` のまま（再代入せず中身を入れ替える）なので画面コードは無改変。

## 残り3画面の組み込み（同じパターン・次ステップ）
各画面で「差し替える既存グローバル」と「再実行する描画関数」は以下。`api.js` にアダプタを1関数追加し、`</body>`前に bootstrap を足すだけ。

| 画面 | 差し替えるグローバル | 再描画関数 | 主な対応テーブル |
|---|---|---|---|
| 統括 `design-D_統括.html` | `MND`, `EMP` | `renderMandalaList()` | mandala_charts |
| リーダー `design-D_リーダー.html` | `MEMBERS`(team A), `MEMBER_TASKS`, `REPORTS`, `EVAL_RECORDS`, `DASH_IDS`, `EVAL_IDS` | `renderDashboard/renderAssignedTasks/renderMemberEval/renderEvalRec/renderReports` | profiles, team_members, mandala_charts, tasks, daily_reports, eval_records |
| 個人 `design-D_個人.html` | `CHARTS`, `FEEDBACK`, `ASSIGNMENTS`, `ASSIGN_HISTORY`, `PREPORTS` | `renderEval/renderAssign/renderPReportCalendar` | mandala_charts, evaluations, tasks, daily_reports |

> リーダー画面の `kpis` / `stats`（ダッシュボードの簡易指標）は現スキーマに無いため、`tasks` の集計から導出するか、`team_members` に列追加で対応します（次ステップで実装）。

## デプロイ手順（あなたが実施 / ④で詳細）
1. Supabase プロジェクト作成 → SQL Editor で `supabase/01→02→03→04` を順に実行（投入は **service_roleキー**で）。
2. 各メールの **Authユーザーを作成**（あなたが実施。私は代行不可）→ `profiles.auth_user_id` をメールで紐付け:
   ```sql
   update profiles p set auth_user_id = u.id
   from auth.users u where u.email = p.email;
   ```
3. `web/config.js` を作成し `url` / `anonKey`（公開可）を設定。
4. Vercel に静的デプロイ（`vercel.json` を含むこのフォルダ）。ログインは `/web/auth.html`。

> 注意: `service_roleキー` は **絶対に config.js やフロントに置かない**こと（anonキーのみ）。RLSで保護されます。
