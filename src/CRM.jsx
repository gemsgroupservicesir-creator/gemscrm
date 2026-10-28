import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { coursesOfInterest, siteContent } from './data/siteContent.js';
import { addLead, exportLeadsCsv, importLeadsCsv, readLeads, subscribeToLeads, updateLead } from './data/crmStore.js';
import { readCounselors, saveCounselors, subscribeToCounselors } from './data/crmCounselors.js';
import { authenticateCrm, createCrmAdmin, crmGetSession, crmHasAdmin, deleteCrmCounselor, deleteCounselorCredentials, setCounselorCredentials, logoutCrmAdmin } from './data/crmAuth.js';
import WebsiteEditor from './WebsiteEditor.jsx';
import { LandingPageManager } from './LandingPages.jsx';
import { appUrl } from './data/siteUrl.js';
import { ATTENDANCE_TARGET_MS, getAttendanceForDay, getLocalDayKey, readAttendance, subscribeToAttendance } from './data/crmAttendance.js';
import { readDailyReports, saveDailyWorkReport, subscribeToDailyReports } from './data/crmDailyReports.js';
import { applyLeadAssignmentRules, readLeadAssignmentRules, saveLeadAssignmentRules, subscribeToLeadAssignmentRules } from './data/crmLeadAssignmentRules.js';
import { readLandingPages, subscribeToLandingPages } from './data/landingPages.js';
import { readSiteCollection, subscribeToSiteCollections } from './data/siteCopy.js';
import { syncGoogleSheetLeads } from './data/crmSheets.js';
import { loadCrmData } from './data/crmApi.js';

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
    <p className="crm-privacy-note">Attendance sessions are recorded on the server when a counselor signs in and out.</p>
  </section>;
}

function DailyWorkReportPanel({ counselors, counselorId, isAdmin }) {
  const [reports, setReports] = useState(() => readDailyReports());
  const [selectedDate, setSelectedDate] = useState(() => getLocalDayKey());
  const [selectedCounselor, setSelectedCounselor] = useState('all');
  const [draft, setDraft] = useState({ summary: '', studentOutreach: '', counseling: '', applicationWork: '', otherWork: '', challenges: '', nextSteps: '' });
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [error, setError] = useState('');
  const ownReport = reports.find((report) => report.counselorId === counselorId && report.date === selectedDate);

  useEffect(() => subscribeToDailyReports(setReports), []);
  useEffect(() => {
    if (!isAdmin) {
      setDraft({
        summary: ownReport?.summary || '',
        studentOutreach: ownReport?.studentOutreach || '',
        counseling: ownReport?.counseling || '',
        applicationWork: ownReport?.applicationWork || '',
        otherWork: ownReport?.otherWork || '',
        challenges: ownReport?.challenges || '',
        nextSteps: ownReport?.nextSteps || '',
      });
      setSavedMessage('');
      setError('');
    }
  }, [isAdmin, ownReport, selectedDate]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setSavedMessage('');
    setError('');
    try {
      await saveDailyWorkReport({ ...draft, date: selectedDate });
      setSavedMessage('Daily work report saved. You can update it again during the day.');
    } catch (saveError) {
      setError(saveError.message || 'Could not save the daily work report.');
    } finally {
      setSaving(false);
    }
  }

  const fields = [
    { name: 'summary', label: 'Today’s work summary', hint: 'Summarize the main work completed today.', required: true },
    { name: 'studentOutreach', label: 'Student calls and follow-ups', hint: 'Students contacted, responses, and follow-up details.' },
    { name: 'counseling', label: 'Counseling sessions and consultations', hint: 'Consultations held and guidance provided.' },
    { name: 'applicationWork', label: 'Applications and admissions progress', hint: 'Applications prepared, submitted, or progressed.' },
    { name: 'otherWork', label: 'Other work completed', hint: 'Team, office, documentation, or campaign tasks.' },
    { name: 'challenges', label: 'Challenges or pending work', hint: 'Anything blocked or waiting for a response.' },
    { name: 'nextSteps', label: 'Follow-up plan for tomorrow', hint: 'Next actions to pick up on the next workday.' },
  ];

  if (isAdmin) {
    const visibleReports = reports
      .filter((report) => report.date === selectedDate && (selectedCounselor === 'all' || report.counselorId === selectedCounselor))
      .sort((left, right) => String(left.counselorName || '').localeCompare(String(right.counselorName || '')));
    return <section className="crm-daily-report-view" aria-labelledby="crm-daily-report-title">
      <div className="crm-title-row crm-daily-report-title-row">
        <div><span className="crm-kicker">GEMS GROUP SERVICES · TEAM</span><h1 id="crm-daily-report-title">Daily work reports</h1><p>Review counselors’ daily activities, completed work, and next steps.</p></div>
        <div className="crm-daily-report-filters">
          <label>Report date<input type="date" value={selectedDate} onChange={(event) => { if (event.target.value) setSelectedDate(event.target.value); }} /></label>
          <label>Counselor<select value={selectedCounselor} onChange={(event) => setSelectedCounselor(event.target.value)}><option value="all">All counselors</option>{counselors.map((counselor) => <option key={counselor.id} value={counselor.id}>{counselor.name}</option>)}</select></label>
        </div>
      </div>
      <div className="crm-daily-report-list">
        {visibleReports.map((report) => <article className="crm-daily-report-card" key={`${report.counselorId}-${report.date}`}>
          <div className="crm-daily-report-card-head"><div><h2>{report.counselorName || 'Counselor'}</h2><p>Work report · {formatDate(`${report.date}T12:00:00`)}</p></div><span>Updated {formatNoteDate(report.updatedAt)}</span></div>
          <div className="crm-daily-report-card-fields">{fields.filter((field) => report[field.name]).map((field) => <section key={field.name}><h3>{field.label}</h3><p>{report[field.name]}</p></section>)}</div>
        </article>)}
        {!visibleReports.length && <div className="crm-daily-report-empty"><span aria-hidden="true">▤</span><h2>No reports for this date</h2><p>Reports submitted by counselors will appear here.</p></div>}
      </div>
      <p className="crm-privacy-note">Daily reports are visible to CRM administrators and the counselor who submitted them.</p>
    </section>;
  }

  return <section className="crm-daily-report-view" aria-labelledby="crm-daily-report-title">
    <div className="crm-title-row crm-daily-report-title-row">
      <div><span className="crm-kicker">GEMS GROUP SERVICES · MY WORK</span><h1 id="crm-daily-report-title">Daily work report</h1><p>Record your student follow-ups, counseling, completed tasks, and next steps.</p></div>
      <label className="crm-daily-report-date">Report date<input type="date" value={selectedDate} onChange={(event) => { if (event.target.value) setSelectedDate(event.target.value); }} /></label>
    </div>
    <form className="crm-daily-report-form" onSubmit={submit}>
      <div className="crm-daily-report-form-head"><div><h2>{formatDate(`${selectedDate}T12:00:00`)}</h2><p>{ownReport ? `Last saved ${formatNoteDate(ownReport.updatedAt)} · Edit and save to update this day’s report.` : 'Add your work as you go, then save your report.'}</p></div><span className="crm-daily-report-owner">Visible to you and CRM admins</span></div>
      <div className="crm-daily-report-fields">{fields.map((field) => <label className={field.name === 'summary' ? 'crm-daily-report-field wide' : 'crm-daily-report-field'} key={field.name}>
        <span>{field.label}{field.required && <i>*</i>}</span><textarea name={field.name} value={draft[field.name]} onChange={(event) => { setDraft((current) => ({ ...current, [field.name]: event.target.value })); setSavedMessage(''); setError(''); }} placeholder={field.hint} maxLength={field.name === 'summary' ? 5000 : 4000} rows={field.name === 'summary' ? 4 : 3} required={field.required} />
      </label>)}</div>
      {error && <p className="crm-daily-report-error" role="alert">{error}</p>}
      <div className="crm-daily-report-actions">{savedMessage && <span className="crm-daily-report-success" role="status">{savedMessage}</span>}<button className="crm-primary-button" type="submit" disabled={saving}>{saving ? 'Saving report…' : ownReport ? 'Update daily report' : 'Save daily report'}</button></div>
    </form>
  </section>;
}

function LeadDialog({ lead, counselors, isAdmin, onClose }) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const editing = Boolean(lead);

  async function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values = {
      name: String(data.get('name') || ''),
      email: String(data.get('email') || ''),
      phone: String(data.get('phone') || ''),
      faculty: String(data.get('course') || data.get('faculty') || ''),
      course: String(data.get('course') || data.get('faculty') || ''),
      university: String(data.get('university') || ''),
      status: String(data.get('status') || 'New'),
    };
    if (isAdmin) values.assignedCounselorId = String(data.get('assignedCounselorId') || '');
    const noteBody = String(data.get('newNote') || '').trim();
    const previousNotes = Array.isArray(lead?.noteHistory) ? lead.noteHistory : [];
    const noteHistory = noteBody ? [...previousNotes, {
      id: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      body: noteBody,
      createdAt: new Date().toISOString(),
    }] : previousNotes;
    setSaving(true); setError('');
    try {
      if (editing) await updateLead(lead.id, { ...values, noteHistory });
      else await addLead({ ...values, noteHistory, source: 'Added in CRM' });
      setSaved(true);
      window.setTimeout(onClose, 450);
    } catch (saveError) { setError(saveError.message || 'Could not save this lead.'); }
    finally { setSaving(false); }
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
            <label>University/College<input name="university" defaultValue={lead?.university || ''} placeholder="Institution of interest" /></label>
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
            {saved && <span className="crm-saved-message">Saved securely.</span>}
            {error && <span className="crm-auth-error" role="alert">{error}</span>}
            <button className="crm-secondary-button" type="button" onClick={onClose}>Cancel</button>
            <button className="crm-primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add lead'}</button>
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
      <td><div className="crm-contact-cell"><span>{lead.phone || '—'}</span><span>{lead.course || lead.faculty || 'No course selected'}</span>{lead.university && <span>{lead.university}</span>}</div></td>
      <td><span className={`crm-source ${lead.source === 'Website enquiry' ? 'website' : ''}`}>{lead.source || 'Website enquiry'}</span></td>
      <td>{isAdmin ? <select className="crm-assignee-select" aria-label={`Counselor for ${lead.name}`} value={counselors.some((counselor) => counselor.id === lead.assignedCounselorId && counselor.username && counselor.credential && counselor.permissions?.leads) ? lead.assignedCounselorId : ''} onChange={(event) => onAssign(lead.id, event.target.value)}><option value="">Unassigned</option>{counselors.filter((counselor) => counselor.username && counselor.credential && counselor.permissions?.leads).map((counselor) => <option key={counselor.id} value={counselor.id}>{counselor.name}</option>)}</select> : <span>{counselors.find((counselor) => counselor.id === lead.assignedCounselorId)?.name || 'Assigned to you'}</span>}</td>
      <td><select className={`crm-status-select status-${(lead.status || 'New').toLowerCase().replaceAll(/[^a-z]+/g, '-')}`} aria-label={`Status for ${lead.name}`} value={lead.status || 'New'} onChange={(event) => onStatusChange(lead.id, event.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></td>
      <td><button className="crm-row-edit" onClick={() => onEdit(lead)} aria-label={`View or add notes for ${lead.name}`}>Notes ({(lead.noteHistory?.length || 0) + (lead.notes ? 1 : 0)})</button></td>
      <td className="crm-date">{formatDate(lead.createdAt)}</td>
      <td><button className="crm-row-edit" onClick={() => onEdit(lead)} aria-label={`Edit ${lead.name}`}>Edit</button></td>
    </tr>
  );
}

function LeadDetailsPanel({ lead, counselors, isAdmin, onEdit, onStatusChange, onAssign }) {
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState('');
  const assignedCounselor = counselors.find((counselor) => counselor.id === lead.assignedCounselorId);
  const notes = [
    ...(lead.notes ? [{ id: 'legacy-note', body: lead.notes, createdAt: lead.createdAt }] : []),
    ...(Array.isArray(lead.noteHistory) ? lead.noteHistory : []),
  ].sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));

  useEffect(() => {
    setNote('');
    setNoteError('');
  }, [lead.id]);

  async function saveNote(event) {
    event.preventDefault();
    const body = note.trim();
    if (!body) return;
    const noteHistory = [...(Array.isArray(lead.noteHistory) ? lead.noteHistory : []), {
      id: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      body,
      createdAt: new Date().toISOString(),
    }];
    setSavingNote(true);
    setNoteError('');
    try {
      await updateLead(lead.id, { noteHistory });
      setNote('');
    } catch (error) {
      setNoteError(error.message || 'Could not save this note.');
    } finally {
      setSavingNote(false);
    }
  }

  return <aside className="crm-lead-center-details" aria-label={`Details for ${lead.name}`}>
    <div className="crm-lead-details-heading">
      <div><span className="crm-kicker">LEAD DETAILS</span><button className="crm-row-edit" type="button" onClick={() => onEdit(lead)}>Edit record</button></div>
      <span className={`crm-status-badge status-${(lead.status || 'New').toLowerCase().replaceAll(/[^a-z]+/g, '-')}`}>{lead.status || 'New'}</span>
    </div>
    <div className="crm-lead-profile">
      <span className="crm-lead-profile-avatar">{lead.image ? <img src={appUrl(lead.image)} alt={`${lead.name}'s uploaded image`} /> : initials(lead.name)}</span>
      <h2>{lead.name}</h2>
      <p>{lead.course || lead.faculty || 'Course not selected'}</p>
      <span className="crm-lead-profile-source">{lead.source || 'Website enquiry'} · Added {formatDate(lead.createdAt)}</span>
    </div>
    <div className="crm-lead-contact-actions">
      <a href={`mailto:${encodeURIComponent(lead.email || '')}`} aria-label={`Email ${lead.name}`}><span aria-hidden="true">✉</span>Email</a>
      {lead.phone && <a href={`tel:${lead.phone.replace(/[^+\d]/g, '')}`} aria-label={`Call ${lead.name}`}><span aria-hidden="true">☎</span>Call</a>}
    </div>
    <div className="crm-lead-detail-fields">
      <div><span>Email</span><strong>{lead.email || '—'}</strong></div>
      <div><span>Phone</span><strong>{lead.phone || '—'}</strong></div>
      <div><span>Course of interest</span><strong>{lead.course || lead.faculty || '—'}</strong></div>
      <div><span>University/College</span><strong>{lead.university || '—'}</strong></div>
      <div><span>Source</span><strong>{lead.source || 'Website enquiry'}</strong></div>
    </div>
    {Array.isArray(lead.formAnswers) && lead.formAnswers.length > 0 && <section className="crm-lead-extra-answers"><h3>Form answers</h3>{lead.formAnswers.map((answer) => <div key={answer.id || answer.label}><span>{answer.label}</span><strong>{answer.value || '—'}</strong></div>)}</section>}
    <section className="crm-lead-routing">
      <label>Status<select className={`crm-status-select status-${(lead.status || 'New').toLowerCase().replaceAll(/[^a-z]+/g, '-')}`} value={lead.status || 'New'} onChange={(event) => onStatusChange(lead.id, event.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>Assigned to{isAdmin ? <select className="crm-assignee-select" value={assignedCounselor?.credential ? lead.assignedCounselorId : ''} onChange={(event) => onAssign(lead.id, event.target.value)}><option value="">Unassigned</option>{counselors.filter((counselor) => counselor.username && counselor.credential && counselor.permissions?.leads).map((counselor) => <option key={counselor.id} value={counselor.id}>{counselor.name}</option>)}</select> : <strong>{assignedCounselor?.name || 'Assigned to you'}</strong>}</label>
    </section>
    <section className="crm-lead-notes-panel" aria-label="Lead notes">
      <div className="crm-lead-notes-heading"><h3>Notes</h3><span>{notes.length}</span></div>
      {notes.length ? <div className="crm-lead-notes-list">{notes.map((item) => <article key={item.id || `${item.createdAt}-${item.body}`}><p>{item.body}</p><time>{formatNoteDate(item.createdAt)}</time></article>)}</div> : <p className="crm-lead-no-notes">No notes yet. Add a call summary or next step.</p>}
      <form onSubmit={saveNote} className="crm-lead-add-note"><label htmlFor={`lead-note-${lead.id}`}>Add a note</label><textarea id={`lead-note-${lead.id}`} value={note} onChange={(event) => setNote(event.target.value)} rows="3" placeholder="Record a conversation or follow-up…" /><button className="crm-secondary-button" type="submit" disabled={savingNote || !note.trim()}>{savingNote ? 'Saving…' : 'Save note'}</button>{noteError && <p role="alert">{noteError}</p>}</form>
    </section>
  </aside>;
}

function LeadCenterView({ leads, counselors, isAdmin, selectedLeadId, onSelectLead, onEdit, onStatusChange, onAssign }) {
  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) || leads[0];
  return <div className="crm-lead-center">
    <div className="crm-lead-center-list" role="listbox" aria-label="Leads">
      {leads.map((lead) => {
        const status = lead.status || 'New';
        const stageClass = status.toLowerCase().replaceAll(/[^a-z]+/g, '-');
        return <button key={lead.id} type="button" role="option" aria-selected={selectedLead?.id === lead.id} className={`crm-lead-center-item ${selectedLead?.id === lead.id ? 'active' : ''}`} onClick={() => onSelectLead(lead.id)}>
          <span className="crm-avatar">{lead.image ? <img src={appUrl(lead.image)} alt="" /> : initials(lead.name)}</span>
          <span className="crm-lead-center-item-content"><span className="crm-lead-center-item-top"><strong>{lead.name}</strong><time>{formatDate(lead.createdAt)}</time></span><span className="crm-lead-center-item-email">{lead.email}</span><span className="crm-lead-center-item-bottom"><span>{lead.course || lead.faculty || 'Course not selected'}</span><i className={`crm-status-badge status-${stageClass}`}>{status}</i></span></span>
        </button>;
      })}
    </div>
    {selectedLead ? <LeadDetailsPanel lead={selectedLead} counselors={counselors} isAdmin={isAdmin} onEdit={onEdit} onStatusChange={onStatusChange} onAssign={onAssign} /> : <div className="crm-lead-details-empty">Select a lead to view details.</div>}
  </div>;
}

function LeadKanbanBoard({ leads, counselors, isAdmin, onEdit, onStatusChange, onAssign }) {
  const [dropTarget, setDropTarget] = useState('');
  const availableCounselors = counselors.filter((counselor) => counselor.username && counselor.credential && counselor.permissions?.leads);

  function startDragging(event, lead) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', lead.id);
  }

  function dropLead(event, status) {
    event.preventDefault();
    const leadId = event.dataTransfer.getData('text/plain');
    if (leadId) onStatusChange(leadId, status);
    setDropTarget('');
  }

  return <div className="crm-kanban-board" aria-label="Lead pipeline board">
    {statuses.map((status) => {
      const columnLeads = leads.filter((lead) => (lead.status || 'New') === status);
      const statusClass = status.toLowerCase().replaceAll(/[^a-z]+/g, '-');
      return <section className={`crm-kanban-column ${dropTarget === status ? 'is-drop-target' : ''}`} key={status} aria-labelledby={`kanban-${statusClass}`}>
        <header className="crm-kanban-column-head"><h3 id={`kanban-${statusClass}`}>{status}</h3><span>{columnLeads.length}</span></header>
        <div className="crm-kanban-column-body" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(status); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(''); }} onDrop={(event) => dropLead(event, status)}>
          {columnLeads.map((lead) => {
            const noteCount = (lead.noteHistory?.length || 0) + (lead.notes ? 1 : 0);
            const assignedCounselor = counselors.find((counselor) => counselor.id === lead.assignedCounselorId);
            const leadStatusClass = (lead.status || 'New').toLowerCase().replaceAll(/[^a-z]+/g, '-');
            return <article className="crm-kanban-card" key={lead.id} draggable onDragStart={(event) => startDragging(event, lead)} onDragEnd={() => setDropTarget('')}>
              <div className="crm-kanban-card-head"><span className="crm-kanban-grip" aria-hidden="true">⠿</span><span className={`crm-kanban-stage status-${leadStatusClass}`}>{lead.status || 'New'}</span></div>
              <div className="crm-kanban-person"><span className="crm-avatar">{lead.image ? <img src={appUrl(lead.image)} alt={`${lead.name}'s uploaded image`} /> : initials(lead.name)}</span><div><button type="button" className="crm-kanban-name" onClick={() => onEdit(lead)}>{lead.name}</button><span>{lead.email}</span></div></div>
              <p className="crm-kanban-course">{lead.course || lead.faculty || 'Course not selected'}</p>
              {lead.university && <p className="crm-kanban-course">{lead.university}</p>}
              {lead.phone && <p className="crm-kanban-phone">{lead.phone}</p>}
              <div className="crm-kanban-card-meta"><span>{formatDate(lead.createdAt)}</span><button type="button" className="crm-row-edit" onClick={() => onEdit(lead)}>Notes ({noteCount})</button></div>
              <div className="crm-kanban-card-controls">
                <label><span className="sr-only">Status for {lead.name}</span><select className={`crm-status-select status-${leadStatusClass}`} value={lead.status || 'New'} onChange={(event) => onStatusChange(lead.id, event.target.value)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
                {isAdmin ? <label><span className="sr-only">Counselor for {lead.name}</span><select className="crm-assignee-select" value={availableCounselors.some((counselor) => counselor.id === lead.assignedCounselorId) ? lead.assignedCounselorId : ''} onChange={(event) => onAssign(lead.id, event.target.value)}><option value="">Unassigned</option>{availableCounselors.map((counselor) => <option key={counselor.id} value={counselor.id}>{counselor.name}</option>)}</select></label> : <span className="crm-kanban-assignee">{assignedCounselor?.name || 'Assigned to you'}</span>}
              </div>
            </article>;
          })}
          {!columnLeads.length && <div className="crm-kanban-empty">Drop a lead here</div>}
        </div>
      </section>;
    })}
  </div>;
}

function CounselorManager({ counselors }) {
  const [draft, setDraft] = useState(counselors);
  const [saved, setSaved] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [credentialInputs, setCredentialInputs] = useState(() => Object.fromEntries(counselors.map((counselor) => [counselor.id, { username: counselor.username || '', password: '' }])));
  useEffect(() => {
    setDraft(counselors);
    setCredentialInputs((current) => Object.fromEntries(counselors.map((counselor) => [counselor.id, { username: counselor.username || '', password: current[counselor.id]?.password || '' }])));
  }, [counselors]);

  function addCounselor() {
    const id = window.crypto?.randomUUID?.() || `counselor-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const counselor = { id, name: `Counselor ${draft.length + 1}`, username: '', credential: null, permissions: { leads: true, website: false, landingPages: false } };
    setDraft((items) => [...items, counselor]);
    setCredentialInputs((current) => ({ ...current, [id]: { username: '', password: '' } }));
    setSaved(false);
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    setBusyId('settings');
    try {
      await saveCounselors(draft);
      setSaved(true);
      setError('');
    } catch (saveError) { setError(saveError.message || 'Could not save counselor access.'); }
    finally { setBusyId(''); }
  }

  async function saveCredentials(counselorId) {
    setError('');
    const fields = credentialInputs[counselorId] || {};
    if (String(fields.username || '').trim().length < 3) {
      setError('Enter a sign-in ID with at least 3 characters.');
      return;
    }
    if (String(fields.password || '').length < 12) {
      setError('Enter a password with at least 12 characters.');
      return;
    }
    setBusyId(counselorId);
    try {
      await saveCounselors(draft);
      const updated = await setCounselorCredentials(counselorId, fields.username, fields.password);
      await loadCrmData();
      setDraft((items) => items.map((item) => item.id === counselorId ? { ...item, username: updated.username, credential: updated.credential } : item));
      setCredentialInputs((current) => ({ ...current, [counselorId]: { username: updated.username, password: '' } }));
      setSaved(true);
    } catch (credentialError) {
      setError(credentialError.message || 'Could not save counselor credentials.');
    } finally {
      setBusyId('');
    }
  }

  async function removeCredentials(counselor) {
    if (!window.confirm(`Delete sign-in credentials for ${counselor.name}? They will no longer be able to sign in.`)) return;
    setBusyId(counselor.id);
    try {
      await deleteCounselorCredentials(counselor.id);
      await loadCrmData();
      setCredentialInputs((current) => ({ ...current, [counselor.id]: { username: '', password: '' } }));
      setSaved(false);
    } catch (deleteError) { setError(deleteError.message || 'Could not delete credentials.'); }
    finally { setBusyId(''); }
  }

  async function removeCounselor(counselor) {
    if (!window.confirm(`Delete ${counselor.name}? Their CRM sign-in will be removed, assigned leads and landing pages will become unassigned, and attendance history will be retained.`)) return;
    const next = draft.filter((item) => item.id !== counselor.id);
    setBusyId(counselor.id);
    try {
      await deleteCrmCounselor(counselor.id);
      await loadCrmData();
      setDraft(next);
      setCredentialInputs((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== counselor.id)));
      setSaved(false); setError('');
    } catch (deleteError) { setError(deleteError.message || 'Could not delete this counselor.'); }
    finally { setBusyId(''); }
  }

  function changePermission(counselorId, permission, checked) {
    setSaved(false);
    setDraft((items) => items.map((item) => item.id === counselorId ? { ...item, permissions: { ...item.permissions, [permission]: checked } } : item));
  }

  return <section aria-labelledby="counselors-title">
    <div className="crm-title-row">
      <div><span className="crm-kicker">GEMS GROUP SERVICES · TEAM</span><h1 id="counselors-title">Counselor access</h1><p>Set each counselor’s sign-in ID and password, then choose which CRM sections they can use.</p></div>
    </div>
    <form className="crm-counselor-manager" onSubmit={submit}>
      <div className="crm-counselor-manager-head"><div><h2>Counselor accounts</h2><p>Each counselor sees assigned leads, enabled sections, and their own attendance.</p></div><div className="crm-counselor-manager-tools"><span>Admin only</span><button className="crm-primary-button" type="button" onClick={addCounselor}>＋ Add counselor</button></div></div>
      <div className="crm-counselor-account-list">{draft.map((counselor, index) => <article className="crm-counselor-account" key={counselor.id}>
        <div className="crm-counselor-account-heading"><span className="crm-counselor-number">{index + 1}</span><div><strong>{counselor.name || `Counselor ${index + 1}`}</strong><span>{counselor.username ? `Sign-in ID: ${counselor.username}` : 'No sign-in credentials'}</span></div><span className={`crm-counselor-account-status ${counselor.credential ? 'active' : ''}`}>{counselor.credential ? 'Enabled' : 'Not enabled'}</span></div>
        <div className="crm-counselor-fields crm-counselor-account-fields">
          <label><span>Display name</span><input value={counselor.name} required maxLength={60} onChange={(event) => { setSaved(false); setDraft((items) => items.map((item) => item.id === counselor.id ? { ...item, name: event.target.value } : item)); }} /></label>
          <div className="crm-counselor-credential-fields">
            <label><span>Manual sign-in ID</span><input autoComplete="username" value={credentialInputs[counselor.id]?.username || ''} placeholder="Enter an ID or email" onChange={(event) => { setSaved(false); setCredentialInputs((current) => ({ ...current, [counselor.id]: { ...current[counselor.id], username: event.target.value } })); }} /></label>
            <label><span>{counselor.credential ? 'New password' : 'Manual password'}</span><input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={credentialInputs[counselor.id]?.password || ''} placeholder="At least 12 characters" onChange={(event) => { setSaved(false); setCredentialInputs((current) => ({ ...current, [counselor.id]: { ...current[counselor.id], password: event.target.value } })); }} /></label>
          </div>
          <fieldset className="crm-counselor-access"><legend>CRM access</legend>
            <label><input type="checkbox" checked={Boolean(counselor.permissions?.leads)} onChange={(event) => changePermission(counselor.id, 'leads', event.target.checked)} /> Leads assigned to this counselor</label>
            <label><input type="checkbox" checked={Boolean(counselor.permissions?.website)} onChange={(event) => changePermission(counselor.id, 'website', event.target.checked)} /> Website editor</label>
            <label><input type="checkbox" checked={Boolean(counselor.permissions?.landingPages)} onChange={(event) => changePermission(counselor.id, 'landingPages', event.target.checked)} /> Landing pages</label>
          </fieldset>
        </div>
        <div className="crm-counselor-account-actions"><button className="crm-primary-button" type="button" disabled={busyId === counselor.id} onClick={() => saveCredentials(counselor.id)}>{busyId === counselor.id ? 'Saving…' : counselor.credential ? 'Save ID & password' : 'Set ID & password'}</button>{counselor.credential && <button className="crm-secondary-button crm-delete-credential" type="button" onClick={() => removeCredentials(counselor)}>Delete credentials</button>}<button className="crm-secondary-button crm-delete-counselor" type="button" disabled={busyId === counselor.id} onClick={() => removeCounselor(counselor)}>Delete counselor</button></div>
      </article>)}</div>
      {error && <p className="crm-landing-error" role="alert">{error}</p>}
      <div className="crm-editor-actions">{saved && <span className="crm-editor-save-message" role="status">Access settings saved.</span>}<button className="crm-primary-button" type="submit" disabled={busyId === 'settings'}>{busyId === 'settings' ? 'Saving…' : 'Save access settings'}</button></div>
      <p className="crm-privacy-note">Passwords are salted and hashed on the server. Counselors can access only the leads assigned to their account.</p>
    </form>
  </section>;
}

function LeadAssignerPanel({ counselors, leads }) {
  const [rules, setRules] = useState(() => readLeadAssignmentRules());
  const [draft, setDraft] = useState(() => readLeadAssignmentRules());
  const [landingPages, setLandingPages] = useState(() => readLandingPages());
  const [siteUniversities, setSiteUniversities] = useState(() => readSiteCollection('universities', siteContent.universities));
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const availableCounselors = counselors.filter((counselor) => counselor.username && counselor.credential && counselor.permissions?.leads);
  const courseOptions = [...new Set([
    ...coursesOfInterest,
    ...landingPages.flatMap((page) => Array.isArray(page.courseOptions) ? page.courseOptions : []),
    ...leads.map((lead) => lead.course || lead.faculty || ''),
  ].map((value) => String(value || '').trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  const universityOptions = [...new Set([
    ...siteUniversities.map((university) => university.name),
    ...landingPages.flatMap((page) => Array.isArray(page.universityOptions) ? page.universityOptions : []),
    ...leads.map((lead) => lead.university || ''),
  ].map((value) => String(value || '').trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  const unassignedCount = leads.filter((lead) => !lead.assignedCounselorId).length;

  useEffect(() => subscribeToLeadAssignmentRules(setRules), []);
  useEffect(() => subscribeToLandingPages(setLandingPages), []);
  useEffect(() => subscribeToSiteCollections(({ id, value }) => {
    if (id === 'universities') setSiteUniversities(value ?? siteContent.universities);
  }), []);
  useEffect(() => setDraft(rules), [rules]);

  function changeRule(id, key, value) {
    setDraft((current) => current.map((rule) => rule.id === id ? { ...rule, [key]: value } : rule));
    setNotice('');
    setError('');
  }

  function addRule() {
    const id = window.crypto?.randomUUID?.() || `assignment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setDraft((current) => [...current, { id, course: '', university: '', counselorId: '' }]);
    setNotice('');
    setError('');
  }

  function moveRule(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= draft.length) return;
    setDraft((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setNotice('');
  }

  async function saveRules(event) {
    event.preventDefault();
    setBusy('save');
    setNotice('');
    setError('');
    try {
      await saveLeadAssignmentRules(draft);
      setNotice('Lead assignment rules saved. New unassigned leads will follow these rules.');
    } catch (saveError) {
      setError(saveError.message || 'Could not save lead assignment rules.');
    } finally {
      setBusy('');
    }
  }

  async function applyRules() {
    setBusy('apply');
    setNotice('');
    setError('');
    try {
      const result = await applyLeadAssignmentRules();
      setNotice(`Assignment rules applied to ${result.assigned} unassigned ${result.assigned === 1 ? 'lead' : 'leads'}.`);
    } catch (applyError) {
      setError(applyError.message || 'Could not apply lead assignment rules.');
    } finally {
      setBusy('');
    }
  }

  return <section className="crm-assignment-view" aria-labelledby="lead-assigner-title">
    <div className="crm-title-row">
      <div><span className="crm-kicker">GEMS GROUP SERVICES · LEAD ROUTING</span><h1 id="lead-assigner-title">Lead assigner</h1><p>Route enquiries to counselors by the course and university students choose.</p></div>
    </div>
    <div className="crm-assignment-explainer"><span aria-hidden="true">↗</span><p>Rules are used for unassigned website, campaign, CSV, and Google Sheet leads. A counselor set directly on a landing page or lead keeps that assignment. Rules matching both course and university take priority; ties use the order below.</p></div>

    <form className="crm-counselor-manager crm-assignment-manager" onSubmit={saveRules}>
      <div className="crm-counselor-manager-head"><div><h2>Assignment rules</h2><p>Choose one or both student interests, then select the counselor who should receive matching leads.</p></div><div className="crm-counselor-manager-tools"><span>Admin only</span><button className="crm-primary-button" type="button" onClick={addRule}>＋ Add rule</button></div></div>
      <div className="crm-assignment-rule-list">
        {draft.map((rule, index) => <article className="crm-assignment-rule" key={rule.id}>
          <div className="crm-assignment-rule-number">{index + 1}</div>
          <label><span>Course</span><select value={rule.course || ''} onChange={(event) => changeRule(rule.id, 'course', event.target.value)}><option value="">Any course</option>{[...new Set([...courseOptions, ...(rule.course && !courseOptions.includes(rule.course) ? [rule.course] : [])])].map((course) => <option key={course} value={course}>{course}</option>)}</select></label>
          <label><span>University/College</span><select value={rule.university || ''} onChange={(event) => changeRule(rule.id, 'university', event.target.value)}><option value="">Any university</option>{[...new Set([...universityOptions, ...(rule.university && !universityOptions.includes(rule.university) ? [rule.university] : [])])].map((university) => <option key={university} value={university}>{university}</option>)}</select></label>
          <label><span>Assign to counselor</span><select value={rule.counselorId || ''} onChange={(event) => changeRule(rule.id, 'counselorId', event.target.value)} required><option value="" disabled>Choose a counselor</option>{availableCounselors.map((counselor) => <option key={counselor.id} value={counselor.id}>{counselor.name}</option>)}</select></label>
          <div className="crm-assignment-rule-actions"><button className="crm-row-edit" type="button" disabled={index === 0} onClick={() => moveRule(index, -1)} aria-label={`Move rule ${index + 1} up`}>↑</button><button className="crm-row-edit" type="button" disabled={index === draft.length - 1} onClick={() => moveRule(index, 1)} aria-label={`Move rule ${index + 1} down`}>↓</button><button className="crm-collection-remove" type="button" onClick={() => { setDraft((current) => current.filter((item) => item.id !== rule.id)); setNotice(''); setError(''); }}>Remove</button></div>
        </article>)}
        {!draft.length && <div className="crm-assignment-empty"><h3>No assignment rules yet</h3><p>Add a rule to route new leads automatically, such as MBA + VIT University → a selected counselor.</p><button className="crm-secondary-button" type="button" onClick={addRule}>＋ Add your first rule</button></div>}
      </div>
      {!availableCounselors.length && <p className="crm-assignment-warning">Add counselor sign-in credentials and enable lead access before creating assignment rules.</p>}
      {error && <p className="crm-landing-error" role="alert">{error}</p>}
      <div className="crm-editor-actions">{notice && <span className="crm-editor-save-message" role="status">{notice}</span>}<button className="crm-primary-button" type="submit" disabled={busy === 'save' || !availableCounselors.length}>{busy === 'save' ? 'Saving rules…' : 'Save rules'}</button></div>
      <p className="crm-privacy-note">Existing counselor assignments are preserved. Use the action below to apply saved rules to leads that are currently unassigned.</p>
    </form>

    <section className="crm-assignment-existing">
      <div><h2>Current unassigned leads</h2><p>{unassignedCount} {unassignedCount === 1 ? 'lead is' : 'leads are'} currently unassigned. Applying rules changes only unassigned leads; it does not move leads already assigned to a counselor.</p></div>
      <button className="crm-secondary-button" type="button" onClick={applyRules} disabled={busy !== '' || !rules.length || !unassignedCount}>{busy === 'apply' ? 'Applying rules…' : 'Apply rules to unassigned leads'}</button>
    </section>
  </section>;
}

function CRMWorkspace({ session, onLogout }) {
  const [leads, setLeads] = useState(() => readLeads());
  const [counselors, setCounselors] = useState(() => readCounselors());
  const [dataReady, setDataReady] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All leads');
  const [sourceFilter, setSourceFilter] = useState('All sources');
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [dialog, setDialog] = useState(null);
  const [activeTab, setActiveTab] = useState('leads');
  const [leadView, setLeadView] = useState('center');
  const importInputRef = useRef(null);
  const [importNotice, setImportNotice] = useState('');
  const [importError, setImportError] = useState('');
  const [syncingSheet, setSyncingSheet] = useState(false);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState('https://docs.google.com/spreadsheets/d/1z18sHEe4cH8FOfyfu2xy-iKPIUZovpPJ-6tf8d4V048/edit?gid=223624821#gid=223624821');
  const isAdmin = session.role === 'admin';

  useEffect(() => subscribeToLeads(setLeads), []);
  useEffect(() => subscribeToCounselors(setCounselors), []);
  useEffect(() => {
    let active = true;
    loadCrmData().then(() => { if (active) setDataReady(true); }).catch((loadError) => {
      if (!active) return;
      setDataReady(true);
      setWorkspaceError(loadError.message || 'Could not load CRM records.');
      if (loadError.message === 'Sign in to continue.') onLogout();
    });
    return () => { active = false; };
  }, [session.id, onLogout]);

  const currentCounselor = counselors.find((counselor) => counselor.id === session.counselorId);
  const tabs = [
    { id: 'leads', label: 'Leads', allowed: isAdmin || currentCounselor?.permissions?.leads },
    { id: 'website', label: 'Website editor', allowed: isAdmin || currentCounselor?.permissions?.website },
    { id: 'landing-pages', label: 'Landing pages', allowed: isAdmin || currentCounselor?.permissions?.landingPages },
    { id: 'attendance', label: 'Attendance', allowed: true },
    { id: 'daily-report', label: 'Daily work report', allowed: true },
    { id: 'lead-assigner', label: 'Lead assigner', allowed: isAdmin },
    { id: 'counselors', label: 'Counselors', allowed: isAdmin },
  ].filter((tab) => tab.allowed);
  const currentTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : (tabs[0]?.id || 'no-access');

  useEffect(() => {
    if (dataReady && !isAdmin && !currentCounselor?.credential) onLogout();
  }, [dataReady, isAdmin, currentCounselor?.credential, onLogout]);

  const sortedLeads = useMemo(() => [...leads].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [leads]);
  const accessibleLeads = isAdmin ? sortedLeads : sortedLeads.filter((lead) => lead.assignedCounselorId === session.counselorId);
  const leadSources = useMemo(() => [...new Set(accessibleLeads.map((lead) => lead.source || 'Website enquiry'))].sort((left, right) => left.localeCompare(right)), [accessibleLeads]);
  const filteredLeads = useMemo(() => accessibleLeads.filter((lead) => {
    const query = search.trim().toLowerCase();
    const assignedName = counselors.find((counselor) => counselor.id === lead.assignedCounselorId)?.name;
    const matchesSearch = !query || [lead.name, lead.email, lead.phone, lead.course, lead.faculty, lead.source, assignedName].some((item) => String(item || '').toLowerCase().includes(query));
    const matchesStatus = statusFilter === 'All leads' || (lead.status || 'New') === statusFilter;
    const matchesSource = sourceFilter === 'All sources' || (lead.source || 'Website enquiry') === sourceFilter;
    return matchesSearch && matchesStatus && matchesSource;
  }), [accessibleLeads, search, statusFilter, sourceFilter, counselors]);
  const followUps = accessibleLeads.filter((lead) => lead.status === 'Follow-up').length;
  const enrolled = accessibleLeads.filter((lead) => lead.status === 'Enrolled').length;
  const inProgress = accessibleLeads.filter((lead) => activeStatuses.has(lead.status || 'New')).length;

  function changeStatus(id, status) {
    updateLead(id, { status }).catch((error) => setWorkspaceError(error.message || 'Could not update the lead.'));
  }

  function assignCounselor(id, assignedCounselorId) {
    updateLead(id, { assignedCounselorId }).catch((error) => setWorkspaceError(error.message || 'Could not assign the lead.'));
  }

  async function importLeadFile(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setImportNotice('');
    setImportError('');
    try {
      const result = await importLeadsCsv(await file.text(), counselors, isAdmin ? '' : session.counselorId, isAdmin);
      setImportNotice(`Imported ${result.imported} ${result.imported === 1 ? 'lead' : 'leads'}${result.skipped ? ` · skipped ${result.skipped} invalid or duplicate ${result.skipped === 1 ? 'row' : 'rows'}` : ''}.`);
    } catch (error) {
      setImportError(error.message || 'Could not import this CSV file.');
    } finally {
      input.value = '';
    }
  }

  async function syncSheet() {
    setSyncingSheet(true);
    setImportNotice('');
    setImportError('');
    try {
      const result = await syncGoogleSheetLeads(spreadsheetUrl.trim());
      setImportNotice(`Google Sheet synced · ${result.created} new, ${result.updated} updated, ${result.skipped} skipped${result.assignedByRules ? ` · ${result.assignedByRules} assigned by rules` : ''}.`);
    } catch (error) {
      setImportError(error.message || 'Could not sync the Google Sheet.');
    } finally {
      setSyncingSheet(false);
    }
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
        {!dataReady && <section className="crm-empty" role="status"><h2>Connecting securely…</h2><p>Loading CRM records from the server.</p></section>}
        {workspaceError && <p className="crm-import-error" role="alert">{workspaceError}</p>}
        {dataReady && <>
        {tabs.length > 0 && <nav className="crm-workspace-tabs" aria-label="CRM sections">{tabs.map((tab) => <button key={tab.id} type="button" className={currentTab === tab.id ? 'active' : ''} aria-current={currentTab === tab.id ? 'page' : undefined} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</nav>}
        {currentTab === 'attendance' ? <AttendancePanel counselors={counselors} counselorId={session.counselorId} isAdmin={isAdmin} /> : currentTab === 'daily-report' ? <DailyWorkReportPanel counselors={counselors} counselorId={session.counselorId} isAdmin={isAdmin} /> : currentTab === 'website' ? <WebsiteEditor /> : currentTab === 'landing-pages' ? <LandingPageManager /> : currentTab === 'lead-assigner' ? <LeadAssignerPanel counselors={counselors} leads={leads} /> : currentTab === 'counselors' ? <CounselorManager counselors={counselors} /> : currentTab === 'no-access' ? <section className="crm-empty"><h2>No CRM sections are enabled</h2><p>Ask your administrator to grant access to at least one section.</p></section> : <>
        <div className="crm-title-row">
          <div><span className="crm-kicker">GEMS GROUP SERVICES · ADMISSIONS</span><h1>{isAdmin ? 'Lead Center' : 'My Lead Center'}</h1><p>{isAdmin ? 'Review enquiries, follow up, and move students toward their next step.' : 'View and follow up on the leads assigned to your counselor account.'}</p></div>
          {isAdmin && <button className="crm-primary-button" onClick={() => setDialog({ mode: 'new' })}><span aria-hidden="true">＋</span> Add lead</button>}
        </div>

        <section className="crm-stats" aria-label="Lead summary">
          <article className="crm-stat-card"><span className="crm-stat-icon stat-blue">↗</span><span className="crm-stat-label">Total leads</span><strong>{accessibleLeads.length}</strong><span className="crm-stat-foot">{isAdmin ? 'All recorded enquiries' : 'Assigned to you'}</span></article>
          <article className="crm-stat-card"><span className="crm-stat-icon stat-gold">◷</span><span className="crm-stat-label">In progress</span><strong>{inProgress}</strong><span className="crm-stat-foot">Needs a next step</span></article>
          <article className="crm-stat-card"><span className="crm-stat-icon stat-red">⌁</span><span className="crm-stat-label">Follow-ups</span><strong>{followUps}</strong><span className="crm-stat-foot">Ready for a check-in</span></article>
          <article className="crm-stat-card"><span className="crm-stat-icon stat-green">✓</span><span className="crm-stat-label">Enrolled</span><strong>{enrolled}</strong><span className="crm-stat-foot">Successful admissions</span></article>
        </section>

        <section className="crm-leads-panel">
          <div className="crm-panel-heading"><div><h2>Leads</h2><p>{accessibleLeads.length ? `${accessibleLeads.length} ${accessibleLeads.length === 1 ? 'lead' : 'leads'} ${isAdmin ? 'in your workspace' : 'assigned to you'}` : isAdmin ? 'Website enquiries appear here automatically.' : 'Landing page leads assigned to you will appear here.'}</p></div><div className="crm-leads-panel-actions"><div className="crm-view-toggle" role="group" aria-label="Choose lead layout"><button type="button" className={leadView === 'center' ? 'active' : ''} aria-pressed={leadView === 'center'} onClick={() => setLeadView('center')}>Lead center</button><button type="button" className={leadView === 'board' ? 'active' : ''} aria-pressed={leadView === 'board'} onClick={() => setLeadView('board')}>Pipeline</button><button type="button" className={leadView === 'list' ? 'active' : ''} aria-pressed={leadView === 'list'} onClick={() => setLeadView('list')}>Table</button></div>{isAdmin && <><input className="crm-sheet-link-input" type="url" aria-label="Google Sheets link" value={spreadsheetUrl} onChange={(event) => setSpreadsheetUrl(event.target.value)} placeholder="Paste Google Sheets link" /> <button className="crm-export-button" type="button" onClick={syncSheet} disabled={syncingSheet || !spreadsheetUrl.trim()}>{syncingSheet ? 'Syncing sheet…' : 'Sync Google Sheet'}</button></>}<input ref={importInputRef} className="crm-hidden-file-input" type="file" accept=".csv,text/csv" onChange={importLeadFile} /><button className="crm-export-button" type="button" onClick={() => importInputRef.current?.click()}>Import CSV</button><button className="crm-export-button" type="button" onClick={() => exportLeadsCsv(filteredLeads, counselors)} disabled={!filteredLeads.length}><span aria-hidden="true">↓</span> Export CSV</button></div></div>
          <nav className="crm-lead-stage-tabs" aria-label="Filter leads by stage">
            <button type="button" className={statusFilter === 'All leads' ? 'active' : ''} aria-pressed={statusFilter === 'All leads'} onClick={() => setStatusFilter('All leads')}>All leads <span>{accessibleLeads.length}</span></button>
            {statuses.map((status) => {
              const count = accessibleLeads.filter((lead) => (lead.status || 'New') === status).length;
              return <button type="button" key={status} className={statusFilter === status ? 'active' : ''} aria-pressed={statusFilter === status} onClick={() => setStatusFilter(status)}>{status}<span>{count}</span></button>;
            })}
          </nav>
          <div className="crm-toolbar">
            <label className="crm-search"><span aria-hidden="true">⌕</span><input aria-label="Search leads" placeholder="Search name, email, phone…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <label className="crm-filter"><span>Source</span><select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option>All sources</option>{leadSources.map((source) => <option key={source}>{source}</option>)}</select></label>
          </div>
          {importNotice && <p className="crm-import-notice" role="status">{importNotice}</p>}
          {importError && <p className="crm-import-error" role="alert">{importError}</p>}

          {filteredLeads.length ? leadView === 'center' ? <LeadCenterView leads={filteredLeads} counselors={counselors} isAdmin={isAdmin} selectedLeadId={selectedLeadId} onSelectLead={setSelectedLeadId} onEdit={(selected) => setDialog(selected)} onStatusChange={changeStatus} onAssign={assignCounselor} /> : leadView === 'board' ? <LeadKanbanBoard leads={filteredLeads} counselors={counselors} isAdmin={isAdmin} onEdit={(selected) => setDialog(selected)} onStatusChange={changeStatus} onAssign={assignCounselor} /> : <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Student</th><th>Contact & interest</th><th>Source</th><th>Assigned counselor</th><th>Status</th><th>Notes</th><th>Received</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filteredLeads.map((lead) => <LeadRow key={lead.id} lead={lead} counselors={counselors} isAdmin={isAdmin} onEdit={(selected) => setDialog(selected)} onStatusChange={changeStatus} onAssign={assignCounselor} />)}</tbody></table></div> : <div className="crm-empty"><div className="crm-empty-icon">✦</div><h3>{accessibleLeads.length ? 'No matching leads' : isAdmin ? 'Your lead pipeline starts here' : 'No leads assigned yet'}</h3><p>{accessibleLeads.length ? 'Try another search or clear the stage and source filters.' : isAdmin ? 'When a student submits the website enquiry form, their details will be added to this list.' : 'Ask your administrator to route a landing page to your counselor account.'}</p>{accessibleLeads.length ? <button className="crm-secondary-button" onClick={() => { setSearch(''); setStatusFilter('All leads'); setSourceFilter('All sources'); }}>Clear filters</button> : isAdmin ? <button className="crm-primary-button" onClick={() => setDialog({ mode: 'new' })}>Add your first lead</button> : null}</div>}
        </section>
        <p className="crm-privacy-note">Student records and counselor assignments are stored on the server. Access is checked for every CRM request.</p>
        </>}
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
  const [setupToken, setSetupToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [checkingStatus, setCheckingStatus] = useState(true);
  const hasAdmin = Boolean(status?.adminExists);

  useEffect(() => {
    let active = true;
    crmHasAdmin().then((value) => { if (active) setStatus(value); })
      .catch((statusLoadError) => { if (active) setStatusError(statusLoadError.message || 'The server database is not available.'); })
      .finally(() => { if (active) setCheckingStatus(false); });
    return () => { active = false; };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!hasAdmin && password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    if (!hasAdmin && !status?.setupEnabled) {
      setError('The admin setup token has not been configured in Vercel yet.');
      return;
    }
    setBusy(true);
    try {
      const session = hasAdmin ? await authenticateCrm(username, password) : await createCrmAdmin(username, password, setupToken);
      onAuthenticated(session);
    } catch (loginError) {
      setError(loginError.message || 'Could not sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="crm-app crm-auth-app">
    <header className="crm-header"><div className="crm-header-inner"><a className="crm-brand" href={appUrl('/')} aria-label="GEMS Group Services CRM"><img src={appUrl('/images/logo.png')} alt="GEMS Group Services" /><span className="crm-brand-divider" /><span className="crm-brand-label">CRM</span></a><a className="crm-website-link" href={appUrl('/')}>View website <span aria-hidden="true">↗</span></a></div></header>
    <main className="crm-auth-main">
      <form className="crm-auth-card" onSubmit={submit}>
        <span className="crm-kicker">GEMS GROUP SERVICES · CRM</span>
        {checkingStatus ? <><h1>Connecting securely…</h1><p>Checking the server authentication service.</p></> : statusError ? <><h1>CRM service unavailable</h1><p>{statusError}</p><p className="crm-auth-footnote">Connect the Postgres database in Vercel, then redeploy this project.</p></> : <>
        <h1>{hasAdmin ? 'Sign in to your CRM' : 'Set up your CRM login'}</h1>
        <p>{hasAdmin ? 'Sign in with your admin or counselor ID. Access is enforced by the server.' : 'Create the first administrator account to manage counselor access, leads, and website content.'}</p>
        {!hasAdmin && status?.setupEnabled && <div className="crm-auth-notice"><strong>First-time setup</strong><span>Use the setup token configured in Vercel. It can be used only once, before the first administrator is created.</span></div>}
        {!hasAdmin && !status?.setupEnabled && <div className="crm-auth-notice"><strong>Setup needs one server setting</strong><span>Add CRM_BOOTSTRAP_TOKEN to this project’s Vercel environment variables, then redeploy.</span></div>}
        {!hasAdmin && status?.setupEnabled && <label>One-time setup token<input type="password" autoComplete="off" value={setupToken} onChange={(event) => setSetupToken(event.target.value)} required /></label>}
        <label>{hasAdmin ? 'Admin username or counselor ID' : 'Admin username'}<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} required /></label>
        <label>Password<input type="password" autoComplete={hasAdmin ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} maxLength={128} required /></label>
        {!hasAdmin && <label>Confirm password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={12} maxLength={128} required /></label>}
        {error && <p className="crm-auth-error" role="alert">{error}</p>}
        <button className="crm-primary-button" type="submit" disabled={busy || checkingStatus || Boolean(statusError) || (!hasAdmin && !status?.setupEnabled)}>{busy ? 'Please wait…' : hasAdmin ? 'Sign in' : 'Create admin login'}</button>
        <span className="crm-auth-footnote">Sessions use secure, HTTP-only cookies. Passwords are hashed on the server.</span>
        </>}
      </form>
    </main>
  </div>;
}

export default function CRM() {
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const signOut = useCallback(async () => {
    await logoutCrmAdmin();
    setSession(null);
  }, []);
  useEffect(() => {
    let active = true;
    crmGetSession().then((value) => { if (active) setSession(value); }).catch(() => { if (active) setSession(null); })
      .finally(() => { if (active) setCheckingSession(false); });
    return () => { active = false; };
  }, []);
  if (checkingSession) return <main className="crm-unavailable" role="status">Connecting securely…</main>;
  return session ? <CRMWorkspace session={session} onLogout={signOut} /> : <CRMLogin onAuthenticated={setSession} />;
}
