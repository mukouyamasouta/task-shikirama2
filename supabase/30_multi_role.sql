-- =====================================================================
-- 30_multi_role.sql — 同一メール複数ロール対応・アカウント論理削除
-- Supabase SQL Editor に貼り付けて1回実行してください
-- 冪等（IF EXISTS / IF NOT EXISTS）。何度実行しても安全。
-- =====================================================================

-- 1. email 単独UNIQUE を撤去し (email, role) で一意化
--    ※ 実体は uq_profiles_email_ci（lower(email) の関数インデックス）なので
--      制約名 drop だけでは外れない。インデックスも明示的に撤去する。
alter table profiles drop constraint if exists profiles_email_key;
drop index  if exists uq_profiles_email_ci;
alter table profiles drop constraint if exists profiles_email_role_key;
drop index  if exists uq_profiles_email_role_ci;
-- 大文字小文字を区別せず (email, role) で一意（同一メールでもロールが違えばOK）
create unique index if not exists uq_profiles_email_role_ci on profiles (lower(email), role);

-- 2. auth_user_id の UNIQUE を撤去（同一人物が複数profileで同じログインを共有）
alter table profiles drop constraint if exists profiles_auth_user_id_key;
drop index  if exists profiles_auth_user_id_key;

-- 3. 論理削除フラグ
alter table profiles add column if not exists is_active boolean default true;

-- 4. 確認
select
  (select count(*) from profiles where is_active is distinct from false)                                        as active_profiles,
  (select count(*) from (select lower(email) e from profiles group by lower(email) having count(*)>1) x)        as multi_role_emails;
