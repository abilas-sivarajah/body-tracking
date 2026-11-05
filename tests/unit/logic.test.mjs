import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoSchedule, defaultPlanDoc, toggleTrainDay, assignPlan, scheduleAt, isScheduled, planIdFor, planExercises,
  entrySets, firstKg, suggest, lastEntry, removeOne, aggregate, dayScore, cleanKg, cleanGoals, DEFAULT_GOALS,
  newExercise, archiveExercise, removePlan, plannedFor, entryVolume, dayVolume, weekIdOf, weekDayIds, weekTotals,
  sleepScore, cleanSleep, DEFAULT_EXERCISES, DEFAULT_PLANS
} from '../../public/js/logic.js';

const ex = over => ({ id: 'a', name: 'A', sets: 2, reps: [8, 12], pr: [10, 8], rest: 90, kg: null, step: 2, muscles: { p: ['biceps'], s: [] }, ...over });
const ctx = (over = {}) => ({ sessions: [], foodDays: [], waterDays: [], plan: defaultPlanDoc('2026-01-01'), goals: DEFAULT_GOALS, today: '2026-11-05', ...over });

test('Gewichte bleiben auf 42,5 kg, statt auf 43 gerundet zu werden', () => {
  assert.equal(cleanKg(42.5), 42.5);
  assert.equal(firstKg({ sets: [{ kg: 42.5, reps: 10 }] }), 42.5);
});

test('Eine Satzbewertung überträgt sich nicht auf unbewertete Sätze', () => {
  const sets = entrySets({ rating: 'limit', sets: [{ kg: 10, reps: 8, rating: null }, { kg: 10, reps: 8, rating: 'limit' }] });
  assert.equal(sets[0].rating, null);
  assert.equal(sets[1].rating, 'limit');
});

test('Alte Einträge ohne Satzbewertung erben weiter die Gesamtbewertung', () => {
  assert.equal(entrySets({ rating: 'limit', sets: [{ kg: 10, reps: 8 }] })[0].rating, 'limit');
});

test('Steigerungshinweis stimmt: von 9 kg bei Schritt 2 auf 11 kg, nicht 12', () => {
  const sg = suggest(ex(), { e: { sets: [{ kg: 9, reps: 12, rating: null }, { kg: 9, reps: 9, rating: null }] }, date: '2026-10-29' });
  assert.equal(sg.sets[0], 11);
  assert.equal(sg.delta, 2);
});

test('Ohne Startgewicht bleibt der Vorschlag leer statt NaN', () => {
  const sg = suggest(ex(), null);
  assert.deepEqual(sg.sets, [null, null]);
});

test('Am-Limit-Sätze behalten Gewicht und Wiederholungen', () => {
  const sg = suggest(ex(), { e: { sets: [{ kg: 20, reps: 9, rating: 'limit' }, { kg: 18, reps: 8, rating: 'limit' }] }, date: 'x' });
  assert.deepEqual(sg.sets, [20, 18]);
  assert.deepEqual(sg.reps, [9, 8]);
});

test('Training an Ruhetagen zählt für den nächsten Vorschlag', () => {
  // 2026-11-04 ist ein Mittwoch und im Standardplan kein Trainingstag
  const sessions = [{ id: '2026-11-04', entries: { a: { sets: [{ kg: 30, reps: 8 }] } } }];
  assert.equal(lastEntry(sessions, 'a', '2026-11-05').date, '2026-11-04');
});

test('Automatische Verteilung entspricht der alten App', () => {
  assert.deepEqual(autoSchedule([2, 4]), { 2: 'full', 4: 'full' });
  assert.deepEqual(autoSchedule([1, 3, 5]), { 1: 'push', 3: 'pull', 5: 'legs' });
  assert.deepEqual(autoSchedule([1, 2, 4, 5]), { 1: 'upper', 2: 'lower', 4: 'upper', 5: 'lower' });
  assert.deepEqual(autoSchedule([0, 1, 3]), { 1: 'push', 3: 'pull', 0: 'legs' }, 'Sonntag ist der letzte Tag der Woche');
});

test('Aufwärmen und Rennen sind wieder in den Vorlagen, 13 Punkte wie früher', () => {
  const plan = defaultPlanDoc('2026-01-01');
  const list = planExercises(plan, 'full');
  assert.equal(list.length, 13);
  assert.equal(list[0].id, 'warmup');
  assert.equal(list[12].id, 'rennen');
});

test('Vorlagen enthalten keine Startgewichte und nur gültige Übungen', () => {
  const ids = new Set(DEFAULT_EXERCISES.map(e => e.id));
  DEFAULT_EXERCISES.filter(e => e.kind !== 'time').forEach(e => assert.equal(e.kg, null, e.id));
  Object.values(DEFAULT_PLANS).forEach(p => p.exerciseIds.forEach(id => assert.ok(ids.has(id), id)));
});

test('Geänderte Trainingstage verändern die Vergangenheit nicht', () => {
  let plan = defaultPlanDoc('2026-01-01');
  assert.equal(isScheduled(plan, '2026-11-03'), true, 'Dienstag vorher geplant');
  plan = toggleTrainDay(plan, 2, '2026-11-05');
  assert.equal(isScheduled(plan, '2026-11-03'), true, 'Dienstag vor der Änderung bleibt geplant');
  assert.equal(isScheduled(plan, '2026-11-10'), false, 'Dienstag nach der Änderung ist frei');
});

test('Der dritte Trainingstag wechselt automatisch auf Push, Pull, Beine', () => {
  let plan = defaultPlanDoc('2026-01-01');
  plan = toggleTrainDay(plan, 6, '2026-11-05');
  assert.deepEqual(scheduleAt(plan, '2026-11-05'), { 2: 'push', 4: 'pull', 6: 'legs' });
});

test('Manuelle Planzuordnung schaltet die Automatik ab', () => {
  let plan = assignPlan(defaultPlanDoc('2026-01-01'), 2, 'legs', '2026-11-05');
  assert.equal(plan.scheduleAuto, false);
  plan = toggleTrainDay(plan, 6, '2026-11-06');
  assert.equal(plan.schedule[2], 'legs');
  assert.ok(plan.schedule[6]);
});

test('Ruhetag zeigt den Plan des nächsten Trainingstags', () => {
  const plan = assignPlan(defaultPlanDoc('2026-01-01'), 4, 'legs', '2026-01-01');
  assert.equal(planIdFor(plan, '2026-11-04'), 'legs'); // Mittwoch → Donnerstag
});

test('Eigene Übung bekommt gültige Standardwerte', () => {
  const e = newExercise({ name: ' Klimmzug ', sets: '3', repsLo: '6', repsHi: '10', rest: '120', step: '2,5'.replace(',', '.'), muscles: ['lats'] });
  assert.equal(e.name, 'Klimmzug');
  assert.deepEqual(e.reps, [6, 10]);
  assert.equal(e.pr.length, 3);
  assert.equal(e.restText, '2 min');
  assert.equal(e.step, 2.5);
  assert.throws(() => newExercise({ name: ' ' }));
});

test('Archivierte Übung bleibt für den Verlauf erhalten, verschwindet aber aus Plänen', () => {
  const plan = archiveExercise(defaultPlanDoc('2026-01-01'), 'latzug');
  assert.ok(plan.exercises.find(e => e.id === 'latzug').archived);
  assert.ok(!plan.plans.full.exerciseIds.includes('latzug'));
});

test('Gelöschter Plan wird in der Woche ersetzt, der letzte bleibt bestehen', () => {
  let plan = defaultPlanDoc('2026-01-01');
  plan = removePlan(plan, 'full', '2026-11-05');
  assert.ok(!plan.plans.full);
  assert.ok(plan.plans[plan.schedule[2]]);
  let only = { ...plan, plans: { a: { name: 'A', exerciseIds: [] } } };
  only = removePlan(only, 'a', '2026-11-05');
  assert.ok(only.plans.a);
});

test('„Ein … entfernen“ nimmt nur ein Stück von drei weg', () => {
  const items = [{ id: '1', name: 'Fladenbrot', amount: '3 Stück', kcal: 900, protein: 30, n: 3 }];
  const key = aggregate(items)[0].key;
  const r = removeOne(items, key);
  assert.equal(r.remove.id, '1');
  assert.equal(r.add.n, 2);
  assert.equal(r.add.kcal, 600);
  assert.equal(r.add.protein, 20);
});

test('Einzelnes Stück wird komplett entfernt', () => {
  const items = [{ id: '1', name: 'Apfel', amount: '', kcal: 80, protein: 0 }];
  assert.equal(removeOne(items, 'apfel').add, null);
  assert.equal(removeOne(items, 'birne'), null);
});

test('An einem Beintag fehlen Rücken und Arme nicht', () => {
  const plan = assignPlan(defaultPlanDoc('2026-01-01'), 4, 'legs', '2026-01-01');
  const entries = { beinpresse: { sets: [{ kg: 80, reps: 12 }] }, beinstrecker: { sets: [{ kg: 70, reps: 12 }] }, waden: { sets: [{ kg: 45, reps: 12 }] } };
  const sessions = [{ id: '2026-11-05', entries }];
  const r = dayScore('2026-11-05', ctx({ plan, sessions }));
  assert.ok(!/fehl/.test(r.tTxt), r.tTxt);
  assert.equal(r.tTxt, 'komplett');
});

test('Geplante, aber ausgelassene Gruppe wird weiter gemeldet', () => {
  const entries = { latzug: { sets: [{ kg: 50, reps: 10 }] } };
  const r = dayScore('2026-11-05', ctx({ sessions: [{ id: '2026-11-05', entries }] }));
  assert.match(r.tTxt, /Beine/);
  assert.doesNotMatch(r.tTxt, /Rücken/);
});

test('Gespeicherter Tagesplan gilt, auch wenn sich der Plan später ändert', () => {
  const plan = defaultPlanDoc('2026-01-01');
  const session = { id: '2026-10-29', entries: {}, plannedIds: ['beinpresse', 'waden'] };
  assert.deepEqual(plannedFor(plan, '2026-10-29', session).map(e => e.id), ['beinpresse', 'waden']);
});

test('Score: Ruhetag bekommt die Trainingspunkte, Ziele kommen vom Nutzer', () => {
  const goals = { kcal: 2000, protein: 100, water: 2000 };
  const foodDays = [{ id: '2026-11-04', items: [{ kcal: 2000, protein: 100 }] }];
  const waterDays = [{ id: '2026-11-04', log: [{ ml: 2000 }] }];
  assert.equal(dayScore('2026-11-04', ctx({ goals, foodDays, waterDays })).score, 10);
});

test('Ziele werden auf sinnvolle Grenzen geprüft', () => {
  assert.deepEqual(cleanGoals({ kcal: '3000', protein: -5, water: 'abc' }), { kcal: 3000, protein: DEFAULT_GOALS.protein, water: DEFAULT_GOALS.water });
});

test('Schlaf über Mitternacht wird korrekt berechnet', () => {
  assert.equal(cleanSleep({ from: '23:30', to: '07:30' }).min, 480);
  assert.equal(cleanSleep({ from: '07:00', to: '07:00' }), null);
  assert.equal(sleepScore(480), 10);
  assert.equal(sleepScore(360), 7.5);
});

test('Volumen zählt Sätze und Drop, unplausible Werte werden gedeckelt', () => {
  assert.equal(entryVolume({ sets: [{ kg: 50, reps: 10 }, { kg: 40, reps: 10 }], dropKg: 30, dropReps: 5 }), 1050);
  assert.equal(entryVolume({ sets: [{ kg: 99999, reps: 99999 }] }), 50000);
  assert.equal(entryVolume({ done: true, min: 10 }), 0);
  assert.equal(entryVolume({ sets: [{ kg: null, reps: 10 }] }), 0);
  assert.equal(dayVolume({ entries: { a: { sets: [{ kg: 10, reps: 10 }] }, b: { sets: [{ kg: 5, reps: 10 }] } } }), 150);
});

test('ISO-Woche stimmt auch am Jahreswechsel', () => {
  assert.equal(weekIdOf('2026-11-05'), '2026-W45');
  assert.equal(weekIdOf('2027-01-01'), '2026-W53');
  assert.equal(weekIdOf('2024-12-30'), '2025-W01');
  const ids = weekDayIds('2026-11-05');
  assert.equal(ids[0], '2026-11-02');
  assert.equal(ids[6], '2026-11-08');
});

test('Wochensummen zählen nur die aktuelle Woche', () => {
  const sessions = [{ id: '2026-11-03', entries: { a: { sets: [{ kg: 10, reps: 10 }] } } }, { id: '2026-11-01', entries: { a: { sets: [{ kg: 10, reps: 10 }] } } }];
  const water = [{ id: '2026-11-02', log: [{ ml: 500 }, { ml: 250 }] }, { id: '2026-11-01', log: [{ ml: 900 }] }];
  assert.deepEqual(weekTotals('2026-11-05', sessions, water), { training: 100, water: 750 });
});
