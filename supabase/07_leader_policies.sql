-- =====================================================================
-- 07_leader_policies.sql — リーダーが自チームメンバーの個人チャートを
-- 編集できるよう mandala_charts のポリシーを拡張
-- 実行順: 01〜06 の後にこれを実行
-- =====================================================================

create or replace function my_team_member_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select tm.profile_id from team_members tm
  where tm.team_id in (select id from teams where leader_id = current_profile_id());
$$;

drop policy if exists "mandala_manage" on mandala_charts;
create policy "mandala_manage" on mandala_charts for all to authenticated
  using (is_admin_or_exec()
         or owner_user_id = current_profile_id()
         or owner_team_id in (select my_led_team_ids())
         or owner_user_id in (select my_team_member_ids()))
  with check (is_admin_or_exec()
         or owner_user_id = current_profile_id()
         or owner_team_id in (select my_led_team_ids())
         or owner_user_id in (select my_team_member_ids()));
