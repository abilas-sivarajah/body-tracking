// Speicherschicht auf Firestore.
// Schreibvorgänge warten nicht auf den Server: Der Offline-Cache übernimmt sie sofort,
// die Live-Listener aktualisieren die Oberfläche, die Synchronisierung folgt im Hintergrund.
import { db } from './firebase.js';
import {
  doc, collection, query, orderBy, limit, where, onSnapshot, setDoc, updateDoc, deleteDoc, deleteField,
  arrayUnion, arrayRemove, writeBatch, getDoc, getDocs
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';
import { isDateId } from './logic.js';

export function createStore(uid, onWriteError) {
  const userRef = doc(db, 'users', uid);
  const days = collection(userRef, 'days');
  const food = collection(userRef, 'food');
  const water = collection(userRef, 'water');
  const planRef = doc(userRef, 'meta', 'plan');
  const foodsRef = doc(userRef, 'meta', 'foods');

  // Für arrayRemove wird das exakt gespeicherte Objekt gebraucht.
  const rawFood = new Map(), rawWater = new Map();
  const unsubs = [];

  const fire = promise => { promise.catch(e => { console.error('Schreibfehler', e); onWriteError(e); }); return Promise.resolve(); };
  const dayDocs = snap => snap.docs.filter(d => isDateId(d.id));

  function listen(target, next, onErr) {
    unsubs.push(onSnapshot(target, next, e => { console.error('Lesefehler', e); if (onErr) onErr(e); }));
  }

  return {
    stop() { unsubs.splice(0).forEach(u => { try { u(); } catch (e) { /* bereits beendet */ } }); },

    onProfile(cb, onErr) { listen(userRef, s => cb(s.exists() ? s.data() : null), onErr); },
    onPlan(cb, onErr) { listen(planRef, s => cb(s.exists() ? s.data() : null), onErr); },
    onFoods(cb, onErr) { listen(foodsRef, s => cb(s.exists() && Array.isArray(s.data().items) ? s.data().items : []), onErr); },
    onDays(cb, onErr) {
      listen(query(days, orderBy('date', 'desc'), limit(300)), s => cb(dayDocs(s).map(d => ({ id: d.id, data: d.data() }))), onErr);
    },
    onFood(cb, onErr) {
      listen(query(food, orderBy('date', 'desc'), limit(14)), s => {
        rawFood.clear();
        cb(dayDocs(s).map(d => {
          const items = Array.isArray(d.data().items) ? d.data().items : [];
          rawFood.set(d.id, items);
          return { id: d.id, items };
        }));
      }, onErr);
    },
    onWater(cb, onErr) {
      listen(query(water, orderBy('date', 'desc'), limit(14)), s => {
        rawWater.clear();
        cb(dayDocs(s).map(d => {
          const log = Array.isArray(d.data().log) ? d.data().log : [];
          rawWater.set(d.id, log);
          return { id: d.id, log };
        }));
      }, onErr);
    },

    // merge:true führt `entries` tief zusammen, andere Übungen des Tages bleiben erhalten.
    saveEntry(date, exId, entry, plannedIds) {
      return fire(setDoc(doc(days, date), { date, plannedIds, entries: { [exId]: entry } }, { merge: true }));
    },
    patchDay(date, patch) {
      return fire(setDoc(doc(days, date), { date, ...patch }, { merge: true }));
    },
    // Entfernt nur Training und Notiz. Körpergewicht und Schlaf des Tages bleiben.
    deleteTraining(session) {
      const ref = doc(days, session.id);
      if (!session.bw && !session.sl) return fire(deleteDoc(ref));
      return fire(updateDoc(ref, { entries: {}, note: deleteField(), plannedIds: deleteField() }));
    },

    addFood(date, items) {
      return fire(setDoc(doc(food, date), { date, items: arrayUnion(...items) }, { merge: true }));
    },
    removeFood(date, id) {
      const raw = (rawFood.get(date) || []).find(it => it.id === id);
      if (!raw) return Promise.resolve();
      return fire(updateDoc(doc(food, date), { items: arrayRemove(raw) }));
    },
    replaceFood(date, id, replacement) {
      const raw = (rawFood.get(date) || []).find(it => it.id === id);
      if (!raw) return Promise.resolve();
      const ref = doc(food, date), batch = writeBatch(db);
      batch.update(ref, { items: arrayRemove(raw) });
      batch.update(ref, { items: arrayUnion(replacement) });
      return fire(batch.commit());
    },

    addWater(date, entry) {
      return fire(setDoc(doc(water, date), { date, log: arrayUnion(entry) }, { merge: true }));
    },
    removeWater(date, id) {
      const raw = (rawWater.get(date) || []).find(e => e.id === id);
      if (!raw) return Promise.resolve();
      return fire(updateDoc(doc(water, date), { log: arrayRemove(raw) }));
    },

    savePlan(plan) { return fire(setDoc(planRef, plan)); },
    saveFoods(items) { return fire(setDoc(foodsRef, { items })); },
    saveProfile(patch) { return fire(setDoc(userRef, patch, { merge: true })); },

    async exportAll() {
      const read = async col => (await getDocs(col)).docs.map(d => ({ id: d.id, ...d.data() }));
      const one = async ref => { const s = await getDoc(ref); return s.exists() ? s.data() : null; };
      const [d, f, w, prof, planDoc, foods] = await Promise.all([read(days), read(food), read(water), one(userRef), one(planRef), one(foodsRef)]);
      return { exportedAt: new Date().toISOString(), profile: prof, plan: planDoc, foods, days: d, food: f, water: w };
    }
  };
}

export async function loadLeaderboard(week, metric, count = 20) {
  const snap = await getDocs(query(
    collection(db, 'leaderboard'),
    where('week', '==', week), where('metric', '==', metric), orderBy('value', 'desc'), limit(count)
  ));
  return snap.docs.map(d => d.data());
}
