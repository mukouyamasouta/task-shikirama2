-- =====================================================================
-- 36_task_kpi_link.sql — タスクのKPI紐付け＋開始日（ガントチャート用）
-- Supabase SQL Editor で1回実行してください。冪等（IF NOT EXISTS）。
-- =====================================================================

alter table tasks add column if not exists source_kpi int;   -- 紐付けたKPIインデックス（任意）
alter table tasks add column if not exists start_date date;   -- 開始日（ガント用。REBUILD既存なら無変更）

-- 確認（期待値: 2）
select count(*) as task_new_cols from information_schema.columns
  where table_name='tasks' and column_name in ('source_kpi','start_date');
