// Reine Fachlogik ohne DOM und ohne Firebase. Läuft im Browser, in den
// Vercel-Functions und in den Tests.

// ---------- Hilfsfunktionen ----------
export function pad(n) { return String(n).padStart(2, '0'); }
export function dayId(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
export function todayId() { return dayId(new Date()); }
export function isDateId(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
export function dateOf(id) { const p = id.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
export function num(v) { if (v === null || v === undefined) return null; const s = String(v).trim().replace(',', '.'); if (s === '') return null; const n = Number(s); return isFinite(n) ? n : null; }
export function clean(v) { if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null; const n = Number(v); return isFinite(n) ? n : null; }
export function fmt(n) { if (n === null || n === undefined || !isFinite(n)) return '–'; return (Math.round(n * 100) / 100).toLocaleString('de-DE', { maximumFractionDigits: 2 }); }
export function roundKg(n) { return Math.round(n * 100) / 100; }
export function cleanKg(v) { const n = clean(v); return n === null ? null : roundKg(n); }
export function toStep(n, step) { return roundKg(Math.round(n / step) * step); }
export function uid6() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

export const RATINGS = { leicht: 'Zu leicht', passt: 'Passt', limit: 'Am Limit' };
export function rating(r) { return Object.prototype.hasOwnProperty.call(RATINGS, r) ? r : null; }

// ---------- Übungen und Pläne ----------
const S = (id, name, sets, reps, pr, rest, restText, step, muscles, extra = {}) => ({
  id, name, sets, reps, pr, rest, restText, kg: null, step, muscles, ...extra
});
const DROP = dropPr => ({ drop: true, dropPr, dropKg: null });

// Vorlage für neue Nutzer. Startgewichte bleiben bewusst leer.
export const DEFAULT_EXERCISES = [
  { id: 'warmup', name: 'Aufwärmen', kind: 'time', min: 8, target: '5–10 min' },
  S('latzug', 'Latzug', 3, [8, 12], [12, 10, 9], 120, '2 min', 5, { p: ['lats'], s: ['biceps'] }),
  S('rudern', 'Rudern Maschine', 3, [8, 12], [12, 10, 9], 120, '2 min', 5, { p: ['traps', 'lats'], s: ['biceps', 'delts_b'] }),
  S('brustpresse', 'Brustpresse', 3, [8, 12], [10, 9, 8], 120, '2 min', 5, { p: ['chest'], s: ['delts_f', 'triceps'] }),
  S('seitheben', 'Seitheben Maschine', 2, [12, 20], [15, 12], 75, '75 s', 5, { p: ['delts_f', 'delts_b'], s: [] }, DROP(10)),
  S('reverse_fly', 'Reverse Butterfly', 2, [12, 20], [15, 12], 75, '75 s', 5, { p: ['delts_b'], s: ['traps'] }),
  S('preacher', 'Preacher Curls', 2, [8, 12], [10, 8], 90, '90 s', 2, { p: ['biceps'], s: ['forearms'] }, { note: 'Langhantel, Untergriff, Gewicht gesamt' }),
  S('trizeps_oh', 'Trizeps über Kopf', 2, [10, 15], [12, 10], 90, '90 s', 2, { p: ['triceps'], s: [] }, { note: '1 Hantel, 2 Hände' }),
  S('hammer', 'Hammer Curls', 2, [10, 15], [12, 10], 75, '75 s', 2, { p: ['biceps', 'forearms', 'forearms_b'], s: [] }, DROP(8)),
  S('rope', 'Rope Pushdown', 2, [10, 15], [12, 10], 75, '75 s', 5, { p: ['triceps'], s: [] }, DROP(8)),
  S('reverse', 'Reverse Curls', 2, [12, 20], [15, 12], 60, '60 s', 2, { p: ['forearms', 'forearms_b'], s: ['biceps'] }, DROP(10)),
  S('butterfly', 'Butterfly', 2, [8, 12], [10, 8], 90, '90 s', 5, { p: ['chest'], s: ['delts_f'] }, DROP(8)),
  S('beinpresse', 'Beinpresse', 3, [10, 15], [12, 10, 10], 120, '2 min', 10, { p: ['quads'], s: [] }),
  S('beinstrecker', 'Beinstrecker', 2, [10, 15], [12, 10], 90, '90 s', 5, { p: ['quads'], s: [] }, DROP(8)),
  S('waden', 'Waden', 2, [12, 20], [15, 12], 60, '60 s', 5, { p: ['calves'], s: [] }, DROP(10)),
  { id: 'rennen', name: 'Rennen', kind: 'time', min: 10, target: '10 min' }
];

const framed = ids => ['warmup', ...ids, 'rennen'];
export const DEFAULT_PLANS = {
  full: { name: 'Ganzkörper', exerciseIds: framed(['latzug', 'rudern', 'seitheben', 'preacher', 'trizeps_oh', 'hammer', 'rope', 'reverse', 'butterfly', 'beinstrecker', 'waden']) },
  push: { name: 'Push', exerciseIds: framed(['brustpresse', 'butterfly', 'seitheben', 'trizeps_oh', 'rope']) },
  pull: { name: 'Pull', exerciseIds: framed(['latzug', 'rudern', 'reverse_fly', 'preacher', 'hammer', 'reverse']) },
  legs: { name: 'Beine', exerciseIds: framed(['beinpresse', 'beinstrecker', 'waden']) },
  upper: { name: 'Oberkörper', exerciseIds: framed(['latzug', 'rudern', 'brustpresse', 'seitheben', 'reverse_fly', 'preacher', 'trizeps_oh']) },
  lower: { name: 'Unterkörper', exerciseIds: framed(['beinpresse', 'beinstrecker', 'waden']) }
};

function dOrd(d) { return (d + 6) % 7; }

// Verteilt die Pläne automatisch auf die Trainingstage (Verhalten der alten App).
export function autoSchedule(days, plans = DEFAULT_PLANS) {
  const sorted = [...days].map(Number).sort((a, b) => dOrd(a) - dOrd(b));
  const fallback = Object.keys(plans)[0];
  const pick = key => (plans[key] ? key : fallback);
  const out = {};
  sorted.forEach((d, i) => {
    const n = sorted.length;
    const key = n < 3 ? 'full' : n === 3 ? ['push', 'pull', 'legs'][i] : (i % 2 === 0 ? 'upper' : 'lower');
    out[d] = pick(key);
  });
  return out;
}

export function defaultPlanDoc(today = todayId()) {
  const schedule = autoSchedule([2, 4]);
  return {
    exercises: DEFAULT_EXERCISES.map(e => JSON.parse(JSON.stringify(e))),
    plans: JSON.parse(JSON.stringify(DEFAULT_PLANS)),
    schedule,
    scheduleAuto: true,
    history: [{ from: today, schedule }]
  };
}

export function normalizePlan(doc, today = todayId()) {
  if (!doc || !Array.isArray(doc.exercises) || !doc.plans || !Object.keys(doc.plans).length) return defaultPlanDoc(today);
  const schedule = doc.schedule && typeof doc.schedule === 'object' ? doc.schedule : {};
  return {
    exercises: doc.exercises,
    plans: doc.plans,
    schedule,
    scheduleAuto: doc.scheduleAuto !== false,
    history: Array.isArray(doc.history) && doc.history.length ? doc.history : [{ from: today, schedule }]
  };
}

export function exerciseMap(plan) {
  const map = {};
  plan.exercises.forEach(e => { map[e.id] = e; });
  return map;
}

export function trainDays(plan) { return Object.keys(plan.schedule).map(Number).sort((a, b) => dOrd(a) - dOrd(b)); }

// Trainingstage galten ab einem bestimmten Datum. Alte Tage bleiben dadurch korrekt.
export function scheduleAt(plan, id) {
  const hist = [...plan.history].sort((a, b) => (a.from < b.from ? -1 : 1));
  let current = hist[0] ? hist[0].schedule : plan.schedule;
  hist.forEach(h => { if (h.from <= id) current = h.schedule; });
  return current || {};
}

export function isScheduled(plan, id) {
  return Object.prototype.hasOwnProperty.call(scheduleAt(plan, id), String(dateOf(id).getDay()));
}

export function planIdFor(plan, id) {
  const sched = scheduleAt(plan, id), wd = dateOf(id).getDay();
  if (sched[wd] && plan.plans[sched[wd]]) return sched[wd];
  // Ruhetag: der nächste geplante Trainingstag bestimmt, was angezeigt wird.
  for (let i = 1; i < 7; i++) {
    const p = sched[(wd + i) % 7];
    if (p && plan.plans[p]) return p;
  }
  return Object.keys(plan.plans)[0];
}

export function planExercises(plan, planId) {
  const map = exerciseMap(plan), def = plan.plans[planId];
  return (def ? def.exerciseIds : []).map(id => map[id]).filter(e => e && !e.archived);
}

export function withSchedule(plan, schedule, today, auto) {
  const history = plan.history.filter(h => h.from !== today).concat([{ from: today, schedule }])
    .sort((a, b) => (a.from < b.from ? -1 : 1)).slice(-60);
  return { ...plan, schedule, history, scheduleAuto: auto };
}

export function toggleTrainDay(plan, day, today) {
  const days = trainDays(plan), has = days.includes(day);
  const next = has ? days.filter(d => d !== day) : days.concat([day]);
  if (plan.scheduleAuto) return withSchedule(plan, autoSchedule(next, plan.plans), today, true);
  const schedule = { ...plan.schedule };
  if (has) delete schedule[day];
  else schedule[day] = Object.keys(plan.plans)[0];
  return withSchedule(plan, schedule, today, false);
}

export function assignPlan(plan, day, planId, today) {
  if (!plan.plans[planId]) return plan;
  return withSchedule(plan, { ...plan.schedule, [day]: planId }, today, false);
}

export function newExercise(form) {
  const name = String(form.name || '').trim().slice(0, 60);
  if (!name) throw new Error('Name fehlt');
  const id = 'x_' + uid6();
  if (form.kind === 'time') {
    const min = Math.max(1, Math.min(240, Math.round(clean(form.min) ?? 10)));
    return { id, name, kind: 'time', min, target: min + ' min' };
  }
  const sets = Math.max(1, Math.min(10, Math.round(clean(form.sets) ?? 3)));
  const lo = Math.max(1, Math.min(100, Math.round(clean(form.repsLo) ?? 8)));
  const hi = Math.max(lo, Math.min(100, Math.round(clean(form.repsHi) ?? 12)));
  const rest = Math.max(10, Math.min(600, Math.round(clean(form.rest) ?? 90)));
  const start = Math.round((lo + hi) / 2);
  const pr = Array.from({ length: sets }, (_, i) => Math.max(lo, start - i));
  const ex = {
    id, name, sets, reps: [lo, hi], pr, rest,
    restText: rest >= 120 && rest % 60 === 0 ? rest / 60 + ' min' : rest + ' s',
    kg: cleanKg(form.kg),
    step: Math.max(0.5, Math.min(50, clean(form.step) ?? 5)),
    muscles: { p: Array.isArray(form.muscles) ? form.muscles : [], s: [] }
  };
  if (form.drop) { ex.drop = true; ex.dropPr = Math.max(1, lo - 2); ex.dropKg = null; }
  return ex;
}

// Archiviert statt zu löschen, damit der Verlauf den Namen behält.
export function archiveExercise(plan, exId) {
  const plans = {};
  Object.keys(plan.plans).forEach(k => {
    plans[k] = { ...plan.plans[k], exerciseIds: plan.plans[k].exerciseIds.filter(id => id !== exId) };
  });
  return { ...plan, plans, exercises: plan.exercises.map(e => (e.id === exId ? { ...e, archived: true } : e)) };
}

export function removePlan(plan, planId, today) {
  const ids = Object.keys(plan.plans);
  if (ids.length <= 1 || !plan.plans[planId]) return plan;
  const plans = { ...plan.plans };
  delete plans[planId];
  const replacement = Object.keys(plans)[0];
  const schedule = {};
  Object.keys(plan.schedule).forEach(d => { schedule[d] = plan.schedule[d] === planId ? replacement : plan.schedule[d]; });
  return withSchedule({ ...plan, plans }, schedule, today, false);
}

// ---------- Trainings-Einträge ----------
export function entrySets(e) {
  if (!e) return [];
  if (Array.isArray(e.sets)) {
    return e.sets.map(s => ({
      kg: s ? cleanKg(s.kg) : null,
      reps: s ? clean(s.reps) : null,
      // Nur alte Einträge ohne eigene Satzbewertung erben die Gesamtbewertung.
      rating: s ? (s.rating === undefined ? rating(e.rating) : rating(s.rating)) : null
    }));
  }
  const kg = cleanKg(e.kg), reps = Array.isArray(e.reps) ? e.reps : [];
  if (kg === null && !reps.length) return [];
  const out = [];
  for (let i = 0; i < Math.max(reps.length, 1); i++) out.push({ kg, reps: clean(reps[i]), rating: rating(e.rating) });
  return out;
}

export function firstKg(e) { for (const s of entrySets(e)) if (s.kg !== null) return s.kg; return null; }

export function dropRating(e) { return e.dropRating === undefined ? rating(e.rating) : rating(e.dropRating); }

export function defaultSets(ex) {
  if (ex.kg === null || ex.kg === undefined) return Array.from({ length: ex.sets }, () => null);
  const a = [ex.kg];
  for (let i = 1; i < ex.sets; i++) a.push(ex.sets >= 3 ? toStep(ex.kg - ex.step, ex.step) : toStep(ex.kg * 0.9, ex.step));
  return a;
}

export function setsText(e) {
  const parts = entrySets(e).filter(s => s.kg !== null || s.reps !== null)
    .map(s => (s.kg !== null ? fmt(s.kg) + ' kg' : '?') + (s.reps !== null ? ' × ' + s.reps : ''));
  const dk = cleanKg(e.dropKg), dr = clean(e.dropReps);
  if (dk !== null) parts.push('Drop ' + fmt(dk) + ' kg' + (dr !== null ? ' × ' + dr : ''));
  const r = rating(e.rating);
  if (r) parts.push(RATINGS[r]);
  return parts.join(', ');
}

// Letzter Eintrag vor heute, egal ob der Tag damals als Trainingstag geplant war.
export function lastEntry(sessions, exId, today) {
  for (const s of sessions) {
    if (s.id >= today) continue;
    const e = s.entries && s.entries[exId];
    if (e && (firstKg(e) !== null || e.done)) return { e, date: s.id };
  }
  return null;
}

export function suggest(ex, le) {
  const dDef = ex.dropKg ?? null, dpr = ex.dropPr || null;
  if (!le || firstKg(le.e) === null) return { sets: defaultSets(ex), reps: ex.pr.slice(), dropKg: dDef, dropReps: dpr, delta: 0, repDelta: 0 };
  const e = le.e, st = entrySets(e), lo = ex.reps[0], top = ex.reps[1], base = defaultSets(ex);
  const kgs = [], reps = [];
  for (let i = 0; i < ex.sets; i++) {
    let v = st[i] && st[i].kg !== null ? st[i].kg : null;
    if (v === null && st[0] && st[0].kg !== null) v = i === 0 ? st[0].kg : toStep(st[0].kg * (ex.sets >= 3 ? 1 : 0.9), ex.step);
    kgs.push(v === null ? base[i] : v);
    reps.push(st[i] && st[i].reps !== null ? st[i].reps : ex.pr[i]);
  }
  const outK = [], outR = [];
  let first = null;
  for (let j = 0; j < ex.sets; j++) {
    const sr = st[j] ? st[j].rating : rating(e.rating), k = kgs[j], rp = reps[j];
    if (k === null || k === undefined) { outK.push(null); outR.push(rp); continue; }
    if (sr === 'leicht' || (sr !== 'limit' && rp >= top)) { outK.push(roundKg(k + ex.step)); outR.push(Math.max(lo, rp - 2)); if (j === 0) first = 'w'; }
    else if (sr === 'limit') { outK.push(k); outR.push(rp); }
    else { outK.push(k); outR.push(Math.min(top, rp + 1)); if (j === 0) first = 'r'; }
  }
  const dk = cleanKg(e.dropKg), dr = clean(e.dropReps), dsr = dropRating(e);
  let nk = dDef, nr = dpr;
  if (dk !== null) {
    if (dsr === 'leicht' || (dsr !== 'limit' && dr !== null && dr >= top)) { nk = roundKg(dk + ex.step); nr = dr !== null ? Math.max(4, dr - 2) : dpr; }
    else if (dsr === 'limit') { nk = dk; nr = dr !== null ? dr : dpr; }
    else { nk = dk; nr = dr !== null ? dr + 1 : dpr; }
  }
  return { sets: outK, reps: outR, dropKg: nk, dropReps: nr, delta: first === 'w' ? roundKg(outK[0] - kgs[0]) : 0, repDelta: first === 'r' ? 1 : 0 };
}

export function bestRun(sessions, field) {
  let best = null;
  sessions.forEach(s => {
    const e = s.entries && s.entries.rennen, v = e ? clean(e[field]) : null;
    if (v !== null && (best === null || v > best)) best = v;
  });
  return best;
}

export function prevKg(sessions, exId, beforeId) {
  for (const s of sessions) {
    if (s.id >= beforeId) continue;
    const e = s.entries && s.entries[exId];
    if (e && firstKg(e) !== null) return firstKg(e);
  }
  return null;
}

// ---------- Essen ----------
export function cleanItems(arr) {
  return (Array.isArray(arr) ? arr : []).map(it => {
    if (!it || typeof it !== 'object') return null;
    const name = typeof it.name === 'string' ? it.name.trim().slice(0, 60) : '';
    const amount = typeof it.amount === 'string' ? it.amount.trim().slice(0, 60) : '';
    const k = clean(it.kcal), p = clean(it.protein);
    if (!name || k === null || p === null || k < 0 || k > 5000 || p < 0 || p > 400) return null;
    const out = { id: typeof it.id === 'string' ? it.id.slice(0, 24) : uid6(), name, amount, kcal: Math.round(k), protein: Math.round(p) };
    if (typeof it.g === 'string' && it.g) out.g = it.g.slice(0, 24);
    if (typeof it.gt === 'string' && it.gt.trim()) out.gt = it.gt.trim().slice(0, 80);
    const ml = clean(it.ml);
    if (ml !== null && ml > 0 && ml <= 5000) out.ml = Math.round(ml);
    const cnt = clean(it.count !== undefined ? it.count : it.n);
    if (cnt !== null && cnt >= 1 && cnt <= 50) out.n = Math.round(cnt);
    return out;
  }).filter(Boolean).slice(0, 80);
}

export function sum(items) { return items.reduce((a, it) => { a.k += it.kcal; a.p += it.protein; return a; }, { k: 0, p: 0 }); }
export function normKey(name) { return String(name).toLowerCase().replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim(); }

export function aggregate(items) {
  const map = {}, order = [];
  items.forEach(it => {
    const k = normKey(it.name) || it.id;
    if (!map[k]) { map[k] = { key: k, name: it.name.replace(/\s*\([^)]*\)\s*/g, ' ').trim() || it.name, count: 0, kcal: 0, protein: 0 }; order.push(k); }
    const m = map[k];
    m.count += it.n || 1;
    m.kcal += it.kcal;
    m.protein += it.protein;
  });
  return order.map(k => map[k]).sort((a, b) => b.kcal - a.kcal);
}

// „Ein … entfernen“: Bei „3 Stück“ bleiben danach 2 übrig statt nichts.
export function removeOne(items, key) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if ((normKey(it.name) || it.id) !== key) continue;
    if (!(it.n > 1)) return { remove: it, add: null };
    const left = it.n - 1;
    return {
      remove: it,
      add: { ...it, id: uid6(), n: left, kcal: Math.round(it.kcal * left / it.n), protein: Math.round(it.protein * left / it.n), amount: left + ' Stück' }
    };
  }
  return null;
}

export function isWaterItem(it) { return /wasser|sprudel/i.test(it.name) && it.kcal <= 10; }

// ---------- Wasser ----------
export function cleanLog(arr) {
  return (Array.isArray(arr) ? arr : []).map(e => {
    if (!e || typeof e !== 'object') return null;
    const ml = clean(e.ml);
    if (ml === null || ml <= 0 || ml > 5000) return null;
    return { id: typeof e.id === 'string' ? e.id.slice(0, 24) : uid6(), ml: Math.round(ml), at: typeof e.at === 'string' ? e.at.slice(0, 40) : '' };
  }).filter(Boolean).slice(0, 200);
}
export function mlSum(log) { return log.reduce((a, e) => a + e.ml, 0); }

// ---------- Schlaf ----------
export function sleepMin(from, to) {
  const a = from.split(':').map(Number), b = to.split(':').map(Number);
  let d = (b[0] * 60 + b[1]) - (a[0] * 60 + a[1]);
  if (d <= 0) d += 1440;
  return d;
}
export function cleanSleep(v) {
  if (!v || typeof v !== 'object') return null;
  const re = /^\d{2}:\d{2}$/;
  if (!re.test(v.from) || !re.test(v.to)) return null;
  const m = sleepMin(v.from, v.to);
  if (m < 60 || m > 960) return null;
  return { from: v.from, to: v.to, min: m };
}
export function sleepScore(min) {
  const h = min / 60, sc = h < 7 ? 10 - (7 - h) * 2.5 : h > 9.5 ? 10 - (h - 9.5) * 2 : 10;
  return Math.max(0, Math.round(sc * 10) / 10);
}

// ---------- Tagesbewertung ----------
export const DEFAULT_GOALS = { kcal: 2600, protein: 130, water: 2500 };
export function cleanGoals(g) {
  const pick = (v, def, lo, hi) => { const n = clean(v); return n === null || n < lo || n > hi ? def : Math.round(n); };
  const src = g || {};
  return {
    kcal: pick(src.kcal, DEFAULT_GOALS.kcal, 500, 10000),
    protein: pick(src.protein, DEFAULT_GOALS.protein, 10, 500),
    water: pick(src.water, DEFAULT_GOALS.water, 250, 10000)
  };
}

const GROUP_OF = { lats: 'Rücken', traps: 'Rücken', delts_f: 'Schulter', delts_b: 'Schulter', biceps: 'Arme', triceps: 'Arme', forearms: 'Arme', forearms_b: 'Arme', chest: 'Brust', quads: 'Beine', calves: 'Beine' };
export function groupOf(ex) { const m = ex && ex.muscles && ex.muscles.p && ex.muscles.p[0]; return (m && GROUP_OF[m]) || null; }

// Geplante Übungen eines Tages: gespeicherter Plan, sonst der damals gültige.
export function plannedFor(plan, id, session) {
  const map = exerciseMap(plan);
  if (session && Array.isArray(session.plannedIds)) return session.plannedIds.map(x => map[x]).filter(Boolean);
  return planExercises(plan, planIdFor(plan, id));
}

export function dayScore(id, { sessions, foodDays, waterDays, plan, goals, today }) {
  const fd = foodDays.find(d => d.id === id) || null;
  const wd = waterDays.find(d => d.id === id) || null;
  const ses = sessions.find(s => s.id === id) || null;
  const f = sum(fd ? fd.items : []), ml = wd ? mlSum(wd.log) : 0, isToday = id === today;
  const isTrain = isScheduled(plan, id), wg = goals.water;
  const ent = ses && ses.entries ? ses.entries : {};
  const planned = plannedFor(plan, id, ses).filter(e => e.kind !== 'time');
  const plannedN = Math.max(1, planned.length);
  const doneIds = plan.exercises.filter(ex => ex.kind !== 'time' && ent[ex.id]).map(ex => ex.id);
  const tr = Math.min(1, doneIds.length / plannedN), kr = f.k / goals.kcal;
  let prog = 0, easy = 0, rated = 0;
  doneIds.forEach(x => {
    const k = firstKg(ent[x]), pk = prevKg(sessions, x, id);
    if (k !== null && pk !== null && k > pk) prog++;
    const r = rating(ent[x].rating);
    if (r) { rated++; if (r === 'leicht') easy++; }
  });
  let tPts = 2;
  if (isTrain) {
    tPts = tr >= 0.9 ? 1.5 : tr >= 0.6 ? 1 : tr >= 0.3 ? 0.5 : 0;
    if (tr > 0 && (prog > 0 || (rated && easy / rated < 0.5))) tPts += 0.5;
  }
  const sl = ses && ses.sl ? ses.sl : null;
  const score = Math.min(10, Math.round((Math.min(1, f.p / goals.protein) * 5 + (kr >= 0.85 ? 2 : kr >= 0.7 ? 1 : 0) + Math.min(1, ml / wg) + tPts) * 10) / 10);

  // Nur Muskelgruppen melden, die an diesem Tag auch geplant waren.
  const groups = [];
  planned.forEach(ex => { const g = groupOf(ex); if (g && !groups.includes(g)) groups.push(g); });
  const missing = groups.filter(g => planned.filter(ex => groupOf(ex) === g).every(ex => !ent[ex.id]));
  let tTxt;
  if (!doneIds.length) tTxt = isToday ? 'noch offen' : 'ausgefallen';
  else if (missing.length) tTxt = missing.join(' und ') + (missing.length > 1 || missing[0] === 'Arme' || missing[0] === 'Beine' ? ' fehlen' : ' fehlt');
  else if (rated && easy / rated >= 0.5) tTxt = 'Gewichte zu leicht';
  else tTxt = prog ? 'stark, mehr Gewicht' : tr >= 0.9 ? 'komplett' : 'fast komplett';

  return {
    score, kcal: f.k, prot: f.p, ml, sl, isTrain, tTxt, wg,
    has: !!((fd && fd.items.length) || ml || (ses && (doneIds.length || ses.note || ses.sl)))
  };
}

// ---------- Rangliste ----------
const MAX_KG = 500, MAX_REPS = 100;
const volumeOfSet = (kg, reps) => {
  const k = clean(kg), r = clean(reps);
  if (k === null || r === null || k <= 0 || r <= 0) return 0;
  return Math.min(k, MAX_KG) * Math.min(r, MAX_REPS);
};
export function entryVolume(e) {
  if (!e || !Array.isArray(e.sets)) return 0;
  return e.sets.reduce((a, s) => a + (s ? volumeOfSet(s.kg, s.reps) : 0), 0) + volumeOfSet(e.dropKg, e.dropReps);
}
export function dayVolume(session) {
  const ent = session && session.entries;
  if (!ent || typeof ent !== 'object') return 0;
  return Object.keys(ent).reduce((a, k) => a + entryVolume(ent[k]), 0);
}

// ISO-Woche, z. B. „2026-W45“.
export function weekIdOf(id) {
  const d = dateOf(id);
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - dOrd(d.getDay()));
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  const week = 1 + Math.round(((thursday - firstThursday) / 86400000 - 3 + dOrd(firstThursday.getDay())) / 7);
  return thursday.getFullYear() + '-W' + pad(week);
}
export function weekDayIds(id) {
  const d = dateOf(id), monday = d.getDate() - dOrd(d.getDay());
  return Array.from({ length: 7 }, (_, i) => dayId(new Date(d.getFullYear(), d.getMonth(), monday + i)));
}
export function weekTotals(id, sessions, waterDays) {
  const ids = weekDayIds(id);
  const training = sessions.filter(s => ids.includes(s.id)).reduce((a, s) => a + dayVolume(s), 0);
  const water = waterDays.filter(w => ids.includes(w.id)).reduce((a, w) => a + mlSum(cleanLog(w.log)), 0);
  return { training: Math.round(training), water };
}
