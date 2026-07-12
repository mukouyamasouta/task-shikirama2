-- =====================================================================
-- 44_notifications_rls_fix_insert.sql — メンバー発通知の insert を復旧
--
-- 背景: 42番適用後の本番RLSでは、メンバーが「他人宛て」に通知を insert
-- できない（42501）。このため以下の通知が全て silent に失われている
-- （2026-07-12 の本番シナリオ検証で実証。api.js は insert 失敗を
-- console.warn で握りつぶすため画面上は気づけない）:
--   - report_submitted / report_started（日報提出・始業 → リーダー宛て）
--   - task_done（タスク完了 → リーダー宛て）
--   - chart_edit（チャート編集 → リーダー宛て）
-- ※ 幹部/管理者発（task_assigned等）と自分宛ては影響なし。
--
-- 方針: 「actor_id が自分」の insert を許可する。発信者の詐称は防ぎつつ、
-- メンバー→リーダー宛ての正当な通知を復旧する。
--
-- 実行: Supabase SQL エディタで1回実行（要 service role / SQLエディタ）
-- =====================================================================

-- 既知の insert 系ポリシーを名前違いも含めて撤去
drop policy if exists "ntf_insert" on notifications;
drop policy if exists "ntf_write"  on notifications;

create policy "ntf_insert" on notifications for insert to authenticated
  with check (
    is_admin_or_exec()
    or to_user_id in (select my_profile_ids())   -- 自分宛て（システム系）
    or actor_id  in (select my_profile_ids())    -- 自分が発信者（メンバー→リーダー通知）
  );

-- ===== 適用後の動作確認（SQLエディタで実行する場合の参考） =====
-- メンバーとしてログインした画面から日報を提出し、リーダーの🔔に
-- 「日報提出」が届けば復旧完了。
