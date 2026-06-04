-- =====================================================================
-- 08_create_login_rpc.sql — 幹部/管理者が発行したアカウントを
-- 「即ログイン可能（確認済み・PW付き）」にする RPC 関数
-- 実行順: 01〜07 の後にこれを実行
-- フロント(幹部画面)のアカウント発行から sb.rpc('vexum_create_login',...) で呼ぶ
-- =====================================================================

create or replace function vexum_create_login(p_email text, p_password text default 'vexum2025')
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  uid uuid;
begin
  -- 管理者・幹部のみ許可
  if not is_admin_or_exec() then
    raise exception 'permission denied: admin/executive only';
  end if;

  select id into uid from auth.users where lower(email) = lower(p_email) limit 1;

  if uid is null then
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
      '{"provider":"email","providers":["email"]}', '{}',
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
  end if;

  -- profiles と紐付け
  update profiles set auth_user_id = uid where lower(email) = lower(p_email);
  return uid;
end $$;

grant execute on function vexum_create_login(text, text) to authenticated;
