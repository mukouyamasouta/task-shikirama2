-- =====================================================================
-- 38_fix_kondo.sql — kondo@shikirama.com 消失の修正（CASE B: 論理削除）
--
-- 原因（調査結果・読み取りのみで確認済み）:
--   kondo@shikirama.com の profiles は3件（executive / leader / member）
--   すべて is_active=false（論理削除）で残存。auth.users も b4d9… が健在。
--   fetchAll が is_active=false を全画面から除外するため「消えた」ように見え、
--   さらに createOrLinkAccount の重複チェック(_existsEmailRole)が is_active を
--   見ないため、再作成すると UNIQUE(lower(email),role) 違反＝
--   「このメール・ロールの組み合わせは既に存在します」エラーになっていた。
--
-- 対応: 物理削除や作り直しは行わず、既存3行を「復活（is_active=true）」する。
--       DELETE / DROP は一切使用しない（非破壊）。
-- Supabase SQL Editor で1回実行してください。冪等。
-- =====================================================================

-- 1) 適用前の現状確認（読み取り）
select id, full_name, email, role, auth_user_id, is_active, created_at
  from profiles
 where lower(email) = 'kondo@shikirama.com'
 order by created_at;

-- 2) 復活：論理削除された kondo の全ロールを再アクティブ化
update profiles
   set is_active = true
 where lower(email) = 'kondo@shikirama.com'
   and is_active is distinct from true;

-- 3) 念のため auth とのリンクを補修（CASE C 予防。既にリンク済みなら無変更）
update profiles p
   set auth_user_id = u.id
  from auth.users u
 where lower(u.email) = lower(p.email)
   and lower(p.email) = 'kondo@shikirama.com'
   and p.auth_user_id is null;

-- 4) 適用後の確認（is_active が全て true になっていること）
select id, full_name, email, role, auth_user_id, is_active
  from profiles
 where lower(email) = 'kondo@shikirama.com'
 order by role;

-- ---------------------------------------------------------------------
-- 【任意・手動】回避策で作られた重複アカウント kondou@shikirama.com（末尾u）について
--   2026-06-28 に作成された member 1件が存在します。kondo の復活後は不要であれば
--   アカウント管理画面の「🗑 削除」（論理削除）で外せます。SQLでの物理削除は
--   データ破壊防止のため本ファイルには含めていません。必要時のみ下記を手動実行:
--     -- update profiles set is_active=false where lower(email)='kondou@shikirama.com';
-- ---------------------------------------------------------------------
