-- =====================================================================
-- 22_task_self_eval.sql — タスク単位の自己評価（評価管理タブの個別保存・冪等）
--
-- 評価管理タブで「与えられたタスク」ごとに★評価＋コメントを個別に保存
-- できるようにするための列。担当者(assignee)本人のみ更新可能
-- （既存の tasks RLS "tk_write" が assignee_id = current_profile_id() を
--   許可しているため、追加のポリシーは不要）。
--
-- SQL Editor に貼り付けて1回実行（再実行しても安全）。
-- =====================================================================

alter table tasks add column if not exists self_eval_stars   int;   -- 1〜5（本人評価）
alter table tasks add column if not exists self_eval_comment text;  -- 本人コメント

-- 確認: 列の存在（期待値: 2）
select count(*) as task_self_eval_cols
  from information_schema.columns
 where table_name='tasks' and column_name in ('self_eval_stars','self_eval_comment');
