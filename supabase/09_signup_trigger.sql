-- =====================================================================
-- 09_signup_trigger.sql — セルフ新規登録の自動プロフィール作成
-- 従業員が signup 画面で登録 → auth.users 作成 → このトリガーで
-- profiles に role='member' を自動作成（未所属）。既存メールは紐付けのみ。
-- 実行順: 01〜08 の後にこれを実行
-- =====================================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 既存プロフィール（シード等）があれば auth と紐付け
  update profiles
     set auth_user_id = new.id
   where lower(email) = lower(new.email) and auth_user_id is null;

  -- 紐付け対象が無ければ（＝完全新規）メンバーとして作成
  if not found then
    insert into profiles (auth_user_id, full_name, email, role)
    select new.id,
           coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), 'メンバー'),
           new.email,
           'member'
    where not exists (select 1 from profiles where lower(email) = lower(new.email));
  end if;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();
