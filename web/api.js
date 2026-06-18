/* =====================================================================
 * web/api.js — Supabase データアクセス層（クラシックスクリプト/UMD前提）
 *   読込順: supabase-js(UMD) → config.js → api.js → 各画面のbootstrap
 *   window.VexumAPI を公開。未設定時は ready=false（画面は内蔵デモのまま）
 * ===================================================================== */
(function () {
  var cfg = window.SUPABASE_CONFIG || {};
  var ready = !!(cfg.url && cfg.anonKey && !/YOUR-/.test(cfg.url) && window.supabase);
  var sb = ready ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;

  // 固定UUID → 画面側の短縮キー（02_seed_core.sql と一致）
  var TEAM_KEY = {
    'b0000000-0000-4000-8000-0000000000a1': 'A',
    'b0000000-0000-4000-8000-0000000000a2': 'B',
    'b0000000-0000-4000-8000-0000000000a3': 'C'
  };
  var MEMBER_KEY = {
    'a0000000-0000-4000-8000-000000000001': 'yamada',
    'a0000000-0000-4000-8000-000000000002': 'kimura',
    'a0000000-0000-4000-8000-000000000003': 'tanaka',
    'a0000000-0000-4000-8000-000000000004': 'nakamura',
    'a0000000-0000-4000-8000-000000000005': 'ito',
    'a0000000-0000-4000-8000-000000000006': 'kobayashi',
    'a0000000-0000-4000-8000-000000000007': 'suzuki',
    'a0000000-0000-4000-8000-000000000008': 'yamamoto',
    'a0000000-0000-4000-8000-000000000009': 'kato',
    'a0000000-0000-4000-8000-000000000010': 'sato',
    'a0000000-0000-4000-8000-000000000011': 'matsuda',
    'a0000000-0000-4000-8000-000000000012': 'inoue',
    'a0000000-0000-4000-8000-000000000013': 'takahashi',
    'a0000000-0000-4000-8000-000000000014': 'watanabe',
    'a0000000-0000-4000-8000-000000000015': 'yamaguchi',
    'a0000000-0000-4000-8000-000000000016': 'ogawa'
  };

  function err(label, e) { console.warn('[VexumAPI] ' + label + ' failed:', e); }

  function _sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  // 一時的エラー（レート制限/接続断/5xx）は指数バックオフでリトライ。
  // makeReq は Supabase 呼び出し（{data,error} を返す Promise）を生成する関数。
  async function sbRetry(makeReq, tries) {
    tries = tries || 4;
    var last;
    for (var i = 0; i < tries; i++) {
      try {
        var r = await makeReq();
        if (r && r.error) {
          var m = String((r.error && r.error.message) || r.error || '');
          var code = String((r.error && (r.error.code || r.error.status)) || '');
          // 一時的エラーのみリトライ（フレーズ優先＋HTTPステータスはコード/境界で判定。
          // 金額や任意の数字に '500' 等が含まれる永続エラーを誤ってリトライしない）
          var transient = /rate ?limit|too many|timeout|timed out|temporar|fetch failed|networkerror|failed to fetch|ECONN|bad gateway|service unavailable|gateway time/i.test(m)
            || /^(429|500|502|503|504)$/.test(code)
            || /\b(429|502|503|504)\b/.test(m);
          if (transient && i < tries - 1) { await _sleep(400 * Math.pow(2, i)); continue; }
        }
        return r;
      } catch (e) {
        last = e;
        if (i < tries - 1) { await _sleep(400 * Math.pow(2, i)); continue; }
        return { error: { message: (e && e.message) || String(e) } };
      }
    }
    return { error: { message: (last && last.message) || 'retry exhausted' } };
  }

  // 全テーブルを一括取得（生データ）
  async function fetchAll() {
    if (!sb) return null;
    var t = await Promise.all([
      sb.from('profiles').select('*'),
      sb.from('teams').select('*'),
      sb.from('team_members').select('*'),
      sb.from('mandala_charts').select('*'),
      sb.from('tasks').select('*'),
      sb.from('daily_reports').select('*').order('report_date', { ascending: true }),
      sb.from('evaluations').select('*'),
      sb.from('eval_records').select('*')
    ]);
    var keys = ['profiles', 'teams', 'team_members', 'mandala_charts', 'tasks', 'daily_reports', 'evaluations', 'eval_records'];
    var out = {};
    for (var i = 0; i < keys.length; i++) {
      if (t[i].error) { err(keys[i], t[i].error); return null; }
      out[keys[i]] = t[i].data || [];
    }
    return out;
  }

  function byId(rows) { var m = {}; rows.forEach(function (r) { m[r.id] = r; }); return m; }
  function roleJP(r) { return r === 'leader' ? 'リーダー' : 'メンバー'; }
  // 固定UUIDは短縮キー、それ以外（新規作成分）は生UUIDをキーに使う
  function memKey(id) { return MEMBER_KEY[id] || id; }
  function roleJPFull(r) { return r === 'admin' ? '管理者' : r === 'executive' ? '幹部' : r === 'leader' ? 'リーダー' : 'メンバー'; }

  // ===== 幹部(管理)画面 用アダプタ → {TEAMS, MEMBERS, MND, EMP} =====
  async function loadAdminData() {
    var raw = await fetchAll(); if (!raw) return null;
    var prof = byId(raw.profiles);
    var teamById = byId(raw.teams);
    var letterName = {}; // 'A' -> '営業チームA'
    Object.keys(teamById).forEach(function (id) { if (TEAM_KEY[id]) letterName[TEAM_KEY[id]] = teamById[id].name; });

    var TEAMS = {};
    raw.teams.forEach(function (t) {
      var key = TEAM_KEY[t.id]; if (!key) return;
      var mems = raw.team_members.filter(function (m) { return m.team_id === t.id; });
      TEAMS[key] = {
        id: key, uid: t.id, name: t.name, color: t.color, bg: t.bg,
        leader: memKey(t.leader_id), leaderName: (prof[t.leader_id] || {}).full_name || '',
        members: mems.map(function (m) { return memKey(m.profile_id); }).filter(Boolean),
        rate: Math.round(mems.reduce(function (a, m) { return a + (m.achievement_rate || 0); }, 0) / (mems.length || 1))
      };
    });

    // チーム所属の補助マップ
    var tmByProfile = {};
    raw.team_members.forEach(function (m) { tmByProfile[m.profile_id] = m; });

    // MEMBERS は「全アカウント」を対象（未所属・新規作成分も含む）
    var MEMBERS = {};
    raw.profiles.forEach(function (p) {
      var key = memKey(p.id);
      var tm = tmByProfile[p.id];
      MEMBERS[key] = {
        pid: p.id,
        name: p.full_name,
        email: p.email,
        role: (tm && tm.role_in_team === 'leader') ? 'リーダー' : roleJPFull(p.role),
        roleEnum: p.role,
        team: tm ? TEAM_KEY[tm.team_id] : '',
        rate: tm ? (tm.achievement_rate || 0) : 50
      };
    });

    var MND = {}, EMP = {};
    raw.mandala_charts.forEach(function (c) {
      var base = { color: c.color, bg: c.bg, name: c.name, center: c.center, subs: c.subs, acts: c.acts };
      if (c.owner_type === 'team') {
        var tk = TEAM_KEY[c.owner_team_id]; if (!tk) return;
        base.team = c.name; MND[tk] = base;
      } else if (c.id !== 'user_nakamura_q2') {
        var mk = memKey(c.owner_user_id); if (!mk) return;
        var mem = MEMBERS[mk] || {};
        base.team = letterName[mem.team] || ''; base.role = mem.role || 'メンバー';
        EMP[mk] = base;
      }
    });
    return { TEAMS: TEAMS, MEMBERS: MEMBERS, MND: MND, EMP: EMP };
  }

  function fmtMD(d) { if (!d) return '-'; var p = d.split('-'); return (+p[1]) + '/' + (+p[2]); }
  function fmtYMD(d) { return d ? d.replace(/-/g, '/') : ''; }

  // ===== リーダー画面 用アダプタ（引数なし＝ログイン中リーダーの担当チームを自動判定） =====
  async function loadLeaderData(teamLetter) {
    var raw = await fetchAll(); if (!raw) return null;
    var prof = byId(raw.profiles);
    var teamUuid = null;
    if (teamLetter) {
      teamUuid = Object.keys(TEAM_KEY).filter(function (id) { return TEAM_KEY[id] === teamLetter; })[0] || teamLetter;
    } else {
      // ログイン中ユーザーが「リーダーのチーム」を特定（leader_id一致 → 所属でrole=leader → 所属）
      var me = await currentProfile();
      if (me && me.id) {
        var t1 = raw.teams.filter(function (t) { return t.leader_id === me.id; })[0];
        if (t1) teamUuid = t1.id;
        if (!teamUuid) {
          var tm0 = raw.team_members.filter(function (m) { return m.profile_id === me.id; });
          var lead = tm0.filter(function (m) { return m.role_in_team === 'leader'; })[0] || tm0[0];
          if (lead) teamUuid = lead.team_id;
        }
      }
    }
    if (!teamUuid) teamUuid = Object.keys(TEAM_KEY).filter(function (id) { return TEAM_KEY[id] === 'A'; })[0]; // デモ用フォールバック
    teamLetter = TEAM_KEY[teamUuid] || teamUuid;
    var team = raw.teams.filter(function (t) { return t.id === teamUuid; })[0] || { name: '' };
    var chartByUser = {};
    raw.mandala_charts.forEach(function (c) { if (c.owner_type === 'user' && c.id.indexOf('_q2') < 0) chartByUser[c.owner_user_id] = c; });

    var members = raw.team_members.filter(function (m) { return m.team_id === teamUuid; });
    members.sort(function (a, b) { return (a.role_in_team === 'leader' ? 0 : 1) - (b.role_in_team === 'leader' ? 0 : 1); });

    var MEMBERS = {}, DASH_IDS = [], EVAL_IDS = [];
    members.forEach(function (m) {
      var key = memKey(m.profile_id), p = prof[m.profile_id]; if (!key || !p) return;
      var c = chartByUser[m.profile_id] || { subs: [], acts: [], center: '' };
      var tk = raw.tasks.filter(function (t) { return t.assignee_id === m.profile_id; });
      var stats = { done: tk.filter(function (t) { return t.status === 'done'; }).length,
                    wip: tk.filter(function (t) { return t.status === 'wip'; }).length,
                    late: tk.filter(function (t) { return t.status === 'late'; }).length };
      // KPI進捗 = そのCSFに紐づくタスクの平均進捗（タスクが無いCSFは達成率で代替）
      var kpis = (c.subs || []).slice(0, 4).map(function (s) {
        var rel = tk.filter(function (t) { return t.related_kgi === s; });
        var p = rel.length
          ? Math.round(rel.reduce(function (a, t) { return a + (t.progress || 0); }, 0) / rel.length)
          : (m.achievement_rate || 0);
        return { n: s, p: Math.max(0, Math.min(100, p)) };
      });
      MEMBERS[key] = {
        pid: p.id, chartId: c.id || null,
        name: p.full_name, role: m.role_in_team === 'leader' ? 'リーダー' : '従業員', team: team.name,
        color: p.color, bg: '#F3F4F6', rate: m.achievement_rate, kpis: kpis, stats: stats,
        center: c.center || (p.full_name + '\n個人目標'), subs: c.subs || [], acts: c.acts || [],
        memberKpiEdits: c.member_kpi_edits || {}
      };
      DASH_IDS.push(key);
      if (m.role_in_team !== 'leader') EVAL_IDS.push(key);
    });

    var MEMBER_TASKS = {};
    raw.tasks.forEach(function (t) {
      var key = memKey(t.assignee_id); if (!key || !MEMBERS[key]) return;
      (MEMBER_TASKS[key] = MEMBER_TASKS[key] || []).push({
        id: t.id, name: t.title, kpi: t.related_kgi || '—', start: fmtMD(t.start_date), due: fmtMD(t.due_date), pri: t.priority, status: t.status,
        pct: t.progress || 0, hours: (t.total_hours != null ? +t.total_hours : 0), period: t.period || '', chart: t.source_chart || null, sendId: t.source_send_id || null, cell: t.source_cell || null
      });
    });

    var REPORTS = {};
    raw.daily_reports.forEach(function (r) {
      var key = memKey(r.author_id); if (!key || !MEMBERS[key]) return;
      (REPORTS[key] = REPORTS[key] || []).push({ date: r.report_date, hours: r.hours, done: r.done, plan: r.plan, issue: r.issue, cond: r.condition });
    });

    var EVAL_RECORDS = raw.eval_records.map(function (r) {
      return { name: r.evaluatee_name, evaluator: r.evaluator_name, period: r.period, kgi: +r.kgi, csf: +r.csf_avg, task: +r.task_avg, comment: r.comment, status: r.status };
    });

    var assigned = {}; raw.team_members.forEach(function (m) { assigned[m.profile_id] = 1; });
    var AVAILABLE = {};
    raw.profiles.forEach(function (p) {
      if (assigned[p.id] || p.role === 'admin' || p.role === 'executive') return;
      var key = memKey(p.id); if (!key) return;
      AVAILABLE[key] = {
        pid: p.id,
        name: p.full_name, role: '従業員', team: '（未所属）', email: p.email, color: p.color, bg: '#F3F4F6', rate: 50,
        kpis: [{ n: '重点目標1', p: 50 }, { n: '重点目標2', p: 40 }, { n: '重点目標3', p: 58 }, { n: '重点目標4', p: 50 }],
        stats: { done: 0, wip: 0, late: 0 }, center: p.full_name + '\n個人目標',
        subs: Array.from({ length: 8 }, function (_, i) { return '重点目標' + (i + 1); }),
        acts: Array.from({ length: 8 }, function (_, i) { return Array.from({ length: 8 }, function (__, j) { return '施策' + (i + 1) + '-' + (j + 1); }); })
      };
    });
    // メンバーキー→profile_id（リーダー操作の永続化用）
    var memberPid = {};
    raw.profiles.forEach(function (p) { memberPid[memKey(p.id)] = p.id; });
    return { MEMBERS: MEMBERS, MEMBER_TASKS: MEMBER_TASKS, REPORTS: REPORTS, EVAL_RECORDS: EVAL_RECORDS, DASH_IDS: DASH_IDS, EVAL_IDS: EVAL_IDS, AVAILABLE: AVAILABLE, teamName: team.name, teamUuid: teamUuid, memberPid: memberPid };
  }

  // ===== リーダー操作：チーム所属の追加/削除・タスク割当・評価記録 =====
  async function addTeamMember(teamUuid, pid, role, rate) {
    if (!sb) return { error: 'Supabase未接続' };
    var r = await sb.from('team_members').insert({
      team_id: teamUuid, profile_id: pid,
      role_in_team: (role === 'リーダー' ? 'leader' : 'member'),
      achievement_rate: (rate != null ? rate : 50)
    });
    if (r.error) return { error: r.error.message };
    return { ok: true };
  }
  // チーム情報（名前・カラー・リーダー）を更新
  async function updateTeam(teamUuid, patch) {
    if (!sb) return { error: 'Supabase未接続' };
    var up = {};
    if (patch.name != null) up.name = patch.name;
    if (patch.color != null) up.color = patch.color;
    if (patch.leaderPid !== undefined) up.leader_id = patch.leaderPid;
    var r = await sb.from('teams').update(up).eq('id', teamUuid).select('id');
    if (r.error) return { error: friendlyErr(r.error.message) };
    if (!r.data || r.data.length === 0) return { error: '更新できませんでした（権限不足の可能性）' };
    return { ok: true };
  }
  async function removeTeamMember(teamUuid, pid) {
    if (!sb) return { error: 'Supabase未接続' };
    var r = await sb.from('team_members').delete().eq('team_id', teamUuid).eq('profile_id', pid);
    if (r.error) return { error: r.error.message };
    return { ok: true };
  }
  async function assignTask(o) {
    if (!sb) return { error: 'Supabase未接続' };
    var me = await currentProfile();
    var row = {
      title: o.title, related_kgi: o.kpi || null, category: o.category || null,
      assigner_id: me ? me.id : null,
      assignee_id: o.assigneePid || (me ? me.id : null),  // 未指定なら本人タスク（個人画面の自作）
      team_id: o.teamUuid || null,
      source: o.source || 'leader', start_date: o.start || null, due_date: o.due || null,
      priority: o.priority || 'md', progress: 0, status: 'todo'
    };
    if (o.period) row.period = o.period;            // 対象期間（評価連携・19_task_period.sql）
    if (o.plannedHours != null) row.planned_hours = o.plannedHours; // 予定工数
    // 受信チャート由来のタスク: どのチャートのどのセルか（個人画面チップ表示・進捗の逆反映用）
    if (o.sendId) { row.source_send_id = o.sendId; row.source_cell = o.cell || null; row.source_chart = o.chartTitle || null; }
    var r = await sb.from('tasks').insert(row).select().single();
    if (r.error && /source_send_id|source_cell|source_chart|period|planned_hours/.test(r.error.message)) {
      // 17/18/19 未適用のDB: 拡張列なしで作成（後方互換）
      delete row.source_send_id; delete row.source_cell; delete row.source_chart; delete row.period; delete row.planned_hours;
      r = await sb.from('tasks').insert(row).select().single();
    }
    if (r.error) return { error: friendlyErr(r.error.message) };
    return { data: r.data };
  }
  // タスクの進捗・状態・コメントを更新（個人画面の保存系）
  async function updateTask(id, patch) {
    if (!sb) return { error: 'Supabase未接続' };
    if (!id) return { error: 'タスクIDが不明です（デモデータは保存対象外）' };
    var up = {};
    if (patch.progress != null) up.progress = patch.progress;
    if (patch.status) up.status = patch.status;
    if (patch.comment != null) up.comment = patch.comment;
    if (patch.completedDate !== undefined) up.completed_date = patch.completedDate;
    if (patch.assigneePid) up.assignee_id = patch.assigneePid;   // 未割当タスクの割当用
    if (patch.start !== undefined) up.start_date = patch.start;
    if (patch.due !== undefined) up.due_date = patch.due;
    if (patch.priority) up.priority = patch.priority;
    var r = await sb.from('tasks').update(up).eq('id', id).select('id');
    if (r.error) return { error: friendlyErr(r.error.message) };
    if (!r.data || r.data.length === 0) return { error: '更新できませんでした（権限不足の可能性）' };
    // 受信チャート由来のタスクなら、チャート（chart_sends）の該当セルと全体進捗へ自動反映
    try { await propagateTaskToSend(id); } catch (e) {}
    return { ok: true };
  }
  // タスク進捗 → chart_sends（送信チャート）への逆反映
  // ・該当セル（cell_status[key]）に progress を記録
  // ・チャート全体 progress = そのチャート由来タスクの平均進捗
  // ・edited_by[key] に記入者名（幹部の送信履歴・リーダーの管理グリッドに表示）
  async function propagateTaskToSend(taskId) {
    if (!sb) return;
    var t = await sb.from('tasks').select('id,progress,status,source_send_id,source_cell').eq('id', taskId).maybeSingle();
    if (!t.data || !t.data.source_send_id) return;
    var sendId = t.data.source_send_id;
    var s = await sb.from('chart_sends').select('id,cell_status,edited_by').eq('id', sendId).maybeSingle();
    if (!s.data) return;
    var me = await currentProfile();
    var cs = s.data.cell_status || {}, eb = s.data.edited_by || {};
    var key = t.data.source_cell;
    if (key) {
      cs[key] = cs[key] || {};
      cs[key].progress = t.data.progress || 0;
      cs[key].taskStatus = t.data.status;
      if (me) eb[key] = me.full_name;
    }
    var all = await sb.from('tasks').select('progress').eq('source_send_id', sendId);
    var rows = all.data || [];
    var avg = rows.length ? Math.round(rows.reduce(function (a, x) { return a + (x.progress || 0); }, 0) / rows.length) : (t.data.progress || 0);
    await sb.from('chart_sends').update({
      cell_status: cs, edited_by: eb, progress: avg,
      status: avg >= 100 ? 'done' : 'in_progress',
      updated_at: new Date().toISOString()
    }).eq('id', sendId);
  }

  // ===== 工数（作業時間）記録・タスク完了・通知 =====
  // 「本日 hours 時間かけて progressAfter% まで進んだ」を記録し、
  // tasks.total_hours を加算、progress/status を更新。100%なら完了処理。
  async function logTaskTime(taskId, o) {
    if (!sb) return { error: 'Supabase未接続' };
    if (!taskId) return { error: 'タスクIDが不明です（デモデータは保存対象外）' };
    var me = await currentProfile();
    var hours = Math.max(0, +o.hours || 0);
    var prog = (o.progressAfter != null) ? Math.max(0, Math.min(100, Math.round(o.progressAfter))) : null;
    // 1) 日次ログ（単発・best-effort。リトライしない＝タイムアウト後の二重挿入を防ぐ）
    if (hours > 0 || prog != null) {
      try {
        await sb.from('task_time_logs').insert({
          task_id: taskId, user_id: me ? me.id : null,
          log_date: o.date || new Date().toISOString().slice(0, 10),
          hours: hours, progress_after: prog, note: o.note || null
        });
      } catch (e) {}
    }
    // 2) tasks 更新：total_hours 加算 + progress/status
    var cur = await sbRetry(function () { return sb.from('tasks').select('progress,total_hours,status,due_date').eq('id', taskId).maybeSingle(); });
    // 現状読込に失敗したら total_hours を 0 起点で上書きしない（累計が消えるのを防ぐ）
    if (cur.error) return { error: friendlyErr((cur.error && cur.error.message) || '読込失敗') };
    if (!cur.data) return { error: 'タスクが見つかりません' };
    var prevHours = (+cur.data.total_hours) || 0;
    var newProg = (prog != null) ? prog : (cur.data ? cur.data.progress : 0);
    var done = newProg >= 100;
    var late = !done && cur.data && cur.data.due_date && cur.data.due_date < new Date().toISOString().slice(0, 10);
    var up = { progress: newProg, status: done ? 'done' : (late ? 'late' : (newProg > 0 ? 'wip' : 'todo')) };
    if (o.comment != null) up.comment = o.comment;
    // total_hours 列が無い古いDBでも動くよう、まず加算込みで試す
    var withHours = Object.assign({ total_hours: prevHours + hours }, up);
    if (done) { withHours.completed_date = new Date().toISOString().slice(0, 10); withHours.completed_at = new Date().toISOString(); }
    var r = await sbRetry(function () { return sb.from('tasks').update(withHours).eq('id', taskId).select('id'); });
    if (r.error && /total_hours|completed_at/.test(r.error.message)) {
      if (done) up.completed_date = new Date().toISOString().slice(0, 10);
      r = await sbRetry(function () { return sb.from('tasks').update(up).eq('id', taskId).select('id'); });
    }
    if (r.error) return { error: friendlyErr(r.error.message) };
    if (!r.data || r.data.length === 0) return { error: '更新できませんでした（RLS/権限の可能性）' };
    try { await propagateTaskToSend(taskId); } catch (e) {}
    if (done) { try { await notifyTaskDone(taskId); } catch (e) {} }
    return { ok: true, progress: newProg, done: done, totalHours: prevHours + hours };
  }

  // 絶対値SET（冪等）でタスクの進捗・累計工数を設定。再送キュー用：
  // 何度呼んでも total_hours は加算されず指定値になるため二重計上しない。
  async function setTaskProgress(taskId, o) {
    if (!sb || !taskId) return { error: 'タスクIDが不明です' };
    var prog = (o.progress != null) ? Math.max(0, Math.min(100, Math.round(o.progress))) : null;
    var done = prog != null && prog >= 100;
    var up = {};
    if (prog != null) { up.progress = prog; up.status = done ? 'done' : (prog > 0 ? 'wip' : 'todo'); }
    if (o.totalHours != null) up.total_hours = Math.max(0, +o.totalHours);
    if (done) { up.completed_date = new Date().toISOString().slice(0, 10); up.completed_at = new Date().toISOString(); }
    if (!Object.keys(up).length) return { ok: true };
    var r = await sbRetry(function () { return sb.from('tasks').update(up).eq('id', taskId).select('id'); });
    if (r.error && /total_hours|completed_at/.test(r.error.message)) {
      delete up.total_hours; delete up.completed_at;
      if (done) up.completed_date = new Date().toISOString().slice(0, 10);
      r = await sbRetry(function () { return sb.from('tasks').update(up).eq('id', taskId).select('id'); });
    }
    if (r.error) return { error: friendlyErr(r.error.message) };
    if (!r.data || r.data.length === 0) return { error: '更新できませんでした（RLS/権限の可能性）' };
    try { await propagateTaskToSend(taskId); } catch (e) {}
    if (done) { try { await notifyTaskDone(taskId); } catch (e) {} }
    return { ok: true };
  }

  // タスク完了時、担当チームのリーダーへ完了通知
  async function notifyTaskDone(taskId) {
    if (!sb) return;
    var t = await sb.from('tasks').select('id,title,assignee_id,team_id,total_hours').eq('id', taskId).maybeSingle();
    if (!t.data) return;
    var me = await currentProfile();
    var leaderId = null, teamId = t.data.team_id;
    if (teamId) {
      var tr = await sb.from('teams').select('leader_id').eq('id', teamId).maybeSingle();
      leaderId = tr.data && tr.data.leader_id;
    }
    if (!leaderId && me) {
      var tm = await sb.from('team_members').select('team_id').eq('profile_id', me.id).maybeSingle();
      if (tm.data) { var tr2 = await sb.from('teams').select('leader_id').eq('id', tm.data.team_id).maybeSingle(); leaderId = tr2.data && tr2.data.leader_id; teamId = tm.data.team_id; }
    }
    if (!leaderId) return;
    var hrs = (t.data.total_hours != null) ? (' / 合計 ' + t.data.total_hours + 'h') : '';
    try {
      await sb.from('notifications').insert({
        to_user_id: leaderId, to_team_id: teamId || null, type: 'task_done',
        title: 'タスク完了', body: '「' + t.data.title + '」が完了しました' + hrs,
        actor_id: me ? me.id : null, actor_name: me ? me.full_name : '', ref_id: taskId
      });
    } catch (e) {}
  }

  // 日報提出をリーダーへ通知
  async function notifyReportSubmitted(reportId, dateStr) {
    if (!sb) return;
    var me = await currentProfile(); if (!me) return;
    var leaderId = null, teamId = null;
    var tm = await sb.from('team_members').select('team_id').eq('profile_id', me.id).maybeSingle();
    if (tm.data) { teamId = tm.data.team_id; var tr = await sb.from('teams').select('leader_id').eq('id', teamId).maybeSingle(); leaderId = tr.data && tr.data.leader_id; }
    if (!leaderId) return;
    try {
      await sb.from('notifications').insert({
        to_user_id: leaderId, to_team_id: teamId, type: 'report_submitted',
        title: '日報提出', body: (dateStr || '') + ' の日報が提出されました',
        actor_id: me.id, actor_name: me.full_name, ref_id: reportId || null
      });
    } catch (e) {}
  }

  // 自分/自チーム宛ての通知を取得（リーダー画面の🔔・受信用）
  async function loadNotifications() {
    if (!sb) return [];
    var me = await currentProfile(); if (!me) return [];
    var teamIds = [];
    try { var t = await sb.from('teams').select('id').eq('leader_id', me.id); teamIds = (t.data || []).map(function (x) { return x.id; }); } catch (e) {}
    var r = await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
    if (r.error) { err('notifications', r.error); return []; }
    return (r.data || []).filter(function (n) {
      if (n.to_user_id === me.id) return true;
      if (n.to_team_id && teamIds.indexOf(n.to_team_id) >= 0) return true;
      return false;
    });
  }
  async function markNotificationsRead(ids) {
    if (!sb || !ids || !ids.length) return { ok: true };
    var r = await sb.from('notifications').update({ read: true }).in('id', ids);
    if (r.error) return { error: r.error.message };
    return { ok: true };
  }
  // タスクの作業時間ログ一覧（工数履歴・日別内訳）
  async function loadTaskTimeLogs(taskId) {
    if (!sb || !taskId) return [];
    var r = await sb.from('task_time_logs').select('*').eq('task_id', taskId).order('log_date', { ascending: true });
    if (r.error) return [];
    return r.data || [];
  }
  // メンバー個人の工数履歴（リーダーの提出物閲覧用）。タスク名を添えて日付降順で返す。
  async function loadMemberTimeLogs(pid) {
    if (!sb || !pid) return [];
    var r = await sb.from('task_time_logs').select('*').eq('user_id', pid).order('log_date', { ascending: false }).limit(200);
    if (r.error) { err('member_time_logs', r.error); return []; }
    var logs = r.data || [];
    var ids = {}; logs.forEach(function (l) { if (l.task_id) ids[l.task_id] = 1; });
    var titles = {};
    var idArr = Object.keys(ids);
    if (idArr.length) {
      var t = await sb.from('tasks').select('id,title,period').in('id', idArr);
      (t.data || []).forEach(function (x) { titles[x.id] = { title: x.title, period: x.period }; });
    }
    return logs.map(function (l) {
      var ti = titles[l.task_id] || {};
      return { date: l.log_date, hours: +l.hours || 0, progress: l.progress_after, taskTitle: ti.title || '（タスク不明）', period: ti.period || '', note: l.note || '' };
    });
  }

  // 日報を保存（同一日付は上書き: author_id + report_date でupsert）
  // 始業(計画: planTasks/planHours/goal)・終業(実績: done/issue/actualHours)に対応。
  // o.submit=true（終業提出）のときリーダーへ通知。
  async function saveDailyReport(o) {
    if (!sb) return { error: 'Supabase未接続' };
    var me = await currentProfile(); if (!me) return { error: '未ログイン' };
    var row = {
      author_id: me.id, report_date: o.date,
      hours: o.hours || null, done: o.done || null, plan: o.plan || null,
      issue: o.issue || null, condition: o.cond || 'normal'
    };
    // 拡張列（18未適用DBでは弾かれるのでフォールバック）
    var ext = Object.assign({}, row);
    if (o.planTasks != null) ext.plan_tasks = o.planTasks;
    if (o.planHours != null) ext.plan_hours = o.planHours;
    if (o.goal != null) ext.goal = o.goal;
    if (o.actualHours != null) ext.actual_hours = o.actualHours;
    if (o.submit) ext.submitted_at = new Date().toISOString();
    var r = await sb.from('daily_reports').upsert(ext, { onConflict: 'author_id,report_date' }).select('id').maybeSingle();
    if (r.error && /plan_tasks|plan_hours|goal|actual_hours|submitted_at/.test(r.error.message)) {
      r = await sb.from('daily_reports').upsert(row, { onConflict: 'author_id,report_date' }).select('id').maybeSingle();
    }
    if (r.error) return { error: friendlyErr(r.error.message) };
    if (o.submit) { try { await notifyReportSubmitted(r.data && r.data.id, o.date); } catch (e) {} }
    return { ok: true };
  }
  // 日報を削除（本人の指定日）
  async function deleteDailyReport(dateStr) {
    if (!sb) return { error: 'Supabase未接続' };
    var me = await currentProfile(); if (!me) return { error: '未ログイン' };
    var r = await sb.from('daily_reports').delete().eq('author_id', me.id).eq('report_date', dateStr);
    if (r.error) return { error: friendlyErr(r.error.message) };
    return { ok: true };
  }
  async function saveEvalRecord(o) {
    if (!sb) return { error: 'Supabase未接続' };
    var me = await currentProfile();
    var r = await sb.from('eval_records').insert({
      evaluatee_id: o.evaluateePid || null, evaluatee_name: o.evaluateeName,
      evaluator_name: me ? me.full_name : (o.evaluatorName || ''),
      period: o.period, kgi: o.kgi || 0, csf_avg: o.csf || 0, task_avg: o.task || 0,
      comment: o.comment || '', status: 'done'
    });
    if (r.error) return { error: r.error.message };
    return { ok: true };
  }
  // 特定メンバー(profile_id)宛ての評価を取得（オプションでchartIdフィルタ）
  async function loadEvaluationsFor(pid, chartId) {
    if (!sb || !pid) return { fromLeader: [], fromExec: [], fromSelf: [] };
    var q = sb.from('evaluations').select('*').eq('target_user_id', pid).order('created_at', { ascending: false });
    if (chartId) q = q.eq('chart_id', chartId);
    var r = await q;
    if (r.error) { err('evaluationsFor', r.error); return { fromLeader: [], fromExec: [], fromSelf: [] }; }
    var prof = await sb.from('profiles').select('id,full_name,role');
    var byId = {}; (prof.data || []).forEach(function (p) { byId[p.id] = p; });
    var out = { fromLeader: [], fromExec: [], fromSelf: [] };
    (r.data || []).forEach(function (ev) {
      var evp = byId[ev.evaluator_id] || {};
      var item = {
        evaluatorName: evp.full_name || '—', evaluatorRole: ev.evaluator_role,
        period: ev.period || '', kgi: ev.kgi_stars || 0, kgiComment: ev.kgi_comment || '',
        csf: ev.csf || [], chartId: ev.chart_id, createdAt: ev.created_at
      };
      if (ev.evaluator_id === pid) out.fromSelf.push(item);
      else if (ev.evaluator_role === 'executive') out.fromExec.push(item);
      else out.fromLeader.push(item);
    });
    return out;
  }
  // 自分が自分につけた自己評価の最新1件を取得（チャート別）
  async function loadMySelfEval(chartId) {
    if (!sb) return null;
    var me = await currentProfile(); if (!me) return null;
    var q = sb.from('evaluations').select('*').eq('target_user_id', me.id).eq('evaluator_id', me.id).order('created_at', { ascending: false }).limit(1);
    if (chartId) q = q.eq('chart_id', chartId);
    var r = await q;
    if (r.error || !r.data || !r.data.length) return null;
    var ev = r.data[0];
    return { id: ev.id, chartId: ev.chart_id, period: ev.period || '', kgi: ev.kgi_stars || 0, kgiComment: ev.kgi_comment || '',
      csf: ev.csf || [], submitted: !!ev.submitted, createdAt: ev.created_at };
  }
  // 自己評価を保存（下書き or 提出）。同チャートに下書きがあれば更新、なければ新規。
  async function upsertSelfEval(o) {
    if (!sb) return { error: 'Supabase未接続' };
    var me = await currentProfile(); if (!me) return { error: '未ログイン' };
    var row = {
      target_type: 'user', target_user_id: me.id, evaluator_id: me.id, evaluator_role: 'leader',
      chart_id: o.chartId || null, period: o.period || null,
      kgi_stars: o.kgi || 0, kgi_comment: o.kgiComment || '', csf: o.csf || [],
      submitted: !!o.submitted
    };
    // 同 chart_id の既存「下書き」を探す（提出済は新規作成し履歴を残す）
    var existing = null;
    if (o.chartId) {
      var q = await sb.from('evaluations').select('id,submitted').eq('target_user_id', me.id).eq('evaluator_id', me.id).eq('chart_id', o.chartId).order('created_at', { ascending: false }).limit(1);
      if (q.data && q.data[0] && !q.data[0].submitted) existing = q.data[0];
    }
    if (existing) {
      var u = await sb.from('evaluations').update(row).eq('id', existing.id);
      if (u.error) return { error: friendlyErr(u.error.message) };
      return { id: existing.id, submitted: row.submitted };
    } else {
      var ins = await sb.from('evaluations').insert(row).select().single();
      if (ins.error) return { error: friendlyErr(ins.error.message) };
      return { id: ins.data.id, submitted: row.submitted };
    }
  }
  // 曼荼羅チャートの部分更新（KPI追記・期間変更など）
  async function updateChart(id, patch) {
    if (!sb) return { error: 'Supabase未接続' };
    var r = await sb.from('mandala_charts').update(patch).eq('id', id).select('id');
    if (r.error) return { error: friendlyErr(r.error.message) };
    if (!r.data || r.data.length === 0) return { error: '更新できませんでした（権限不足の可能性）' };
    return { ok: true };
  }
  // メンバー自身のKPI編集を保存（member_kpi_edits列 + acts更新）
  async function saveMemberKpiEdits(chartId, edits, newActs, extra) {
    if (!sb) return { error: 'Supabase未接続' };
    var payload = { member_kpi_edits: edits };
    if (newActs) payload.acts = newActs;
    if (extra && extra.center != null) payload.center = extra.center;   // KGI中心の編集
    if (extra && extra.subs) payload.subs = extra.subs;                 // CSFの編集
    // リトライ＋更新行数の検証（0行=RLS/権限/対象なしの「無言の失敗」を検出）
    var r = await sbRetry(function () { return sb.from('mandala_charts').update(payload).eq('id', chartId).select('id'); });
    if (r.error) return { error: friendlyErr(r.error.message) };
    if (!r.data || r.data.length === 0) {
      // 対象が無ければ作成（owner未設定の取り違え等を救済）。失敗時は明示エラー。
      var me = await currentProfile();
      if (me) {
        var up = await sbRetry(function () {
          return sb.from('mandala_charts').upsert(Object.assign({ id: chartId, owner_type: 'user', owner_user_id: me.id }, payload)).select('id');
        });
        if (!up.error && up.data && up.data.length) return { ok: true };
      }
      return { error: '更新できませんでした（RLS/権限、または対象チャートが存在しません）' };
    }
    return { ok: true };
  }
  // 個人がチャート（KGI/CSF/KPI）を更新した旨を自チームのリーダーへ通知
  async function notifyLeaderChartEdit(summary) {
    if (!sb) return;
    var me = await currentProfile(); if (!me) return;
    var leaderId = null, teamId = null;
    var tm = await sb.from('team_members').select('team_id').eq('profile_id', me.id).maybeSingle();
    if (tm.data) { teamId = tm.data.team_id; var tr = await sb.from('teams').select('leader_id').eq('id', teamId).maybeSingle(); leaderId = tr.data && tr.data.leader_id; }
    if (!leaderId || leaderId === me.id) return;  // リーダー本人なら通知不要
    try {
      await sb.from('notifications').insert({
        to_user_id: leaderId, to_team_id: teamId, type: 'chart_edit',
        title: 'チャート更新', body: (summary || 'メンバーが曼荼羅チャートを更新しました'),
        actor_id: me.id, actor_name: me.full_name
      });
    } catch (e) {}
  }

  // 特定メンバーが持つ全曼荼羅チャート（評価対象選択用）
  async function loadChartsFor(pid) {
    if (!sb || !pid) return [];
    var r = await sb.from('mandala_charts').select('id,name,period,scope_label,center,subs,acts,color,bg,member_kpi_edits').eq('owner_user_id', pid).order('created_at', { ascending: true });
    if (r.error) { err('chartsFor', r.error); return []; }
    return r.data || [];
  }
  // 評価履歴（eval_records）を取得
  async function loadEvalHistory() {
    if (!sb) return [];
    var r = await sb.from('eval_records').select('*').order('created_at', { ascending: false });
    if (r.error) { err('eval_records', r.error); return []; }
    return (r.data || []).map(function (x) {
      return { name: x.evaluatee_name, evaluator: x.evaluator_name, period: x.period,
        kgi: +x.kgi || 0, csf: +x.csf_avg || 0, task: +x.task_avg || 0, comment: x.comment || '', status: x.status || 'done' };
    });
  }
  // 評価をメンバー本人に届ける（個人画面のフィードバックに表示される evaluations へ）
  async function saveEvaluation(o) {
    if (!sb) return { error: 'Supabase未接続' };
    var me = await currentProfile();
    var row = {
      target_type: 'user', target_user_id: o.targetPid || null,
      evaluator_id: me ? me.id : null, evaluator_role: o.evaluatorRole || 'leader',
      period: o.period || null, kgi_stars: o.kgi || 0, kgi_comment: o.kgiComment || '',
      csf: o.csf || []
    };
    if (o.chartId) row.chart_id = o.chartId;
    var r = await sb.from('evaluations').insert(row);
    if (r.error) return { error: friendlyErr(r.error.message) };
    return { ok: true };
  }
  // メンバーの個人曼荼羅チャートを upsert（リーダーが記入＝タスク割当）
  async function upsertMemberChart(o) {
    if (!sb) return { error: 'Supabase未接続' };
    var payload = {
      owner_type: 'user', owner_user_id: o.pid, name: o.name || '個人チャート',
      center: o.center || '', subs: o.subs || [], acts: o.acts || [],
      color: o.color || '#0D9488', bg: o.bg || '#CCEDE9'
    };
    if (o.id) { payload.id = o.id; }
    else { payload.id = 'user_' + o.pid; }
    var r = await sb.from('mandala_charts').upsert(payload).select().single();
    if (r.error) return { error: friendlyErr(r.error.message) };
    return { data: r.data };
  }

  // ===== 個人画面 用アダプタ（引数なし＝ログイン中の本人を自動判定） =====
  async function loadPersonalData(arg) {
    var raw = await fetchAll(); if (!raw) return null;
    var prof = byId(raw.profiles);
    // uid解決: 実UUID / 短縮キー / 未指定(→ログイン中の本人)
    var uid = null;
    if (arg && prof[arg]) uid = arg;
    else if (arg) uid = Object.keys(MEMBER_KEY).filter(function (id) { return MEMBER_KEY[id] === arg; })[0];
    if (!uid) {
      var me = await currentProfile();
      if (me && me.id) uid = me.id;
    }
    if (!uid) uid = 'a0000000-0000-4000-8000-000000000004'; // デモ用フォールバック(中村)
    var memberKey = MEMBER_KEY[uid] || uid;  // 既存=短縮キー / 新規=UUID（チャートidと一致）
    var tm = raw.team_members.filter(function (m) { return m.profile_id === uid; })[0];
    var teamLetter = tm ? TEAM_KEY[tm.team_id] : 'A';
    var teamRow = raw.teams.filter(function (t) { return tm && t.id === tm.team_id; })[0];
    function chartObj(c) {
      return { dbId: c.id, name: c.name, scopeLabel: c.scope_label, period: c.period, startDate: c.start_date ? fmtYMD(c.start_date) : '',
        team: teamRow ? teamRow.name : '', color: c.color, bg: c.bg, center: c.center, subs: c.subs, acts: c.acts,
        memberKpiEdits: c.member_kpi_edits || {} };
    }
    var CHARTS = {};
    raw.mandala_charts.forEach(function (c) {
      if (c.id === 'user_' + memberKey) CHARTS['self_q3'] = chartObj(c);
      else if (c.id === 'user_' + memberKey + '_q2') CHARTS['self_q2'] = chartObj(c);
      else if (c.owner_type === 'team' && TEAM_KEY[c.owner_team_id] === teamLetter) CHARTS['team_' + teamLetter] = chartObj(c);
    });
    // 本人所有の追加チャート（個人画面の新規作成分）も含める
    raw.mandala_charts.forEach(function (c) {
      if (c.owner_type !== 'user' || c.owner_user_id !== uid) return;
      if (CHARTS['self_q3'] && CHARTS['self_q3'].dbId === c.id) return;
      if (CHARTS['self_q2'] && CHARTS['self_q2'].dbId === c.id) return;
      if (!CHARTS['self_q3']) CHARTS['self_q3'] = chartObj(c);
      else CHARTS[c.id] = chartObj(c);
    });

    var FEEDBACK = {};
    raw.evaluations.forEach(function (ev) {
      var ck = ev.chart_id === 'user_' + memberKey ? 'self_q3'
             : ev.chart_id === 'user_' + memberKey + '_q2' ? 'self_q2'
             : ev.chart_id === 'team_' + teamLetter ? 'team_' + teamLetter
             : (ev.target_user_id === uid ? 'self_q3' : null);  // 本人宛て評価は self_q3 に集約
      if (!ck) return;
      if (!FEEDBACK[ck]) FEEDBACK[ck] = { period: ev.period, evals: [] };
      var evp = prof[ev.evaluator_id] || {};
      FEEDBACK[ck].evals.push({ role: ev.evaluator_role === 'executive' ? '幹部' : 'リーダー', name: evp.full_name || '',
        kgi: { stars: ev.kgi_stars, comment: ev.kgi_comment }, csf: ev.csf || [] });
    });

    var ASSIGNMENTS = [], ASSIGN_HISTORY = [];
    raw.tasks.filter(function (t) { return t.assignee_id === uid; }).forEach(function (t) {
      var assigner = prof[t.assigner_id] || {};
      var exec = t.source === 'executive';
      var self = t.source === 'self';
      var chart = t.source_chart || null;
      var meta = chart
        ? '📊 チャート: ' + chart + ' ／ CSF: ' + (t.related_kgi || '—')
        : '関連KGI: ' + (t.related_kgi || '—') + ' ／ カテゴリ: ' + (t.category || '—');
      var from = self ? '🙋 自分で作成' : ('📌 ' + (exec ? '役員' : '上長') + ' · ' + (assigner.full_name || ''));
      if (t.status === 'done' || (t.progress || 0) >= 100) {
        ASSIGN_HISTORY.push({ id: t.id, name: t.title, kpi: t.related_kgi || '—', meta: meta, from: from, fromClass: exec ? 'exec' : '', start: fmtYMD(t.start_date), end: fmtYMD(t.due_date), comment: t.comment || '', completed: t.completed_date ? fmtYMD(t.completed_date) : '', pri: t.priority || 'md', chart: chart, hours: (t.total_hours != null ? +t.total_hours : 0), planned: (t.planned_hours != null ? +t.planned_hours : null) });
      } else {
        ASSIGNMENTS.push({ id: t.id, name: t.title, kpi: t.related_kgi || '—', meta: meta, from: from, fromClass: exec ? 'exec' : '', start: fmtYMD(t.start_date), end: fmtYMD(t.due_date), dueRaw: t.due_date || null, pct: t.progress || 0, comment: t.comment || '', status: t.status, pri: t.priority || 'md', self: self, chart: chart, sendId: t.source_send_id || null, cell: t.source_cell || null, hours: (t.total_hours != null ? +t.total_hours : 0), planned: (t.planned_hours != null ? +t.planned_hours : null) });
      }
    });

    var PREPORTS = raw.daily_reports.filter(function (r) { return r.author_id === uid; })
      .map(function (r) { return { date: r.report_date, hours: r.hours, done: r.done, plan: r.plan, issue: r.issue, cond: r.condition,
        planTasks: r.plan_tasks || '', planHours: r.plan_hours || '', goal: r.goal || '', actualHours: (r.actual_hours != null ? r.actual_hours : ''), submitted: !!r.submitted_at }; });

    // 進捗ダッシュボード用: 自分の達成率・所属チームメンバー一覧
    var myTm = tm || {};
    var TEAM = { name: teamRow ? teamRow.name : '', myRate: myTm.achievement_rate || 0, members: [] };
    if (tm) {
      raw.team_members.filter(function (m) { return m.team_id === tm.team_id; }).forEach(function (m) {
        var p = prof[m.profile_id]; if (!p) return;
        TEAM.members.push({ name: p.full_name, role: m.role_in_team === 'leader' ? '上長' : '従業員', rate: m.achievement_rate || 0, isMe: m.profile_id === uid });
      });
      TEAM.members.sort(function (a, b) { return b.rate - a.rate; });
      TEAM.rate = TEAM.members.length ? Math.round(TEAM.members.reduce(function (a, m) { return a + m.rate; }, 0) / TEAM.members.length) : 0;
    }
    // 自分のCSF別KPI進捗（タスク平均 → 無ければ達成率）
    var myTasks = raw.tasks.filter(function (t) { return t.assignee_id === uid; });
    var KPIS = ((CHARTS['self_q3'] || {}).subs || []).slice(0, 4).map(function (s) {
      var rel = myTasks.filter(function (t) { return t.related_kgi === s; });
      var p = rel.length ? Math.round(rel.reduce(function (a, t) { return a + (t.progress || 0); }, 0) / rel.length) : (myTm.achievement_rate || 0);
      return { n: s, p: Math.max(0, Math.min(100, p)) };
    });
    var todayStr = new Date().toISOString().slice(0, 10);
    var openTasks = myTasks.filter(function (t) { return t.status !== 'done' && (t.progress || 0) < 100; });
    // 本日まで（期限が今日以前）に対応すべき未完了タスク
    var dueByToday = openTasks.filter(function (t) { return t.due_date && t.due_date <= todayStr; });
    var lateTasks = openTasks.filter(function (t) { return t.due_date && t.due_date < todayStr; });
    var doneTasks = myTasks.filter(function (t) { return t.status === 'done' || (t.progress || 0) >= 100; });
    var totalHours = myTasks.reduce(function (a, t) { return a + (t.total_hours != null ? +t.total_hours : 0); }, 0);
    var STATS = {
      rate: myTm.achievement_rate || 0,
      done: doneTasks.length,
      wip: myTasks.filter(function (t) { return t.status === 'wip'; }).length,
      late: lateTasks.length,
      open: openTasks.length,
      dueToday: dueByToday.length,
      // 本日までの達成率 = 期限到来分のうち完了済みの割合
      todayRate: (function () {
        var dueAll = myTasks.filter(function (t) { return t.due_date && t.due_date <= todayStr; });
        if (!dueAll.length) return 100;
        var d = dueAll.filter(function (t) { return t.status === 'done' || (t.progress || 0) >= 100; }).length;
        return Math.round(d / dueAll.length * 100);
      })(),
      totalHours: Math.round(totalHours * 10) / 10
    };

    return { CHARTS: CHARTS, FEEDBACK: FEEDBACK, ASSIGNMENTS: ASSIGNMENTS, ASSIGN_HISTORY: ASSIGN_HISTORY, PREPORTS: PREPORTS, TEAM: TEAM, KPIS: KPIS, STATS: STATS };
  }

  // 統括画面は MND/EMP のみ利用（loadAdminData を流用）
  async function loadTokatsuData() {
    var d = await loadAdminData(); if (!d) return null;
    return { MND: d.MND, EMP: d.EMP };
  }

  // ===== アカウント / チーム CRUD（幹部・管理者のみ: RLS is_admin_or_exec で保護） =====
  function roleToEnum(jp) {
    return jp === '管理者' ? 'admin' : jp === '幹部' ? 'executive' : jp === 'リーダー' ? 'leader' : 'member';
  }
  // チーム短縮キー('A') → 実UUID
  function teamUuidOf(letter) {
    var ids = Object.keys(TEAM_KEY).filter(function (id) { return TEAM_KEY[id] === letter; });
    return ids[0] || null;
  }
  function friendlyErr(msg) {
    msg = String(msg || '');
    if (/duplicate|unique/i.test(msg)) return 'このメールアドレスは既に登録されています';
    if (/permission denied|row-level/i.test(msg)) return '権限がありません。正しい役職のアカウントでログインし直してください（リーダーは自チーム、幹部・管理者は全体）';
    return msg;
  }
  async function createAccount(o) {
    if (!sb) return { error: 'Supabase未接続' };
    var ins = await sb.from('profiles').insert({
      full_name: o.name, email: o.email, role: roleToEnum(o.role || 'メンバー'),
      department: o.department || null, color: o.color || '#0D9488'
    }).select().single();
    if (ins.error) return { error: friendlyErr(ins.error.message) };
    var pid = ins.data.id;
    var teamUuid = o.teamUuid || (o.teamLetter ? teamUuidOf(o.teamLetter) : null);
    if (teamUuid) {
      var tmIns = await sb.from('team_members').insert({
        team_id: teamUuid, profile_id: pid,
        role_in_team: (o.role === 'リーダー') ? 'leader' : 'member',
        achievement_rate: (o.rate != null ? o.rate : 50)
      });
      if (tmIns.error) return { error: friendlyErr(tmIns.error.message) };
    }
    // 発行: ランダムPWを生成し、確認済みユーザーを作成（RPC）。PWは画面表示用に返す
    var genPw = randomPassword();
    var loginEnabled = false;
    try {
      var rpc = await sb.rpc('vexum_create_login', { p_email: o.email, p_password: genPw });
      loginEnabled = !rpc.error;
    } catch (_) { loginEnabled = false; }
    return { data: ins.data, pid: pid, loginEnabled: loginEnabled, password: loginEnabled ? genPw : null };
  }
  // 既存アカウントのパスワードを再発行（RPCで更新）。新PWを返す
  async function resetPassword(email) {
    if (!sb) return { error: 'Supabase未接続' };
    var pw = randomPassword();
    try {
      var rpc = await sb.rpc('vexum_create_login', { p_email: email, p_password: pw });
      if (rpc.error) return { error: friendlyErr(rpc.error.message) };
      return { password: pw };
    } catch (e) { return { error: String(e) }; }
  }
  function randomPassword(len) {
    len = len || 12;
    var c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    var out = '';
    var a = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(len)) : null;
    for (var i = 0; i < len; i++) out += c[(a ? a[i] : Math.floor(Math.random() * 1e9)) % c.length];
    return out;
  }
  async function deleteAccount(pid) {
    if (!sb) return { error: 'Supabase未接続' };
    if (!pid) return { error: '対象アカウントIDが不明です' };
    // FK(NO ACTION) の依存行を先に削除（assigner/assignee/evaluator）
    await sb.from('tasks').delete().eq('assignee_id', pid);
    await sb.from('tasks').delete().eq('assigner_id', pid);
    await sb.from('evaluations').delete().eq('evaluator_id', pid);
    // .select() で実際に削除された行を確認（RLSで弾かれると0件・エラー無しになるため）
    var del = await sb.from('profiles').delete().eq('id', pid).select('id');
    if (del.error) return { error: friendlyErr(del.error.message) };
    if (!del.data || del.data.length === 0) {
      return { error: '削除できませんでした（権限不足の可能性。管理者/幹部アカウントでログインしてください）' };
    }
    return { ok: true };
  }
  async function createTeamRemote(o) {
    if (!sb) return { error: 'Supabase未接続' };
    var t = await sb.from('teams').insert({
      name: o.name, color: o.color || '#0D9488', bg: o.bg || '#F3F4F6',
      leader_id: o.leaderPid || null
    }).select().single();
    if (t.error) return { error: t.error.message };
    var tid = t.data.id;
    var rows = (o.members || []).map(function (mm) {
      return { team_id: tid, profile_id: mm.pid, role_in_team: (mm.pid === o.leaderPid ? 'leader' : 'member'), achievement_rate: (mm.rate != null ? mm.rate : 50) };
    });
    if (rows.length) { var r = await sb.from('team_members').insert(rows); if (r.error) return { error: r.error.message }; }
    return { data: t.data, uid: tid };
  }

  // ===== アカウント編集（氏名・メール・ロール・所属） =====
  async function updateAccount(pid, patch) {
    if (!sb) return { error: 'Supabase未接続' };
    var up = {};
    if (patch.name != null) up.full_name = patch.name;
    if (patch.email != null) up.email = patch.email;
    if (patch.role != null) up.role = roleToEnum(patch.role);
    if (Object.keys(up).length) {
      var r = await sb.from('profiles').update(up).eq('id', pid).select('id');
      if (r.error) return { error: friendlyErr(r.error.message) };
      if (!r.data || r.data.length === 0) return { error: '更新できませんでした（権限不足の可能性。管理者/幹部でログインしてください）' };
    }
    return { ok: true };
  }

  // ===== 自分自身のプロフィール / 認証情報の更新 =====
  async function updateSelf(patch) {
    if (!sb) return { error: 'Supabase未接続' };
    var u = await sb.auth.getUser();
    var uid = u && u.data && u.data.user && u.data.user.id;
    if (!uid) return { error: '未ログイン' };
    // profiles（氏名・メール）
    var prof = {};
    if (patch.name != null) prof.full_name = patch.name;
    if (patch.email != null) prof.email = patch.email;
    if (Object.keys(prof).length) {
      var pr = await sb.from('profiles').update(prof).eq('auth_user_id', uid);
      if (pr.error) return { error: pr.error.message };
    }
    // auth（メール・パスワード）
    var authPatch = {};
    if (patch.email != null) authPatch.email = patch.email;
    if (patch.password) authPatch.password = patch.password;
    if (Object.keys(authPatch).length) {
      var ar = await sb.auth.updateUser(authPatch);
      if (ar.error) return { error: ar.error.message };
    }
    return { ok: true };
  }

  // ===== テンプレート CRUD =====
  async function loadTemplates() {
    if (!sb) return [];
    var r = await sb.from('chart_templates').select('*').order('created_at', { ascending: true });
    if (r.error) { err('templates', r.error); return []; }
    return r.data || [];
  }
  async function createTemplate(o) {
    if (!sb) return { error: 'Supabase未接続' };
    var r = await sb.from('chart_templates').insert({
      name: o.name, center: o.center || '', subs: o.subs || [], acts: o.acts || [],
      color: o.color || '#0D9488', bg: o.bg || '#CCEDE9'
    }).select().single();
    if (r.error) return { error: r.error.message };
    return { data: r.data };
  }
  async function deleteTemplate(id) {
    if (!sb) return { error: 'Supabase未接続' };
    var r = await sb.from('chart_templates').delete().eq('id', id);
    if (r.error) return { error: r.error.message };
    return { ok: true };
  }

  // ===== 送信履歴 CRUD =====
  async function loadSends() {
    if (!sb) return [];
    var r = await sb.from('chart_sends').select('*').order('sent_at', { ascending: false });
    if (r.error) { err('sends', r.error); return []; }
    return r.data || [];
  }
  async function createSend(o) {
    if (!sb) return { error: 'Supabase未接続' };
    var me = await currentProfile();
    var r = await sb.from('chart_sends').insert({
      title: o.title || o.center, center: o.center || '', subs: o.subs || [], acts: o.acts || [],
      to_team: o.toTeam || null, to_profile_id: o.toPid || null, to_name: o.toName || '',
      status: 'sent', progress: 0,
      sent_by: me ? me.id : null, sent_by_name: me ? me.full_name : ''
    }).select().single();
    if (r.error) return { error: r.error.message };
    return { data: r.data };
  }
  // 受信ボックス: 自分宛て（リーダーは自チーム宛ての個人未指定分も含む）の送信を取得
  async function loadMyInbox() {
    if (!sb) return null;
    var me = await currentProfile(); if (!me) return null;
    var r = await sb.from('chart_sends').select('*').order('sent_at', { ascending: false });
    if (r.error) { err('inbox', r.error); return null; }
    var myTeams = {};
    try {
      var t = await sb.from('teams').select('id,name').eq('leader_id', me.id);
      (t.data || []).forEach(function (x) { if (TEAM_KEY[x.id]) myTeams[TEAM_KEY[x.id]] = 1; myTeams[x.name] = 1; });
    } catch (e) {}
    return (r.data || []).filter(function (s) {
      if (s.to_profile_id === me.id) return true;
      if (!s.to_profile_id && s.to_team && myTeams[s.to_team]) return true;
      return false;
    });
  }
  async function updateSend(id, patch) {
    if (!sb) return { error: 'Supabase未接続' };
    patch.updated_at = new Date().toISOString();
    var r = await sb.from('chart_sends').update(patch).eq('id', id);
    if (r.error) return { error: r.error.message };
    return { ok: true };
  }
  async function deleteSend(id) {
    if (!sb) return { error: 'Supabase未接続' };
    var r = await sb.from('chart_sends').delete().eq('id', id);
    if (r.error) return { error: r.error.message };
    return { ok: true };
  }

  // ===== リアルタイム反映 =====
  // tables の変更を購読して cb(table) を呼ぶ。Realtime未設定のDBでも
  // 動くよう、タブ表示中のみのポーリング（45秒）も併用する。
  function subscribeLive(tables, cb) {
    if (!sb) return null;
    var fire = debounce(function (tb) { try { cb(tb); } catch (e) {} }, 800);
    try {
      var ch = sb.channel('vexum-live-' + Math.random().toString(36).slice(2));
      tables.forEach(function (tb) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table: tb }, function () { fire(tb); });
      });
      ch.subscribe();
    } catch (e) {}
    var iv = setInterval(function () {
      if (document.visibilityState === 'visible') fire('*');
    }, 45000);
    return { stop: function () { try { sb.removeChannel(ch); } catch (e) {} clearInterval(iv); } };
  }
  function debounce(fn, ms) {
    var tm = null;
    return function () {
      var args = arguments;
      clearTimeout(tm);
      tm = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  // 現在ログイン中ユーザーの profile（role 判定・リダイレクト用）
  async function currentProfile() {
    if (!sb) return null;
    var u = await sb.auth.getUser();
    var user = u && u.data && u.data.user;
    var uid = user && user.id;
    if (!uid) return null;
    // まず auth_user_id 一致で取得
    var r = await sb.from('profiles').select('*').eq('auth_user_id', uid).maybeSingle();
    if (r.data) return r.data;
    // フォールバック: メール一致で取得し、auth_user_id を自動修復
    var email = user.email;
    if (email) {
      var r2 = await sb.from('profiles').select('*').ilike('email', email).maybeSingle();
      if (r2.data) {
        if (!r2.data.auth_user_id || r2.data.auth_user_id !== uid) {
          try { await sb.from('profiles').update({ auth_user_id: uid }).eq('id', r2.data.id); r2.data.auth_user_id = uid; } catch (e) {}
        }
        return r2.data;
      }
    }
    return null;
  }

  window.VexumAPI = {
    ready: ready,
    sb: sb,
    fetchAll: fetchAll,
    loadAdminData: loadAdminData,
    loadLeaderData: loadLeaderData,
    addTeamMember: addTeamMember,
    removeTeamMember: removeTeamMember,
    updateTeam: updateTeam,
    assignTask: assignTask,
    updateTask: updateTask,
    logTaskTime: logTaskTime,
    setTaskProgress: setTaskProgress,
    loadTaskTimeLogs: loadTaskTimeLogs,
    loadMemberTimeLogs: loadMemberTimeLogs,
    loadNotifications: loadNotifications,
    markNotificationsRead: markNotificationsRead,
    saveDailyReport: saveDailyReport,
    deleteDailyReport: deleteDailyReport,
    saveEvalRecord: saveEvalRecord,
    saveEvaluation: saveEvaluation,
    loadEvalHistory: loadEvalHistory,
    loadEvaluationsFor: loadEvaluationsFor,
    loadChartsFor: loadChartsFor,
    loadMySelfEval: loadMySelfEval,
    upsertSelfEval: upsertSelfEval,
    saveMemberKpiEdits: saveMemberKpiEdits,
    notifyLeaderChartEdit: notifyLeaderChartEdit,
    upsertMemberChart: upsertMemberChart,
    updateChart: updateChart,
    loadPersonalData: loadPersonalData,
    loadTokatsuData: loadTokatsuData,
    createAccount: createAccount,
    updateAccount: updateAccount,
    deleteAccount: deleteAccount,
    resetPassword: resetPassword,
    createTeamRemote: createTeamRemote,
    updateSelf: updateSelf,
    loadTemplates: loadTemplates,
    createTemplate: createTemplate,
    deleteTemplate: deleteTemplate,
    loadSends: loadSends,
    loadMyInbox: loadMyInbox,
    createSend: createSend,
    updateSend: updateSend,
    deleteSend: deleteSend,
    subscribeLive: subscribeLive,
    currentProfile: currentProfile,
    TEAM_KEY: TEAM_KEY,
    MEMBER_KEY: MEMBER_KEY
  };
})();
