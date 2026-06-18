-- =====================================================================
-- 21_concurrency_and_links.sql — 40名同時利用の保存信頼性向上（冪等）
--
-- 「保存できない（無言で失敗する）」の主因は RLS が依存する
-- profiles.auth_user_id のリンク切れです（current_profile_id() が null だと
-- 本人のチャート更新が0行になり、エラーも出ずに失敗します）。
-- ここで全プロフィールを auth.users とメール一致で再リンクし、
-- 同時アクセス用のインデックスも整えます。
--
-- 20_setup_all.sql の後に SQL Editor で1回実行（再実行安全）。
-- =====================================================================

-- ========== 1. profiles ⇄ auth.users の再リンク（メール一致・大小無視） ==========
-- これにより current_profile_id() が正しく解決され、本人のRLS更新が通る。
update profiles p
   set auth_user_id = u.id
  from auth.users u
 where lower(u.email) = lower(p.email)
   and (p.auth_user_id is distinct from u.id);

-- 紐付けが残っていない（auth未作成）プロフィールの確認用（手動対応）
-- select full_name, email from profiles where auth_user_id is null;

-- ========== 2. 同時利用向けインデックス ==========
create index if not exists idx_tasks_assignee     on tasks(assignee_id);
create index if not exists idx_tasks_team          on tasks(team_id);
create index if not exists idx_tasks_status        on tasks(status);
create index if not exists idx_mc_owner_user       on mandala_charts(owner_user_id);
create index if not exists idx_mc_owner_team       on mandala_charts(owner_team_id);
create index if not exists idx_dr_author_date      on daily_reports(author_id, report_date);
create index if not exists idx_tm_profile          on team_members(profile_id);
create index if not exists idx_tm_team             on team_members(team_id);

-- ========== 3. 確認クエリ ==========
-- (a) リンク済みプロフィール数 / (b) 未リンク（auth未作成）数
select
  (select count(*) from profiles where auth_user_id is not null) as linked_profiles,
  (select count(*) from profiles where auth_user_id is null)     as unlinked_profiles;
-- unlinked_profiles が 0 でなくても、その人のメールで auth ユーザーを作れば解消します
-- （幹部画面のアカウント発行 / signup、または REBUILD.sql の Auth 作成ブロック）。
