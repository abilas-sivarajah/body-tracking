import { createHash, randomBytes } from 'node:crypto';

// In der Datenbank liegt nur der Hash, ein Datenbank-Auszug verrät keine gültigen Codes.
export const hashCode = code => createHash('sha256').update(String(code).trim().toUpperCase()).digest('hex');

export function generateCode() {
  const raw = randomBytes(15).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  return raw.match(/.{1,5}/g).join('-');
}

export function validateRegistration({ inviteCode, username, email, password }) {
  if (typeof inviteCode !== 'string' || !inviteCode.trim()) return 'Einladungscode fehlt.';
  if (typeof username !== 'string' || username.trim().length < 2 || username.trim().length > 30) return 'Der Name muss 2 bis 30 Zeichen haben.';
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return 'Diese E-Mail-Adresse ist ungültig.';
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) return 'Das Passwort braucht mindestens 8 Zeichen.';
  return null;
}
