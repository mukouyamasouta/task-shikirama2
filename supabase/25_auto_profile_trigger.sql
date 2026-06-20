-- =====================================================================
-- 25_auto_profile_trigger.sql — auth.users 作成時に profiles を自動作成/紐付け（冪等）
--
-- Supabase SQL Editor に貼り付けて実行してください（再実行安全）。
-- REBUILD.sql に同等の handle_new_user/on_auth_user_created が定義済みですが、
-- 段階適用(20〜23 のみ)でトリガーが入っていない環境向けの保険として単体で再適用します。
--
-- これにより signup.html の自己登録（vexum_self_register が auth.users を作成）後に、
-- profiles 行が必ず作られ auth_user_id がリンクされます（未所属メンバーとして発行）。
--
-- ※ 注意: profiles.role の enum は user_role('admin','executive','leader','member')。
--   従業員のデフォルトは 'member'（'employee' という値は存在しないため使わない）。
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 既存メールのプロフィールがあればリンクのみ（幹部発行で先に profiles を作る運用に対応）
  update profiles
     set auth_user_id = new.id
   where lower(email) = lower(new.email)
     and auth_user_id is null;
  if not found then
    -- 無ければ未所属メンバーとして新規作成
    insert into profiles (auth_user_id, full_name, email, role)
    select new.id,
           coalesce(nullif(new.raw_user_meta_data->>'full_name',''), 'メンバー'),
           new.email,
           'member'
     where not exists (select 1 from profiles where lower(email) = lower(new.email));
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 確認: トリガーと関数が存在するか（どちらも 1 ならOK）
select
  (select count(*) from pg_proc where proname = 'handle_new_user')                         as has_function,
  (select count(*) from pg_trigger where tgname = 'on_auth_user_created')                  as has_trigger;
-- 期待値: 1 / 1
