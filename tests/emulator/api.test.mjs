// Testet die Vercel-Functions gegen die Emulatoren für Auth und Firestore.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';

process.env.GCLOUD_PROJECT = 'demo-body-tracking';
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Emulator fehlt');

const { adminAuth, adminDb, berlinDateId } = await import('../../api/_lib/firebase-admin.js');
const { generateCode, hashCode } = await import('../../api/_lib/invites.js');
const register = (await import('../../api/register.js')).default;
const sync = (await import('../../api/leaderboard-sync.js')).default;
const account = (await import('../../api/account.js')).default;
const product = (await import('../../api/product.js')).default;
const { weekIdOf } = await import('../../public/js/logic.js');

function call(handler, { method = 'POST', body = {}, token, query = {} } = {}) {
  return new Promise((resolve, reject) => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(data) { resolve({ status: this.code, data }); } };
    Promise.resolve(handler({ method, body, query, headers: token ? { authorization: 'Bearer ' + token } : {} }, res)).catch(reject);
  });
}
async function invite() {
  const code = generateCode();
  await adminDb().collection('invites').doc(hashCode(code)).set({ note: 'test' });
  return code;
}
async function signIn(email, password) {
  const r = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=x`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const d = await r.json();
  assert.ok(d.idToken, JSON.stringify(d));
  return { token: d.idToken, uid: d.localId };
}
let counter = 0;
const newUser = () => ({ username: 'Testperson', email: `t${Date.now()}${counter++}@example.com`, password: 'geheim1234' });
async function member() {
  const u = newUser();
  const r = await call(register, { body: { ...u, inviteCode: await invite() } });
  assert.equal(r.status, 201);
  return { ...u, ...(await signIn(u.email, u.password)) };
}

before(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-body-tracking/databases/(default)/documents`, { method: 'DELETE' });
});

test('Registrierung ohne oder mit falschem Code schlägt fehl', async () => {
  const u = newUser();
  assert.equal((await call(register, { body: u })).status, 400);
  assert.equal((await call(register, { body: { ...u, inviteCode: 'FALSCH' } })).status, 403);
  await assert.rejects(adminAuth().getUserByEmail(u.email));
});

test('Ein Code gilt nur einmal, auch bei gleichzeitigen Anfragen', async () => {
  const code = await invite();
  const results = await Promise.all([newUser(), newUser(), newUser()].map(u => call(register, { body: { ...u, inviteCode: code } })));
  assert.equal(results.filter(r => r.status === 201).length, 1, JSON.stringify(results.map(r => r.status)));
  const u = newUser();
  assert.equal((await call(register, { body: { ...u, inviteCode: code } })).status, 403);
});

test('Registrierung setzt Claim und Profil, der Code ist danach verbraucht', async () => {
  const code = await invite(), u = newUser();
  assert.equal((await call(register, { body: { ...u, inviteCode: code } })).status, 201);
  const user = await adminAuth().getUserByEmail(u.email);
  assert.equal(user.customClaims.member, true);
  const profile = (await adminDb().collection('users').doc(user.uid).get()).data();
  assert.equal(profile.username, 'Testperson');
  assert.equal(profile.leaderboardOptIn, false);
  const inv = (await adminDb().collection('invites').doc(hashCode(code)).get()).data();
  assert.equal(inv.usedBy, user.uid);
});

test('Doppelte E-Mail gibt den Code wieder frei', async () => {
  const m = await member(), code = await invite();
  const r = await call(register, { body: { username: 'Zweite', email: m.email, password: 'geheim1234', inviteCode: code } });
  assert.equal(r.status, 409);
  const inv = (await adminDb().collection('invites').doc(hashCode(code)).get()).data();
  assert.equal(inv.usedBy, undefined);
});

test('Functions lehnen fehlende Anmeldung ab', async () => {
  assert.equal((await call(sync)).status, 401);
  assert.equal((await call(account, { method: 'DELETE' })).status, 401);
  assert.equal((await call(product, { method: 'GET', query: { ean: '12345678' } })).status, 401);
});

test('Konto ohne member-Claim hat keinen Zugriff', async () => {
  const email = `ohne${Date.now()}@example.com`;
  await adminAuth().createUser({ email, password: 'geheim1234' });
  const { token } = await signIn(email, 'geheim1234');
  assert.equal((await call(sync, { token })).status, 401);
});

test('Rangliste nur mit Opt-in, Werte kommen vom Server', async () => {
  const m = await member(), db = adminDb(), today = berlinDateId();
  const ref = db.collection('users').doc(m.uid);
  await ref.collection('days').doc(today).set({ date: today, entries: { a: { sets: [{ kg: 50, reps: 10 }], dropKg: 20, dropReps: 5 } } });
  await ref.collection('water').doc(today).set({ date: today, log: [{ id: '1', ml: 750 }] });
  const board = db.collection('leaderboard'), week = weekIdOf(today);

  assert.equal((await call(sync, { token: m.token })).data.optIn, false);
  assert.equal((await board.where('uid', '==', m.uid).get()).size, 0);

  await ref.update({ leaderboardOptIn: true });
  const r = await call(sync, { token: m.token });
  assert.equal(r.data.training, 600);
  assert.equal(r.data.water, 750);
  const entry = (await board.doc(`${week}_training_${m.uid}`).get()).data();
  assert.equal(entry.value, 600);
  assert.equal(entry.username, 'Testperson');
  assert.equal(entry.email, undefined);

  await ref.update({ leaderboardOptIn: false });
  await call(sync, { token: m.token });
  assert.equal((await board.where('uid', '==', m.uid).get()).size, 0, 'Abmelden entfernt die Einträge');
});

test('Konto löschen entfernt Daten, Rangliste und Anmeldung', async () => {
  const m = await member(), db = adminDb(), today = berlinDateId();
  const ref = db.collection('users').doc(m.uid);
  await ref.update({ leaderboardOptIn: true });
  await ref.collection('days').doc(today).set({ date: today, entries: {} });
  await call(sync, { token: m.token });
  assert.equal((await call(account, { method: 'DELETE', token: m.token })).status, 200);
  assert.equal((await ref.get()).exists, false);
  assert.equal((await ref.collection('days').get()).size, 0);
  assert.equal((await db.collection('leaderboard').where('uid', '==', m.uid).get()).size, 0);
  await assert.rejects(adminAuth().getUser(m.uid));
});

test('Barcode wird geprüft, bevor etwas nach außen geht', async () => {
  const m = await member();
  assert.equal((await call(product, { method: 'GET', token: m.token, query: { ean: 'abc' } })).status, 400);
  delete process.env.OFF_CONTACT;
  assert.equal((await call(product, { method: 'GET', token: m.token, query: { ean: '4001234567890' } })).status, 503);
});

test('Falsche HTTP-Methoden werden abgelehnt', async () => {
  assert.equal((await call(register, { method: 'GET' })).status, 405);
  assert.equal((await call(sync, { method: 'GET' })).status, 405);
  assert.equal((await call(account, { method: 'POST' })).status, 405);
  assert.equal((await call(product, { method: 'POST' })).status, 405);
});
