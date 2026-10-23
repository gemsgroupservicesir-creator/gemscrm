import { readCounselors, updateCounselor } from './crmCounselors.js';

const AUTH_KEY = 'krishna-foundation-crm-admin-v1';
const SESSION_KEY = 'krishna-foundation-crm-session-v1';
const ITERATIONS = 120_000;
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';

function encode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decode(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function hashPassword(password, salt) {
  const key = await window.crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await window.crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);
  return encode(new Uint8Array(bits));
}

export function crmHasAdmin() {
  return Boolean(window.localStorage.getItem(AUTH_KEY));
}

export function crmGetSession() {
  const stored = window.sessionStorage.getItem(SESSION_KEY);
  if (!stored) return null;
  if (stored === 'authenticated') return { role: 'admin' };
  try {
    const session = JSON.parse(stored);
    if (session?.role === 'admin') return session;
    if (session?.role !== 'counselor' || !session.counselorId) return null;
    const account = readCounselors().find((counselor) => counselor.id === session.counselorId);
    if (!account?.credential || session.credentialHash !== account.credential.hash || !Object.values(account.permissions || {}).some(Boolean)) return null;
    return { role: 'counselor', counselorId: account.id };
  } catch {
    return null;
  }
}

function saveSession(session) {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function crmIsAuthenticated() {
  return Boolean(crmGetSession());
}

export async function createCrmAdmin(username, password) {
  const normalizedUsername = username.trim().toLowerCase();
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const record = { username: normalizedUsername, salt: encode(salt), hash: await hashPassword(password, salt), iterations: ITERATIONS };
  window.localStorage.setItem(AUTH_KEY, JSON.stringify(record));
  saveSession({ role: 'admin' });
}

export async function authenticateCrmAdmin(username, password) {
  try {
    const record = JSON.parse(window.localStorage.getItem(AUTH_KEY) || 'null');
    if (!record || record.username !== username.trim().toLowerCase()) return false;
    const submitted = await hashPassword(password, decode(record.salt));
    if (submitted !== record.hash) return false;
    saveSession({ role: 'admin' });
    return true;
  } catch {
    return false;
  }
}

export async function authenticateCrmCounselor(username, password) {
  try {
    const normalized = username.trim().toLowerCase();
    const account = readCounselors().find((counselor) => counselor.username.toLowerCase() === normalized && counselor.credential?.hash);
    if (!account || !Object.values(account.permissions || {}).some(Boolean)) return false;
    const credential = account.credential;
    const submitted = await hashPassword(password, decode(credential.salt));
    if (submitted !== credential.hash) return false;
    saveSession({ role: 'counselor', counselorId: account.id, credentialHash: credential.hash });
    return true;
  } catch {
    return false;
  }
}

function randomText(length) {
  const bytes = window.crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]).join('');
}

export async function generateCounselorCredentials(counselorId) {
  const account = readCounselors().find((counselor) => counselor.id === counselorId);
  if (!account) throw new Error('Counselor role not found.');
  const existingUsernames = new Set(readCounselors().map((counselor) => counselor.username.toLowerCase()));
  try {
    const admin = JSON.parse(window.localStorage.getItem(AUTH_KEY) || 'null');
    if (admin?.username) existingUsernames.add(admin.username.toLowerCase());
  } catch {
    // Ignore an unreadable admin record; the generated username remains random.
  }
  let username;
  do {
    username = `counselor-${randomText(6).toLowerCase()}`;
  } while (existingUsernames.has(username));
  const password = randomText(16);
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const credential = { salt: encode(salt), hash: await hashPassword(password, salt), iterations: ITERATIONS };
  updateCounselor(counselorId, { username, credential });
  return { username, password };
}

export function deleteCounselorCredentials(counselorId) {
  updateCounselor(counselorId, {
    username: '',
    credential: null,
  });
}

export function logoutCrmAdmin() {
  window.sessionStorage.removeItem(SESSION_KEY);
}
