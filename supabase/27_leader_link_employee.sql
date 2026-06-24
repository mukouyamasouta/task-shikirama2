-- ============================================================
-- 27_leader_link_employee.sql
-- リーダー⇄従業員 切り替え（紐付け）機能のためのRLS追加。
-- 既定では profiles の INSERT は管理者/幹部のみ（p_admin）。
-- リーダーが「従業員アカウントを新規作成して紐付ける」場合に
-- member ロールのプロフィールを作成できるよう、冪等にポリシーを追加する。
-- 何度実行しても安全（duplicate_object / undefined_function は無視）。
-- ※ 紐付け情報自体は localStorage 管理のためDB変更は不要。本SQLは
--   「新規従業員作成」をDBに保存したい場合のみ適用すればよい。
-- ============================================================

alter table if exists profiles enable row level security;

-- リーダー（自分がいずれかのチームの leader_id）は member プロフィールを作成可能
do $$
begin
  create policy "p_leader_create_member" on profiles for insert to authenticated
    with check (
      role = 'member'
      and current_profile_id() in (select leader_id from teams)
    );
exception
  when duplicate_object then null;
  when undefined_function then null;
end $$;
