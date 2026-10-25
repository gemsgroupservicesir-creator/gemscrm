import { crmRequest } from './crmApi.js';

function normalizeSession(value) {
  if (!value) return null;
  return {
    role: value.role,
    id: value.id,
    name: value.name,
    username: value.username,
    permissions: value.permissions || {},
    counselorId: value.role === 'counselor' ? value.id : '',
    attendanceSessionId: value.attendanceId || '',
  };
}

export async function crmHasAdmin() {
  const result = await crmRequest('auth-status');
  return { adminExists: Boolean(result.adminExists), setupEnabled: Boolean(result.setupEnabled) };
}

export async function crmGetSession() {
  const result = await crmRequest('session');
  return normalizeSession(result.session);
}

export async function authenticateCrm(username, password) {
  const result = await crmRequest('login', { username, password });
  return normalizeSession({ ...result.user, attendanceId: result.attendanceId });
}

export async function createCrmAdmin(username, password, token) {
  const result = await crmRequest('bootstrap', { username, password, token });
  return normalizeSession({ ...result.user, attendanceId: result.attendanceId });
}

export async function setCounselorCredentials(counselorId, username, password) {
  return crmRequest('counselor-credentials', { id: counselorId, username, password });
}

export async function deleteCounselorCredentials(counselorId) {
  await crmRequest('counselor-delete-credentials', { id: counselorId });
}

export async function deleteCrmCounselor(counselorId) {
  await crmRequest('counselor-delete', { id: counselorId });
}

export async function logoutCrmAdmin() {
  try { await crmRequest('logout', {}); } catch { /* Clearing server session is best effort when the database is unavailable. */ }
}
