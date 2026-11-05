import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb, jsonBody, send } from './_lib/firebase-admin.js';
import { hashCode, validateRegistration } from './_lib/invites.js';

const INVALID = 'Dieser Einladungscode ist ungültig oder wurde schon benutzt.';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Methode nicht erlaubt.' });
  const body = jsonBody(req);
  const problem = validateRegistration(body);
  if (problem) return send(res, 400, { error: problem });

  const db = adminDb();
  const inviteRef = db.collection('invites').doc(hashCode(body.inviteCode));

  // Code zuerst reservieren: Zwei gleichzeitige Anfragen können ihn nicht beide nutzen.
  try {
    await db.runTransaction(async tx => {
      const snap = await tx.get(inviteRef);
      if (!snap.exists || snap.data().usedBy) throw new Error('invalid-invite');
      tx.update(inviteRef, { usedBy: 'pending', reservedAt: FieldValue.serverTimestamp() });
    });
  } catch (e) {
    if (e.message === 'invalid-invite') return send(res, 403, { error: INVALID });
    console.error('Einladung konnte nicht reserviert werden', e);
    return send(res, 500, { error: 'Das hat nicht geklappt. Versuch es nochmal.' });
  }

  const release = () => inviteRef.update({ usedBy: FieldValue.delete(), reservedAt: FieldValue.delete() }).catch(e => console.error(e));
  const username = body.username.trim();
  let user;
  try {
    user = await adminAuth().createUser({ email: body.email.trim(), password: body.password, displayName: username });
  } catch (e) {
    await release();
    if (e.code === 'auth/email-already-exists') return send(res, 409, { error: 'Für diese E-Mail gibt es schon ein Konto.' });
    if (e.code === 'auth/invalid-email') return send(res, 400, { error: 'Diese E-Mail-Adresse ist ungültig.' });
    if (e.code === 'auth/invalid-password') return send(res, 400, { error: 'Das Passwort braucht mindestens 8 Zeichen.' });
    console.error('Konto konnte nicht angelegt werden', e);
    return send(res, 500, { error: 'Das hat nicht geklappt. Versuch es nochmal.' });
  }

  try {
    await adminAuth().setCustomUserClaims(user.uid, { member: true });
    const batch = db.batch();
    batch.set(db.collection('users').doc(user.uid), { username, leaderboardOptIn: false, createdAt: FieldValue.serverTimestamp() });
    batch.update(inviteRef, { usedBy: user.uid, usedAt: FieldValue.serverTimestamp(), reservedAt: FieldValue.delete() });
    await batch.commit();
  } catch (e) {
    console.error('Registrierung konnte nicht abgeschlossen werden', e);
    await adminAuth().deleteUser(user.uid).catch(err => console.error(err));
    await release();
    return send(res, 500, { error: 'Das hat nicht geklappt. Versuch es nochmal.' });
  }
  return send(res, 201, { ok: true });
}
