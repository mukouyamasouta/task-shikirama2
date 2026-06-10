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

## 4. 画面別機能一覧 — MECE

### 統括画面（admin）
| タブ | 機能 |
|---|---|
| 進捗ダッシュボード | 全体達成率・チーム別・メンバーランキング・活動ログ |
| タスク管理 | 全タスク一覧・フィルタ・ステータス管理 |
| 目標 KGI/KPI | KGIツリー展開・KPI進捗バー |
| 評価管理 | 全評価記録表示 |
| 新規作成 | アカウント発行・チーム編成・KGI/KPI設定・タスク割当 |
| チームダッシュボード | チーム別達成率・曼荼羅チャートリンク |
| アカウント管理 | 全メンバー一覧・編集 |
| タスク割当 | 未割当タスク管理・割当フォーム |
| メンバー評価入力 | 4軸スコア（達成度/業務力/チームワーク/成長力）入力 |
| 評価記録 | 過去評価一覧 |
| 曼荼羅送信 | 9×9グリッド作成・テンプレ適用・送信 |
| 曼荼羅一覧 | 全チーム/個人チャート閲覧・CSV出力 |

### 幹部画面（executive）
| タブ | 機能 |
|---|---|
| アカウント管理 | チーム別メンバー一覧・アカウント発行・チーム編成 |
| チャート送信 | リーダーへの曼荼羅チャート送信 |
| 一覧・評価 | チーム評価・個人評価・★5段階・CSV出力 |

### リーダー画面（leader）
| タブ | 機能 |
|---|---|
| チームダッシュボード | メンバー達成率・KPI進捗・個人DBモーダル・曼荼羅 |
| タスク割当 | メンバーへのタスク作成・割当 |
| チーム編集 | メンバー追加/削除・チーム情報更新 |
| メンバー評価入力 | KGI/CSF・タスク別★5段階評価 |
| 評価記録 | 保存済み評価一覧 |
| 日報 | メンバー別・日付別日報カレンダー確認 |

### 個人画面（employee）
| タブ | 機能 | DB保存 |
|---|---|---|
| 進捗ダッシュボード | 自分の達成率・KPI進捗・チーム内ランキング | 読込 |
| タスク管理 | 自分のタスク一覧・フィルタ・タスク作成 | ✅ tasks |
| チャート管理 | 曼荼羅KPIの本人編集（黄色ハイライト→リーダー可視化）・割当＋自作タスクの一元管理・タスク追加 | ✅ mandala_charts.member_kpi_edits / tasks |
| 割り当て | 上長/役員からの割当課題・達成度スライダー・コメント保存 | ✅ tasks |
| 評価管理 | 自己評価の下書き/提出・上長/幹部からの評価受信 | ✅ evaluations |
| 新規作成 | 曼荼羅チャート作成（フォーム/グリッド） | ✅ mandala_charts |
| 日報 | 日報作成・提出（同一日は上書き）・カレンダー管理 | ✅ daily_reports |

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

## 9. 既知の制限

- 統括/幹部の「チャート送信」は `chart_sends` に保存・送信履歴に表示されますが、
  受信側（リーダー/個人画面）に受信ボックスUIはまだありません（次フェーズ）。
- 統括画面の新規作成系フォーム（アカウント発行・チーム編成）は幹部画面に集約しています。
