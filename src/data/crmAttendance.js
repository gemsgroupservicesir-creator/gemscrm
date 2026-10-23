const STORAGE_KEY = 'krishna-foundation-crm-attendance-v1';
const UPDATE_EVENT = 'krishna-foundation-crm-attendance-updated';

export const ATTENDANCE_TARGET_MS = 8 * 60 * 60 * 1000;

function makeId() {
  return window.crypto?.randomUUID?.() || `attendance-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function readAttendance() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeAttendance(sessions) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  window.dispatchEvent(new Event(UPDATE_EVENT));
}

export function startCounselorAttendance(counselorId, sessionId = makeId(), at = new Date()) {
  const sessions = readAttendance();
  const existing = sessions.find((session) => session.id === sessionId && !session.loggedOutAt);
  if (existing) return existing;

  const loggedInAt = at.toISOString();
  const closedPrevious = sessions.map((session) => session.counselorId === counselorId && !session.loggedOutAt
    ? { ...session, loggedOutAt: loggedInAt }
    : session);
  const newSession = { id: sessionId, counselorId, loggedInAt, loggedOutAt: '' };
  writeAttendance([newSession, ...closedPrevious]);
  return newSession;
}

export function endCounselorAttendance(sessionId, at = new Date()) {
  if (!sessionId) return;
  const sessions = readAttendance();
  let changed = false;
  const loggedOutAt = at.toISOString();
  const updated = sessions.map((session) => {
    if (session.id !== sessionId || session.loggedOutAt) return session;
    changed = true;
    return { ...session, loggedOutAt };
  });
  if (changed) writeAttendance(updated);
}

export function isAttendanceSessionOpen(sessionId) {
  return Boolean(sessionId && readAttendance().some((session) => session.id === sessionId && !session.loggedOutAt));
}

export function subscribeToAttendance(callback) {
  const refresh = () => callback(readAttendance());
  window.addEventListener(UPDATE_EVENT, refresh);
  window.addEventListener('storage', refresh);
  return () => {
    window.removeEventListener(UPDATE_EVENT, refresh);
    window.removeEventListener('storage', refresh);
  };
}

function getLocalDayBounds(dayKey) {
  const [year, month, day] = dayKey.split('-').map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 1);
  return { start: start.getTime(), end: end.getTime() };
}

export function getAttendanceForDay(sessions, dayKey, now = Date.now()) {
  const { start: dayStart, end: dayEnd } = getLocalDayBounds(dayKey);
  return sessions.flatMap((session) => {
    const loginAt = new Date(session.loggedInAt).getTime();
    const logoutAt = session.loggedOutAt ? new Date(session.loggedOutAt).getTime() : now;
    if (!Number.isFinite(loginAt) || !Number.isFinite(logoutAt)) return [];
    const segmentStart = Math.max(loginAt, dayStart);
    const segmentEnd = Math.min(logoutAt, dayEnd);
    if (segmentEnd <= segmentStart) return [];
    return [{
      ...session,
      durationMs: segmentEnd - segmentStart,
      dayStartedAt: new Date(segmentStart),
      dayEndedAt: new Date(segmentEnd),
      active: !session.loggedOutAt && segmentEnd === now && now < dayEnd,
    }];
  });
}

export function getLocalDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
