-- Supabase SQL Editor に貼り付けて1回実行してください
-- バグ修正: チーム編成永続化・データ分離・権限変更対応
-- =====================================================================
-- すべて追加（additive）ポリシー。既存の閲覧ポリシーは残すため
-- ロックアウトやリーダー/幹部の横断閲覧を壊しません。
-- 何度実行しても安全（drop policy if exists で冪等）。
-- =====================================================================

-- 【バグ1】team_members: 幹部・管理者が編成（INSERT/UPDATE/DELETE）できる
drop policy if exists "tm_exec_write" on team_members;
create policy "tm_exec_write" on team_members
  for all to authenticated
  using (
    exists (
      select 1 from profiles
      where id = current_profile_id()
        and role in ('executive', 'admin')
    )
  )
  with check (
    exists (
      select 1 from profiles
      where id = current_profile_id()
        and role in ('executive', 'admin')
    )
  );

-- 【バグ2】tasks: 本人に割り当てられたもの（＋自チーム／管理者・幹部）
drop policy if exists "tasks_select_own" on tasks;
create policy "tasks_select_own" on tasks
  for select to authenticated
  using (
    is_admin_or_exec()
    or assignee_id = current_profile_id()
    or team_id in (
      select team_id from team_members
      where profile_id = current_profile_id()
    )
  );

-- 【バグ2】notifications: 本人宛て（＋自チーム宛て／管理者・幹部）
drop policy if exists "ntf_select_own" on notifications;
create policy "ntf_select_own" on notifications
  for select to authenticated
  using (
    is_admin_or_exec()
    or to_user_id = current_profile_id()
    or to_team_id in (
      select team_id from team_members
      where profile_id = current_profile_id()
    )
  );

-- 【バグ3】profiles: 幹部・管理者がロール（権限）を変更できる
drop policy if exists "profiles_exec_update" on profiles;
create policy "profiles_exec_update" on profiles
  for update to authenticated
  using (
    exists (
      select 1 from profiles p2
      where p2.id = current_profile_id()
        and p2.role in ('executive', 'admin')
    )
  )
  with check (
    exists (
      select 1 from profiles p2
      where p2.id = current_profile_id()
        and p2.role in ('executive', 'admin')
    )
  );

-- 確認クエリ -----------------------------------------------------------
select
  (select count(*) from pg_policies where tablename='team_members' and policyname='tm_exec_write')      as tm_exec_write,
  (select count(*) from pg_policies where tablename='tasks'        and policyname='tasks_select_own')    as tasks_select_own,
  (select count(*) from pg_policies where tablename='notifications'and policyname='ntf_select_own')      as ntf_select_own,
  (select count(*) from pg_policies where tablename='profiles'     and policyname='profiles_exec_update')as profiles_exec_update;
-- すべて 1 ならポリシー適用済み
