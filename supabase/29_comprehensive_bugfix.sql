-- Supabase SQL Editor で1回実行してください
-- 包括的バグ修正: RLS・スキーマ・整合性修正
-- =====================================================================
-- 前提: 27_fix_team_rls.sql / 28_fix_bugs.sql を適用済みであること。
-- 本ファイルはそれらを補完する「追加（additive）」ポリシーのみ。
-- 既存の閲覧ポリシーは残すためロックアウトしません。冪等（再実行可）。
-- =====================================================================

-- 1. task_time_logs: 本人の工数ログのみ閲覧（＋自チームのリーダー／幹部・管理者）
alter table if exists task_time_logs enable row level security;
drop policy if exists "ttl_select_own" on task_time_logs;
do $$
begin
  create policy "ttl_select_own" on task_time_logs
    for select to authenticated
    using (
      is_admin_or_exec()
      or user_id = current_profile_id()
      or task_id in (
        select id from tasks
        where team_id in (select team_id from team_members where profile_id = current_profile_id())
      )
    );
exception
  when undefined_function then null;
  when undefined_column   then null;
  when undefined_table    then null;
end $$;

-- 2. 28_fix_bugs.sql の本人データ分離ポリシーを冪等に再保証（未適用環境向け）
do $$
begin
  drop policy if exists "tasks_select_own" on tasks;
  create policy "tasks_select_own" on tasks for select to authenticated
    using (
      is_admin_or_exec()
      or assignee_id = current_profile_id()
      or team_id in (select team_id from team_members where profile_id = current_profile_id())
    );
exception when undefined_function then null; end $$;

do $$
begin
  drop policy if exists "ntf_select_own" on notifications;
  create policy "ntf_select_own" on notifications for select to authenticated
    using (
      is_admin_or_exec()
      or to_user_id = current_profile_id()
      or to_team_id in (select team_id from team_members where profile_id = current_profile_id())
    );
exception when undefined_function then null; when undefined_table then null; end $$;

-- 3. 確認クエリ -------------------------------------------------------
select
  (select count(*) from pg_policies where tablename='task_time_logs' and policyname='ttl_select_own') as ttl_select_own,
  (select count(*) from pg_policies where tablename='tasks'          and policyname='tasks_select_own') as tasks_select_own,
  (select count(*) from pg_policies where tablename='notifications'  and policyname='ntf_select_own')   as ntf_select_own;
-- すべて 1 ならOK
