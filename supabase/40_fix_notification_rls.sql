-- ========================================================
-- 40_fix_notification_rls.sql
-- 通知システムの診断・RLSポリシー再確認・データ整合チェック
-- ========================================================

-- 1. notifications RLSポリシーを明示的に再適用（ntf_write が確実に存在することを保証）
alter table notifications enable row level security;

drop policy if exists "ntf_read"        on notifications;
drop policy if exists "ntf_select_own"  on notifications;
drop policy if exists "ntf_write"       on notifications;

-- 全認証ユーザーが SELECT 可能（横断参照用）
create policy "ntf_read" on notifications
  for select to authenticated using (true);

-- 本人・自チーム宛てのみ詳細取得（ntf_read と OR で機能）
create policy "ntf_select_own" on notifications
  for select to authenticated
  using (
    is_admin_or_exec()
    or to_user_id = current_profile_id()
    or to_team_id in (select my_team_ids())
  );

-- 認証済みユーザーは INSERT/UPDATE/DELETE 可能（通知送信権限）
create policy "ntf_write" on notifications
  for all to authenticated
  using (true) with check (true);

-- 2. 現在のポリシー一覧を確認
select policyname, cmd, qual
from pg_policies
where tablename = 'notifications'
order by policyname;

-- 3. チーム設定の診断: leader_id が未設定のチームを検出
select
  t.id as team_id,
  t.name as team_name,
  t.leader_id,
  count(tm.profile_id) as member_count
from teams t
left join team_members tm on tm.team_id = t.id
group by t.id, t.name, t.leader_id
order by t.name;

-- 4. team_members に存在するがチームが leader_id 未設定のメンバーを特定
select
  p.full_name,
  p.role,
  p.id as profile_id,
  tm.team_id,
  t.name as team_name,
  t.leader_id
from profiles p
join team_members tm on tm.profile_id = p.id
join teams t on t.id = tm.team_id
where p.role = 'member'
  and t.leader_id is null
order by p.full_name;

-- 5. 直近の notifications 件数確認
select type, count(*) as cnt, max(created_at) as latest
from notifications
group by type
order by latest desc nulls last;

-- 6. notifications テーブルの最新20件（to_user_id のリーダーが存在するかも確認）
select
  n.id,
  n.type,
  n.actor_name,
  n.body,
  n.to_user_id,
  p.full_name as to_user_name,
  n.created_at
from notifications n
left join profiles p on p.id = n.to_user_id
order by n.created_at desc
limit 20;
