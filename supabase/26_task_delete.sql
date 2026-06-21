-- ============================================================
-- 26_task_delete.sql
-- タスクの削除（個人画面のタスク管理「🗑 削除」）に対応。
-- 既存の "tk_write"（tasks for all）が DELETE も含むため通常は追加不要だが、
-- 古いDB（INSERT/UPDATE のみのポリシー構成）でも本人が自分のタスクを
-- 削除できるよう、冪等に DELETE 用ポリシーを保証する。
-- 何度実行しても安全（IF NOT EXISTS / duplicate_object を無視）。
-- ============================================================

-- tasks の RLS を有効化（既に有効なら無視）
alter table if exists tasks enable row level security;

-- 本人（担当者）/ 依頼者 / 管理者・幹部 / 自チームのリーダー が削除可能。
-- current_profile_id() / is_admin_or_exec() / my_led_team_ids() は
-- REBUILD.sql で定義済みのヘルパー関数を流用。
do $$
begin
  create policy "tk_delete" on tasks for delete to authenticated
    using (
      is_admin_or_exec()
      or assigner_id = current_profile_id()
      or assignee_id = current_profile_id()
      or team_id in (select my_led_team_ids())
    );
exception
  when duplicate_object then null;  -- 既に "tk_write"(for all) 等が存在する場合
  when undefined_function then null; -- ヘルパー未定義の古いDBはスキップ
end $$;
