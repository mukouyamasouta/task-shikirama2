-- =====================================================================
-- 13_change_exec_email.sql — 幹部アカウント(山本)のメールを yamamoto@com に統一
-- 旧: ログイン用 auth=muko577628@icloud.com / プロフィール email=yamada@com
-- 新: ログイン用 auth=yamamoto@com         / プロフィール email=yamamoto@com
-- パスワードは変更しません（vexum2025 のまま）。
-- 実行は1回でOK。
-- =====================================================================

-- 1) auth.users の email を yamamoto@com に
update auth.users
   set email = 'yamamoto@com',
       email_change = '',
       email_change_token_new = '',
       email_change_confirm_status = 0,
       updated_at = now()
 where email = 'muko577628@icloud.com';

-- 2) auth.identities の identity_data も同期
update auth.identities
   set identity_data = jsonb_set(
         coalesce(identity_data, '{}'::jsonb),
         '{email}',
         to_jsonb('yamamoto@com'::text)
       ),
       updated_at = now()
 where provider = 'email'
   and (identity_data->>'email') = 'muko577628@icloud.com';

-- 3) profiles の email を yamamoto@com に
update profiles
   set email = 'yamamoto@com'
 where role = 'executive'
    or email in ('yamada@com','muko577628@icloud.com');

-- 確認
-- select id, full_name, email, role from profiles where role='executive';
-- select id, email from auth.users where email like '%yamamoto%';
