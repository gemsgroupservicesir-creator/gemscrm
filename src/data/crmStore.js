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

export function updateLead(id, changes) {
  const leads = readLeads().map((lead) => lead.id === id ? { ...lead, ...changes } : lead);
  writeLeads(leads);
  return leads.find((lead) => lead.id === id);
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
  link.download = `krishna-foundation-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
