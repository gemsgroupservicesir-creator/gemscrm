import { readCounselors, updateCounselor } from './crmCounselors.js';
import { endCounselorAttendance, isAttendanceSessionOpen, startCounselorAttendance } from './crmAttendance.js';

const AUTH_KEY = 'krishna-foundation-crm-admin-v1';
const SESSION_KEY = 'krishna-foundation-crm-session-v1';
const ITERATIONS = 120_000;

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
    if (!account?.credential || session.credentialHash !== account.credential.hash) {
      endCounselorAttendance(session.attendanceSessionId);
      return null;
    }
    if (!isAttendanceSessionOpen(session.attendanceSessionId)) {
      session.attendanceSessionId = window.crypto?.randomUUID?.() || `attendance-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      startCounselorAttendance(account.id, session.attendanceSessionId);
      saveSession(session);
    }
    return { ...session, role: 'counselor', counselorId: account.id };
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
    if (!account) return false;
    const credential = account.credential;
    const submitted = await hashPassword(password, decode(credential.salt));
    if (submitted !== credential.hash) return false;
    const attendanceSessionId = window.crypto?.randomUUID?.() || `attendance-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    startCounselorAttendance(account.id, attendanceSessionId);
    saveSession({ role: 'counselor', counselorId: account.id, credentialHash: credential.hash, attendanceSessionId });
    return true;
  } catch {
    return false;
  }
}

export async function setCounselorCredentials(counselorId, username, password) {
  const account = readCounselors().find((counselor) => counselor.id === counselorId);
  if (!account) throw new Error('Counselor role not found.');
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const normalizedPassword = String(password || '');
  if (normalizedUsername.length < 3) throw new Error('Enter a sign-in ID with at least 3 characters.');
  if (normalizedPassword.length < 10) throw new Error('Enter a password with at least 10 characters.');
  const duplicate = readCounselors().some((counselor) => counselor.id !== counselorId && counselor.username.toLowerCase() === normalizedUsername);
  if (duplicate) throw new Error('That sign-in ID is already used by another counselor.');
  let admin = null;
  try {
    admin = JSON.parse(window.localStorage.getItem(AUTH_KEY) || 'null');
  } catch {
    // Ignore an unreadable admin record; counselor uniqueness is still checked.
  }
  if (admin?.username && admin.username.toLowerCase() === normalizedUsername) throw new Error('That sign-in ID is already used by the admin.');
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const credential = { salt: encode(salt), hash: await hashPassword(normalizedPassword, salt), iterations: ITERATIONS };
  updateCounselor(counselorId, { username: normalizedUsername, credential });
  return { username: normalizedUsername, credential };
}

export function deleteCounselorCredentials(counselorId) {
  updateCounselor(counselorId, {
    username: '',
    credential: null,
  });
}

export function logoutCrmAdmin() {
  try {
    const stored = window.sessionStorage.getItem(SESSION_KEY);
    const session = stored && stored !== 'authenticated' ? JSON.parse(stored) : null;
    if (session?.role === 'counselor') endCounselorAttendance(session.attendanceSessionId);
  } catch {
    // Clear an unreadable session as well; it cannot be resumed safely.
  }
  window.sessionStorage.removeItem(SESSION_KEY);
}
