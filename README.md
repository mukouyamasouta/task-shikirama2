# VEXUM — タスク管理システム (Design D)

> **PC**: 左サイドバー型 ／ **iOS・Android**: 上部横並びタブ型
> **バックエンド**: Supabase（未設定時はデモデータで動作）

---

## 1. システム概要 — MECE構造

```
VEXUM
├── 認証層        : ログイン → role で画面振り分け
├── 統括画面      : 全データ・全チームの一元管理
├── 幹部画面      : チーム横断の俯瞰・チャート送信
├── リーダー画面   : 担当チームの管理・評価・日報
└── 個人画面      : 自分のタスク・目標・日報

データベース
├── 認証     : auth.users (Supabase Auth)
├── プロフィール: profiles (role / 部署)
├── チーム   : teams + team_members
├── 目標     : mandala_charts (KGI/CSF/KPI 9×9)
├── タスク   : tasks (割当 / 進捗 / ステータス)
├── 評価     : evaluations + eval_records (★5段階)
└── 日報     : daily_reports
```

---

## 2. アカウント一覧（現行・共通パスワード: `vexum2025`）

| 氏名 | メール | ロール | 担当画面 |
|---|---|---|---|
| 山田 太郎 | yamada@com | admin | 統括画面 |
| 山本（幹部） | yamamoto@com | executive | 幹部画面 |
| 田中 花子 | tanaka@vexum.co.jp | leader | リーダー画面（営業チームA） |
| 中村 健太 | nakamura@vexum.co.jp | member | 個人画面 |

> 追加アカウントは ①幹部画面の「アカウント発行」（即ログイン可・PW自動発行）
> ②ログイン画面の「新規登録」（セルフ登録 → member）のどちらでも作成できます。

---

## 3. 公開URL

| 画面 | URL |
|---|---|
| ログイン（ロール振り分け） | https://vexum-deploy.vercel.app/ |
| 統括画面 | https://vexum-deploy.vercel.app/admin |
| 幹部画面 | https://vexum-deploy.vercel.app/executive |
| リーダー画面 | https://vexum-deploy.vercel.app/leader |
| 個人画面 | https://vexum-deploy.vercel.app/employee |

---

## 4. 画面別機能一覧 — MECE（機能 × データ保存先）

> **動作原則**: 全画面とも「読込=Supabase実データ（未接続時は内蔵デモ）／書込=Supabaseへ即保存」。
> 表の「保存先」はSupabaseテーブル。**表示** = 読込専用機能。

### 統括画面（admin｜役割: 全社の一元管理・発行・割当・評価）
| タブ | 機能 | 保存先 |
|---|---|---|
| 進捗ダッシュボード | 全体達成率・チーム別達成率・メンバーランキング・最近の活動（タスク由来） | 表示 |
| タスク管理 | 全タスク一覧・ステータス別フィルタ（件数自動集計） | 表示 |
| 目標・KGI/KPI | チーム曼荼羅をKGIツリー表示（KPI進捗=紐づくタスク平均） | 表示 |
| 評価管理 | 全評価の詳細一覧（誰が誰に・KGI★・コメント） | 表示（evaluations） |
| 新規作成 > アカウント発行 | 即ログイン可アカウント発行（初期PW自動生成・表示） | profiles + auth |
| 新規作成 > チーム編成 | チーム作成・リーダー/メンバー所属設定 | teams + team_members |
| 新規作成 > KGI設定 | 担当者の曼荼羅チャート（中心目標）を作成 | mandala_charts |
| 新規作成 > KPI設定 | チャートのCSF配下にKPI登録＋担当者タスク作成 | mandala_charts + tasks |
| 新規作成 > タスク割当 | タスク作成・担当者/チーム/期間/優先度設定 | tasks |
| チームダッシュボード | チーム別達成率・上位メンバー・曼荼羅リンク | 表示 |
| アカウント管理 | 全アカウント一覧・編集（氏名/メール/ロール）・PW再発行・削除 | profiles + auth |
| タスク割当 | 未割当タスク（担当者なし）の割当・新規割当 | tasks |
| メンバー評価入力 | KGI/CSF/タスク（0–5）＋総合自動計算＋コメント | eval_records |
| 評価記録 | 評価サマリ履歴一覧 | 表示（eval_records） |
| チャート送信 | 9×9チャート作成→リーダー/従業員へ送信 | chart_sends |
| 一覧・評価 | 全チャート閲覧・セル評価（画面内ツール）・CSV出力 | 表示＋CSV |

### 幹部画面（executive｜役割: チーム横断の俯瞰・送信・評価）
| タブ | 機能 | 保存先 |
|---|---|---|
| アカウント管理 | チーム別メンバー一覧・アカウント発行（PW表示）・編集・削除・チーム編成 | profiles + teams + auth |
| チャート送信 | テンプレ管理・曼荼羅作成・送信／送信履歴（進捗%・記入者を確認） | chart_sends + chart_templates |
| 一覧・評価 | チーム/個人チャート閲覧・★5段階評価（本人に届く）・CSV出力 | evaluations + eval_records |
| 設定 | 自分の氏名/メール/パスワード変更 | profiles + auth |

### リーダー画面（leader｜役割: 担当チームの管理・振り分け・評価）
| タブ | 機能 | 保存先 |
|---|---|---|
| チームダッシュボード | メンバー達成率・KPI進捗（タスク平均から導出）・KPI本人編集の可視化（✏黄色） | 表示 |
| タスク割当 | タスク作成・割当・メンバー曼荼羅への直接記入 | tasks + mandala_charts |
| 受信ボックス | 幹部/統括からの受信チャート→KPIをメンバーへタスク振り分け | tasks + chart_sends |
| チーム編集 | メンバー追加/削除・チーム情報更新 | teams + team_members |
| メンバー評価入力 | KGI/CSF・タスク別★5段階評価（本人に届く） | evaluations + eval_records |
| 評価記録 | 保存済み評価一覧 | 表示（eval_records） |
| 日報 | メンバー別・日付別日報カレンダー確認 | 表示（daily_reports） |

### 個人画面（employee｜役割: 自分のタスク・目標・記録）
| タブ | 機能 | 保存先 |
|---|---|---|
| 進捗ダッシュボード | 自分の達成率・タスク統計・KPI進捗（タスク平均）・チーム内ランキング | 表示 |
| タスク管理 | 自分の全タスク一覧（割当＋自作）・フィルタ（件数自動集計）・タスク作成 | tasks |
| チャート管理 | 曼荼羅KPIの本人編集（→リーダーに✏黄色で可視化）・タスク一元管理・タスク追加 | mandala_charts + tasks |
| 受信ボックス | 幹部/統括からの受信チャートにKPI記入・進捗更新（→送信元に記入者表示） | chart_sends |
| 割り当て | 割当課題の達成度スライダー・コメント保存・100%で履歴へ自動移動 | tasks |
| 評価管理 | 自己評価の下書き/提出・リーダー/幹部からの評価受信 | evaluations |
| 新規作成 | 曼荼羅チャート作成（フォーム/グリッド） | mandala_charts |
| 日報 | 日報作成・提出（同一日は上書き）・カレンダー管理 | daily_reports |

---

## 5. レスポンシブ対応

| 環境 | レイアウト |
|---|---|
| PC（macOS/Windows、幅>768px） | 左サイドバー固定 + メインエリア |
| スマホ（iOS/Android、幅≤768px） | 上部横並びタブ + フルワイドコンテンツ |

---

## 6. Supabase セットアップ手順

### 新規プロジェクトの場合（1ファイルで完結）
1. [supabase.com](https://supabase.com) でプロジェクト作成
2. SQL Editor で `supabase/REBUILD.sql` を実行
   → テーブル・RLS・RPC・シード・ログイン用Authユーザー（PW: `vexum2025`）まで一括作成
3. 続けて `supabase/15_backend_complete.sql` を実行
   → 統括(admin)ログインの復旧と列の最終確認
4. `web/config.js` に URL と anon key を設定:
   ```js
   window.SUPABASE_CONFIG = {
     url:     'https://xxxx.supabase.co',
     anonKey: 'eyJ...'
   };
   ```
5. Vercel に config.js をプッシュ → 自動デプロイ

### 既存プロジェクト（REBUILD実行済み）の場合
- `supabase/15_backend_complete.sql` のみ実行（冪等・再実行安全）。
  自己評価の提出フラグ・KPI本人編集列・adminログインが揃います。
- `12_add_submitted.sql` / `13_change_exec_email.sql` / `14_kpi_edits.sql` は
  過去の個別パッチ（履歴）。15 がすべて包含します（13のメール変更を除く）。

> **デモモード**: config.js 未設定のままでも全機能がデモデータで動作します。

---

## 7. 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | HTML / CSS / Vanilla JS（フレームワーク不使用） |
| バックエンド | Supabase (PostgreSQL + Auth + RLS) |
| ホスティング | Vercel（静的サイト） |
| バージョン管理 | GitHub (mukouyamasouta/task-shikirama2) |

---

## 8. ファイル構成

```
/
├── index.html          # ログイン・ロール振り分け
├── signup.html         # セルフ新規登録（member）
├── admin.html          # 統括画面
├── executive.html      # 幹部画面
├── leader.html         # リーダー画面
├── employee.html       # 個人画面
├── vercel.json         # Vercel静的サイト設定
├── web/
│   ├── api.js          # Supabaseデータアクセス層（window.VexumAPI）
│   ├── config.js       # Supabase接続設定（要設定・anonキーのみ）
│   └── config.example.js
└── supabase/
    ├── REBUILD.sql               # バックエンド一括構築（テーブル/RLS/RPC/シード/Auth）
    ├── 15_backend_complete.sql   # 既存DB用 同期パッチ（冪等）
    ├── 12_add_submitted.sql      # （履歴）自己評価 提出フラグ
    ├── 13_change_exec_email.sql  # （履歴）幹部メール変更
    └── 14_kpi_edits.sql          # （履歴）KPI本人編集列
```

---

## 9. チャート送信の流れ（送信 → 受信 → 振り分け → 記入）

```
幹部/統括「チャート送信」
  → chart_sends に保存
  → リーダー画面「受信ボックス」… KPIをメンバーへタスクとして振り分け（tasks へ保存）
  → 個人画面「受信ボックス」  … KPIセルに直接記入・全体進捗を更新
  → 幹部画面「送信履歴」      … 進捗％と記入者（誰がどこを記入/割当したか）を確認
```

## 10. 運用メモ

- **デモモード**（`web/config.js` 未設定）では全機能がUI上で動作しますが、書込はブラウザ内のみでDBには保存されません。接続後は全書込がSupabaseへ永続化されます。
- 統括「一覧・評価」のセル評価（未評価→進行中→完了→要改善）は画面内の確認ツール＋CSV出力用です。DBに残す評価は「メンバー評価入力」（統括/リーダー/幹部）で行います。
- 達成率（achievement_rate）はチーム所属時に設定する登録値です。KPI進捗はタスク実績（related_kgi が一致するタスクの平均進捗）から自動導出されます。
