-- Supabase SQL Editorで1回実行してください
-- 幹部のチャート送信タブに「期間設定」を追加するための列追加。
-- 実際にチャート送信時に書き込まれるテーブルは mandala_charts ではなく chart_sends
-- （executive.html の sendChart() → API.createSend() が chart_sends に insert するため）。
-- そのため期間列は chart_sends 側に追加する。
-- mandala_charts には start_date は既存だが end_date がないため、リーダー評価記録タブの
-- 「チャート作成期間」絞り込み（C-2）で使うために end_date を追加する。
-- 既存の RLS ポリシーがそのまま新規列の読み書きもカバーするため、ポリシーの追加は不要。

alter table chart_sends
  add column if not exists start_date  date,
  add column if not exists end_date    date,
  add column if not exists csf_periods jsonb default '{}'::jsonb;

alter table mandala_charts
  add column if not exists end_date date;
