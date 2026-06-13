-- =====================================================================
-- 19_task_period.sql — タスクの対象期間（評価連携用・冪等）
--
-- タスク作成時に「対象期間」(例: 2026 Q2 / 2026-06 / 2026年度)を記録し、
-- 評価管理で期間を選ぶと、その期間のタスク・工数が参照できるようにする。
--
-- SQL Editor に貼り付けて1回実行（再実行しても安全）。
-- =====================================================================

alter table tasks add column if not exists period text;   -- 対象期間ラベル
create index if not exists idx_tasks_period on tasks(period);

-- 確認: period 列の存在（期待値: 1）
select count(*) as tasks_period_col
  from information_schema.columns
 where table_name='tasks' and column_name='period';
