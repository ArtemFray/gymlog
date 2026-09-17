/* FREILIFT UI */

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let route = 'home';
let ui = { exFilter: 'all', exSearch: '', statsEx: null, showMeas: false, histOpen: null, curEntry: null };
let rest = { endsAt: 0, iv: null, total: 0 };
let audioCtx = null;
let resizeT = null;

/* transient, never persisted: pending soft delete, stepper hold, row gesture */
let pendingDelete = null;
let hold = null;
let gest = null;
let suppressClickUntil = 0;

const NA = '–';
const SWIPE_MIN = 64;
const LONG_MS = 500;

const loc = () => (S.settings.lang === 'ru' ? 'ru-RU' : 'en-GB');
const fmtInt = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');
const hasVal = (v) => v !== '' && v != null;
/* count + noun with the right plural form (RU has three) */
function tn(base, n) {
  let form = n === 1 ? 'one' : 'many';
  if (S.settings.lang === 'ru') {
    const m10 = n % 10, m100 = n % 100;
    form = m10 === 1 && m100 !== 11 ? 'one' : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) ? 'few' : 'many';
  }
  return t(`${base}_${form}`, { n });
}

/* ============ boot ============ */
document.addEventListener('DOMContentLoaded', () => {
  load();
  applyTheme();
  if (S.active) route = 'log';
  render();
  $('#btn-settings').addEventListener('click', openSettings);
  document.addEventListener('click', (ev) => {
    if (Date.now() < suppressClickUntil) { ev.preventDefault(); ev.stopPropagation(); }
  }, true);
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onInput);
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerEnd);
  document.addEventListener('pointercancel', onPointerEnd);
  document.addEventListener('contextmenu', (ev) => {
    if (ev.target.closest('.setline, .setlive .head, .stepper')) ev.preventDefault();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopHold(); });
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(drawCharts, 150); });
});

function applyTheme() {
  const th = S.settings.theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = th;
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = th === 'light' ? '#f4f2ed' : '#121110';
}

/* ============ icons ============ */
/* the FREILIFT mark: an F whose top arm is a loaded bar. Inline, so it
   inherits currentColor and costs no request. Same file as the app icons. */
const MARK = (cls) => `<svg class="${cls}" viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
  <rect x="3" y="12" width="7.5" height="21" rx="2"/><rect x="53.5" y="12" width="7.5" height="21" rx="2"/>
  <rect x="5" y="18.5" width="54" height="7" rx="1.5"/><rect x="16" y="18.5" width="7" height="34.5" rx="1.5"/>
  <rect x="23" y="35" width="19" height="7" rx="1.5"/></svg>`;
const ICON_MORE = '<svg viewBox="0 0 18 18" aria-hidden="true"><circle class="solid" cx="3.8" cy="9" r="1.5"/><circle class="solid" cx="9" cy="9" r="1.5"/><circle class="solid" cx="14.2" cy="9" r="1.5"/></svg>';
const ICON_PLATES = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M1.5 9h15"/><rect x="4.2" y="4" width="2.8" height="10" rx=".8"/><rect x="11" y="4" width="2.8" height="10" rx=".8"/></svg>';
const ICON_EDIT = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M11.8 3.6l2.6 2.6-8 8-3.2.6.6-3.2z"/></svg>';
const ICON_UP = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M9 14.5V3.8M4.6 8.2L9 3.8l4.4 4.4"/></svg>';
const ICON_SEARCH = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6"/><path d="M10.4 10.4L14 14"/></svg>';

/* ============ nav ============ */
/* three tabs, plain labels. Stats and Body are rows in the settings sheet:
   five tabs meant five labels too small to read. */
const TABS = [
  { id: 'home', k: 'tab_workout' },
  { id: 'exercises', k: 'tab_exercises' },
  { id: 'history', k: 'tab_history' },
];
function renderNav() {
  $('#nav').innerHTML = TABS.map((tb) => {
    const on = route === tb.id || (route === 'log' && tb.id === 'home');
    return `<button data-act="tab" data-v="${tb.id}" class="${on ? 'on' : ''}"${on ? ' aria-current="page"' : ''}>${esc(t(tb.k))}</button>`;
  }).join('');
}
function go(r) {
  commitDelete();
  stopHold();
  route = r; render();
  const m = $('#app'); if (m) m.scrollTop = 0;
}

/* ============ render ============ */
function render() {
  if (route === 'log' && !S.active) route = 'home';
  document.documentElement.lang = S.settings.lang === 'ru' ? 'ru' : 'en';
  const titles = { history: 'tab_history', exercises: 'tab_exercises', stats: 'tab_stats', body: 'tab_body' };
  const h1 = $('#title');
  h1.classList.toggle('wordmark', route === 'home');
  h1.textContent = route === 'home' ? 'FREILIFT'
    : route === 'log' ? (S.active.name || t('in_progress'))
    : t(titles[route] || 'app');
  renderChrome();
  const v = { home: viewHome, log: viewLog, history: viewHistory, exercises: viewExercises, stats: viewStats, body: viewBody }[route] || viewHome;
  $('#app').innerHTML = v();
  renderNav();
  renderRestBar();
  drawCharts();
}

/* header action slot + the flex:none rows around main#app */
function renderChrome() {
  const shell = $('#shell'), main = $('#app');
  const onLog = route === 'log' && !!S.active;

  $('#hslot').innerHTML = onLog
    ? `<button class="hbtn" data-act="more" aria-label="${esc(t('more'))}">${ICON_MORE}</button>`
    : route === 'exercises'
      ? `<button class="hbtn plus" data-act="new-ex" aria-label="${esc(t('new_exercise'))}">+</button>`
      : '';
  /* during a workout the gear lives in the ⋯ menu: one button on the right */
  $('#btn-settings').hidden = onLog;

  /* session progress: the same information the set-count bar carried, no text */
  let pr = $('#shell > .progress');
  if (onLog) {
    if (!pr) { pr = document.createElement('div'); pr.className = 'progress'; shell.insertBefore(pr, main); }
    const c = sessionProgress();
    pr.innerHTML = `<i style="width:${c.total ? (c.done / c.total * 100).toFixed(1) : 0}%"></i>`;
  } else if (pr) pr.remove();

  let tb = $('#shell > .toolbar');
  if (route === 'exercises') {
    if (!tb) { tb = document.createElement('div'); tb.className = 'toolbar'; shell.insertBefore(tb, main); }
    if (tb.dataset.lang !== S.settings.lang || tb.dataset.filter !== ui.exFilter) {
      tb.dataset.lang = S.settings.lang; tb.dataset.filter = ui.exFilter;
      tb.innerHTML = toolbarHtml();
    }
  } else if (tb) tb.remove();
  syncNavOverlap();
}

/* content scrolls under the glass nav only when nothing sits between main and nav */
function syncNavOverlap() {
  const main = $('#app');
  $('#shell').classList.toggle('nav-over', !!main && main.nextElementSibling === $('#nav'));
}

function sessionProgress() {
  let done = 0, total = 0;
  (S.active ? S.active.entries : []).forEach((e) => e.sets.forEach((st) => { total++; if (st.done) done++; }));
  return { done, total };
}

/* search plus one group button. The chip row above the list is gone: it was a
   second scrolling axis over a scrolling list. */
function toolbarHtml() {
  const cur = ui.exFilter === 'all' ? t('all') : muscleLabel(ui.exFilter);
  return `<label class="search">${ICON_SEARCH}
      <input type="text" data-f="exsearch" value="${esc(ui.exSearch)}" placeholder="${esc(t('search_ex'))}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"></label>
    <button class="btn sm" data-act="ex-groups">${esc(cur)}</button>`;
}

/* ============ shared pieces ============ */
function h2row(title, right) {
  return `<div class="h2row"><h2>${esc(title)}</h2>${right || ''}</div>`;
}
function heading(title, count) {
  return `<h2>${esc(title)}${count != null && count !== '' ? ` <span class="ct">· ${esc(count)}</span>` : ''}</h2>`;
}
function emptyState(title, sub, cls) {
  return `<div class="empty ${cls || ''}">${MARK('mark')}<div class="t">${esc(title)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}</div>`;
}
function kpi(v, k, unit, cls) {
  return `<div class="kpi"><div class="v${cls ? ' ' + cls : ''}">${esc(v)}${unit ? `<span class="u">${esc(unit)}</span>` : ''}</div><div class="k">${esc(k)}</div></div>`;
}
function hbar(frac) {
  const pct = Math.max(0, Math.min(100, (frac || 0) * 100)).toFixed(1);
  return `<svg class="hbar" aria-hidden="true"><rect class="track" width="100%" height="6" rx="3"/><rect class="val" width="${pct}%" height="6" rx="3"/></svg>`;
}
const muscleLabel = (id) => label(MUSCLES.find((m) => m.id === id) || { en: id, ru: id });
const equipLabel = (id) => label(EQUIPMENT.find((q) => q.id === id) || {});
const EQ_SHORT = { barbell: 'bb', dumbbell: 'db', bodyweight: 'bw' };

function exMatches(e, q) {
  if (!q) return true;
  const eq = EQUIPMENT.find((x) => x.id === e.eq) || {};
  const hay = norm([e.en, e.ru, (e.alias || []).join(' '), eq.en, eq.ru, EQ_SHORT[e.eq] || ''].join(' '));
  return norm(q).split(/\s+/).filter(Boolean).every((tok) => hay.includes(tok));
}

/* one set as plain text: history, exercise detail */
function setStr(st, kind) {
  let s;
  if (kind === 'time') s = fmtClock(num(st.s));
  else if (kind === 'reps') s = (num(st.w) ? '+' + fmtNum(num(st.w), 2) + ' × ' : '') + num(st.r);
  else s = `${fmtNum(num(st.w), 2)} × ${num(st.r)}`;
  return st.warm ? `(${s})` : s;
}

/* ============ TODAY ============ */
function viewHome() {
  const st = overallStats();
  const ws = weightSeries();
  const cur = ws.length ? ws[ws.length - 1].v : null;
  const dsb = daysSinceBackup();
  let html = '';

  if (S.active) {
    const c = sessionProgress();
    html += `<section class="section"><div class="screenmeta">${esc(t('in_progress'))}</div>
      <div class="exname">${esc(S.active.name || t('start_empty'))}</div>
      <div class="metaline">${esc(t('sets_of', { n: c.done, m: c.total }))} · ${esc(fmtDay(S.active.startedAt, S.settings.lang))}</div>
      <button class="btn-primary mt-4" data-act="resume">${esc(t('resume'))}</button></section>`;
  } else {
    html += `<section class="section">${heading(t('start_from'))}`;
    if (!S.templates.length) html += emptyState(t('empty_tpl_t'), t('empty_tpl_s'), 'left');
    else {
      const ordered = orderedTemplates();
      html += `<div class="list">${ordered.slice(0, HOME_TPL).map(tplRow).join('')}
        <button class="listrow" data-act="all-tpl">
          <span class="grow"><span class="name">${esc(t('all_templates'))}</span><span class="meta">${esc(tn('tpl', ordered.length))}</span></span>
          <span class="chev" aria-hidden="true">›</span></button></div>`;
    }
    html += `<button class="btn mt-3" data-act="start-empty">${esc(t('start_empty'))}</button></section>`;
  }

  html += `<section class="section"><h2>${esc(t('overall'))}</h2><div class="kpis">
    ${kpi(st.thisWeek, t('this_week'))}
    ${kpi(st.count, t('workouts'))}
    ${kpi(cur ? fmtNum(cur, 1) : NA, t('body_weight'), cur ? t('kg') : '')}
    ${kpi(st.streak, `${t('streak')} (${t('weeks')})`)}
  </div></section>`;

  if (S.workouts.length) {
    html += `<section class="section"><h2>${esc(t('last_workout'))}</h2><div class="list ruled">${workoutRow(S.workouts[0])}</div></section>`;
  }
  const md = String.fromCharCode(8212);
  if (dsb === null && S.workouts.length > 2) html += `<div class="note mt-4">${esc(t('backup_due', { n: md }).replace(md + ' ', ''))}</div>`;
  else if (dsb !== null && dsb >= 14) html += `<div class="note mt-4">${esc(t('backup_due', { n: dsb }))}</div>`;
  return html;
}

/* Today shows only the most recently used templates; the rest open in a sheet */
const HOME_TPL = 3;
function templateLastUsed() {
  const last = {};
  S.workouts.forEach((w) => { if (w.templateId && (!last[w.templateId] || w.startedAt > last[w.templateId])) last[w.templateId] = w.startedAt; });
  return last;
}
function orderedTemplates() {
  const last = templateLastUsed();
  return S.templates.map((tp, i) => ({ tp, i, at: last[tp.id] || '' }))
    .sort((a, b) => (a.at === b.at ? a.i - b.i : (b.at > a.at ? 1 : -1)))
    .map((x) => x.tp);
}
function openTemplates() {
  const rows = orderedTemplates().map(tplRow).join('');
  const el = sheet(t('templates'), `<div class="list">${rows}</div>
    <button class="btn mt-3" data-act="new-tpl">+ ${esc(t('new_template'))}</button>`);
  el.dataset.sheet = 'templates';
}

/* two lines: a name and one supporting line, never more */
function tplRow(tp) {
  const items = tp.items || [];
  const at = templateLastUsed()[tp.id];
  const meta = [tn('exn', items.length)];
  if (at) meta.push(new Date(at).toLocaleDateString(loc(), { day: 'numeric', month: 'short' }));
  return `<div class="listrow tight">
    <button class="rowbtn" data-act="start-tpl" data-v="${tp.id}">
      <span class="grow"><span class="name">${esc(label(tp) || tp.name)}</span>
        <span class="meta">${esc(meta.join(' · '))}</span></span></button>
    <button class="ibtn" data-act="edit-tpl" data-v="${tp.id}" aria-label="${esc(t('edit_template'))}">${ICON_EDIT}</button>
  </div>`;
}

function workoutRow(w) {
  const dur = workoutDuration(w);
  const parts = [fmtDay(w.startedAt, S.settings.lang), `${workoutSets(w)} ${t('sets_short')}`, `${fmtInt(workoutVolume(w))} ${t('kg')}`];
  if (dur) parts.push(`${dur} ${t('min')}`);
  return `<button class="listrow" data-act="open-workout" data-v="${w.id}">
    <span class="grow"><span class="name">${esc(w.name || fmtDay(w.startedAt, S.settings.lang))}</span>
    <span class="meta">${esc(parts.join(' · '))}</span></span><span class="chev" aria-hidden="true">›</span></button>`;
}

/* ============ HISTORY ============ */
function viewHistory() {
  if (!S.workouts.length) return emptyState(t('empty_hist_t'), t('empty_hist_s'));
  const month = (w) => new Date(w.startedAt).toLocaleDateString(loc(), { month: 'long', year: 'numeric' });
  const counts = {};
  S.workouts.forEach((w) => { const k = month(w); counts[k] = (counts[k] || 0) + 1; });
  let html = '', curMonth = null;
  S.workouts.forEach((w) => {
    const mk = month(w);
    if (mk !== curMonth) {
      if (curMonth !== null) html += '</div></section>';
      html += `<section class="section">${heading(mk, counts[mk])}<div class="list">`;
      curMonth = mk;
    }
    html += workoutRow(w);
  });
  return html + '</div></section>';
}

/* ============ EXERCISES ============ */
function viewExercises() {
  let list = allExercises();
  if (ui.exFilter !== 'all') list = list.filter((e) => e.m === ui.exFilter);
  if (ui.exSearch) list = list.filter((e) => exMatches(e, ui.exSearch));
  if (!list.length) return emptyState(t('empty_ex_t'), t('empty_ex_s'));

  const groups = {};
  list.forEach((e) => { (groups[e.m] = groups[e.m] || []).push(e); });
  const order = MUSCLES.map((m) => m.id).filter((id) => groups[id]);
  Object.keys(groups).forEach((k) => { if (!order.includes(k)) order.push(k); });

  sessCounts = sessionCounts();
  return order.map((mid) => {
    const rows = groups[mid].sort((a, b) => label(a).localeCompare(label(b))).map(exRow).join('');
    return `<section class="section">${heading(muscleLabel(mid), groups[mid].length)}<div class="list">${rows}</div></section>`;
  }).join('');
}

/* sessions per exercise, counted once per render instead of once per row */
let sessCounts = {};
function sessionCounts() {
  const c = {};
  S.workouts.forEach((w) => w.entries.forEach((en) => { if (en.sets.length) c[en.exId] = (c[en.exId] || 0) + 1; }));
  return c;
}

/* two lines. The warning tag moved to the detail sheet, where there is room
   to say what is actually wrong. */
function exRow(e) {
  const meta = [equipLabel(e.eq)];
  if (sessCounts[e.id]) meta.push(tn('sess', sessCounts[e.id]));
  if (e.custom) meta.push(t('custom'));
  return `<button class="listrow" data-act="open-ex" data-v="${e.id}">
    <span class="grow"><span class="name">${esc(label(e))}</span><span class="meta">${esc(meta.filter(Boolean).join(' · '))}</span></span>
    <span class="chev" aria-hidden="true">›</span></button>`;
}

/* ============ ACTIVE WORKOUT ============ */
/* The live set is derived: the first set with done !== true in the current entry.
   The current entry is the one the user focused, else the first with an unlogged set. */
const liveSetIndex = (entry) => entry.sets.findIndex((x) => !x.done);

/* An explicit pick wins; otherwise the first exercise with an unlogged set.
   Logging the last set of an exercise clears the pick, so the screen advances. */
function currentEntryIndex(w) {
  const c = ui.curEntry;
  if (c != null && w.entries[c]) return c;
  return w.entries.findIndex((e) => liveSetIndex(e) >= 0);
}

/* One screen, one job: the exercise being worked on, and nothing else.
   Session totals, the clock, the target line and the note live one tap away. */
function viewLog() {
  const w = S.active;
  if (!w.entries.length) {
    return emptyState(t('empty_log_t'), t('empty_log_s'))
      + `<button class="btn-primary" data-act="pick-ex">+ ${esc(t('add_exercise'))}</button>`;
  }
  const cur = currentEntryIndex(w);
  if (cur < 0) return doneBlock();
  if (rest.endsAt) return restPanel(w, cur);
  return entryBlock(w.entries[cur], cur, w);
}

/* every set logged: the one thing left to do is finish */
function doneBlock() {
  const c = sessionProgress();
  return `<div class="screenmeta">${esc(t('sets_of', { n: c.done, m: c.total }))}</div>
    <div class="exname">${esc(t('all_done_t'))}</div>
    <div class="metaline">${esc(t('all_done_s'))}</div>
    <button class="btn-primary mt-5" data-act="finish">${esc(t('finish_workout'))}</button>
    <button class="btn quiet mt-3" data-act="jump">${esc(t('switch_ex'))}</button>
    <button class="btn quiet mt-2" data-act="pick-ex">+ ${esc(t('add_exercise'))}</button>`;
}

function entryBlock(e, ei, w) {
  const ex = exById(e.exId);
  const kind = ex.kind || 'wr';
  const prev = lastPerformance(e.exId, w.id);
  const live = liveSetIndex(e);

  let html = `<button class="screenmeta" data-act="jump">
      <span class="grow">${esc(t('ex_of', { n: ei + 1, m: w.entries.length }))}</span>
      <span class="chev" aria-hidden="true">›</span></button>
    <article class="exblock" data-entry="${ei}">
      <div class="exname">${esc(label(ex))}</div>`;
  if (S.settings.programWarnings && ex.warn) html += `<div class="note">${esc(t(ex.warn === 'back' ? 'warn_back' : 'warn_shoulder'))}</div>`;
  /* the coaching note is one tap away in the exercise menu, not always on screen */
  if (live >= 0) html += liveBlock(e, ei, live, kind, ex, prev);

  const pd = pendingDelete && pendingDelete.entryRef === e ? pendingDelete : null;
  html += '<div class="ledger">';
  e.sets.forEach((st, si) => {
    if (pd && pd.si === si) html += undoStrip(pd, ei);
    if (si !== live) html += setLine(st, ei, si, kind);
  });
  if (pd && pd.si >= e.sets.length) html += undoStrip(pd, ei);
  html += '</div>';

  if (S.settings.progressionHints && hitTopOfRange(e)) html += `<div class="note ok">${esc(t('progression_hit'))}</div>`;
  html += `<button class="btn quiet addset" data-act="add-set" data-v="${ei}">+ ${esc(t('add_set'))}</button></article>`;
  return html;
}

/* one 17px line: "22.5 kg × 10". The unit is spelled out, once. */
function setValsHtml(st, kind) {
  if (!hasVal(st.w) && !hasVal(st.r) && !hasVal(st.s)) return NA;
  if (kind === 'time') return hasVal(st.s) ? esc(fmtClock(num(st.s))) : NA;
  const r = hasVal(st.r) ? esc(num(st.r)) : NA;
  if (kind === 'reps') return num(st.w) > 0 ? `${r} × +${esc(fmtNum(num(st.w), 2))} ${esc(t('kg'))}` : `${r} ${esc(t('unit_reps'))}`;
  return `${hasVal(st.w) ? esc(fmtNum(num(st.w), 2)) : NA} ${esc(t('kg'))} × ${r}`;
}

function setLine(st, ei, si, kind) {
  const cls = ['setline', st.warm ? 'warm' : '', st.done ? '' : 'pending'].filter(Boolean).join(' ');
  const idx = t('set_n', { n: si + 1 }) + (st.warm ? ' · ' + t('warmup') : '');
  return `<div class="${cls}" data-e="${ei}" data-s="${si}">
    <span class="vals">${setValsHtml(st, kind)}</span>
    <span class="idx">${esc(idx)}</span>
    <span class="done" aria-hidden="true">${st.done ? '✓' : ''}</span>
  </div>`;
}

/* rest owns the whole screen: at arm's length, nobody is touching the phone */
function restPanel(w, cur) {
  const left = Math.max(0, (rest.endsAt - Date.now()) / 1000);
  const nx = upNextName(w, cur);
  return `<div class="rest" role="timer">
    <div class="lbl">${esc(t('rest'))}</div>
    <div class="t">${esc(fmtClock(left))}</div>
    <div class="row">
      <button class="add" data-act="rest-add">${esc(t('add30'))}</button>
      <button class="skip" data-act="rest-skip">${esc(t('skip'))}</button>
    </div>
    ${nx ? `<div class="upnext"><div class="lbl">${esc(t('up_next'))}</div><div class="name">${esc(nx)}</div></div>` : ''}
  </div>`;
}
function upNextName(w, cur) {
  const e = w.entries[cur];
  if (e && liveSetIndex(e) >= 0) return label(exById(e.exId));
  const nx = w.entries.find((x, i) => i !== cur && liveSetIndex(x) >= 0);
  return nx ? label(exById(nx.exId)) : '';
}

function undoStrip(pd, ei) {
  return `<div class="undo" role="status"><b>${esc(t('set_deleted', { n: pd.si + 1 }))}</b>
    <button class="undo-btn" data-act="undo-set">${esc(t('undo'))}</button>
    <button class="ibtn" data-act="del-set" data-e="${ei}" data-s="${pd.si}" aria-label="${esc(t('delete_now'))}">×</button></div>`;
}

/* values the live set starts from: this session's previous working set, else last session */
function prefillFor(e, si, prev) {
  const out = {};
  const take = (src) => { if (src) ['w', 'r', 's'].forEach((f) => { if (out[f] == null && hasVal(src[f])) out[f] = src[f]; }); };
  for (let j = si - 1; j >= 0; j--) { if (e.sets[j].done && !e.sets[j].warm) { take(e.sets[j]); break; } }
  if (prev) {
    const ps = prev.entry.sets.filter((x) => !x.warm);
    take(prev.entry.sets[si] && !prev.entry.sets[si].warm ? prev.entry.sets[si] : ps[ps.length - 1]);
  }
  for (let j = si - 1; j >= 0; j--) { if (e.sets[j].done) { take(e.sets[j]); break; } }
  return out;
}

function lastStr(prev, si, kind) {
  if (!prev) return '';
  const ps = prev.entry.sets.filter((x) => !x.warm);
  const p = prev.entry.sets[si] && !prev.entry.sets[si].warm ? prev.entry.sets[si] : ps[ps.length - 1];
  if (!p) return '';
  return setStr(p, kind);
}

/* one step for every weight, tap or hold: settings.wStep (0.5 or 1), default 1 kg */
function stepFor(ex, fld) {
  if (fld === 'r') return 1;
  if (fld === 's') return 5;
  if (num(ex.inc) > 0) return num(ex.inc);
  return num(S.settings.wStep) || 1;
}

/* label on the left, 60px filled buttons on the right. The unit is in the
   label, not in the well: v3 printed "kg" three times per set. */
function steprow(lbl, ei, si, fld, value, mode) {
  const a = `data-e="${ei}" data-s="${si}" data-fld="${fld}"`;
  return `<div class="steprow"><span class="lbl">${esc(lbl)}</span>
    <div class="stepper">
      <button data-act="step" data-dir="dn" ${a} aria-label="−">−</button>
      <label class="well"><input type="text" inputmode="${mode}" ${a} value="${esc(value)}" placeholder="0" autocomplete="off" enterkeyhint="done"></label>
      <button data-act="step" data-dir="up" ${a} aria-label="+">+</button>
    </div></div>`;
}

function liveBlock(e, ei, si, kind, ex, prev) {
  const st = e.sets[si];
  const pf = prefillFor(e, si, prev);
  const val = (f) => (hasVal(st[f]) ? st[f] : (pf[f] != null ? pf[f] : ''));
  let rows;
  if (kind === 'time') rows = steprow(t('time'), ei, si, 's', val('s'), 'numeric');
  else if (kind === 'reps') rows = steprow(t('reps'), ei, si, 'r', val('r'), 'numeric') + steprow(`+${t('kg')}`, ei, si, 'w', val('w'), 'decimal');
  else rows = steprow(t('weight'), ei, si, 'w', val('w'), 'decimal') + steprow(t('reps'), ei, si, 'r', val('r'), 'numeric');
  const last = lastStr(prev, si, kind);
  const head = t('set_of', { n: si + 1, m: e.sets.length }) + (st.warm ? ' · ' + t('warmup') : '');
  return `<div class="setlive" data-e="${ei}" data-s="${si}">
    <div class="head" data-e="${ei}" data-s="${si}"><span class="n">${esc(head)}</span>
      ${last ? `<span class="prev">${esc(t('last'))} ${esc(last)}</span>` : ''}</div>
    ${rows}
    <button class="btn-primary" data-act="tick" data-e="${ei}" data-s="${si}">${esc(t('log_set', { n: si + 1 }))}</button>
  </div>`;
}

/* ============ STATS ============ */
function viewStats() {
  if (!S.workouts.length) return emptyState(t('empty_stats_t'), t('empty_stats_s'));
  const st = overallStats();
  let html = `<section class="section"><div class="kpis">
    ${kpi(st.count, t('workouts'))}
    ${kpi(fmtNum(st.avg, 1), t('avg_per_week'))}
    ${kpi(st.streak, `${t('streak')} (${t('weeks')})`)}
    ${kpi(fmtNum(st.totalVolume / 1000, 1), t('total_volume'), 't')}
  </div></section>
  <section class="section">${heading(t('vol_12w'), t('tonnes'))}<div class="chartbox" id="chart-vol"></div></section>`;

  const split = muscleSplit(30);
  if (split.length) {
    const max = Math.max(1, ...split.map((s) => s.sets));
    html += `<section class="section">${heading(t('split_30'))}<div class="list">` + split.map((s) => `
      <div class="splitrow"><div class="row between"><span class="nm">${esc(muscleLabel(s.m))}</span>
        <span class="ct">${s.sets} ${esc(t('sets_short'))}</span></div>${hbar(s.sets / max)}</div>`).join('') + '</div></section>';
  }

  const used = [...new Set(S.workouts.flatMap((w) => w.entries.map((e) => e.exId)))];
  if (used.length) {
    if (!ui.statsEx || !used.includes(ui.statsEx)) ui.statsEx = used[0];
    html += `<section class="section">${heading(t('per_exercise'))}
      <select data-f="statsex" aria-label="${esc(t('per_exercise'))}">` +
      used.map((id) => `<option value="${id}" ${id === ui.statsEx ? 'selected' : ''}>${esc(label(exById(id)))}</option>`).join('') + '</select>';
    const pr = exercisePR(ui.statsEx);
    const ex = exById(ui.statsEx);
    if (pr) {
      html += `<div class="kpis mt-3">
        ${ex.kind === 'time' ? kpi(fmtClock(pr.time), t('best_set')) : kpi(fmtNum(pr.weight, 2), t('best_set'), t('kg'))}
        ${ex.kind === 'wr' ? kpi(fmtNum(pr.e1rm, 1), t('est_1rm'), t('kg')) : kpi(pr.reps, t('reps'))}
      </div><div class="chartbox" id="chart-ex"></div>`;
    }
    html += '</section>';
  }
  return html;
}

/* ============ BODY ============ */
const MEAS = ['waist', 'chest_m', 'arm', 'thigh', 'neck'];
const fmtYmd = (s) => parseYmd(s).toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function viewBody() {
  const s = weightSeries();
  const cur = s.length ? s[s.length - 1].v : null;
  const avg = s.length ? rollingAvg(s, 7) : [];
  const cur7 = avg.length ? avg[avg.length - 1].v : null;
  const wc = weeklyWeightChange();
  const goal = num(S.settings.goalWeight), start = num(S.settings.startWeight);
  const prog = (cur != null && goal > start) ? (cur - start) / (goal - start) : 0;
  const wcCls = wc == null ? '' : (wc >= 0.15 && wc <= 0.28 ? 'ok' : (wc > 0.28 || wc < 0 ? 'warn' : ''));

  let html = `<section class="section"><div class="kpis">
    ${kpi(cur != null ? fmtNum(cur, 1) : NA, t('current'), cur != null ? t('kg') : '')}
    ${kpi(cur7 != null ? fmtNum(cur7, 2) : NA, t('trend7'))}
    ${kpi(wc == null ? NA : (wc >= 0 ? '+' : '') + fmtNum(wc, 2), t('weekly_change'), '', wcCls)}
    ${kpi(cur != null ? fmtNum(goal - cur, 1) : NA, t('to_go'), cur != null ? t('kg') : '')}
  </div></section>
  <section class="section goalbar">
    <div class="ends"><span>${esc(t('start_w'))} ${esc(fmtNum(start, 1))}</span><span>${esc(t('goal'))} ${esc(fmtNum(goal, 1))}</span></div>
    ${hbar(prog)}
    <div class="hint">${esc(t('target_rate'))}</div>
  </section>`;

  if (s.length > 1) {
    html += `<section class="section">${heading(t('body_weight'), t('kg'))}<div class="chartbox" id="chart-body"></div>
      <div class="legend"><span><i class="ink"></i>${esc(t('trend7'))}</span><span><i class="l2"></i>${esc(t('body_weight'))}</span><span><i class="ok"></i>${esc(t('goal'))} ${esc(fmtNum(goal, 1))}</span></div></section>`;
  }

  html += `<section class="section">${heading(t('log_weight'))}
    <div class="formgrid">
      <label class="field"><span>${esc(t('date'))}</span><input type="date" data-f="bdate" value="${ymd(new Date())}"></label>
      <label class="field"><span>${esc(t('body_weight'))}, ${esc(t('kg'))}</span><input type="text" inputmode="decimal" class="numin" data-f="bweight" placeholder="0"></label>
    </div>
    <button class="btn quiet mt-2" data-act="toggle-meas" aria-expanded="${ui.showMeas}"><span class="pm">${ui.showMeas ? '−' : '+'}</span> ${esc(t('measurements'))}</button>
    <div class="measgrid" id="meas"${ui.showMeas ? '' : ' hidden'}>
      ${MEAS.map((k) => `<label class="field"><span>${esc(t(k))}, ${esc(t('cm'))}</span><input type="text" inputmode="decimal" class="numin" data-f="b_${k}" placeholder="0"></label>`).join('')}
    </div>
    <button class="btn-primary mt-3" data-act="save-body">${esc(t('save'))}</button>
  </section>`;

  if (S.body.length) {
    html += `<section class="section">${heading(t('history_for'), S.body.length)}<div class="list">` + [...S.body].reverse().slice(0, 40).map((b) => {
      const meas = MEAS.filter((k) => b[k]).map((k) => `${t(k)} ${b[k]}`);
      return `<div class="listrow"><div class="grow">
          <div class="value">${b.weight ? `${esc(fmtNum(num(b.weight), 1))} ${esc(t('kg'))}` : NA}</div>
          <div class="meta">${esc([fmtYmd(b.date)].concat(meas).join(' · '))}</div></div>
        <button class="ibtn" data-act="del-body" data-v="${b.id}" aria-label="${esc(t('delete'))}">×</button></div>`;
    }).join('') + '</div></section>';
  } else {
    html += emptyState(t('empty_body_t'), t('empty_body_s'));
  }
  return html;
}

/* ============ CHARTS ============ */
/* viewBox is built from the host's measured width, so glyphs are never stretched */
const shortDate = (d) => d.toLocaleDateString(loc(), { day: 'numeric', month: 'short' });

function drawCharts() {
  const v = document.getElementById('chart-vol');
  if (v) barChart(v, weeklyVolume(12).map((x) => ({ label: shortDate(x.date), value: x.value })));
  const b = document.getElementById('chart-body');
  if (b) {
    const s = weightSeries();
    const avg = rollingAvg(s, 7);
    lineChart(b, [
      { points: s.map((p) => ({ x: parseYmd(p.date).getTime(), y: p.v })), color: 'var(--line2)', dots: true, width: 0 },
      { points: avg.map((p) => ({ x: parseYmd(p.date).getTime(), y: p.v })), color: 'var(--ink)', width: 2 },
    ], { hline: num(S.settings.goalWeight), fmt: (n) => fmtNum(n, 1) });
  }
  const e = document.getElementById('chart-ex');
  if (e && ui.statsEx) {
    const h = exerciseHistory(ui.statsEx);
    const ex = exById(ui.statsEx);
    const key = ex.kind === 'time' ? ((x) => num(x.best && x.best.s)) : (ex.kind === 'reps' ? ((x) => num(x.best && x.best.r)) : ((x) => x.e1rm));
    lineChart(e, [
      { points: h.map((x) => ({ x: new Date(x.date).getTime(), y: key(x) })), color: 'var(--ink)', width: 2, dots: true },
    ], { fmt: (n) => fmtNum(n, 1) });
  }
}

function barChart(host, items) {
  const W = Math.max(200, Math.round(host.clientWidth || 340)), H = 132;
  const padL = 34, padB = 24, padT = 6;
  const max = Math.max(1, ...items.map((i) => i.value));
  const bw = (W - padL) / items.length;
  const plotH = H - padT - padB;
  const bars = items.map((it, i) => {
    const h = it.value > 0 ? Math.max(3, (it.value / max) * plotH) : 3;
    const x = padL + i * bw + bw * 0.12;
    const r = i / Math.max(1, items.length - 1);
    const fill = it.value > 0 ? (r > 0.85 ? 'var(--ink)' : r > 0.6 ? 'var(--ink2)' : r > 0.3 ? 'var(--line2)' : 'var(--line)') : 'var(--line)';
    return `<rect x="${x.toFixed(1)}" y="${(H - padB - h).toFixed(1)}" width="${(bw * 0.76).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${fill}"/>`;
  }).join('');
  const pick = [0, Math.floor(items.length / 2), items.length - 1];
  const labels = pick.map((i, n) => {
    const x = n === 0 ? padL : n === 1 ? padL + (W - padL) / 2 : W;
    const anchor = n === 0 ? 'start' : n === 1 ? 'middle' : 'end';
    return `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="${anchor}">${esc(items[i].label)}</text>`;
  }).join('');
  const midY = (padT + plotH / 2).toFixed(1);
  host.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(t('vol_12w'))}">
    <line class="grid" x1="${padL}" y1="${padT}" x2="${W}" y2="${padT}"/>
    <line class="grid" x1="${padL}" y1="${midY}" x2="${W}" y2="${midY}"/>
    <text x="0" y="${padT + 4}">${esc(fmtNum(max / 1000, 1))}</text>
    <text x="0" y="${(+midY + 4).toFixed(1)}">${esc(fmtNum(max / 2000, 1))}</text>
    ${bars}
    <line class="axis" x1="${padL}" y1="${H - padB}" x2="${W}" y2="${H - padB}"/>
    ${labels}</svg>`;
}

function lineChart(host, series, opt = {}) {
  const W = Math.max(200, Math.round(host.clientWidth || 340)), H = 140, padB = 22, padT = 10;
  const pts = series.flatMap((s) => s.points).filter((p) => isFinite(p.y));
  if (!pts.length) { host.innerHTML = ''; return; }
  const ys = pts.map((p) => p.y);
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  if (yMax - yMin < 1e-6) { yMax += 1; yMin -= 1; }
  const padY = (yMax - yMin) * 0.12; yMin -= padY; yMax += padY;
  const fmt = opt.fmt || ((n) => fmtNum(n, 1));
  const ticks = [0, 1, 2].map((i) => yMin + ((yMax - yMin) * i) / 2);
  const padL = Math.max(30, Math.max(...ticks.map((y) => String(fmt(y)).length)) * 7 + 6);
  const xs = pts.map((p) => p.x);
  let xMin = Math.min(...xs), xMax = Math.max(...xs);
  if (xMax === xMin) xMax = xMin + 1;
  const px = (x) => padL + ((x - xMin) / (xMax - xMin)) * (W - padL - 6);
  const py = (y) => padT + (1 - (y - yMin) / (yMax - yMin)) * (H - padT - padB);

  let g = ticks.map((y) => `<line class="grid" x1="${padL}" y1="${py(y).toFixed(1)}" x2="${W}" y2="${py(y).toFixed(1)}"/>
    <text x="0" y="${(py(y) + 4).toFixed(1)}">${esc(fmt(y))}</text>`).join('');
  if (opt.hline) {
    if (opt.hline >= yMin && opt.hline <= yMax) {
      g += `<line x1="${padL}" y1="${py(opt.hline).toFixed(1)}" x2="${W}" y2="${py(opt.hline).toFixed(1)}" stroke="var(--ok)" stroke-dasharray="4 3" stroke-width="1.5"/>`;
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
  const mid = new Date(xMin + (xMax - xMin) / 2);
  const xl = [[padL, 'start', new Date(xMin)], [padL + (W - padL) / 2, 'middle', mid], [W, 'end', new Date(xMax)]];
  host.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">
    ${g}${paths}
    ${xl.map(([x, a, d]) => `<text x="${x.toFixed(1)}" y="${H - 4}" text-anchor="${a}">${esc(shortDate(d))}</text>`).join('')}
  </svg>`;
}

/* ============ MUSCLE MAP ============ */
/* Original front/back diagram. primary = ink, secondary = ink2, rest neutral. */
function muscleMap(exId) {
  const ex = exById(exId);
  const info = EX_INFO[exId] || {};
  const primary = ex.m;
  const secondary = new Set((info.sec || []).concat(ex.sec || []));
  const c = (m) => (m === primary ? 'class="pri"' : secondary.has(m) ? 'class="sec"' : 'class="neu"');
  const N = 'class="neu"';
  const SIL = `<g class="sil">
    <rect x="40" y="32" width="40" height="82" rx="15"/>
    <rect x="19" y="40" width="17" height="76" rx="8"/>
    <rect x="84" y="40" width="17" height="76" rx="8"/>
    <rect x="43" y="94" width="17" height="108" rx="8"/>
    <rect x="60" y="94" width="17" height="108" rx="8"/></g>`;

  const front = SIL + `
    <circle cx="60" cy="17" r="11" ${N}/>
    <rect x="54" y="26" width="12" height="8" rx="3" ${N}/>
    <ellipse cx="35" cy="45" rx="11" ry="9" ${c('shoulders')}/>
    <ellipse cx="85" cy="45" rx="11" ry="9" ${c('shoulders')}/>
    <rect x="43" y="37" width="16" height="21" rx="6" ${c('chest')}/>
    <rect x="61" y="37" width="16" height="21" rx="6" ${c('chest')}/>
    <rect x="48" y="60" width="24" height="36" rx="7" ${c('core')}/>
    <ellipse cx="28" cy="66" rx="8" ry="13" ${c('biceps')}/>
    <ellipse cx="92" cy="66" rx="8" ry="13" ${c('biceps')}/>
    <ellipse cx="23" cy="93" rx="7" ry="15" ${c('forearms')}/>
    <ellipse cx="97" cy="93" rx="7" ry="15" ${c('forearms')}/>
    <circle cx="21" cy="112" r="5" ${N}/>
    <circle cx="99" cy="112" r="5" ${N}/>
    <rect x="45" y="98" width="30" height="12" rx="6" ${N}/>
    <rect x="45" y="112" width="13" height="46" rx="7" ${c('quads')}/>
    <rect x="62" y="112" width="13" height="46" rx="7" ${c('quads')}/>
    <rect x="46" y="161" width="11" height="34" rx="5" ${N}/>
    <rect x="63" y="161" width="11" height="34" rx="5" ${N}/>
    <rect x="44" y="197" width="14" height="7" rx="3" ${N}/>
    <rect x="62" y="197" width="14" height="7" rx="3" ${N}/>`;

  const back = SIL + `
    <circle cx="60" cy="17" r="11" ${N}/>
    <rect x="54" y="26" width="12" height="8" rx="3" ${N}/>
    <ellipse cx="35" cy="45" rx="11" ry="9" ${c('shoulders')}/>
    <ellipse cx="85" cy="45" rx="11" ry="9" ${c('shoulders')}/>
    <rect x="48" y="33" width="24" height="15" rx="6" ${c('back')}/>
    <rect x="41" y="49" width="17" height="24" rx="7" ${c('back')}/>
    <rect x="62" y="49" width="17" height="24" rx="7" ${c('back')}/>
    <rect x="50" y="74" width="20" height="18" rx="6" ${c('back')}/>
    <ellipse cx="28" cy="66" rx="8" ry="13" ${c('triceps')}/>
    <ellipse cx="92" cy="66" rx="8" ry="13" ${c('triceps')}/>
    <ellipse cx="23" cy="93" rx="7" ry="15" ${c('forearms')}/>
    <ellipse cx="97" cy="93" rx="7" ry="15" ${c('forearms')}/>
    <circle cx="21" cy="112" r="5" ${N}/>
    <circle cx="99" cy="112" r="5" ${N}/>
    <rect x="44" y="94" width="32" height="20" rx="9" ${c('glutes')}/>
    <rect x="45" y="116" width="13" height="42" rx="7" ${c('hamstrings')}/>
    <rect x="62" y="116" width="13" height="42" rx="7" ${c('hamstrings')}/>
    <rect x="46" y="161" width="11" height="32" rx="6" ${c('calves')}/>
    <rect x="63" y="161" width="11" height="32" rx="6" ${c('calves')}/>
    <rect x="44" y="196" width="14" height="7" rx="3" ${N}/>
    <rect x="62" y="196" width="14" height="7" rx="3" ${N}/>`;

  const names = [muscleLabel(primary)].concat([...secondary].map((s) => muscleLabel(s)).filter(Boolean));
  return `<svg class="mmap" viewBox="0 0 250 224" aria-hidden="true">
      <g transform="translate(0,4)">${front}</g>
      <g transform="translate(130,4)">${back}</g>
      <text x="60" y="222" text-anchor="middle">${esc(t('front'))}</text>
      <text x="190" y="222" text-anchor="middle">${esc(t('back_view'))}</text>
    </svg>
    <div class="legend"><span><i class="ink"></i>${esc(t('primary'))}: ${esc(names[0] || NA)}</span>
    ${names.length > 1 ? `<span><i class="ink2"></i>${esc(t('secondary'))}: ${esc(names.slice(1).join(', '))}</span>` : ''}</div>`;
}

function exHowTo(exId) {
  const info = EX_INFO[exId];
  if (!info) return '';
  return (S.settings.lang === 'ru' ? info.ru : info.en) || info.en || '';
}

function videoLink(exId) {
  const ex = exById(exId);
  const q = encodeURIComponent('how to ' + (ex.en || ex.name) + ' proper form');
  return `<a class="btn mt-3" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${q}">${esc(t('how_to'))}</a>`;
}

/* ============ SHEETS ============ */
function sheet(title, body) {
  const el = document.createElement('div');
  el.className = 'sheet';
  el.innerHTML = `<div class="inner" role="dialog" aria-modal="true"><div class="grabber"></div>
    <div class="sheethead"><h3>${esc(title || '')}</h3>
      <button class="hbtn" data-act="close-sheet" aria-label="${esc(t('close'))}">✕</button></div>
    <div class="sheet-body">${body}</div></div>`;
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
    if (q) list = list.filter((e) => exMatches(e, q));
    const mOrder = MUSCLES.map((m) => m.id);
    list.sort((a, b) => (mOrder.indexOf(a.m) - mOrder.indexOf(b.m)) || label(a).localeCompare(label(b)));
    const recent = [...new Set(S.workouts.slice(0, 12).flatMap((w) => w.entries.map((e) => e.exId)))].slice(0, 6);
    let h = '';
    if (!q && filter === 'all' && recent.length) {
      h += `<h2 class="mt-4">${esc(t('quick_add'))}</h2><div class="chips">`
        + recent.map((id) => `<button class="chip" data-pick="${id}">${esc(label(exById(id)))}</button>`).join('') + '</div>';
    }
    if (!list.length) return h + emptyState(t('empty_ex_t'), t('empty_ex_s'));
    h += '<div class="list mt-3">' + list.slice(0, 500).map((e) => `
      <button class="listrow" data-pick="${e.id}"><span class="grow"><span class="name">${esc(label(e))}</span>
      <span class="meta">${esc(muscleLabel(e.m))} · ${esc(equipLabel(e.eq))}</span></span>
      ${(S.settings.programWarnings && e.warn) ? '<span class="tag warn">!</span>' : ''}</button>`).join('') + '</div>';
    return h;
  };
  const el = sheet(t('add_exercise'), `
    <label class="search">${ICON_SEARCH}<input type="text" id="pick-q" placeholder="${esc(t('search_ex'))}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></label>
    <div class="chips mt-2" id="pick-chips">
      <button class="chip on" data-pf="all">${esc(t('all'))}</button>
      ${MUSCLES.map((m) => `<button class="chip" data-pf="${m.id}">${esc(label(m))}</button>`).join('')}
    </div>
    <div id="pick-list">${build('', 'all')}</div>
    <button class="btn mt-3" id="pick-new">+ ${esc(t('new_exercise'))}</button>`);
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
    <label class="field"><span>${esc(t('name'))} (EN)</span><input type="text" id="nx-en" value="${esc(ex.en || '')}"></label>
    <label class="field"><span>${esc(t('name'))} (RU)</span><input type="text" id="nx-ru" value="${esc(ex.ru || '')}"></label>
    <label class="field"><span>${esc(t('muscle'))}</span><select id="nx-m">${MUSCLES.map((m) => `<option value="${m.id}" ${ex.m === m.id ? 'selected' : ''}>${esc(label(m))}</option>`).join('')}</select></label>
    <label class="field"><span>${esc(t('equipment'))}</span><select id="nx-eq">${EQUIPMENT.map((q) => `<option value="${q.id}" ${ex.eq === q.id ? 'selected' : ''}>${esc(label(q))}</option>`).join('')}</select></label>
    <label class="field"><span>${esc(t('type'))}</span><select id="nx-kind">
      <option value="wr" ${ex.kind === 'wr' ? 'selected' : ''}>${esc(t('type_wr'))}</option>
      <option value="reps" ${ex.kind === 'reps' ? 'selected' : ''}>${esc(t('type_reps'))}</option>
      <option value="time" ${ex.kind === 'time' ? 'selected' : ''}>${esc(t('type_time'))}</option></select></label>
    <label class="field"><span>${esc(t('description'))}</span><textarea id="nx-desc" placeholder="${esc(t('note_ph'))}">${esc(ex.desc || '')}</textarea></label>
    <button class="btn-primary mt-2" id="nx-save">${esc(t('save'))}</button>
    <button class="btn quiet mt-2" id="nx-cancel">${esc(t('cancel'))}</button>`);
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
  const type = t(ex.kind === 'time' ? 'type_time' : ex.kind === 'reps' ? 'type_reps' : 'type_wr');
  let body = `<div class="metaline">${esc([muscleLabel(ex.m), equipLabel(ex.eq), type].join(' · '))}</div>`;
  if (S.settings.programWarnings && ex.warn) body += `<div class="note">${esc(t(ex.warn === 'back' ? 'warn_back' : 'warn_shoulder'))}</div>`;
  const how = exHowTo(id);
  if (how) body += `<p class="prose mt-3">${esc(how)}</p>`;
  if (ex.desc) body += `<div class="exnote">${esc(ex.desc)}</div>`;
  body += `<div class="mt-4">${muscleMap(id)}</div>`;
  body += videoLink(id);
  if (pr) {
    body += `<div class="kpis mt-4">
      ${ex.kind === 'time' ? kpi(fmtClock(pr.time), t('best_set')) : kpi(fmtNum(pr.weight, 2), t('best_set'), t('kg'))}
      ${ex.kind === 'wr' ? kpi(fmtNum(pr.e1rm, 1), t('est_1rm'), t('kg')) : kpi(pr.reps, t('reps'))}</div>`;
    body += `<h2 class="mt-5">${esc(t('history_for'))}</h2><div class="list">` + h.slice(-12).reverse().map((x) => `<div class="listrow">
      <div class="grow"><div class="meta">${esc(fmtDay(x.date, S.settings.lang))}</div>
      <div class="sub">${esc(x.sets.map((st) => setStr(st, ex.kind)).join(' · '))}</div></div></div>`).join('') + '</div>';
  } else {
    body += emptyState(t('no_history_ex'), t('empty_exhist_s'));
  }
  body += `<div class="btnrow mt-4">
    <button class="btn" data-act="edit-ex" data-v="${id}">${esc(t('edit'))}</button>
    <button class="btn danger" data-act="delete-ex" data-v="${id}">${esc(t('delete'))}</button></div>`;
  sheet(label(ex), body);
}

/* --- workout detail --- */
function openWorkout(id) {
  const w = S.workouts.find((x) => x.id === id);
  if (!w) return;
  const dur = workoutDuration(w);
  const parts = [fmtDate(w.startedAt, S.settings.lang), `${workoutSets(w)} ${t('sets_short')}`, `${workoutReps(w)} ${t('reps_total')}`, `${fmtInt(workoutVolume(w))} ${t('kg')}`];
  if (dur) parts.push(`${dur} ${t('min')}`);
  let body = `<div class="metaline">${esc(parts.join(' · '))}</div>`;
  if (w.notes) body += `<div class="exnote">${esc(w.notes)}</div>`;
  body += '<div class="list mt-3">' + w.entries.map((e) => {
    const ex = exById(e.exId);
    return `<div class="listrow"><div class="grow"><div class="name">${esc(label(ex))}</div>
      <div class="sub">${esc(e.sets.map((st) => setStr(st, ex.kind)).join(' · '))}</div>
      ${e.note ? `<div class="sub">${esc(e.note)}</div>` : ''}</div></div>`;
  }).join('') + '</div>';
  body += `<button class="btn-primary mt-4" data-act="repeat-workout" data-v="${id}">${esc(t('repeat'))}</button>
    <div class="btnrow mt-2">
      <button class="btn" data-act="tpl-from-workout" data-v="${id}">${esc(t('save_as_template'))}</button>
      <button class="btn" data-act="edit-workout" data-v="${id}">${esc(t('edit'))}</button></div>
    <button class="btn danger mt-2" data-act="delete-workout" data-v="${id}">${esc(t('delete'))}</button>`;
  sheet(w.name || fmtDay(w.startedAt, S.settings.lang), body);
}

/* --- template editor --- */
let tplDraft = null;

function openTemplateEditor(id) {
  const existing = id ? S.templates.find((x) => x.id === id) : null;
  tplDraft = existing ? clone(existing) : blankTemplate();
  const el = sheet(existing ? t('edit_template') : t('new_template'), '<div id="tpl-body"></div>');
  redrawTpl();
  return el;
}

function redrawTpl() {
  const box = document.getElementById('tpl-body');
  if (!box || !tplDraft) return;
  const items = tplDraft.items || [];
  const numField = (key, tf, i, val, ph) => `<label class="field"><span>${esc(t(key))}</span>
    <input type="text" inputmode="numeric" data-tf="${tf}" data-i="${i}" value="${val != null ? esc(val) : ''}" placeholder="${ph}"></label>`;
  box.innerHTML = `
    <label class="field"><span>${esc(t('template_name'))}</span>
      <input type="text" data-f="tplname" value="${esc(tplDraft.name || '')}" placeholder="Day C"></label>
    <h2 class="mt-4">${esc(t('tab_exercises'))}</h2>
    ${items.length ? '<div class="list">' + items.map((it, i) => `
      <div class="tplitem">
        <div class="top"><span class="nm">${esc(label(exById(it.exId)))}</span>
          <button class="ibtn" data-act="tpl-move" data-v="${i}" aria-label="${esc(t('move_up'))}"${i === 0 ? ' disabled' : ''}>${ICON_UP}</button>
          <button class="ibtn" data-act="tpl-del-item" data-v="${i}" aria-label="${esc(t('delete'))}">×</button></div>
        <div class="tplgrid">
          ${numField('sets_target', 'sets', i, it.sets, '3')}
          ${numField('reps_lo', 'lo', i, it.lo, '8')}
          ${numField('reps_hi', 'hi', i, it.hi, '12')}
        </div></div>`).join('') + '</div>' : emptyState(t('tpl_empty'), '', 'left')}
    <button class="btn mt-3" data-act="tpl-add-ex">+ ${esc(t('add_exercise'))}</button>
    <p class="prose mt-3">${esc(t('sets_target'))} / ${esc(t('rep_range'))} → ${esc(t('progression'))}</p>
    <button class="btn-primary mt-3" data-act="tpl-save">${esc(t('save'))}</button>
    ${S.templates.some((x) => x.id === tplDraft.id) ? `<button class="btn danger mt-2" data-act="tpl-delete">${esc(t('delete'))}</button>` : ''}`;
}

/* --- plate calculator --- */
function openPlates(preset) {
  const el = sheet(t('plate_calc'), `
    <label class="field"><span>${esc(t('target_weight'))}, ${esc(t('kg'))}</span>
      <input type="text" inputmode="decimal" class="numin" id="pl-w" value="${preset || ''}"></label>
    <div id="pl-out"></div>
    <div class="metaline mt-4">${esc(t('bar_weight'))}: ${esc(fmtNum(num(S.settings.barWeight), 2))} ${esc(t('kg'))}</div>`);
  const out = el.querySelector('#pl-out'), inp = el.querySelector('#pl-w');
  const calc = () => {
    const target = num(inp.value);
    if (!target) { out.innerHTML = ''; return; }
    const r = platesFor(target, num(S.settings.barWeight), S.settings.plates);
    const counts = {};
    r.list.forEach((p) => { counts[p] = (counts[p] || 0) + 1; });
    const plates = Object.keys(counts).sort((a, b) => b - a).map((p) => `<span class="plate">${esc(fmtNum(+p, 2))} <span class="x">×</span> ${counts[p]}</span>`).join('');
    out.innerHTML = `<h2 class="mt-4">${esc(t('plates_per_side'))}</h2>
      <div class="row wrap">${plates || `<span class="dim">${NA}</span>`}</div>
      ${!r.ok ? `<div class="note">${esc(t('plates_left', { n: fmtNum(r.left * 2, 2) }))}</div>` : ''}`;
  };
  inp.addEventListener('input', calc); calc();
}

/* --- settings --- */
function settingsBody() {
  const dsb = daysSinceBackup();
  const lang = S.settings.lang, theme = S.settings.theme;
  const wStep = num(S.settings.wStep) || 1;
  const sw = (k, lbl) => `<button class="prefrow" data-act="toggle" data-v="${k}" role="switch" aria-checked="${S.settings[k] ? 'true' : 'false'}">
    <span class="lbl">${esc(lbl)}</span><span class="sw ${S.settings[k] ? 'on' : ''}"></span></button>`;
  const seg = (act, val, on, text) => `<button class="chip ${on ? 'on' : ''}" data-act="${act}" data-v="${val}">${esc(text)}</button>`;
  const numRow = (lbl, f, val, unit, mode) => `<label class="prefrow"><span class="lbl">${esc(lbl)}</span>
    <input type="text" inputmode="${mode}" class="numin" data-f="${f}" value="${esc(val)}"><span class="unit">${esc(unit)}</span></label>`;
  const hidden = (S.hiddenExercises || []).map((id) => SEED_EXERCISES.find((e) => e.id === id)).filter(Boolean);

  return `
    <div class="list">
      <button class="listrow" data-act="tab" data-v="stats">
        <span class="grow"><span class="name">${esc(t('tab_stats'))}</span><span class="meta">${esc(t('open_stats'))}</span></span>
        <span class="chev" aria-hidden="true">›</span></button>
      <button class="listrow" data-act="tab" data-v="body">
        <span class="grow"><span class="name">${esc(t('tab_body'))}</span><span class="meta">${esc(t('open_body'))}</span></span>
        <span class="chev" aria-hidden="true">›</span></button>
    </div>
    <div class="list mt-5">
      <div class="prefrow"><span class="lbl">${esc(t('lang'))}</span><div class="seg">${seg('lang', 'en', lang === 'en', 'EN')}${seg('lang', 'ru', lang === 'ru', 'RU')}</div></div>
      <div class="prefrow"><span class="lbl">${esc(t('theme'))}</span><div class="seg">${seg('theme', 'dark', theme !== 'light', t('dark'))}${seg('theme', 'light', theme === 'light', t('light'))}</div></div>
    </div>
    <h2 class="mt-5">${esc(t('tab_workout'))}</h2>
    <div class="list">
      ${sw('restTimer', t('rest_timer'))}
      ${numRow(t('rest_default'), 'restsec', num(S.settings.restDefault), t('unit_sec'), 'numeric')}
      ${sw('vibrate', t('vibrate'))}
      ${sw('progressionHints', t('progression'))}
      ${sw('plateCalc', t('plate_calc'))}
      ${sw('programWarnings', t('program_warn'))}
      ${numRow(t('bar_weight'), 'barw', num(S.settings.barWeight), t('kg'), 'decimal')}
      <div class="prefrow"><span class="lbl">${esc(t('w_step'))}, ${esc(t('kg'))}</span><div class="seg">${seg('wstep', '0.5', wStep === 0.5, '0.5')}${seg('wstep', '1', wStep === 1, '1')}</div></div>
      <div class="prefrow"><span class="lbl">${esc(t('start_w'))} / ${esc(t('goal'))}, ${esc(t('kg'))}</span>
        <input type="text" inputmode="decimal" class="numin" data-f="startw" value="${num(S.settings.startWeight)}" aria-label="${esc(t('start_w'))}">
        <input type="text" inputmode="decimal" class="numin" data-f="goalw" value="${num(S.settings.goalWeight)}" aria-label="${esc(t('goal'))}"></div>
    </div>
    ${h2row(t('templates'), `<button class="btn sm quiet" data-act="new-tpl">+ ${esc(t('new'))}</button>`)}
    <div class="list">${S.templates.map((tp) => `<div class="listrow tight">
      <button class="rowbtn" data-act="edit-tpl" data-v="${tp.id}"><span class="grow"><span class="name">${esc(label(tp) || tp.name)}</span>
        <span class="meta">${esc(tn('exn', (tp.items || []).length))}</span></span><span class="chev" aria-hidden="true">›</span></button>
      <button class="ibtn" data-act="del-tpl" data-v="${tp.id}" aria-label="${esc(t('delete'))}">×</button></div>`).join('') || emptyState(t('empty_tpl_t'), t('empty_tpl_s'), 'left')}</div>
    ${hidden.length ? `<h2 class="mt-5">${esc(t('hidden_ex'))}</h2><div class="list">${hidden.map((e) => `<div class="listrow">
      <span class="grow"><span class="name">${esc(label(e))}</span><span class="meta">${esc(muscleLabel(e.m))} · ${esc(equipLabel(e.eq))}</span></span>
      <button class="btn sm" data-act="restore-ex" data-v="${e.id}">${esc(t('restore'))}</button></div>`).join('')}</div>` : ''}
    <h2 class="mt-5">${esc(t('data'))}</h2>
    <div class="metaline">${esc(t('last_backup'))}: ${dsb === null ? esc(t('never')) : (dsb === 0 ? esc(t('today')) : dsb + esc(t('days_ago')))}</div>
    <button class="btn mt-3" data-act="export">${esc(t('export'))}</button>
    <button class="btn mt-2" data-act="import">${esc(t('import'))}</button>
    <button class="btn danger mt-2" data-act="wipe">${esc(t('wipe'))}</button>
    <div class="foot">${esc(t('version'))}</div>`;
}
function openSettings() {
  const el = sheet(t('settings'), settingsBody());
  el.dataset.sheet = 'settings';
}
/* rebuild the open settings sheet in place: keeps its scroll position, no re-animation */
function refreshSettings() {
  const el = document.querySelector('.sheet[data-sheet="settings"]');
  if (!el) return;
  el.querySelector('.sheethead h3').textContent = t('settings');
  el.querySelector('.sheet-body').innerHTML = settingsBody();
}

/* --- the workout's own menu: everything the logger no longer shows --- */
function openSessionMenu() {
  const w = S.active;
  if (!w) return;
  const ei = currentEntryIndex(w);
  const ex = ei >= 0 ? exById(w.entries[ei].exId) : null;
  const el = sheet(t('session_menu'), `
    <button class="btn-primary" data-act="finish">${esc(t('finish_workout'))}</button>
    <button class="btn mt-3" data-act="pick-ex">+ ${esc(t('add_exercise'))}</button>
    ${ei >= 0 ? `<button class="btn mt-2" data-act="ex-menu" data-v="${ei}">${esc(t('exercise_options'))}</button>` : ''}
    ${(ex && S.settings.plateCalc && ex.eq === 'barbell') ? `<button class="btn mt-2" data-act="plates" data-v="${ei}">${esc(t('plate_calc'))}</button>` : ''}
    <label class="field mt-4"><span>${esc(t('workout_name'))}</span>
      <input type="text" data-f="wname" value="${esc(w.name)}" placeholder="${esc(t('workout_name'))}"></label>
    <label class="field"><span>${esc(t('notes'))}</span>
      <textarea data-f="wnotes" placeholder="${esc(t('note_ph'))}">${esc(w.notes)}</textarea></label>
    <button class="btn quiet" data-act="tpl-from-active">${esc(t('save_as_template'))}</button>
    <button class="btn quiet mt-2" data-act="settings">${esc(t('settings'))}</button>
    ${w.editing ? '' : `<button class="btn danger mt-4" data-act="discard">${esc(t('discard_workout'))}</button>`}`);
  el.dataset.sheet = 'session';
}

/* --- jump between the session's exercises --- */
function openJump() {
  const w = S.active;
  if (!w) return;
  const cur = currentEntryIndex(w);
  const rows = w.entries.map((e, i) => {
    const done = e.sets.filter((x) => x.done).length;
    return `<button class="listrow" data-act="focus-entry" data-e="${i}">
      <span class="grow"><span class="name">${esc(label(exById(e.exId)))}</span>
      <span class="meta">${esc(t('sets_of', { n: done, m: e.sets.length }))}</span></span>
      <span class="chev" aria-hidden="true">${i === cur ? '•' : '›'}</span></button>`;
  }).join('');
  sheet(t('switch_ex'), `<div class="list">${rows}</div>
    <button class="btn mt-3" data-act="pick-ex">+ ${esc(t('add_exercise'))}</button>`);
}

/* --- muscle group filter for the Exercises list --- */
function openGroups() {
  const chip = (id, text) => `<button class="chip ${ui.exFilter === id ? 'on' : ''}" data-act="exfilter" data-v="${id}">${esc(text)}</button>`;
  sheet(t('group'), `<div class="chips">${chip('all', t('all'))}${MUSCLES.map((m) => chip(m.id, label(m))).join('')}</div>`);
}

/* --- set menu (long-press a set) --- */
function openSetMenu(ei, si) {
  const entry = S.active && S.active.entries[ei];
  const st = entry && entry.sets[si];
  if (!st) return;
  const ex = exById(entry.exId);
  sheet(`${label(ex)} · ${t('set_n', { n: si + 1 })}`, `
    <div class="metaline">${esc(setStr(st, ex.kind || 'wr'))}</div>
    <button class="btn mt-4" data-act="warm" data-e="${ei}" data-s="${si}">${esc(t(st.warm ? 'mark_working' : 'mark_warm'))}</button>
    ${st.done ? `<button class="btn mt-2" data-act="tick" data-e="${ei}" data-s="${si}">${esc(t('edit_set'))}</button>` : ''}
    <button class="btn danger mt-2" data-act="del-set" data-e="${ei}" data-s="${si}">${esc(t('delete_set'))}</button>`);
}

/* --- exercise menu --- */
function openEntryMenu(ei) {
  const e = S.active.entries[ei];
  const ex = exById(e.exId);
  const el = sheet(label(ex), `
    <label class="field"><span>${esc(t('notes'))}</span><input type="text" id="em-note" value="${esc(e.note || '')}" placeholder="${esc(t('note_ph'))}"></label>
    <button class="btn" id="em-info">${esc(t('info'))}</button>
    <div class="btnrow mt-2">
      <button class="btn" id="em-up">↑ ${esc(t('move_up'))}</button>
      <button class="btn" id="em-down">↓ ${esc(t('move_down'))}</button>
    </div>
    <button class="btn danger mt-4" id="em-del">${esc(t('delete'))}</button>`);
  el.querySelector('#em-note').addEventListener('input', (ev2) => { e.note = ev2.target.value; save(); });
  const move = (d) => {
    const j = ei + d; if (j < 0 || j >= S.active.entries.length) return;
    const arr = S.active.entries; [arr[ei], arr[j]] = [arr[j], arr[ei]];
    ui.curEntry = null; save(); closeSheet(); render();
  };
  el.querySelector('#em-info').addEventListener('click', () => { closeSheet(); openExercise(e.exId); });
  el.querySelector('#em-up').addEventListener('click', () => move(-1));
  el.querySelector('#em-down').addEventListener('click', () => move(1));
  el.querySelector('#em-del').addEventListener('click', () => {
    if (!confirm(t('confirm_delete'))) return;
    S.active.entries.splice(ei, 1); ui.curEntry = null; save(); closeSheet(); render();
  });
}

/* ============ REST TIMER ============ */
function startRest(sec) {
  if (!S.settings.restTimer) return;
  rest.total = sec; rest.endsAt = Date.now() + sec * 1000;
  if (rest.iv) clearInterval(rest.iv);
  rest.iv = setInterval(tickRest, 250);
  try { if (!audioCtx && window.AudioContext) audioCtx = new AudioContext(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {}
  restChrome();
}
/* the countdown is patched in place, never re-rendered: a render every 250 ms
   would kill the keyboard and the caret */
function tickRest() {
  if (!rest.endsAt) return;
  if (Date.now() >= rest.endsAt) { endRest(true); return; }
  const txt = fmtClock(Math.max(0, (rest.endsAt - Date.now()) / 1000));
  const panel = document.querySelector('#app .rest .t');
  if (panel) panel.textContent = txt;
  const bar = document.querySelector('#restbar .t');
  if (bar) bar.textContent = txt;
  if (!panel && !bar) restChrome();
}
function endRest(notify) {
  if (rest.iv) clearInterval(rest.iv);
  rest.iv = null; rest.endsAt = 0;
  if (notify && S.settings.vibrate) {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    beep();
  }
  restChrome();
}
/* on the logger the rest state is the whole screen, so it needs a render;
   everywhere else it is the thin bar above the tabs */
function restChrome() {
  if (route === 'log' && S.active) {
    render();
    const m = $('#app'); if (m) m.scrollTop = 0;
  } else renderRestBar();
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
  const show = rest.endsAt && !(route === 'log' && S.active);
  if (!show) { if (old) { old.remove(); syncNavOverlap(); } return; }
  if (old) return;
  const left = Math.max(0, (rest.endsAt - Date.now()) / 1000);
  const el = document.createElement('div'); el.id = 'restbar'; el.setAttribute('role', 'timer');
  el.innerHTML = `<span class="lbl">${esc(t('rest'))}</span><span class="t">${fmtClock(left)}</span><span class="spacer"></span>
    <button data-act="rest-add">${esc(t('add30'))}</button>
    <button data-act="rest-skip">${esc(t('skip'))}</button>`;
  $('#shell').insertBefore(el, $('#nav'));
  syncNavOverlap();
}

/* ============ STEPPER ============ */
/* A step writes state, saves and patches that one input. It never calls render():
   render() would destroy the input mid-hold and focus would die. */
function applyStep(ei, si, fld, dir) {
  const entry = S.active && S.active.entries[ei];
  const set = entry && entry.sets[si];
  if (!set) { stopHold(); return; }
  const ex = exById(entry.exId);
  const step = stepFor(ex, fld);
  const input = document.querySelector(`input[data-e="${ei}"][data-s="${si}"][data-fld="${fld}"]`);
  const base = hasVal(set[fld]) ? num(set[fld]) : (input ? num(input.value) : 0);
  let v = base + dir * step;
  if (v < 0) v = 0;
  set[fld] = String(+v.toFixed(2));
  save();
  if (input) input.value = set[fld];
}

function startHold(ev, btn) {
  ev.preventDefault();
  stopHold();
  const ei = +btn.dataset.e, si = +btn.dataset.s, fld = btn.dataset.fld, dir = btn.dataset.dir === 'up' ? 1 : -1;
  hold = { btn, ei, si, fld, dir, timer: null, iv: null, n: 0 };
  btn.classList.add('held');
  applyStep(ei, si, fld, dir);
  /* holding repeats the same step as a tap, at an even pace you can stop on */
  hold.timer = setTimeout(() => {
    if (!hold) return;
    hold.iv = setInterval(() => {
      if (!hold) return;
      applyStep(hold.ei, hold.si, hold.fld, hold.dir);
      if (++hold.n > 200) stopHold();
    }, 300);
  }, 500);
}
function stopHold() {
  if (!hold) return;
  clearTimeout(hold.timer); clearInterval(hold.iv);
  hold.btn.classList.remove('held');
  hold = null;
}

/* ============ SWIPE TO DELETE + LONG-PRESS ============ */
/* Rows carry touch-action: pan-y, so vertical scrolling stays with the browser.
   The axis locks on the first 6px: a vertical start abandons the gesture for good. */
function onPointerDown(ev) {
  if (ev.button > 0) return;
  const stepBtn = ev.target.closest('[data-act="step"]');
  if (stepBtn) { startHold(ev, stepBtn); return; }
  if (route !== 'log' || !S.active || ev.target.closest('.sheet')) return;
  const row = ev.target.closest('.setline[data-s], .setlive .head');
  if (!row) return;
  gest = { row, isHead: row.classList.contains('head'), pid: ev.pointerId, x0: ev.clientX, y0: ev.clientY, axis: null, dx: 0 };
  gest.lp = setTimeout(() => onLongPress(row), LONG_MS);
}
function onPointerMove(ev) {
  if (!gest || ev.pointerId !== gest.pid) return;
  const dx = ev.clientX - gest.x0, dy = ev.clientY - gest.y0;
  if (gest.axis === null) {
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
    clearTimeout(gest.lp);
    if (gest.isHead || Math.abs(dx) <= Math.abs(dy)) { gest = null; return; }
    gest.axis = 'x';
    gest.row.classList.remove('settle');
    gest.row.classList.add('dragging');
    try { gest.row.setPointerCapture(ev.pointerId); } catch (e) {}
  }
  gest.dx = Math.min(0, dx);
  gest.row.style.transform = `translateX(${gest.dx}px)`;
  gest.row.style.opacity = String(1 - Math.min(0.6, Math.abs(gest.dx) / 200));
}
function onPointerEnd(ev) {
  stopHold();
  if (!gest || ev.pointerId !== gest.pid) return;
  clearTimeout(gest.lp);
  const g = gest; gest = null;
  if (g.axis !== 'x') return;
  suppressClickUntil = Date.now() + 350;
  const row = g.row;
  row.classList.remove('dragging');
  if (ev.type === 'pointerup' && Math.abs(g.dx) >= SWIPE_MIN) {
    softDeleteSet(+row.dataset.e, +row.dataset.s);
  } else {
    row.classList.add('settle');
    row.style.transform = ''; row.style.opacity = '';
  }
}
function onLongPress(row) {
  if (!gest || gest.row !== row) return;
  gest = null;
  suppressClickUntil = Date.now() + 700;
  try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {}
  commitDelete();
  openSetMenu(+row.dataset.e, +row.dataset.s);
}

/* Soft delete: the set leaves the list at once and an undo strip takes its place.
   Nothing is written to storage until the 6 s timer commits it. */
function softDeleteSet(ei, si) {
  commitDelete();
  const entry = S.active && S.active.entries[ei];
  if (!entry || !entry.sets[si]) return;
  const set = entry.sets.splice(si, 1)[0];
  pendingDelete = { entryRef: entry, si, set, timer: setTimeout(expireDelete, 6000) };
  render();
}
function undoDelete() {
  if (!pendingDelete) return;
  clearTimeout(pendingDelete.timer);
  const { entryRef, si, set } = pendingDelete;
  pendingDelete = null;
  entryRef.sets.splice(Math.min(si, entryRef.sets.length), 0, set);
  save(); render();
}
function commitDelete() {
  if (!pendingDelete) return false;
  clearTimeout(pendingDelete.timer);
  pendingDelete = null;
  save();
  document.querySelectorAll('#app .undo').forEach((x) => x.remove());
  return true;
}
/* the timer only removes the strip; a full render here could steal focus from an input */
function expireDelete() { commitDelete(); }

/* ============ EVENTS ============ */
function onFocusIn(ev) {
  const el = ev.target;
  if (el.tagName !== 'INPUT') return;
  const mode = el.getAttribute('inputmode');
  if (mode !== 'decimal' && mode !== 'numeric') return;
  requestAnimationFrame(() => { try { el.setSelectionRange(0, el.value.length); el.select(); } catch (e) {} });
}

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
    case 'wname':
      if (S.active) {
        S.active.name = el.value; save();
        if (route === 'log') $('#title').textContent = el.value || t('in_progress');
      }
      break;
    case 'wnotes': if (S.active) { S.active.notes = el.value; save(); } break;
    case 'exsearch':
      if (ev.type !== 'input') break;
      ui.exSearch = el.value; render();
      { const m = $('#app'); if (m) m.scrollTop = 0; }
      break;
    case 'statsex': if (ui.statsEx !== el.value) { ui.statsEx = el.value; render(); } break;
    case 'restsec': S.settings.restDefault = num(el.value) || 120; save(); break;
    case 'barw': S.settings.barWeight = num(el.value) || 20; save(); break;
    case 'startw': S.settings.startWeight = num(el.value) || 0; save(); break;
    case 'goalw': S.settings.goalWeight = num(el.value) || 0; save(); break;
  }
}

function closeSheetIfIn(b) { if (b.closest('.sheet')) closeSheet(); }

function revealLiveSet() {
  const lb = document.querySelector('#app .setlive');
  const m = $('#app');
  if (!lb || !m) return;
  const r = lb.getBoundingClientRect(), mr = m.getBoundingClientRect();
  if (r.top < mr.top || r.bottom > mr.bottom) lb.scrollIntoView({ block: r.height > mr.height ? 'start' : 'nearest', behavior: 'smooth' });
}

function onClick(ev) {
  const b = ev.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act, v = b.dataset.v;
  const ei = b.dataset.e !== undefined ? +b.dataset.e : null;
  const si = b.dataset.s !== undefined ? +b.dataset.s : null;
  if (act !== 'undo-set' && act !== 'del-set' && act !== 'step') commitDelete();

  switch (act) {
    /* the Workout tab goes straight back to the session while one is running */
    case 'tab': closeAllSheets(); go(v === 'home' && S.active ? 'log' : v); break;
    case 'close-sheet': closeSheet(); break;

    /* home */
    case 'start-empty': startWorkout(null); ui.curEntry = null; go('log'); break;
    case 'start-tpl': closeAllSheets(); startWorkout(v); ui.curEntry = null; go('log'); break;
    case 'all-tpl': openTemplates(); break;
    case 'resume': go('log'); break;
    case 'settings': closeAllSheets(); openSettings(); break;
    case 'ex-groups': openGroups(); break;

    /* workout editing */
    case 'more': openSessionMenu(); break;
    case 'jump': openJump(); break;
    case 'pick-ex': if (b.closest('.sheet')) closeAllSheets(); openPicker((exId) => {
      S.active.entries.push({ exId, note: '', target: null, sets: [{ w: '', r: '', done: false }] });
      ui.curEntry = S.active.entries.length - 1;
      save(); render();
      const blk = document.querySelector(`[data-entry="${ui.curEntry}"]`);
      if (blk) blk.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }); break;
    case 'add-set': {
      const e = S.active.entries[+v];
      const last = e.sets[e.sets.length - 1];
      e.sets.push(last ? { w: last.w, r: last.r, s: last.s, done: false } : { w: '', r: '', done: false });
      ui.curEntry = +v;
      save(); render(); revealLiveSet(); break;
    }
    case 'focus-entry': {
      closeSheetIfIn(b);
      ui.curEntry = ei;
      const m = $('#app'); if (m) m.scrollTop = 0;
      render();
      break;
    }
    case 'step': break;
    case 'undo-set': undoDelete(); break;
    case 'del-set':
      closeSheetIfIn(b);
      if (b.closest('.undo')) { commitDelete(); render(); }
      else softDeleteSet(ei, si);
      break;
    case 'warm': {
      closeSheetIfIn(b);
      const st = S.active.entries[ei] && S.active.entries[ei].sets[si];
      if (!st) break;
      if (st.warm) delete st.warm; else st.warm = true;
      save(); render(); break;
    }
    case 'tick': {
      closeSheetIfIn(b);
      const entry = S.active.entries[ei];
      const st = entry && entry.sets[si];
      if (!st) break;
      if (!st.done) {
        let missing = null;
        ['w', 'r', 's'].forEach((f) => {
          const inp = document.querySelector(`#app input[data-e="${ei}"][data-s="${si}"][data-fld="${f}"]`);
          if (inp) st[f] = inp.value;
        });
        const kind = exById(entry.exId).kind || 'wr';
        const need = kind === 'time' ? 's' : 'r';
        if (num(st[need]) <= 0) missing = document.querySelector(`#app input[data-e="${ei}"][data-s="${si}"][data-fld="${need}"]`);
        if (missing) { save(); missing.focus(); break; }
        st.done = true;
        /* the last set of an exercise hands the screen to the next one */
        ui.curEntry = liveSetIndex(entry) < 0 ? null : ei;
        save(); render(); revealLiveSet();
        startRest(num(S.settings.restDefault) || 120);
      } else {
        st.done = false;
        ui.curEntry = ei;
        save(); render(); revealLiveSet();
      }
      break;
    }
    case 'ex-menu': closeSheetIfIn(b); openEntryMenu(+v); break;
    case 'plates': {
      closeSheetIfIn(b);
      const e = S.active.entries[+v];
      const last = e.sets.filter((s2) => num(s2.w) > 0).pop();
      openPlates(last ? num(last.w) : '');
      break;
    }
    case 'finish': {
      if (activeSetCount() === 0) { alert(t('empty_workout')); break; }
      if (!confirm(t('finish_confirm'))) break;
      closeAllSheets();
      const w = S.active;
      if (w.editing) {
        w.editing = false; w.endedAt = w.endedAt || new Date().toISOString();
        w.entries = w.entries.filter((e) => e.sets.length);
        S.workouts.push(w); S.workouts.sort((a, b2) => new Date(b2.startedAt) - new Date(a.startedAt));
        S.active = null; save();
      } else finishWorkout();
      ui.curEntry = null; endRest(false); go('history'); break;
    }
    case 'discard': if (confirm(t('discard_confirm'))) { closeAllSheets(); discardWorkout(); ui.curEntry = null; endRest(false); go('home'); } break;

    /* history */
    case 'open-workout': openWorkout(v); break;
    case 'delete-workout': if (confirm(t('confirm_delete'))) { deleteWorkout(v); closeSheet(); render(); } break;
    case 'repeat-workout': {
      const w = S.workouts.find((x) => x.id === v);
      if (!w) break;
      if (S.active && !confirm(t('discard_confirm'))) break;
      const nw = newWorkout(w.name, w.templateId);
      nw.entries = w.entries.map((e) => ({ exId: e.exId, note: e.note, target: e.target || null, sets: e.sets.map((st) => ({ w: st.w, r: st.r, s: st.s, done: false })) }));
      S.active = nw; ui.curEntry = null; save(); closeSheet(); go('log'); break;
    }
    case 'edit-workout': {
      const i = S.workouts.findIndex((x) => x.id === v);
      if (i < 0) break;
      if (S.active && !confirm(t('discard_confirm'))) break;
      const w = S.workouts.splice(i, 1)[0];
      w.editing = true; S.active = w; ui.curEntry = null; save(); closeSheet(); go('log'); break;
    }
    case 'tpl-from-workout': {
      const w = S.workouts.find((x) => x.id === v);
      const name = prompt(t('template_name'), w.name || fmtDay(w.startedAt, S.settings.lang));
      if (name) { saveTemplateFromWorkout(w, name); closeSheet(); render(); }
      break;
    }

    /* exercises */
    case 'exfilter': closeSheetIfIn(b); ui.exFilter = v; render(); { const m = $('#app'); if (m) m.scrollTop = 0; } break;
    case 'open-ex': openExercise(v); break;
    case 'new-ex': openNewExercise(); break;
    case 'edit-ex': { const ex = exById(v); closeSheet(); openNewExercise(null, ex); break; }
    case 'delete-ex': if (confirm(t('confirm_delete'))) { deleteExercise(v); closeSheet(); render(); } break;

    /* body */
    case 'toggle-meas': {
      ui.showMeas = !ui.showMeas;
      const g = $('#meas'); if (g) g.hidden = !ui.showMeas;
      const pm = b.querySelector('.pm'); if (pm) pm.textContent = ui.showMeas ? '−' : '+';
      b.setAttribute('aria-expanded', String(ui.showMeas));
      break;
    }
    case 'save-body': {
      const g = (k) => { const el2 = document.querySelector(`[data-f="${k}"]`); return el2 ? el2.value : ''; };
      const w = num(g('bweight'));
      const entry = { date: g('bdate') || ymd(new Date()) };
      if (w > 0) entry.weight = w;
      MEAS.forEach((k) => { const val = num(g('b_' + k)); if (val > 0) entry[k] = val; });
      if (!entry.weight && Object.keys(entry).length === 1) break;
      addBodyEntry(entry); render(); break;
    }
    case 'del-body': if (confirm(t('confirm_delete'))) { deleteBodyEntry(v); render(); } break;

    /* settings */
    case 'toggle': S.settings[v] = !S.settings[v]; save(); refreshSettings(); render(); break;
    case 'lang': S.settings.lang = v; save(); render(); refreshSettings(); break;
    case 'theme': S.settings.theme = v; applyTheme(); save(); refreshSettings(); break;
    case 'wstep': S.settings.wStep = num(v); save(); refreshSettings(); render(); break;
    case 'restore-ex': restoreExercise(v); refreshSettings(); render(); break;
    case 'del-tpl': if (confirm(t('confirm_delete'))) { deleteTemplate(v); refreshSettings(); render(); } break;

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
      if (i > 0) { const a = tplDraft.items; [a[i - 1], a[i]] = [a[i], a[i - 1]]; redrawTpl(); }
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
    case 'rest-add': rest.endsAt += 30000; tickRest(); break;
    case 'rest-skip': endRest(false); break;
  }
}

/* ============ backup ============ */
function doExport() {
  const data = exportData();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `freilift-backup-${ymd(new Date())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  refreshSettings();
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
        applyTheme();
        alert(t('imported')); closeAllSheets(); go('home');
      } catch (e) { alert(t('import_failed')); }
    };
    r.readAsText(f);
  });
  inp.click();
}
