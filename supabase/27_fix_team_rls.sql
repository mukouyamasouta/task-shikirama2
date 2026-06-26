-- =====================================================================
-- 27_fix_team_rls.sql
-- Supabase SQL Editor に貼り付けて1回実行してください。
--   ・同一メールで複数ロール（リーダー/幹部/従業員）の profiles を許可
--   ・チームメンバー/プロフィールの閲覧を「自チーム＋本人＋管理者/幹部」に限定
-- 何度実行しても安全（IF EXISTS / 旧ポリシーは新ポリシー作成後に撤去）。
-- =====================================================================

-- 1. profiles: email 単独UNIQUE を撤去し (email, role) で一意化 ---------
--    ※ 実体は uq_profiles_email_ci（lower(email) の関数インデックス）なので
--      制約名の drop だけでは外れない。インデックスも明示的に撤去する。
alter table profiles drop constraint if exists profiles_email_key;
drop index  if exists uq_profiles_email_ci;

alter table profiles drop constraint if exists profiles_email_role_key;
drop index  if exists uq_profiles_email_role_ci;
-- 大文字小文字を区別せず (email, role) で一意（同一メールでも role が違えばOK）
create unique index if not exists uq_profiles_email_role_ci
  on profiles (lower(email), role);

-- 2. profiles: auth_user_id の UNIQUE を撤去（同一人物が複数profileを共有）
alter table profiles drop constraint if exists profiles_auth_user_id_key;
drop index  if exists profiles_auth_user_id_key;

-- 3. team_members: 自チーム＋管理者/幹部のみ閲覧 ------------------------
alter table team_members enable row level security;
-- 先に新ポリシーを作成 → その後で旧・全件閲覧ポリシーを撤去（無防備な瞬間を作らない）
drop policy if exists "tm_select_same_team" on team_members;
create policy "tm_select_same_team" on team_members
  for select to authenticated
  using (
    is_admin_or_exec()
    or team_id in (
      select team_id from team_members
      where profile_id = current_profile_id()
    )
  );
drop policy if exists "tm_read" on team_members;   -- 旧: using(true) 全件閲覧を撤去

-- 4. profiles: 自分＋自チームのメンバー＋管理者/幹部のみ閲覧 ------------
alter table profiles enable row level security;
drop policy if exists "profiles_select_same_team" on profiles;
create policy "profiles_select_same_team" on profiles
  for select to authenticated
  using (
    is_admin_or_exec()
    or id = current_profile_id()   -- 自分自身は常に見える
    or id in (
      select tm.profile_id from team_members tm
      where tm.team_id in (
        select team_id from team_members
        where profile_id = current_profile_id()
      )
    )
  );
drop policy if exists "p_read" on profiles;        -- 旧: using(true) 全件閲覧を撤去

-- 5. 確認クエリ -------------------------------------------------------
select
  (select count(*) from profiles)                                          as total_profiles,
  (select count(*) from team_members)                                      as total_team_members,
  (select count(*) from pg_policies where tablename='team_members')        as tm_policies,
  (select count(*) from pg_policies where tablename='profiles')            as profile_policies;
-- team_members と profiles にポリシーが存在すればOK
