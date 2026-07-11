-- =====================================================================
-- 43_fix_exec_task_assigner.sql — 幹部割当タスクの assigner_id NULL を是正
--
-- 背景: 従業員の割り当てタブの絞り込みプルダウンに「幹部」が表示されない
-- 問題の根本原因。source='executive' のシード由来タスク2件
-- （「提案書フォーマットの標準化プロジェクト」「CRMデータ整備とクレンジング」）
-- の assigner_id が NULL になっていた（プロフィール削除→再作成の過程で
-- FK on delete set null により消失したと推定。REBUILD.sql のシード定義では
-- assigner_id = 山田太郎 a0000000-...0001）。
-- employee.html の選択肢生成（renderAssign の asgAssignerOpts）は
-- assignerId 必須のため、NULL のタスクは「幹部」として選択肢に現れない。
--
-- ※ 2026-07-12 に REST 経由で本番へ適用済み（2件更新を確認済み）。
--   このファイルは記録・再構築用。再実行しても冪等（対象0件）。
-- =====================================================================
update tasks
   set assigner_id = 'a0000000-0000-4000-8000-000000000001'  -- 山田 太郎（シード定義値）
 where source = 'executive'
   and assigner_id is null;

-- 参考: 幹部ロールが割り当てたのに source が executive でないタスクの是正
-- （2026-07-12 時点の本番調査では対象0件。将来の点検用に記録）
-- update tasks set source='executive'
--  where assigner_id in (select id from profiles where role='executive')
--    and (source is null or source <> 'executive');
