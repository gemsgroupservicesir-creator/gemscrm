import React, { useEffect, useMemo, useState } from 'react';
import { coursesOfInterest } from './data/siteContent.js';
import { addLead, exportLeadsCsv, readLeads, subscribeToLeads, updateLead } from './data/crmStore.js';
import { readCounselors, saveCounselors, subscribeToCounselors } from './data/crmCounselors.js';
import { authenticateCrmAdmin, authenticateCrmCounselor, createCrmAdmin, crmGetSession, crmHasAdmin, deleteCounselorCredentials, generateCounselorCredentials, logoutCrmAdmin } from './data/crmAuth.js';
import WebsiteEditor from './WebsiteEditor.jsx';
import { LandingPageManager } from './LandingPages.jsx';
import { readLandingPages, saveLandingPage } from './data/landingPages.js';
import { appUrl } from './data/siteUrl.js';
import { ATTENDANCE_TARGET_MS, endCounselorAttendance, getAttendanceForDay, getLocalDayKey, readAttendance, subscribeToAttendance } from './data/crmAttendance.js';

const statuses = ['New', 'Contacted', 'Follow-up', 'Application', 'Enrolled', 'Closed'];
const activeStatuses = new Set(['New', 'Contacted', 'Follow-up', 'Application']);

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function formatNoteDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

function formatDuration(milliseconds) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function formatClock(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(value);
}

function formatTimestamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(date);
}

function AttendancePanel({ counselors, counselorId, isAdmin }) {
  const [sessions, setSessions] = useState(() => readAttendance());
  const [selectedDate, setSelectedDate] = useState(() => getLocalDayKey());
  const [now, setNow] = useState(Date.now());
  const dateIsToday = selectedDate === getLocalDayKey(new Date(now));
  const visibleCounselors = isAdmin ? counselors : counselors.filter((counselor) => counselor.id === counselorId);

  useEffect(() => subscribeToAttendance(setSessions), []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const dailySessions = useMemo(() => getAttendanceForDay(sessions, selectedDate, now), [sessions, selectedDate, now]);
  const summaries = visibleCounselors.map((counselor) => {
    const entries = dailySessions.filter((session) => session.counselorId === counselor.id);
    const totalMs = entries.reduce((total, session) => total + session.durationMs, 0);
    const firstLogin = entries.reduce((earliest, session) => !earliest || session.dayStartedAt < earliest ? session.dayStartedAt : earliest, null);
    const lastEntry = entries.reduce((latest, session) => !latest || session.dayEndedAt > latest.dayEndedAt ? session : latest, null);
    const active = entries.some((session) => session.active);
    const targetMet = totalMs >= ATTENDANCE_TARGET_MS;
    const status = targetMet ? '8-hour target met' : active && dateIsToday ? 'In progress' : totalMs ? 'Below target' : 'No session';
    return { counselor, entries, totalMs, firstLogin, lastEntry, active, targetMet, status };
  });
  const sessionRows = dailySessions.filter((session) => isAdmin || session.counselorId === counselorId)
    .sort((left, right) => new Date(left.loggedInAt) - new Date(right.loggedInAt));

  return <section className="crm-attendance-view" aria-labelledby="crm-attendance-title">
    <div className="crm-title-row crm-attendance-title-row">
      <div><span className="crm-kicker">GEMS GROUP SERVICES · TEAM</span><h1 id="crm-attendance-title">{isAdmin ? 'Counselor attendance' : 'My attendance'}</h1><p>Daily login time is counted toward an 8-hour attendance target.</p></div>
      <label className="crm-attendance-date">Attendance date<input type="date" value={selectedDate} onChange={(event) => { if (event.target.value) setSelectedDate(event.target.value); }} /></label>
    </div>
    <div className="crm-attendance-target-note"><span className="crm-attendance-target-icon">◷</span><div><strong>Daily target: 8 hours</strong><p>Time is totaled by local calendar day. Sign out when you finish so your end time is recorded.</p></div></div>

    <div className="crm-attendance-table-wrap">
      <table className="crm-attendance-table">
        <thead><tr><th>Counselor</th><th>First login</th><th>Last logout</th><th>Time counted</th><th>Attendance</th></tr></thead>
        <tbody>{summaries.map(({ counselor, totalMs, firstLogin, lastEntry, active, targetMet, status }) => {
          const percent = Math.min(100, Math.round((totalMs / ATTENDANCE_TARGET_MS) * 100));
          return <tr key={counselor.id}>
            <td><strong>{counselor.name}</strong></td>
            <td>{firstLogin ? formatClock(firstLogin) : '—'}</td>
            <td>{active && dateIsToday ? <span className="crm-attendance-live">Signed in</span> : lastEntry ? formatClock(lastEntry.dayEndedAt) : '—'}</td>
            <td className="crm-attendance-duration">{formatDuration(totalMs)}</td>
            <td><div className="crm-attendance-progress" role="progressbar" aria-label={`${counselor.name} attendance`} aria-valuemin="0" aria-valuemax="8" aria-valuenow={Math.min(8, totalMs / 3_600_000)}><span style={{ width: `${percent}%` }} /></div><span className={`crm-attendance-status ${targetMet ? 'complete' : active ? 'active' : ''}`}>{status}</span></td>
          </tr>;
        })}</tbody>
      </table>
      {!summaries.length && <div className="crm-attendance-empty">Counselor accounts will appear here.</div>}
    </div>

    <section className="crm-attendance-sessions" aria-labelledby="crm-attendance-sessions-title">
      <div className="crm-panel-heading"><div><h2 id="crm-attendance-sessions-title">Login and logout times</h2><p>{sessionRows.length ? `${sessionRows.length} session${sessionRows.length === 1 ? '' : 's'} on ${new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${selectedDate}T12:00:00`))}` : 'No sign-in sessions recorded for this date.'}</p></div></div>
      {sessionRows.length > 0 && <div className="crm-attendance-log-wrap"><table className="crm-attendance-log">
        <thead><tr>{isAdmin && <th>Counselor</th>}<th>Login</th><th>Logout</th><th>Time counted that day</th></tr></thead>
        <tbody>{sessionRows.map((session) => <tr key={session.id}>
          {isAdmin && <td>{counselors.find((counselor) => counselor.id === session.counselorId)?.name || 'Counselor'}</td>}
          <td>{formatTimestamp(session.loggedInAt)}</td>
          <td>{session.active ? <span className="crm-attendance-live">Signed in</span> : formatTimestamp(session.loggedOutAt)}</td>
          <td>{formatDuration(session.durationMs)}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    <p className="crm-privacy-note">Attendance records are saved in this browser. They are not shared with counselors on other devices.</p>
  </section>;
}

function LeadDialog({ lead, counselors, isAdmin, onClose }) {
  const [saved, setSaved] = useState(false);
  const editing = Boolean(lead);

  function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values = {
      name: String(data.get('name') || ''),
      email: String(data.get('email') || ''),
      phone: String(data.get('phone') || ''),
      faculty: String(data.get('course') || data.get('faculty') || ''),
      course: String(data.get('course') || data.get('faculty') || ''),
      status: String(data.get('status') || 'New'),
      assignedCounselorId: isAdmin ? String(data.get('assignedCounselorId') || '') : (lead?.assignedCounselorId || ''),
    };
    const noteBody = String(data.get('newNote') || '').trim();
    const previousNotes = Array.isArray(lead?.noteHistory) ? lead.noteHistory : [];
    const noteHistory = noteBody ? [...previousNotes, {
      id: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      body: noteBody,
      createdAt: new Date().toISOString(),
    }] : previousNotes;
    if (editing) updateLead(lead.id, { ...values, noteHistory });
    else addLead({ ...values, noteHistory, source: 'Added in CRM' });
    setSaved(true);
    window.setTimeout(onClose, 450);
  }

  return (
    <div className="crm-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="crm-modal" role="dialog" aria-modal="true" aria-labelledby="lead-dialog-title">
        <div className="crm-modal-head">
          <div><span className="crm-kicker">{editing ? 'Lead details' : 'New record'}</span><h2 id="lead-dialog-title">{editing ? 'Update lead' : 'Add a lead'}</h2></div>
          <button className="crm-icon-button" type="button" onClick={onClose} aria-label="Close dialog">×</button>
        </div>
        <form className="crm-form" onSubmit={handleSubmit}>
          {lead?.image && <div className="crm-lead-image-preview"><img src={appUrl(lead.image)} alt={`${lead.name}'s uploaded image`} /><span>Student image</span></div>}
          <div className="crm-form-grid">
            <label>Full name<input name="name" defaultValue={lead?.name || ''} required autoFocus /></label>
            <label>Email address<input name="email" type="email" defaultValue={lead?.email || ''} required /></label>
            <label>Phone number<input name="phone" type="tel" defaultValue={lead?.phone || ''} required /></label>
            <label>Course<select name="course" defaultValue={lead?.course || lead?.faculty || ''} required><option value="" disabled>Select a course</option>{(lead?.course && !coursesOfInterest.includes(lead.course) ? [lead.course, ...coursesOfInterest] : lead?.faculty && !coursesOfInterest.includes(lead.faculty) ? [lead.faculty, ...coursesOfInterest] : coursesOfInterest).map((course) => <option key={course}>{course}</option>)}</select></label>
            <label>Status<select name="status" defaultValue={lead?.status || 'New'}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
            {isAdmin && <label>Counselor<select name="assignedCounselorId" defaultValue={counselors.some((counselor) => counselor.id === lead?.assignedCounselorId && counselor.username && counselor.credential && counselor.permissions?.leads) ? lead.assignedCounselorId : ''}><option value="">Unassigned</option>{counselors.filter((counselor) => counselor.username && counselor.credential && counselor.permissions?.leads).map((counselor) => <option key={counselor.id} value={counselor.id}>{counselor.name}</option>)}</select></label>}
          </div>
          {Array.isArray(lead?.formAnswers) && lead.formAnswers.length > 0 && <section className="crm-form-answers" aria-label="Landing page answers"><strong>Landing page answers</strong>{lead.formAnswers.map((answer) => <div key={answer.id || answer.label}><span>{answer.label}</span><p>{answer.value}</p></div>)}</section>}
          <section className="crm-notes-section" aria-label="Lead notes">
            <div className="crm-notes-heading"><strong>Notes</strong><span>{(lead?.noteHistory?.length || 0) + (lead?.notes ? 1 : 0)} saved</span></div>
            {lead?.notes && <article className="crm-note-item"><p>{lead.notes}</p><time>{formatNoteDate(lead.createdAt)}</time></article>}
            {lead?.noteHistory?.map((note) => <article className="crm-note-item" key={note.id || `${note.createdAt}-${note.body}`}><p>{note.body}</p><time>{formatNoteDate(note.createdAt)}</time></article>)}
            <label className="crm-notes-field">Add a note<textarea name="newNote" rows="3" placeholder="Record a call, follow-up, or next step…" /></label>
          </section>
          <div className="crm-dialog-footer">
            {saved && <span className="crm-saved-message">Saved to this browser.</span>}
            <button className="crm-secondary-button" type="button" onClick={onClose}>Cancel</button>
            <button className="crm-primary-button" type="submit">{editing ? 'Save changes' : 'Add lead'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function LeadRow({ lead, counselors, isAdmin, onEdit, onStatusChange, onAssign }) {
  return (
    <tr>
      <td><div className="crm-person"><span className="crm-avatar">{lead.image ? <img src={appUrl(lead.image)} alt={`${lead.name}'s uploaded image`} /> : initials(lead.name)}</span><div><strong>{lead.name}</strong><span>{lead.email}</span></div></div></td>
      <td><div className="crm-contact-cell"><span>{lead.phone || '—'}</span><span>{lead.course || lead.faculty || 'No course selected'}</span></div></td>
      <td><span className={`crm-source ${lead.source === 'Website enquiry' ? 'website' : ''}`}>{lead.source || 'Website enquiry'}</span></td>
      <td>{isAdmin ? <select className="crm-assignee-select" aria-label={`Counselor for ${lead.name}`} value={counselors.some((counselor) => counselor.id === lead.assignedCounselorId && counselor.username && counselor.credential && counselor.permissions?.leads) ? lead.assignedCounselorId : ''} onChange={(event) => onAssign(lead.id, event.target.value)}><option value="">Unassigned</option>{counselors.filter((counselor) => counselor.username && counselor.credential && counselor.permissions?.leads).map((counselor) => <option key={counselor.id} value={counselor.id}>{counselor.name}</option>)}</select> : <span>{counselors.find((counselor) => counselor.id === lead.assignedCounselorId)?.name || 'Assigned to you'}</span>}</td>
      <td><select className={`crm-status-select status-${(lead.status || 'New').toLowerCase().replaceAll(/[^a-z]+/g, '-')}`} aria-label={`Status for ${lead.name}`} value={lead.status || 'New'} onChange={(event) => onStatusChange(lead.id, event.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></td>
      <td><button className="crm-row-edit" onClick={() => onEdit(lead)} aria-label={`View or add notes for ${lead.name}`}>Notes ({(lead.noteHistory?.length || 0) + (lead.notes ? 1 : 0)})</button></td>
      <td className="crm-date">{formatDate(lead.createdAt)}</td>
      <td><button className="crm-row-edit" onClick={() => onEdit(lead)} aria-label={`Edit ${lead.name}`}>Edit</button></td>
    </tr>
  );
}

function CounselorManager({ counselors }) {
  const [draft, setDraft] = useState(counselors);
  const [saved, setSaved] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState({});
  useEffect(() => setDraft(counselors), [counselors]);

  function submit(event) {
    event.preventDefault();
    saveCounselors(draft);
    setSaved(true);
    setError('');
    clearUnavailableLandingRoutes(draft);
  }

  async function generateCredentials(counselorId) {
    setError('');
    const selected = draft.find((counselor) => counselor.id === counselorId);
    setBusyId(counselorId);
    try {
      saveCounselors(draft);
      const credentials = await generateCounselorCredentials(counselorId);
      setRevealed((current) => ({ ...current, [counselorId]: credentials }));
      setSaved(false);
    } catch (generationError) {
      setError(generationError.message || 'Could not generate counselor credentials.');
    } finally {
      setBusyId('');
    }
  }

  function removeCredentials(counselor) {
    if (!window.confirm(`Delete sign-in credentials for ${counselor.name}? They will no longer be able to sign in.`)) return;
    deleteCounselorCredentials(counselor.id);
    setRevealed((current) => { const next = { ...current }; delete next[counselor.id]; return next; });
    clearLandingRoutes(counselor.id);
    setSaved(false);
  }

  function changePermission(counselorId, permission, checked) {
    setSaved(false);
    setDraft((items) => items.map((item) => item.id === counselorId ? { ...item, permissions: { ...item.permissions, [permission]: checked } } : item));
  }

  return <section aria-labelledby="counselors-title">
    <div className="crm-title-row">
      <div><span className="crm-kicker">GEMS GROUP SERVICES · TEAM</span><h1 id="counselors-title">Counselor access</h1><p>Create sign-in credentials and choose which CRM sections each counselor can use.</p></div>
    </div>
    <form className="crm-counselor-manager" onSubmit={submit}>
      <div className="crm-counselor-manager-head"><div><h2>Three counselor accounts</h2><p>Each counselor sees assigned leads, enabled sections, and their own attendance.</p></div><span>Admin only</span></div>
      <div className="crm-counselor-account-list">{draft.map((counselor, index) => <article className="crm-counselor-account" key={counselor.id}>
        <div className="crm-counselor-account-heading"><span className="crm-counselor-number">{index + 1}</span><div><strong>{counselor.name || `Counselor ${index + 1}`}</strong><span>{counselor.username ? `Sign-in ID: ${counselor.username}` : 'No sign-in credentials'}</span></div><span className={`crm-counselor-account-status ${counselor.credential ? 'active' : ''}`}>{counselor.credential ? 'Enabled' : 'Not enabled'}</span></div>
        <div className="crm-counselor-fields crm-counselor-account-fields">
          <label><span>Display name</span><input value={counselor.name} required maxLength={60} onChange={(event) => { setSaved(false); setDraft((items) => items.map((item) => item.id === counselor.id ? { ...item, name: event.target.value } : item)); }} /></label>
          <fieldset className="crm-counselor-access"><legend>CRM access</legend>
            <label><input type="checkbox" checked={Boolean(counselor.permissions?.leads)} onChange={(event) => changePermission(counselor.id, 'leads', event.target.checked)} /> Leads assigned to this counselor</label>
            <label><input type="checkbox" checked={Boolean(counselor.permissions?.website)} onChange={(event) => changePermission(counselor.id, 'website', event.target.checked)} /> Website editor</label>
            <label><input type="checkbox" checked={Boolean(counselor.permissions?.landingPages)} onChange={(event) => changePermission(counselor.id, 'landingPages', event.target.checked)} /> Landing pages</label>
          </fieldset>
        </div>
        {revealed[counselor.id] && <div className="crm-generated-credentials" role="status"><strong>Copy these credentials now</strong><span>Sign-in ID: <code>{revealed[counselor.id].username}</code></span><span>Password: <code>{revealed[counselor.id].password}</code></span><small>The password is shown once. Generate again if it is lost.</small></div>}
        <div className="crm-counselor-account-actions"><button className="crm-primary-button" type="button" disabled={busyId === counselor.id} onClick={() => generateCredentials(counselor.id)}>{busyId === counselor.id ? 'Generating…' : counselor.credential ? 'Generate new ID & password' : 'Generate ID & password'}</button>{counselor.credential && <button className="crm-secondary-button crm-delete-credential" type="button" onClick={() => removeCredentials(counselor)}>Delete credentials</button>}</div>
      </article>)}</div>
      {error && <p className="crm-landing-error" role="alert">{error}</p>}
      <div className="crm-editor-actions">{saved && <span className="crm-editor-save-message" role="status">Access settings saved.</span>}<button className="crm-primary-button" type="submit">Save access settings</button></div>
      <p className="crm-privacy-note">Counselor passwords are stored as salted hashes in this browser. This local CRM does not provide server-enforced security or shared accounts across devices.</p>
    </form>
  </section>;
}

function clearLandingRoutes(counselorId) {
  readLandingPages().filter((page) => page.assignedCounselorId === counselorId).forEach((page) => saveLandingPage({ ...page, assignedCounselorId: '' }));
}

function clearUnavailableLandingRoutes(counselors) {
  const activeIds = new Set(counselors.filter((counselor) => counselor.username && counselor.credential && counselor.permissions?.leads).map((counselor) => counselor.id));
  readLandingPages().filter((page) => page.assignedCounselorId && !activeIds.has(page.assignedCounselorId)).forEach((page) => saveLandingPage({ ...page, assignedCounselorId: '' }));
}

function CRMWorkspace({ session, onLogout }) {
  const [leads, setLeads] = useState(() => readLeads());
  const [counselors, setCounselors] = useState(() => readCounselors());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All leads');
  const [dialog, setDialog] = useState(null);
  const [activeTab, setActiveTab] = useState('leads');
  const isAdmin = session.role === 'admin';

  useEffect(() => subscribeToLeads(setLeads), []);
  useEffect(() => subscribeToCounselors(setCounselors), []);
  useEffect(() => {
    if (session.role !== 'counselor' || !session.attendanceSessionId) return undefined;
    const closeAttendanceWhenLeaving = (event) => {
      if (!event.persisted) endCounselorAttendance(session.attendanceSessionId);
    };
    window.addEventListener('pagehide', closeAttendanceWhenLeaving);
    return () => window.removeEventListener('pagehide', closeAttendanceWhenLeaving);
  }, [session.role, session.attendanceSessionId]);

  const currentCounselor = counselors.find((counselor) => counselor.id === session.counselorId);
  const tabs = [
    { id: 'leads', label: 'Leads', allowed: isAdmin || currentCounselor?.permissions?.leads },
    { id: 'website', label: 'Website editor', allowed: isAdmin || currentCounselor?.permissions?.website },
    { id: 'landing-pages', label: 'Landing pages', allowed: isAdmin || currentCounselor?.permissions?.landingPages },
    { id: 'attendance', label: 'Attendance', allowed: true },
    { id: 'counselors', label: 'Counselors', allowed: isAdmin },
  ].filter((tab) => tab.allowed);
  const currentTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : (tabs[0]?.id || 'no-access');

  useEffect(() => {
    if (!isAdmin && (!currentCounselor?.credential || session.credentialHash !== currentCounselor.credential.hash || !tabs.length)) onLogout();
  }, [isAdmin, currentCounselor?.credential, session.credentialHash, tabs.length, onLogout]);

  const sortedLeads = useMemo(() => [...leads].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [leads]);
  const accessibleLeads = isAdmin ? sortedLeads : sortedLeads.filter((lead) => lead.assignedCounselorId === session.counselorId);
  const filteredLeads = useMemo(() => accessibleLeads.filter((lead) => {
    const query = search.trim().toLowerCase();
    const assignedName = counselors.find((counselor) => counselor.id === lead.assignedCounselorId)?.name;
    const matchesSearch = !query || [lead.name, lead.email, lead.phone, lead.course, lead.faculty, lead.source, assignedName].some((item) => String(item || '').toLowerCase().includes(query));
    const matchesStatus = statusFilter === 'All leads' || lead.status === statusFilter;
    return matchesSearch && matchesStatus;
  }), [accessibleLeads, search, statusFilter, counselors]);
  const followUps = accessibleLeads.filter((lead) => lead.status === 'Follow-up').length;
  const enrolled = accessibleLeads.filter((lead) => lead.status === 'Enrolled').length;
  const inProgress = accessibleLeads.filter((lead) => activeStatuses.has(lead.status || 'New')).length;

  function changeStatus(id, status) {
    updateLead(id, { status });
  }

  function assignCounselor(id, assignedCounselorId) {
    updateLead(id, { assignedCounselorId });
  }

  return (
    <div className="crm-app">
      <header className="crm-header">
        <div className="crm-header-inner">
          <a className="crm-brand" href={appUrl('/')} aria-label="GEMS Group Services CRM"><img src={appUrl('/images/logo.png')} alt="GEMS Group Services" /><span className="crm-brand-divider" /><span className="crm-brand-label">CRM</span></a>
          <div className="crm-header-actions"><span className="crm-local-indicator"><i /> {isAdmin ? 'Admin workspace' : currentCounselor?.name || 'Counselor'}</span><a className="crm-website-link" href={appUrl('/')}>View website <span aria-hidden="true">↗</span></a><button className="crm-secondary-button crm-logout-button" type="button" onClick={onLogout}>Sign out</button></div>
        </div>
      </header>

      <main className="crm-main">
        {tabs.length > 0 && <nav className="crm-workspace-tabs" aria-label="CRM sections">{tabs.map((tab) => <button key={tab.id} type="button" className={currentTab === tab.id ? 'active' : ''} aria-current={currentTab === tab.id ? 'page' : undefined} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</nav>}
        {currentTab === 'attendance' ? <AttendancePanel counselors={counselors} counselorId={session.counselorId} isAdmin={isAdmin} /> : currentTab === 'website' ? <WebsiteEditor /> : currentTab === 'landing-pages' ? <LandingPageManager /> : currentTab === 'counselors' ? <CounselorManager counselors={counselors} /> : currentTab === 'no-access' ? <section className="crm-empty"><h2>No CRM sections are enabled</h2><p>Ask your administrator to grant access to at least one section.</p></section> : <>
        <div className="crm-title-row">
          <div><span className="crm-kicker">GEMS GROUP SERVICES · ADMISSIONS</span><h1>{isAdmin ? 'Lead management' : `${currentCounselor?.name || 'Your'} leads`}</h1><p>{isAdmin ? 'Keep every enquiry moving toward the right university.' : 'Only leads assigned to your counselor account are shown here.'}</p></div>
          {isAdmin && <button className="crm-primary-button" onClick={() => setDialog({ mode: 'new' })}><span aria-hidden="true">＋</span> Add lead</button>}
        </div>

        <section className="crm-stats" aria-label="Lead summary">
          <article className="crm-stat-card"><span className="crm-stat-icon stat-blue">↗</span><span className="crm-stat-label">Total leads</span><strong>{accessibleLeads.length}</strong><span className="crm-stat-foot">{isAdmin ? 'All recorded enquiries' : 'Assigned to you'}</span></article>
          <article className="crm-stat-card"><span className="crm-stat-icon stat-gold">◷</span><span className="crm-stat-label">In progress</span><strong>{inProgress}</strong><span className="crm-stat-foot">Needs a next step</span></article>
          <article className="crm-stat-card"><span className="crm-stat-icon stat-red">⌁</span><span className="crm-stat-label">Follow-ups</span><strong>{followUps}</strong><span className="crm-stat-foot">Ready for a check-in</span></article>
          <article className="crm-stat-card"><span className="crm-stat-icon stat-green">✓</span><span className="crm-stat-label">Enrolled</span><strong>{enrolled}</strong><span className="crm-stat-foot">Successful admissions</span></article>
        </section>

        <section className="crm-leads-panel">
          <div className="crm-panel-heading"><div><h2>Enquiries</h2><p>{accessibleLeads.length ? `${accessibleLeads.length} ${accessibleLeads.length === 1 ? 'lead' : 'leads'} ${isAdmin ? 'saved in this browser' : 'assigned to this counselor'}` : isAdmin ? 'Website enquiries appear here automatically.' : 'Landing page leads assigned to you will appear here.'}</p></div><button className="crm-export-button" onClick={() => exportLeadsCsv(filteredLeads, counselors)} disabled={!filteredLeads.length}><span aria-hidden="true">↓</span> Export CSV</button></div>
          <div className="crm-toolbar">
            <label className="crm-search"><span aria-hidden="true">⌕</span><input aria-label="Search leads" placeholder="Search name, email, phone…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <label className="crm-filter"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All leads</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          </div>

          {filteredLeads.length ? <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Student</th><th>Contact & interest</th><th>Source</th><th>Assigned counselor</th><th>Status</th><th>Notes</th><th>Received</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filteredLeads.map((lead) => <LeadRow key={lead.id} lead={lead} counselors={counselors} isAdmin={isAdmin} onEdit={(selected) => setDialog(selected)} onStatusChange={changeStatus} onAssign={assignCounselor} />)}</tbody></table></div> : <div className="crm-empty"><div className="crm-empty-icon">✦</div><h3>{accessibleLeads.length ? 'No matching enquiries' : isAdmin ? 'Your enquiry pipeline starts here' : 'No leads assigned yet'}</h3><p>{accessibleLeads.length ? 'Try another name or status filter.' : isAdmin ? 'When a student submits the website enquiry form, their details will be added to this list.' : 'Ask your administrator to route a landing page to your counselor account.'}</p>{accessibleLeads.length ? <button className="crm-secondary-button" onClick={() => { setSearch(''); setStatusFilter('All leads'); }}>Clear filters</button> : isAdmin ? <button className="crm-primary-button" onClick={() => setDialog({ mode: 'new' })}>Add your first lead</button> : null}</div>}
        </section>
        <p className="crm-privacy-note">Leads are stored in this browser only. Connect a secured server or CRM API to share records across devices or receive enquiries from the live WordPress website.</p>
        </>}
      </main>
      {dialog && isAdmin && <LeadDialog lead={dialog.mode === 'new' ? null : dialog} counselors={counselors} isAdmin={isAdmin} onClose={() => setDialog(null)} />}
      {dialog && !isAdmin && <LeadDialog lead={dialog} counselors={counselors} isAdmin={false} onClose={() => setDialog(null)} />}
    </div>
  );
}

function CRMLogin({ onAuthenticated }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hasAdmin = crmHasAdmin();

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!hasAdmin && password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      if (hasAdmin) {
        const adminSignedIn = await authenticateCrmAdmin(username, password);
        const counselorSignedIn = adminSignedIn ? false : await authenticateCrmCounselor(username, password);
        if (!adminSignedIn && !counselorSignedIn) {
          setError('That username or password is not correct.');
          return;
        }
      } else {
        await createCrmAdmin(username, password);
      }
      onAuthenticated();
    } catch {
      setError('Login is unavailable in this browser. Please use a current browser with secure storage enabled.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="crm-app crm-auth-app">
    <header className="crm-header"><div className="crm-header-inner"><a className="crm-brand" href={appUrl('/')} aria-label="GEMS Group Services CRM"><img src={appUrl('/images/logo.png')} alt="GEMS Group Services" /><span className="crm-brand-divider" /><span className="crm-brand-label">CRM</span></a><a className="crm-website-link" href={appUrl('/')}>View website <span aria-hidden="true">↗</span></a></div></header>
    <main className="crm-auth-main">
      <form className="crm-auth-card" onSubmit={submit}>
        <span className="crm-kicker">GEMS GROUP SERVICES · CRM</span>
        <h1>{hasAdmin ? 'Sign in to your CRM' : 'Set up your CRM login'}</h1>
        <p>{hasAdmin ? 'Sign in with your admin or counselor ID. Access depends on the permissions set by the admin.' : 'Create the admin login for this browser to manage counselor accounts, leads, and website access.'}</p>
        {!hasAdmin && <div className="crm-auth-notice"><strong>First-time setup</strong><span>Your admin account is saved only in this browser. Choose a password you will remember.</span></div>}
        <label>{hasAdmin ? 'Admin username or counselor ID' : 'Admin username'}<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} required /></label>
        <label>Password<input type="password" autoComplete={hasAdmin ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} required /></label>
        {!hasAdmin && <label>Confirm password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={10} required /></label>}
        {error && <p className="crm-auth-error" role="alert">{error}</p>}
        <button className="crm-primary-button" type="submit" disabled={busy}>{busy ? 'Please wait…' : hasAdmin ? 'Sign in' : 'Create admin login'}</button>
        <span className="crm-auth-footnote">This local login protects this browser session. A live shared CRM needs server-side authentication.</span>
      </form>
    </main>
  </div>;
}

export default function CRM() {
  const [session, setSession] = useState(() => crmGetSession());
  function signOut() {
    logoutCrmAdmin();
    setSession(null);
  }
  return session ? <CRMWorkspace session={session} onLogout={signOut} /> : <CRMLogin onAuthenticated={() => setSession(crmGetSession())} />;
}
