import { crmCache, crmRequest, readCache, refreshCrmData, subscribeToCache } from './crmApi.js';

export function readLeads() { return readCache('leads'); }
export function subscribeToLeads(callback) { return subscribeToCache('leads', callback); }

export async function addLead(values) {
  const result = await crmRequest('lead-create', values);
  const leads = [result.lead, ...readLeads().filter((lead) => lead.id !== result.lead.id)];
  crmCache.leads = leads;
  window.dispatchEvent(new CustomEvent('gems-crm-leads-updated', { detail: leads }));
  return result.lead;
}

export async function submitPublicLead(values, slug = '') {
  return crmRequest('lead-submit', { ...values, slug });
}

function parseCsvRows(csv) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const input = String(csv || '').replace(/^\uFEFF/, '');
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && !field.length) quoted = true;
    else if (character === ',') { row.push(field); field = ''; }
    else if (character === '\n') { row.push(field.replace(/\r$/, '')); if (row.some((value) => value.trim())) rows.push(row); row = []; field = ''; }
    else field += character;
  }
  row.push(field.replace(/\r$/, ''));
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

export async function importLeadsCsv(csv, counselors = [], defaultAssignedCounselorId = '', allowAssignment = false) {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) throw new Error('Choose a CSV file with a header row and at least one lead.');
  const normalizeHeader = (value) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const headers = rows[0].map(normalizeHeader);
  const indexOf = (...names) => headers.findIndex((header) => names.includes(header));
  const nameIndex = indexOf('name', 'fullname', 'student', 'studentname');
  const emailIndex = indexOf('email', 'emailaddress', 'gmail');
  const phoneIndex = indexOf('phone', 'phonenumber', 'mobile', 'mobilenumber');
  if (nameIndex === -1 || (emailIndex === -1 && phoneIndex === -1)) throw new Error('The CSV needs a Name column and an Email or Phone column.');

  const knownHeaders = new Set(['name', 'fullname', 'student', 'studentname', 'email', 'emailaddress', 'gmail', 'phone', 'phonenumber', 'mobile', 'mobilenumber', 'course', 'courseofinterest', 'faculty', 'status', 'assignedcounselor', 'source', 'createdat', 'notes', 'formanswers']);
  const emails = new Set(readLeads().map((lead) => String(lead.email || '').trim().toLowerCase()).filter(Boolean));
  const phones = new Set(readLeads().map((lead) => String(lead.phone || '').replace(/\D/g, '')).filter(Boolean));
  const validStatuses = ['New', 'Contacted', 'Follow-up', 'Application', 'Enrolled', 'Closed'];
  const counselorByName = new Map();
  counselors.filter((counselor) => counselor.username && counselor.credential && counselor.permissions?.leads).forEach((counselor) => {
    [counselor.name, counselor.username].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean).forEach((value) => counselorByName.set(value, counselor.id));
  });
  const leads = [];
  let skipped = 0;
  rows.slice(1).forEach((cells) => {
    const cell = (index) => index < 0 ? '' : String(cells[index] || '').trim();
    const name = cell(nameIndex), email = cell(emailIndex), phone = cell(phoneIndex);
    if (!name || (!email && !phone)) { skipped += 1; return; }
    const emailKey = email.toLowerCase(), phoneKey = phone.replace(/\D/g, '');
    if ((emailKey && emails.has(emailKey)) || (phoneKey && phones.has(phoneKey))) { skipped += 1; return; }
    if (emailKey) emails.add(emailKey); if (phoneKey) phones.add(phoneKey);
    const course = cell(indexOf('course', 'courseofinterest', 'faculty'));
    const source = cell(indexOf('source')) || 'Imported CSV';
    const importedAssignee = cell(indexOf('assignedcounselor')).toLowerCase();
    const assignedCounselorId = allowAssignment ? counselorByName.get(importedAssignee) || '' : defaultAssignedCounselorId;
    const answersIndex = indexOf('formanswers');
    const formAnswers = answersIndex < 0 ? [] : cell(answersIndex).split(/\r?\n/).map((line) => {
      const separator = line.indexOf(':');
      return separator < 0 ? null : { label: line.slice(0, separator).trim(), value: line.slice(separator + 1).trim() };
    }).filter((answer) => answer?.label);
    const extraAnswers = headers.flatMap((header, index) => {
      const value = cell(index);
      return !knownHeaders.has(header) && header && value ? [{ label: rows[0][index].trim(), value }] : [];
    });
    const dateValue = cell(indexOf('createdat'));
    const parsedDate = dateValue ? new Date(dateValue) : null;
    leads.push({
      id: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name, email, phone, faculty: course, course, image: '', source,
      notes: cell(indexOf('notes')), noteHistory: [], formAnswers: [...formAnswers, ...extraAnswers],
      assignedCounselorId, status: validStatuses.find((status) => status.toLowerCase() === cell(indexOf('status')).toLowerCase()) || 'New',
      createdAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString(),
    });
  });
  const result = leads.length ? await crmRequest('lead-import', { leads }) : { imported: 0, skipped: 0 };
  await refreshCrmData();
  return { imported: result.imported, skipped: skipped + result.skipped };
}

export async function updateLead(id, changes) {
  const result = await crmRequest('lead-update', { id, changes });
  const leads = readLeads().map((lead) => lead.id === id ? result.lead : lead);
  crmCache.leads = leads;
  window.dispatchEvent(new CustomEvent('gems-crm-leads-updated', { detail: leads }));
  return result.lead;
}

export async function unassignLeadsFromCounselor(counselorId) {
  await Promise.all(readLeads().filter((lead) => lead.assignedCounselorId === counselorId).map((lead) => updateLead(lead.id, { assignedCounselorId: '' })));
}

export function exportLeadsCsv(leads, counselors = []) {
  const columns = ['name', 'email', 'phone', 'course', 'status', 'assignedCounselor', 'source', 'createdAt', 'notes', 'formAnswers'];
  const counselorNames = new Map(counselors.map((counselor) => [counselor.id, counselor.name]));
  const valueFor = (lead, column) => {
    if (column === 'assignedCounselor') return counselorNames.get(lead.assignedCounselorId) || '';
    if (column === 'notes') return [lead.notes, ...(Array.isArray(lead.noteHistory) ? lead.noteHistory.map((note) => note.body).filter(Boolean) : [])].filter(Boolean).join('\n');
    if (column === 'formAnswers') return Array.isArray(lead.formAnswers) ? lead.formAnswers.map((answer) => `${answer.label}: ${answer.value}`).join('\n') : '';
    return lead[column];
  };
  const escapeCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [columns.join(','), ...leads.map((lead) => columns.map((column) => escapeCell(valueFor(lead, column))).join(','))].join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `gems-group-services-leads-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
}
