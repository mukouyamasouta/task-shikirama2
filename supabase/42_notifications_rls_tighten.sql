-- =====================================================================
-- 42_notifications_rls_tighten.sql — notifications の RLS を引き締め
--
-- 背景: 00_full_setup.sql の "ntf_read"（using true）と "ntf_write"
-- （for all using true）により、認証済みユーザーなら誰でも他人宛て通知の
-- 全件閲覧・既読化・削除・偽造が可能だった（REPORT.md 問題5）。
--
-- 方針:
--  - select: 本人の全profile宛て（マルチロール対応）＋担当チーム宛て＋幹部/管理者
--  - insert: 認証済みなら可（メンバー→リーダー通知が必要なため）
--  - update: 自分宛ての通知のみ（既読化）
--  - delete: 自分宛ての通知のみ
--
-- 実行: Supabase SQL エディタで1回実行
-- =====================================================================

-- マルチロール対応: 同一ログイン（auth.uid / email）に紐づく全profile ID
create or replace function my_profile_ids() returns setof uuid
  language sql stable security definer set search_path = public, auth as $$
  select id from profiles
   where auth_user_id = auth.uid()
      or lower(email) = lower(nullif(auth.jwt() ->> 'email',''))
$$;

-- 全開放ポリシーを撤去
drop policy if exists "ntf_read"  on notifications;
drop policy if exists "ntf_write" on notifications;
drop policy if exists "ntf_select_own" on notifications;

-- select: 本人宛て（全ロールprofile）／自分がリーダーのチーム宛て／幹部・管理者
create policy "ntf_select_own" on notifications for select to authenticated
  using (is_admin_or_exec()
         or to_user_id in (select my_profile_ids())
         or to_team_id in (select my_led_team_ids()));

-- insert: 認証済みなら可（タスク完了・日報提出などメンバー発の通知に必要）
create policy "ntf_insert" on notifications for insert to authenticated
  with check (true);

-- update: 自分宛てのみ（既読フラグの更新）
create policy "ntf_update_own" on notifications for update to authenticated
  using (to_user_id in (select my_profile_ids()))
  with check (to_user_id in (select my_profile_ids()));

-- delete: 自分宛てのみ
create policy "ntf_delete_own" on notifications for delete to authenticated
  using (to_user_id in (select my_profile_ids()));
