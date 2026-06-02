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

## 2. アカウント一覧（デモ用）

| 氏名 | メール | ロール | 担当画面 |
|---|---|---|---|
| 山田 太郎 | yamada@vexum.co.jp | admin | 統括画面 |
| 木村 雅人 | kimura@vexum.co.jp | executive | 幹部画面 |
| 田中 花子 | tanaka@vexum.co.jp | leader | リーダー画面（営業チームA） |
| 鈴木 一郎 | suzuki@vexum.co.jp | leader | リーダー画面（開発チームB） |
| 佐藤 美咲 | sato@vexum.co.jp | leader | リーダー画面（マーケチームC） |
| 中村 健太 | nakamura@vexum.co.jp | member | 個人画面 |
| 伊藤 さくら | ito@vexum.co.jp | member | 個人画面 |
| 小林 大輔 | kobayashi@vexum.co.jp | member | 個人画面 |
| 山本 浩二 | yamamoto@vexum.co.jp | member | 個人画面 |
| 加藤 洋平 | kato@vexum.co.jp | member | 個人画面 |
| 松田 奈緒 | matsuda@vexum.co.jp | member | 個人画面 |
| 井上 大樹 | inoue@vexum.co.jp | member | 個人画面 |

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
| タブ | 機能 |
|---|---|
| 進捗ダッシュボード | 自分の達成率・KPI進捗・チーム内ランキング |
| タスク管理 | 自分のタスク一覧・フィルタ |
| 割り当て | 上長/役員からの割当課題・達成度スライダー入力 |
| 評価管理 | KGI/CSF評価入力（バー/曼荼羅形式）・上長からの評価受信 |
| 新規作成 | 曼荼羅チャート作成（フォーム/グリッド） |
| 日報 | 日報作成・提出・カレンダー管理 |

---

## 5. レスポンシブ対応

| 環境 | レイアウト |
|---|---|
| PC（macOS/Windows、幅>768px） | 左サイドバー固定 + メインエリア |
| スマホ（iOS/Android、幅≤768px） | 上部横並びタブ + フルワイドコンテンツ |

---

## 6. Supabase セットアップ手順

1. [supabase.com](https://supabase.com) でプロジェクト作成
2. SQL Editor で順に実行:
   - `supabase/01_schema.sql` → テーブル・RLS・関数
   - `supabase/02_seed_core.sql` → プロフィール16名・チーム3
   - `supabase/03_seed_mandala.sql` → 曼荼羅チャート14件
   - `supabase/04_seed_activity.sql` → タスク・日報・評価
3. Authentication → Users → 上記12名のメールでアカウント作成
4. `web/config.js` に URL と anon key を設定:
   ```js
   window.SUPABASE_CONFIG = {
     url:     'https://xxxx.supabase.co',
     anonKey: 'eyJ...'
   };
   ```
5. Vercel に config.js をプッシュ → 自動デプロイ

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
├── admin.html          # 統括画面
├── executive.html      # 幹部画面
├── leader.html         # リーダー画面
├── employee.html       # 個人画面
├── vercel.json         # Vercel静的サイト設定
├── web/
│   ├── api.js          # Supabaseデータアクセス層
│   ├── config.js       # Supabase接続設定（要設定）
│   └── config.example.js
└── supabase/
    ├── 01_schema.sql   # テーブル定義・RLS・関数
    ├── 02_seed_core.sql
    ├── 03_seed_mandala.sql
    └── 04_seed_activity.sql
```
