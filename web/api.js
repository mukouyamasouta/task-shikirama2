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
        id: key, name: t.name, color: t.color, bg: t.bg,
        leader: MEMBER_KEY[t.leader_id], leaderName: (prof[t.leader_id] || {}).full_name || '',
        members: mems.map(function (m) { return MEMBER_KEY[m.profile_id]; }).filter(Boolean),
        rate: Math.round(mems.reduce(function (a, m) { return a + (m.achievement_rate || 0); }, 0) / (mems.length || 1))
      };
    });

    var MEMBERS = {};
    raw.team_members.forEach(function (m) {
      var key = MEMBER_KEY[m.profile_id], p = prof[m.profile_id]; if (!key || !p) return;
      MEMBERS[key] = { name: p.full_name, email: p.email, role: roleJP(m.role_in_team), team: TEAM_KEY[m.team_id], rate: m.achievement_rate };
    });

    var MND = {}, EMP = {};
    raw.mandala_charts.forEach(function (c) {
      var base = { color: c.color, bg: c.bg, name: c.name, center: c.center, subs: c.subs, acts: c.acts };
      if (c.owner_type === 'team') {
        var tk = TEAM_KEY[c.owner_team_id]; if (!tk) return;
        base.team = c.name; MND[tk] = base;
      } else if (c.id !== 'user_nakamura_q2') {
        var mk = MEMBER_KEY[c.owner_user_id]; if (!mk) return;
        var mem = MEMBERS[mk] || {};
        base.team = letterName[mem.team] || ''; base.role = mem.role || 'メンバー';
        EMP[mk] = base;
      }
    });
    return { TEAMS: TEAMS, MEMBERS: MEMBERS, MND: MND, EMP: EMP };
  }

  function fmtMD(d) { if (!d) return '-'; var p = d.split('-'); return (+p[1]) + '/' + (+p[2]); }
  function fmtYMD(d) { return d ? d.replace(/-/g, '/') : ''; }

  // ===== リーダー画面 用アダプタ =====
  async function loadLeaderData(teamLetter) {
    teamLetter = teamLetter || 'A';
    var raw = await fetchAll(); if (!raw) return null;
    var prof = byId(raw.profiles);
    var teamUuid = Object.keys(TEAM_KEY).filter(function (id) { return TEAM_KEY[id] === teamLetter; })[0];
    var team = raw.teams.filter(function (t) { return t.id === teamUuid; })[0] || { name: '' };
    var chartByUser = {};
    raw.mandala_charts.forEach(function (c) { if (c.owner_type === 'user' && c.id.indexOf('_q2') < 0) chartByUser[c.owner_user_id] = c; });

    var members = raw.team_members.filter(function (m) { return m.team_id === teamUuid; });
    members.sort(function (a, b) { return (a.role_in_team === 'leader' ? 0 : 1) - (b.role_in_team === 'leader' ? 0 : 1); });

    var MEMBERS = {}, DASH_IDS = [], EVAL_IDS = [];
    members.forEach(function (m) {
      var key = MEMBER_KEY[m.profile_id], p = prof[m.profile_id]; if (!key || !p) return;
      var c = chartByUser[m.profile_id] || { subs: [], acts: [], center: '' };
      var tk = raw.tasks.filter(function (t) { return t.assignee_id === m.profile_id; });
      var stats = { done: tk.filter(function (t) { return t.status === 'done'; }).length,
                    wip: tk.filter(function (t) { return t.status === 'wip'; }).length,
                    late: tk.filter(function (t) { return t.status === 'late'; }).length };
      var adj = [4, -6, 8, -2];
      var kpis = (c.subs || []).slice(0, 4).map(function (s, i) {
        return { n: s, p: Math.max(0, Math.min(100, (m.achievement_rate || 0) + adj[i])) };
      });
      MEMBERS[key] = {
        name: p.full_name, role: m.role_in_team === 'leader' ? 'リーダー' : '従業員', team: team.name,
        color: p.color, bg: '#F3F4F6', rate: m.achievement_rate, kpis: kpis, stats: stats,
        center: c.center || (p.full_name + '\n個人目標'), subs: c.subs || [], acts: c.acts || []
      };
      DASH_IDS.push(key);
      if (m.role_in_team !== 'leader') EVAL_IDS.push(key);
    });

    var MEMBER_TASKS = {};
    raw.tasks.forEach(function (t) {
      var key = MEMBER_KEY[t.assignee_id]; if (!key || !MEMBERS[key]) return;
      (MEMBER_TASKS[key] = MEMBER_TASKS[key] || []).push({
        name: t.title, kpi: t.related_kgi || '—', start: fmtMD(t.start_date), due: fmtMD(t.due_date), pri: t.priority, status: t.status
      });
    });

    var REPORTS = {};
    raw.daily_reports.forEach(function (r) {
      var key = MEMBER_KEY[r.author_id]; if (!key || !MEMBERS[key]) return;
      (REPORTS[key] = REPORTS[key] || []).push({ date: r.report_date, hours: r.hours, done: r.done, plan: r.plan, issue: r.issue, cond: r.condition });
    });

    var EVAL_RECORDS = raw.eval_records.map(function (r) {
      return { name: r.evaluatee_name, evaluator: r.evaluator_name, period: r.period, kgi: +r.kgi, csf: +r.csf_avg, task: +r.task_avg, comment: r.comment, status: r.status };
    });

    var assigned = {}; raw.team_members.forEach(function (m) { assigned[m.profile_id] = 1; });
    var AVAILABLE = {};
    raw.profiles.forEach(function (p) {
      if (assigned[p.id] || p.role === 'admin' || p.role === 'executive') return;
      var key = MEMBER_KEY[p.id]; if (!key) return;
      AVAILABLE[key] = {
        name: p.full_name, role: '従業員', team: '（未所属）', email: p.email, color: p.color, bg: '#F3F4F6', rate: 50,
        kpis: [{ n: '重点目標1', p: 50 }, { n: '重点目標2', p: 40 }, { n: '重点目標3', p: 58 }, { n: '重点目標4', p: 50 }],
        stats: { done: 0, wip: 0, late: 0 }, center: p.full_name + '\n個人目標',
        subs: Array.from({ length: 8 }, function (_, i) { return '重点目標' + (i + 1); }),
        acts: Array.from({ length: 8 }, function (_, i) { return Array.from({ length: 8 }, function (__, j) { return '施策' + (i + 1) + '-' + (j + 1); }); })
      };
    });
    return { MEMBERS: MEMBERS, MEMBER_TASKS: MEMBER_TASKS, REPORTS: REPORTS, EVAL_RECORDS: EVAL_RECORDS, DASH_IDS: DASH_IDS, EVAL_IDS: EVAL_IDS, AVAILABLE: AVAILABLE, teamName: team.name };
  }

  // ===== 個人画面 用アダプタ =====
  async function loadPersonalData(memberKey) {
    memberKey = memberKey || 'nakamura';
    var raw = await fetchAll(); if (!raw) return null;
    var prof = byId(raw.profiles);
    var uid = Object.keys(MEMBER_KEY).filter(function (id) { return MEMBER_KEY[id] === memberKey; })[0];
    var tm = raw.team_members.filter(function (m) { return m.profile_id === uid; })[0];
    var teamLetter = tm ? TEAM_KEY[tm.team_id] : 'A';
    var teamRow = raw.teams.filter(function (t) { return tm && t.id === tm.team_id; })[0];
    function chartObj(c) {
      return { name: c.name, scopeLabel: c.scope_label, period: c.period, startDate: c.start_date ? fmtYMD(c.start_date) : '',
        team: teamRow ? teamRow.name : '', color: c.color, bg: c.bg, center: c.center, subs: c.subs, acts: c.acts };
    }
    var CHARTS = {};
    raw.mandala_charts.forEach(function (c) {
      if (c.id === 'user_' + memberKey) CHARTS['self_q3'] = chartObj(c);
      else if (c.id === 'user_' + memberKey + '_q2') CHARTS['self_q2'] = chartObj(c);
      else if (c.owner_type === 'team' && TEAM_KEY[c.owner_team_id] === teamLetter) CHARTS['team_' + teamLetter] = chartObj(c);
    });

    var FEEDBACK = {};
    raw.evaluations.forEach(function (ev) {
      var ck = ev.chart_id === 'user_' + memberKey ? 'self_q3'
             : ev.chart_id === 'user_' + memberKey + '_q2' ? 'self_q2'
             : ev.chart_id === 'team_' + teamLetter ? 'team_' + teamLetter : null;
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
      var meta = '関連KGI: ' + (t.related_kgi || '—') + ' ／ カテゴリ: ' + (t.category || '—');
      var from = '📌 ' + (exec ? '役員' : '上長') + ' · ' + (assigner.full_name || '');
      if (t.status === 'done' || (t.progress || 0) >= 100) {
        ASSIGN_HISTORY.push({ name: t.title, meta: meta, from: from, fromClass: exec ? 'exec' : '', start: fmtYMD(t.start_date), end: fmtYMD(t.due_date), comment: t.comment || '', completed: t.completed_date ? fmtYMD(t.completed_date) : '' });
      } else {
        ASSIGNMENTS.push({ name: t.title, meta: meta, from: from, fromClass: exec ? 'exec' : '', start: fmtYMD(t.start_date), end: fmtYMD(t.due_date), pct: t.progress || 0, comment: t.comment || '' });
      }
    });

    var PREPORTS = raw.daily_reports.filter(function (r) { return r.author_id === uid; })
      .map(function (r) { return { date: r.report_date, hours: r.hours, done: r.done, plan: r.plan, issue: r.issue, cond: r.condition }; });

    return { CHARTS: CHARTS, FEEDBACK: FEEDBACK, ASSIGNMENTS: ASSIGNMENTS, ASSIGN_HISTORY: ASSIGN_HISTORY, PREPORTS: PREPORTS };
  }

  // 統括画面は MND/EMP のみ利用（loadAdminData を流用）
  async function loadTokatsuData() {
    var d = await loadAdminData(); if (!d) return null;
    return { MND: d.MND, EMP: d.EMP };
  }

  // 現在ログイン中ユーザーの profile（role 判定・リダイレクト用）
  async function currentProfile() {
    if (!sb) return null;
    var u = await sb.auth.getUser();
    var uid = u && u.data && u.data.user && u.data.user.id;
    if (!uid) return null;
    var r = await sb.from('profiles').select('*').eq('auth_user_id', uid).single();
    return r.data || null;
  }

  window.VexumAPI = {
    ready: ready,
    sb: sb,
    fetchAll: fetchAll,
    loadAdminData: loadAdminData,
    loadLeaderData: loadLeaderData,
    loadPersonalData: loadPersonalData,
    loadTokatsuData: loadTokatsuData,
    currentProfile: currentProfile,
    TEAM_KEY: TEAM_KEY,
    MEMBER_KEY: MEMBER_KEY
  };
})();
