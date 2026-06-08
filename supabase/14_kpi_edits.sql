-- KPIメンバー編集履歴カラム追加
-- 個人画面でメンバーが編集したKPI情報をリーダー画面に表示するために使用
-- member_kpi_edits: {"si-ai": {"text": "...", "note": "...", "progress": 50}}

ALTER TABLE mandala_charts
  ADD COLUMN IF NOT EXISTS member_kpi_edits jsonb DEFAULT '{}'::jsonb;
