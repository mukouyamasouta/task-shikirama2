-- =====================================================================
-- 35_fix_role_scope.sql — 役職別データ閲覧スコープ
-- Supabase SQL Editorで1回実行してください
--   幹部(executive)/管理者(admin) は全社データを閲覧可能にする（追加・非破壊・OR評価）。
--   リーダーは自チーム、従業員は本人（既存ポリシー＋アプリ側スコープで担保）。
--   is_admin_or_exec() は SECURITY DEFINER のため team_members を参照せず再帰しない。冪等。
-- =====================================================================

-- 既存のSELECTポリシーに「幹部/管理者は全件」を OR で追加（既存条件は残すため他ロールに影響なし）
do $$ begin
  drop policy if exists "tasks_exec_all" on tasks;
  create policy "tasks_exec_all" on tasks for select to authenticated using (is_admin_or_exec());
exception when undefined_function then null; when undefined_table then null; end $$;

do $$ begin
  drop policy if exists "charts_exec_all" on mandala_charts;
  create policy "charts_exec_all" on mandala_charts for select to authenticated using (is_admin_or_exec());
exception when undefined_function then null; when undefined_table then null; end $$;

do $$ begin
  drop policy if exists "reports_exec_all" on daily_reports;
  create policy "reports_exec_all" on daily_reports for select to authenticated using (is_admin_or_exec());
exception when undefined_function then null; when undefined_table then null; end $$;

do $$ begin
  drop policy if exists "eval_exec_all" on evaluations;
  create policy "eval_exec_all" on evaluations for select to authenticated using (is_admin_or_exec());
exception when undefined_function then null; when undefined_table then null; end $$;

do $$ begin
  drop policy if exists "profiles_exec_all" on profiles;
  create policy "profiles_exec_all" on profiles for select to authenticated using (is_admin_or_exec());
exception when undefined_function then null; when undefined_table then null; end $$;

do $$ begin
  drop policy if exists "tm_exec_all" on team_members;
  create policy "tm_exec_all" on team_members for select to authenticated using (is_admin_or_exec());
exception when undefined_function then null; when undefined_table then null; end $$;

-- 確認: 各テーブルにポリシーが存在すればOK（幹部は全件閲覧可・他ロールは既存スコープ）
select tablename, count(*) as policies
  from pg_policies
 where tablename in ('tasks','mandala_charts','daily_reports','evaluations','profiles','team_members')
 group by tablename order by tablename;
