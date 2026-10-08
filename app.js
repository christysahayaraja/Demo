/* Better Than Yesterday — plain JS activity tracker (data in localStorage) */
(() => {
  'use strict';

  /* ---------- constants ---------- */
  const KEY = 'bty_state_v1';
  const COLORS = { cyan:'#22d3ee', purple:'#c084fc', emerald:'#34d399', orange:'#fb923c', pink:'#f472b6' };
  const STATUS = {
    completed:{ label:'Completed', icon:'✓', color:'#34d399' },
    partial:{ label:'Partial', icon:'◐', color:'#fb923c' },
    skipped:{ label:'Skipped', icon:'–', color:'#c084fc' },
    missed:{ label:'Missed', icon:'✕', color:'#f87171' }
  };
  const CYCLE = ['completed','partial','skipped','missed'];
  const DEFAULT_HABITS = [
    ['Wake up at 5:00 AM','🌅','orange','Morning','time',1,'hard','high'],
    ['Drink 3 Litres Water','💧','cyan','Health','litres',3,'easy','high'],
    ['Upgrade Yourself (Learn Any Skill)','🚀','purple','Growth','session',1,'medium','high'],
    ['Read Book for 30 Minutes','📚','emerald','Growth','minutes',30,'easy','medium'],
    ['Study for 1.5 Hours','🧠','purple','Growth','minutes',90,'hard','high'],
    ['Walk 6000 Steps','🚶','emerald','Fitness','steps',6000,'medium','medium'],
    ['Sleep 8 Hours','😴','cyan','Health','hours',8,'medium','high'],
    ['Eat Proper Food 3 Times Daily','🥗','emerald','Health','meals',3,'easy','medium'],
    ['30 Push Ups','💪','orange','Fitness','reps',30,'medium','high'],
    ['10 Pull Ups','🏋️','purple','Fitness','reps',10,'hard','high'],
    ['1 Min Plank','🧱','emerald','Fitness','minutes',1,'medium','medium'],
    ['Self Reflection / Thinking 15 Minutes','🧘','purple','Mind','minutes',15,'easy','medium'],
    ['Listen to Music','🎧','cyan','Mind','session',1,'easy','low'],
    ['Instagram Screen Time < 1h 30m','📵','orange','Discipline','minutes',90,'hard','high']
  ];

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const pad = n => String(n).padStart(2, '0');
  const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const fromKey = k => { const [y,m,d] = k.split('-').map(Number); return new Date(y, m-1, d); };
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c === 'x' ? r : (r&3|8)).toString(16); }));
  const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const daysInMonth = (y, m) => new Date(y, m+1, 0).getDate();
  const DAY = 86400000;

  /* ---------- state ---------- */
  const cloud = window.BTYCloud;
  let cloudUser = null;      // signed-in Supabase user (null = local mode)
  let state = load();
  let filter = 'All';
  let editingId = null;

  function seedHabits() {
    const today = dateKey(new Date());
    return DEFAULT_HABITS.map((h,i) => ({
        id:uid(), name:h[0], emoji:h[1], color:h[2], category:h[3], target_unit:h[4], target_value:h[5],
        difficulty:h[6], priority:h[7], reminder_enabled:false, reminder_time:null,
        sort_order:i, archived:false, active_from:today, deleted_at:null
      }));
  }
  function seed() { return { profile:{ name:'' }, habits:seedHabits(), logs:[] }; }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.habits && s.logs) return s; } catch (e) {}
    return seed();
  }
  function save() { if (cloudUser) return; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('Could not save (storage full or blocked)'); } }

  /* ---------- progression (same rules as the course app) ---------- */
  const activeHabits = () => state.habits.filter(h => !h.deleted_at && !h.archived);
  const applicable = k => state.habits.filter(h => h.active_from <= k && (!h.deleted_at || h.deleted_at.slice(0,10) > k));
  const logFor = (hid, k) => state.logs.find(l => l.habit_id === hid && l.log_date === k);
  const totalScore = () => state.logs.reduce((t,l) => t + (l.status === 'completed' ? l.score_awarded : 0), 0);
  const threshold = lv => 100 * Math.max(0, lv-1) ** 2;
  function levelInfo(score) {
    const s = Math.max(0, score), level = Math.floor(Math.sqrt(s/100)) + 1;
    const cur = threshold(level), next = threshold(level+1);
    return { level, next, toNext: next - s, pct: Math.min(100, Math.max(0, (s-cur)/(next-cur)*100)) };
  }
  function isCompleteDay(k) {
    const exp = applicable(k); if (!exp.length) return false;
    const done = new Set(state.logs.filter(l => l.log_date === k && l.status === 'completed').map(l => l.habit_id));
    return exp.every(h => done.has(h.id));
  }
  function streak(todayKey) {
    const c = fromKey(todayKey);
    if (!isCompleteDay(todayKey)) c.setDate(c.getDate()-1);
    let cur = 0;
    for (let i = 0; i < 3660; i++) { if (!isCompleteDay(dateKey(c))) break; cur++; c.setDate(c.getDate()-1); }
    const days = [...new Set(state.logs.map(l => l.log_date))].filter(isCompleteDay).sort();
    let longest = 0, run = 0, prev = null;
    days.forEach(k => { const d = fromKey(k); run = prev && Math.round((d-prev)/DAY) === 1 ? run+1 : 1; longest = Math.max(longest, run); prev = d; });
    return { current:cur, longest:Math.max(longest, cur) };
  }
  function todayProgress(k) {
    const list = applicable(k).filter(h => !h.archived && !h.deleted_at);
    const done = list.filter(h => logFor(h.id,k)?.status === 'completed').length;
    return { done, total:list.length, pct:list.length ? Math.round(done/list.length*100) : 0, all:list.length > 0 && done === list.length };
  }
  function achievements(score, st) {
    const n = state.logs.filter(l => l.status === 'completed').length;
    return [
      { t:'First Step', d:'Complete your first daily quest.', on:n >= 1 },
      { t:'7 Day Warrior', d:'Maintain a seven-day streak.', on:st.longest >= 7 },
      { t:'30 Day Discipline', d:'Maintain a thirty-day streak.', on:st.longest >= 30 },
      { t:'Level Up', d:'Reach level two.', on:levelInfo(score).level >= 2 },
      { t:'Consistency Master', d:'Complete one hundred quests.', on:n >= 100 }
    ];
  }

  /* ---------- actions ---------- */
  function setStatus(hid, k, status) {
    state.logs = state.logs.filter(l => !(l.habit_id === hid && l.log_date === k));
    if (status) state.logs.push({
      id:uid(), habit_id:hid, log_date:k, status,
      progress: status === 'completed' ? 100 : status === 'partial' ? 50 : 0,
      note:null, score_awarded: status === 'completed' ? 10 : 0
    });
    save();
    if (cloudUser) { const logObj = logFor(hid, k); remote(() => status ? cloud.setLog(logObj) : cloud.clearLog(hid, k)); }
    const wasAll = celebrated === k;
    render();
    if (todayProgress(k).all && !wasAll) { celebrated = k; burst(); }
    if (!todayProgress(k).all && celebrated === k) celebrated = null;
  }
  let celebrated = null;
  const nextStatus = cur => !cur ? CYCLE[0] : (CYCLE.indexOf(cur) === CYCLE.length-1 ? null : CYCLE[CYCLE.indexOf(cur)+1]);

  function deleteHabit(id) {
    const h = state.habits.find(x => x.id === id); if (!h) return;
    if (!confirm(`Delete "${h.name}"? Past history is kept.`)) return;
    h.deleted_at = new Date().toISOString(); save(); render(); toast('Quest deleted');
    if (cloudUser) remote(() => cloud.saveHabit(h));
  }

  /* ---------- rendering ---------- */
  function render() {
    const now = new Date(), tk = dateKey(now);
    $('#b-name').textContent = state.profile.name || 'Hunter';
    const score = totalScore(), lv = levelInfo(score), st = streak(tk), tp = todayProgress(tk), ach = achievements(score, st);

    $('#lvl').textContent = pad(lv.level);
    $('#lvl-next').textContent = `${lv.toNext.toLocaleString()} points`;
    $('#lvl-bar').style.width = lv.pct + '%';
    $('#lvl-text').textContent = `${score.toLocaleString()} total score · ${tp.pct}% today`;
    $('#s-today').textContent = tp.pct + '%';
    $('#s-today-sub').textContent = `${tp.done} / ${tp.total} quests`;
    $('#s-streak').textContent = st.current;
    $('#s-longest').textContent = `Longest: ${st.longest}`;
    $('#s-score').textContent = score.toLocaleString();
    $('#s-ach').textContent = `${ach.filter(a => a.on).length}/${ach.length}`;

    renderFilters(); renderHabits(tk); renderAch(ach); renderTrend(); renderRank(); renderHistory(now, tk);
  }

  function renderFilters() {
    const cats = ['All', ...new Set(activeHabits().map(h => h.category))];
    if (!cats.includes(filter)) filter = 'All';
    $('#filters').innerHTML = cats.map(c => `<button class="chip ${c===filter?'on':''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  }

  function renderHabits(tk) {
    const list = activeHabits().filter(h => filter === 'All' || h.category === filter).sort((a,b) => a.sort_order - b.sort_order);
    $('#habit-empty').hidden = list.length > 0;
    $('#habit-list').innerHTML = list.map(h => {
      const s = logFor(h.id, tk)?.status, c = COLORS[h.color] || COLORS.cyan;
      return `<li class="habit ${s==='completed'?'done':''}" style="--c:${c}">
        <button class="status-btn" data-toggle="${h.id}" title="Tap to change status" style="${s?`color:${STATUS[s].color};border-color:${STATUS[s].color}`:''}">${s?STATUS[s].icon:esc(h.emoji)}</button>
        <div class="info"><div class="name">${esc(h.emoji)} ${esc(h.name)}</div>
          <div class="meta"><span>${esc(h.category)}</span><span>🎯 ${esc(h.target_value)} ${esc(h.target_unit)}</span><span>${esc(h.priority)} · ${esc(h.difficulty)}</span>${h.reminder_enabled&&h.reminder_time?`<span>⏰ ${esc(h.reminder_time)}</span>`:''}${s?`<span style="color:${STATUS[s].color}">${STATUS[s].label}</span>`:''}</div></div>
        <div class="tools"><button class="icon-btn" data-edit="${h.id}" title="Edit">✎</button><button class="icon-btn" data-del="${h.id}" title="Delete">🗑</button></div>
      </li>`;
    }).join('');
  }

  function renderAch(ach) {
    $('#ach').innerHTML = ach.map(a => `<div class="ach ${a.on?'on':''}"><b>${a.on?'🏆':'🔒'} ${a.t}</b><small>${a.d}</small></div>`).join('');
  }

  function renderRank() {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth();
    const from = `${y}-${pad(m+1)}-01`, to = `${y}-${pad(m+1)}-${pad(daysInMonth(y,m))}`;
    const rows = activeHabits().map(h => ({ h, n: state.logs.filter(l => l.habit_id === h.id && l.status === 'completed' && l.log_date >= from && l.log_date <= to).length }))
      .sort((a,b) => b.n - a.n).slice(0, 8);
    const max = Math.max(1, now.getDate());
    $('#chart-rank').innerHTML = rows.map(r => `<div class="rank-row" style="--c:${COLORS[r.h.color]||COLORS.cyan}"><span>${esc(r.h.emoji)} ${esc(r.h.name)}</span><div class="track"><span style="width:${Math.min(100, r.n/max*100)}%"></span></div><b>${r.n}</b></div>`).join('') || '<p class="muted">No data yet.</p>';
  }

  function renderTrend() {
    const cv = $('#chart-trend'), dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth || 400, H = 200;
    cv.width = W*dpr; cv.height = H*dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,W,H);
    const pts = [], total = activeHabits().length;
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate()-i); const k = dateKey(d);
      const done = state.logs.filter(l => l.log_date === k && l.status === 'completed').length;
      pts.push({ label:`${d.getDate()}/${d.getMonth()+1}`, v: total ? Math.min(100, Math.round(done/total*100)) : 0 });
    }
    const L = 30, R = 8, T = 10, B = 24, w = W-L-R, h = H-T-B;
    g.font = '10px system-ui'; g.fillStyle = '#64748b'; g.strokeStyle = 'rgba(255,255,255,.07)';
    [0,50,100].forEach(v => { const y = T + h - v/100*h; g.beginPath(); g.moveTo(L,y); g.lineTo(W-R,y); g.stroke(); g.fillText(v+'%', 0, y+3); });
    const x = i => L + i/(pts.length-1)*w, y = v => T + h - v/100*h;
    const grad = g.createLinearGradient(0,T,0,T+h); grad.addColorStop(0,'rgba(34,211,238,.35)'); grad.addColorStop(1,'rgba(34,211,238,0)');
    g.beginPath(); pts.forEach((p,i) => i ? g.lineTo(x(i),y(p.v)) : g.moveTo(x(i),y(p.v)));
    g.lineTo(x(pts.length-1),T+h); g.lineTo(x(0),T+h); g.closePath(); g.fillStyle = grad; g.fill();
    g.beginPath(); pts.forEach((p,i) => i ? g.lineTo(x(i),y(p.v)) : g.moveTo(x(i),y(p.v)));
    g.strokeStyle = '#22d3ee'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#22d3ee'; pts.forEach((p,i) => { g.beginPath(); g.arc(x(i),y(p.v),3,0,7); g.fill(); });
    g.fillStyle = '#64748b'; pts.forEach((p,i) => { if (i % 3 === 0 || i === pts.length-1) g.fillText(p.label, x(i)-10, H-8); });
  }

  function renderHistory(now, tk) {
    const y = now.getFullYear(), m = now.getMonth(), n = daysInMonth(y,m);
    $('#month-title').textContent = now.toLocaleDateString(undefined, { month:'long', year:'numeric' });
    const days = Array.from({length:n}, (_,i) => i+1), key = d => `${y}-${pad(m+1)}-${pad(d)}`;
    let html = '<thead><tr><th>Quest</th>' + days.map(d => `<th class="${key(d)===tk?'today':''}">${d}</th>`).join('') + '</tr></thead><tbody>';
    html += activeHabits().sort((a,b)=>a.sort_order-b.sort_order).map(h => '<tr><td>' + esc(h.emoji) + ' ' + esc(h.name) + '</td>' + days.map(d => {
      const k = key(d), s = logFor(h.id,k)?.status, isToday = k === tk, future = k > tk;
      const inner = s ? STATUS[s].icon : (future ? '·' : (isToday ? '＋' : '🔒'));
      return `<td><button class="cell ${isToday?'edit':''}" ${isToday?`data-cell="${h.id}"`:'disabled'} style="${s?`color:${STATUS[s].color}`:''}" aria-label="${esc(h.name)} ${k}">${inner}</button></td>`;
    }).join('') + '</tr>').join('') + '</tbody>';
    $('#history').innerHTML = html;
  }

  /* ---------- dialogs ---------- */
  const dlg = $('#dlg-habit'), form = $('#habit-form');
  function openEditor(id) {
    editingId = id; form.reset();
    $('#dlg-title').textContent = id ? 'Edit quest' : 'New quest';
    if (id) { const h = state.habits.find(x => x.id === id); Object.keys(h).forEach(k => { const el = form.elements[k]; if (!el) return; if (el.type === 'checkbox') el.checked = !!h[k]; else el.value = h[k] ?? ''; }); }
    dlg.showModal();
  }
  form.addEventListener('submit', e => {
    e.preventDefault();
    const f = form.elements, data = {
      name:f.name.value.trim(), emoji:f.emoji.value.trim() || '✅', category:f.category.value.trim() || 'General',
      target_value:Number(f.target_value.value) || 1, target_unit:f.target_unit.value.trim() || 'time',
      priority:f.priority.value, difficulty:f.difficulty.value, color:f.color.value,
      reminder_time:f.reminder_time.value || null, reminder_enabled:f.reminder_enabled.checked && !!f.reminder_time.value
    };
    if (!data.name) return;
    let habit;
    if (editingId) habit = Object.assign(state.habits.find(h => h.id === editingId), data);
    else { habit = { id:uid(), ...data, sort_order:state.habits.length, archived:false, active_from:dateKey(new Date()), deleted_at:null }; state.habits.push(habit); }
    save(); if (cloudUser) remote(() => cloud.saveHabit(habit)); dlg.close(); render(); toast(editingId ? 'Quest updated' : 'Quest added');
    if (data.reminder_enabled) askNotify();
  });
  $('#dlg-cancel').onclick = () => dlg.close();
  $('#btn-add').onclick = () => openEditor(null);

  const nameDlg = $('#dlg-name');
  $('#name-form').addEventListener('submit', e => {
    e.preventDefault(); state.profile.name = e.target.elements.name.value.trim() || 'Hunter'; save(); nameDlg.close(); render();
    if (cloudUser) remote(() => cloud.updateName(state.profile.name));
  });
  $('#b-name').style.cursor = 'pointer';
  $('#b-name').title = 'Click to change name';
  $('#b-name').onclick = () => { $('#name-form').elements.name.value = state.profile.name; nameDlg.showModal(); };

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-toggle],[data-edit],[data-del],[data-cat],[data-cell]'); if (!t) return;
    const tk = dateKey(new Date());
    if (t.dataset.toggle) setStatus(t.dataset.toggle, tk, nextStatus(logFor(t.dataset.toggle, tk)?.status));
    else if (t.dataset.cell) setStatus(t.dataset.cell, tk, nextStatus(logFor(t.dataset.cell, tk)?.status));
    else if (t.dataset.edit) openEditor(t.dataset.edit);
    else if (t.dataset.del) deleteHabit(t.dataset.del);
    else if (t.dataset.cat) { filter = t.dataset.cat; render(); }
  });

  $('#btn-export').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type:'application/json' }));
    a.download = `better-than-yesterday-${dateKey(new Date())}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  $('#import-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const s = JSON.parse(await f.text()); if (!Array.isArray(s.habits) || !Array.isArray(s.logs)) throw 0;
      const map = {}, fix = id => isUuid(id) ? id : (map[id] = map[id] || uid());   // Supabase needs UUID ids
      s.habits.forEach(h => { h.id = fix(h.id); }); s.logs.forEach(l => { l.id = fix(l.id); l.habit_id = fix(l.habit_id); });
      if (cloudUser) {   // merge into the cloud account
        const hm = new Map(state.habits.map(h => [h.id, h])); s.habits.forEach(h => hm.set(h.id, h));
        const lm = new Map(state.logs.map(l => [l.habit_id + l.log_date, l]));
        s.logs.forEach(l => { const old = lm.get(l.habit_id + l.log_date); if (old) l.id = old.id; lm.set(l.habit_id + l.log_date, l); });
        state.habits = [...hm.values()]; state.logs = [...lm.values()];
        remote(() => cloud.pushAll(s.habits, s.logs));
      } else { state = { profile:s.profile || { name:'' }, habits:s.habits, logs:s.logs }; save(); }
      render(); toast('Backup imported');
    }
    catch { toast('Invalid backup file'); }
    e.target.value = '';
  };

  /* ---------- reminders (browser notifications while the tab is open) ---------- */
  async function askNotify() {
    if (!('Notification' in window)) return toast('Notifications not supported in this browser');
    if (Notification.permission === 'granted') return toast('Reminders are on');
    if (Notification.permission === 'denied') return toast('Notifications blocked — allow them in site settings');
    const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Reminders enabled' : 'Notifications not allowed');
  }
  $('#btn-notify').onclick = askNotify;
  function checkReminders() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const n = new Date(), t = `${pad(n.getHours())}:${pad(n.getMinutes())}`, d = dateKey(n);
    activeHabits().filter(h => h.reminder_enabled && h.reminder_time === t).forEach(h => {
      const k = `bty-rem-${h.id}-${d}-${t}`;
      try { if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch {}
      if (logFor(h.id, d)?.status !== 'completed') { try { new Notification('Daily quest awaits', { body:h.name, icon:'assets/favicon.png', tag:h.id }); } catch (e) {} }
    });
  }

  /* ---------- clock, toast, confetti-ish burst ---------- */
  function tick() {
    const n = new Date();
    $('#clock-time').textContent = n.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true });
    $('#clock-date').textContent = n.toLocaleDateString(undefined, { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    $('#b-day').textContent = 'HUNTER STATUS // ' + n.toLocaleDateString(undefined, { weekday:'long' }).toUpperCase();
  }
  let tt; function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), 2400); }
  function burst() { const b = $('#burst'); b.hidden = false; setTimeout(() => b.hidden = true, 1800); }

  /* ---------- midnight rollover & init ---------- */
  let lastDay = dateKey(new Date());
  setInterval(() => { tick(); checkReminders(); const d = dateKey(new Date()); if (d !== lastDay) { lastDay = d; render(); } }, 1000);
  window.addEventListener('resize', renderTrend);
  /* ---------- Supabase: auth, sync, boot ---------- */
  const authDlg = $('#dlg-auth'), authForm = $('#auth-form');
  let authMode = 'login';

  function setSync(s) {
    const el = $('#sync'); if (!cloudUser) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = { loading:'☁ loading…', saving:'☁ saving…', saved:'☁ synced', error:'☁ sync error' }[s] || '';
    el.style.color = s === 'error' ? '#f87171' : '';
  }
  let chain = Promise.resolve();
  function remote(job) {
    setSync('saving');
    chain = chain.then(job).then(() => setSync('saved')).catch(e => { setSync('error'); toast('Cloud sync failed: ' + (e.message || e)); });
    return chain;
  }
  function setModeUI() {
    const b = $('#btn-cloud');
    b.hidden = !(cloud && cloud.enabled);
    b.textContent = cloudUser ? `⏻ Log out (${cloudUser.user_metadata?.user_id || 'account'})` : '☁ Sign in';
    $('#footer').textContent = cloudUser ? 'Your data is stored in your Supabase account and syncs across devices.'
      : 'Data is saved in your browser (localStorage). Use Export to back it up.';
    setSync('saved');
  }
  function setAuthMode(m) {
    authMode = m; authForm.classList.toggle('register', m === 'register');
    authForm.querySelectorAll('[data-auth-mode]').forEach(b => b.classList.toggle('on', b.dataset.authMode === m));
    $('#auth-submit').textContent = m === 'login' ? 'Log in' : 'Create account';
    authForm.elements.fullName.required = authForm.elements.confirm.required = m === 'register';
    authForm.elements.password.autocomplete = m === 'login' ? 'current-password' : 'new-password';
    $('#auth-error').hidden = true;
  }
  authForm.addEventListener('click', e => { const t = e.target.closest('[data-auth-mode]'); if (t) setAuthMode(t.dataset.authMode); });
  authDlg.addEventListener('cancel', e => e.preventDefault());   // Esc must not skip sign-in
  $('#auth-offline').onclick = () => { authDlg.close(); state = load(); setModeUI(); render(); if (!state.profile.name) nameDlg.showModal(); };
  authForm.addEventListener('submit', async e => {
    e.preventDefault();
    const f = authForm.elements, err = $('#auth-error'), btn = $('#auth-submit');
    err.hidden = true;
    if (authMode === 'register' && f.password.value !== f.confirm.value) { err.textContent = 'Passwords do not match.'; err.hidden = false; return; }
    btn.disabled = true;
    try {
      const user = authMode === 'login' ? await cloud.signIn(f.userId.value, f.password.value)
        : await cloud.signUp(f.fullName.value.trim(), f.userId.value, f.password.value);
      authForm.reset(); await enterCloud(user);
    } catch (ex) { err.textContent = ex.message || 'Something went wrong.'; err.hidden = false; }
    finally { btn.disabled = false; }
  });
  $('#btn-cloud').onclick = async () => {
    if (cloudUser) {
      await cloud.signOut(); cloudUser = null; state = { profile:{ name:'' }, habits:[], logs:[] };
      setModeUI(); render(); setAuthMode('login'); authDlg.showModal();
    } else { setAuthMode('login'); authDlg.showModal(); }
  };
  async function enterCloud(user) {
    cloudUser = user; if (authDlg.open) authDlg.close();
    state = { profile:{ name:'' }, habits:[], logs:[] }; setModeUI(); setSync('loading');
    try {
      const data = await cloud.loadAll();
      const uidName = user.user_metadata?.user_id || 'hunter';
      const name = data.profile?.full_name || user.user_metadata?.full_name || 'Hunter';
      if (!data.profile) await cloud.ensureProfile(name, uidName);
      if (!data.habits.length) { data.habits = seedHabits(); await cloud.pushAll(data.habits, []); }   // first login → default quests
      state = { profile:{ name }, habits:data.habits, logs:data.logs };
      setSync('saved'); toast('Signed in · data loaded');
    } catch (ex) { setSync('error'); toast('Could not load cloud data: ' + (ex.message || ex)); }
    render();
  }
  async function boot() {
    if (!cloud || !cloud.enabled) {   // no Supabase configured → local mode
      if (cloud && !cloud.configured) console.info('Supabase not configured (see supabase/config.js) — running in local mode.');
      setModeUI(); render(); if (!state.profile.name) nameDlg.showModal();
      if (cloud && cloud.configured) toast('Could not load Supabase (check your internet) — running offline');
      return;
    }
    state = { profile:{ name:'' }, habits:[], logs:[] }; setModeUI(); render();
    let user = null; try { user = await cloud.getUser(); } catch (e) {}
    if (user) enterCloud(user); else { setAuthMode('login'); authDlg.showModal(); }
  }
  tick(); boot();
})();
