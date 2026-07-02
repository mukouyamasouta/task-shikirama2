-- =====================================================================
-- 39_remove_period_ui.sql — 「対象期間（評価に連携）」UI廃止に伴うスキーマ確認
--
-- 概要:
--   ・タスク作成/割り当ての「対象期間」入力欄を全画面で廃止。
--   ・ダッシュボードの期間フィルターを、文字列 period ではなく
--     mandala_charts.start_date / end_date（実日付）ベースに変更。
--   ・チャート作成は start_date / end_date のみで保存（文字入力の期間は廃止）。
--
-- このファイルは Supabase SQL Editor に貼って1回実行してください。冪等（IF NOT EXISTS）。
-- 破壊的変更なし（列の削除やデータ削除は行いません）。
-- =====================================================================

-- 1) mandala_charts に end_date（未存在環境の保険。既存なら無変更）
alter table mandala_charts add column if not exists end_date date;

-- 2) start_date も未存在環境に備えて保険（loadChartsFor が参照するため。既存なら無変更）
alter table mandala_charts add column if not exists start_date date;

-- 3) tasks.period 列は「残す」（今後UIからは使用しないが、既存データ保持・後方互換のため削除しない）
--    → 追加・変更・削除は不要。既存データへの影響はありません。

-- 4) 確認（期待値: mandala_charts に start_date と end_date が存在 = 2）
select count(*) as mandala_date_cols
  from information_schema.columns
 where table_name = 'mandala_charts'
   and column_name in ('start_date','end_date');
