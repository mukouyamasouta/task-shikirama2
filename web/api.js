/* =====================================================================
 * web/api.js — Supabase データアクセス層（クラシックスクリプト/UMD前提）
 *   読込順: supabase-js(UMD) → config.js → api.js → 各画面のbootstrap
 *   window.VexumAPI を公開。未設定時は ready=false（画面は内蔵デモのまま）
 * ===================================================================== */
(function () {
  var cfg = window.SUPABASE_CONFIG || {};
  var ready = !!(cfg.url && cfg.anonKey && !/YOUR-/.test(cfg.url) && window.supabase);
  var sb = ready ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;

  // 固定UUID → 画面側の短縮キー（supabase/REBUILD.sql のシードデータと一致）
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
    // 論理削除（is_active=false）のアカウントは全画面から除外。
    // is_active 列が無い(30未適用)DBでは undefined のため除外されない（後方互換）。
    out.profiles = out.profiles.filter(function (p) { return p.is_active !== false; });
    return out;
  }

  function byId(rows) { var m = {}; rows.forEach(function (r) { m[r.id] = r; }); return m; }
  function roleJP(r) { return r === 'leader' ? 'リーダー' : 'メンバー'; }
  // 固定UUIDは短縮キー、それ以外（新規作成分）は生UUIDをキーに使う
  function memKey(id) { return MEMBER_KEY[id] || id; }
  function roleJPFull(r) { return r === 'admin' ? '管理者' : r === 'executive' ? '幹部' : r === 'leader' ? 'リーダー' : 'メンバー'; }

  // ===== チーム集計の共通ユーティリティ（人物単位・チャート基準で全画面統一） =====
  // 同一人物(email)単位でチームメンバーを集約。1人=1要素（複数ロールでも1人）。
  // 返り値: [{ email, name, color, pids:[全profile_id], roles:[JP], rate, primaryPid, isLeader }]
  function personsOfTeam(teamMembers, profById) {
    var byEmail = {};
    (teamMembers || []).forEach(function (m) {
      var p = profById[m.profile_id]; if (!p) return;
      var e = (p.email || m.profile_id).toLowerCase();
      if (!byEmail[e]) byEmail[e] = { email: e, name: p.full_name, color: p.color, pids: [], roles: [], rate: 0, primaryPid: m.profile_id, isLeader: false };
      var g = byEmail[e];
      if (g.pids.indexOf(m.profile_id) < 0) g.pids.push(m.profile_id);
      var jp = (m.role_in_team === 'leader') ? 'リーダー' : '従業員';
      if (g.roles.indexOf(jp) < 0) g.roles.push(jp);
      if (m.role_in_team === 'leader') { g.isLeader = true; g.primaryPid = m.profile_id; }
      g.rate = Math.max(g.rate, m.achievement_rate || 0);
    });
    return Object.keys(byEmail).map(function (e) { return byEmail[e]; });
  }
  // チームの進捗% = チーム曼荼羅＋所属メンバー個人チャートのKGI(中心)達成率の平均。
  // 対象チャートが0件なら null を返す（UI側で '—' = データなし 表示。0除算で誤った%を出さない）。
  // ★全画面（リーダー/幹部）でこの1関数を使い、画面間の数値ズレを排除する。
  function calcTeamProgress(charts, teamId, memberPids) {
    var ids = memberPids || [];
    var rel = (charts || []).filter(function (c) {
      return (teamId && c.owner_team_id === teamId) || (c.owner_user_id && ids.indexOf(c.owner_user_id) >= 0);
    });
    if (!rel.length) return null;
    var sum = 0;
    rel.forEach(function (c) {
      var ed = (c.member_kpi_edits || {})['center'];
      var p = (ed && ed.progress != null) ? +ed.progress : 0;
      sum += Math.max(0, Math.min(100, p || 0));
    });
    return Math.round(sum / rel.length);
  }

  // ===== 幹部(管理)画面 用アダプタ → {TEAMS, MEMBERS, MND, EMP} =====
  async function loadAdminData() {
    var raw = await fetchAll(); if (!raw) return null;
    var prof = byId(raw.profiles);
    var teamById = byId(raw.teams);
    var letterName = {}; // 'A' -> '営業チームA'（新規チームは UUID をキーに使う）
    Object.keys(teamById).forEach(function (id) { letterName[TEAM_KEY[id] || id] = teamById[id].name; });

    var TEAMS = {};
    raw.teams.forEach(function (t) {
      // シード3チームは短縮キー、それ以外（新規作成）は UUID をキーに採用して必ず含める
      var key = TEAM_KEY[t.id] || t.id;
      var mems = raw.team_members.filter(function (m) { return m.team_id === t.id; });
      var persons = personsOfTeam(mems, prof);                    // 人物単位（emailで集約）
      var teamProg = calcTeamProgress(raw.mandala_charts, t.id, mems.map(function (m) { return m.profile_id; }));
      TEAMS[key] = {
        id: key, uid: t.id, name: t.name, color: t.color, bg: t.bg,
        leader: memKey(t.leader_id), leaderName: (prof[t.leader_id] || {}).full_name || '',
        members: mems.map(function (m) { return memKey(m.profile_id); }).filter(Boolean),
        memberCount: persons.length,                              // 人物単位の人数（重複ロールを1人に）
        progress: teamProg,                                       // チャート基準（0件なら null='—'）
        rate: teamProg != null ? teamProg : 0                     // 進捗（後方互換: rateにも反映）
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
        team: tm ? (TEAM_KEY[tm.team_id] || tm.team_id) : '',
        rate: tm ? (tm.achievement_rate || 0) : 50
      };
    });

    var MND = {}, EMP = {};
    raw.mandala_charts.forEach(function (c) {
      var base = { color: c.color, bg: c.bg, name: c.name, center: c.center, subs: c.subs, acts: c.acts, startDate: c.start_date ? fmtYMD(c.start_date) : '', endDate: c.end_date ? fmtYMD(c.end_date) : '', period: c.period || '' };
      if (c.owner_type === 'team') {
        var tk = TEAM_KEY[c.owner_team_id] || c.owner_team_id; if (!tk) return;
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
  // tasks.source_cell → CSFインデックス（0-7）の復元。
  // 正規形は素の数字文字列（'0'等・KPI廃止後にassignTask/updateTaskが書き込む形式）だが、
  // KPI廃止前のリーダー受信ボックス割当（leader.html ibAssign）が書いた 'csf-N' / 'N-M'
  // （KPIスロット指定）形式の既存データも救済し、CSF配下からタスクが消えないようにする。
  function csfIdxFromCell(cell) {
    if (cell == null) return null;
    var s = String(cell);
    var m = /^(?:csf-)?(\d+)(?:-\d+)?$/.exec(s);
    if (!m) return null;
    var n = +m[1];
    // CSFは常に0-7の8スロット。範囲外は不正データとしてnull扱いにし、
    // 「一致するCSF行が無いため一覧からも未紐付けバケットからも漏れて消える」事故を防ぐ
    return (n >= 0 && n <= 7) ? n : null;
  }
  // 書き込み前の正規化: 'csf-N'/'N-M' 等どんな形式で渡されても、判別できればCSFインデックスの
  // 素の数字文字列に矯正して保存する（呼び出し側の書式ミスが将来また「タスク消失」を再発させないための防御）。
  // 判別できない値（想定外の形式）はそのまま残し、情報を失わない。
  function normalizeCell(cell) {
    if (cell == null) return null;
    var idx = csfIdxFromCell(cell);
    return idx != null ? String(idx) : cell;
  }

  // ===== リーダー画面 用アダプタ（引数なし＝ログイン中リーダーの担当チームを自動判定） =====
  async function loadLeaderData(teamLetter) {
    var raw = await fetchAll(); if (!raw) return null;
    var prof = byId(raw.profiles);
    var teamUuid = null;
    if (teamLetter) {
      teamUuid = Object.keys(TEAM_KEY).filter(function (id) { return TEAM_KEY[id] === teamLetter; })[0] || teamLetter;
    } else {
      // ログイン中ユーザーが「リーダーのチーム」を特定（マルチロール対応4段階フォールバック）
      var me = await currentProfile();
      if (me && me.id) {
        // 1. leader_id直接一致
        var t1 = raw.teams.filter(function(t){ return t.leader_id === me.id; })[0];
        if (t1) teamUuid = t1.id;
        if (!teamUuid) {
          // 2. 同メールの全profileでleader_id照合（マルチロール不一致対応）
          var myPids = raw.profiles.filter(function(p){ return p.email === me.email; }).map(function(p){ return p.id; });
          var t2 = raw.teams.filter(function(t){ return myPids.indexOf(t.leader_id) >= 0; })[0];
          if (t2) teamUuid = t2.id;
        }
        if (!teamUuid) {
          // 3. team_members.role_in_team='leader' で照合
          var tm0 = raw.team_members.filter(function(m){ return m.profile_id === me.id; });
          var lead = tm0.filter(function(m){ return m.role_in_team === 'leader'; })[0] || tm0[0];
          if (lead) teamUuid = lead.team_id;
        }
        if (!teamUuid) {
          // 4. 同メール全profileでteam_members照合
          var myPids2 = raw.profiles.filter(function(p){ return p.email === me.email; }).map(function(p){ return p.id; });
          var tm1 = raw.team_members.filter(function(m){ return myPids2.indexOf(m.profile_id) >= 0 && m.role_in_team === 'leader'; })[0]
                 || raw.team_members.filter(function(m){ return myPids2.indexOf(m.profile_id) >= 0; })[0];
          if (tm1) teamUuid = tm1.team_id;
        }
      }
    }
    // チームが特定できない場合は team_A にフォールバックしない（他チームのメンバー混入を防ぐ）。
    // teamUuid=null のまま進めば members は空になり、未所属リーダーには何も表示されない。
    teamLetter = teamUuid ? (TEAM_KEY[teamUuid] || teamUuid) : '';
    var team = raw.teams.filter(function (t) { return teamUuid && t.id === teamUuid; })[0] || { name: '' };
    var chartByUser = {};
    raw.mandala_charts.forEach(function (c) { if (c.owner_type === 'user' && c.id.indexOf('_q2') < 0) chartByUser[c.owner_user_id] = c; });

    var members = raw.team_members.filter(function (m) { return m.team_id === teamUuid; });
    // 同一人物(email)が複数ロールで複数行ある場合は1人に集約（メンバー数の二重計上を防ぐ）
    var persons = personsOfTeam(members, prof);
    persons.sort(function (a, b) { return (a.isLeader ? 0 : 1) - (b.isLeader ? 0 : 1); });

    var MEMBERS = {}, DASH_IDS = [], EVAL_IDS = [];
    var pidToKey = {};   // profile_id → 集約後の代表キー（タスク/日報を人物単位で合算するため）
    persons.forEach(function (person) {
      var p = prof[person.primaryPid]; if (!p) return;
      var key = memKey(person.primaryPid);
      person.pids.forEach(function (pid) { pidToKey[pid] = key; });
      // この人物のいずれかの profile が持つ個人チャート
      var c = null;
      for (var i = 0; i < person.pids.length; i++) { if (chartByUser[person.pids[i]]) { c = chartByUser[person.pids[i]]; break; } }
      c = c || { subs: [], acts: [], center: '' };
      // この人物の全タスク（複数ロール分を合算）
      var tk = raw.tasks.filter(function (t) { return person.pids.indexOf(t.assignee_id) >= 0; });
      var stats = { done: tk.filter(function (t) { return t.status === 'done'; }).length,
                    wip: tk.filter(function (t) { return t.status === 'wip'; }).length,
                    late: tk.filter(function (t) { return t.status === 'late'; }).length };
      var kpis = (c.subs || []).slice(0, 4).map(function (s) {
        var rel = tk.filter(function (t) { return t.related_kgi === s; });
        var pp = rel.length
          ? Math.round(rel.reduce(function (a, t) { return a + (t.progress || 0); }, 0) / rel.length)
          : (person.rate || 0);
        return { n: s, p: Math.max(0, Math.min(100, pp)) };
      });
      MEMBERS[key] = {
        pid: p.id, chartId: c.id || null,
        name: p.full_name, role: person.isLeader ? 'リーダー' : '従業員', roles: person.roles, team: team.name,
        color: p.color, bg: '#F3F4F6', rate: person.rate, kpis: kpis, stats: stats,
        center: c.center || (p.full_name + '\n個人目標'), subs: c.subs || [], acts: c.acts || [],
        memberKpiEdits: c.member_kpi_edits || {}
      };
      DASH_IDS.push(key);
      if (person.roles.indexOf('従業員') >= 0) EVAL_IDS.push(key);   // 従業員ロールを持つ人物は評価対象
    });

    var MEMBER_TASKS = {};
    raw.tasks.forEach(function (t) {
      var key = pidToKey[t.assignee_id]; if (!key || !MEMBERS[key]) return;
      (MEMBER_TASKS[key] = MEMBER_TASKS[key] || []).push({
        id: t.id, name: t.title, kpi: t.related_kgi || '—', start: fmtMD(t.start_date), due: fmtMD(t.due_date), dueRaw: t.due_date || null, pri: t.priority, status: t.status,
        pct: t.progress || 0, hours: (t.total_hours != null ? +t.total_hours : 0), period: t.period || '', chart: t.source_chart || null, sendId: t.source_send_id || null, cell: t.source_cell || null,
        csfIdx: csfIdxFromCell(t.source_cell)
      });
    });

    // pidToKeyに含まれない同一人物のprofile_idを追加（マルチロールで日報のauthor_idが異なる場合の対応）
    persons.forEach(function(person) {
      var representKey = pidToKey[person.pids[0]];
      if (!representKey) return;
      var emails = person.pids.map(function(pid){ var p=prof[pid]; return p?p.email:''; }).filter(Boolean);
      raw.profiles.forEach(function(rp){
        if (emails.indexOf(rp.email) >= 0 && !pidToKey[rp.id]) pidToKey[rp.id] = representKey;
      });
    });

    var REPORTS = {};
    raw.daily_reports.forEach(function (r) {
      var key = pidToKey[r.author_id]; if (!key || !MEMBERS[key]) return;
      (REPORTS[key] = REPORTS[key] || []).push({
        date: r.report_date, hours: r.hours, done: r.done, plan: r.plan, issue: r.issue, cond: r.condition,
        // 始業(計画)/終業(実績)の内訳。employee.html側と同じ列から取得し、
        // リーダー画面でも「始業のみ（予定）」の日報を判別・表示できるようにする
        planTasks: r.plan_tasks || '', planHours: r.plan_hours || '', goal: r.goal || '',
        actualHours: (r.actual_hours != null ? r.actual_hours : ''), submitted: !!r.submitted_at
      });
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
    // チーム集計（人物単位の人数・チャート基準の進捗％。幹部画面と同一ロジックで一致させる）
    var teamProgress = calcTeamProgress(raw.mandala_charts, teamUuid, members.map(function (m) { return m.profile_id; }));
    return { MEMBERS: MEMBERS, MEMBER_TASKS: MEMBER_TASKS, REPORTS: REPORTS, EVAL_RECORDS: EVAL_RECORDS, DASH_IDS: DASH_IDS, EVAL_IDS: EVAL_IDS, AVAILABLE: AVAILABLE, teamName: team.name, teamUuid: teamUuid, memberPid: memberPid, teamProgress: teamProgress, memberCount: persons.length };
  }

  // ===== リーダー操作：チーム所属の追加/削除・タスク割当・評価記録 =====
  // ★リーダーをチームに配置したら teams.leader_id も必ず同期する。
  //   team_members.role_in_team='leader' だけ設定して leader_id が旧リーダー/NULL のままだと、
  //   日報・タスク完了通知（_getLeaderForProfile → teams.leader_id）が新リーダーに届かない
  //   実障害が過去に発生している（チーム「テスト」の leader_id 不整合）。
  async function _syncTeamLeader(teamUuid, pid) {
    if (!sb || !teamUuid || !pid) return;
    try { await sb.from('teams').update({ leader_id: pid }).eq('id', teamUuid); }
    catch (e) { console.warn('[VexumAPI] teams.leader_id 同期失敗:', e); }
  }
  async function addTeamMember(teamUuid, pid, role, rate) {
    if (!sb) return { error: 'Supabase未接続' };
    var isLeader = (role === 'リーダー' || role === 'leader');
    // 既存所属があっても失敗しないよう UPSERT（PK: team_id,profile_id）
    var r = await sb.from('team_members').upsert({
      team_id: teamUuid, profile_id: pid,
      role_in_team: (isLeader ? 'leader' : 'member'),
      achievement_rate: (rate != null ? rate : 50)
    }, { onConflict: 'team_id,profile_id' }).select('team_id');
    if (r.error) return { error: friendlyErr(r.error.message) };
    if (isLeader) await _syncTeamLeader(teamUuid, pid);
    return { ok: true };
  }
  // 仕様準拠の別名: チーム所属を保存（UPSERT）。role はロール名 or 'leader'/'member'
  async function saveTeamMember(profileId, teamId, role) {
    if (!sb) return { error: 'Supabase未接続' };
    if (!profileId || !teamId) return { error: 'profile/team が不明です' };
    var isLeader = (role === 'リーダー' || role === 'leader');
    var r = await sb.from('team_members').upsert({
      team_id: teamId, profile_id: profileId,
      role_in_team: (isLeader ? 'leader' : 'member')
    }, { onConflict: 'team_id,profile_id' }).select('team_id');
    if (r.error) return { error: friendlyErr(r.error.message) };
    if (isLeader) await _syncTeamLeader(teamId, profileId);
    return { ok: true };
  }
  // 指定チームの編成（team_members JOIN profiles）を返す
  async function loadTeamComposition(teamId) {
    if (!sb || !teamId) return [];
    var tm = await sb.from('team_members').select('profile_id,team_id,role_in_team,achievement_rate').eq('team_id', teamId);
    if (tm.error || !tm.data) return [];
    var ids = tm.data.map(function (x) { return x.profile_id; });
    var pmap = {};
    if (ids.length) { var pr = await sb.from('profiles').select('id,full_name,email,role').in('id', ids); (pr.data || []).forEach(function (p) { pmap[p.id] = p; }); }
    return tm.data.map(function (x) {
      var p = pmap[x.profile_id] || {};
      return { profile_id: x.profile_id, team_id: x.team_id, role_in_team: x.role_in_team, achievement_rate: x.achievement_rate, full_name: p.full_name, email: p.email, role: p.role };
    });
  }
  // プロフィールのロールを変更（幹部/管理者）。所属チームの role_in_team も同期。
  async function updateProfileRole(profileId, newRole) {
    if (!sb) return { error: 'Supabase未接続' };
    if (!profileId) return { error: 'profile が不明です' };
    var roleEnumVal = roleToEnum(newRole);
    var r = await sb.from('profiles').update({ role: roleEnumVal }).eq('id', profileId).select('id');
    if (r.error) { console.warn('[VexumAPI] updateProfileRole failed:', r.error); return { error: friendlyErr(r.error.message) }; }
    if (!r.data || !r.data.length) return { error: '更新できませんでした（権限不足の可能性。管理者/幹部でログインしてください）' };
    // 注: team_members.role_in_team は「チーム単位」の属性のため、ここで全チームを
    // 一括更新すると複数チーム所属者のロールが崩れる。該当チームの同期は呼び出し側
    // （submitAccEdit → addTeamMember(teamUuid,...,role)）で行う。
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
  // チーム編成の差分同期: 現在の team_members と newMemberIds(profile_id配列) を比較し
  // 追加分は UPSERT・除外分は DELETE する。
  async function syncTeamMembers(teamId, newMemberIds) {
    if (!sb || !teamId) return { error: 'チームが不明です' };
    var cur = await sb.from('team_members').select('profile_id').eq('team_id', teamId);
    if (cur.error) return { error: friendlyErr(cur.error.message) };
    var existing = (cur.data || []).map(function (x) { return x.profile_id; });
    var want = (newMemberIds || []).filter(Boolean);
    var toAdd = want.filter(function (id) { return existing.indexOf(id) < 0; });
    var toDel = existing.filter(function (id) { return want.indexOf(id) < 0; });
    if (toAdd.length) {
      var rows = toAdd.map(function (id) { return { team_id: teamId, profile_id: id, role_in_team: 'member', achievement_rate: 50 }; });
      var a = await sb.from('team_members').upsert(rows, { onConflict: 'team_id,profile_id' });
      if (a.error) return { error: friendlyErr(a.error.message) };
    }
    if (toDel.length) {
      var d = await sb.from('team_members').delete().eq('team_id', teamId).in('profile_id', toDel);
      if (d.error) return { error: friendlyErr(d.error.message) };
    }
    return { ok: true, added: toAdd.length, removed: toDel.length };
  }
  // チーム削除（team_members を外してから teams を削除）。削除行数を検証。
  async function deleteTeam(teamId) {
    if (!sb || !teamId) return { error: 'チームが不明です' };
    try { await sb.from('team_members').delete().eq('team_id', teamId); } catch (e) {}
    var del = await sb.from('teams').delete().eq('id', teamId).select('id');
    if (del.error) return { error: friendlyErr(del.error.message) };
    if (!del.data || del.data.length === 0) return { error: '削除できませんでした（権限不足の可能性。32_fix_yamamoto.sql の teams RLS を適用してください）' };
    return { ok: true };
  }
  // 削除前の警告用: チームに紐づくチャート・タスク件数
  async function teamRefCounts(teamId) {
    if (!sb || !teamId) return { charts: 0, tasks: 0 };
    var charts = 0, tasks = 0;
    try { var c = await sb.from('mandala_charts').select('id', { count: 'exact', head: true }).eq('owner_team_id', teamId); charts = c.count || 0; } catch (e) {}
    try { var t = await sb.from('tasks').select('id', { count: 'exact', head: true }).eq('team_id', teamId); tasks = t.count || 0; } catch (e) {}
    return { charts: charts, tasks: tasks };
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
    if (o.sendId) { row.source_send_id = o.sendId; row.source_cell = normalizeCell(o.cell); row.source_chart = o.chartTitle || null; }
    // 受信チャート以外でも、個人画面でKGI（チャート）に紐付けて作成した場合の関連付け
    else if (o.chartTitle) { row.source_chart = o.chartTitle; if (o.cell != null) row.source_cell = normalizeCell(o.cell); }
    // KPI廃止: source_kpi への書き込みは停止（カラムは後方互換のため残置）
    var r = await sb.from('tasks').insert(row).select().single();
    if (r.error && /source_send_id|source_cell|source_chart|source_kpi|period|planned_hours/.test(r.error.message)) {
      // 拡張列が未適用のDB: 拡張列なしで作成（後方互換）
      delete row.source_send_id; delete row.source_cell; delete row.source_chart; delete row.source_kpi; delete row.period; delete row.planned_hours;
      r = await sb.from('tasks').insert(row).select().single();
    }
    if (r.error) return { error: friendlyErr(r.error.message) };
    // ★割り当てられた本人へ通知（リーダー/幹部→従業員）。自作タスク(assigneePid未指定=本人)は通知しない
    try {
      if (o.assigneePid && me && o.assigneePid !== me.id) {
        await sb.from('notifications').insert({
          to_user_id: o.assigneePid, to_team_id: o.teamUuid || null, type: 'task_assigned',
          title: 'タスクが割り当てられました', body: '「' + (o.title || 'タスク') + '」',
          actor_id: me ? me.id : null, actor_name: me ? me.full_name : '', ref_id: (r.data && r.data.id) || null
        });
      }
    } catch (e) { console.warn('[VEXUM notify] notifications insert失敗 (task_assigned):', e); }
    return { data: r.data };
  }
  // タスクの進捗・状態・コメントを更新（個人画面の保存系）
  async function updateTask(id, patch) {
    if (!sb) return { error: 'Supabase未接続' };
    if (!id) return { error: 'タスクIDが不明です（デモデータは保存対象外）' };
    var up = {};
    if (patch.title != null) up.title = patch.title;
    if (patch.progress != null) up.progress = patch.progress;
    if (patch.status) up.status = patch.status;
    if (patch.comment != null) up.comment = patch.comment;
    if (patch.completedDate !== undefined) up.completed_date = patch.completedDate;
    if (patch.assigneePid) up.assignee_id = patch.assigneePid;   // 未割当タスクの割当用
    if (patch.start !== undefined) up.start_date = patch.start;
    if (patch.due !== undefined) up.due_date = patch.due;
    if (patch.priority) up.priority = patch.priority;
    // チャート紐付けの変更（タスク編集モーダルの①②③）
    if (patch.sourceChart !== undefined) up.source_chart = patch.sourceChart;
    if (patch.sourceCell !== undefined) up.source_cell = normalizeCell(patch.sourceCell);
    // KPI廃止: sourceKpi パッチは無視（source_kpi カラムは残置・読み書き停止）
    if (patch.relatedKgi !== undefined) up.related_kgi = patch.relatedKgi;
    var r = await sb.from('tasks').update(up).eq('id', id).select('id');
    if (r.error) return { error: friendlyErr(r.error.message) };
    if (!r.data || r.data.length === 0) return { error: '更新できませんでした（権限不足の可能性）' };
    // 受信チャート由来のタスクなら、チャート（chart_sends）の該当セルと全体進捗へ自動反映
    try { await propagateTaskToSend(id); } catch (e) {}
    // 完了時にリーダーへ通知（setTaskProgress経由でないupdateTask完了パスでも通知を発火）
    var done = (up.progress != null && up.progress >= 100) || up.status === 'done';
    if (done) { try { await notifyTaskDone(id); } catch (e) {} }
    return { ok: true };
  }
  // タスクを削除（本人のタスクのみ。RLSで保護）。返り値で削除行数を検証。
  async function deleteTask(id) {
    if (!sb) return { error: 'Supabase未接続' };
    if (!id) return { error: 'タスクIDが不明です（デモデータは保存対象外）' };
    var r = await sbRetry(function () { return sb.from('tasks').delete().eq('id', id).select('id'); });
    if (r.error) return { error: friendlyErr(r.error.message) };
    if (!r.data || r.data.length === 0) return { error: '削除できませんでした（権限不足の可能性）' };
    return { ok: true };
  }
  // 曼荼羅チャートを削除（本人所有のみ。RLSで保護）。返り値で削除行数を検証。
  async function deleteChart(id) {
    if (!sb) return { error: 'Supabase未接続' };
    if (!id) return { error: 'チャートIDが不明です（デモデータは保存対象外）' };
    var r = await sbRetry(function () { return sb.from('mandala_charts').delete().eq('id', id).select('id'); });
    if (r.error) return { error: friendlyErr(r.error.message) };
    if (!r.data || r.data.length === 0) return { error: '削除できませんでした（権限不足の可能性）' };
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
    // chart_sends.cell_status/edited_by は常に 'csf-N' キー（ibRenderGrid等のバッジ表示側の形式）。
    // tasks.source_cell は素の数字文字列（新形式）または 'csf-N'/'N-M'（旧形式）のどちらもあり得るため、
    // csfIdxFromCellで一旦CSFインデックスへ正規化してからキーを組み立てる（形式不一致でバッジが
    // 更新されなくなる回帰を防ぐ）。
    var csfIdx = csfIdxFromCell(t.data.source_cell);
    var key = csfIdx != null ? ('csf-' + csfIdx) : null;
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

  // チームリーダーIDを取得するユーティリティ（maybeSingle問題を修正: 複数チーム所属でも最初の1件を使用）
  async function _getLeaderForProfile(profileId) {
    var tm = await sb.from('team_members').select('team_id').eq('profile_id', profileId).limit(1);
    var tmRow = tm.data && tm.data[0];
    if (!tmRow) { console.warn('[VEXUM notify] team_members に profile_id=' + profileId + ' の行がありません。チーム設定を確認してください。'); return { leaderId: null, teamId: null }; }
    var tr = await sb.from('teams').select('leader_id').eq('id', tmRow.team_id).limit(1);
    var trRow = tr.data && tr.data[0];
    var leaderId = trRow && trRow.leader_id;
    if (!leaderId) console.warn('[VEXUM notify] teams.leader_id が未設定です (team_id=' + tmRow.team_id + ')。チームにリーダーを設定してください。');
    return { leaderId: leaderId || null, teamId: tmRow.team_id };
  }

  // タスク完了時、担当チームのリーダーへ完了通知
  async function notifyTaskDone(taskId) {
    if (!sb) return;
    var t = await sb.from('tasks').select('id,title,assignee_id,team_id,total_hours').eq('id', taskId).limit(1);
    var tRow = t.data && t.data[0]; if (!tRow) return;
    var me = await currentProfile();
    var leaderId = null, teamId = tRow.team_id;
    if (teamId) {
      var tr = await sb.from('teams').select('leader_id').eq('id', teamId).limit(1);
      var trRow = tr.data && tr.data[0]; leaderId = trRow && trRow.leader_id;
    }
    if (!leaderId && me) {
      var ldr = await _getLeaderForProfile(me.id);
      if (ldr.leaderId) { leaderId = ldr.leaderId; teamId = ldr.teamId; }
    }
    if (!leaderId) { console.warn('[VEXUM notify] notifyTaskDone スキップ: leaderId が取得できませんでした (taskId=' + taskId + ')'); return; }
    var hrs = (tRow.total_hours != null) ? (' / 合計 ' + tRow.total_hours + 'h') : '';
    try {
      await sb.from('notifications').insert({
        to_user_id: leaderId, to_team_id: teamId || null, type: 'task_done',
        title: 'タスク完了', body: '「' + tRow.title + '」が完了しました' + hrs,
        actor_id: me ? me.id : null, actor_name: me ? me.full_name : '', ref_id: taskId
      });
    } catch (e) { console.warn('[VEXUM notify] notifications insert失敗 (task_done):', e); }
  }

  // 日報提出をリーダーへ通知
  async function notifyReportSubmitted(reportId, dateStr) {
    if (!sb) return;
    var me = await currentProfile(); if (!me) return;
    var ldr = await _getLeaderForProfile(me.id);
    if (!ldr.leaderId) return;
    try {
      await sb.from('notifications').insert({
        to_user_id: ldr.leaderId, to_team_id: ldr.teamId, type: 'report_submitted',
        title: '日報提出', body: (dateStr || '') + ' の日報が提出されました',
        actor_id: me.id, actor_name: me.full_name, ref_id: reportId || null
      });
    } catch (e) { console.warn('[VEXUM notify] notifications insert失敗 (report_submitted):', e); }
  }

  // 始業（今日の計画）保存をリーダーへ通知。同一本人・同日は重複させない（始業を複数回保存しても1回）
  async function notifyReportStarted(reportId, dateStr) {
    if (!sb) return;
    var me = await currentProfile(); if (!me) return;
    var ldr = await _getLeaderForProfile(me.id);
    if (!ldr.leaderId) return;
    try {
      var ex = await sb.from('notifications').select('id').eq('actor_id', me.id).eq('type', 'report_started').ilike('body', '%' + (dateStr || '') + '%').limit(1);
      if (ex.data && ex.data.length) return; // 同日の始業通知は既に送信済み
    } catch (e) { console.warn('[VEXUM notify] 重複チェック失敗 (report_started):', e); }
    try {
      await sb.from('notifications').insert({
        to_user_id: ldr.leaderId, to_team_id: ldr.teamId, type: 'report_started',
        title: '始業報告', body: (dateStr || '') + ' の始業（今日の計画）が共有されました',
        actor_id: me.id, actor_name: me.full_name, ref_id: reportId || null
      });
    } catch (e) { console.warn('[VEXUM notify] notifications insert失敗 (report_started):', e); }
  }
  // 従業員本人宛ての通知を取得（受信ボックス用。to_user_id=自分 で単純絞り込み）
  // マルチロール対応: auth_user_id が同じ全profileのIDで絞る（member/leader で別UUID になる場合を吸収）
  async function _getAllMyProfileIds(me) {
    var u = await sb.auth.getUser();
    var uid = u && u.data && u.data.user && u.data.user.id;
    if (!uid) return [me.id];
    try {
      var r = await sb.from('profiles').select('id').eq('auth_user_id', uid);
      if (r.data && r.data.length) return r.data.map(function (p) { return p.id; });
    } catch (e) { console.warn('[VEXUM] allProfiles取得失敗', e); }
    return [me.id];
  }
  async function loadMyNotifications() {
    if (!sb) return [];
    var me = await currentProfile(); if (!me) return [];
    var pids = await _getAllMyProfileIds(me);
    var r = await sb.from('notifications').select('*').in('to_user_id', pids).order('created_at', { ascending: false }).limit(50);
    if (r.error) { err('myNotifications', r.error); return []; }
    return r.data || [];
  }
  // 自分/自チーム宛ての通知を取得（リーダー画面の🔔・受信用）
  // マルチロール対応: teams.leader_id が member UUID で登録されていても全UUID で検索
  async function loadNotifications() {
    if (!sb) return [];
    var me = await currentProfile(); if (!me) return [];
    var pids = await _getAllMyProfileIds(me);
    var teamIds = [];
    try { var t = await sb.from('teams').select('id').in('leader_id', pids); teamIds = (t.data || []).map(function (x) { return x.id; }); } catch (e) { console.warn('[VEXUM notify] teams取得失敗', e); }
    var orParts = pids.map(function (pid) { return 'to_user_id.eq.' + pid; });
    if (teamIds.length) orParts.push('to_team_id.in.(' + teamIds.join(',') + ')');
    var r = await sb.from('notifications').select('*').or(orParts.join(',')).order('created_at', { ascending: false }).limit(50);
    if (r.error) { err('notifications', r.error); return []; }
    return r.data || [];
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
      return { date: l.log_date, hours: +l.hours || 0, progress: l.progress_after, taskId: l.task_id || null, taskTitle: ti.title || '（タスク不明）', period: ti.period || '', note: l.note || '' };
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
    // 始業保存（submitでない初回共有）でも一度リーダーへ通知
    else if (o.notifyStart) { try { await notifyReportStarted(r.data && r.data.id, o.date); } catch (e) {} }
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
        id: ev.id, evaluatorName: evp.full_name || '—', evaluatorRole: ev.evaluator_role,
        period: ev.period || '', kgi: ev.kgi_stars || 0, kgiComment: ev.kgi_comment || '',
        csf: ev.csf || [], chartId: ev.chart_id, createdAt: ev.created_at,
        execComment: ev.exec_comment || '', execCommentedAt: ev.exec_commented_at || null
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
  // 全セルが空（未入力）の acts かどうか判定。既存の記入済みデータを
  // 空配列で誤って上書きしてしまう事故（チャート初期化前のCHARTEDIT等の
  // 取り違え）を防ぐためのガードに使う。
  function isBlankActs(a) {
    if (!a || !a.length) return true;
    return a.every(function (row) { return !row || row.every(function (c) { return !c; }); });
  }
  // メンバー自身のKPI編集を保存（member_kpi_edits列 + acts更新）
  async function saveMemberKpiEdits(chartId, edits, newActs, extra) {
    if (!sb) return { error: 'Supabase未接続' };
    var payload = { member_kpi_edits: edits };
    // 全セル空の acts は「未入力」ではなく取り違えの可能性が高いため送らない
    // （既存の記入済みデータを誤って空で上書きしない）
    if (newActs && !isBlankActs(newActs)) payload.acts = newActs;
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
          return sb.from('mandala_charts').upsert(Object.assign({ id: chartId, owner_type: 'user', owner_user_id: me.id, acts: [], subs: [], name: '個人チャート', center: '' }, payload)).select('id');
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
    var ldr = await _getLeaderForProfile(me.id);
    if (!ldr.leaderId || ldr.leaderId === me.id) return; // リーダー本人なら通知不要
    try {
      await sb.from('notifications').insert({
        to_user_id: ldr.leaderId, to_team_id: ldr.teamId, type: 'chart_edit',
        title: 'チャート更新', body: (summary || 'メンバーが曼荼羅チャートを更新しました'),
        actor_id: me.id, actor_name: me.full_name
      });
    } catch (e) { console.warn('[VEXUM notify] notifications insert失敗 (chart_edit):', e); }
  }

  // 特定メンバーが持つ全曼荼羅チャート（評価対象選択用）
  async function loadChartsFor(pid) {
    if (!sb || !pid) return [];
    var r = await sb.from('mandala_charts').select('id,name,period,scope_label,center,subs,acts,color,bg,member_kpi_edits,start_date,end_date').eq('owner_user_id', pid).order('created_at', { ascending: true });
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
    // ★評価対象者へ通知（リーダー/幹部→従業員）
    // 注意: notifications.ref_id は uuid 型（41_notifications_ref_text.sql 適用前）。
    // mandala_charts.id は text（'user_<uuid>_<ts>' 等）で uuid として不正なため、
    // そのまま insert すると 22P02 で通知ごと失われる。失敗時は ref_id 無しで再送し、
    // 通知自体は必ず届くようにする（マイグレーション適用後は1回目で成功する）。
    try {
      if (o.targetPid && me && o.targetPid !== me.id) {
        var ntfRow = {
          to_user_id: o.targetPid, to_team_id: null, type: 'evaluation_received',
          title: '評価が届きました', body: (o.period ? o.period + ' の' : '') + '評価が登録されました',
          actor_id: me ? me.id : null, actor_name: me ? me.full_name : '', ref_id: o.chartId || null
        };
        var nr = await sb.from('notifications').insert(ntfRow);
        if (nr.error && ntfRow.ref_id != null) {
          ntfRow.ref_id = null;
          nr = await sb.from('notifications').insert(ntfRow);
        }
        if (nr.error) console.warn('[VEXUM notify] notifications insert失敗 (evaluation_received):', nr.error.message);
      }
    } catch (e) { console.warn('[VEXUM notify] notifications insert失敗 (evaluation_received):', e); }
    return { ok: true };
  }
  // メンバーの個人曼荼羅チャートを upsert（リーダーが記入＝タスク割当）
  async function upsertMemberChart(o) {
    if (!sb) return { error: 'Supabase未接続' };
    // acts は not null 制約があるため必ず何かを入れる必要がある。
    // 全セル空で送られてきた場合、既存チャート（記入済み）の取り違えの可能性が高いので
    // 既存の acts を確認し、記入済みならそれを保持する（誤って空で上書きしない）。
    var actsToUse = o.acts || [];
    if (isBlankActs(actsToUse) && o.id) {
      try {
        var cur = await sb.from('mandala_charts').select('acts').eq('id', o.id).maybeSingle();
        if (cur.data && !isBlankActs(cur.data.acts)) actsToUse = cur.data.acts;
      } catch (e) {}
    }
    var payload = {
      owner_type: 'user', owner_user_id: o.pid, name: o.name || '個人チャート',
      center: o.center || '', subs: o.subs || [], acts: actsToUse,
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
    // 自分の所属チームID。未所属(新規従業員)は null（'A'にフォールバックしない＝他チームのチャート混入を防ぐ）
    var myTeamId = tm ? tm.team_id : null;
    var teamLetter = myTeamId ? (TEAM_KEY[myTeamId] || myTeamId) : null;
    var teamRow = raw.teams.filter(function (t) { return myTeamId && t.id === myTeamId; })[0];
    function chartObj(c) {
      return { dbId: c.id, name: c.name, scopeLabel: c.scope_label, period: c.period, startDate: c.start_date ? fmtYMD(c.start_date) : '',
        endDate: c.end_date ? fmtYMD(c.end_date) : '',
        team: teamRow ? teamRow.name : '', color: c.color, bg: c.bg, center: c.center, subs: c.subs, acts: c.acts,
        memberKpiEdits: c.member_kpi_edits || {} };
    }
    var CHARTS = {};
    raw.mandala_charts.forEach(function (c) {
      if (c.id === 'user_' + memberKey) CHARTS['self_q3'] = chartObj(c);
      else if (c.id === 'user_' + memberKey + '_q2') CHARTS['self_q2'] = chartObj(c);
      else if (c.owner_type === 'team' && myTeamId && c.owner_team_id === myTeamId) {
        // 自分の所属チームのチャートのみ（team_id で厳密一致）。読み取り専用の目標定義。
        // 内容(KGI/CSF/KPI文言)はリーダー・幹部が管理し、メンバーは編集不可
        // （進捗・工数は tasks 側＝割り当て/タスク管理から記入する）。
        CHARTS['team_' + teamLetter] = Object.assign(chartObj(c), { readonly: true });
      }
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
    // 実データのチャートID（'user_<uuid>_<ts>' 等）→ CHARTSキー の対応表。
    // シードIDパターンに一致しない評価もチャート別に正しく振り分ける
    var chartKeyByDbId = {};
    Object.keys(CHARTS).forEach(function (k) { var d = CHARTS[k]; if (d && d.dbId) chartKeyByDbId[d.dbId] = k; });
    raw.evaluations.forEach(function (ev) {
      var ck = (ev.chart_id && chartKeyByDbId[ev.chart_id])
             ? chartKeyByDbId[ev.chart_id]
             : ev.chart_id === 'user_' + memberKey ? 'self_q3'
             : ev.chart_id === 'user_' + memberKey + '_q2' ? 'self_q2'
             : ev.chart_id === 'team_' + teamLetter ? 'team_' + teamLetter
             : (ev.target_user_id === uid ? 'self_q3' : null);  // チャート特定不能の本人宛て評価は self_q3 に集約
      if (!ck) return;
      if (!FEEDBACK[ck]) FEEDBACK[ck] = { period: ev.period, evals: [] };
      var evp = prof[ev.evaluator_id] || {};
      FEEDBACK[ck].evals.push({ role: ev.evaluator_role === 'executive' ? '幹部' : 'リーダー', name: evp.full_name || '',
        kgi: { stars: ev.kgi_stars, comment: ev.kgi_comment }, csf: ev.csf || [],
        execComment: ev.exec_comment || '' });
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
      var from = self ? '🙋 自分で作成' : ('📌 ' + (exec ? '幹部' : '上長') + ' · ' + (assigner.full_name || ''));
      if (t.status === 'done' || (t.progress || 0) >= 100) {
        ASSIGN_HISTORY.push({ id: t.id, name: t.title, kpi: t.related_kgi || '—', meta: meta, from: from, fromClass: exec ? 'exec' : '', assignerId: t.assigner_id || null, assignerName: assigner.full_name || '', assignerRole: exec ? '幹部' : '上長', start: fmtYMD(t.start_date), end: fmtYMD(t.due_date), startRaw: t.start_date || null, dueRaw: t.due_date || null, comment: t.comment || '', completed: t.completed_date ? fmtYMD(t.completed_date) : '', pri: t.priority || 'md', self: self, chart: chart, cell: t.source_cell || null, csfIdx: csfIdxFromCell(t.source_cell), kpiIdx: null /* KPI廃止 */, hours: (t.total_hours != null ? +t.total_hours : 0), planned: (t.planned_hours != null ? +t.planned_hours : null) });
      } else {
        ASSIGNMENTS.push({ id: t.id, name: t.title, kpi: t.related_kgi || '—', meta: meta, from: from, fromClass: exec ? 'exec' : '', assignerId: t.assigner_id || null, assignerName: assigner.full_name || '', assignerRole: exec ? '幹部' : '上長', start: fmtYMD(t.start_date), end: fmtYMD(t.due_date), startRaw: t.start_date || null, dueRaw: t.due_date || null, pct: t.progress || 0, comment: t.comment || '', status: t.status, pri: t.priority || 'md', self: self, chart: chart, sendId: t.source_send_id || null, cell: t.source_cell || null, csfIdx: csfIdxFromCell(t.source_cell), kpiIdx: null /* KPI廃止 */, hours: (t.total_hours != null ? +t.total_hours : 0), planned: (t.planned_hours != null ? +t.planned_hours : null) });
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
      // 本日までの達成率 = 期限到来分のうち完了済みの割合。
      // 期限到来タスクが0件なら「データなし」= null（旧: 0/0 を 100% と誤表示していた）
      todayRate: (function () {
        var dueAll = myTasks.filter(function (t) { return t.due_date && t.due_date <= todayStr; });
        if (!dueAll.length) return null;
        var d = dueAll.filter(function (t) { return t.status === 'done' || (t.progress || 0) >= 100; }).length;
        return Math.round(d / dueAll.length * 100);
      })(),
      taskCount: myTasks.length,
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
  // 同一メールで既に登録済みの profile から auth_user_id を流用（同一人物=同一ログイン）。
  // 無ければ null（vexum_create_login RPC 側で新規 auth を発行する）。
  async function _reuseAuthUserId(email) {
    if (!sb || !email) return null;
    var r = await sb.from('profiles').select('auth_user_id').ilike('email', email).not('auth_user_id', 'is', null).limit(1);
    if (r.error || !r.data || !r.data.length) return null;
    return r.data[0].auth_user_id || null;
  }
  // 同一 (email, role) の profile が既に存在するか
  async function _existsEmailRole(email, roleEnumVal) {
    if (!sb || !email) return false;
    var r = await sb.from('profiles').select('id').ilike('email', email).eq('role', roleEnumVal).limit(1);
    return !r.error && r.data && r.data.length > 0;
  }
  // 同一メール複数ロール対応の統一アカウント作成関数。
  //  1. (email, role) が既にあればエラー
  //  2. 同一メールの既存 auth_user_id を流用（同一人物の別ロール＝同じログイン共有）
  //  3. profiles を新ロールでINSERT
  //  4. team_members へ UPSERT
  //  5. ログイン: 既存authがあれば流用（PWは返さない）／無ければ vexum_create_login で発行
  async function createOrLinkAccount(o) {
    if (!sb) return { error: 'Supabase未接続' };
    var name = (o.fullName || o.name || '').trim();
    var email = (o.email || '').trim();
    var roleEnumVal = roleToEnum(o.role || 'メンバー');
    if (!name) return { error: '氏名を入力してください' };
    if (!email) return { error: 'メールアドレスを入力してください' };
    // 同じ (email, role) の既存プロフィールを確認（論理削除 is_active=false も含めて検索）
    var exq = await sb.from('profiles').select('id,is_active,auth_user_id').ilike('email', email).eq('role', roleEnumVal).limit(1);
    var exRow = (!exq.error && exq.data && exq.data.length) ? exq.data[0] : null;
    if (exRow && exRow.is_active !== false) {
      return { error: 'このメール・ロールの組み合わせは既に存在します' };
    }
    var reuseUid = await _reuseAuthUserId(email);
    if (exRow) {
      // ★論理削除(is_active=false)済みアカウント → 新規作成ではなく「復活（再アクティブ化）」する。
      //   これにより、UNIQUE(lower(email),role) 違反のエラー（再作成できない）を解消する。
      var patch = { is_active: true, full_name: name };
      if (!exRow.auth_user_id && reuseUid) patch.auth_user_id = reuseUid;
      var rr = await sb.from('profiles').update(patch).eq('id', exRow.id).select().single();
      if (rr.error) return { error: friendlyErr(rr.error.message) };
      var pidR = exRow.id;
      var teamUuidR = o.teamId || o.teamUuid || (o.teamLetter ? teamUuidOf(o.teamLetter) : null);
      if (teamUuidR) {
        try {
          await sb.from('team_members').upsert({
            team_id: teamUuidR, profile_id: pidR,
            role_in_team: (roleEnumVal === 'leader') ? 'leader' : 'member',
            achievement_rate: (o.rate != null ? o.rate : 50)
          }, { onConflict: 'team_id,profile_id' });
        } catch (e) {}
        if (roleEnumVal === 'leader') await _syncTeamLeader(teamUuidR, pidR);
      }
      // ログイン(auth)を確実化：auth_user_id が無ければ vexum_create_login で発行/再リンク
      var loginR = !!(exRow.auth_user_id || reuseUid), pwR = null;
      if (!loginR) { var gp = o.password || randomPassword(); try { var rp = await sb.rpc('vexum_create_login', { p_email: email, p_password: gp }); loginR = !rp.error; if (loginR && !o.password) pwR = gp; } catch (e) {} }
      return { data: rr.data, pid: pidR, loginEnabled: loginR, password: pwR, reactivated: true };
    }
    var row = { full_name: name, email: email, role: roleEnumVal, department: o.department || null, color: o.color || '#0D9488' };
    if (reuseUid) row.auth_user_id = reuseUid;
    var ins = await sb.from('profiles').insert(row).select().single();
    if (ins.error) return { error: friendlyErr(ins.error.message) };
    var pid = ins.data.id;
    var teamUuid = o.teamId || o.teamUuid || (o.teamLetter ? teamUuidOf(o.teamLetter) : null);
    if (teamUuid) {
      try {
        await sb.from('team_members').upsert({
          team_id: teamUuid, profile_id: pid,
          role_in_team: (roleEnumVal === 'leader') ? 'leader' : 'member',
          achievement_rate: (o.rate != null ? o.rate : 50)
        }, { onConflict: 'team_id,profile_id' });
      } catch (e) {}
      if (roleEnumVal === 'leader') await _syncTeamLeader(teamUuid, pid);
    }
    var loginEnabled = !!reuseUid, pw = null;
    if (!reuseUid) {
      var genPw = o.password || randomPassword();
      try { var rpc = await sb.rpc('vexum_create_login', { p_email: email, p_password: genPw }); loginEnabled = !rpc.error; } catch (e) { loginEnabled = false; }
      if (loginEnabled && !o.password) pw = genPw;
    }
    return { data: ins.data, pid: pid, loginEnabled: loginEnabled, password: pw, reused: !!reuseUid };
  }
  // 旧API互換: 幹部画面のアカウント発行（createOrLinkAccount に統一）
  async function createAccount(o) {
    return await createOrLinkAccount({
      fullName: o.name, email: o.email, role: o.role,
      teamId: o.teamUuid || (o.teamLetter ? teamUuidOf(o.teamLetter) : null),
      rate: o.rate, department: o.department, color: o.color, password: o.password
    });
  }
  // ===== リーダー⇄従業員 紐付け =====
  // ログイン中ユーザーと同じメールの「従業員(role=member)」プロフィールを検索（自分自身は除外）
  async function findLinkedEmployee(email, selfPid) {
    if (!sb || !email) return null;
    var r = await sb.from('profiles').select('id,full_name,email,role').ilike('email', email).eq('role', 'member');
    if (r.error) { err('findLinkedEmployee', r.error); return null; }
    var rows = (r.data || []).filter(function (p) { return p.id !== selfPid; });
    return rows[0] || null;
  }
  // 任意のprofile_idでプロフィールを取得（従業員画面の代理表示用）
  async function loadProfile(pid) {
    if (!sb || !pid) return null;
    var r = await sb.from('profiles').select('id,full_name,email,role').eq('id', pid).maybeSingle();
    return r.data || null;
  }
  // チーム一覧（新規従業員の所属チーム選択用）
  async function listTeams() {
    if (!sb) return [];
    var r = await sb.from('teams').select('id,name').order('name', { ascending: true });
    if (r.error) { err('listTeams', r.error); return []; }
    return r.data || [];
  }
  // 紐付け用の従業員(member)アカウントを作成。
  //  ・同メールの member が既にあれば、それを紐付け対象として返す（重複作成しない）
  //  ・profiles.email は一意制約のため、衝突時は派生メール(local+emp@domain)で作成
  //  ・team_members へ所属を追加（RLS: 自チームのリーダー or 管理者/幹部のみ）
  //  ・ログイン(auth)は best-effort（vexum_create_login RPC）。失敗してもプロフィールは作成済み
  async function createLinkedEmployeeAccount(o) {
    if (!sb) return { error: 'Supabase未接続' };
    var name = (o.fullName || '従業員').trim();
    var email = (o.email || '').trim();
    // 既存の member プロフィールがあればそれを紐付け対象に（重複作成しない）
    if (email) {
      var ex = await sb.from('profiles').select('id,role').ilike('email', email).eq('role', 'member').limit(1);
      if (!ex.error && ex.data && ex.data.length) return { pid: ex.data[0].id, linkedExisting: true };
    }
    // 統一関数で member ロールを作成
    var res = await createOrLinkAccount({ fullName: name, email: email, role: 'メンバー', teamId: o.teamId, password: o.password, color: o.color || '#06B6D4' });
    if (res && res.error && /duplicate|unique|23505|already|組み合わせは既に/i.test(res.error)) {
      // 30_multi_role.sql 未適用で email 単独UNIQUEが残る古いDBへのフォールバック（派生メールで作成）
      var i = email.indexOf('@'); var variantEmail = i < 0 ? (email + '+emp') : (email.slice(0, i) + '+emp' + email.slice(i));
      res = await createOrLinkAccount({ fullName: name, email: variantEmail, role: 'メンバー', teamId: o.teamId, password: o.password, color: o.color || '#06B6D4' });
    }
    if (res && res.error) return { error: res.error };
    return { pid: res.pid, email: res.data ? res.data.email : email };
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
  // 管理者・幹部が「指定した新パスワード」に再設定（vexum_create_login RPC=SECURITY DEFINER）。
  // ※ Supabase Auth はPWをハッシュ保存するため既存PWの平文表示は不可。これは「上書き再設定」。
  async function setAccountPassword(email, password) {
    if (!sb) return { error: 'Supabase未接続' };
    if (!email) return { error: 'メールアドレスが不明です' };
    if (!password || password.length < 8) return { error: 'パスワードは8文字以上で入力してください' };
    try {
      var rpc = await sb.rpc('vexum_create_login', { p_email: email, p_password: password });
      if (rpc.error) return { error: friendlyErr(rpc.error.message) };
      return { ok: true };
    } catch (e) { return { error: String(e) }; }
  }
  // 本人にパスワードリセットメールを送る（SMTP/メールテンプレ設定が必要・best-effort）。
  async function sendResetEmail(email) {
    if (!sb) return { error: 'Supabase未接続' };
    if (!email) return { error: 'メールアドレスが不明です' };
    try {
      var redirect = (typeof location !== 'undefined') ? (location.origin + '/index.html') : undefined;
      var r = await sb.auth.resetPasswordForEmail(email, redirect ? { redirectTo: redirect } : undefined);
      if (r.error) return { error: friendlyErr(r.error.message) };
      return { ok: true };
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
    // チーム所属は解除（論理削除でも一覧/編成から外す）
    try { await sb.from('team_members').delete().eq('profile_id', pid); } catch (e) {}
    // まず論理削除（is_active=false）を試行。カラム未追加(30未適用)なら物理削除へフォールバック
    var up = await sb.from('profiles').update({ is_active: false }).eq('id', pid).select('id');
    if (up.error && /is_active|column|does not exist|42703/i.test(up.error.message || '')) {
      // FK(NO ACTION) の依存行を先に始末してから物理削除（assignee は cascade だが念のため）
      await sb.from('tasks').delete().eq('assignee_id', pid);
      var del = await sb.from('profiles').delete().eq('id', pid).select('id');
      if (del.error) return { error: friendlyErr(del.error.message) };
      if (!del.data || del.data.length === 0) return { error: '削除できませんでした（権限不足の可能性。管理者/幹部でログインしてください）' };
      return { ok: true, physical: true };
    }
    if (up.error) return { error: friendlyErr(up.error.message) };
    if (!up.data || up.data.length === 0) return { error: '削除できませんでした（権限不足の可能性。管理者/幹部でログインしてください）' };
    return { ok: true };
  }
  // 論理削除(is_active=false)されたアカウント一覧（復活UI用）。fetchAll は inactive を除外するため別取得。
  async function listInactiveAccounts() {
    if (!sb) return [];
    var r = await sb.from('profiles').select('id,full_name,email,role,is_active,auth_user_id').eq('is_active', false).order('email', { ascending: true });
    if (r.error) { err('listInactiveAccounts', r.error); return []; }
    return r.data || [];
  }
  // 論理削除されたアカウントを復活（is_active=true）。auth_user_id が無ければログインを再リンク。
  async function reactivateAccount(pid) {
    if (!sb) return { error: 'Supabase未接続' };
    if (!pid) return { error: '対象アカウントIDが不明です' };
    var up = await sb.from('profiles').update({ is_active: true }).eq('id', pid).select('id,email,role,auth_user_id');
    if (up.error) return { error: friendlyErr(up.error.message) };
    if (!up.data || up.data.length === 0) return { error: '復活できませんでした（権限不足の可能性。管理者/幹部でログインしてください）' };
    var row = up.data[0];
    // auth_user_id が無ければ同メールの他プロフィールから流用、それも無ければ login を発行/再リンク
    if (!row.auth_user_id) {
      var reuse = await _reuseAuthUserId(row.email);
      if (reuse) { try { await sb.from('profiles').update({ auth_user_id: reuse }).eq('id', pid); } catch (e) {} }
      else { try { await sb.rpc('vexum_create_login', { p_email: row.email, p_password: 'vexum2025' }); } catch (e) {} }
    }
    return { ok: true, email: row.email, role: row.role };
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
    if (rows.length) { var r = await sb.from('team_members').upsert(rows, { onConflict: 'team_id,profile_id' }); if (r.error) return { error: r.error.message }; }
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
    // profiles（氏名・メール）。複数ロール（同一auth_user_id）でも“今表示中の1件”だけ
    // 更新するよう active profile に限定（auth_user_id 一括だと他ロール行まで書き換わる）。
    var prof = {};
    if (patch.name != null) prof.full_name = patch.name;
    if (patch.email != null) prof.email = patch.email;
    if (Object.keys(prof).length) {
      var me = await currentProfile();
      var pr = (me && me.id)
        ? await sb.from('profiles').update(prof).eq('id', me.id)
        : await sb.from('profiles').update(prof).eq('auth_user_id', uid);
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
    var payload = {
      title: o.title || o.center, center: o.center || '', subs: o.subs || [], acts: o.acts || [],
      to_team: o.toTeam || null, to_profile_id: o.toPid || null, to_name: o.toName || '',
      status: 'sent', progress: 0,
      sent_by: me ? me.id : null, sent_by_name: me ? me.full_name : '',
      start_date: o.startDate || null, end_date: o.endDate || null, csf_periods: o.csfPeriods || {}
    };
    var r = await sb.from('chart_sends').insert(payload).select().single();
    if (r.error) {
      // start_date/end_date/csf_periods 列が未適用の環境向けフォールバック（23_chart_periods.sql 未実行時）
      delete payload.start_date; delete payload.end_date; delete payload.csf_periods;
      r = await sb.from('chart_sends').insert(payload).select().single();
    }
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
  // 同一 auth_user_id に複数 profile（複数ロール）が存在し得るため、
  // 希望ロール（preferRole / window.VEXUM_PAGE_ROLE）を優先して1件選ぶ。
  function _pickProfile(rows, preferRole) {
    if (!rows || !rows.length) return null;
    var want = preferRole
      || (typeof window !== 'undefined' && window.VEXUM_PAGE_ROLE)
      || null;
    if (want) { var m = rows.filter(function (p) { return p.role === want; }); if (m.length) return m[0]; }
    var order = { admin: 0, executive: 1, leader: 2, member: 3 };
    rows = rows.slice().sort(function (a, b) {
      return (order[a.role] == null ? 9 : order[a.role]) - (order[b.role] == null ? 9 : order[b.role]);
    });
    return rows[0];
  }
  async function currentProfile(preferRole) {
    if (!sb) return null;
    var u = await sb.auth.getUser();
    var user = u && u.data && u.data.user;
    var uid = user && user.id;
    if (!uid) return null;
    // まず auth_user_id 一致で取得（複数ロール対応で配列取得）
    var r = await sb.from('profiles').select('*').eq('auth_user_id', uid);
    if (!r.error && r.data && r.data.length) return _pickProfile(r.data, preferRole);
    // フォールバック: メール一致で取得し、auth_user_id を自動修復
    var email = user.email;
    if (email) {
      var r2 = await sb.from('profiles').select('*').ilike('email', email);
      if (!r2.error && r2.data && r2.data.length) {
        var chosen = _pickProfile(r2.data, preferRole);
        if (chosen && (!chosen.auth_user_id || chosen.auth_user_id !== uid)) {
          try { await sb.from('profiles').update({ auth_user_id: uid }).eq('id', chosen.id); chosen.auth_user_id = uid; } catch (e) {}
        }
        return chosen;
      }
    }
    return null;
  }
  // ログイン中ユーザーが「現在DB上で実際に持っている」ロール一覧（is_active=false除外）。
  // キャッシュを使わず毎回DBを引くため、権限削除が即時反映される。
  async function myRoles() {
    if (!sb) return [];
    var u = await sb.auth.getUser();
    var user = u && u.data && u.data.user; var uid = user && user.id;
    if (!uid) return [];
    var rows = null;
    var r = await sb.from('profiles').select('role,is_active').eq('auth_user_id', uid);
    if (!r.error && r.data && r.data.length) rows = r.data;
    if (!rows && user.email) { var r2 = await sb.from('profiles').select('role,is_active').ilike('email', user.email); if (!r2.error) rows = r2.data || []; }
    return (rows || []).filter(function (p) { return p.is_active !== false; }).map(function (p) { return p.role; });
  }
  // 各画面の入口で呼ぶアクセス再検証。requiredRole を実際に保有しているかDBで確認。
  // 返り値: { ok, roles, dest }（ok=false のとき dest=他ロールの画面 or index）
  async function checkRoleAccess(requiredRole) {
    var roles = await myRoles();
    var DEST = { admin: './admin.html', executive: './executive.html', leader: './leader.html', member: './employee.html' };
    if (roles.indexOf(requiredRole) >= 0) return { ok: true, roles: roles };
    var order = ['admin', 'executive', 'leader', 'member'];
    var alt = order.filter(function (r) { return roles.indexOf(r) >= 0; })[0];
    return { ok: false, roles: roles, dest: alt ? DEST[alt] : './index.html' };
  }
  // ロール（権限）を1つ削除＝その profile_id の profiles 行と所属を削除。
  // ※ 同一メールの他ロール profile・auth.users（ログイン）は残す（他ロールでログイン可能なまま）。
  async function removeRole(profileId) {
    if (!sb) return { error: 'Supabase未接続' };
    if (!profileId) return { error: 'profile が不明です' };
    try { await sb.from('team_members').delete().eq('profile_id', profileId); } catch (e) {}
    var del = await sb.from('profiles').delete().eq('id', profileId).select('id');
    if (del.error) return { error: friendlyErr(del.error.message) };
    if (!del.data || del.data.length === 0) return { error: '削除できませんでした（権限不足の可能性。管理者/幹部でログインしてください）' };
    return { ok: true };
  }
  // 指定チームのメンバー（profiles を team_members 経由で取得）。
  // バグ1対策: 必ず team_id で絞り込む（他チームのメンバーを混在させない）。
  async function loadTeamMembers(teamId) {
    if (!sb || !teamId) return [];
    var tm = await sb.from('team_members').select('profile_id,role_in_team,achievement_rate').eq('team_id', teamId);
    if (tm.error || !tm.data || !tm.data.length) return [];
    var ids = tm.data.map(function (x) { return x.profile_id; });
    var pr = await sb.from('profiles').select('id,full_name,email,role').in('id', ids);
    if (pr.error) return [];
    var rate = {}; tm.data.forEach(function (x) { rate[x.profile_id] = x; });
    return (pr.data || []).map(function (p) {
      var t = rate[p.id] || {};
      return { id: p.id, full_name: p.full_name, email: p.email, role: p.role, role_in_team: t.role_in_team, achievement_rate: t.achievement_rate };
    });
  }

  // 幹部コメントを評価レコードに保存（評価そのものは編集しない／幹部のみが書く想定）
  async function saveExecComment(evalId, comment) {
    if (!sb || !evalId) return { error: '評価レコードが見つかりません' };
    var r = await sb.from('evaluations').update({
      exec_comment: comment || '', exec_commented_at: new Date().toISOString()
    }).eq('id', evalId).select('id');
    if (r.error) return { error: friendlyErr(r.error.message) };
    if (!r.data || r.data.length === 0) return { error: '更新できませんでした（権限不足の可能性）' };
    return { ok: true };
  }

  // ===== 幹部画面：タスク管理（全チーム横断／teamUuid指定時はそのチームのみ） =====
  async function loadExecOverview(teamUuid) {
    var raw = await fetchAll(); if (!raw) return null;
    var prof = byId(raw.profiles);
    var teamById = byId(raw.teams);
    var members = teamUuid ? raw.team_members.filter(function (m) { return m.team_id === teamUuid; }) : raw.team_members;
    members = members.slice();
    members.sort(function (a, b) { return (a.role_in_team === 'leader' ? 0 : 1) - (b.role_in_team === 'leader' ? 0 : 1); });
    // メンバーの主チャート（個人曼荼羅）を owner_user_id で引けるように
    var chartByUser = {};
    raw.mandala_charts.forEach(function (c) { if (c.owner_type === 'user' && c.id.indexOf('_q2') < 0) chartByUser[c.owner_user_id] = c; });
    var MEMBERS = {}, DASH_IDS = [], EVAL_IDS = [];
    members.forEach(function (m) {
      var key = memKey(m.profile_id), p = prof[m.profile_id]; if (!key || !p) return;
      var team = teamById[m.team_id] || { name: '' };
      var tk = raw.tasks.filter(function (t) { return t.assignee_id === m.profile_id; });
      var stats = {
        done: tk.filter(function (t) { return t.status === 'done'; }).length,
        wip: tk.filter(function (t) { return t.status === 'wip'; }).length,
        late: tk.filter(function (t) { return t.status === 'late'; }).length
      };
      var c = chartByUser[m.profile_id] || { subs: [], acts: [], center: '' };
      // KPI進捗 = そのCSFに紐づくタスクの平均進捗（タスクが無いCSFは達成率で代替）— リーダー画面と同ロジック
      var kpis = (c.subs || []).slice(0, 4).map(function (s) {
        var rel = tk.filter(function (t) { return t.related_kgi === s; });
        var pp = rel.length
          ? Math.round(rel.reduce(function (a, t) { return a + (t.progress || 0); }, 0) / rel.length)
          : (m.achievement_rate || 0);
        return { n: s, p: Math.max(0, Math.min(100, pp)) };
      });
      MEMBERS[key] = {
        pid: p.id, name: p.full_name, role: m.role_in_team === 'leader' ? 'リーダー' : '従業員',
        team: team.name, teamUuid: m.team_id, color: p.color, rate: m.achievement_rate || 0, stats: stats,
        kpis: kpis, memberKpiEdits: c.member_kpi_edits || {},
        center: c.center || '', subs: c.subs || [], acts: c.acts || [],
        startDate: c.start_date ? fmtYMD(c.start_date) : '', endDate: c.end_date ? fmtYMD(c.end_date) : '', period: c.period || ''
      };
      DASH_IDS.push(key);
      if (m.role_in_team !== 'leader') EVAL_IDS.push(key);
    });
    var MEMBER_TASKS = {};
    raw.tasks.forEach(function (t) {
      if (teamUuid && t.team_id !== teamUuid) return;
      var key = memKey(t.assignee_id); if (!key || !MEMBERS[key]) return;
      (MEMBER_TASKS[key] = MEMBER_TASKS[key] || []).push({
        id: t.id, name: t.title, kpi: t.related_kgi || '—', start: fmtMD(t.start_date), due: fmtMD(t.due_date),
        startRaw: t.start_date || null, dueRaw: t.due_date || null,
        pri: t.priority, status: t.status, pct: t.progress || 0,
        hours: (t.total_hours != null ? +t.total_hours : 0), period: t.period || '', teamUuid: t.team_id,
        chart: t.source_chart || null, sendId: t.source_send_id || null, cell: t.source_cell || null,
        csfIdx: csfIdxFromCell(t.source_cell),
        kpiIdx: null /* KPI廃止 */
      });
    });
    var memberPid = {};
    raw.profiles.forEach(function (p) { memberPid[memKey(p.id)] = p.id; });
    var teamsList = raw.teams.map(function (t) { return { uid: t.id, name: t.name }; });
    return { MEMBERS: MEMBERS, MEMBER_TASKS: MEMBER_TASKS, DASH_IDS: DASH_IDS, EVAL_IDS: EVAL_IDS, memberPid: memberPid, teamsList: teamsList };
  }

  // ===== 幹部画面：日報（全社員／teamUuid指定時はそのチームのみ） =====
  async function loadAllDailyReports(teamUuid) {
    var raw = await fetchAll(); if (!raw) return [];
    var prof = byId(raw.profiles);
    var teamById = byId(raw.teams);
    var tmByProfile = {}; raw.team_members.forEach(function (m) { tmByProfile[m.profile_id] = m; });
    var rows = raw.daily_reports;
    if (teamUuid) rows = rows.filter(function (r) { var tm = tmByProfile[r.author_id]; return tm && tm.team_id === teamUuid; });
    return rows.map(function (r) {
      var p = prof[r.author_id] || {}; var tm = tmByProfile[r.author_id]; var team = tm ? teamById[tm.team_id] : null;
      return {
        id: r.id, authorPid: r.author_id, authorName: p.full_name || '—',
        teamName: team ? team.name : '（未所属）', teamUuid: tm ? tm.team_id : null,
        date: r.report_date, hours: r.hours, done: r.done, plan: r.plan, issue: r.issue, cond: r.condition
      };
    }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  }

  // ===== 幹部画面：ダッシュボード集計（teamUuid/期間指定時は絞り込み＋チーム別比較） =====
  async function loadDashboardStats(teamUuid, fromDate, toDate) {
    var raw = await fetchAll(); if (!raw) return null;
    var profMap = byId(raw.profiles);
    var tmByProfile = {}; raw.team_members.forEach(function (m) { tmByProfile[m.profile_id] = m; });
    var inRange = function (d) { if (!d) return false; if (fromDate && d < fromDate) return false; if (toDate && d > toDate) return false; return true; };
    var tmsAll = teamUuid ? raw.team_members.filter(function (m) { return m.team_id === teamUuid; }) : raw.team_members;
    var tasksAll = raw.tasks.filter(function (t) {
      if (teamUuid && t.team_id !== teamUuid) return false;
      if (!fromDate && !toDate) return true;
      var d = t.completed_date || t.due_date || t.start_date;
      return inRange(d);
    });
    var reportsAll = raw.daily_reports.filter(function (r) {
      var tm = tmByProfile[r.author_id];
      if (teamUuid && (!tm || tm.team_id !== teamUuid)) return false;
      return inRange(r.report_date);
    });
    var done = tasksAll.filter(function (t) { return t.status === 'done'; }).length;
    var late = tasksAll.filter(function (t) { return t.status === 'late'; }).length;
    var avgRate = tmsAll.length ? Math.round(tmsAll.reduce(function (a, m) { return a + (m.achievement_rate || 0); }, 0) / tmsAll.length) : 0;
    var byTeam = {};
    raw.teams.forEach(function (t) {
      if (teamUuid && t.id !== teamUuid) return;
      var tms = raw.team_members.filter(function (m) { return m.team_id === t.id; });
      var tks = raw.tasks.filter(function (x) { return x.team_id === t.id && (!fromDate && !toDate || inRange(x.completed_date || x.due_date || x.start_date)); });
      var reps = raw.daily_reports.filter(function (r) { var tm = tmByProfile[r.author_id]; return tm && tm.team_id === t.id && inRange(r.report_date); });
      var persons = personsOfTeam(tms, profMap);                 // 人物単位（emailで集約）
      var pids = tms.map(function (m) { return m.profile_id; });
      byTeam[t.id] = {
        name: t.name,
        avgRate: tms.length ? Math.round(tms.reduce(function (a, m) { return a + (m.achievement_rate || 0); }, 0) / tms.length) : 0,
        progress: calcTeamProgress(raw.mandala_charts, t.id, pids), // チャート基準（0件なら null='—'）
        lateCount: tks.filter(function (x) { return x.status === 'late'; }).length,
        doneCount: tks.filter(function (x) { return x.status === 'done'; }).length,
        taskCount: tks.length,
        reportSubmitDays: new Set(reps.map(function (r) { return r.author_id + '|' + r.report_date; })).size,
        memberCount: persons.length                                // 人物単位（重複ロールを1人に）
      };
    });
    // 全体の進捗: 単一チーム指定ならそのチーム、全社なら各チーム進捗の平均（null除外）
    var overallProgress;
    if (teamUuid) { overallProgress = calcTeamProgress(raw.mandala_charts, teamUuid, tmsAll.map(function (m) { return m.profile_id; })); }
    else { var ps = Object.keys(byTeam).map(function (k) { return byTeam[k].progress; }).filter(function (v) { return v != null; }); overallProgress = ps.length ? Math.round(ps.reduce(function (a, b) { return a + b; }, 0) / ps.length) : null; }
    var personCount = personsOfTeam(tmsAll, profMap).length;
    return { avgRate: avgRate, progress: overallProgress, doneCount: done, lateCount: late, taskCount: tasksAll.length, memberCount: personCount, reportCount: reportsAll.length, byTeam: byTeam };
  }

  // ===== 評価管理タブ共通: 曼荼羅形式で進捗%を表示（KGI+CSFの3x3・KPI廃止） =====
  // chart: {center, subs:[8], acts:[8][8]} / edits: mandala_charts.member_kpi_edits 形式 { 'si-ai': {progress, ...} }
  function renderEvalMandala(chart, edits, containerEl, opts) {
    // KPI廃止: 評価オーバーレイも KGI+CSF8項目 の3x3表示。
    // CSF進捗は opts.csfProgressOf(si)（画面側から紐付けタスク由来を注入）
    // → 無ければ member_kpi_edits['csf-si'].progress → 旧KPIセル(si-ai)平均（互換）の順。
    if (!chart || !containerEl) return;
    edits = edits || {};
    opts = opts || {};
    var evalData = opts.evalData || null;
    containerEl.__cellClick = opts.onCellClick || null;
    function oldCsfAvg(si) {
      var sum = 0;
      for (var ai = 0; ai < 8; ai++) { var e = edits[si + '-' + ai]; sum += e && e.progress != null ? Math.round(+e.progress) : 0; }
      return Math.round(sum / 8);
    }
    function csfProgress(si) {
      if (typeof opts.csfProgressOf === 'function') { var p = opts.csfProgressOf(si); if (p != null) return Math.round(+p); }
      var ce = edits['csf-' + si];
      if (ce && ce.progress != null) return Math.round(+ce.progress);
      return oldCsfAvg(si);
    }
    function colorOf(pct) {
      if (pct >= 100) return { bg: '#D1FAE5', fg: '#065F46', bd: '#10B981' };
      if (pct >= 50) return { bg: '#CFFAFE', fg: '#0E7490', bd: '#06B6D4' };
      if (pct >= 1) return { bg: '#FEF3C7', fg: '#92400E', bd: '#F59E0B' };
      return { bg: '#F3F4F6', fg: '#6B7280', bd: '#D1D5DB' };
    }
    var order = [0, 1, 2, 7, -1, 3, 6, 5, 4];
    var html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-width:560px;margin:0 auto">';
    order.forEach(function (si) {
      var sty = 'position:relative;min-height:64px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:10px;text-align:center;padding:4px;word-break:break-all;line-height:1.25;border-radius:6px;';
      var txt = '', badge = '', onclick = '';
      if (si === -1) {
        sty += 'background:#0D9488;color:#fff;font-weight:800;' + (containerEl.__cellClick ? 'cursor:pointer;' : '');
        txt = (chart.center || '').slice(0, 14);
        if (evalData) {
          var kgiTxt = (evalData.submitted && evalData.kgi) ? ('★' + evalData.kgi) : '未評価';
          badge = '<span style="position:absolute;bottom:1px;right:3px;font-size:10px;font-weight:800">' + kgiTxt + '</span>';
        }
        if (containerEl.__cellClick) onclick = ' onclick="var _c=this.closest(\'[data-eval-mnd]\');_c.__cellClick&&_c.__cellClick(\'kgi\',0,0)"';
      } else {
        var pct = csfProgress(si); var col = colorOf(pct);
        sty += 'background:' + col.bg + ';color:' + col.fg + ';font-weight:700;border:1.5px solid ' + col.bd + ';cursor:pointer;';
        txt = ((chart.subs || [])[si] || '').slice(0, 14);
        badge = '<span style="position:absolute;bottom:1px;right:3px;font-size:8px;font-weight:800">' + pct + '%</span>';
        onclick = ' onclick="var _c=this.closest(\'[data-eval-mnd]\');_c.__cellClick&&_c.__cellClick(\'csf\',' + si + ',0)"';
      }
      html += '<div style="' + sty + '"' + onclick + '>' + txt + badge + '</div>';
    });
    html += '</div>';
    containerEl.setAttribute('data-eval-mnd', '1');
    containerEl.innerHTML = html;
  }

  // ===== 個人画面のチャート管理(renderCmSimpleGrid)と同じ見た目で曼荼羅を表示（参照のみ） =====
  // containerEl: 描画先DOM / chart: {center,subs,acts,color,bg} / edits: member_kpi_edits（keys: 'center' / 'csf-{si}' / '{si}-{ai}'）
  function renderMandalaSimple(containerEl, chart, edits, opts) {
    if (!containerEl || !chart) return;
    edits = edits || {};
    opts = opts || {};
    var color = chart.color || '#0D9488';
    var bg = chart.bg || '#CCEDE9';
    var subs = chart.subs || [];
    var acts = chart.acts || [];
    var clickable = !!opts.onCellClick;          // CSF/KPIセルのクリック編集（リーダー個人DB等）
    var cz = clickable ? 'cursor:pointer;' : '';
    if (containerEl._kpiOn === undefined) containerEl._kpiOn = false;
    var SP_MAP = [
      { cr: 3, cc: 3, oc: [1, 1], si: 0 }, { cr: 3, cc: 4, oc: [1, 4], si: 1 }, { cr: 3, cc: 5, oc: [1, 7], si: 2 },
      { cr: 4, cc: 3, oc: [4, 1], si: 3 }, { cr: 4, cc: 5, oc: [4, 7], si: 4 },
      { cr: 5, cc: 3, oc: [7, 1], si: 5 }, { cr: 5, cc: 4, oc: [7, 4], si: 6 }, { cr: 5, cc: 5, oc: [7, 7], si: 7 }
    ];
    function badge(ed) {
      if (!ed) return '';
      var b = '<span style="position:absolute;top:3px;right:5px;font-size:9px;color:#D97706" title="' + (ed.by || '') + '">✎</span>';
      if (ed.progress != null) b += '<span style="font-size:9px;font-weight:800;margin-top:3px;color:' + (ed.progress >= 100 ? '#059669' : '#D97706') + '">' + ed.progress + '%' + (ed.hoursTotal ? ' / ' + ed.hoursTotal + 'h' : '') + '</span>';
      if (ed.by) b += '<span style="font-size:7px;color:#D97706;font-weight:700">' + ed.by + '</span>';
      return b;
    }
    function simpleHTML() {
      var order = [0, 1, 2, 7, -1, 3, 6, 5, 4];
      var h = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:560px;margin:0 auto">';
      order.forEach(function (si) {
        if (si === -1) {
          var ed = edits['center'];
          var eb = ed ? 'box-shadow:inset 0 0 0 2px #F59E0B;' : '';
          var tx = ((ed && ed.text != null ? ed.text : chart.center) || '').replace(/\n/g, '<br>');
          h += '<div style="position:relative;min-height:90px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-size:13px;font-weight:800;color:#fff;background:' + color + ';border-radius:10px;padding:8px;line-height:1.4;' + eb + '">' + tx + badge(ed) + '</div>';
        } else {
          var ed2 = edits['csf-' + si];
          var label = (ed2 && ed2.text != null ? ed2.text : subs[si]) || '';
          var eb2 = ed2 ? 'box-shadow:inset 0 0 0 2px #F59E0B;background:#FEF3C7;' : 'background:' + bg + ';';
          h += '<div' + (clickable ? ' data-mnd-cell="csf-' + si + '"' : '') + ' style="position:relative;min-height:90px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-size:11px;font-weight:700;color:' + color + ';border:1.5px solid ' + color + ';border-radius:10px;padding:8px;line-height:1.4;' + cz + eb2 + '"><div style="font-size:8px;color:#9CA3AF;font-weight:600;margin-bottom:2px">CSF ' + (si + 1) + '</div>' + label + badge(ed2) + '</div>';
        }
      });
      h += '</div>';
      return h;
    }
    function fullHTML() {
      var G = [];
      for (var i = 0; i < 9; i++) G.push(Array(9).fill(null));
      G[4][4] = { t: 'center' };
      SP_MAP.forEach(function (sp) {
        G[sp.cr][sp.cc] = { t: 'sub', si: sp.si };
        G[sp.oc[0]][sp.oc[1]] = { t: 'sub', si: sp.si };
        var ai = 0;
        for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          var r = sp.oc[0] + dr, c = sp.oc[1] + dc;
          if (!G[r][c]) G[r][c] = { t: 'action', si: sp.si, ai: ai };
          ai++;
        }
      });
      var h = '<div style="display:grid;grid-template-columns:repeat(9,1fr);gap:2px;background:#D1D5DB;border-radius:6px;overflow:hidden;min-width:480px">';
      for (var r2 = 0; r2 < 9; r2++) for (var c2 = 0; c2 < 9; c2++) {
        var cell = G[r2][c2];
        var sty = 'min-height:46px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-size:9px;line-height:1.3;padding:3px 2px;word-break:break-all;position:relative;box-sizing:border-box;';
        if (c2 === 2 || c2 === 5) sty += 'border-right:3px solid #9CA3AF;';
        if (r2 === 2 || r2 === 5) sty += 'border-bottom:3px solid #9CA3AF;';
        var tx = '';
        var dataCell = (clickable && cell && (cell.t === 'sub' || cell.t === 'action')) ? (' data-mnd-cell="' + (cell.t === 'sub' ? ('csf-' + cell.si) : (cell.si + '-' + cell.ai)) + '"') : '';
        if (clickable && cell && (cell.t === 'sub' || cell.t === 'action')) sty += cz;
        if (cell && cell.t === 'center') {
          var ed = edits['center'];
          sty += 'background:' + color + ';color:#fff;font-weight:800;font-size:10px;' + (ed ? 'box-shadow:inset 0 0 0 2px #F59E0B;' : '');
          tx = ((ed && ed.text != null ? ed.text : chart.center) || '').replace(/\n/g, '<br>') + (ed && ed.progress != null ? '<span style="font-size:7px;display:block">' + ed.progress + '%</span>' : '');
        } else if (cell && cell.t === 'sub') {
          var ed3 = edits['csf-' + cell.si];
          sty += (ed3 ? 'background:#FEF3C7;box-shadow:inset 0 0 0 1.5px #F59E0B;' : 'background:' + bg + ';') + 'color:' + color + ';font-weight:700;';
          var stext = (ed3 && ed3.text != null ? ed3.text : (subs[cell.si] || ''));
          tx = stext + (ed3 ? '<span style="font-size:7px;position:absolute;top:1px;right:2px;color:#D97706">✏</span>' : '') + (ed3 && ed3.progress != null ? '<span style="font-size:7px;display:block">' + ed3.progress + '%</span>' : '');
        } else if (cell && cell.t === 'action') {
          var ed4 = edits[cell.si + '-' + cell.ai];
          var atext = ((acts[cell.si] || [])[cell.ai] || '');
          if (ed4) {
            sty += 'background:#FEF3C7;color:#92400E;border:1.5px solid #F59E0B;';
            var pg = ed4.progress > 0 ? '<span style="font-size:7px;margin-top:1px">' + ed4.progress + '%</span>' : '';
            tx = '<span style="font-size:7px;position:absolute;top:1px;right:2px;color:#D97706">✏</span>' + (ed4.text || atext) + pg;
          } else {
            sty += 'background:#F9FAFB;color:#4B5563;border:1px solid #E5E7EB;';
            tx = atext;
          }
        } else { sty += 'background:#E5E7EB;'; }
        h += '<div' + dataCell + ' style="' + sty + '">' + tx + '</div>';
      }
      h += '</div>';
      return h;
    }
    function paint() {
      // KPI廃止: 常にKGI+CSF8項目のシンプル表示（「＋KPIを表示」トグル撤去）
      containerEl.innerHTML = '<div style="overflow-x:auto">' + simpleHTML() + '</div>';
      if (clickable) {
        var cells = containerEl.querySelectorAll('[data-mnd-cell]');
        Array.prototype.forEach.call(cells, function (el) {
          el.onclick = function () {
            var key = el.getAttribute('data-mnd-cell');
            if (key.indexOf('csf-') === 0) opts.onCellClick('csf', +key.slice(4), null);
            else { var p = key.split('-'); opts.onCellClick('kpi', +p[0], +p[1]); }
          };
        });
      }
    }
    paint();
  }

  // ===== 作業時間の集計（KPI→CSF→KGI） =====
  // CSFの合計作業時間: csf_hours_override があれば優先、なければ配下KPI（タスク）のtotal_hours合計。
  //   tasks: [{source_chart, source_cell, total_hours}] / override: member_kpi_edits.csf_hours_override
  function calcCsfTotalHours(chartId, csfIndex, tasks, override) {
    if (override && override[csfIndex] != null && override[csfIndex] !== '') {
      return Math.round((+override[csfIndex]) * 10) / 10;
    }
    var csfIdxNum = +csfIndex; // 呼び出し側が文字列（例: セレクトのvalue）で渡しても一致するよう数値化
    var sum = (tasks || []).filter(function (t) {
      return String(t.source_chart) === String(chartId) && csfIdxFromCell(t.source_cell) === csfIdxNum;
    }).reduce(function (s, t) { return s + (+t.total_hours || 0); }, 0);
    return Math.round(sum * 10) / 10;
  }
  // KGIの合計作業時間 = 全CSF(0..7)の合計時間（上書き含む）の総和
  function calcKgiTotalHours(chartId, tasks, override) {
    var total = 0;
    for (var csfIndex = 0; csfIndex < 8; csfIndex++) {
      total += calcCsfTotalHours(chartId, csfIndex, tasks, override);
    }
    return Math.round(total * 10) / 10;
  }

  window.VexumAPI = {
    ready: ready,
    sb: sb,
    fetchAll: fetchAll,
    calcCsfTotalHours: calcCsfTotalHours,
    calcKgiTotalHours: calcKgiTotalHours,
    renderEvalMandala: renderEvalMandala,
    renderMandalaSimple: renderMandalaSimple,
    loadAdminData: loadAdminData,
    loadLeaderData: loadLeaderData,
    addTeamMember: addTeamMember,
    renderEvalMandala: renderEvalMandala,
    renderMandalaSimple: renderMandalaSimple,
    loadAdminData: loadAdminData,
    loadLeaderData: loadLeaderData,
    addTeamMember: addTeamMember,
    saveTeamMember: saveTeamMember,
    syncTeamMembers: syncTeamMembers,
    deleteTeam: deleteTeam,
    teamRefCounts: teamRefCounts,
    loadTeamComposition: loadTeamComposition,
    updateProfileRole: updateProfileRole,
    removeTeamMember: removeTeamMember,
    updateTeam: updateTeam,
    assignTask: assignTask,
    updateTask: updateTask,
    deleteTask: deleteTask,
    deleteChart: deleteChart,
    logTaskTime: logTaskTime,
    setTaskProgress: setTaskProgress,
    loadTaskTimeLogs: loadTaskTimeLogs,
    loadMemberTimeLogs: loadMemberTimeLogs,
    loadNotifications: loadNotifications,
    loadMyNotifications: loadMyNotifications,
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
    createOrLinkAccount: createOrLinkAccount,
    findLinkedEmployee: findLinkedEmployee,
    createLinkedEmployeeAccount: createLinkedEmployeeAccount,
    loadProfile: loadProfile,
    myRoles: myRoles,
    checkRoleAccess: checkRoleAccess,
    removeRole: removeRole,
    listTeams: listTeams,
    loadTeamMembers: loadTeamMembers,
    updateAccount: updateAccount,
    deleteAccount: deleteAccount,
    listInactiveAccounts: listInactiveAccounts,
    reactivateAccount: reactivateAccount,
    resetPassword: resetPassword,
    setAccountPassword: setAccountPassword,
    sendResetEmail: sendResetEmail,
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
    saveExecComment: saveExecComment,
    loadExecOverview: loadExecOverview,
    loadAllDailyReports: loadAllDailyReports,
    loadDashboardStats: loadDashboardStats,
    TEAM_KEY: TEAM_KEY,
    MEMBER_KEY: MEMBER_KEY,
    // ブラウザコンソールから呼べる通知診断ユーティリティ
    // 使い方: await VexumAPI.diagNotify() をブラウザコンソールで実行
    diagNotify: async function() {
      if (!sb) { console.error('[VEXUM diag] Supabase未接続'); return; }
      var me = await currentProfile();
      console.group('[VEXUM diagNotify]');
      console.log('currentProfile:', me ? { id: me.id, name: me.full_name, role: me.role } : null);
      if (!me) { console.groupEnd(); return; }
      // マルチロール: 同じ auth_user の全 profile ID を表示
      var allPids = await _getAllMyProfileIds(me);
      console.log('allMyProfileIds:', allPids);
      var tm = await sb.from('team_members').select('team_id,role_in_team').eq('profile_id', me.id);
      console.log('team_members(currentProfile):', tm.data, tm.error);
      var teamId = tm.data && tm.data[0] && tm.data[0].team_id;
      if (teamId) {
        var t = await sb.from('teams').select('id,name,leader_id').eq('id', teamId);
        console.log('team:', t.data, t.error);
      }
      // teams.leader_id IN allPids で自分がリーダーのチームを検索（マルチロール対応）
      var myTeams = await sb.from('teams').select('id,name,leader_id').in('leader_id', allPids);
      console.log('teams where leader_id in allPids:', myTeams.data, myTeams.error);
      var nc = await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(10);
      console.log('notifications(最新10件):', nc.data, nc.error);
      var nm = await sb.from('notifications').select('*').in('to_user_id', allPids).order('created_at', { ascending: false }).limit(10);
      console.log('notifications(全ロール宛):', nm.data, nm.error);
      console.groupEnd();
    }
  };
})();
