-- =====================================================================
-- 06_templates_sends.sql — チャートテンプレート & 送信履歴
-- 幹部画面: テンプレCRUD / チャート送信履歴・進捗・記入者追跡
-- 実行順: 01〜05 の後にこれを実行
-- =====================================================================

-- ===== chart_templates（再利用テンプレート） =====
create table if not exists chart_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  center     text default '',
  subs       jsonb not null default '[]'::jsonb,   -- ["CSF1",...,"CSF8"]
  acts       jsonb not null default '[]'::jsonb,   -- [["KPI",...x8],...x8]
  color      text default '#0D9488',
  bg         text default '#CCEDE9',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- ===== chart_sends（送信履歴 + 進捗 + 記入者追跡） =====
create table if not exists chart_sends (
  id            uuid primary key default gen_random_uuid(),
  title         text,
  center        text default '',
  subs          jsonb not null default '[]'::jsonb,
  acts          jsonb not null default '[]'::jsonb,     -- 送信時スナップショット（リーダーが編集可）
  to_team       text,                                   -- チーム短縮キー or 名称
  to_profile_id uuid references profiles(id) on delete set null,
  to_name       text,
  status        text default 'sent',                    -- sent | in_progress | done
  progress      int  default 0,                         -- 0-100
  cell_status   jsonb default '{}'::jsonb,              -- {"r,c": 0|1|2|3}（KPI進捗）
  edited_by     jsonb default '{}'::jsonb,              -- {"r,c": "氏名"}（誰がどこを記入したか）
  sent_by       uuid references profiles(id) on delete set null,
  sent_by_name  text,
  sent_at       timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ===== RLS =====
alter table chart_templates enable row level security;
alter table chart_sends     enable row level security;

-- テンプレ: 全ログインユーザー閲覧可 / 管理者・幹部のみ編集
do $$ begin
  create policy "tpl_read"   on chart_templates for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "tpl_manage" on chart_templates for all to authenticated
    using (is_admin_or_exec()) with check (is_admin_or_exec());
exception when duplicate_object then null; end $$;

-- 送信: 全ログインユーザー閲覧可 / 作成は管理者・幹部、進捗更新はリーダー含め可
do $$ begin
  create policy "send_read"   on chart_sends for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "send_insert" on chart_sends for insert to authenticated
    with check (is_admin_or_exec());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "send_update" on chart_sends for update to authenticated
    using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "send_delete" on chart_sends for delete to authenticated
    using (is_admin_or_exec());
exception when duplicate_object then null; end $$;
