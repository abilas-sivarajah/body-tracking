import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where, orderBy, limit, arrayUnion } from 'firebase/firestore';

let env;
const db = (uid, claims = { member: true }) => env.authenticatedContext(uid, claims).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-body-tracking',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') }
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const d = ctx.firestore();
    await setDoc(doc(d, 'users/anna'), { username: 'Anna' });
    await setDoc(doc(d, 'users/anna/days/2026-11-05'), { date: '2026-11-05', bw: 80 });
    await setDoc(doc(d, 'leaderboard/2026-W45_water_anna'), { uid: 'anna', week: '2026-W45', metric: 'water', value: 100 });
    await setDoc(doc(d, 'invites/abc'), { note: 'x' });
  });
});

test('Nutzer liest eigene Daten', async () => {
  await assertSucceeds(getDoc(doc(db('anna'), 'users/anna/days/2026-11-05')));
  await assertSucceeds(getDoc(doc(db('anna'), 'users/anna')));
});

test('Fremde Daten sind nicht lesbar und nicht schreibbar', async () => {
  await assertFails(getDoc(doc(db('ben'), 'users/anna/days/2026-11-05')));
  await assertFails(getDoc(doc(db('ben'), 'users/anna')));
  await assertFails(setDoc(doc(db('ben'), 'users/anna/water/2026-11-05'), { date: '2026-11-05', log: [] }));
});

test('Ohne member-Claim gibt es auch auf eigene Daten keinen Zugriff', async () => {
  await assertFails(getDoc(doc(db('anna', {}), 'users/anna/days/2026-11-05')));
  await assertFails(setDoc(doc(db('anna', {}), 'users/anna/water/2026-11-05'), { date: '2026-11-05', log: [] }));
  await assertFails(getDoc(doc(db('anna', {}), 'leaderboard/2026-W45_water_anna')));
});

test('Ohne Anmeldung ist nichts erreichbar', async () => {
  const anon = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon, 'users/anna')));
  await assertFails(getDoc(doc(anon, 'leaderboard/2026-W45_water_anna')));
});

test('Rangliste: Mitglieder lesen, niemand schreibt direkt', async () => {
  const d = db('anna');
  await assertSucceeds(getDoc(doc(d, 'leaderboard/2026-W45_water_anna')));
  await assertSucceeds(getDocs(query(collection(d, 'leaderboard'), where('week', '==', '2026-W45'), where('metric', '==', 'water'), orderBy('value', 'desc'), limit(10))));
  await assertFails(setDoc(doc(d, 'leaderboard/2026-W45_water_anna'), { uid: 'anna', value: 999999 }));
  await assertFails(setDoc(doc(d, 'leaderboard/2026-W45_training_anna'), { uid: 'anna', value: 1 }));
  await assertFails(deleteDoc(doc(d, 'leaderboard/2026-W45_water_anna')));
});

test('Einladungen sind für Clients tabu', async () => {
  await assertFails(getDoc(doc(db('anna'), 'invites/abc')));
  await assertFails(setDoc(doc(db('anna'), 'invites/neu'), { note: 'x' }));
});

test('Tageseintrag: gültige Form wird angenommen, falsche abgelehnt', async () => {
  const d = db('anna');
  await assertSucceeds(setDoc(doc(d, 'users/anna/days/2026-11-06'), { date: '2026-11-06', plannedIds: ['a'], entries: { a: { kg: 42.5 } } }));
  await assertFails(setDoc(doc(d, 'users/anna/days/kein-datum'), { date: 'kein-datum' }));
  await assertFails(setDoc(doc(d, 'users/anna/days/2026-11-07'), { date: '2026-11-08' }));
  await assertFails(setDoc(doc(d, 'users/anna/days/2026-11-07'), { date: '2026-11-07', bw: 9999 }));
  await assertFails(setDoc(doc(d, 'users/anna/days/2026-11-07'), { date: '2026-11-07', fremd: 1 }));
  await assertFails(setDoc(doc(d, 'users/anna/days/2026-11-07'), { date: '2026-11-07', note: 'x'.repeat(301) }));
});

test('Essen und Wasser: Anhängen klappt, Listen sind begrenzt', async () => {
  const d = db('anna');
  await assertSucceeds(setDoc(doc(d, 'users/anna/water/2026-11-05'), { date: '2026-11-05', log: arrayUnion({ id: 'a', ml: 250 }) }, { merge: true }));
  await assertSucceeds(setDoc(doc(d, 'users/anna/food/2026-11-05'), { date: '2026-11-05', items: [{ id: 'x' }] }));
  await assertFails(setDoc(doc(d, 'users/anna/food/2026-11-06'), { date: '2026-11-06', items: Array.from({ length: 81 }, (_, i) => ({ id: String(i) })) }));
});

test('Profil: Name geprüft, fremde Felder abgelehnt, Anlegen nur durch den Server', async () => {
  const d = db('anna');
  await assertSucceeds(setDoc(doc(d, 'users/anna'), { goals: { kcal: 2000 }, leaderboardOptIn: true }, { merge: true }));
  await assertFails(setDoc(doc(d, 'users/anna'), { username: 'A' }, { merge: true }));
  await assertFails(setDoc(doc(d, 'users/anna'), { admin: true }, { merge: true }));
  await assertFails(setDoc(doc(db('neu'), 'users/neu'), { username: 'Neu' }));
  await assertFails(deleteDoc(doc(d, 'users/anna')));
});

test('Plan und eigene Lebensmittel sind speicherbar', async () => {
  const d = db('anna');
  await assertSucceeds(setDoc(doc(d, 'users/anna/meta/plan'), { exercises: [], plans: { a: {} }, schedule: {}, history: [] }));
  await assertSucceeds(setDoc(doc(d, 'users/anna/meta/foods'), { items: [] }));
  await assertFails(setDoc(doc(d, 'users/anna/meta/anderes'), { items: [] }));
});
