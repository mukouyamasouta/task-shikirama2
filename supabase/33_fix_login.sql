-- =====================================================================
-- 33_fix_login.sql — 緊急修正：全アカウントログイン不可バグ
-- Supabase SQL Editor に貼り付けて今すぐ実行してください
--
-- 原因（CASE A / RLS）:
--   27/28/00_full_setup で追加した RLS ポリシーが team_members を
--   「ポリシーのUSING句の中で直接 SELECT」していたため、
--   team_members のRLS評価が team_members を再帰参照し、
--   PostgreSQL が「42P17 infinite recursion」を返していた。
--   → 認証ユーザーの profiles / team_members / tasks 等の SELECT が全て500、
--     currentProfile() が null となり全アカウントがログイン後に弾かれていた。
--
-- 修正方針:
--   team_members を参照する条件を SECURITY DEFINER 関数に逃がす
--   （SECURITY DEFINER 関数内のクエリは RLS を発火しない＝再帰しない）。
--   さらに「自分自身の profiles は常に読める」自己ポリシーを最優先で追加。
-- 冪等（drop policy if exists → create / create or replace function）。
-- =====================================================================

-- 0) 本人判定・権限判定（既存。念のため再定義＝SECURITY DEFINERでRLSバイパス）
create or replace function current_profile_id() returns uuid
  language sql stable security definer set search_path = public, auth as $$
  select id from profiles
   where auth_user_id = auth.uid()
      or lower(email) = lower(nullif(auth.jwt() ->> 'email',''))
   order by (auth_user_id = auth.uid()) desc nulls last
   limit 1
$$;
create or replace function is_admin_or_exec() returns boolean
  language sql stable security definer set search_path = public, auth as $$
  select coalesce((
    select role in ('admin','executive') from profiles
     where auth_user_id = auth.uid()
        or lower(email) = lower(nullif(auth.jwt() ->> 'email',''))
     order by (auth_user_id = auth.uid()) desc nulls last limit 1
  ), false)
$$;

-- 1) 再帰回避の中核: 自分が所属するチームID / 同僚profileID を返す SECURITY DEFINER 関数
--    （関数内の team_members 参照は RLS を発火しないため再帰しない）
create or replace function my_team_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select team_id from team_members where profile_id = current_profile_id()
$$;
create or replace function my_team_peer_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select profile_id from team_members where team_id in (select team_id from team_members where profile_id = current_profile_id())
$$;

-- 2) profiles: まず「自分自身は常に読める」自己ポリシー（auth.uid直結で最も堅牢）
drop policy if exists "profiles_select_self" on profiles;
create policy "profiles_select_self" on profiles
  for select to authenticated
  using (auth_user_id = auth.uid());

-- 3) profiles: 同チーム閲覧を非再帰版に置換（team_members直参照をやめ関数経由に）
drop policy if exists "profiles_select_same_team" on profiles;
create policy "profiles_select_same_team" on profiles
  for select to authenticated
  using (
    is_admin_or_exec()
    or id = current_profile_id()
    or id in (select my_team_peer_ids())
  );

-- 4) team_members: 自チーム閲覧を非再帰版に置換（自己参照を関数経由に）
drop policy if exists "tm_select_same_team" on team_members;
create policy "tm_select_same_team" on team_members
  for select to authenticated
  using (is_admin_or_exec() or team_id in (select my_team_ids()));

-- 5) tasks / notifications / task_time_logs: team_members直参照を関数経由に置換
drop policy if exists "tasks_select_own" on tasks;
create policy "tasks_select_own" on tasks
  for select to authenticated
  using (is_admin_or_exec() or assignee_id = current_profile_id() or team_id in (select my_team_ids()));

drop policy if exists "ntf_select_own" on notifications;
create policy "ntf_select_own" on notifications
  for select to authenticated
  using (is_admin_or_exec() or to_user_id = current_profile_id() or to_team_id in (select my_team_ids()));

do $$
begin
  drop policy if exists "ttl_select_own" on task_time_logs;
  create policy "ttl_select_own" on task_time_logs
    for select to authenticated
    using (is_admin_or_exec() or user_id = current_profile_id()
           or task_id in (select id from tasks where team_id in (select my_team_ids())));
exception when undefined_table then null; end $$;

-- 6) exec専用の書込ポリシーは profiles のインライン参照をやめ is_admin_or_exec() に統一
drop policy if exists "profiles_exec_update" on profiles;
create policy "profiles_exec_update" on profiles for update to authenticated
  using (is_admin_or_exec()) with check (is_admin_or_exec());
drop policy if exists "tm_exec_write" on team_members;
create policy "tm_exec_write" on team_members for all to authenticated
  using (is_admin_or_exec()) with check (is_admin_or_exec());
do $$
begin
  drop policy if exists "teams_exec_write" on teams;
  create policy "teams_exec_write" on teams for all to authenticated
    using (is_admin_or_exec()) with check (is_admin_or_exec());
exception when undefined_table then null; end $$;

-- 7) is_active が NULL の既存行を true に（複数ロール移行時の取りこぼし救済）
do $$
begin
  update profiles set is_active = true where is_active is null;
exception when undefined_column then null; end $$;

-- 8) profiles ⇄ auth.users 再リンク（リンク切れ救済）
update profiles p set auth_user_id = u.id
  from auth.users u
 where lower(u.email) = lower(p.email) and p.auth_user_id is distinct from u.id;

-- ========== 確認クエリ ==========
select email, role, auth_user_id, is_active from profiles order by email;
select count(*) as profiles_select_policies from pg_policies
  where tablename='profiles' and cmd='SELECT';
