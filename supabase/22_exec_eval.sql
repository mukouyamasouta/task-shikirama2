-- Supabase SQL Editorで1回実行してください
-- 幹部画面の評価タブに「幹部コメント」欄を追加するための列追加。
-- 既存の RLS ポリシー "ev_write"（is_admin_or_exec() なら all 操作可）が
-- そのままこの列の書き込みもカバーするため、ポリシーの追加は不要。
alter table evaluations
  add column if not exists exec_comment text,
  add column if not exists exec_commented_at timestamptz;
