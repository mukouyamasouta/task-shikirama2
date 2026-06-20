-- =====================================================================
-- 24_fix_account_links.sql — 既存アカウントの auth リンク修復（冪等）
--
-- Supabase SQL Editor に貼り付けて実行してください。
-- 期待値: unlinked=0 / no_team は「未所属メンバー数」で 0 でなくても可
--         （signup.html からの自己登録者は意図的に未所属＝管理者が後で割当）。
--
-- 背景: RLS は profiles.auth_user_id ⇄ auth.users のリンクに依存します
--       （current_profile_id() が解決できないと本人の保存が無言で0行失敗）。
--       幹部発行(vexum_create_login)・自己登録(handle_new_user) はどちらも
--       リンクを張りますが、過去に手動INSERTした行など取りこぼしを救済します。
-- =====================================================================

-- 1) profiles と auth.users をメール一致で再リンク（大小無視・冪等）
update profiles p
   set auth_user_id = u.id
  from auth.users u
 where lower(u.email) = lower(p.email)
   and p.auth_user_id is distinct from u.id;

-- 2) team_members 未登録のプロフィール（手動でチーム割当が必要な対象の一覧）
--    幹部・管理者・自己登録メンバーは未所属が正常なので、従業員ロールのみ要確認。
select p.full_name, p.email, p.role
  from profiles p
  left join team_members tm on tm.profile_id = p.id
 where tm.profile_id is null
 order by p.role, p.email;

-- 3) 修復後の確認（unlinked が 0 になればリンク修復完了）
select
  (select count(*) from profiles where auth_user_id is null) as unlinked,
  (select count(*) from profiles p
     left join team_members tm on tm.profile_id = p.id
    where tm.profile_id is null) as no_team;
-- 期待値: unlinked = 0 ／ no_team は未所属者数（0でなくても運用上は可）
