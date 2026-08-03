/* GymLog — UI */

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let route = 'home';
let ui = { exFilter: 'all', exSearch: '', statsEx: null, showMeas: false, histOpen: null };
let rest = { endsAt: 0, iv: null, total: 0 };
let audioCtx = null;

/* ============ boot ============ */
document.addEventListener('DOMContentLoaded', () => {
  load();
  document.documentElement.dataset.theme = S.settings.theme;
  if (S.active) route = 'log';
  renderNav();
  render();
  $('#btn-settings').addEventListener('click', openSettings);
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onInput);
});

/* ============ nav ============ */
const TABS = [
  { id: 'home', ic: '🏠', k: 'tab_home' },
  { id: 'history', ic: '📋', k: 'tab_history' },
  { id: 'exercises', ic: '📚', k: 'tab_exercises' },
  { id: 'stats', ic: '📈', k: 'tab_stats' },
  { id: 'body', ic: '⚖️', k: 'tab_body' },
];
function renderNav() {
  $('#nav').innerHTML = TABS.map((tb) =>
    `<button data-act="tab" data-v="${tb.id}" class="${route === tb.id ? 'on' : ''}">
       <span class="ic">${tb.ic}</span><span>${esc(t(tb.k))}</span></button>`).join('');
}
function go(r) { route = r; renderNav(); render(); const m = $('#app'); if (m) m.scrollTop = 0; }

/* ============ render ============ */
function render() {
  const titles = { home: 'app', log: 'in_progress', history: 'tab_history', exercises: 'tab_exercises', stats: 'tab_stats', body: 'tab_body' };
  $('#title').textContent = route === 'home' ? 'GymLog' : t(titles[route] || 'app');
  const v = { home: viewHome, log: viewLog, history: viewHistory, exercises: viewExercises, stats: viewStats, body: viewBody }[route] || viewHome;
  $('#app').innerHTML = v();
  renderNav();
  renderRestBar();
  drawCharts();
}

/* ============ HOME ============ */
function viewHome() {
  const st = overallStats();
  const w = weightSeries();
  const cur = w.length ? w[w.length - 1].v : null;
  const dsb = daysSinceBackup();
  let html = '';

  if (S.active) {
    const n = activeSetCount();
    html += `<div class="card">
      <div class="row between"><div><div class="tiny">${esc(t('in_progress'))}</div>
      <div style="font-weight:700;font-size:17px;margin-top:2px">${esc(S.active.name || t('start_empty'))}</div>
      <div class="small muted">${n} ${esc(t('sets_short'))} · ${esc(fmtDay(S.active.startedAt, S.settings.lang))}</div></div>
      <div class="badge acc">●</div></div>
      <div style="height:10px"></div>
      <button class="btn" data-act="resume">${esc(t('resume'))}</button></div>`;
  } else {
    html += `<button class="btn" data-act="start-empty">${esc(t('start_empty'))}</button><div style="height:12px"></div>`;
    html += `<div class="row between" style="margin:20px 0 10px">
      <h2 style="margin:0">${esc(t('start_from'))}</h2>
      <button class="chip" data-act="new-tpl">+ ${esc(t('new'))}</button></div>`;
    if (!S.templates.length) html += `<div class="empty">${esc(t('no_templates'))}</div>`;
    else html += `<div class="list">` + S.templates.map((tp) => {
      const names = (tp.items || []).map((i) => label(exById(i.exId))).slice(0, 4).join(' · ');
      return `<div class="item">
        <div class="grow" data-act="start-tpl" data-v="${tp.id}"><div style="font-weight:650">${esc(label(tp) || tp.name)}</div>
        <div class="small dim" style="margin-top:2px">${esc(names)}${(tp.items || []).length > 4 ? ' …' : ''}</div></div>
        ${tp.seeded ? `<span class="badge acc">${esc(t('program_note'))}</span>` : ''}
        <button class="badge" data-act="edit-tpl" data-v="${tp.id}" style="padding:7px 9px">✎</button>
        <span class="dim" data-act="start-tpl" data-v="${tp.id}">›</span></div>`;
    }).join('') + `</div>`;
  }

  html += `<h2>${esc(t('overall'))}</h2><div class="kpis">
    <div class="kpi"><div class="v">${st.thisWeek}</div><div class="k">${esc(t('this_week'))}</div></div>
    <div class="kpi"><div class="v">${st.count}</div><div class="k">${esc(t('workouts'))}</div></div>
    <div class="kpi"><div class="v">${cur ? fmtNum(cur, 1) + ' ' + t('kg') : '—'}</div><div class="k">${esc(t('body_weight'))}</div></div>
    <div class="kpi"><div class="v">${st.streak}</div><div class="k">${esc(t('streak'))} (${esc(t('weeks'))})</div></div>
  </div>`;

  if (S.workouts.length) {
    const lw = S.workouts[0];
    html += `<h2>${esc(t('last_workout'))}</h2>` + workoutRow(lw);
  }
  if (dsb === null && S.workouts.length > 2) html += `<div class="note" style="margin-top:14px">${esc(t('backup_due', { n: '—' }).replace('— ', ''))}</div>`;
  else if (dsb !== null && dsb >= 14) html += `<div class="note" style="margin-top:14px">${esc(t('backup_due', { n: dsb }))}</div>`;
  return html;
}

function workoutRow(w) {
  const dur = workoutDuration(w);
  return `<div class="list"><div class="item" data-act="open-workout" data-v="${w.id}">
    <div class="grow"><div style="font-weight:650">${esc(w.name || fmtDay(w.startedAt, S.settings.lang))}</div>
    <div class="small dim" style="margin-top:2px">${esc(fmtDay(w.startedAt, S.settings.lang))} · ${workoutSets(w)} ${esc(t('sets_short'))} · ${fmtNum(workoutVolume(w), 0)} ${esc(t('kg'))}${dur ? ' · ' + dur + ' ' + t('min') : ''}</div></div>
    <span class="dim">›</span></div></div>`;
}

/* ============ ACTIVE WORKOUT ============ */
function viewLog() {
  const w = S.active;
  if (!w) { route = 'home'; return viewHome(); }
  const mins = Math.floor((Date.now() - new Date(w.startedAt)) / 60000);
  let html = `<div class="card tight"><div class="row between">
    <input type="text" data-f="wname" value="${esc(w.name)}" placeholder="${esc(t('workout_name'))}" style="border:none;background:none;padding:4px 0;font-weight:700;font-size:17px">
    <span class="small dim mono" style="white-space:nowrap">${mins} ${esc(t('min'))}</span></div></div>`;

  if (!w.entries.length) html += `<div class="empty">${esc(t('add_exercise'))} ↓</div>`;

  w.entries.forEach((e, ei) => { html += entryCard(e, ei, w); });

  html += `<button class="btn sec" data-act="pick-ex">+ ${esc(t('add_exercise'))}</button>
    <div style="height:8px"></div>
    <button class="btn ghost sm" data-act="tpl-from-active" style="width:100%">${esc(t('save_as_template'))}</button>
    <div style="height:10px"></div>
    <label class="f"><span>${esc(t('notes'))}</span><textarea data-f="wnotes" placeholder="${esc(t('note_ph'))}">${esc(w.notes)}</textarea></label>
    <div class="row" style="gap:10px;margin-top:6px">
      <button class="btn" data-act="finish" style="flex:2">${esc(t('finish'))}</button>
      <button class="btn danger" data-act="discard" style="flex:1">${esc(t('discard'))}</button>
    </div><div style="height:20px"></div>`;
  return html;
}

function entryCard(e, ei, w) {
  const ex = exById(e.exId);
  const prev = lastPerformance(e.exId, w.id);
  const kind = ex.kind || 'wr';
  let html = `<div class="card" data-entry="${ei}">
    <div class="row between" style="align-items:flex-start">
      <div class="grow"><div style="font-weight:700">${esc(label(ex))}</div>
      <div class="small dim">${esc(label(MUSCLES.find((m) => m.id === ex.m) || {}))} · ${esc(label(EQUIPMENT.find((q) => q.id === ex.eq) || {}))}${e.target && e.target.lo ? ` · ${e.target.sets}×${e.target.lo}-${e.target.hi}` : ''}</div></div>
      <div class="row" style="gap:6px">
      ${(S.settings.plateCalc && ex.eq === 'barbell') ? `<button class="badge" data-act="plates" data-v="${ei}">🏋</button>` : ''}
      <button class="badge" data-act="ex-menu" data-v="${ei}">⋯</button></div>
    </div>`;

  if (S.settings.programWarnings && ex.warn) {
    html += `<div class="note">${esc(t(ex.warn === 'back' ? 'warn_back' : 'warn_shoulder'))}</div>`;
  }
  if (e.note) html += `<div class="small muted" style="margin:6px 0">${esc(e.note)}</div>`;

  if (prev) {
    const pv = prev.entry.sets.map((st) => setStr(st, kind)).join(', ');
    html += `<div class="small dim" style="margin:8px 0 6px">${esc(t('prev'))} · ${esc(fmtDay(prev.workout.startedAt, S.settings.lang))}: ${esc(pv)}</div>`;
  }

  html += setsTable(e, ei, kind, prev);

  if (S.settings.progressionHints && hitTopOfRange(e)) {
    html += `<div class="note ok">${esc(t('progression_hit'))}</div>`;
  }
  html += `<button class="btn ghost sm" data-act="add-set" data-v="${ei}" style="width:100%;margin-top:8px">+ ${esc(t('add_set'))}</button></div>`;
  return html;
}

function setStr(st, kind) {
  if (kind === 'time') return fmtClock(num(st.s));
  if (kind === 'reps') return (num(st.w) ? fmtNum(num(st.w), 1) + '+' : '') + num(st.r);
  return `${fmtNum(num(st.w), 1)}×${num(st.r)}`;
}

function setsTable(e, ei, kind, prev) {
  const cols = kind === 'time'
    ? `<div>#</div><div>${esc(t('prev'))}</div><div>${esc(t('time'))} (s)</div><div></div><div>✓</div><div></div>`
    : `<div>#</div><div>${esc(t('prev'))}</div><div>${esc(t('weight'))}</div><div>${esc(t('reps'))}</div><div>✓</div><div></div>`;
  let html = `<div class="sethead">${cols}</div>`;
  e.sets.forEach((st, si) => {
    const p = prev && prev.entry.sets[si] ? setStr(prev.entry.sets[si], kind) : '—';
    if (kind === 'time') {
      html += `<div class="setrow">
        <div class="idx">${si + 1}</div>
        <div class="prev">${esc(p)}</div>
        <input type="text" inputmode="numeric" data-e="${ei}" data-s="${si}" data-fld="s" value="${st.s != null ? esc(st.s) : ''}" placeholder="0">
        <div class="prev mono">${fmtClock(num(st.s))}</div>
        <button class="tick ${st.done ? 'on' : ''}" data-act="tick" data-e="${ei}" data-s="${si}">✓</button>
        <button class="del" data-act="del-set" data-e="${ei}" data-s="${si}">×</button></div>`;
    } else {
      html += `<div class="setrow">
        <div class="idx">${si + 1}</div>
        <div class="prev">${esc(p)}</div>
        <input type="text" inputmode="decimal" data-e="${ei}" data-s="${si}" data-fld="w" value="${st.w != null ? esc(st.w) : ''}" placeholder="${kind === 'reps' ? '+kg' : 'kg'}">
        <input type="text" inputmode="numeric" data-e="${ei}" data-s="${si}" data-fld="r" value="${st.r != null ? esc(st.r) : ''}" placeholder="${esc(t('reps'))}">
        <button class="tick ${st.done ? 'on' : ''}" data-act="tick" data-e="${ei}" data-s="${si}">✓</button>
        <button class="del" data-act="del-set" data-e="${ei}" data-s="${si}">×</button></div>`;
    }
  });
  if (!e.sets.length) html += `<div class="small dim" style="text-align:center;padding:6px 0">—</div>`;
  return html;
}

/* ============ HISTORY ============ */
function viewHistory() {
  if (!S.workouts.length) return `<div class="empty">${esc(t('no_workouts'))}</div>`;
  let html = '';
  let curMonth = '';
  S.workouts.forEach((w) => {
    const d = new Date(w.startedAt);
    const mk = d.toLocaleDateString(S.settings.lang === 'ru' ? 'ru-RU' : 'en-GB', { month: 'long', year: 'numeric' });
    if (mk !== curMonth) { curMonth = mk; html += `<h2 style="text-transform:capitalize">${esc(mk)}</h2>`; }
    const dur = workoutDuration(w);
    html += `<div class="list" style="margin-bottom:8px"><div class="item" data-act="open-workout" data-v="${w.id}">
      <div class="grow"><div style="font-weight:650">${esc(w.name || fmtDay(w.startedAt, S.settings.lang))}</div>
      <div class="small dim" style="margin-top:2px">${esc(fmtDay(w.startedAt, S.settings.lang))} · ${workoutSets(w)} ${esc(t('sets_short'))} · ${fmtNum(workoutVolume(w), 0)} ${esc(t('kg'))}${dur ? ' · ' + dur + ' ' + t('min') : ''}</div></div>
      <span class="dim">›</span></div></div>`;
  });
  return html;
}

/* ============ EXERCISES ============ */
function viewExercises() {
  const q = ui.exSearch.toLowerCase();
  let list = allExercises();
  if (ui.exFilter !== 'all') list = list.filter((e) => e.m === ui.exFilter);
  if (q) list = list.filter((e) => (e.en + ' ' + (e.ru || '')).toLowerCase().includes(q));

  let html = `<input type="text" data-f="exsearch" value="${esc(ui.exSearch)}" placeholder="${esc(t('search'))}" style="margin-bottom:10px">
    <div class="chips"><button class="chip ${ui.exFilter === 'all' ? 'on' : ''}" data-act="exfilter" data-v="all">${esc(t('all'))}</button>`
    + MUSCLES.map((m) => `<button class="chip ${ui.exFilter === m.id ? 'on' : ''}" data-act="exfilter" data-v="${m.id}">${esc(label(m))}</button>`).join('') + `</div>`;

  const groups = {};
  list.forEach((e) => { (groups[e.m] = groups[e.m] || []).push(e); });
  const order = MUSCLES.map((m) => m.id).filter((id) => groups[id]);
  if (!order.length) html += `<div class="empty">—</div>`;
  order.forEach((mid) => {
    html += `<h2>${esc(label(MUSCLES.find((m) => m.id === mid)))}</h2><div class="list">`;
    groups[mid].sort((a, b) => label(a).localeCompare(label(b))).forEach((e) => {
      const pr = exercisePR(e.id);
      html += `<div class="item" data-act="open-ex" data-v="${e.id}">
        <div class="grow"><div style="font-weight:600">${esc(label(e))}</div>
        <div class="small dim">${esc(label(EQUIPMENT.find((q2) => q2.id === e.eq) || {}))}${pr ? ` · ${pr.sessions} ×` : ''}</div></div>
        ${e.custom ? `<span class="badge">${esc(t('custom'))}</span>` : ''}
        ${(S.settings.programWarnings && e.warn) ? `<span class="badge warn">!</span>` : ''}
        <span class="dim">›</span></div>`;
    });
    html += `</div>`;
  });
  html += `<div style="height:60px"></div><button class="fab" data-act="new-ex">+ ${esc(t('new_exercise'))}</button>`;
  return html;
}

/* ============ STATS ============ */
function viewStats() {
  if (!S.workouts.length) return `<div class="empty">${esc(t('empty_stats'))}</div>`;
  const st = overallStats();
  let html = `<div class="kpis">
    <div class="kpi"><div class="v">${st.count}</div><div class="k">${esc(t('workouts'))}</div></div>
    <div class="kpi"><div class="v">${fmtNum(st.avg, 1)}</div><div class="k">${esc(t('avg_per_week'))}</div></div>
    <div class="kpi"><div class="v">${st.streak}</div><div class="k">${esc(t('streak'))} (${esc(t('weeks'))})</div></div>
    <div class="kpi"><div class="v">${fmtNum(st.totalVolume / 1000, 1)}t</div><div class="k">${esc(t('total_volume'))}</div></div>
  </div>`;

  html += `<h2>${esc(t('last_12_weeks'))}</h2><div class="card"><div id="chart-vol"></div></div>`;

  const split = muscleSplit(30);
  if (split.length) {
    const max = Math.max(...split.map((s) => s.sets));
    html += `<h2>${esc(t('muscle_split'))}</h2><div class="card">` + split.map((s) => `
      <div style="margin-bottom:10px"><div class="row between small" style="margin-bottom:4px">
        <span>${esc(label(MUSCLES.find((m) => m.id === s.m) || { en: s.m }))}</span>
        <span class="dim mono">${s.sets} ${esc(t('sets_short'))}</span></div>
      <div class="bar"><i style="width:${Math.round((s.sets / max) * 100)}%"></i></div></div>`).join('') + `</div>`;
  }

  const used = [...new Set(S.workouts.flatMap((w) => w.entries.map((e) => e.exId)))];
  if (used.length) {
    if (!ui.statsEx || !used.includes(ui.statsEx)) ui.statsEx = used[0];
    html += `<h2>${esc(t('per_exercise'))}</h2>
      <select data-f="statsex" style="margin-bottom:10px">` +
      used.map((id) => `<option value="${id}" ${id === ui.statsEx ? 'selected' : ''}>${esc(label(exById(id)))}</option>`).join('') + `</select>`;
    const pr = exercisePR(ui.statsEx);
    const ex = exById(ui.statsEx);
    if (pr) {
      html += `<div class="kpis" style="margin-bottom:12px">
        <div class="kpi"><div class="v">${ex.kind === 'time' ? fmtClock(pr.time) : fmtNum(pr.weight, 1) + ' ' + t('kg')}</div><div class="k">${esc(t('best_set'))}</div></div>
        <div class="kpi"><div class="v">${ex.kind === 'wr' ? fmtNum(pr.e1rm, 1) + ' ' + t('kg') : pr.reps}</div><div class="k">${ex.kind === 'wr' ? esc(t('est_1rm')) : esc(t('reps'))}</div></div>
      </div><div class="card"><div id="chart-ex"></div></div>`;
    }
  }
  return html;
}

/* ============ BODY ============ */
function viewBody() {
  const s = weightSeries();
  const cur = s.length ? s[s.length - 1].v : null;
  const avg = s.length ? rollingAvg(s, 7) : [];
  const cur7 = avg.length ? avg[avg.length - 1].v : null;
  const wc = weeklyWeightChange();
  const goal = num(S.settings.goalWeight), start = num(S.settings.startWeight);
  const prog = (cur != null && goal > start) ? Math.max(0, Math.min(100, ((cur - start) / (goal - start)) * 100)) : 0;

  let html = `<div class="kpis">
    <div class="kpi"><div class="v">${cur != null ? fmtNum(cur, 1) : '—'}</div><div class="k">${esc(t('current'))} (${esc(t('kg'))})</div></div>
    <div class="kpi"><div class="v">${cur7 != null ? fmtNum(cur7, 2) : '—'}</div><div class="k">${esc(t('trend7'))}</div></div>
    <div class="kpi"><div class="v" style="color:${wc == null ? 'inherit' : (wc >= 0.15 && wc <= 0.28 ? 'var(--ok)' : (wc > 0.28 || wc < 0 ? 'var(--warn)' : 'inherit'))}">${wc == null ? '—' : (wc >= 0 ? '+' : '') + fmtNum(wc, 2)}</div><div class="k">${esc(t('weekly_change'))}</div></div>
    <div class="kpi"><div class="v">${cur != null ? fmtNum(goal - cur, 1) : '—'}</div><div class="k">${esc(t('to_go'))} (${esc(t('kg'))})</div></div>
  </div>
  <div class="card" style="margin-top:12px">
    <div class="row between small" style="margin-bottom:6px"><span class="dim">${esc(t('start_w'))} ${fmtNum(start, 1)}</span><span class="dim">${esc(t('goal'))} ${fmtNum(goal, 1)}</span></div>
    <div class="bar"><i style="width:${prog}%"></i></div>
    <div class="small dim" style="margin-top:6px">${esc(t('target_rate'))}</div>
  </div>`;

  if (s.length > 1) html += `<div class="card"><div id="chart-body"></div>
    <div class="legend"><span><i style="background:var(--acc)"></i>${esc(t('trend7'))}</span>
    <span><i style="background:var(--fg3)"></i>${esc(t('body_weight'))}</span>
    <span><i style="background:var(--ok)"></i>${esc(t('goal'))}</span></div></div>`;

  html += `<h2>${esc(t('log_weight'))}</h2><div class="card">
    <div class="row" style="gap:8px">
      <input type="date" data-f="bdate" value="${ymd(new Date())}" style="flex:1.2">
      <input type="text" inputmode="decimal" data-f="bweight" placeholder="${esc(t('kg'))}" style="flex:1">
      <button class="btn sm" data-act="save-body">${esc(t('save'))}</button>
    </div>
    <button class="btn ghost sm" data-act="toggle-meas" style="width:100%;margin-top:10px">${ui.showMeas ? '−' : '+'} ${esc(t('measurements'))}</button>
    ${ui.showMeas ? `<div class="row wrap" style="gap:8px;margin-top:10px">
      ${['waist', 'chest_m', 'arm', 'thigh', 'neck'].map((k) => `<label class="f" style="flex:1 1 45%;margin:0"><span>${esc(t(k))} (${esc(t('cm'))})</span>
        <input type="text" inputmode="decimal" data-f="b_${k}" placeholder="—"></label>`).join('')}
    </div>` : ''}
  </div>`;

  if (S.body.length) {
    html += `<h2>${esc(t('history_for'))}</h2><div class="list">` + [...S.body].reverse().slice(0, 40).map((b) => `
      <div class="item"><div class="grow"><div style="font-weight:600">${b.weight ? fmtNum(num(b.weight), 1) + ' ' + t('kg') : '—'}</div>
      <div class="small dim">${esc(b.date)}${b.waist ? ` · ${esc(t('waist'))} ${esc(b.waist)}` : ''}${b.arm ? ` · ${esc(t('arm'))} ${esc(b.arm)}` : ''}${b.chest_m ? ` · ${esc(t('chest_m'))} ${esc(b.chest_m)}` : ''}${b.thigh ? ` · ${esc(t('thigh'))} ${esc(b.thigh)}` : ''}${b.neck ? ` · ${esc(t('neck'))} ${esc(b.neck)}` : ''}</div></div>
      <button class="del dim" data-act="del-body" data-v="${b.id}" style="font-size:18px">×</button></div>`).join('') + `</div>`;
  }
  return html;
}

/* ============ CHARTS ============ */
function drawCharts() {
  const v = document.getElementById('chart-vol');
  if (v) v.innerHTML = barChart(weeklyVolume(12).map((x) => ({ label: x.week.slice(5).replace('-', '/'), value: x.value })));
  const b = document.getElementById('chart-body');
  if (b) {
    const s = weightSeries();
    const avg = rollingAvg(s, 7);
    b.innerHTML = lineChart([
      { points: s.map((p) => ({ x: parseYmd(p.date).getTime(), y: p.v })), color: 'var(--fg3)', dots: true, width: 0 },
      { points: avg.map((p) => ({ x: parseYmd(p.date).getTime(), y: p.v })), color: 'var(--acc)', width: 2.5 },
    ], { hline: num(S.settings.goalWeight), hcolor: 'var(--ok)', fmt: (n) => fmtNum(n, 1) });
  }
  const e = document.getElementById('chart-ex');
  if (e && ui.statsEx) {
    const h = exerciseHistory(ui.statsEx);
    const ex = exById(ui.statsEx);
    const key = ex.kind === 'time' ? ((x) => num(x.best && x.best.s)) : (ex.kind === 'reps' ? ((x) => num(x.best && x.best.r)) : ((x) => x.e1rm));
    e.innerHTML = lineChart([
      { points: h.map((x) => ({ x: new Date(x.date).getTime(), y: key(x) })), color: 'var(--acc)', width: 2.5, dots: true },
    ], { fmt: (n) => fmtNum(n, 1) });
  }
}

function barChart(items, opt = {}) {
  const W = 320, H = opt.h || 120, pad = 22, bw = (W - pad) / items.length;
  const max = Math.max(1, ...items.map((i) => i.value));
  let bars = '', labels = '';
  items.forEach((it, i) => {
    const h = it.value > 0 ? Math.max(2, (it.value / max) * (H - 30)) : 0;
    const x = pad + i * bw + bw * 0.15, y = H - 20 - h;
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${it.value > 0 ? 'var(--acc)' : 'var(--line)'}"/>`;
    if (i % 2 === 0 || items.length <= 8) labels += `<text x="${(x + bw * 0.35).toFixed(1)}" y="${H - 6}" font-size="8" fill="var(--fg3)" text-anchor="middle">${esc(it.label)}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">
    <line x1="${pad}" y1="${H - 20}" x2="${W}" y2="${H - 20}" stroke="var(--line)"/>
    <text x="0" y="12" font-size="9" fill="var(--fg3)">${fmtNum(max / 1000, 1)}t</text>
    ${bars}${labels}</svg>`;
}

function lineChart(series, opt = {}) {
  const W = 320, H = opt.h || 140, padL = 30, padB = 18, padT = 10;
  const pts = series.flatMap((s) => s.points).filter((p) => isFinite(p.y));
  if (pts.length < 1) return `<div class="empty">—</div>`;
  const ys = pts.map((p) => p.y);
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  if (yMax - yMin < 1e-6) { yMax += 1; yMin -= 1; }
  const padY = (yMax - yMin) * 0.12; yMin -= padY; yMax += padY;
  const xs = pts.map((p) => p.x);
  let xMin = Math.min(...xs), xMax = Math.max(...xs);
  if (xMax === xMin) { xMax = xMin + 1; }
  const px = (x) => padL + ((x - xMin) / (xMax - xMin)) * (W - padL - 6);
  const py = (y) => padT + (1 - (y - yMin) / (yMax - yMin)) * (H - padT - padB);
  const fmt = opt.fmt || ((n) => fmtNum(n, 1));

  let g = '';
  for (let i = 0; i <= 2; i++) {
    const y = yMin + ((yMax - yMin) * i) / 2;
    g += `<line x1="${padL}" y1="${py(y).toFixed(1)}" x2="${W}" y2="${py(y).toFixed(1)}" stroke="var(--line)" stroke-dasharray="2 3"/>
      <text x="0" y="${(py(y) + 3).toFixed(1)}" font-size="9" fill="var(--fg3)">${esc(fmt(y))}</text>`;
  }
  if (opt.hline) {
    if (opt.hline >= yMin && opt.hline <= yMax) {
      g += `<line x1="${padL}" y1="${py(opt.hline).toFixed(1)}" x2="${W}" y2="${py(opt.hline).toFixed(1)}" stroke="${opt.hcolor || 'var(--ok)'}" stroke-dasharray="4 3" stroke-width="1.5"/>`;
    } else {
      const up = opt.hline > yMax;
      g += `<text x="${W}" y="${up ? padT + 8 : H - padB - 2}" font-size="9" fill="${opt.hcolor || 'var(--ok)'}" text-anchor="end">${up ? '▲' : '▼'} ${esc(fmt(opt.hline))}</text>`;
    }
  }
  let paths = '';
  series.forEach((s) => {
    const p = s.points.filter((q) => isFinite(q.y)).sort((a, b) => a.x - b.x);
    if (!p.length) return;
    if (s.width) {
      const d = p.map((q, i) => `${i ? 'L' : 'M'}${px(q.x).toFixed(1)},${py(q.y).toFixed(1)}`).join(' ');
      paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    if (s.dots) p.forEach((q) => { paths += `<circle cx="${px(q.x).toFixed(1)}" cy="${py(q.y).toFixed(1)}" r="${s.width ? 2.5 : 2}" fill="${s.color}"/>`; });
  });
  const first = new Date(xMin), last = new Date(xMax);
  const df = (d) => d.toLocaleDateString(S.settings.lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short' });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" style="height:${H}px">
    ${g}${paths}
    <text x="${padL}" y="${H - 4}" font-size="9" fill="var(--fg3)">${esc(df(first))}</text>
    <text x="${W}" y="${H - 4}" font-size="9" fill="var(--fg3)" text-anchor="end">${esc(df(last))}</text>
  </svg>`;
}

/* ============ MUSCLE MAP ============ */
/* Stylised front/back body diagram. Every shape carries the muscle group it represents;
   primary = solid accent, secondary = translucent accent, everything else = neutral. */
function muscleMap(exId) {
  const ex = exById(exId);
  const info = EX_INFO[exId] || {};
  const primary = ex.m;
  const secondary = new Set((info.sec || []).concat(ex.sec || []));

  const fill = (m) => {
    if (m === primary) return 'fill="var(--acc)"';
    if (secondary.has(m)) return 'fill="var(--acc)" fill-opacity="0.4"';
    return 'fill="var(--bg3)" stroke="var(--line)" stroke-width="0.7"';
  };
  const N = 'fill="var(--bg3)" stroke="var(--line)" stroke-width="0.7"';
  /* faint silhouette so the muscle blocks read as one body */
  const SIL = `<g fill="var(--line)" opacity="0.5">
    <rect x="40" y="32" width="40" height="82" rx="15"/>
    <rect x="19" y="40" width="17" height="76" rx="8"/>
    <rect x="84" y="40" width="17" height="76" rx="8"/>
    <rect x="43" y="94" width="17" height="108" rx="8"/>
    <rect x="60" y="94" width="17" height="108" rx="8"/></g>`;

  const front = SIL + `
    <circle cx="60" cy="17" r="11" ${N}/>
    <rect x="54" y="26" width="12" height="8" rx="3" ${N}/>
    <ellipse cx="35" cy="45" rx="11" ry="9" ${fill('shoulders')}/>
    <ellipse cx="85" cy="45" rx="11" ry="9" ${fill('shoulders')}/>
    <rect x="43" y="37" width="16" height="21" rx="6" ${fill('chest')}/>
    <rect x="61" y="37" width="16" height="21" rx="6" ${fill('chest')}/>
    <rect x="48" y="60" width="24" height="36" rx="7" ${fill('core')}/>
    <ellipse cx="28" cy="66" rx="8" ry="13" ${fill('biceps')}/>
    <ellipse cx="92" cy="66" rx="8" ry="13" ${fill('biceps')}/>
    <ellipse cx="23" cy="93" rx="7" ry="15" ${fill('forearms')}/>
    <ellipse cx="97" cy="93" rx="7" ry="15" ${fill('forearms')}/>
    <circle cx="21" cy="112" r="5" ${N}/>
    <circle cx="99" cy="112" r="5" ${N}/>
    <rect x="45" y="98" width="30" height="12" rx="6" ${N}/>
    <rect x="45" y="112" width="13" height="46" rx="7" ${fill('quads')}/>
    <rect x="62" y="112" width="13" height="46" rx="7" ${fill('quads')}/>
    <rect x="46" y="161" width="11" height="34" rx="5" ${N}/>
    <rect x="63" y="161" width="11" height="34" rx="5" ${N}/>
    <rect x="44" y="197" width="14" height="7" rx="3" ${N}/>
    <rect x="62" y="197" width="14" height="7" rx="3" ${N}/>`;

  const back = SIL + `
    <circle cx="60" cy="17" r="11" ${N}/>
    <rect x="54" y="26" width="12" height="8" rx="3" ${N}/>
    <ellipse cx="35" cy="45" rx="11" ry="9" ${fill('shoulders')}/>
    <ellipse cx="85" cy="45" rx="11" ry="9" ${fill('shoulders')}/>
    <rect x="48" y="33" width="24" height="15" rx="6" ${fill('back')}/>
    <rect x="41" y="49" width="17" height="24" rx="7" ${fill('back')}/>
    <rect x="62" y="49" width="17" height="24" rx="7" ${fill('back')}/>
    <rect x="50" y="74" width="20" height="18" rx="6" ${fill('back')}/>
    <ellipse cx="28" cy="66" rx="8" ry="13" ${fill('triceps')}/>
    <ellipse cx="92" cy="66" rx="8" ry="13" ${fill('triceps')}/>
    <ellipse cx="23" cy="93" rx="7" ry="15" ${fill('forearms')}/>
    <ellipse cx="97" cy="93" rx="7" ry="15" ${fill('forearms')}/>
    <circle cx="21" cy="112" r="5" ${N}/>
    <circle cx="99" cy="112" r="5" ${N}/>
    <rect x="44" y="94" width="32" height="20" rx="9" ${fill('glutes')}/>
    <rect x="45" y="116" width="13" height="42" rx="7" ${fill('hamstrings')}/>
    <rect x="62" y="116" width="13" height="42" rx="7" ${fill('hamstrings')}/>
    <rect x="46" y="161" width="11" height="32" rx="6" ${fill('calves')}/>
    <rect x="63" y="161" width="11" height="32" rx="6" ${fill('calves')}/>
    <rect x="44" y="196" width="14" height="7" rx="3" ${N}/>
    <rect x="62" y="196" width="14" height="7" rx="3" ${N}/>`;

  const names = [label(MUSCLES.find((m) => m.id === primary) || {})]
    .concat([...secondary].map((s) => label(MUSCLES.find((m) => m.id === s) || {})).filter(Boolean));

  return `<div class="card">
    <svg class="chart" viewBox="0 0 250 222" style="height:190px" aria-hidden="true">
      <g transform="translate(0,6)">${front}</g>
      <g transform="translate(130,6)">${back}</g>
      <text x="60" y="220" font-size="9" fill="var(--fg3)" text-anchor="middle">${esc(t('front'))}</text>
      <text x="190" y="220" font-size="9" fill="var(--fg3)" text-anchor="middle">${esc(t('back_view'))}</text>
    </svg>
    <div class="legend"><span><i style="background:var(--acc)"></i>${esc(t('primary'))}: ${esc(names[0] || '—')}</span>
    ${names.length > 1 ? `<span><i style="background:var(--acc);opacity:.4"></i>${esc(t('secondary'))}: ${esc(names.slice(1).join(', '))}</span>` : ''}</div>
  </div>`;
}

/* built-in how-to text for seeded exercises, in the current language */
function exHowTo(exId) {
  const info = EX_INFO[exId];
  if (!info) return '';
  return (S.settings.lang === 'ru' ? info.ru : info.en) || info.en || '';
}

function videoLink(exId) {
  const ex = exById(exId);
  const q = encodeURIComponent('how to ' + (ex.en || ex.name) + ' proper form');
  return `<a class="btn sec" style="display:block;text-decoration:none" target="_blank" rel="noopener"
    href="https://www.youtube.com/results?search_query=${q}">▶ ${esc(t('how_to'))}</a>`;
}

/* ============ SHEETS ============ */
function sheet(title, body, opts = {}) {
  const el = document.createElement('div');
  el.className = 'sheet';
  el.innerHTML = `<div class="inner"><div class="grabber"></div>
    <div class="row between" style="margin-bottom:12px">
      <h3 style="margin:0;flex:1">${esc(title || '')}</h3>
      <button class="hbtn" data-act="close-sheet" style="width:32px;height:32px;border-radius:9px;background:var(--bg3);display:grid;place-items:center;font-size:15px;color:var(--fg2)">✕</button>
    </div>${body}</div>`;
  el.addEventListener('click', (ev) => { if (ev.target === el) closeSheet(); });
  $('#overlay').appendChild(el);
  return el;
}
function closeSheet() { const o = $('#overlay'); if (o.lastChild) o.removeChild(o.lastChild); }
function closeAllSheets() { $('#overlay').innerHTML = ''; }

/* --- exercise picker --- */
function openPicker(onPick) {
  const build = (q, filter) => {
    let list = allExercises();
    if (filter !== 'all') list = list.filter((e) => e.m === filter);
    if (q) list = list.filter((e) => (e.en + ' ' + (e.ru || '')).toLowerCase().includes(q.toLowerCase()));
    const recent = [...new Set(S.workouts.slice(0, 12).flatMap((w) => w.entries.map((e) => e.exId)))].slice(0, 6);
    let h = '';
    if (!q && filter === 'all' && recent.length) {
      h += `<div class="tiny" style="margin:4px 0 6px">${esc(t('quick_add'))}</div><div class="chips">`
        + recent.map((id) => `<button class="chip" data-pick="${id}">${esc(label(exById(id)))}</button>`).join('') + `</div>`;
    }
    h += `<div class="list" style="margin-top:6px">` + list.slice(0, 200).map((e) => `
      <div class="item" data-pick="${e.id}"><div class="grow"><div style="font-weight:600">${esc(label(e))}</div>
      <div class="small dim">${esc(label(MUSCLES.find((m) => m.id === e.m) || {}))} · ${esc(label(EQUIPMENT.find((q2) => q2.id === e.eq) || {}))}</div></div>
      ${(S.settings.programWarnings && e.warn) ? '<span class="badge warn">!</span>' : ''}</div>`).join('') + `</div>`;
    if (!list.length) h += `<div class="empty">—</div>`;
    return h;
  };
  const el = sheet(t('add_exercise'), `
    <input type="text" id="pick-q" placeholder="${esc(t('search'))}" style="margin-bottom:8px">
    <div class="chips" id="pick-chips">
      <button class="chip on" data-pf="all">${esc(t('all'))}</button>
      ${MUSCLES.map((m) => `<button class="chip" data-pf="${m.id}">${esc(label(m))}</button>`).join('')}
    </div>
    <div id="pick-list">${build('', 'all')}</div>
    <button class="btn sec" id="pick-new" style="margin-top:10px">+ ${esc(t('new_exercise'))}</button>`);
  let filter = 'all';
  const q = el.querySelector('#pick-q');
  const relist = () => { el.querySelector('#pick-list').innerHTML = build(q.value, filter); };
  q.addEventListener('input', relist);
  el.querySelector('#pick-chips').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-pf]'); if (!b) return;
    filter = b.dataset.pf;
    el.querySelectorAll('#pick-chips .chip').forEach((c) => c.classList.toggle('on', c.dataset.pf === filter));
    relist();
  });
  el.querySelector('#pick-list').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-pick]'); if (!b) return;
    closeSheet(); onPick(b.dataset.pick);
  });
  el.querySelector('#pick-new').addEventListener('click', () => { closeSheet(); openNewExercise((ex) => onPick(ex.id)); });
}

/* --- new / edit exercise --- */
function openNewExercise(after, existing) {
  const ex = existing || {};
  const el = sheet(existing ? t('edit') : t('new_exercise'), `
    <label class="f"><span>${esc(t('name'))} (EN)</span><input type="text" id="nx-en" value="${esc(ex.en || '')}"></label>
    <label class="f"><span>${esc(t('name'))} (RU)</span><input type="text" id="nx-ru" value="${esc(ex.ru || '')}"></label>
    <label class="f"><span>${esc(t('muscle'))}</span><select id="nx-m">${MUSCLES.map((m) => `<option value="${m.id}" ${ex.m === m.id ? 'selected' : ''}>${esc(label(m))}</option>`).join('')}</select></label>
    <label class="f"><span>${esc(t('equipment'))}</span><select id="nx-eq">${EQUIPMENT.map((q) => `<option value="${q.id}" ${ex.eq === q.id ? 'selected' : ''}>${esc(label(q))}</option>`).join('')}</select></label>
    <label class="f"><span>${esc(t('type'))}</span><select id="nx-kind">
      <option value="wr" ${ex.kind === 'wr' ? 'selected' : ''}>${esc(t('type_wr'))}</option>
      <option value="reps" ${ex.kind === 'reps' ? 'selected' : ''}>${esc(t('type_reps'))}</option>
      <option value="time" ${ex.kind === 'time' ? 'selected' : ''}>${esc(t('type_time'))}</option></select></label>
    <label class="f"><span>${esc(t('description'))}</span><textarea id="nx-desc" placeholder="${esc(t('note_ph'))}">${esc(ex.desc || '')}</textarea></label>
    <div class="row" style="gap:10px"><button class="btn" id="nx-save">${esc(t('save'))}</button>
    <button class="btn sec" id="nx-cancel" style="flex:0 0 90px">${esc(t('cancel'))}</button></div>`);
  el.querySelector('#nx-cancel').addEventListener('click', closeSheet);
  el.querySelector('#nx-save').addEventListener('click', () => {
    const en = el.querySelector('#nx-en').value.trim();
    const ru = el.querySelector('#nx-ru').value.trim();
    if (!en && !ru) return;
    const data = { name: en || ru, name_ru: ru || en, en: en || ru, ru: ru || en, m: el.querySelector('#nx-m').value, eq: el.querySelector('#nx-eq').value, kind: el.querySelector('#nx-kind').value, desc: el.querySelector('#nx-desc').value.trim() };
    let res;
    if (existing) { updateExercise(existing.id, { en: data.en, ru: data.ru, m: data.m, eq: data.eq, kind: data.kind, desc: data.desc }); res = exById(existing.id); }
    else res = addCustomExercise(data);
    closeSheet(); render();
    if (after) after(res);
  });
}

/* --- exercise detail --- */
function openExercise(id) {
  const ex = exById(id);
  const pr = exercisePR(id);
  const h = exerciseHistory(id);
  let body = `<div class="small muted" style="margin-bottom:8px">${esc(label(MUSCLES.find((m) => m.id === ex.m) || {}))} · ${esc(label(EQUIPMENT.find((q) => q.id === ex.eq) || {}))} · ${esc(t(ex.kind === 'time' ? 'type_time' : ex.kind === 'reps' ? 'type_reps' : 'type_wr'))}</div>`;
  const how = exHowTo(id);
  if (how) body += `<div class="card tight small" style="line-height:1.5">${esc(how)}</div>`;
  if (ex.desc) body += `<div class="card tight small">${esc(ex.desc)}</div>`;
  if (S.settings.programWarnings && ex.warn) body += `<div class="note">${esc(t(ex.warn === 'back' ? 'warn_back' : 'warn_shoulder'))}</div>`;
  body += muscleMap(id);
  body += videoLink(id) + `<div style="height:12px"></div>`;
  if (pr) {
    body += `<div class="kpis" style="margin:10px 0">
      <div class="kpi"><div class="v">${ex.kind === 'time' ? fmtClock(pr.time) : fmtNum(pr.weight, 1) + ' ' + t('kg')}</div><div class="k">${esc(t('best_set'))}</div></div>
      <div class="kpi"><div class="v">${ex.kind === 'wr' ? fmtNum(pr.e1rm, 1) : pr.reps}</div><div class="k">${ex.kind === 'wr' ? esc(t('est_1rm')) : esc(t('reps'))}</div></div></div>`;
    body += `<div class="list">` + h.slice(-12).reverse().map((x) => `<div class="item">
      <div class="grow"><div class="small" style="font-weight:600">${esc(fmtDay(x.date, S.settings.lang))}</div>
      <div class="small dim">${esc(x.sets.map((st) => setStr(st, ex.kind)).join(', '))}</div></div></div>`).join('') + `</div>`;
  } else body += `<div class="empty">${esc(t('no_history_ex'))}</div>`;
  body += `<div class="row" style="gap:10px;margin-top:12px">
    <button class="btn sec" data-act="edit-ex" data-v="${id}">${esc(t('edit'))}</button>
    <button class="btn danger" data-act="delete-ex" data-v="${id}" style="flex:0 0 110px">${esc(t('delete'))}</button></div>`;
  sheet(label(ex), body);
}

/* --- workout detail --- */
function openWorkout(id) {
  const w = S.workouts.find((x) => x.id === id);
  if (!w) return;
  const dur = workoutDuration(w);
  let body = `<div class="small muted">${esc(fmtDate(w.startedAt, S.settings.lang))} · ${workoutSets(w)} ${esc(t('sets_short'))} · ${workoutReps(w)} ${esc(t('reps_total'))} · ${fmtNum(workoutVolume(w), 0)} ${esc(t('kg'))}${dur ? ' · ' + dur + ' ' + t('min') : ''}</div>`;
  if (w.notes) body += `<div class="card tight small" style="margin-top:10px">${esc(w.notes)}</div>`;
  body += `<div style="height:10px"></div>`;
  w.entries.forEach((e) => {
    const ex = exById(e.exId);
    body += `<div class="card tight"><div style="font-weight:650">${esc(label(ex))}</div>
      <div class="small dim" style="margin-top:4px">${e.sets.map((st, i) => `${i + 1}. ${esc(setStr(st, ex.kind))}`).join(' &nbsp; ')}</div>
      ${e.note ? `<div class="small muted" style="margin-top:4px">${esc(e.note)}</div>` : ''}</div>`;
  });
  body += `<div class="row wrap" style="gap:8px;margin-top:12px">
    <button class="btn sec sm" data-act="repeat-workout" data-v="${id}" style="flex:1">${esc(t('repeat'))}</button>
    <button class="btn sec sm" data-act="tpl-from-workout" data-v="${id}" style="flex:1">${esc(t('save_as_template'))}</button>
  </div>
  <div class="row" style="gap:8px;margin-top:8px">
    <button class="btn ghost sm" data-act="edit-workout" data-v="${id}" style="flex:1">${esc(t('edit'))}</button>
    <button class="btn danger sm" data-act="delete-workout" data-v="${id}" style="flex:1">${esc(t('delete'))}</button></div>`;
  sheet(w.name || fmtDay(w.startedAt, S.settings.lang), body);
}

/* --- template editor --- */
let tplDraft = null;

function openTemplateEditor(id) {
  const existing = id ? S.templates.find((x) => x.id === id) : null;
  tplDraft = existing ? clone(existing) : blankTemplate();
  const el = sheet(existing ? t('edit_template') : t('new_template'), `<div id="tpl-body"></div>`);
  redrawTpl();
  return el;
}

function redrawTpl() {
  const box = document.getElementById('tpl-body');
  if (!box || !tplDraft) return;
  const items = tplDraft.items || [];
  box.innerHTML = `
    <label class="f"><span>${esc(t('template_name'))}</span>
      <input type="text" data-f="tplname" value="${esc(tplDraft.name || '')}" placeholder="Day C"></label>
    <div class="sethead" style="grid-template-columns:1fr 48px 42px 42px 24px">
      <div style="text-align:left">${esc(t('add_exercise'))}</div><div>${esc(t('sets_target'))}</div>
      <div colspan="2">${esc(t('rep_range'))}</div><div></div><div></div></div>
    ${items.length ? items.map((it, i) => `
      <div class="setrow" style="grid-template-columns:1fr 48px 42px 42px 24px;align-items:center">
        <button data-act="tpl-move" data-v="${i}" style="text-align:left;font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label(exById(it.exId)))}</button>
        <input type="text" inputmode="numeric" data-tf="sets" data-i="${i}" value="${it.sets != null ? esc(it.sets) : ''}" placeholder="3">
        <input type="text" inputmode="numeric" data-tf="lo" data-i="${i}" value="${it.lo != null ? esc(it.lo) : ''}" placeholder="8">
        <input type="text" inputmode="numeric" data-tf="hi" data-i="${i}" value="${it.hi != null ? esc(it.hi) : ''}" placeholder="12">
        <button class="del" data-act="tpl-del-item" data-v="${i}">×</button>
      </div>`).join('') : `<div class="empty">${esc(t('tpl_empty'))}</div>`}
    <button class="btn ghost sm" data-act="tpl-add-ex" style="width:100%;margin-top:8px">+ ${esc(t('add_exercise'))}</button>
    <div class="small dim" style="margin-top:8px">${esc(t('sets_target'))} / ${esc(t('rep_range'))} → ${esc(t('progression'))}</div>
    <div class="row" style="gap:10px;margin-top:14px">
      <button class="btn" data-act="tpl-save" style="flex:2">${esc(t('save'))}</button>
      ${S.templates.some((x) => x.id === tplDraft.id) ? `<button class="btn danger" data-act="tpl-delete" style="flex:1">${esc(t('delete'))}</button>` : ''}
    </div>`;
}

/* --- plate calculator --- */
function openPlates(preset) {
  const el = sheet(t('plate_calc'), `
    <label class="f"><span>${esc(t('target_weight'))} (${esc(t('kg'))})</span>
      <input type="text" inputmode="decimal" id="pl-w" value="${preset || ''}"></label>
    <div id="pl-out"></div>
    <div class="small dim" style="margin-top:10px">${esc(t('bar_weight'))}: ${fmtNum(num(S.settings.barWeight), 1)} ${esc(t('kg'))}</div>`);
  const out = el.querySelector('#pl-out'), inp = el.querySelector('#pl-w');
  const calc = () => {
    const target = num(inp.value);
    if (!target) { out.innerHTML = ''; return; }
    const r = platesFor(target, num(S.settings.barWeight), S.settings.plates);
    const counts = {};
    r.list.forEach((p) => counts[p] = (counts[p] || 0) + 1);
    out.innerHTML = `<div class="tiny">${esc(t('plates_per_side'))}</div>
      <div class="row wrap" style="gap:8px;margin-top:6px">${Object.keys(counts).sort((a, b) => b - a).map((p) =>
        `<span class="chip on">${p} × ${counts[p]}</span>`).join('') || '<span class="dim">—</span>'}</div>
      ${!r.ok ? `<div class="note" style="margin-top:8px">+${fmtNum(r.left * 2, 2)} ${esc(t('kg'))} —</div>` : ''}`;
  };
  inp.addEventListener('input', calc); calc();
}

/* --- settings --- */
function openSettings() {
  const dsb = daysSinceBackup();
  const sw = (k, lbl) => `<div class="item"><div class="grow">${esc(lbl)}</div>
    <div class="sw ${S.settings[k] ? 'on' : ''}" data-act="toggle" data-v="${k}"></div></div>`;
  const body = `
    <div class="list">
      <div class="item"><div class="grow">${esc(t('lang'))}</div>
        <div class="row" style="gap:6px"><button class="chip ${S.settings.lang === 'en' ? 'on' : ''}" data-act="lang" data-v="en">EN</button>
        <button class="chip ${S.settings.lang === 'ru' ? 'on' : ''}" data-act="lang" data-v="ru">RU</button></div></div>
      <div class="item"><div class="grow">${esc(t('theme'))}</div>
        <div class="row" style="gap:6px"><button class="chip ${S.settings.theme === 'dark' ? 'on' : ''}" data-act="theme" data-v="dark">${esc(t('dark'))}</button>
        <button class="chip ${S.settings.theme === 'light' ? 'on' : ''}" data-act="theme" data-v="light">${esc(t('light'))}</button></div></div>
    </div>
    <h2>${esc(t('settings'))}</h2>
    <div class="list">
      ${sw('restTimer', t('rest_timer'))}
      <div class="item"><div class="grow">${esc(t('rest_default'))}</div>
        <input type="text" inputmode="numeric" data-f="restsec" value="${num(S.settings.restDefault)}" style="width:76px;text-align:center"> <span class="dim small">s</span></div>
      ${sw('vibrate', t('vibrate'))}
      ${sw('progressionHints', t('progression'))}
      ${sw('plateCalc', t('plate_calc'))}
      ${sw('programWarnings', t('program_warn'))}
      <div class="item"><div class="grow">${esc(t('bar_weight'))}</div>
        <input type="text" inputmode="decimal" data-f="barw" value="${num(S.settings.barWeight)}" style="width:76px;text-align:center"> <span class="dim small">${esc(t('kg'))}</span></div>
      <div class="item"><div class="grow">${esc(t('start_w'))} / ${esc(t('goal'))}</div>
        <input type="text" inputmode="decimal" data-f="startw" value="${num(S.settings.startWeight)}" style="width:62px;text-align:center">
        <input type="text" inputmode="decimal" data-f="goalw" value="${num(S.settings.goalWeight)}" style="width:62px;text-align:center"></div>
    </div>
    <div class="row between" style="margin:20px 0 10px"><h2 style="margin:0">${esc(t('templates'))}</h2>
      <button class="chip" data-act="new-tpl">+ ${esc(t('new'))}</button></div>
    <div class="list">${S.templates.map((tp) => `<div class="item"><div class="grow" data-act="edit-tpl" data-v="${tp.id}">${esc(label(tp) || tp.name)}
      <div class="small dim">${(tp.items || []).length} ${esc(t('exercises_n'))}</div></div>
      <button class="badge" data-act="edit-tpl" data-v="${tp.id}" style="padding:7px 9px">✎</button>
      <button class="del dim" data-act="del-tpl" data-v="${tp.id}" style="font-size:18px">×</button></div>`).join('') || `<div class="item dim">${esc(t('no_templates'))}</div>`}</div>
    <h2>${esc(t('data'))}</h2>
    <div class="small dim" style="margin-bottom:8px">${esc(t('last_backup'))}: ${dsb === null ? esc(t('never')) : (dsb === 0 ? esc(t('today')) : dsb + esc(t('days_ago')))}</div>
    <button class="btn sec" data-act="export">${esc(t('export'))}</button><div style="height:8px"></div>
    <button class="btn sec" data-act="import">${esc(t('import'))}</button><div style="height:8px"></div>
    <button class="btn danger" data-act="wipe">${esc(t('wipe'))}</button>
    <div class="small dim" style="margin-top:14px;text-align:center">GymLog · v1.0 · data stored on this device only</div>`;
  sheet(t('settings'), body);
}

/* ============ REST TIMER ============ */
function startRest(sec) {
  if (!S.settings.restTimer) return;
  rest.total = sec; rest.endsAt = Date.now() + sec * 1000;
  if (rest.iv) clearInterval(rest.iv);
  rest.iv = setInterval(tickRest, 250);
  try { if (!audioCtx && window.AudioContext) audioCtx = new AudioContext(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {}
  renderRestBar();
}
function tickRest() {
  if (!rest.endsAt) return;
  if (Date.now() >= rest.endsAt) { endRest(true); return; }
  const el = document.querySelector('#restbar .t');
  if (el) el.textContent = fmtClock(Math.max(0, (rest.endsAt - Date.now()) / 1000));
  else renderRestBar();
}
function endRest(notify) {
  if (rest.iv) clearInterval(rest.iv);
  rest.iv = null; rest.endsAt = 0;
  if (notify && S.settings.vibrate) {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    beep();
  }
  renderRestBar();
}
function beep() {
  try {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.55);
  } catch (e) {}
}
function renderRestBar() {
  const old = document.getElementById('restbar');
  if (!rest.endsAt) { if (old) old.remove(); return; }
  const left = Math.max(0, (rest.endsAt - Date.now()) / 1000);
  if (!old) {
    const el = document.createElement('div'); el.id = 'restbar';
    el.innerHTML = `<span>${esc(t('rest'))}</span><span class="t">${fmtClock(left)}</span>
      <span style="flex:1"></span>
      <button data-act="rest-add">${esc(t('add30'))}</button>
      <button data-act="rest-skip">${esc(t('skip'))}</button>`;
    $('#shell').insertBefore(el, $('#nav'));
  }
}

/* ============ EVENTS ============ */
function onInput(ev) {
  const el = ev.target;
  const f = el.dataset.f, fld = el.dataset.fld;
  if (fld && S.active) {
    const e = +el.dataset.e, s = +el.dataset.s;
    const entry = S.active.entries[e]; if (!entry || !entry.sets[s]) return;
    entry.sets[s][fld] = el.value;
    save(); return;
  }
  const tf = el.dataset.tf;
  if (tf && tplDraft) {
    const it = tplDraft.items[+el.dataset.i];
    if (it) { it[tf] = el.value === '' ? null : Math.max(0, Math.round(num(el.value))); }
    return;
  }
  if (!f) return;
  switch (f) {
    case 'tplname': if (tplDraft) { tplDraft.name = el.value; tplDraft.name_ru = el.value; } break;
    case 'wname': if (S.active) { S.active.name = el.value; save(); } break;
    case 'wnotes': if (S.active) { S.active.notes = el.value; save(); } break;
    case 'exsearch': ui.exSearch = el.value; { const m = $('#app'); const sc = m ? m.scrollTop : 0; render(); if (m) m.scrollTop = sc; const inp = document.querySelector('[data-f=exsearch]'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } } break;
    case 'statsex': ui.statsEx = el.value; render(); break;
    case 'restsec': S.settings.restDefault = num(el.value) || 120; save(); break;
    case 'barw': S.settings.barWeight = num(el.value) || 20; save(); break;
    case 'startw': S.settings.startWeight = num(el.value) || 0; save(); break;
    case 'goalw': S.settings.goalWeight = num(el.value) || 0; save(); break;
  }
}

function onClick(ev) {
  const b = ev.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act, v = b.dataset.v;
  const ei = b.dataset.e !== undefined ? +b.dataset.e : null;
  const si = b.dataset.s !== undefined ? +b.dataset.s : null;

  switch (act) {
    case 'tab': closeAllSheets(); go(v); break;
    case 'close-sheet': closeSheet(); break;

    /* home */
    case 'start-empty': startWorkout(null); go('log'); break;
    case 'start-tpl': startWorkout(v); go('log'); break;
    case 'resume': go('log'); break;

    /* workout editing */
    case 'pick-ex': openPicker((exId) => {
      S.active.entries.push({ exId, note: '', target: null, sets: [{ w: '', r: '', done: false }] });
      save(); render();
    }); break;
    case 'add-set': {
      const e = S.active.entries[+v];
      const last = e.sets[e.sets.length - 1];
      e.sets.push(last ? { w: last.w, r: last.r, s: last.s, done: false } : { w: '', r: '', done: false });
      save(); render(); break;
    }
    case 'del-set': S.active.entries[ei].sets.splice(si, 1); save(); render(); break;
    case 'tick': {
      const st = S.active.entries[ei].sets[si];
      st.done = !st.done;
      save(); render();
      if (st.done) startRest(num(S.settings.restDefault) || 120);
      break;
    }
    case 'ex-menu': openEntryMenu(+v); break;
    case 'plates': {
      const e = S.active.entries[+v];
      const last = e.sets.filter((s2) => num(s2.w) > 0).pop();
      openPlates(last ? num(last.w) : '');
      break;
    }
    case 'finish': {
      if (activeSetCount() === 0) { alert(t('empty_workout')); break; }
      if (!confirm(t('finish_confirm'))) break;
      const w = S.active;
      if (w.editing) { // restore original position
        w.editing = false; w.endedAt = w.endedAt || new Date().toISOString();
        w.entries = w.entries.filter((e) => e.sets.length);
        S.workouts.push(w); S.workouts.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
        S.active = null; save();
      } else finishWorkout();
      endRest(false); go('history'); break;
    }
    case 'discard': if (confirm(t('discard_confirm'))) { discardWorkout(); endRest(false); go('home'); } break;

    /* history */
    case 'open-workout': openWorkout(v); break;
    case 'delete-workout': if (confirm(t('confirm_delete'))) { deleteWorkout(v); closeSheet(); render(); } break;
    case 'repeat-workout': {
      const w = S.workouts.find((x) => x.id === v);
      if (!w) break;
      if (S.active && !confirm(t('discard_confirm'))) break;
      const nw = newWorkout(w.name, w.templateId);
      nw.entries = w.entries.map((e) => ({ exId: e.exId, note: e.note, target: e.target || null, sets: e.sets.map((st) => ({ w: st.w, r: st.r, s: st.s, done: false })) }));
      S.active = nw; save(); closeSheet(); go('log'); break;
    }
    case 'edit-workout': {
      const i = S.workouts.findIndex((x) => x.id === v);
      if (i < 0) break;
      if (S.active && !confirm(t('discard_confirm'))) break;
      const w = S.workouts.splice(i, 1)[0];
      w.editing = true; S.active = w; save(); closeSheet(); go('log'); break;
    }
    case 'tpl-from-workout': {
      const w = S.workouts.find((x) => x.id === v);
      const name = prompt(t('template_name'), w.name || fmtDay(w.startedAt, S.settings.lang));
      if (name) { saveTemplateFromWorkout(w, name); closeSheet(); render(); }
      break;
    }

    /* exercises */
    case 'exfilter': ui.exFilter = v; render(); break;
    case 'open-ex': openExercise(v); break;
    case 'new-ex': openNewExercise(); break;
    case 'edit-ex': { const ex = exById(v); closeSheet(); openNewExercise(null, ex); break; }
    case 'delete-ex': if (confirm(t('confirm_delete'))) { deleteExercise(v); closeSheet(); render(); } break;

    /* body */
    case 'toggle-meas': ui.showMeas = !ui.showMeas; render(); break;
    case 'save-body': {
      const g = (k) => { const el2 = document.querySelector(`[data-f="${k}"]`); return el2 ? el2.value : ''; };
      const w = num(g('bweight'));
      const entry = { date: g('bdate') || ymd(new Date()) };
      if (w > 0) entry.weight = w;
      ['waist', 'chest_m', 'arm', 'thigh', 'neck'].forEach((k) => { const val = num(g('b_' + k)); if (val > 0) entry[k] = val; });
      if (!entry.weight && Object.keys(entry).length === 1) break;
      addBodyEntry(entry); render(); break;
    }
    case 'del-body': if (confirm(t('confirm_delete'))) { deleteBodyEntry(v); render(); } break;

    /* settings */
    case 'toggle': S.settings[v] = !S.settings[v]; save(); closeSheet(); openSettings(); render(); break;
    case 'lang': S.settings.lang = v; save(); closeSheet(); render(); openSettings(); break;
    case 'theme': S.settings.theme = v; document.documentElement.dataset.theme = v; save(); closeSheet(); openSettings(); break;
    case 'del-tpl': if (confirm(t('confirm_delete'))) { deleteTemplate(v); closeSheet(); openSettings(); render(); } break;

    /* template editor */
    case 'new-tpl': openTemplateEditor(null); break;
    case 'edit-tpl': openTemplateEditor(v); break;
    case 'tpl-add-ex': openPicker((exId) => {
      tplDraft.items.push({ exId, sets: 3, lo: 8, hi: 12, note: '' });
      redrawTpl();
    }); break;
    case 'tpl-del-item': tplDraft.items.splice(+v, 1); redrawTpl(); break;
    case 'tpl-move': {
      const i = +v;
      if (i > 0) { const a = tplDraft.items;[a[i - 1], a[i]] = [a[i], a[i - 1]]; redrawTpl(); }
      break;
    }
    case 'tpl-save': {
      if (!tplDraft.name.trim()) { alert(t('tpl_name_required')); break; }
      if (!tplDraft.items.length) { alert(t('tpl_empty')); break; }
      tplDraft.items.forEach((it) => { if (!it.sets) it.sets = 3; });
      upsertTemplate(tplDraft); tplDraft = null; closeAllSheets(); go('home'); break;
    }
    case 'tpl-delete': if (confirm(t('confirm_delete'))) { deleteTemplate(tplDraft.id); tplDraft = null; closeAllSheets(); render(); } break;
    case 'tpl-from-active': {
      if (!S.active || !S.active.entries.length) { alert(t('tpl_empty')); break; }
      const name = prompt(t('template_name'), S.active.name || '');
      if (name) { saveTemplateFromWorkout(S.active, name); alert(t('save') + ' ✓'); }
      break;
    }
    case 'export': doExport(); break;
    case 'import': doImport(); break;
    case 'wipe': if (confirm(t('wipe_confirm')) && confirm(t('wipe_confirm'))) { localStorage.removeItem(KEY); location.reload(); } break;

    /* rest */
    case 'rest-add': rest.endsAt += 30000; renderRestBar(); break;
    case 'rest-skip': endRest(false); break;
  }
}

function openEntryMenu(ei) {
  const e = S.active.entries[ei];
  const ex = exById(e.exId);
  const el = sheet(label(ex), `
    <label class="f"><span>${esc(t('notes'))}</span><input type="text" id="em-note" value="${esc(e.note || '')}" placeholder="${esc(t('note_ph'))}"></label>
    <button class="btn sec" id="em-info" style="margin-bottom:10px">ℹ ${esc(t('info'))}</button>
    <div class="row" style="gap:8px">
      <button class="btn sec sm" id="em-up" style="flex:1">↑</button>
      <button class="btn sec sm" id="em-down" style="flex:1">↓</button>
    </div>
    <div style="height:8px"></div>
    <button class="btn danger" id="em-del">${esc(t('delete'))}</button>`);
  el.querySelector('#em-note').addEventListener('input', (ev2) => { e.note = ev2.target.value; save(); });
  const move = (d) => {
    const j = ei + d; if (j < 0 || j >= S.active.entries.length) return;
    const arr = S.active.entries;[arr[ei], arr[j]] = [arr[j], arr[ei]];
    save(); closeSheet(); render();
  };
  el.querySelector('#em-info').addEventListener('click', () => { closeSheet(); openExercise(e.exId); });
  el.querySelector('#em-up').addEventListener('click', () => move(-1));
  el.querySelector('#em-down').addEventListener('click', () => move(1));
  el.querySelector('#em-del').addEventListener('click', () => {
    if (!confirm(t('confirm_delete'))) return;
    S.active.entries.splice(ei, 1); save(); closeSheet(); render();
  });
}

/* ============ backup ============ */
function doExport() {
  const data = exportData();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `gymlog-backup-${ymd(new Date())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  closeSheet(); openSettings();
}
function doImport() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.addEventListener('change', () => {
    const f = inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        importData(r.result);
        document.documentElement.dataset.theme = S.settings.theme;
        alert(t('imported')); closeAllSheets(); go('home');
      } catch (e) { alert(t('import_failed')); }
    };
    r.readAsText(f);
  });
  inp.click();
}
