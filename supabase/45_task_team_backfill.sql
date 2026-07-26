-- =====================================================================
-- 45_task_team_backfill.sql — 自作タスクの team_id 補完
-- 従業員が個人画面で作成したタスクは team_id が NULL のため、
-- RLS(tasks_select_scoped) によりリーダーから閲覧できなかった。
-- 担当者の所属チームで補完し、リーダーの閲覧範囲に入れる。
-- Supabase SQL Editor で1回実行。冪等（team_id is null のみ対象）。
-- =====================================================================

-- 実行前件数（記録用）
select count(*) as before_null_team from tasks where team_id is null;

-- 補完（担当者が複数チームに属する場合は team_id の昇順で1件に決定）
update tasks t
   set team_id = sub.team_id
  from (
    select distinct on (profile_id) profile_id, team_id
      from team_members
     order by profile_id, team_id
  ) sub
 where t.team_id is null
   and sub.profile_id = t.assignee_id;

-- 実行後件数（0 に近づくことを確認。担当者が無所属のタスクは NULL のまま残る）
select count(*) as after_null_team from tasks where team_id is null;

-- 補完結果の確認
select tm.team_id, count(*) as tasks_now_visible
  from tasks t
  join team_members tm on tm.profile_id = t.assignee_id
 where t.source = 'self'
 group by tm.team_id;
