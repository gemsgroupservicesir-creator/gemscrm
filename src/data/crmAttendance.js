import { crmRequest, readCache, refreshCrmData, subscribeToCache } from './crmApi.js';

export const ATTENDANCE_TARGET_MS = 8 * 60 * 60 * 1000;
export function readAttendance() { return readCache('attendance'); }
export function subscribeToAttendance(callback) { return subscribeToCache('attendance', callback); }

export async function startCounselorAttendance(counselorId, sessionId) {
  return { id: sessionId, counselorId, loggedInAt: new Date().toISOString(), loggedOutAt: '' };
}

export async function endCounselorAttendance(sessionId) {
  if (!sessionId) return;
  await crmRequest('attendance-end', { id: sessionId });
  await refreshCrmData();
}

export function isAttendanceSessionOpen(sessionId) {
  return Boolean(sessionId && readAttendance().some((session) => session.id === sessionId && !session.loggedOutAt));
}

function getLocalDayBounds(dayKey) {
  const [year, month, day] = dayKey.split('-').map(Number);
  return { start: new Date(year, month - 1, day).getTime(), end: new Date(year, month - 1, day + 1).getTime() };
}

export function getAttendanceForDay(sessions, dayKey, now = Date.now()) {
  const { start: dayStart, end: dayEnd } = getLocalDayBounds(dayKey);
  return sessions.flatMap((session) => {
    const loginAt = new Date(session.loggedInAt).getTime();
    const logoutAt = session.loggedOutAt ? new Date(session.loggedOutAt).getTime() : now;
    if (!Number.isFinite(loginAt) || !Number.isFinite(logoutAt)) return [];
    const segmentStart = Math.max(loginAt, dayStart), segmentEnd = Math.min(logoutAt, dayEnd);
    if (segmentEnd <= segmentStart) return [];
    return [{ ...session, durationMs: segmentEnd - segmentStart, dayStartedAt: new Date(segmentStart), dayEndedAt: new Date(segmentEnd), active: !session.loggedOutAt && segmentEnd === now && now < dayEnd }];
  });
}

export function getLocalDayKey(date = new Date()) {
  const year = date.getFullYear(), month = String(date.getMonth() + 1).padStart(2, '0'), day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
