-- =====================================================================
-- 05_seed_auth.sql — ログイン用 Auth ユーザーを自動作成し profiles と紐付け
-- これを実行すると、HTMLに登場する全アカウントでログイン可能になります。
-- 共通デモパスワード: vexum2025
-- （SQL Editor は service_role 権限で動くため auth スキーマへ投入可能）
-- 実行順: 01_schema → 02_seed_core → 03_seed_mandala → 04_seed_activity → 05_seed_auth
-- =====================================================================

do $$
declare
  r   record;
  uid uuid;
begin
  for r in select id, email, full_name from profiles loop
    -- 既に同じメールの Auth ユーザーがあれば再利用、なければ作成
    select id into uid from auth.users where lower(email) = lower(r.email) limit 1;

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
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', r.email,
        crypt('vexum2025', gen_salt('bf')), now(),
        now(), now(),
        '{"provider":"email","providers":["email"]}',
        json_build_object('full_name', r.full_name),
        false, '', '',
        '', ''
      );

      insert into auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), uid, uid::text,
        json_build_object('sub', uid::text, 'email', r.email, 'email_verified', true),
        'email', now(), now(), now()
      );
    end if;

    -- profiles に Auth ユーザーを紐付け
    update profiles set auth_user_id = uid where id = r.id;
  end loop;
end $$;

-- 確認用: 紐付け状況
-- select full_name, email, role, auth_user_id from profiles order by email;
