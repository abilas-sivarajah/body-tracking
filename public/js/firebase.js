import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import {
  initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager,
  terminate, clearIndexedDbPersistence
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';

// Diese Werte sind bei Firebase-Web-Apps öffentlich. Der Schutz der Daten liegt in firestore.rules.
const firebaseConfig = {
  apiKey: 'AIzaSyDjBTi4zq3aMLI1-LDmN6prs6SA0vyc4HE',
  authDomain: 'body-tracking-7febc.firebaseapp.com',
  projectId: 'body-tracking-7febc',
  storageBucket: 'body-tracking-7febc.firebasestorage.app',
  messagingSenderId: '511266858898',
  appId: '1:511266858898:web:4e07016e6888ef772ac34b'
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
