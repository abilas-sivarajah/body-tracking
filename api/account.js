import { adminAuth, adminDb, requireMember, send } from './_lib/firebase-admin.js';

const MAX_AUTH_AGE_SECONDS = 300;

// Löscht Konto und alle zugehörigen Daten endgültig.
export default async function handler(req, res) {
  if (req.method !== 'DELETE') return send(res, 405, { error: 'Methode nicht erlaubt.' });
  const user = await requireMember(req, res);
  if (!user) return;

  // Der Browser bestätigt das Passwort direkt vorher. Ein alter Token reicht nicht.
  if (Date.now() / 1000 - user.auth_time > MAX_AUTH_AGE_SECONDS) {
    return send(res, 403, { error: 'Bitte bestätige dein Passwort erneut.' });
  }

  try {
    const db = adminDb();
    const entries = await db.collection('leaderboard').where('uid', '==', user.uid).get();
    const batch = db.batch();
    entries.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    await db.recursiveDelete(db.collection('users').doc(user.uid));
    await adminAuth().deleteUser(user.uid);
    return send(res, 200, { ok: true });
  } catch (e) {
    console.error('Konto konnte nicht gelöscht werden', e);
    return send(res, 500, { error: 'Konto konnte nicht gelöscht werden.' });
  }
}
