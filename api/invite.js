import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, requireMember, send } from './_lib/firebase-admin.js';
import { INVITE_LIMIT, generateCode, hashCode } from './_lib/invites.js';

const status = created => ({ limit: INVITE_LIMIT, created, remaining: Math.max(0, INVITE_LIMIT - created) });

// Mitglieder laden selbst ein. Der Klartext des Codes wird nur in dieser Antwort einmal gezeigt.
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { error: 'Methode nicht erlaubt.' });
  const user = await requireMember(req, res);
  if (!user) return;

  const db = adminDb();
  const invites = db.collection('invites');
  const own = invites.where('createdBy', '==', user.uid);

  try {
    if (req.method === 'GET') return send(res, 200, status((await own.get()).size));

    // In der Transaktion zählen: Gleichzeitige Anfragen können das Limit nicht überschreiten.
    const code = generateCode();
    const created = await db.runTransaction(async tx => {
      const existing = await tx.get(own);
      if (existing.size >= INVITE_LIMIT) throw new Error('invite-limit');
      tx.create(invites.doc(hashCode(code)), { createdBy: user.uid, createdAt: FieldValue.serverTimestamp() });
      return existing.size + 1;
    });
    return send(res, 201, { code, ...status(created) });
  } catch (e) {
    if (e.message === 'invite-limit') {
      return send(res, 403, { error: `Du hast alle ${INVITE_LIMIT} Einladungen verwendet.`, ...status(INVITE_LIMIT) });
    }
    console.error('Einladung konnte nicht verarbeitet werden', e);
    return send(res, 500, { error: 'Das hat nicht geklappt. Versuch es nochmal.' });
  }
}
