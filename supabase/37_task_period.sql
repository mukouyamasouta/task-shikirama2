-- =====================================================================
-- 37_task_period.sql — タスクの期間（開始日・終了日）カラム
-- Supabase SQL Editor で1回実行してください。冪等（IF NOT EXISTS）。
--   start_date は 36_task_kpi_link.sql で追加済みでも無変更（IF NOT EXISTS）。
--   due_date は 19_task_period.sql 等で既存なら追加されません。
-- =====================================================================

alter table tasks add column if not exists start_date date;   -- 開始日（ガント用）
alter table tasks add column if not exists due_date date;     -- 終了日（期限・ガント用）

-- 確認（期待値: 2）
select count(*) as task_period_cols from information_schema.columns
  where table_name='tasks' and column_name in ('start_date','due_date');
