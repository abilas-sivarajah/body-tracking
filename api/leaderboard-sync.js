import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, berlinDateId, requireMember, send } from './_lib/firebase-admin.js';
import { weekDayIds, weekIdOf, weekTotals } from '../public/js/logic.js';

// Berechnet die Wochenwerte serverseitig aus den Daten des Nutzers.
// Direkt schreiben darf der Browser in die Rangliste nicht (siehe firestore.rules).
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Methode nicht erlaubt.' });
  const user = await requireMember(req, res);
  if (!user) return;

  try {
    const db = adminDb(), uid = user.uid;
    const profileRef = db.collection('users').doc(uid);
    const profile = (await profileRef.get()).data() || {};
    const board = db.collection('leaderboard');

    if (profile.leaderboardOptIn !== true) {
      const mine = await board.where('uid', '==', uid).get();
      const batch = db.batch();
      mine.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      return send(res, 200, { optIn: false });
    }

    const today = berlinDateId(), week = weekIdOf(today), ids = weekDayIds(today);
    const read = async name => {
      const snaps = await db.getAll(...ids.map(id => profileRef.collection(name).doc(id)));
      return snaps.filter(s => s.exists).map(s => ({ id: s.id, ...s.data() }));
    };
    const [days, water] = await Promise.all([read('days'), read('water')]);
    const totals = weekTotals(today, days, water);
    const username = typeof profile.username === 'string' ? profile.username.slice(0, 30) : 'Anonym';

    const batch = db.batch();
    for (const metric of ['training', 'water']) {
      batch.set(board.doc(`${week}_${metric}_${uid}`), {
        uid, username, week, metric, value: totals[metric], updatedAt: FieldValue.serverTimestamp()
      });
    }
    await batch.commit();
    return send(res, 200, { optIn: true, week, ...totals });
  } catch (e) {
    console.error('Rangliste konnte nicht aktualisiert werden', e);
    return send(res, 500, { error: 'Rangliste konnte nicht aktualisiert werden.' });
  }
}
