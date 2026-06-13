-- =====================================================================
-- 17_chart_task_link.sql — チャート⇄タスク連携＋リアルタイム反映（冪等）
--
-- 1) tasks にチャート由来の紐付け列を追加
--    リーダーが受信チャート（chart_sends）の CSF/KPI セルをメンバーへ
--    振り分けたとき、タスクがどのチャートのどのセル由来かを記録する。
--    個人がタスク進捗を書くと web/api.js がこの紐付けを使って
--    chart_sends の該当セル・全体進捗へ自動反映する。
--
-- 2) Supabase Realtime を有効化（tasks / chart_sends）
--    リーダー・幹部・個人画面がリアルタイムで変更を受信して再描画する。
--
-- SQL Editor に貼り付けて1回実行（再実行しても安全）。
-- =====================================================================

-- ========== 1. tasks: チャート由来の紐付け ==========
alter table tasks add column if not exists source_send_id uuid references chart_sends(id) on delete set null;
alter table tasks add column if not exists source_cell  text;   -- 'si-ai'（KPIセル）または 'csf-si'（CSFセル）
alter table tasks add column if not exists source_chart text;   -- チャート表示名（個人画面のチップ表示用）
create index if not exists idx_tasks_source_send on tasks(source_send_id);

-- ========== 2. Realtime 配信の有効化 ==========
do $$
begin
  begin
    alter publication supabase_realtime add table tasks;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table chart_sends;
  exception when duplicate_object then null;
  end;
end $$;

-- ========== 3. 確認クエリ ==========
-- (a) tasks の新列3つ（期待値: 3）
-- (b) Realtime対象テーブル（期待値: 2）
select
  (select count(*) from information_schema.columns
    where table_name='tasks'
      and column_name in ('source_send_id','source_cell','source_chart')) as tasks_link_columns,
  (select count(*) from pg_publication_tables
    where pubname='supabase_realtime'
      and tablename in ('tasks','chart_sends'))                           as realtime_tables;
-- 期待値: 3 / 2
