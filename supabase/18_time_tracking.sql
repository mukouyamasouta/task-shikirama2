-- =====================================================================
-- 18_time_tracking.sql — 工数管理・タスク完了・通知・日報拡張（冪等）
--
-- 「タスクに今日は何時間かかった→何%まで進んだ」を毎日記録し、
-- 100%完了時に合計時間を集計してタスク履歴に残す。完了/遅延/日報提出は
-- リーダーへ通知する。日報は始業(計画)/終業(実績)に対応する。
--
-- SQL Editor に貼り付けて1回実行（再実行しても安全）。
-- =====================================================================

-- ========== 1. tasks: 工数・完了情報 ==========
alter table tasks add column if not exists planned_hours numeric(6,1);          -- 予定工数(h)
alter table tasks add column if not exists total_hours   numeric(7,1) default 0; -- 実績合計工数(h)
alter table tasks add column if not exists completed_at  timestamptz;            -- 完了日時

-- ========== 2. task_time_logs: 日別の作業時間＋その日到達した進捗 ==========
create table if not exists task_time_logs (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references tasks(id) on delete cascade,
  user_id       uuid references profiles(id) on delete set null,
  log_date      date not null default current_date,
  hours         numeric(5,1) not null default 0,   -- その日かけた時間
  progress_after int,                               -- その日終了時点の進捗%
  note          text,
  created_at    timestamptz default now()
);
create index if not exists idx_ttl_task on task_time_logs(task_id);
create index if not exists idx_ttl_user_date on task_time_logs(user_id, log_date);

-- ========== 3. notifications: 完了/遅延/日報提出をリーダー等へ ==========
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  to_user_id  uuid references profiles(id) on delete cascade,   -- 宛先（リーダー等）
  to_team_id  uuid references teams(id)    on delete cascade,   -- 宛先チーム（任意）
  type        text not null,                 -- 'task_done' | 'task_late' | 'report_submitted'
  title       text,
  body        text,
  actor_id    uuid references profiles(id) on delete set null,  -- 発生させた人（本人）
  actor_name  text,
  ref_id      uuid,                          -- 関連タスク/日報ID
  read        boolean default false,
  created_at  timestamptz default now()
);
create index if not exists idx_notif_to_user on notifications(to_user_id, read, created_at);
create index if not exists idx_notif_to_team on notifications(to_team_id, read, created_at);

-- ========== 4. daily_reports: 始業(計画)/終業(実績)の拡張 ==========
alter table daily_reports add column if not exists plan_tasks   text;  -- 本日の業務内容（始業）
alter table daily_reports add column if not exists plan_hours   text;  -- 業務ごとの予定時間（始業）
alter table daily_reports add column if not exists goal         text;  -- 本日の目標/朝礼（始業）
alter table daily_reports add column if not exists actual_hours numeric(5,1); -- 実作業時間合計（終業）
alter table daily_reports add column if not exists submitted_at timestamptz;  -- 終業提出時刻

-- ========== 5. RLS ==========
alter table task_time_logs enable row level security;
alter table notifications  enable row level security;

-- 閲覧: 認証ユーザー（チーム内可視。簡潔にauthenticated全件readとし、画面側で絞る）
do $$ begin
  create policy "ttl_read"  on task_time_logs for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "ttl_write" on task_time_logs for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "ntf_read"  on notifications for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "ntf_write" on notifications for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- ========== 6. Realtime ==========
do $$
begin
  begin alter publication supabase_realtime add table task_time_logs; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table notifications;  exception when duplicate_object then null; end;
end $$;

-- ========== 7. 確認クエリ ==========
-- (a) tasks 新列(3) / (b) task_time_logs 存在(1) / (c) notifications 存在(1)
-- (d) daily_reports 新列(5) / (e) Realtime対象(2)
select
  (select count(*) from information_schema.columns where table_name='tasks'
     and column_name in ('planned_hours','total_hours','completed_at'))            as tasks_cols,
  (select count(*) from information_schema.tables  where table_name='task_time_logs') as has_time_logs,
  (select count(*) from information_schema.tables  where table_name='notifications')  as has_notifications,
  (select count(*) from information_schema.columns where table_name='daily_reports'
     and column_name in ('plan_tasks','plan_hours','goal','actual_hours','submitted_at')) as dr_cols,
  (select count(*) from pg_publication_tables where pubname='supabase_realtime'
     and tablename in ('task_time_logs','notifications'))                            as realtime_tables;
-- 期待値: 3 / 1 / 1 / 5 / 2
