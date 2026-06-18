-- =====================================================================
-- 20_setup_all.sql — 全機能の永続化に必要な列・テーブルを一括用意（冪等・完全版）
--
-- これ1本で 40名運用に必要な保存先がすべて揃います。
-- 既存DB（REBUILD.sql 実行済み）に対し、SQL Editor へ貼り付けて1回実行。
-- 各文は独立した add column if not exists / create table if not exists なので、
-- 途中でエラーになっても他の文は適用されます（部分失敗で全滅しません）。
--
-- ※ これまでの 12〜19 を内包します。これ1本でOK。
-- =====================================================================

-- ========== A. mandala_charts: 本人のKGI/CSF/KPI編集の保存先 ==========
alter table mandala_charts add column if not exists member_kpi_edits jsonb default '{}'::jsonb;
alter table mandala_charts add column if not exists period       text;
alter table mandala_charts add column if not exists scope_label  text;
alter table mandala_charts add column if not exists start_date   date;

-- ========== B. tasks: 工数・完了・期間・チャート紐付け ==========
alter table tasks add column if not exists planned_hours  numeric(6,1);
alter table tasks add column if not exists total_hours    numeric(7,1) default 0;
alter table tasks add column if not exists completed_at   timestamptz;
alter table tasks add column if not exists period         text;
alter table tasks add column if not exists source_send_id uuid;
alter table tasks add column if not exists source_cell    text;
alter table tasks add column if not exists source_chart   text;

-- ========== C. daily_reports: 始業(予定)/終業(実績) ==========
alter table daily_reports add column if not exists plan_tasks   text;
alter table daily_reports add column if not exists plan_hours   text;  -- 出退勤の予定 "09:00~18:00"
alter table daily_reports add column if not exists goal         text;  -- 出退勤の実績 "09:05~19:30"
alter table daily_reports add column if not exists actual_hours numeric(5,1);
alter table daily_reports add column if not exists submitted_at timestamptz;

-- ========== D. evaluations: 自己評価の提出フラグ ==========
alter table evaluations add column if not exists submitted boolean default false;

-- ========== E. task_time_logs（日別の作業時間） ==========
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
create index if not exists idx_ttl_task on task_time_logs(task_id);
create index if not exists idx_ttl_user_date on task_time_logs(user_id, log_date);

-- ========== F. notifications（完了/遅延/日報提出/チャート更新） ==========
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
create index if not exists idx_notif_to_user on notifications(to_user_id, read, created_at);
create index if not exists idx_notif_to_team on notifications(to_team_id, read, created_at);

-- ========== G. RLS（task_time_logs / notifications を認証ユーザーに開放） ==========
alter table task_time_logs enable row level security;
alter table notifications  enable row level security;
do $$ begin create policy "ttl_read"  on task_time_logs for select to authenticated using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "ttl_write" on task_time_logs for all    to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "ntf_read"  on notifications  for select to authenticated using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "ntf_write" on notifications  for all    to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;

-- ========== H. Realtime 配信（任意・リアルタイム反映用） ==========
do $$
begin
  begin alter publication supabase_realtime add table tasks;           exception when others then null; end;
  begin alter publication supabase_realtime add table chart_sends;     exception when others then null; end;
  begin alter publication supabase_realtime add table task_time_logs;  exception when others then null; end;
  begin alter publication supabase_realtime add table notifications;   exception when others then null; end;
  begin alter publication supabase_realtime add table mandala_charts;  exception when others then null; end;
end $$;

-- ========== I. 確認クエリ（すべて 1 以上ならOK） ==========
select
  (select count(*) from information_schema.columns where table_name='mandala_charts' and column_name='member_kpi_edits') as mc_member_kpi_edits,
  (select count(*) from information_schema.columns where table_name='tasks' and column_name='total_hours')             as tasks_total_hours,
  (select count(*) from information_schema.columns where table_name='tasks' and column_name='period')                  as tasks_period,
  (select count(*) from information_schema.columns where table_name='daily_reports' and column_name='plan_tasks')      as dr_plan_tasks,
  (select count(*) from information_schema.tables  where table_name='task_time_logs')                                  as has_time_logs,
  (select count(*) from information_schema.tables  where table_name='notifications')                                   as has_notifications;
-- 期待値: 1 / 1 / 1 / 1 / 1 / 1
