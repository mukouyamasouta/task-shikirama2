-- =====================================================================
-- VEXUM タスク管理システム — Supabase スキーマ (Design D)
-- 統括画面 / 幹部(管理)画面 / リーダー画面 / 個人画面 の機能を支える
-- 実行順: 01_schema.sql → 02_seed_core.sql → 03_seed_mandala.sql → 04_seed_activity.sql
-- =====================================================================

create extension if not exists "pgcrypto";

-- ===== ENUM =====
do $$ begin
  create type user_role        as enum ('admin','executive','leader','member');
exception when duplicate_object then null; end $$;
do $$ begin
  create type owner_type        as enum ('user','team');
exception when duplicate_object then null; end $$;
do $$ begin
  create type task_priority     as enum ('hi','md','lo','urgent');
exception when duplicate_object then null; end $$;
do $$ begin
  create type task_status       as enum ('todo','wip','done','late');
exception when duplicate_object then null; end $$;
do $$ begin
  create type report_condition  as enum ('great','good','normal','bad','poor');
exception when duplicate_object then null; end $$;
do $$ begin
  create type evaluator_role    as enum ('leader','executive');
exception when duplicate_object then null; end $$;

-- ===== profiles（アカウント） =====
-- auth.users とは auth_user_id で後から紐付ける（シードは auth 無しで投入可能）
create table if not exists profiles (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  full_name    text not null,
  email        text unique not null,
  role         user_role not null default 'member',
  department   text,
  color        text default '#0D9488',
  created_at   timestamptz default now()
);

-- ===== teams（チーム枠） =====
create table if not exists teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  color      text default '#0D9488',
  bg         text default '#CCEDE9',
  leader_id  uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- ===== team_members（所属・達成率） =====
create table if not exists team_members (
  team_id          uuid references teams(id) on delete cascade,
  profile_id       uuid references profiles(id) on delete cascade,
  role_in_team     text not null default 'member',  -- 'leader' | 'member'
  achievement_rate int  default 0,                  -- KPI達成率 %
  joined_at        timestamptz default now(),
  primary key (team_id, profile_id)
);

-- ===== mandala_charts（曼荼羅チャート: 個人/チーム） =====
-- center=KGI, subs=CSF(8項目, jsonb配列), acts=KPI(8x8, jsonb二次元配列)
create table if not exists mandala_charts (
  id            text primary key,                 -- 'team_A','user_nakamura' 等
  owner_type    owner_type not null,
  owner_user_id uuid references profiles(id) on delete cascade,
  owner_team_id uuid references teams(id)    on delete cascade,
  name          text not null,
  scope_label   text,
  period        text,
  start_date    date,
  center        text not null,
  subs          jsonb not null,                   -- ["CSF1",...,"CSF8"]
  acts          jsonb not null,                   -- [["KPI",...x8],...x8]
  color         text default '#0D9488',
  bg            text default '#CCEDE9',
  created_at    timestamptz default now(),
  check (owner_type <> 'user' or owner_user_id is not null),
  check (owner_type <> 'team' or owner_team_id is not null)
);

-- ===== tasks（タスク割当 / 個人の割り当て課題） =====
create table if not exists tasks (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  related_kgi    text,
  category       text,
  assigner_id    uuid references profiles(id),
  assignee_id    uuid references profiles(id),
  team_id        uuid references teams(id),
  source         text,                              -- 'leader' | 'executive'
  start_date     date,
  due_date       date,
  priority       task_priority default 'md',
  progress       int default 0,                     -- 0-100
  status         task_status   default 'todo',
  comment        text,
  completed_date date,                              -- 100%完了→過去履歴
  created_at     timestamptz default now()
);

-- ===== daily_reports（日報） =====
create table if not exists daily_reports (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid references profiles(id) on delete cascade,
  report_date date not null,
  hours       text,
  done        text,
  plan        text,
  issue       text,
  condition   report_condition default 'good',
  created_at  timestamptz default now(),
  unique(author_id, report_date)
);

-- ===== evaluations（KGI・CSFの★5段階＋コメント評価） =====
create table if not exists evaluations (
  id             uuid primary key default gen_random_uuid(),
  target_type    owner_type not null,
  target_user_id uuid references profiles(id) on delete cascade,
  target_team_id uuid references teams(id)    on delete cascade,
  evaluator_id   uuid references profiles(id),
  evaluator_role evaluator_role not null,            -- leader | executive
  chart_id       text references mandala_charts(id),
  period         text,
  kgi_stars      int,
  kgi_comment    text,
  csf            jsonb,                               -- [{"stars":4,"comment":"..."}, ...x8]
  task_eval      jsonb,                               -- 任意: タスク評価
  created_at     timestamptz default now()
);

-- ===== eval_records（評価記録サマリ: リーダー/統括画面の一覧） =====
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

-- ===== インデックス =====
create index if not exists idx_team_members_profile on team_members(profile_id);
create index if not exists idx_tasks_assignee on tasks(assignee_id);
create index if not exists idx_tasks_team     on tasks(team_id);
create index if not exists idx_reports_author on daily_reports(author_id);
create index if not exists idx_eval_target_u  on evaluations(target_user_id);
create index if not exists idx_eval_target_t  on evaluations(target_team_id);
create index if not exists idx_mandala_owner_u on mandala_charts(owner_user_id);
create index if not exists idx_mandala_owner_t on mandala_charts(owner_team_id);

-- =====================================================================
-- ヘルパー関数（RLS用）
-- =====================================================================
create or replace function app_role() returns user_role
  language sql stable security definer set search_path = public as $$
  select role from profiles where auth_user_id = auth.uid()
$$;

create or replace function current_profile_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from profiles where auth_user_id = auth.uid()
$$;

create or replace function is_admin_or_exec() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','executive')
                   from profiles where auth_user_id = auth.uid()), false)
$$;

-- 自分がリーダーを務めるチームID一覧
create or replace function my_led_team_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select id from teams where leader_id = current_profile_id()
$$;

-- =====================================================================
-- RLS（行レベルセキュリティ）
--   閲覧: 認証ユーザーは基本参照可（社内ツール想定）
--   更新: 本人 / リーダー(自チーム) / admin・executive
--   ※ デモ投入は service_role キー（RLSバイパス）で実行してください
-- =====================================================================
alter table profiles       enable row level security;
alter table teams          enable row level security;
alter table team_members   enable row level security;
alter table mandala_charts enable row level security;
alter table tasks          enable row level security;
alter table daily_reports  enable row level security;
alter table evaluations    enable row level security;
alter table eval_records   enable row level security;

-- profiles
create policy "profiles_read"   on profiles for select to authenticated using (true);
create policy "profiles_self_up" on profiles for update to authenticated
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy "profiles_admin_all" on profiles for all to authenticated
  using (is_admin_or_exec()) with check (is_admin_or_exec());

-- teams
create policy "teams_read" on teams for select to authenticated using (true);
create policy "teams_manage" on teams for all to authenticated
  using (is_admin_or_exec() or leader_id = current_profile_id())
  with check (is_admin_or_exec() or leader_id = current_profile_id());

-- team_members
create policy "tm_read" on team_members for select to authenticated using (true);
create policy "tm_manage" on team_members for all to authenticated
  using (is_admin_or_exec() or team_id in (select my_led_team_ids()))
  with check (is_admin_or_exec() or team_id in (select my_led_team_ids()));

-- mandala_charts
create policy "mandala_read" on mandala_charts for select to authenticated using (true);
create policy "mandala_manage" on mandala_charts for all to authenticated
  using (is_admin_or_exec()
         or owner_user_id = current_profile_id()
         or owner_team_id in (select my_led_team_ids()))
  with check (is_admin_or_exec()
         or owner_user_id = current_profile_id()
         or owner_team_id in (select my_led_team_ids()));

-- tasks
create policy "tasks_read" on tasks for select to authenticated
  using (is_admin_or_exec()
         or assignee_id = current_profile_id()
         or assigner_id = current_profile_id()
         or team_id in (select my_led_team_ids()));
create policy "tasks_write" on tasks for all to authenticated
  using (is_admin_or_exec() or assigner_id = current_profile_id()
         or team_id in (select my_led_team_ids())
         or assignee_id = current_profile_id())
  with check (is_admin_or_exec() or assigner_id = current_profile_id()
         or team_id in (select my_led_team_ids())
         or assignee_id = current_profile_id());

-- daily_reports
create policy "reports_read" on daily_reports for select to authenticated
  using (is_admin_or_exec()
         or author_id = current_profile_id()
         or author_id in (select profile_id from team_members
                          where team_id in (select my_led_team_ids())));
create policy "reports_self_write" on daily_reports for all to authenticated
  using (author_id = current_profile_id())
  with check (author_id = current_profile_id());

-- evaluations
create policy "eval_read" on evaluations for select to authenticated
  using (is_admin_or_exec()
         or target_user_id = current_profile_id()
         or evaluator_id   = current_profile_id()
         or target_team_id in (select my_led_team_ids()));
create policy "eval_write" on evaluations for all to authenticated
  using (is_admin_or_exec() or evaluator_id = current_profile_id()
         or target_team_id in (select my_led_team_ids()))
  with check (is_admin_or_exec() or evaluator_id = current_profile_id()
         or target_team_id in (select my_led_team_ids()));

-- eval_records
create policy "rec_read" on eval_records for select to authenticated
  using (is_admin_or_exec() or evaluatee_id = current_profile_id()
         or evaluatee_id in (select profile_id from team_members
                             where team_id in (select my_led_team_ids())));
create policy "rec_write" on eval_records for all to authenticated
  using (is_admin_or_exec()
         or evaluatee_id in (select profile_id from team_members
                             where team_id in (select my_led_team_ids())))
  with check (is_admin_or_exec()
         or evaluatee_id in (select profile_id from team_members
                             where team_id in (select my_led_team_ids())));
