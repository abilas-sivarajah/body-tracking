import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import {
  initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager,
  terminate, clearIndexedDbPersistence
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';

// Diese Werte sind bei Firebase-Web-Apps öffentlich. Der Schutz der Daten liegt in firestore.rules.
const firebaseConfig = {
  apiKey: 'AIzaSyDpGAhc8O6gB84dMDR1b3NjEcaLz3LrFts',
  authDomain: 'fittness-app-68e99.firebaseapp.com',
  projectId: 'fittness-app-68e99',
  storageBucket: 'fittness-app-68e99.firebasestorage.app',
  messagingSenderId: '545223523130',
  appId: '1:545223523130:web:3e52d5d7053f32012fee03'
};

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
export const useEmulator = isLocal && new URLSearchParams(location.search).has('emulator');

const app = initializeApp(useEmulator ? { ...firebaseConfig, projectId: 'demo-body-tracking' } : firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  // Offline-Cache: Einträge im Gym gehen auch ohne Empfang
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true
});

if (useEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

// Beim Abmelden darf nichts für den nächsten Nutzer am Gerät zurückbleiben.
export async function wipeLocalCache() {
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch (e) {
    console.warn('Lokaler Cache konnte nicht vollständig geleert werden (andere Tabs offen?)', e);
  }
}
