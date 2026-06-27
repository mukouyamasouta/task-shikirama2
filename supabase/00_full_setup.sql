-- =====================================================================
-- 00_full_setup.sql — VEXUM 統合セットアップ（全機能・冪等・完全版）
-- 既存の 12〜32番の個別SQLファイルを統合した最終版です。
-- 新規Supabaseプロジェクト・既存プロジェクトどちらでも
-- これ1本を SQL Editor に貼り付けて実行すれば完全な状態になります。
--
-- 設計:
--   * 破壊的操作（drop table / seed削除）は一切行いません（既存データ安全）。
--   * すべて create ... if not exists / add column if not exists /
--     drop policy if exists → create policy / drop constraint if exists で冪等。
--   * profiles は「同一メール複数ロール」対応の最終形 (lower(email),role) で一意。
--   * RLS は移行群の最終状態（profiles/team_membersは自チーム＋本人＋幹部/管理者に限定、
--     tasks/notifications/task_time_logsは横断閲覧を維持しつつ本人ポリシーも併設）。
--   * アカウント(seed)・ログイン作成は本ファイルに含めません
--     （新規運用は signup / 幹部発行(vexum_create_login) / REBUILD.sql を使用）。
-- =====================================================================

create extension if not exists "pgcrypto";

-- ========== ENUM 型（無ければ作成） ==========
do $$ begin create type user_role        as enum ('admin','executive','leader','member'); exception when duplicate_object then null; end $$;
do $$ begin create type owner_type       as enum ('user','team'); exception when duplicate_object then null; end $$;
do $$ begin create type task_priority    as enum ('hi','md','lo','urgent'); exception when duplicate_object then null; end $$;
do $$ begin create type task_status      as enum ('todo','wip','done','late'); exception when duplicate_object then null; end $$;
do $$ begin create type report_condition as enum ('great','good','normal','bad','poor'); exception when duplicate_object then null; end $$;
do $$ begin create type evaluator_role   as enum ('leader','executive'); exception when duplicate_object then null; end $$;

-- ========== A. profiles（基本＋複数ロール対応） ==========
-- 新規DB向けに最終形で作成（email/auth_user_id に単独UNIQUEは付けない）。
create table if not exists profiles (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  full_name    text not null,
  email        text not null,
  role         user_role not null default 'member',
  department   text,
  color        text default '#0D9488',
  is_active    boolean default true,
  created_at   timestamptz default now()
);
-- 既存DB向け: 後付け列
alter table profiles add column if not exists department text;
alter table profiles add column if not exists color      text default '#0D9488';
alter table profiles add column if not exists is_active  boolean default true;
-- 制約の最終形: email 単独UNIQUE / auth_user_id UNIQUE を撤去し (lower(email), role) で一意化
alter table profiles drop constraint if exists profiles_email_key;
alter table profiles drop constraint if exists profiles_email_role_key;
alter table profiles drop constraint if exists profiles_auth_user_id_key;
drop index if exists uq_profiles_email_ci;          -- 旧: lower(email) 単独一意
drop index if exists profiles_auth_user_id_key;
drop index if exists uq_profiles_email_role_ci;
create unique index if not exists uq_profiles_email_role_ci on profiles (lower(email), role);

-- ========== B. teams / team_members ==========
create table if not exists teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  color      text default '#0D9488',
  bg         text default '#CCEDE9',
  leader_id  uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);
create table if not exists team_members (
  team_id          uuid references teams(id)    on delete cascade,
  profile_id       uuid references profiles(id) on delete cascade,
  role_in_team     text not null default 'member',
  achievement_rate int  default 0,
  joined_at        timestamptz default now(),
  primary key (team_id, profile_id)
);

-- ========== C. tasks（工数・完了・チャート紐付け・期間） ==========
create table if not exists tasks (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  related_kgi    text,
  category       text,
  assigner_id    uuid references profiles(id) on delete set null,
  assignee_id    uuid references profiles(id) on delete cascade,
  team_id        uuid references teams(id)    on delete set null,
  source         text,
  start_date     date,
  due_date       date,
  priority       task_priority default 'md',
  progress       int default 0,
  status         task_status   default 'todo',
  comment        text,
  completed_date date,
  planned_hours  numeric(6,1),
  total_hours    numeric(7,1) default 0,
  completed_at   timestamptz,
  period         text,
  source_send_id uuid,
  source_cell    text,
  source_chart   text,
  created_at     timestamptz default now()
);
-- 既存DB向け後付け列
alter table tasks add column if not exists planned_hours  numeric(6,1);
alter table tasks add column if not exists total_hours    numeric(7,1) default 0;
alter table tasks add column if not exists completed_at   timestamptz;
alter table tasks add column if not exists period         text;
alter table tasks add column if not exists source_send_id uuid;
alter table tasks add column if not exists source_cell    text;
alter table tasks add column if not exists source_chart   text;

-- ========== D. mandala_charts（編集保存・期間設定） ==========
create table if not exists mandala_charts (
  id            text primary key,
  owner_type    owner_type not null,
  owner_user_id uuid references profiles(id) on delete cascade,
  owner_team_id uuid references teams(id)    on delete cascade,
  name          text not null,
  scope_label   text,
  period        text,
  start_date    date,
  end_date      date,
  center        text not null,
  subs          jsonb not null,
  acts          jsonb not null,
  color         text default '#0D9488',
  bg            text default '#CCEDE9',
  member_kpi_edits jsonb default '{}'::jsonb,
  created_at    timestamptz default now()
);
alter table mandala_charts add column if not exists member_kpi_edits jsonb default '{}'::jsonb;
alter table mandala_charts add column if not exists period      text;
alter table mandala_charts add column if not exists scope_label text;
alter table mandala_charts add column if not exists start_date  date;
alter table mandala_charts add column if not exists end_date    date;

-- ========== E. daily_reports（始業/終業） ==========
create table if not exists daily_reports (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid references profiles(id) on delete cascade,
  report_date date not null,
  hours       text,
  done        text,
  plan        text,
  issue       text,
  condition   report_condition default 'normal',
  plan_tasks   text,
  plan_hours   text,
  goal         text,
  actual_hours numeric(5,1),
  submitted_at timestamptz,
  created_at  timestamptz default now(),
  unique (author_id, report_date)
);
alter table daily_reports add column if not exists plan_tasks   text;
alter table daily_reports add column if not exists plan_hours   text;
alter table daily_reports add column if not exists goal         text;
alter table daily_reports add column if not exists actual_hours numeric(5,1);
alter table daily_reports add column if not exists submitted_at timestamptz;

-- ========== F. evaluations（自己評価・リーダー評価・幹部コメント） ==========
create table if not exists evaluations (
  id             uuid primary key default gen_random_uuid(),
  target_type    owner_type not null,
  target_user_id uuid references profiles(id) on delete cascade,
  target_team_id uuid references teams(id)    on delete cascade,
  evaluator_id   uuid references profiles(id) on delete set null,
  evaluator_role evaluator_role not null,
  chart_id       text references mandala_charts(id) on delete set null,
  period         text,
  kgi_stars      int,
  kgi_comment    text,
  csf            jsonb,
  task_eval      jsonb,
  submitted      boolean default false,
  exec_comment   text,
  exec_commented_at timestamptz,
  created_at     timestamptz default now()
);
alter table evaluations add column if not exists submitted boolean default false;
alter table evaluations add column if not exists exec_comment text;
alter table evaluations add column if not exists exec_commented_at timestamptz;
create index if not exists idx_evaluations_target_chart on evaluations(target_user_id, chart_id);

create table if not exists eval_records (
  id             uuid primary key default gen_random_uuid(),
  evaluatee_id   uuid references profiles(id) on delete cascade,
  evaluatee_name text,
  evaluator_name text,
  period         text,
  kgi            numeric,
  csf_avg        numeric,
  task_avg       numeric,
  comment        text,
  status         text default 'done',
  created_at     timestamptz default now()
);

-- chart_templates / chart_sends（幹部のテンプレート・チャート送信）
create table if not exists chart_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  center     text default '',
  subs       jsonb not null default '[]'::jsonb,
  acts       jsonb not null default '[]'::jsonb,
  color      text default '#0D9488',
  bg         text default '#CCEDE9',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);
create table if not exists chart_sends (
  id            uuid primary key default gen_random_uuid(),
  title         text,
  center        text default '',
  subs          jsonb not null default '[]'::jsonb,
  acts          jsonb not null default '[]'::jsonb,
  to_team       text,
  to_profile_id uuid references profiles(id) on delete set null,
  to_name       text,
  status        text default 'sent',
  progress      int  default 0,
  cell_status   jsonb default '{}'::jsonb,
  edited_by     jsonb default '{}'::jsonb,
  sent_by       uuid references profiles(id) on delete set null,
  sent_by_name  text,
  start_date    date,
  end_date      date,
  csf_periods   jsonb default '{}'::jsonb,
  sent_at       timestamptz default now(),
  updated_at    timestamptz default now()
);
alter table chart_sends add column if not exists start_date  date;
alter table chart_sends add column if not exists end_date    date;
alter table chart_sends add column if not exists csf_periods jsonb default '{}'::jsonb;

-- ========== G. task_time_logs ==========
create table if not exists task_time_logs (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references tasks(id) on delete cascade,
  user_id       uuid references profiles(id) on delete set null,
  log_date      date not null default current_date,
  hours         numeric(5,1) not null default 0,
  progress_after int,
  note          text,
  created_at    timestamptz default now()
);

-- ========== H. notifications ==========
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  to_user_id  uuid references profiles(id) on delete cascade,
  to_team_id  uuid references teams(id)    on delete cascade,
  type        text not null,
  title       text,
  body        text,
  actor_id    uuid references profiles(id) on delete set null,
  actor_name  text,
  ref_id      uuid,
  read        boolean default false,
  created_at  timestamptz default now()
);

-- ========== ヘルパー関数（本人判定・権限判定。RLSが依存） ==========
create or replace function current_profile_id() returns uuid
  language sql stable security definer set search_path = public, auth as $$
  select id from profiles
   where auth_user_id = auth.uid()
      or lower(email) = lower(nullif(auth.jwt() ->> 'email',''))
   order by (auth_user_id = auth.uid()) desc nulls last
   limit 1
$$;
create or replace function is_admin_or_exec() returns boolean
  language sql stable security definer set search_path = public, auth as $$
  select coalesce((
    select role in ('admin','executive') from profiles
     where auth_user_id = auth.uid()
        or lower(email) = lower(nullif(auth.jwt() ->> 'email',''))
     order by (auth_user_id = auth.uid()) desc nulls last limit 1
  ), false)
$$;
create or replace function my_led_team_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select id from teams where leader_id = current_profile_id()
$$;
create or replace function my_team_member_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select tm.profile_id from team_members tm
   where tm.team_id in (select id from teams where leader_id = current_profile_id())
$$;

-- ========== RPC / トリガー（ログイン発行・セルフ登録・自動プロフィール） ==========
create or replace function vexum_create_login(p_email text, p_password text default 'vexum2025')
returns uuid language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid;
begin
  if not is_admin_or_exec() then raise exception 'permission denied: admin/executive only'; end if;
  select id into uid from auth.users where lower(email)=lower(p_email) limit 1;
  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_super_admin,confirmation_token,recovery_token,email_change_token_new,email_change)
    values ('00000000-0000-0000-0000-000000000000',uid,'authenticated','authenticated',p_email,crypt(p_password,gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}','{}',false,'','','','');
    insert into auth.identities (id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
    values (gen_random_uuid(),uid,uid::text,json_build_object('sub',uid::text,'email',p_email,'email_verified',true),'email',now(),now(),now());
  else
    update auth.users set encrypted_password=crypt(p_password,gen_salt('bf')), email_confirmed_at=coalesce(email_confirmed_at,now()), updated_at=now() where id=uid;
    if not exists (select 1 from auth.identities where user_id=uid and provider='email') then
      insert into auth.identities (id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
      values (gen_random_uuid(),uid,uid::text,json_build_object('sub',uid::text,'email',p_email,'email_verified',true),'email',now(),now(),now());
    end if;
  end if;
  update profiles set auth_user_id=uid where lower(email)=lower(p_email);
  return uid;
end $$;
grant execute on function vexum_create_login(text,text) to authenticated;

create or replace function vexum_self_register(p_email text, p_password text, p_name text default '')
returns uuid language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid;
begin
  if p_email is null or position('@' in p_email)=0 then raise exception 'invalid email'; end if;
  if length(coalesce(p_password,''))<6 then raise exception 'password too short'; end if;
  if exists (select 1 from auth.users where lower(email)=lower(p_email)) then raise exception 'already registered'; end if;
  uid := gen_random_uuid();
  insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_super_admin,confirmation_token,recovery_token,email_change_token_new,email_change)
  values ('00000000-0000-0000-0000-000000000000',uid,'authenticated','authenticated',p_email,crypt(p_password,gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}',json_build_object('full_name',coalesce(nullif(p_name,''),'メンバー')),false,'','','','');
  insert into auth.identities (id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
  values (gen_random_uuid(),uid,uid::text,json_build_object('sub',uid::text,'email',p_email,'email_verified',true),'email',now(),now(),now());
  return uid;
end $$;
grant execute on function vexum_self_register(text,text,text) to anon, authenticated;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set auth_user_id=new.id where lower(email)=lower(new.email) and auth_user_id is null;
  if not found then
    insert into profiles (auth_user_id, full_name, email, role)
    select new.id, coalesce(nullif(new.raw_user_meta_data->>'full_name',''),'メンバー'), new.email, 'member'
    where not exists (select 1 from profiles where lower(email)=lower(new.email));
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- ========== I. RLS ポリシー（全テーブル最終版を一括設定） ==========
alter table profiles        enable row level security;
alter table teams           enable row level security;
alter table team_members    enable row level security;
alter table mandala_charts  enable row level security;
alter table tasks           enable row level security;
alter table daily_reports   enable row level security;
alter table evaluations     enable row level security;
alter table eval_records    enable row level security;
alter table chart_templates enable row level security;
alter table chart_sends     enable row level security;
alter table task_time_logs  enable row level security;
alter table notifications   enable row level security;

-- profiles: 自分＋自チーム＋管理者/幹部のみ閲覧（旧 p_read=全件 は撤去）
drop policy if exists "p_read" on profiles;
drop policy if exists "profiles_select_same_team" on profiles;
create policy "profiles_select_same_team" on profiles for select to authenticated
  using (
    is_admin_or_exec() or id = current_profile_id()
    or id in (select tm.profile_id from team_members tm
              where tm.team_id in (select team_id from team_members where profile_id = current_profile_id()))
  );
drop policy if exists "p_admin" on profiles;
create policy "p_admin" on profiles for all to authenticated
  using (is_admin_or_exec()) with check (is_admin_or_exec());
drop policy if exists "p_self" on profiles;
create policy "p_self" on profiles for update to authenticated
  using (id = current_profile_id()) with check (id = current_profile_id());
drop policy if exists "profiles_exec_update" on profiles;
create policy "profiles_exec_update" on profiles for update to authenticated
  using (exists (select 1 from profiles p2 where p2.id=current_profile_id() and p2.role in ('executive','admin')))
  with check (exists (select 1 from profiles p2 where p2.id=current_profile_id() and p2.role in ('executive','admin')));
drop policy if exists "p_leader_create_member" on profiles;
create policy "p_leader_create_member" on profiles for insert to authenticated
  with check (role = 'member' and current_profile_id() in (select leader_id from teams));

-- teams: 参照は全認証 / 編集は管理者・幹部・自チームのリーダー（＋幹部明示）
drop policy if exists "t_read" on teams;
create policy "t_read" on teams for select to authenticated using (true);
drop policy if exists "t_manage" on teams;
create policy "t_manage" on teams for all to authenticated
  using (is_admin_or_exec() or leader_id = current_profile_id())
  with check (is_admin_or_exec() or leader_id = current_profile_id());
drop policy if exists "teams_exec_write" on teams;
create policy "teams_exec_write" on teams for all to authenticated
  using (exists (select 1 from profiles where id=current_profile_id() and role in ('executive','admin')))
  with check (exists (select 1 from profiles where id=current_profile_id() and role in ('executive','admin')));

-- team_members: 自チーム＋管理者/幹部のみ閲覧（旧 tm_read=全件 は撤去）/ 編集は幹部・自チームリーダー
drop policy if exists "tm_read" on team_members;
drop policy if exists "tm_select_same_team" on team_members;
create policy "tm_select_same_team" on team_members for select to authenticated
  using (is_admin_or_exec() or team_id in (select team_id from team_members where profile_id = current_profile_id()));
drop policy if exists "tm_manage" on team_members;
create policy "tm_manage" on team_members for all to authenticated
  using (is_admin_or_exec() or team_id in (select my_led_team_ids()))
  with check (is_admin_or_exec() or team_id in (select my_led_team_ids()));
drop policy if exists "tm_exec_write" on team_members;
create policy "tm_exec_write" on team_members for all to authenticated
  using (exists (select 1 from profiles where id=current_profile_id() and role in ('executive','admin')))
  with check (exists (select 1 from profiles where id=current_profile_id() and role in ('executive','admin')));

-- mandala_charts: 参照は全認証 / 編集は管理者・幹部・本人・自チームのリーダー/メンバー
drop policy if exists "mc_read" on mandala_charts;
create policy "mc_read" on mandala_charts for select to authenticated using (true);
drop policy if exists "mc_manage" on mandala_charts;
create policy "mc_manage" on mandala_charts for all to authenticated
  using (is_admin_or_exec() or owner_user_id = current_profile_id()
         or owner_team_id in (select my_led_team_ids()) or owner_user_id in (select my_team_member_ids()))
  with check (is_admin_or_exec() or owner_user_id = current_profile_id()
         or owner_team_id in (select my_led_team_ids()) or owner_user_id in (select my_team_member_ids()));

-- tasks: 参照は全認証（横断表示維持）＋本人ポリシー / 編集・削除は本人・依頼者・自チームリーダー・幹部
drop policy if exists "tk_read" on tasks;
create policy "tk_read" on tasks for select to authenticated using (true);
drop policy if exists "tasks_select_own" on tasks;
create policy "tasks_select_own" on tasks for select to authenticated
  using (is_admin_or_exec() or assignee_id = current_profile_id()
         or team_id in (select team_id from team_members where profile_id = current_profile_id()));
drop policy if exists "tk_write" on tasks;
create policy "tk_write" on tasks for all to authenticated
  using (is_admin_or_exec() or assigner_id = current_profile_id()
         or assignee_id = current_profile_id() or team_id in (select my_led_team_ids()))
  with check (is_admin_or_exec() or assigner_id = current_profile_id()
         or assignee_id = current_profile_id() or team_id in (select my_led_team_ids()));
drop policy if exists "tk_delete" on tasks;
create policy "tk_delete" on tasks for delete to authenticated
  using (is_admin_or_exec() or assigner_id = current_profile_id()
         or assignee_id = current_profile_id() or team_id in (select my_led_team_ids()));

-- daily_reports: 本人 / 管理者・幹部 / 自チームのリーダー
drop policy if exists "dr_read" on daily_reports;
create policy "dr_read" on daily_reports for select to authenticated using (true);
drop policy if exists "dr_write" on daily_reports;
create policy "dr_write" on daily_reports for all to authenticated
  using (author_id = current_profile_id() or is_admin_or_exec() or author_id in (select my_team_member_ids()))
  with check (author_id = current_profile_id() or is_admin_or_exec() or author_id in (select my_team_member_ids()));

-- evaluations: 参照は全認証 / 編集は管理者・幹部・評価者本人・自チームのリーダー
drop policy if exists "ev_read" on evaluations;
create policy "ev_read" on evaluations for select to authenticated using (true);
drop policy if exists "ev_write" on evaluations;
create policy "ev_write" on evaluations for all to authenticated
  using (is_admin_or_exec() or evaluator_id = current_profile_id() or target_user_id in (select my_team_member_ids()))
  with check (is_admin_or_exec() or evaluator_id = current_profile_id() or target_user_id in (select my_team_member_ids()));

-- eval_records: 参照は全認証 / 編集は管理者・幹部・リーダー
drop policy if exists "er_read" on eval_records;
create policy "er_read" on eval_records for select to authenticated using (true);
drop policy if exists "er_write" on eval_records;
create policy "er_write" on eval_records for all to authenticated
  using (is_admin_or_exec() or current_profile_id() in (select leader_id from teams))
  with check (is_admin_or_exec() or current_profile_id() in (select leader_id from teams));

-- chart_templates: 参照は全認証 / 編集は管理者・幹部
drop policy if exists "ct_read" on chart_templates;
create policy "ct_read" on chart_templates for select to authenticated using (true);
drop policy if exists "ct_manage" on chart_templates;
create policy "ct_manage" on chart_templates for all to authenticated
  using (is_admin_or_exec()) with check (is_admin_or_exec());

-- chart_sends: 参照は全認証 / 作成・削除は管理者・幹部 / 進捗更新は全員
drop policy if exists "cs_read" on chart_sends;
create policy "cs_read" on chart_sends for select to authenticated using (true);
drop policy if exists "cs_insert" on chart_sends;
create policy "cs_insert" on chart_sends for insert to authenticated with check (is_admin_or_exec());
drop policy if exists "cs_update" on chart_sends;
create policy "cs_update" on chart_sends for update to authenticated using (true) with check (true);
drop policy if exists "cs_delete" on chart_sends;
create policy "cs_delete" on chart_sends for delete to authenticated using (is_admin_or_exec());

-- task_time_logs: 横断参照＋本人ポリシー / 書込は全認証
drop policy if exists "ttl_read" on task_time_logs;
create policy "ttl_read" on task_time_logs for select to authenticated using (true);
drop policy if exists "ttl_select_own" on task_time_logs;
create policy "ttl_select_own" on task_time_logs for select to authenticated
  using (is_admin_or_exec() or user_id = current_profile_id()
         or task_id in (select id from tasks where team_id in (select team_id from team_members where profile_id = current_profile_id())));
drop policy if exists "ttl_write" on task_time_logs;
create policy "ttl_write" on task_time_logs for all to authenticated using (true) with check (true);

-- notifications: 横断参照＋本人ポリシー / 書込は全認証
drop policy if exists "ntf_read" on notifications;
create policy "ntf_read" on notifications for select to authenticated using (true);
drop policy if exists "ntf_select_own" on notifications;
create policy "ntf_select_own" on notifications for select to authenticated
  using (is_admin_or_exec() or to_user_id = current_profile_id()
         or to_team_id in (select team_id from team_members where profile_id = current_profile_id()));
drop policy if exists "ntf_write" on notifications;
create policy "ntf_write" on notifications for all to authenticated using (true) with check (true);

-- ========== J. インデックス（同時アクセス最適化） ==========
create index if not exists idx_tasks_source_send on tasks(source_send_id);
create index if not exists idx_tasks_period      on tasks(period);
create index if not exists idx_tasks_assignee    on tasks(assignee_id);
create index if not exists idx_tasks_team        on tasks(team_id);
create index if not exists idx_tasks_status      on tasks(status);
create index if not exists idx_mc_owner_user     on mandala_charts(owner_user_id);
create index if not exists idx_mc_owner_team     on mandala_charts(owner_team_id);
create index if not exists idx_dr_author_date    on daily_reports(author_id, report_date);
create index if not exists idx_tm_profile        on team_members(profile_id);
create index if not exists idx_tm_team           on team_members(team_id);
create index if not exists idx_ttl_task          on task_time_logs(task_id);
create index if not exists idx_ttl_user_date     on task_time_logs(user_id, log_date);
create index if not exists idx_notif_to_user     on notifications(to_user_id, read, created_at);
create index if not exists idx_notif_to_team     on notifications(to_team_id, read, created_at);

-- ========== K. profiles ⇄ auth.users 再リンク（リンク切れ救済・冪等） ==========
update profiles p
   set auth_user_id = u.id
  from auth.users u
 where lower(u.email) = lower(p.email)
   and p.auth_user_id is distinct from u.id;

-- ========== L. Realtime publication（重複なく追加） ==========
do $$
begin
  begin alter publication supabase_realtime add table tasks;          exception when others then null; end;
  begin alter publication supabase_realtime add table chart_sends;    exception when others then null; end;
  begin alter publication supabase_realtime add table task_time_logs; exception when others then null; end;
  begin alter publication supabase_realtime add table notifications;  exception when others then null; end;
  begin alter publication supabase_realtime add table mandala_charts; exception when others then null; end;
end $$;

-- ========== M. 確認クエリ（全項目が期待値になればOK） ==========
select
  (select count(*) from information_schema.tables  where table_name='teams')                                          as has_teams,
  (select count(*) from information_schema.tables  where table_name='task_time_logs')                                 as has_time_logs,
  (select count(*) from information_schema.tables  where table_name='notifications')                                  as has_notifications,
  (select count(*) from information_schema.columns where table_name='profiles' and column_name='is_active')           as profiles_is_active,
  (select count(*) from information_schema.columns where table_name='mandala_charts' and column_name='member_kpi_edits') as mc_member_kpi_edits,
  (select count(*) from information_schema.columns where table_name='tasks' and column_name='total_hours')            as tasks_total_hours,
  (select count(*) from information_schema.columns where table_name='evaluations' and column_name='exec_comment')     as eval_exec_comment,
  (select count(*) from pg_policies where tablename='teams')                                                          as teams_policies,
  (select count(*) from pg_policies where tablename='profiles')                                                       as profiles_policies,
  (select count(*) from profiles where auth_user_id is null)                                                          as unlinked_profiles;
-- 期待値: has_* と *_columns / policies は全て1以上、unlinked_profiles は 0 が理想
