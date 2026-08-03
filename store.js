/* GymLog — state, persistence, computations */

const KEY = 'gymlog.v1';
const SCHEMA = 1;

const DEFAULT_SETTINGS = {
  lang: 'en',
  theme: 'dark',
  restTimer: true,
  restDefault: 120,
  vibrate: true,
  progressionHints: true,
  plateCalc: true,
  programWarnings: true,
  barWeight: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  goalWeight: 75,
  startWeight: 65,
};

let S = null;

/* ---------- utils ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clone = (o) => JSON.parse(JSON.stringify(o));
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };

function ymd(d) {
  const x = (d instanceof Date) ? d : new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function daysBetween(a, b) { return Math.round((parseYmd(ymd(b)) - parseYmd(ymd(a))) / 86400000); }
function startOfWeek(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - dow);
  return x;
}
function weekKey(d) { return ymd(startOfWeek(d)); }

function fmtNum(n, dp = 1) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  const r = Math.round(n * Math.pow(10, dp)) / Math.pow(10, dp);
  return String(r).replace(/\.0+$/, '');
}
function fmtDate(iso, lang) {
  const d = new Date(iso);
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDay(iso, lang) {
  const d = new Date(iso);
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtClock(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* ---------- i18n ---------- */
function t(key, vars) {
  const lang = (S && S.settings.lang) || 'en';
  let s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
  if (vars) for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
  return s;
}
function label(obj) {
  const lang = (S && S.settings.lang) || 'en';
  if (!obj) return '';
  return (lang === 'ru' ? (obj.ru || obj.name_ru) : (obj.en || obj.name)) || obj.name || obj.en || '';
}

/* ---------- persistence ---------- */
function blankState() {
  return {
    schema: SCHEMA,
    settings: clone(DEFAULT_SETTINGS),
    customExercises: [],
    hiddenExercises: [],
    exerciseOverrides: {},   // id -> {desc}
    templates: clone(SEED_TEMPLATES),
    workouts: [],
    body: [],
    active: null,
    lastBackup: null,
    createdAt: new Date().toISOString(),
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) { S = blankState(); save(); return S; }
    const parsed = JSON.parse(raw);
    S = Object.assign(blankState(), parsed);
    S.settings = Object.assign(clone(DEFAULT_SETTINGS), parsed.settings || {});
    // make sure seeded templates exist (unless user deleted them intentionally -> keep as is if any templates present)
    if (!Array.isArray(S.templates)) S.templates = clone(SEED_TEMPLATES);
  } catch (e) {
    console.error('load failed', e);
    S = blankState();
  }
  return S;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { console.error('save failed', e); alert('Storage full or unavailable — export a backup.'); }
}

/* ---------- exercises ---------- */
function allExercises() {
  const hidden = new Set(S.hiddenExercises || []);
  const seeds = SEED_EXERCISES.filter((e) => !hidden.has(e.id)).map((e) => {
    const ov = (S.exerciseOverrides || {})[e.id] || {};
    return Object.assign({}, e, ov);
  });
  return seeds.concat(S.customExercises || []);
}
let _exMap = null, _exMapStamp = 0;
function exById(id) {
  if (!_exMap || _exMapStamp !== (S.customExercises.length + (S.hiddenExercises || []).length)) {
    _exMap = {}; _exMapStamp = S.customExercises.length + (S.hiddenExercises || []).length;
    allExercises().forEach((e) => { _exMap[e.id] = e; });
  }
  return _exMap[id] || allExercises().find((e) => e.id === id) || { id, en: id, ru: id, m: 'other', eq: 'other', kind: 'wr' };
}
function invalidateEx() { _exMap = null; _exMapStamp = -1; }

function addCustomExercise({ name, name_ru, m, eq, kind, desc }) {
  const ex = { id: 'c-' + uid(), en: name, ru: name_ru || name, m, eq, kind: kind || 'wr', desc: desc || '', custom: true };
  S.customExercises.push(ex); invalidateEx(); save();
  return ex;
}
function updateExercise(id, patch) {
  const c = S.customExercises.find((e) => e.id === id);
  if (c) Object.assign(c, patch);
  else { S.exerciseOverrides = S.exerciseOverrides || {}; S.exerciseOverrides[id] = Object.assign({}, S.exerciseOverrides[id], patch); }
  invalidateEx(); save();
}
function deleteExercise(id) {
  const i = S.customExercises.findIndex((e) => e.id === id);
  if (i >= 0) S.customExercises.splice(i, 1);
  else { S.hiddenExercises = S.hiddenExercises || []; if (!S.hiddenExercises.includes(id)) S.hiddenExercises.push(id); }
  invalidateEx(); save();
}

/* ---------- workout ---------- */
function newWorkout(name, templateId) {
  return {
    id: uid(),
    name: name || '',
    templateId: templateId || null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    notes: '',
    entries: [],
  };
}
function startWorkout(templateId) {
  let w;
  if (templateId) {
    const tpl = S.templates.find((x) => x.id === templateId);
    w = newWorkout(label(tpl) || tpl.name, templateId);
    (tpl.items || []).forEach((it) => {
      const n = Math.max(1, Math.min(10, it.sets || 3));
      const sets = [];
      for (let i = 0; i < n; i++) sets.push({ w: '', r: '', done: false });
      w.entries.push({ exId: it.exId, note: it.note || '', target: { sets: it.sets, lo: it.lo, hi: it.hi }, sets });
    });
  } else {
    w = newWorkout('');
  }
  S.active = w; save();
  return w;
}
function finishWorkout() {
  const w = S.active;
  if (!w) return null;
  w.endedAt = new Date().toISOString();
  w.entries = w.entries.filter((e) => e.sets.length > 0);
  S.workouts.unshift(w);
  S.workouts.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  S.active = null; save();
  return w;
}
function discardWorkout() { S.active = null; save(); }
function deleteWorkout(id) {
  const i = S.workouts.findIndex((w) => w.id === id);
  if (i >= 0) { S.workouts.splice(i, 1); save(); }
}

function activeSetCount() {
  if (!S.active) return 0;
  return S.active.entries.reduce((n, e) => n + e.sets.length, 0);
}

/* last performance of an exercise, excluding a given workout id */
function lastPerformance(exId, excludeId) {
  for (const w of S.workouts) {
    if (w.id === excludeId) continue;
    const e = w.entries.find((x) => x.exId === exId && x.sets.length);
    if (e) return { workout: w, entry: e };
  }
  return null;
}

/* ---------- math ---------- */
const est1RM = (w, r) => (w > 0 && r > 0) ? w * (1 + r / 30) : 0;

function setVolume(st, kind) {
  if (kind === 'time') return 0;
  const w = num(st.w), r = num(st.r);
  if (kind === 'reps') return (w > 0 ? w : 0) * r;
  return w * r;
}
function workoutVolume(w) {
  return w.entries.reduce((sum, e) => {
    const kind = exById(e.exId).kind;
    return sum + e.sets.reduce((s2, st) => s2 + setVolume(st, kind), 0);
  }, 0);
}
function workoutSets(w) { return w.entries.reduce((n, e) => n + e.sets.length, 0); }
function workoutReps(w) { return w.entries.reduce((n, e) => n + e.sets.reduce((s, st) => s + num(st.r), 0), 0); }
function workoutDuration(w) {
  if (!w.endedAt) return null;
  return Math.max(0, Math.round((new Date(w.endedAt) - new Date(w.startedAt)) / 60000));
}

function bestSet(entry, kind) {
  let best = null;
  entry.sets.forEach((st) => {
    if (kind === 'time') {
      if (!best || num(st.s) > num(best.s)) best = st;
    } else {
      const e = est1RM(num(st.w), num(st.r)) || num(st.r);
      const be = best ? (est1RM(num(best.w), num(best.r)) || num(best.r)) : -1;
      if (e > be) best = st;
    }
  });
  return best;
}

/* progression: all working sets reached the top of the target rep range */
function hitTopOfRange(entry) {
  if (!entry.target || !entry.target.hi || !entry.sets.length) return false;
  if (entry.sets.length < (entry.target.sets || 1)) return false;
  return entry.sets.every((st) => num(st.r) >= entry.target.hi);
}

function overallStats() {
  const ws = S.workouts;
  const now = new Date();
  const thisWeek = ws.filter((w) => weekKey(w.startedAt) === weekKey(now)).length;
  const last30 = ws.filter((w) => daysBetween(w.startedAt, now) <= 30);
  const totalVolume = ws.reduce((s, w) => s + workoutVolume(w), 0);
  // streak: consecutive weeks (ending with current or previous week) having >= 1 workout
  const weeks = new Set(ws.map((w) => weekKey(w.startedAt)));
  let streak = 0;
  let cur = startOfWeek(now);
  if (!weeks.has(ymd(cur))) cur.setDate(cur.getDate() - 7);
  while (weeks.has(ymd(cur))) { streak++; cur.setDate(cur.getDate() - 7); }
  // avg per week over the span since first workout (max 12 weeks)
  let avg = 0;
  if (ws.length) {
    const first = new Date(ws[ws.length - 1].startedAt);
    const spanWeeks = Math.max(1, Math.min(52, Math.ceil((now - startOfWeek(first)) / (7 * 86400000))));
    avg = ws.length / spanWeeks;
  }
  return { count: ws.length, thisWeek, last30: last30.length, totalVolume, streak, avg };
}

function weeklyVolume(nWeeks) {
  const out = [];
  const base = startOfWeek(new Date());
  for (let i = nWeeks - 1; i >= 0; i--) {
    const d = new Date(base); d.setDate(d.getDate() - i * 7);
    const k = ymd(d);
    const vol = S.workouts.filter((w) => weekKey(w.startedAt) === k).reduce((s, w) => s + workoutVolume(w), 0);
    const cnt = S.workouts.filter((w) => weekKey(w.startedAt) === k).length;
    out.push({ week: k, value: vol, count: cnt, date: d });
  }
  return out;
}

function muscleSplit(days) {
  const now = new Date();
  const acc = {};
  S.workouts.forEach((w) => {
    if (daysBetween(w.startedAt, now) > days) return;
    w.entries.forEach((e) => {
      const ex = exById(e.exId);
      const v = e.sets.reduce((s, st) => s + setVolume(st, ex.kind), 0);
      const sets = e.sets.length;
      if (!acc[ex.m]) acc[ex.m] = { volume: 0, sets: 0 };
      acc[ex.m].volume += v; acc[ex.m].sets += sets;
    });
  });
  return Object.keys(acc).map((m) => ({ m, ...acc[m] })).sort((a, b) => b.sets - a.sets);
}

function exerciseHistory(exId) {
  const out = [];
  S.workouts.forEach((w) => {
    w.entries.forEach((e) => {
      if (e.exId !== exId || !e.sets.length) return;
      const ex = exById(exId);
      const b = bestSet(e, ex.kind);
      out.push({
        date: w.startedAt, workoutId: w.id, sets: e.sets,
        volume: e.sets.reduce((s, st) => s + setVolume(st, ex.kind), 0),
        best: b,
        e1rm: b ? est1RM(num(b.w), num(b.r)) : 0,
        topWeight: Math.max(0, ...e.sets.map((st) => num(st.w))),
      });
    });
  });
  return out.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function exercisePR(exId) {
  const h = exerciseHistory(exId);
  if (!h.length) return null;
  let bestE = 0, bestW = 0, bestVol = 0, bestReps = 0, bestTime = 0;
  h.forEach((x) => {
    bestE = Math.max(bestE, x.e1rm);
    bestVol = Math.max(bestVol, x.volume);
    x.sets.forEach((st) => {
      bestW = Math.max(bestW, num(st.w));
      bestReps = Math.max(bestReps, num(st.r));
      bestTime = Math.max(bestTime, num(st.s));
    });
  });
  return { e1rm: bestE, weight: bestW, volume: bestVol, reps: bestReps, time: bestTime, sessions: h.length, last: h[h.length - 1] };
}

/* ---------- body ---------- */
function addBodyEntry(entry) {
  const e = Object.assign({ id: uid(), date: ymd(new Date()) }, entry);
  const i = S.body.findIndex((b) => b.date === e.date);
  if (i >= 0) S.body[i] = Object.assign(S.body[i], e);
  else S.body.push(e);
  S.body.sort((a, b) => a.date.localeCompare(b.date));
  save();
}
function deleteBodyEntry(id) {
  const i = S.body.findIndex((b) => b.id === id);
  if (i >= 0) { S.body.splice(i, 1); save(); }
}
function weightSeries() {
  return S.body.filter((b) => num(b.weight) > 0).map((b) => ({ date: b.date, v: num(b.weight) }));
}
/* rolling average over a trailing window of `days` calendar days */
function rollingAvg(series, days) {
  return series.map((pt, i) => {
    const from = parseYmd(pt.date); from.setDate(from.getDate() - (days - 1));
    const win = series.filter((p, j) => j <= i && parseYmd(p.date) >= from);
    return { date: pt.date, v: win.reduce((s, p) => s + p.v, 0) / win.length };
  });
}
function weeklyWeightChange() {
  const s = weightSeries();
  if (s.length < 2) return null;
  const avg = rollingAvg(s, 7);
  const last = avg[avg.length - 1];
  // find the avg point closest to 7 days before last
  const target = parseYmd(last.date); target.setDate(target.getDate() - 7);
  let ref = null, bestDiff = Infinity;
  avg.forEach((p) => {
    const d = Math.abs(parseYmd(p.date) - target);
    if (d < bestDiff) { bestDiff = d; ref = p; }
  });
  if (!ref || ref.date === last.date) return null;
  const spanDays = daysBetween(ref.date, last.date) || 7;
  return ((last.v - ref.v) / spanDays) * 7;
}

/* ---------- plates ---------- */
function platesFor(target, bar, plates) {
  let side = (target - bar) / 2;
  if (side <= 0) return { ok: target === bar, list: [], left: 0 };
  const list = [];
  const sorted = [...plates].sort((a, b) => b - a);
  for (const p of sorted) {
    while (side >= p - 1e-9) { list.push(p); side = Math.round((side - p) * 1000) / 1000; }
  }
  return { ok: Math.abs(side) < 1e-6, list, left: side };
}

/* ---------- templates ---------- */
function saveTemplateFromWorkout(w, name) {
  const tpl = {
    id: uid(), name, name_ru: name, seeded: false,
    items: w.entries.map((e) => ({
      exId: e.exId,
      sets: e.sets.length || (e.target ? e.target.sets : 3),
      lo: e.target ? e.target.lo : null,
      hi: e.target ? e.target.hi : null,
      note: e.note || '',
    })),
  };
  S.templates.push(tpl); save();
  return tpl;
}
function upsertTemplate(draft) {
  const i = S.templates.findIndex((x) => x.id === draft.id);
  if (i >= 0) S.templates[i] = draft; else S.templates.push(draft);
  save();
  return draft;
}
function blankTemplate() {
  return { id: uid(), name: '', name_ru: '', seeded: false, items: [] };
}
function deleteTemplate(id) {
  const i = S.templates.findIndex((x) => x.id === id);
  if (i >= 0) { S.templates.splice(i, 1); save(); }
}

/* ---------- backup ---------- */
function exportData() {
  S.lastBackup = new Date().toISOString(); save();
  return JSON.stringify(S, null, 2);
}
function importData(json) {
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || !('workouts' in parsed)) throw new Error('bad file');
  S = Object.assign(blankState(), parsed);
  S.settings = Object.assign(clone(DEFAULT_SETTINGS), parsed.settings || {});
  invalidateEx(); save();
}
function daysSinceBackup() {
  if (!S.lastBackup) return null;
  return daysBetween(S.lastBackup, new Date());
}
