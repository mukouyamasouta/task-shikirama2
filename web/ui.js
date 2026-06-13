/* =====================================================================
 * web/ui.js — 共通トップバーUIキット（🔔通知ドロップダウン / ⚙設定モーダル）
 *
 * 各画面は読み込むだけ。データ供給は画面側で window.vxNotifSource() を定義する:
 *   window.vxNotifSource = function(){
 *     return [{ icon:'📥', bg:'#DAEEE9', color:'#0D9488',
 *               text:'…', time:'…', tab:'inbox' }, …];
 *   };
 * 並びは新しい順を推奨。tab を指定するとクリックでそのサイドバータブへ遷移。
 *
 * 画面側はデータ反映後に VexumUI.refresh() を呼ぶとバッジが更新される。
 * ⚙ は openSelfModal()（幹部の既存モーダル）があればそれを、無ければ
 * 共通のプロフィール設定モーダルを開く（API.updateSelf に接続）。
 * ===================================================================== */
(function () {
  var SEEN = 0;            // 既読数（開いた時点の件数を記録し、超過分を未読として表示）
  var booted = false;

  function $(id) { return document.getElementById(id); }
  function api() { return window.VexumAPI; }

  // ---- スタイル注入 ----
  function injectCss() {
    if ($('vx-ui-css')) return;
    var s = document.createElement('style');
    s.id = 'vx-ui-css';
    s.textContent =
      '.vx-wrap{position:relative;display:inline-flex}' +
      '.vx-dot{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--red,#EF4444);color:#fff;font-size:10px;font-weight:800;display:none;align-items:center;justify-content:center;line-height:1;box-shadow:0 0 0 2px var(--card,#fff)}' +
      '.vx-panel{position:fixed;width:min(340px,calc(100vw - 24px));max-height:min(460px,70vh);overflow-y:auto;background:var(--card,#fff);border:1px solid var(--border,#E5E7EB);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.20);z-index:10000;display:none}' +
      '.vx-panel.open{display:block}' +
      '.vx-phd{position:sticky;top:0;background:var(--card,#fff);padding:12px 16px;border-bottom:1px solid var(--border,#E5E7EB);font-size:13px;font-weight:800;display:flex;justify-content:space-between;align-items:center}' +
      '.vx-phd .vx-x{background:none;border:none;font-size:18px;line-height:1;cursor:pointer;color:var(--text3,#9CA3AF);padding:0;width:auto;height:auto}' +
      '.vx-item{display:flex;gap:10px;padding:11px 16px;border-bottom:1px solid var(--border,#E5E7EB);cursor:pointer;align-items:flex-start}' +
      '.vx-item:last-child{border-bottom:none}' +
      '.vx-item:hover{background:var(--accent-l,#F0FBFA)}' +
      '.vx-ico{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}' +
      '.vx-txt{font-size:12px;line-height:1.5;color:var(--text,#1A2E2C)}' +
      '.vx-time{font-size:10px;color:var(--text3,#9CA3AF);margin-top:2px}' +
      '.vx-empty{padding:30px 16px;text-align:center;color:var(--text3,#9CA3AF);font-size:12px}' +
      '.vx-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10001;display:none;align-items:flex-start;justify-content:center;padding:48px 16px;overflow-y:auto}' +
      '.vx-ov.open{display:flex}' +
      '.vx-modal{background:var(--card,#fff);border-radius:14px;padding:24px;width:100%;max-width:460px;box-shadow:0 24px 60px rgba(0,0,0,.3)}' +
      '.vx-mhd{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}' +
      '.vx-mhd .vx-t{font-size:16px;font-weight:800;color:var(--text,#1A2E2C)}' +
      '.vx-fg{margin-bottom:14px}' +
      '.vx-fl{display:block;font-size:11px;font-weight:700;color:var(--text3,#6B7280);margin-bottom:5px}' +
      '.vx-fi{width:100%;padding:10px 12px;border:1.5px solid var(--border,#D1D5DB);border-radius:6px;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box}' +
      '.vx-fi:focus{border-color:var(--accent,#0D9488)}' +
      '.vx-save{width:100%;margin-top:6px;padding:11px;background:var(--accent,#0D9488);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit}' +
      '.vx-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#1A2E2C;color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;z-index:10002;opacity:0;transition:opacity .2s;pointer-events:none}' +
      '.vx-toast.show{opacity:.96}';
    document.head.appendChild(s);
  }

  // ---- DOM 注入（ドロップダウン・設定モーダル・トースト）----
  function injectDom() {
    if ($('vx-panel')) return;
    var p = document.createElement('div');
    p.className = 'vx-panel'; p.id = 'vx-panel';
    p.innerHTML =
      '<div class="vx-phd"><span>通知</span><button class="vx-x" onclick="VexumUI.close()">✕</button></div>' +
      '<div id="vx-panel-body"></div>';
    document.body.appendChild(p);

    var ov = document.createElement('div');
    ov.className = 'vx-ov'; ov.id = 'vx-set-ov';
    ov.setAttribute('onclick', 'if(event.target===this)VexumUI.settingsClose()');
    ov.innerHTML =
      '<div class="vx-modal">' +
      '<div class="vx-mhd"><div class="vx-t">プロフィール設定</div>' +
      '<button class="vx-x" style="font-size:22px;background:none;border:none;cursor:pointer;color:#9ca3af" onclick="VexumUI.settingsClose()">✕</button></div>' +
      '<div class="vx-fg"><label class="vx-fl">氏名</label><input class="vx-fi" id="vx-set-name"></div>' +
      '<div class="vx-fg"><label class="vx-fl">メールアドレス</label><input class="vx-fi" id="vx-set-email" type="email"></div>' +
      '<div class="vx-fg"><label class="vx-fl">新しいパスワード（変更する場合のみ）</label><input class="vx-fi" id="vx-set-pw" type="password" placeholder="6文字以上" autocomplete="new-password"></div>' +
      '<button class="vx-save" onclick="VexumUI.settingsSave(this)">変更を保存</button>' +
      '</div>';
    document.body.appendChild(ov);

    var t = document.createElement('div');
    t.className = 'vx-toast'; t.id = 'vx-toast';
    document.body.appendChild(t);
  }

  function toast(msg) {
    var t = $('vx-toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._tm); t._tm = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  function items() {
    try { return (typeof window.vxNotifSource === 'function' ? window.vxNotifSource() : []) || []; }
    catch (e) { return []; }
  }

  function badge() {
    var b = $('vx-dot'); if (!b) return;
    var n = items().length;
    var unread = Math.max(0, n - SEEN);
    if (unread > 0) { b.textContent = unread > 99 ? '99+' : unread; b.style.display = 'flex'; }
    else { b.style.display = 'none'; }
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function render() {
    var body = $('vx-panel-body'); if (!body) return;
    var list = items();
    if (!list.length) { body.innerHTML = '<div class="vx-empty">新しい通知はありません</div>'; return; }
    body.innerHTML = list.map(function (it, i) {
      var bg = it.bg || 'var(--accent-l,#DAEEE9)', col = it.color || 'var(--accent,#0D9488)';
      return '<div class="vx-item" data-i="' + i + '">' +
        '<div class="vx-ico" style="background:' + bg + ';color:' + col + '">' + esc(it.icon || '🔔') + '</div>' +
        '<div><div class="vx-txt">' + esc(it.text || '') + '</div>' +
        (it.time ? '<div class="vx-time">' + esc(it.time) + '</div>' : '') + '</div></div>';
    }).join('');
    Array.prototype.forEach.call(body.querySelectorAll('.vx-item'), function (el) {
      el.addEventListener('click', function () {
        var it = list[+el.getAttribute('data-i')];
        close();
        if (it && it.tab) goTab(it.tab);
      });
    });
  }

  function position() {
    var bell = $('vx-bell'), p = $('vx-panel'); if (!bell || !p) return;
    var r = bell.getBoundingClientRect();
    p.style.top = (r.bottom + 8) + 'px';
    p.style.right = Math.max(12, window.innerWidth - r.right) + 'px';
  }

  function open() {
    injectDom(); render(); position();
    $('vx-panel').classList.add('open');
    SEEN = items().length; badge();
    setTimeout(function () { document.addEventListener('click', onDoc, true); }, 0);
  }
  function close() {
    var p = $('vx-panel'); if (p) p.classList.remove('open');
    document.removeEventListener('click', onDoc, true);
  }
  function onDoc(e) {
    var p = $('vx-panel'), bell = $('vx-bell');
    if (!p) return;
    if (p.contains(e.target) || (bell && bell.contains(e.target))) return;
    close();
  }
  function toggle(e) {
    if (e) e.stopPropagation();
    var p = $('vx-panel');
    if (p && p.classList.contains('open')) close(); else open();
  }

  function goTab(tab) {
    var btn = null, list = document.querySelectorAll('.sb-item');
    for (var i = 0; i < list.length; i++) {
      var o = list[i].getAttribute('onclick');
      if (o && o.indexOf("'" + tab + "'") >= 0) { btn = list[i]; break; }
    }
    if (btn) { btn.click(); btn.scrollIntoView({ block: 'nearest' }); }
    else if (typeof window.swTab === 'function') { window.swTab(tab, null); }
  }

  // ---- ⚙ 設定モーダル（共通／幹部は既存 openSelfModal を優先）----
  function settingsOpen() {
    if (typeof window.openSelfModal === 'function') { window.openSelfModal(); return; }
    injectDom();
    $('vx-set-name').value = ($('sb-uname') || {}).textContent || '';
    $('vx-set-email').value = ($('sb-uemail') || {}).textContent || '';
    $('vx-set-pw').value = '';
    $('vx-set-ov').classList.add('open');
  }
  function settingsClose() { var o = $('vx-set-ov'); if (o) o.classList.remove('open'); }
  function settingsSave(btn) {
    var name = $('vx-set-name').value.trim();
    var email = $('vx-set-email').value.trim();
    var pw = $('vx-set-pw').value;
    if (!name) { toast('氏名を入力してください'); return; }
    if (pw && pw.length < 6) { toast('パスワードは6文字以上'); return; }
    var A = api();
    var apply = function () {
      var un = $('sb-uname'); if (un) un.textContent = name;
      var ue = $('sb-uemail'); if (ue) ue.textContent = email;
      settingsClose(); toast('プロフィールを更新しました ✓');
    };
    if (A && A.ready) {
      if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
      A.updateSelf({ name: name, email: email, password: pw || null }).then(function (res) {
        if (btn) { btn.disabled = false; btn.textContent = '変更を保存'; }
        if (res && res.error) { toast('更新失敗: ' + res.error); return; }
        apply();
      }).catch(function (e) {
        if (btn) { btn.disabled = false; btn.textContent = '変更を保存'; }
        toast('更新失敗: ' + (e.message || e));
      });
    } else { apply(); }
  }

  // ---- トップバーの 🔔 / ⚙ を配線 ----
  // クリックは document へのイベントデリゲーションで拾う（ボタンが
  // 再描画されたり、他スクリプトのエラーがあっても確実に反応する）。
  function wire() {
    var icons = document.querySelectorAll('.topbar-actions .tb-icon, .topbar .tb-icon');
    Array.prototype.forEach.call(icons, function (b) {
      var t = (b.textContent || '').trim();
      if (t.indexOf('🔔') >= 0 && !b._vxWired) {
        b._vxWired = true; b.id = 'vx-bell'; b.title = '通知';
        var wrap = document.createElement('span'); wrap.className = 'vx-wrap';
        b.parentNode.insertBefore(wrap, b); wrap.appendChild(b);
        var dot = document.createElement('span'); dot.className = 'vx-dot'; dot.id = 'vx-dot';
        wrap.appendChild(dot);
      } else if (t.indexOf('⚙') >= 0 && !b._vxWired) {
        b._vxWired = true; b.title = '設定';
      }
    });
    if (!document._vxDelegated) {
      document._vxDelegated = true;
      document.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.tb-icon') : null;
        if (!btn) return;
        var t = (btn.textContent || '').trim();
        if (t.indexOf('🔔') >= 0) { e.stopPropagation(); wire(); toggle(); }
        else if (t.indexOf('⚙') >= 0) { e.stopPropagation(); settingsOpen(); }
      });
      window.addEventListener('resize', function () { var p = $('vx-panel'); if (p && p.classList.contains('open')) position(); });
    }
  }

  function boot() {
    if (booted) return; booted = true;
    injectCss(); injectDom(); wire(); badge();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.VexumUI = {
    refresh: function () { badge(); var p = $('vx-panel'); if (p && p.classList.contains('open')) render(); },
    open: open, close: close, toggle: toggle,
    settingsOpen: settingsOpen, settingsClose: settingsClose, settingsSave: settingsSave,
    toast: toast, goTab: goTab
  };
})();
