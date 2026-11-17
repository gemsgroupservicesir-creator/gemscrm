import React, { useEffect, useMemo, useState } from 'react';
import { saveGrowthFeature, saveGrowthTask } from './data/crmGrowth.js';

const activeStages = new Set(['New', 'Contacted', 'Follow-up', 'Application']);
const defaultAutomations = { rules: [
  { id: 'new-enquiry-task', name: 'New enquiry follow-up', trigger: 'new-lead', enabled: false, title: 'Contact new student', delayHours: 4 },
  { id: 'follow-up-task', name: 'Follow-up status reminder', trigger: 'follow-up-status', enabled: false, title: 'Continue student follow-up', delayHours: 24 },
] };
const defaultPlaybooks = [
  { id: 'course-follow-up', name: 'Course enquiry follow-up', purpose: 'Respond after a student asks about a course.', message: 'Hi {{name}}, thanks for contacting GEMS Group Services. I can help with your {{course}} enquiry. Which intake are you considering?' },
  { id: 'documents-pending', name: 'Application documents', purpose: 'Request missing documents for an application.', message: 'Hi {{name}}, I’m following up about your {{course}} application. Please let me know if you need help with the remaining documents.' },
  { id: 'consultation-invite', name: 'Counseling consultation', purpose: 'Offer a student a counseling conversation.', message: 'Hi {{name}}, would you like to speak with a counselor about {{course}} and your study options?' },
];
const defaultQualification = { questions: ['Preferred course or program', 'Preferred university or college', 'Target intake or start date', 'Highest completed education', 'Documents already available', 'Best time to contact'] };
const featureTitles = {
  inbox: ['Team inbox', 'Student enquiries and follow-up activity in one place.'],
  copilot: ['Priority queue', 'A rules-based list of leads that may need attention next.'],
  automations: ['Automations', 'Create CRM follow-up tasks when a lead arrives or enters follow-up.'],
  playbooks: ['Counselor playbooks', 'Reusable message drafts for common admissions conversations.'],
  qualification: ['Qualification guide', 'Set the discovery questions counselors can use with students.'],
  knowledge: ['Knowledge vault', 'Keep approved answers and reference notes available to the team.'],
  recovery: ['Lead recovery', 'Find active leads that have gone quiet and plan the next contact.'],
  broadcasts: ['Campaign drafts', 'Prepare a message and audience for a future connected campaign.'],
  calls: ['Call hub', 'Schedule counselor calls and record outcomes against student leads.'],
  reports: ['Reports', 'Review lead flow, stages, sources, counselor ownership, and tasks.'],
  integrations: ['Integrations', 'See which lead sources are connected to this CRM.'],
  settings: ['Workspace settings', 'Go directly to the access and routing controls already in your CRM.'],
};

function dateInput(hoursFromNow = 24) {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function formatDate(value, options = {}) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'No date' : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...options }).format(date);
}

function lastActivity(lead) {
  const latestNote = Array.isArray(lead.noteHistory) ? lead.noteHistory.reduce((latest, note) => Math.max(latest, new Date(note.createdAt || 0).getTime()), 0) : 0;
  const created = new Date(lead.createdAt || 0).getTime();
  return new Date(Math.max(latestNote, created));
}

function initials(value = '') {
  return String(value).trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

function leadPriority(lead) {
  const ageHours = (Date.now() - lastActivity(lead).getTime()) / 3_600_000;
  if (lead.status === 'Follow-up' && ageHours >= 24) return { score: 95, label: 'Follow-up overdue' };
  if (lead.status === 'New' && ageHours >= 12) return { score: 85, label: 'New enquiry waiting' };
  if (lead.status === 'Application' && ageHours >= 36) return { score: 75, label: 'Application needs update' };
  if (lead.status === 'Contacted' && ageHours >= 48) return { score: 65, label: 'Check in with student' };
  return null;
}

function PanelHeader({ tab, children }) {
  const [title, subtitle] = featureTitles[tab] || ['Growth Desk', ''];
  return <div className="crm-title-row growth-feature-title"><div><span className="crm-kicker">GEMS GROUP SERVICES · GROWTH DESK</span><h1>{title}</h1><p>{subtitle}</p></div>{children}</div>;
}

function GrowthTaskRow({ task, lead, counselorName, isAdmin, onLead, onSaveTask, onDeleteTask }) {
  const [outcome, setOutcome] = useState(task.outcome || '');
  const [savingOutcome, setSavingOutcome] = useState(false);
  useEffect(() => setOutcome(task.outcome || ''), [task.outcome]);
  async function saveOutcome() {
    setSavingOutcome(true);
    try { await onSaveTask({ ...task, outcome }); }
    finally { setSavingOutcome(false); }
  }
  return <article className={`growth-task-row ${task.status !== 'open' ? 'is-done' : ''}`}>
    <button className={`growth-task-check ${task.status === 'completed' ? 'checked' : ''}`} type="button" aria-label={task.status === 'completed' ? 'Mark task open' : 'Mark task complete'} onClick={() => onSaveTask({ ...task, status: task.status === 'completed' ? 'open' : 'completed' })}>{task.status === 'completed' ? '✓' : ''}</button>
    <div className="growth-task-main"><strong>{task.title}</strong><small>{lead?.name || 'Lead removed'} · {task.type || 'follow-up'}{isAdmin && task.assignedCounselorId ? ` · ${counselorName || 'Counselor'}` : ''}</small>{task.description && <p>{task.description}</p>}</div>
    <time>{formatDate(task.dueAt)}</time>
    {lead && <button className="growth-inline-link" type="button" onClick={() => onLead(lead.id)}>Open lead ↗</button>}
    {task.type === 'call' && <div className="growth-task-outcome"><input value={outcome} maxLength={2000} placeholder="Call outcome or next step" onChange={(event) => setOutcome(event.target.value)} /><button className="growth-inline-link" type="button" disabled={savingOutcome || outcome === (task.outcome || '')} onClick={saveOutcome}>{savingOutcome ? 'Saving…' : 'Save outcome'}</button></div>}
    {isAdmin && <button className="growth-remove-button" type="button" onClick={() => onDeleteTask(task.id)} aria-label={`Delete ${task.title}`}>×</button>}
  </article>;
}

function TaskRows({ tasks, leads, counselors, onLead, onSaveTask, onDeleteTask, isAdmin }) {
  const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
  const counselorMap = new Map(counselors.map((item) => [item.id, item.name]));
  if (!tasks.length) return <div className="growth-feature-empty"><span>◷</span><strong>No tasks here yet</strong><p>Follow-ups and call bookings will appear here.</p></div>;
  return <div className="growth-task-list">{tasks.map((task) => <GrowthTaskRow key={task.id} task={task} lead={leadMap.get(task.leadId)} counselorName={counselorMap.get(task.assignedCounselorId)} isAdmin={isAdmin} onLead={onLead} onSaveTask={onSaveTask} onDeleteTask={onDeleteTask} />)}</div>;
}

function QuickTaskForm({ leads, onSave, initialLeadId = '', fixedType = '' }) {
  const [form, setForm] = useState({ leadId: initialLeadId || leads[0]?.id || '', title: fixedType === 'call' ? 'Counseling call' : 'Student follow-up', type: fixedType || 'follow-up', dueAt: dateInput(24), description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setForm((current) => ({ ...current, leadId: initialLeadId || current.leadId || leads[0]?.id || '' })), [initialLeadId, leads]);
  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('');
    try { const saved = await onSave({ ...form, dueAt: new Date(form.dueAt).toISOString() }); if (saved === false) return; setForm((current) => ({ ...current, description: '', title: fixedType === 'call' ? 'Counseling call' : 'Student follow-up' })); }
    catch (saveError) { setError(saveError.message || 'Could not save this task.'); }
    finally { setSaving(false); }
  }
  const field = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return <form className="growth-task-form" onSubmit={submit}>
    <label>Student<select value={form.leadId} onChange={(event) => field('leadId', event.target.value)} required><option value="" disabled>Select a lead</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name} · {lead.course || 'Course not selected'}</option>)}</select></label>
    <label>Task title<input value={form.title} onChange={(event) => field('title', event.target.value)} maxLength={180} required /></label>
    {!fixedType && <label>Type<select value={form.type} onChange={(event) => field('type', event.target.value)}><option value="follow-up">Follow-up</option><option value="application">Application</option><option value="documents">Documents</option><option value="site-visit">Consultation</option><option value="call">Call</option><option value="other">Other</option></select></label>}
    <label>Due date and time<input type="datetime-local" value={form.dueAt} onChange={(event) => field('dueAt', event.target.value)} required /></label>
    <label className="wide">Details<textarea value={form.description} onChange={(event) => field('description', event.target.value)} rows="2" maxLength={5000} placeholder="Add context or the next step" /></label>
    {error && <p className="growth-feature-error" role="alert">{error}</p>}
    <div className="growth-form-actions"><button className="crm-primary-button" type="submit" disabled={saving || !leads.length}>{saving ? 'Saving…' : 'Add to task queue'}</button></div>
  </form>;
}

export default function GrowthFeaturePage({ tab, leads, counselors, tasks, featureData, integrations, isAdmin, onLead, onTaskSave, onTaskDelete, onOpenTab }) {
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [automationRules, setAutomationRules] = useState(featureData.automations?.rules || defaultAutomations.rules);
  const [playbooks, setPlaybooks] = useState(featureData.playbooks?.items || defaultPlaybooks);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState((featureData.playbooks?.items || defaultPlaybooks)[0]?.id || '');
  const [questions, setQuestions] = useState(featureData.qualification?.questions || defaultQualification.questions);
  const [knowledgeItems, setKnowledgeItems] = useState(featureData.knowledge?.items || []);
  const [broadcasts, setBroadcasts] = useState(featureData.broadcasts?.items || []);
  const [campaign, setCampaign] = useState({ name: '', audience: 'All active leads', channel: 'WhatsApp', message: '' });
  const [reportPeriod, setReportPeriod] = useState('30');

  useEffect(() => {
    setAutomationRules(featureData.automations?.rules || defaultAutomations.rules);
    const nextPlaybooks = featureData.playbooks?.items || defaultPlaybooks;
    setPlaybooks(nextPlaybooks); setSelectedPlaybookId((current) => nextPlaybooks.some((item) => item.id === current) ? current : nextPlaybooks[0]?.id || '');
    setQuestions(featureData.qualification?.questions || defaultQualification.questions);
    setKnowledgeItems(featureData.knowledge?.items || []);
    setBroadcasts(featureData.broadcasts?.items || []);
  }, [featureData]);

  const openTasks = useMemo(() => tasks.filter((task) => task.status === 'open').sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)), [tasks]);
  const visibleLeads = useMemo(() => [...leads].filter((lead) => [lead.name, lead.email, lead.phone, lead.course, lead.university].some((value) => String(value || '').toLowerCase().includes(search.trim().toLowerCase()))).sort((a, b) => lastActivity(b) - lastActivity(a)), [leads, search]);

  async function persist(id, value, success) {
    setSaving(true); setError(''); setNotice('');
    try { await saveGrowthFeature(id, value); setNotice(success); return true; }
    catch (saveError) { setError(saveError.message || 'Could not save this workspace section.'); return false; }
    finally { setSaving(false); }
  }

  async function persistTask(task, success = 'Task saved to the CRM queue.') {
    setError(''); setNotice('');
    try { await onTaskSave(task); setNotice(success); return true; }
    catch (saveError) { setError(saveError.message || 'Could not save this CRM task.'); return false; }
  }

  async function removeTask(id) {
    setError(''); setNotice('');
    try { await onTaskDelete(id); setNotice('Task removed.'); }
    catch (deleteError) { setError(deleteError.message || 'Could not remove this task.'); }
  }

  async function createQuickTask(lead, title, type = 'follow-up', delayHours = 24) {
    return persistTask({ leadId: lead.id, title, type, dueAt: new Date(Date.now() + delayHours * 3_600_000).toISOString(), description: 'Created from the Growth Desk.' });
  }

  const notices = <>{notice && <p className="crm-import-notice growth-feature-message" role="status">{notice}</p>}{error && <p className="crm-import-error growth-feature-message" role="alert">{error}</p>}</>;
  const leadAction = (lead) => <button type="button" className="crm-secondary-button" onClick={() => onLead(lead.id)}>Open lead</button>;

  if (tab === 'inbox') return <section className="growth-feature-page"><PanelHeader tab={tab}><label className="growth-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student enquiries" /></label></PanelHeader>{notices}<div className="growth-feature-columns"><section className="growth-feature-panel"><div className="growth-feature-panel-head"><div><h2>Recent enquiries</h2><p>Open a student record or contact them through the details on file.</p></div><span className="growth-feature-count">{visibleLeads.length}</span></div>{visibleLeads.length ? <div className="growth-inbox-list">{visibleLeads.map((lead) => {
    const recentNote = [...(lead.noteHistory || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    return <article className="growth-inbox-row" key={lead.id}><span className="growth-inbox-avatar">{initials(lead.name)}</span><div className="growth-inbox-copy"><button type="button" onClick={() => onLead(lead.id)}>{lead.name}</button><small>{lead.course || 'Course not selected'}{lead.university ? ` · ${lead.university}` : ''}</small><p>{recentNote?.body || `New enquiry · ${lead.source || 'Website'}`}</p></div><time>{formatDate(lastActivity(lead))}</time><div className="growth-contact-actions">{lead.phone && <a href={`https://wa.me/${String(lead.phone).replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp ↗</a>}{lead.email && <a href={`mailto:${encodeURIComponent(lead.email)}`}>Email ↗</a>}</div></article>;
      })}</div> : <div className="growth-feature-empty"><span>◔</span><strong>No matching enquiries</strong><p>Leads from your connected Google Sheet and website appear here.</p></div>}</section><section className="growth-feature-panel"><div className="growth-feature-panel-head"><div><h2>Follow-up queue</h2><p>Tasks shared with your assigned students.</p></div><span className="growth-feature-count">{openTasks.length}</span></div><TaskRows tasks={openTasks.slice(0, 12)} leads={leads} counselors={counselors} onLead={onLead} onSaveTask={(task) => persistTask(task, 'Task updated.')} onDeleteTask={removeTask} isAdmin={isAdmin} /></section></div><p className="crm-privacy-note">This inbox shows CRM lead activity and saved follow-up tasks. External messages are opened through your mail, phone, or WhatsApp app.</p></section>;

  if (tab === 'copilot') {
    const priorityLeads = leads.map((lead) => ({ lead, priority: leadPriority(lead) })).filter((item) => item.priority).sort((a, b) => b.priority.score - a.priority.score).slice(0, 30);
    return <section className="growth-feature-page"><PanelHeader tab={tab}><span className="growth-rule-badge">Rules based · no AI service configured</span></PanelHeader>{notices}<div className="growth-feature-columns"><section className="growth-feature-panel"><div className="growth-feature-panel-head"><div><h2>Needs attention</h2><p>New, follow-up, or application leads with no recent recorded activity.</p></div><span className="growth-feature-count">{priorityLeads.length}</span></div>{priorityLeads.length ? <div className="growth-priority-list">{priorityLeads.map(({ lead, priority }) => <article className="growth-priority-row" key={lead.id}><span className="growth-priority-score">{priority.score}</span><div><strong>{lead.name}</strong><small>{priority.label} · {lead.course || 'Course not selected'} · last activity {formatDate(lastActivity(lead), { year: undefined })}</small></div><button className="crm-secondary-button" type="button" onClick={() => createQuickTask(lead, 'Priority student follow-up')}>Create task</button>{leadAction(lead)}</article>)}</div> : <div className="growth-feature-empty"><span>✦</span><strong>Nothing needs attention right now</strong><p>Priority suggestions use lead stage and CRM activity timestamps.</p></div>}</section><section className="growth-feature-panel"><div className="growth-feature-panel-head"><div><h2>Upcoming actions</h2><p>Scheduled work from your shared CRM task queue.</p></div></div><TaskRows tasks={openTasks.slice(0, 10)} leads={leads} counselors={counselors} onLead={onLead} onSaveTask={(task) => persistTask(task, 'Task updated.')} onDeleteTask={removeTask} isAdmin={isAdmin} /></section></div></section>;
  }

  if (tab === 'automations') return <section className="growth-feature-page"><PanelHeader tab={tab}><button className="crm-primary-button" type="button" onClick={() => setAutomationRules((items) => [...items, { id: `rule-${Date.now()}`, name: 'New follow-up rule', trigger: 'new-lead', enabled: false, title: 'Contact new student', delayHours: 24 }])}>＋ Add rule</button></PanelHeader>{notices}<div className="growth-feature-panel"><div className="growth-feature-panel-head"><div><h2>Task automations</h2><p>Rules create internal CRM tasks. They do not send messages or contact students.</p></div></div><div className="growth-automation-list">{automationRules.map((rule, index) => <article className="growth-automation-row" key={rule.id}><label className="growth-switch"><input type="checkbox" checked={rule.enabled === true} disabled={!isAdmin} onChange={(event) => setAutomationRules((items) => items.map((item, i) => i === index ? { ...item, enabled: event.target.checked } : item))} /><span /></label><div className="growth-automation-fields"><label>Rule name<input disabled={!isAdmin} value={rule.name} onChange={(event) => setAutomationRules((items) => items.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /></label><label>When<select disabled={!isAdmin} value={rule.trigger} onChange={(event) => setAutomationRules((items) => items.map((item, i) => i === index ? { ...item, trigger: event.target.value } : item))}><option value="new-lead">A new lead is added</option><option value="follow-up-status">Lead status becomes Follow-up</option></select></label><label>Task title<input disabled={!isAdmin} value={rule.title} onChange={(event) => setAutomationRules((items) => items.map((item, i) => i === index ? { ...item, title: event.target.value } : item))} /></label><label>Due after (hours)<input type="number" min="1" max="720" disabled={!isAdmin} value={rule.delayHours} onChange={(event) => setAutomationRules((items) => items.map((item, i) => i === index ? { ...item, delayHours: Number(event.target.value) } : item))} /></label></div></article>)}</div>{isAdmin ? <div className="growth-save-row"><button className="crm-primary-button" type="button" disabled={saving} onClick={() => persist('automations', { rules: automationRules }, 'Automation rules saved.')}>{saving ? 'Saving…' : 'Save rules'}</button></div> : <p className="crm-privacy-note">Only an administrator can change automation rules.</p>}</div></section>;

  if (tab === 'playbooks') {
    const selected = playbooks.find((item) => item.id === selectedPlaybookId) || playbooks[0];
    return <section className="growth-feature-page"><PanelHeader tab={tab}>{isAdmin && <button className="crm-primary-button" type="button" onClick={() => { const item = { id: `playbook-${Date.now()}`, name: 'New counselor message', purpose: '', message: '' }; setPlaybooks((items) => [...items, item]); setSelectedPlaybookId(item.id); }}>＋ Add playbook</button>}</PanelHeader>{notices}<div className="growth-feature-columns growth-playbook-layout"><div className="growth-feature-panel"><div className="growth-feature-panel-head"><div><h2>Message library</h2><p>Choose a draft to personalize.</p></div></div><div className="growth-choice-list">{playbooks.map((item) => <button key={item.id} type="button" className={selected?.id === item.id ? 'active' : ''} onClick={() => setSelectedPlaybookId(item.id)}><strong>{item.name}</strong><small>{item.purpose || 'Add guidance for counselors'}</small></button>)}</div></div><div className="growth-feature-panel growth-playbook-editor">{selected ? <><div className="growth-feature-panel-head"><div><h2>{isAdmin ? 'Edit message draft' : selected.name}</h2><p>Use the copy button to paste this draft into your connected contact app.</p></div></div><label>Playbook name<input disabled={!isAdmin} value={selected.name} onChange={(event) => setPlaybooks((items) => items.map((item) => item.id === selected.id ? { ...item, name: event.target.value } : item))} /></label><label>Purpose<input disabled={!isAdmin} value={selected.purpose} onChange={(event) => setPlaybooks((items) => items.map((item) => item.id === selected.id ? { ...item, purpose: event.target.value } : item))} /></label><label>Message<textarea disabled={!isAdmin} rows="8" value={selected.message} onChange={(event) => setPlaybooks((items) => items.map((item) => item.id === selected.id ? { ...item, message: event.target.value } : item))} /></label><p className="growth-token-hint">Personalization fields: {'{{name}}'}, {'{{course}}'}, {'{{university}}'}.</p><div className="growth-save-row"><button className="crm-secondary-button" type="button" onClick={() => navigator.clipboard?.writeText(selected.message).then(() => setNotice('Draft copied to clipboard.')).catch(() => setError('Clipboard access is not available.'))}>Copy draft</button>{isAdmin && <button className="crm-primary-button" type="button" disabled={saving} onClick={() => persist('playbooks', { items: playbooks }, 'Playbooks saved.')}>{saving ? 'Saving…' : 'Save playbooks'}</button>}</div></> : <div className="growth-feature-empty"><strong>No playbooks yet</strong></div>}</div></div></section>;
  }

  if (tab === 'qualification') return <section className="growth-feature-page"><PanelHeader tab={tab}><span className="growth-rule-badge">Counselor checklist · no AI provider connected</span></PanelHeader>{notices}<section className="growth-feature-panel"><div className="growth-feature-panel-head"><div><h2>Student discovery questions</h2><p>Use these prompts during counseling and record answers in the lead notes or form answers.</p></div>{isAdmin && <button className="crm-secondary-button" type="button" onClick={() => setQuestions((items) => [...items, 'New qualification question'])}>＋ Add question</button>}</div><ol className="growth-question-list">{questions.map((question, index) => <li key={`${index}-${question}`}><span>{String(index + 1).padStart(2, '0')}</span><input disabled={!isAdmin} value={question} onChange={(event) => setQuestions((items) => items.map((item, i) => i === index ? event.target.value : item))} /><button className="growth-remove-button" type="button" disabled={!isAdmin} onClick={() => setQuestions((items) => items.filter((_, i) => i !== index))} aria-label="Remove question">×</button></li>)}</ol>{isAdmin ? <div className="growth-save-row"><button className="crm-primary-button" type="button" disabled={saving} onClick={() => persist('qualification', { questions: questions.map((item) => item.trim()).filter(Boolean).slice(0, 40) }, 'Qualification checklist saved.')}>{saving ? 'Saving…' : 'Save questions'}</button></div> : <p className="crm-privacy-note">Only an administrator can change the shared checklist.</p>}</section></section>;

  if (tab === 'knowledge') return <section className="growth-feature-page"><PanelHeader tab={tab}>{isAdmin && <button className="crm-primary-button" type="button" onClick={() => setKnowledgeItems((items) => [...items, { id: `faq-${Date.now()}`, title: '', answer: '' }])}>＋ Add answer</button>}</PanelHeader>{notices}<div className="growth-feature-panel"><div className="growth-feature-panel-head"><div><h2>Approved answers and reference notes</h2><p>Store verified information for counselors. Content is not sent automatically.</p></div><span className="growth-feature-count">{knowledgeItems.length}</span></div>{knowledgeItems.length ? <div className="growth-knowledge-list">{knowledgeItems.map((item, index) => <article key={item.id || index}><label>Question or topic<input disabled={!isAdmin} value={item.title || ''} onChange={(event) => setKnowledgeItems((items) => items.map((row, i) => i === index ? { ...row, title: event.target.value } : row))} /></label><label>Approved answer<textarea disabled={!isAdmin} rows="3" value={item.answer || ''} onChange={(event) => setKnowledgeItems((items) => items.map((row, i) => i === index ? { ...row, answer: event.target.value } : row))} /></label>{isAdmin && <button className="growth-remove-button" type="button" onClick={() => setKnowledgeItems((items) => items.filter((_, i) => i !== index))}>Remove</button>}</article>)}</div> : <div className="growth-feature-empty"><span>▣</span><strong>No reference answers yet</strong><p>Add approved information such as course guidance, application steps, and document requirements.</p></div>}{isAdmin && <div className="growth-save-row"><button className="crm-primary-button" type="button" disabled={saving} onClick={() => persist('knowledge', { items: knowledgeItems }, 'Knowledge vault saved.')}>{saving ? 'Saving…' : 'Save knowledge'}</button></div>}</div></section>;

  if (tab === 'recovery') {
    const stale = leads.filter((lead) => activeStages.has(lead.status || 'New') && Date.now() - lastActivity(lead).getTime() >= 3 * 86_400_000).sort((a, b) => lastActivity(a) - lastActivity(b));
    return <section className="growth-feature-page"><PanelHeader tab={tab}><span className="growth-rule-badge">Quiet for 3+ days · no messages sent</span></PanelHeader>{notices}<section className="growth-feature-panel"><div className="growth-feature-panel-head"><div><h2>Students to reconnect with</h2><p>Leads in an active stage without recent saved notes or activity.</p></div><span className="growth-feature-count">{stale.length}</span></div>{stale.length ? <div className="growth-recovery-list">{stale.map((lead) => <article key={lead.id}><span className="growth-inbox-avatar">{initials(lead.name)}</span><div><strong>{lead.name}</strong><small>{lead.course || 'Course not selected'}{lead.university ? ` · ${lead.university}` : ''}</small><p>Last activity {formatDate(lastActivity(lead))} · {lead.status || 'New'}</p></div><button className="crm-secondary-button" type="button" onClick={() => createQuickTask(lead, 'Reconnect with student')}>Create recovery task</button>{leadAction(lead)}</article>)}</div> : <div className="growth-feature-empty"><span>↻</span><strong>No quiet active leads</strong><p>Active leads with no note or update for three days will appear here.</p></div>}</section><div className="growth-feature-panel"><div className="growth-feature-panel-head"><div><h2>Open recovery tasks</h2><p>Track the follow-up actions you have scheduled.</p></div></div><TaskRows tasks={openTasks.filter((task) => task.type === 'follow-up')} leads={leads} counselors={counselors} onLead={onLead} onSaveTask={(task) => persistTask(task, 'Task updated.')} onDeleteTask={removeTask} isAdmin={isAdmin} /></div></section>;
  }

  if (tab === 'broadcasts') {
    const matchingAudience = campaign.audience === 'All active leads' ? leads.filter((lead) => activeStages.has(lead.status || 'New')) : leads.filter((lead) => (lead.status || 'New') === campaign.audience);
    async function saveCampaign(event) {
      event.preventDefault();
      if (!campaign.name.trim() || !campaign.message.trim()) { setError('Add a campaign name and message before saving.'); return; }
      const next = [{ id: `campaign-${Date.now()}`, ...campaign, recipients: matchingAudience.length, status: 'Draft', createdAt: new Date().toISOString() }, ...broadcasts];
      if (await persist('broadcasts', { items: next }, 'Campaign draft saved.')) {
        setBroadcasts(next);
        setCampaign({ name: '', audience: 'All active leads', channel: 'WhatsApp', message: '' });
      }
    }
    return <section className="growth-feature-page"><PanelHeader tab={tab}><span className="growth-rule-badge">Draft only · sending is not connected</span></PanelHeader>{notices}<div className="growth-feature-columns"><section className="growth-feature-panel"><div className="growth-feature-panel-head"><div><h2>Prepare campaign draft</h2><p>Choose an audience from the leads you can access.</p></div></div><form className="growth-campaign-form" onSubmit={saveCampaign}><label>Campaign name<input value={campaign.name} onChange={(event) => setCampaign((current) => ({ ...current, name: event.target.value }))} required /></label><label>Audience<select value={campaign.audience} onChange={(event) => setCampaign((current) => ({ ...current, audience: event.target.value }))}><option>All active leads</option>{['New', 'Contacted', 'Follow-up', 'Application', 'Enrolled', 'Closed'].map((stage) => <option key={stage}>{stage}</option>)}</select></label><label>Preferred channel<select value={campaign.channel} onChange={(event) => setCampaign((current) => ({ ...current, channel: event.target.value }))}><option>WhatsApp</option><option>Email</option></select></label><label>Message<textarea rows="6" value={campaign.message} onChange={(event) => setCampaign((current) => ({ ...current, message: event.target.value }))} required maxLength={4000} /></label><div className="growth-campaign-footer"><span>Estimated audience: <strong>{matchingAudience.length}</strong> leads</span><button className="crm-primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save draft'}</button></div></form></section><section className="growth-feature-panel"><div className="growth-feature-panel-head"><div><h2>Campaign history</h2><p>Saved drafts from this CRM.</p></div><span className="growth-feature-count">{broadcasts.length}</span></div>{broadcasts.length ? <div className="growth-campaign-list">{broadcasts.map((item) => <article key={item.id}><span className="growth-campaign-status">Draft</span><strong>{item.name}</strong><small>{item.channel} · {item.recipients} potential recipients · {formatDate(item.createdAt)}</small><p>{item.message}</p></article>)}</div> : <div className="growth-feature-empty"><span>◉</span><strong>No saved campaigns</strong><p>Campaign drafts remain in the CRM until a sending provider is connected.</p></div>}</section></div></section>;
  }

  if (tab === 'calls') {
    const callTasks = tasks.filter((task) => task.type === 'call').sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
    return <section className="growth-feature-page"><PanelHeader tab={tab}><span className="growth-rule-badge">CRM schedule · no external reminders</span></PanelHeader>{notices}<div className="growth-feature-columns"><section className="growth-feature-panel"><div className="growth-feature-panel-head"><div><h2>Schedule a counseling call</h2><p>Add the appointment to the lead and counselor task queue.</p></div></div><QuickTaskForm leads={leads} onSave={persistTask} fixedType="call" /></section><section className="growth-feature-panel"><div className="growth-feature-panel-head"><div><h2>Call schedule and outcomes</h2><p>Mark completed calls and add an outcome note.</p></div><span className="growth-feature-count">{callTasks.filter((item) => item.status === 'open').length} upcoming</span></div><TaskRows tasks={callTasks} leads={leads} counselors={counselors} onLead={onLead} onSaveTask={(task) => persistTask(task, 'Call task updated.')} onDeleteTask={removeTask} isAdmin={isAdmin} /></section></div></section>;
  }

  if (tab === 'reports') {
    const days = Number(reportPeriod);
    const cutoff = Date.now() - days * 86_400_000;
    const recent = leads.filter((lead) => new Date(lead.createdAt || 0).getTime() >= cutoff);
    const byStatus = ['New', 'Contacted', 'Follow-up', 'Application', 'Enrolled', 'Closed'].map((status) => [status, leads.filter((lead) => (lead.status || 'New') === status).length]);
    const bySource = Object.entries(leads.reduce((counts, lead) => { const source = lead.source || 'Website enquiry'; counts[source] = (counts[source] || 0) + 1; return counts; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxStage = Math.max(1, ...byStatus.map(([, count]) => count));
    const counselorRows = counselors.filter((item) => item.credential).map((counselor) => ({ ...counselor, count: leads.filter((lead) => lead.assignedCounselorId === counselor.id).length, tasks: tasks.filter((task) => task.assignedCounselorId === counselor.id && task.status === 'completed').length }));
    return <section className="growth-feature-page"><PanelHeader tab={tab}><label className="growth-report-period">Period<select value={reportPeriod} onChange={(event) => setReportPeriod(event.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label></PanelHeader>{notices}<div className="growth-feature-stats"><article><span>Leads in period</span><strong>{recent.length}</strong></article><article><span>Open enquiries</span><strong>{leads.filter((lead) => activeStages.has(lead.status || 'New')).length}</strong></article><article><span>Follow-up tasks</span><strong>{openTasks.length}</strong></article><article><span>Enrolled</span><strong>{leads.filter((lead) => lead.status === 'Enrolled').length}</strong></article></div><div className="growth-feature-columns"><section className="growth-feature-panel"><div className="growth-feature-panel-head"><div><h2>Admissions pipeline</h2><p>Current lead count by status.</p></div></div><div className="growth-report-bars">{byStatus.map(([status, count]) => <div key={status}><span>{status}</span><div><i style={{ width: `${Math.max(count ? 3 : 0, count / maxStage * 100)}%` }} /></div><b>{count}</b></div>)}</div></section><section className="growth-feature-panel"><div className="growth-feature-panel-head"><div><h2>Lead sources</h2><p>Where student enquiries came from.</p></div></div>{bySource.length ? <div className="growth-report-source-list">{bySource.map(([source, count]) => <div key={source}><span>{source}</span><strong>{count}</strong></div>)}</div> : <div className="growth-feature-empty"><p>Lead source results will appear here as enquiries arrive.</p></div>}</section></div>{isAdmin && <section className="growth-feature-panel"><div className="growth-feature-panel-head"><div><h2>Counselor workload</h2><p>Assigned leads and completed CRM tasks.</p></div></div><div className="growth-table-scroll"><table className="growth-report-table"><thead><tr><th>Counselor</th><th>Assigned leads</th><th>Tasks completed</th><th>Open tasks</th></tr></thead><tbody>{counselorRows.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.count}</td><td>{item.tasks}</td><td>{tasks.filter((task) => task.assignedCounselorId === item.id && task.status === 'open').length}</td></tr>)}</tbody></table></div></section>}</section>;
  }

  if (tab === 'integrations') return <section className="growth-feature-page"><PanelHeader tab={tab}><span className="growth-rule-badge">Server credentials stay private</span></PanelHeader>{notices}<div className="growth-integration-grid"><article className="growth-feature-panel"><span className={`growth-integration-status ${integrations.googleSheetsConnected ? 'connected' : ''}`}>{integrations.googleSheetsConnected ? 'Connected' : 'Setup needed'}</span><span className="growth-integration-icon">▦</span><h2>Google Sheets</h2><p>{integrations.googleSheetsConnected ? 'The CRM service account is configured. Sync imports and updates student leads from the selected sheet.' : 'Add the service account credential in Vercel to enable the existing Google Sheets sync.'}</p><button className="crm-secondary-button" type="button" onClick={() => onOpenTab('leads')}>Open lead sync</button></article><article className="growth-feature-panel"><span className="growth-integration-status connected">Active</span><span className="growth-integration-icon">⌂</span><h2>Website enquiry forms</h2><p>Public website and published landing page forms save directly into the authenticated CRM lead database.</p><button className="crm-secondary-button" type="button" onClick={() => onOpenTab('landing-pages')}>Open landing pages</button></article>{[['WhatsApp Business', 'Not connected', 'Provider credentials and webhook setup are required before messages can be sent.'], ['Meta Lead Ads', 'Not connected', 'A Meta app and lead webhook must be configured before importing forms.'], ['Google Ads', 'Not connected', 'A secure Google Ads lead form integration must be configured first.']].map(([name, status, copy]) => <article className="growth-feature-panel" key={name}><span className="growth-integration-status">{status}</span><span className="growth-integration-icon">⧉</span><h2>{name}</h2><p>{copy}</p><button className="crm-secondary-button" type="button" disabled>Setup required</button></article>)}</div></section>;

  if (tab === 'settings') return <section className="growth-feature-page"><PanelHeader tab={tab} />{notices}<div className="growth-settings-grid"><button className="growth-settings-link" type="button" onClick={() => onOpenTab('counselors')}><span>♙</span><strong>Team and permissions</strong><small>Add or remove counselors and control section access.</small><b>Open counselor management ↗</b></button><button className="growth-settings-link" type="button" onClick={() => onOpenTab('lead-assigner')}><span>⇢</span><strong>Lead routing</strong><small>Assign leads based on course and university selection.</small><b>Open lead assigner ↗</b></button><button className="growth-settings-link" type="button" onClick={() => onOpenTab('website')}><span>⌂</span><strong>Website and brand</strong><small>Edit the public website content, universities, and testimonials.</small><b>Open website editor ↗</b></button><button className="growth-settings-link" type="button" onClick={() => onOpenTab('landing-pages')}><span>▧</span><strong>Campaign forms</strong><small>Manage campaign pages, lead fields, course options, and counselor routing.</small><b>Open landing pages ↗</b></button></div><div className="growth-feature-panel growth-settings-note"><div><strong>Workspace access</strong><p>Lead records, counselor ownership, and connected-sheet synchronization are checked by the CRM server on every request.</p></div><button className="crm-secondary-button" type="button" onClick={() => onOpenTab('integrations')}>Review integrations</button></div></section>;

  return <section className="growth-feature-page"><PanelHeader tab={tab || 'inbox'} /></section>;
}
