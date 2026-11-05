// Übernimmt die Daten der alten App in ein Konto. Die Daten liegen nur lokal in private/.
// Ohne --confirm wird nichts geschrieben, sondern nur eine Zusammenfassung ausgegeben.
//
// node scripts/import-seed.mjs --key <service-account.json> --email <adresse> [--extra <export.json>] [--confirm]
import { readFileSync, existsSync } from 'node:fs';
import { FieldValue } from 'firebase-admin/firestore';
import { autoSchedule, cleanItems, cleanLog, defaultPlanDoc, DEFAULT_PLANS, isDateId, withSchedule } from '../public/js/logic.js';

const arg = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const confirm = process.argv.includes('--confirm');
const email = arg('--email');
if (!email) { console.error('--email fehlt'); process.exit(1); }
if (arg('--key')) process.env.FIREBASE_SERVICE_ACCOUNT = readFileSync(arg('--key'), 'utf8');

const privateFile = name => new URL('../private/' + name, import.meta.url);
const readPrivate = name => (existsSync(privateFile(name)) ? JSON.parse(readFileSync(privateFile(name), 'utf8')) : null);

const seed = readPrivate('seed.json');
if (!seed) { console.error('private/seed.json fehlt'); process.exit(1); }

// Neuere Daten aus dem localStorage oder der Artifact-Datenbank haben Vorrang.
const extra = arg('--extra') ? JSON.parse(readFileSync(arg('--extra'), 'utf8')) : {};
const merged = key => ({ ...seed[key], ...(extra[key] || {}) });
const trainings = merged('t'), food = merged('f'), water = merged('w');
const settings = extra.s || seed.s || {};

// Plan: Vorlage plus deine bisherigen Startgewichte
const today = new Date().toISOString().slice(0, 10);
const days = Array.isArray(settings.days) ? settings.days : [2, 4];
let plan = defaultPlanDoc('2020-01-01');
plan = withSchedule(plan, autoSchedule(days), '2020-01-01', true);
const startKg = readPrivate('start-weights.json') || {};
plan.exercises = plan.exercises.map(e => (startKg[e.id] ? { ...e, ...startKg[e.id] } : e));
const ownFoods = readPrivate('own-foods.json') || [];

const summary = {
  email, confirm,
  trainingstage: Object.keys(trainings).filter(isDateId).length,
  essenstage: Object.keys(food).filter(isDateId).length,
  wassertage: Object.keys(water).filter(isDateId).length,
  trainingswochentage: days,
  startgewichte: Object.keys(startKg).length,
  eigeneLebensmittel: ownFoods.length,
  neuesterTag: [...Object.keys(trainings), ...Object.keys(food), ...Object.keys(water)].filter(isDateId).sort().pop(),
  heute: today
};
console.log(summary);
if (!confirm) { console.log('Nichts geschrieben. Zum Importieren --confirm ergänzen.'); process.exit(0); }

const { adminAuth, adminDb } = await import('../api/_lib/firebase-admin.js');
const auth = adminAuth(), db = adminDb();

let user;
try {
  user = await auth.getUserByEmail(email);
} catch (e) {
  console.error('Konto nicht gefunden. Registriere dich zuerst in der App mit einem Einladungscode:', email);
  process.exit(1);
}
await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), member: true });

const userRef = db.collection('users').doc(user.uid);
const writer = db.bulkWriter();
writer.set(userRef, { username: user.displayName || 'Nutzer', leaderboardOptIn: false, createdAt: FieldValue.serverTimestamp() }, { merge: true });
writer.set(userRef.collection('meta').doc('plan'), plan);
writer.set(userRef.collection('meta').doc('foods'), { items: ownFoods });

const allFull = DEFAULT_PLANS.full.exerciseIds;
for (const [id, d] of Object.entries(trainings)) {
  if (!isDateId(id)) continue;
  const doc = { date: id, entries: d.entries || {} };
  if (Object.keys(doc.entries).length) doc.plannedIds = allFull;
  if (d.bw) doc.bw = d.bw;
  if (d.sl) doc.sl = { from: d.sl.from, to: d.sl.to };
  if (d.note) doc.note = String(d.note).slice(0, 300);
  if (d.createdAt) doc.createdAt = d.createdAt;
  writer.set(userRef.collection('days').doc(id), doc);
}
for (const [id, d] of Object.entries(food)) {
  if (isDateId(id)) writer.set(userRef.collection('food').doc(id), { date: id, items: cleanItems(d.items) });
}
for (const [id, d] of Object.entries(water)) {
  if (isDateId(id)) writer.set(userRef.collection('water').doc(id), { date: id, log: cleanLog(d.log) });
}
await writer.close();
console.log('Import abgeschlossen für', email);
