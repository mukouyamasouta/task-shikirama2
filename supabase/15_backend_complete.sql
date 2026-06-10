-- =====================================================================
-- 15_backend_complete.sql — バックエンド完全同期パッチ（既存DB用 / 冪等）
-- 既に REBUILD.sql を実行済みの Supabase プロジェクトに、
-- フロント(web/api.js)が必要とする列・インデックスを不足なく揃えます。
-- SQL Editor に貼り付けて1回実行（再実行しても安全）。
--
-- 新規プロジェクトの場合はこのファイルは不要です（REBUILD.sql に統合済み）。
-- =====================================================================

-- 1) 自己評価の提出フラグ（個人画面: 下書き/提出ステータス）
alter table evaluations
  add column if not exists submitted boolean default false;
create index if not exists idx_evaluations_target_chart
  on evaluations(target_user_id, chart_id);

-- 2) 本人によるKPI編集（個人画面: チャート管理タブ → リーダー画面で可視化）
--    形式: {"si-ai": {"text": "...", "note": "...", "progress": 50}}
alter table mandala_charts
  add column if not exists member_kpi_edits jsonb default '{}'::jsonb;

-- 3) 統括（admin）ログインの復旧
--    REBUILD.sql の最小化で admin アカウントが削除されたため、統括画面に
--    入れるアカウントが存在しない。yamada@com / vexum2025 で再作成（冪等）。
insert into profiles (id, full_name, email, role, department, color)
values ('a0000000-0000-4000-8000-000000000001','山田 太郎','yamada@com','admin','経営企画部','#0D9488')
on conflict (id) do update set role='admin', email=excluded.email;

do $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email)='yamada@com' limit 1;
  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_super_admin,confirmation_token,recovery_token,email_change_token_new,email_change)
    values ('00000000-0000-0000-0000-000000000000',uid,'authenticated','authenticated','yamada@com',crypt('vexum2025',gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}','{"full_name":"山田 太郎"}',false,'','','','');
    insert into auth.identities (id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
    values (gen_random_uuid(),uid,uid::text,json_build_object('sub',uid::text,'email','yamada@com','email_verified',true),'email',now(),now(),now());
  end if;
  update profiles set auth_user_id=uid where lower(email)='yamada@com';
end $$;

-- 4) 確認クエリ（実行後に列が存在することをチェック）
select
  (select count(*) from information_schema.columns
    where table_name='evaluations' and column_name='submitted')      as evaluations_submitted,
  (select count(*) from information_schema.columns
    where table_name='mandala_charts' and column_name='member_kpi_edits') as mandala_member_kpi_edits,
  (select count(*) from information_schema.table_constraints
    where table_name='daily_reports' and constraint_type='UNIQUE')   as daily_reports_unique,
  (select count(*) from profiles p join auth.users u on u.id=p.auth_user_id
    where p.role='admin')                                            as admin_login_ready;
-- 期待値: 1 / 1 / 1 / 1
