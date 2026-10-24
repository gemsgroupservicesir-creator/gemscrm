const STORAGE_KEY = 'krishna-foundation-crm-leads-v1';
const UPDATE_EVENT = 'krishna-foundation-crm-updated';

function notifyUpdated() {
  window.dispatchEvent(new Event(UPDATE_EVENT));
}

export function readLeads() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeLeads(leads) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
  notifyUpdated();
}

export function addLead({ name, email, phone = '', faculty = '', course = '', image = '', source = 'Website enquiry', notes = '', noteHistory = [], formAnswers = [], assignedCounselorId = '', status = 'New' }) {
  const lead = {
    id: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
    email: email.trim(),
    phone: phone.trim(),
    faculty: faculty || course,
    course: course || faculty,
    image,
    source,
    notes,
    noteHistory,
    formAnswers,
    assignedCounselorId,
    status,
    createdAt: new Date().toISOString(),
  };
  writeLeads([lead, ...readLeads()]);
  return lead;
}

function parseCsvRows(csv) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const input = String(csv || '').replace(/^\uFEFF/, '');
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && !field.length) quoted = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  row.push(field.replace(/\r$/, ''));
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

export function importLeadsCsv(csv, counselors = [], defaultAssignedCounselorId = '', allowAssignment = false) {
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
  const currentLeads = readLeads();
  const seenEmails = new Set(currentLeads.map((lead) => String(lead.email || '').trim().toLowerCase()).filter(Boolean));
  const seenPhones = new Set(currentLeads.map((lead) => String(lead.phone || '').replace(/\D/g, '')).filter(Boolean));
  const allowedStatuses = new Set(['New', 'Contacted', 'Follow-up', 'Application', 'Enrolled', 'Closed']);
  const counselorByName = new Map();
  counselors.filter((counselor) => counselor.username && counselor.credential && counselor.permissions?.leads).forEach((counselor) => {
    [counselor.name, counselor.username].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean).forEach((value) => counselorByName.set(value, counselor.id));
  });
  const imported = [];
  let skipped = 0;

  rows.slice(1).forEach((cells) => {
    const cell = (index) => index < 0 ? '' : String(cells[index] || '').trim();
    const name = cell(nameIndex);
    const email = cell(emailIndex);
    const phone = cell(phoneIndex);
    if (!name || (!email && !phone)) { skipped += 1; return; }
    const normalizedEmail = email.toLowerCase();
    const normalizedPhone = phone.replace(/\D/g, '');
    if ((normalizedEmail && seenEmails.has(normalizedEmail)) || (normalizedPhone && seenPhones.has(normalizedPhone))) { skipped += 1; return; }
    if (normalizedEmail) seenEmails.add(normalizedEmail);
    if (normalizedPhone) seenPhones.add(normalizedPhone);

    const course = cell(indexOf('course', 'courseofinterest', 'faculty'));
    const importedStatus = cell(indexOf('status'));
    const status = [...allowedStatuses].find((item) => item.toLowerCase() === importedStatus.toLowerCase()) || 'New';
    const importedAssignee = cell(indexOf('assignedcounselor')).toLowerCase();
    const assignedCounselorId = allowAssignment
      ? counselorByName.get(importedAssignee) || ''
      : defaultAssignedCounselorId;
    const answersIndex = indexOf('formanswers');
    const formAnswers = answersIndex < 0 ? [] : cell(answersIndex).split(/\r?\n/).map((line) => {
      const separator = line.indexOf(':');
      return separator < 0 ? null : { label: line.slice(0, separator).trim(), value: line.slice(separator + 1).trim() };
    }).filter((answer) => answer?.label);
    const extraAnswers = headers.flatMap((header, index) => {
      const value = cell(index);
      return !knownHeaders.has(header) && header && value ? [{ label: rows[0][index].trim(), value }] : [];
    });
    const createdAtValue = cell(indexOf('createdat'));
    const parsedDate = createdAtValue ? new Date(createdAtValue) : null;
    const createdAt = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString();
    imported.push({
      id: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      email,
      phone,
      faculty: course,
      course,
      image: '',
      source: cell(indexOf('source')) || 'Imported CSV',
      notes: cell(indexOf('notes')),
      noteHistory: [],
      formAnswers: [...formAnswers, ...extraAnswers],
      assignedCounselorId,
      status,
      createdAt,
    });
  });

  if (imported.length) writeLeads([...imported, ...currentLeads]);
  return { imported: imported.length, skipped };
}

export function updateLead(id, changes) {
  const leads = readLeads().map((lead) => lead.id === id ? { ...lead, ...changes } : lead);
  writeLeads(leads);
  return leads.find((lead) => lead.id === id);
}

export function unassignLeadsFromCounselor(counselorId) {
  const leads = readLeads();
  const updated = leads.map((lead) => lead.assignedCounselorId === counselorId ? { ...lead, assignedCounselorId: '' } : lead);
  if (updated.some((lead, index) => lead !== leads[index])) writeLeads(updated);
}

export function subscribeToLeads(callback) {
  const refresh = () => callback(readLeads());
  window.addEventListener(UPDATE_EVENT, refresh);
  window.addEventListener('storage', refresh);
  return () => {
    window.removeEventListener(UPDATE_EVENT, refresh);
    window.removeEventListener('storage', refresh);
  };
}

export function exportLeadsCsv(leads, counselors = []) {
  const columns = ['name', 'email', 'phone', 'course', 'status', 'assignedCounselor', 'source', 'createdAt', 'notes', 'formAnswers'];
  const counselorNames = new Map(counselors.map((counselor) => [counselor.id, counselor.name]));
  const valueFor = (lead, column) => {
    if (column === 'assignedCounselor') return counselorNames.get(lead.assignedCounselorId) || '';
    if (column === 'notes') {
      const history = Array.isArray(lead.noteHistory) ? lead.noteHistory.map((note) => note.body).filter(Boolean) : [];
      return [lead.notes, ...history].filter(Boolean).join('\n');
    }
    if (column === 'formAnswers') return Array.isArray(lead.formAnswers) ? lead.formAnswers.map((answer) => `${answer.label}: ${answer.value}`).join('\n') : '';
    return lead[column];
  };
  const escapeCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [columns.join(','), ...leads.map((lead) => columns.map((column) => escapeCell(valueFor(lead, column))).join(','))].join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `gems-group-services-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
