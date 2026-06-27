-- =====================================================================
-- 32_fix_yamamoto.sql
-- Supabase SQL Editor に貼り付けて1回実行してください
--   ・yamamoto@com のログイン不可を、考えられる原因すべてに対して冪等に修復
--   ・teams の編集/削除を幹部・管理者に許可する RLS
-- 何度実行しても安全。SQL Editor は全権限で動くため anon RLS の影響を受けません。
-- =====================================================================

-- 0. 現状診断（実行結果を確認してください）---------------------------
select 'profiles' as src, id::text, full_name, email, role::text, auth_user_id::text
from profiles where lower(email)='yamamoto@com'
union all
select 'auth.users' as src, id::text, coalesce(raw_user_meta_data->>'full_name',''), email, '', ''
from auth.users where lower(email)='yamamoto@com';

-- CASE A: 論理削除（is_active=false）で消えていた場合は復活（列が無ければ無視）
do $$
begin
  update profiles set is_active=true where lower(email)='yamamoto@com';
exception when undefined_column then null;
end $$;

-- CASE B: auth_user_id が null/不一致 → auth.users とメール一致で再リンク
update profiles p
set auth_user_id = u.id
from auth.users u
where lower(u.email) = lower(p.email)
  and lower(p.email) = 'yamamoto@com'
  and p.auth_user_id is distinct from u.id;

-- CASE D: auth.users は在るが profiles が消えている → プロフィールを再作成
--         （role は不明のため member。必要に応じ画面で権限変更/追加してください）
insert into profiles (full_name, email, role, auth_user_id)
select coalesce(nullif(u.raw_user_meta_data->>'full_name',''), '山本 浩二'),
       u.email, 'member', u.id
from auth.users u
where lower(u.email) = 'yamamoto@com'
  and not exists (select 1 from profiles p where lower(p.email) = lower(u.email))
on conflict do nothing;

-- CASE（補足）: auth.users 自体が無い場合は SQL では確認済ユーザーを作れません。
--   → 幹部画面のアカウント一覧「パスワード再発行」を実行するか、
--     REBUILD.sql の vexum_create_login RPC で login を発行してください。
--     （メール 'yamamoto@com' は TLD が無く Auth の検証で弾かれる可能性があります）

-- teams: 幹部・管理者のみ編集・削除可能にする RLS（チーム編集/削除機能用）
alter table teams enable row level security;
drop policy if exists "teams_exec_write" on teams;
create policy "teams_exec_write" on teams
  for all to authenticated
  using (exists (select 1 from profiles where id=current_profile_id() and role in ('executive','admin')))
  with check (exists (select 1 from profiles where id=current_profile_id() and role in ('executive','admin')));

-- 確認 ---------------------------------------------------------------
select email, role, auth_user_id from profiles where lower(email)='yamamoto@com';
select count(*) as teams_policies from pg_policies where tablename='teams';
