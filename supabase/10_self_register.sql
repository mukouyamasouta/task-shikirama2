-- =====================================================================
-- 10_self_register.sql — 従業員セルフ登録（メール確認不要・即ログイン可）
-- signup画面から anon で呼ぶ。確認済みユーザーを作成し、
-- 09のトリガーが profiles(role=member) を自動作成 → 幹部画面の未所属へ。
-- 実行順: 01〜09 の後にこれを実行
-- =====================================================================

create or replace function vexum_self_register(p_email text, p_password text, p_name text default '')
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  uid uuid;
begin
  if p_email is null or position('@' in p_email) = 0 then
    raise exception 'invalid email';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'password too short';
  end if;
  if exists (select 1 from auth.users where lower(email) = lower(p_email)) then
    raise exception 'already registered';
  end if;

  uid := gen_random_uuid();
  insert into auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', p_email,
    crypt(p_password, gen_salt('bf')), now(),
    now(), now(),
    '{"provider":"email","providers":["email"]}',
    json_build_object('full_name', coalesce(nullif(p_name, ''), 'メンバー')),
    false, '', '', '', ''
  );
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), uid, uid::text,
    json_build_object('sub', uid::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now()
  );
  -- profiles は on_auth_user_created トリガーが自動作成（role=member）
  return uid;
end $$;

grant execute on function vexum_self_register(text, text, text) to anon, authenticated;
