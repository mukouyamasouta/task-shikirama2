-- =====================================================================
-- 12_add_submitted.sql — 自己評価の提出フラグ追加
-- evaluations.submitted: true=提出済み(編集不可) / false=下書き
-- 実行は1回でOK（IF NOT EXISTSで再実行安全）
-- =====================================================================
alter table evaluations add column if not exists submitted boolean default false;
create index if not exists idx_evaluations_target_chart on evaluations(target_user_id, chart_id);
