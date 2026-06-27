-- =====================================================================
-- 34_fix_data_isolation.sql
-- Supabase SQL Editor に貼り付けて1回実行してください（防御層・任意）
--   tasks / mandala_charts の SELECT を「本人＋自チーム＋管理者/幹部」に限定。
--   ※ 実バグ（新規チームに他チャート混入・誤った100%表示）はフロント側で修正済み。
--     本SQLはDBレベルの多重防御。冪等・再帰なし（team_members直参照を避け
--     SECURITY DEFINER関数経由＝27→33で起きた42P17無限再帰を再発させない）。
-- =====================================================================

-- 0) 本人判定・権限判定・チーム集合（SECURITY DEFINER＝RLSを発火せず再帰しない）
create or replace function current_profile_id() returns uuid
  language sql stable security definer set search_path = public, auth as $$
  select id from profiles
   where auth_user_id = auth.uid()
      or lower(email) = lower(nullif(auth.jwt() ->> 'email',''))
   order by (auth_user_id = auth.uid()) desc nulls last limit 1
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
create or replace function my_team_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select team_id from team_members where profile_id = current_profile_id()
$$;
create or replace function my_team_peer_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select profile_id from team_members where team_id in (select team_id from team_members where profile_id = current_profile_id())
$$;

-- 1) tasks: 本人(担当/依頼) ＋ 自チーム ＋ 管理者/幹部 のみ閲覧
alter table tasks enable row level security;
drop policy if exists "tasks_select_scoped" on tasks;
create policy "tasks_select_scoped" on tasks
  for select to authenticated
  using (
    is_admin_or_exec()
    or assignee_id = current_profile_id()
    or assigner_id = current_profile_id()
    or team_id in (select my_team_ids())
  );
-- 旧・全件閲覧と旧スコープ名を撤去（厳格化を有効化）
drop policy if exists "tk_read" on tasks;
drop policy if exists "tasks_select_own" on tasks;

-- 2) mandala_charts: 本人 ＋ 自チームのチャート ＋ 自チームメンバーのチャート ＋ 管理者/幹部
alter table mandala_charts enable row level security;
drop policy if exists "charts_select_scoped" on mandala_charts;
create policy "charts_select_scoped" on mandala_charts
  for select to authenticated
  using (
    is_admin_or_exec()
    or owner_user_id = current_profile_id()
    or owner_team_id in (select my_team_ids())
    or owner_user_id in (select my_team_peer_ids())
  );
drop policy if exists "mc_read" on mandala_charts;

-- 確認 ---------------------------------------------------------------
select
  (select count(*) from pg_policies where tablename='tasks')          as tasks_policies,
  (select count(*) from pg_policies where tablename='mandala_charts') as charts_policies,
  (select count(*) from pg_policies where tablename='tasks' and policyname='tasks_select_scoped')          as tasks_scoped,
  (select count(*) from pg_policies where tablename='mandala_charts' and policyname='charts_select_scoped') as charts_scoped;
-- すべて1以上ならOK（mc_manage / tk_write は書込用に残ります）
