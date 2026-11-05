import { auth, wipeLocalCache } from './firebase.js';
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail,
  reauthenticateWithCredential, EmailAuthProvider
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';

export function onAuthChange(callback) { return onAuthStateChanged(auth, callback); }

export async function login(email, password) {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function register({ inviteCode, username, email, password }) {
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteCode, username, email, password })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Registrierung fehlgeschlagen.'), { friendly: true });
  await signInWithEmailAndPassword(auth, email, password);
}

export function resetPassword(email) { return sendPasswordResetEmail(auth, email); }

export async function logout() {
  await signOut(auth);
  await wipeLocalCache();
}

export async function hasMemberClaim(user) {
  const result = await user.getIdTokenResult();
  return result.claims.member === true;
}

export async function authFetch(url, options = {}, forceRefresh = false) {
  const token = await auth.currentUser.getIdToken(forceRefresh);
  return fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: 'Bearer ' + token } });
}

// Konto löschen verlangt ein frisch eingegebenes Passwort.
export async function deleteAccount(password) {
  const user = auth.currentUser;
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  const res = await authFetch('/api/account', { method: 'DELETE' }, true);
  if (!res.ok) throw new Error('Konto konnte nicht gelöscht werden.');
  await signOut(auth).catch(() => {});
  await wipeLocalCache();
}

export function authErrorText(e) {
  if (e && e.friendly) return e.message;
  const c = e && e.code;
  if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found') return 'E-Mail oder Passwort stimmt nicht.';
  if (c === 'auth/invalid-email') return 'Diese E-Mail-Adresse ist ungültig.';
  if (c === 'auth/too-many-requests') return 'Zu viele Versuche. Bitte warte kurz.';
  if (c === 'auth/network-request-failed') return 'Keine Verbindung. Versuch es gleich nochmal.';
  return 'Das hat nicht geklappt. Versuch es nochmal.';
}
