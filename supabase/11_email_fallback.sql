-- =====================================================================
-- 11_email_fallback.sql — 本人判定をメール一致でもフォールバック
-- auth_user_id の紐付けがズレても、ログイン中のメール(JWT)で
-- プロフィールを本人と認識する。これにより各役職の権限が安定動作。
-- 実行順: 01〜10 の後（CREATE OR REPLACE なので再実行で上書き）
-- =====================================================================

create or replace function current_profile_id() returns uuid
  language sql stable security definer set search_path = public, auth as $$
  select id from profiles
   where auth_user_id = auth.uid()
      or lower(email) = lower(nullif(auth.jwt() ->> 'email', ''))
   order by (auth_user_id = auth.uid()) desc nulls last
   limit 1
$$;

create or replace function is_admin_or_exec() returns boolean
  language sql stable security definer set search_path = public, auth as $$
  select coalesce((
    select role in ('admin','executive')
      from profiles
     where auth_user_id = auth.uid()
        or lower(email) = lower(nullif(auth.jwt() ->> 'email', ''))
     order by (auth_user_id = auth.uid()) desc nulls last
     limit 1
  ), false)
$$;

-- my_led_team_ids() は current_profile_id() を使うため自動的に修正されます
