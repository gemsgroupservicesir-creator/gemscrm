import { randomBytes, createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { GoogleAuth } from 'google-auth-library';
import { validLead } from '../lib/crmInput.js';

const SESSION_COOKIE = 'gems_crm_session';
const DEFAULT_SPREADSHEET_ID = '1z18sHEe4cH8FOfyfu2xy-iKPIUZovpPJ-6tf8d4V048';
const DEFAULT_SHEET_GID = 223624821;
const VALID_STATUSES = new Set(['New', 'Contacted', 'Follow-up', 'Application', 'Enrolled', 'Closed']);
const KNOWN_HEADERS = new Set([
  'id', 'leadid', 'studentid', 'recordid', 'name', 'fullname', 'student', 'studentname', 'applicantname',
  'email', 'emailaddress', 'gmail', 'gmailaddress', 'emailid', 'phone', 'phonenumber', 'mobile', 'mobilenumber', 'contactnumber',
  'course', 'courseofinterest', 'faculty', 'university', 'universityname', 'college', 'collegename', 'universitycollege', 'institution',
  'status', 'assignedcounselor', 'counselor', 'counselorname', 'source', 'createdat', 'date', 'submittedat', 'timestamp', 'notes',
]);

function send(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(value));
}

function cookieValue(req, name) {
  for (const item of String(req.headers.cookie || '').split(';')) {
    const [key, ...rest] = item.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

function normalizeHeader(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, year, month, day] = iso;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  }
  const dayFirst = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (dayFirst) {
    const [, day, month, year] = dayFirst;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (Number.isNaN(parsed.getTime()) || parsed.getUTCDate() !== Number(day) || parsed.getUTCMonth() !== Number(month) - 1) return '';
    return parsed.toISOString();
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function safeCell(row, index) {
  return index < 0 ? '' : String(row[index] ?? '').trim();
}

async function getGoogleSheetRows() {
  const credentialJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentialJson) throw Object.assign(new Error('Add GOOGLE_SERVICE_ACCOUNT_JSON in Vercel to connect the read-only Google Sheets service account.'), { status: 503 });
  let credentials;
  try { credentials = JSON.parse(credentialJson); }
  catch { throw Object.assign(new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.'), { status: 503 }); }
  if (!credentials.client_email || !credentials.private_key) {
    throw Object.assign(new Error('The Google service account JSON must include client_email and private_key.'), { status: 503 });
  }
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
  const sheetGid = Number(process.env.GOOGLE_SHEETS_GID || DEFAULT_SHEET_GID);
  if (!Number.isInteger(sheetGid) || sheetGid < 0) throw Object.assign(new Error('GOOGLE_SHEETS_GID must be a non-negative sheet tab ID.'), { status: 503 });

  const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const client = await auth.getClient();
  const root = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  const metadataResponse = await client.request({ url: `${root}?fields=sheets.properties(sheetId,title)` });
  const sheet = (metadataResponse.data?.sheets || []).map((item) => item.properties || {}).find((item) => Number(item.sheetId) === sheetGid);
  if (!sheet?.title) throw Object.assign(new Error('The configured Google Sheet tab was not found. Check GOOGLE_SHEETS_GID.'), { status: 404 });

  const escapedTitle = sheet.title.replaceAll("'", "''");
  const range = `'${escapedTitle}'!A:ZZ`;
  const valuesResponse = await client.request({
    url: `${root}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
  });
  return { spreadsheetId, sheetGid, sheetTitle: sheet.title, rows: valuesResponse.data?.values || [] };
}

function makeAnswerList(headers, row) {
  return headers.flatMap((header, index) => {
    const value = safeCell(row, index);
    const label = String(header || '').trim();
    return !KNOWN_HEADERS.has(normalizeHeader(header)) && label && value ? [{ label: label.slice(0, 120), value: value.slice(0, 1000) }] : [];
  });
}

async function syncRows(sql, sheet) {
  const { spreadsheetId, sheetGid, sheetTitle, rows } = sheet;
  if (!rows.length || !rows[0]?.some((cell) => String(cell || '').trim())) {
    throw Object.assign(new Error('The selected sheet tab has no header row.'), { status: 400 });
  }
  if (rows.length > 5001) throw Object.assign(new Error('This sheet has more than 5,000 data rows. Split it into smaller tabs before syncing.'), { status: 413 });

  const headers = rows[0].map((cell) => String(cell || '').trim());
  const normalizedHeaders = headers.map(normalizeHeader);
  const find = (...aliases) => normalizedHeaders.findIndex((header) => aliases.includes(header));
  const columns = {
    externalId: find('id', 'leadid', 'studentid', 'recordid'),
    name: find('name', 'fullname', 'student', 'studentname', 'applicantname'),
    email: find('email', 'emailaddress', 'gmail', 'gmailaddress', 'emailid'),
    phone: find('phone', 'phonenumber', 'mobile', 'mobilenumber', 'contactnumber'),
    course: find('course', 'courseofinterest', 'faculty'),
    university: find('university', 'universityname', 'college', 'collegename', 'universitycollege', 'institution'),
    status: find('status'),
    counselor: find('assignedcounselor', 'counselor', 'counselorname'),
    source: find('source'),
    createdAt: find('createdat', 'date', 'submittedat', 'timestamp'),
    notes: find('notes'),
  };
  if (columns.name < 0 || (columns.email < 0 && columns.phone < 0)) {
    throw Object.assign(new Error('Add a Name column and at least one Email or Phone column to the sheet.'), { status: 400 });
  }

  const existingMappings = await sql`SELECT record_key, lead_id FROM crm_sheet_sync_rows WHERE spreadsheet_id = ${spreadsheetId} AND sheet_gid = ${sheetGid}`;
  const mappingByKey = new Map(existingMappings.map((item) => [item.record_key, item.lead_id]));
  const rowCandidates = rows.slice(1).map((row) => ({
    row,
    email: safeCell(row, columns.email),
    phone: safeCell(row, columns.phone),
    externalId: safeCell(row, columns.externalId),
  }));
  const recordKeys = rowCandidates.map(({ email, phone, externalId }) => externalId ? `id:${externalId}` : email ? `email:${email.toLowerCase()}` : phone ? `phone:${phone.replace(/\D/g, '')}` : '').filter(Boolean);
  const emailKeys = [...new Set(rowCandidates.map((item) => item.email.toLowerCase()).filter(Boolean))];
  const phoneKeys = [...new Set(rowCandidates.map((item) => item.phone.replace(/\D/g, '')).filter(Boolean))];
  const mappedIds = [...new Set(recordKeys.map((key) => mappingByKey.get(key)).filter(Boolean))];
  const candidateRows = await sql.query(
    `SELECT id, assigned_counselor_id, email_key, phone_key, data FROM crm_leads
     WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb))
       OR email_key IN (SELECT jsonb_array_elements_text($2::jsonb))
       OR phone_key IN (SELECT jsonb_array_elements_text($3::jsonb))`,
    [JSON.stringify(mappedIds), JSON.stringify(emailKeys), JSON.stringify(phoneKeys)],
  );
  const byId = new Map(candidateRows.map((item) => [item.id, item]));
  const byEmail = new Map(candidateRows.filter((item) => item.email_key).map((item) => [item.email_key, item]));
  const byPhone = new Map(candidateRows.filter((item) => item.phone_key).map((item) => [item.phone_key, item]));
  const counselorRows = await sql`SELECT id, name, username FROM crm_users WHERE role = 'counselor' AND disabled = FALSE AND password_hash IS NOT NULL AND COALESCE((permissions->>'leads')::boolean, false) = TRUE`;
  const counselorByName = new Map();
  counselorRows.forEach((item) => [item.name, item.username].forEach((value) => {
    const key = String(value || '').trim().toLowerCase();
    if (key) counselorByName.set(key, item.id);
  }));

  const answerHeaders = headers;
  const seenKeys = new Set();
  const seenLeadIds = new Set();
  const upserts = new Map();
  const mappingWrites = new Map();
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const name = safeCell(row, columns.name);
    const email = safeCell(row, columns.email);
    const phone = safeCell(row, columns.phone);
    if (!name || (!email && !phone)) { skipped += 1; continue; }
    const externalId = safeCell(row, columns.externalId);
    const recordKey = externalId ? `id:${externalId}` : email ? `email:${email.toLowerCase()}` : `phone:${phone.replace(/\D/g, '')}`;
    if (!recordKey || seenKeys.has(recordKey)) { skipped += 1; continue; }
    seenKeys.add(recordKey);

    const emailKey = email.toLowerCase();
    const phoneKey = phone.replace(/\D/g, '');
    const linkedId = mappingByKey.get(recordKey);
    const existing = (linkedId && byId.get(linkedId)) || byEmail.get(emailKey) || byPhone.get(phoneKey) || null;
    if (existing && seenLeadIds.has(existing.id)) {
      mappingWrites.set(recordKey, existing.id);
      skipped += 1;
      continue;
    }
    const previous = existing?.data || {};
    const course = safeCell(row, columns.course) || previous.course || previous.faculty || '';
    const university = safeCell(row, columns.university) || previous.university || '';
    const sheetStatus = safeCell(row, columns.status);
    const status = !existing && VALID_STATUSES.has(sheetStatus) ? sheetStatus : previous.status;
    const counselorName = safeCell(row, columns.counselor).toLowerCase();
    const counselorId = existing?.assigned_counselor_id || counselorByName.get(counselorName) || '';
    const answers = makeAnswerList(answerHeaders, row);
    const answerLabels = new Set(answers.map((item) => item.label.toLowerCase()));
    const formAnswers = [
      ...(Array.isArray(previous.formAnswers) ? previous.formAnswers.filter((item) => !answerLabels.has(String(item.label || '').toLowerCase())) : []),
      ...answers,
    ];
    const sheetNotes = safeCell(row, columns.notes);
    const source = previous.source || safeCell(row, columns.source) || `Google Sheet: ${sheetTitle}`;
    const createdAt = previous.createdAt || parseDate(safeCell(row, columns.createdAt)) || new Date().toISOString();
    const lead = validLead({
      ...previous,
      id: existing?.id || randomBytes(16).toString('hex'),
      name,
      email: email || previous.email,
      phone: phone || previous.phone,
      course,
      faculty: course,
      university,
      source,
      status,
      notes: existing ? (previous.source?.startsWith('Google Sheet:') && !previous.noteHistory?.length && sheetNotes ? sheetNotes : previous.notes) : sheetNotes,
      formAnswers,
      createdAt,
    }, { assignedCounselorId: counselorId });

    const leadId = lead.id;
    seenLeadIds.add(leadId);
    if (emailKey) byEmail.set(emailKey, { id: leadId, data: lead, assigned_counselor_id: lead.assignedCounselorId, email_key: emailKey, phone_key: phoneKey });
    if (phoneKey) byPhone.set(phoneKey, { id: leadId, data: lead, assigned_counselor_id: lead.assignedCounselorId, email_key: emailKey, phone_key: phoneKey });
    byId.set(leadId, { id: leadId, data: lead, assigned_counselor_id: lead.assignedCounselorId, email_key: emailKey, phone_key: phoneKey });
    upserts.set(leadId, {
      id: leadId,
      assigned_counselor_id: lead.assignedCounselorId,
      email_key: emailKey,
      phone_key: phoneKey,
      data: lead,
      created_at: lead.createdAt,
    });
    mappingWrites.set(recordKey, leadId);
  }

  const writes = [...upserts.values()];
  if (writes.length) {
    await sql.query(
      `INSERT INTO crm_leads (id, assigned_counselor_id, email_key, phone_key, data, created_at)
       SELECT id, assigned_counselor_id, email_key, phone_key, data, created_at
       FROM jsonb_to_recordset($1::jsonb) AS x(id text, assigned_counselor_id text, email_key text, phone_key text, data jsonb, created_at timestamptz)
       ON CONFLICT (id) DO UPDATE SET assigned_counselor_id = EXCLUDED.assigned_counselor_id,
         email_key = EXCLUDED.email_key, phone_key = EXCLUDED.phone_key, data = EXCLUDED.data`,
      [JSON.stringify(writes)],
    );
  }
  const mappingEntries = [...mappingWrites].map(([record_key, lead_id]) => ({ record_key, lead_id }));
  if (mappingEntries.length) {
    await sql.query(
      `INSERT INTO crm_sheet_sync_rows (spreadsheet_id, sheet_gid, record_key, lead_id, updated_at)
       SELECT $2, $3, record_key, lead_id, NOW()
       FROM jsonb_to_recordset($1::jsonb) AS x(record_key text, lead_id text)
       ON CONFLICT (spreadsheet_id, sheet_gid, record_key) DO UPDATE SET lead_id = EXCLUDED.lead_id, updated_at = NOW()`,
      [JSON.stringify(mappingEntries), spreadsheetId, sheetGid],
    );
  }
  return {
    sheetTitle,
    rowsSeen: Math.max(0, rows.length - 1),
    created: [...upserts.values()].filter((item) => !candidateRows.some((candidate) => candidate.id === item.id)).length,
    updated: [...upserts.values()].filter((item) => candidateRows.some((candidate) => candidate.id === item.id)).length,
    skipped,
    syncedAt: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return send(res, 405, { error: 'Method not allowed.' });
  const cronSecret = process.env.CRON_SECRET;
  const isCron = req.method === 'GET' && cronSecret && req.headers.authorization === `Bearer ${cronSecret}`;
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;
  if (!databaseUrl) return send(res, 503, { error: 'Database connection is not configured.' });

  const sql = neon(databaseUrl);
  try {
    if (req.method === 'GET') {
      if (!cronSecret) return send(res, 503, { error: 'Add CRON_SECRET in Vercel to enable scheduled Google Sheets sync.' });
      if (!isCron) return send(res, 401, { error: 'Unauthorized.' });
    } else {
      const token = cookieValue(req, SESSION_COOKIE);
      if (!token) return send(res, 401, { error: 'Sign in as CRM admin to sync the sheet.' });
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const sessions = await sql`SELECT u.id, u.role FROM crm_sessions s JOIN crm_users u ON u.id = s.user_id WHERE s.token_hash = ${tokenHash} AND s.expires_at > NOW() AND u.disabled = FALSE LIMIT 1`;
      if (sessions[0]?.role !== 'admin') return send(res, 403, { error: 'Administrator access is required to sync the Google Sheet.' });
    }

    await sql`CREATE TABLE IF NOT EXISTS crm_sheet_sync_rows (
      spreadsheet_id TEXT NOT NULL, sheet_gid INTEGER NOT NULL, record_key TEXT NOT NULL, lead_id TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (spreadsheet_id, sheet_gid, record_key)
    )`;
    const sheet = await getGoogleSheetRows();
    const result = await syncRows(sql, sheet);
    return send(res, 200, { ok: true, ...result });
  } catch (error) {
    const status = Number(error.status) || Number(error.response?.status) || 500;
    const message = error.response?.data?.error?.message || error.message || 'Google Sheets sync failed.';
    return send(res, status >= 400 && status < 600 ? status : 500, { error: message });
  }
}
