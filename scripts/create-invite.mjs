// Erzeugt Einladungscodes. Der Klartext wird nur hier einmal angezeigt.
// Aufruf: node scripts/create-invite.mjs --key <service-account.json> [Anzahl] [Notiz]
import { readFileSync } from 'node:fs';
import { FieldValue } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const keyAt = args.indexOf('--key');
if (keyAt >= 0) { process.env.FIREBASE_SERVICE_ACCOUNT = readFileSync(args[keyAt + 1], 'utf8'); args.splice(keyAt, 2); }

const { adminDb } = await import('../api/_lib/firebase-admin.js');
const { generateCode, hashCode } = await import('../api/_lib/invites.js');

const count = Math.max(1, Math.min(50, Number(args[0]) || 1));
const note = args[1] || '';
const db = adminDb();
for (let i = 0; i < count; i++) {
  const code = generateCode();
  await db.collection('invites').doc(hashCode(code)).set({ note, createdAt: FieldValue.serverTimestamp() });
  console.log(code);
}
