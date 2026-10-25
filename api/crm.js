import { neon } from '@neondatabase/serverless';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = 'gems_crm_session';
const SESSION_HOURS = 12;
let schemaPromise;

function json(res, status, value, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  Object.entries(headers).forEach(([key, val]) => res.setHeader(key, val));
  res.end(JSON.stringify(value));
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

async function ensureSchema(sql) {
  if (!schemaPromise) schemaPromise = (async () => {
    await sql`CREATE TABLE IF NOT EXISTS crm_users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','counselor')),
      name TEXT NOT NULL, permissions JSONB NOT NULL DEFAULT '{}'::jsonb, password_salt TEXT,
      password_hash TEXT, disabled BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS crm_users_username_lower_idx ON crm_users (LOWER(username)) WHERE disabled = FALSE`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS crm_single_admin_idx ON crm_users (role) WHERE role = 'admin' AND disabled = FALSE`;
    await sql`CREATE TABLE IF NOT EXISTS crm_sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES crm_users(id), attendance_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL
    )`;
    await sql`CREATE INDEX IF NOT EXISTS crm_sessions_expiry_idx ON crm_sessions (expires_at)`;
    await sql`CREATE TABLE IF NOT EXISTS crm_attendance (
      id TEXT PRIMARY KEY, counselor_id TEXT NOT NULL, logged_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), logged_out_at TIMESTAMPTZ
    )`;
    await sql`CREATE INDEX IF NOT EXISTS crm_attendance_counselor_time_idx ON crm_attendance (counselor_id, logged_in_at)`;
    await sql`CREATE TABLE IF NOT EXISTS crm_leads (
      id TEXT PRIMARY KEY, assigned_counselor_id TEXT NOT NULL DEFAULT '', email_key TEXT NOT NULL DEFAULT '', phone_key TEXT NOT NULL DEFAULT '',
      data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS crm_leads_assignee_created_idx ON crm_leads (assigned_counselor_id, created_at DESC)`;
    await sql`CREATE TABLE IF NOT EXISTS crm_landing_pages (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, assigned_counselor_id TEXT NOT NULL DEFAULT '',
      published BOOLEAN NOT NULL DEFAULT FALSE, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS crm_landing_pages_assignee_idx ON crm_landing_pages (assigned_counselor_id)`;
    await sql`CREATE TABLE IF NOT EXISTS crm_site_content (
      id TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('copy','collection')), value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (kind, id)
    )`;
    await sql`CREATE TABLE IF NOT EXISTS crm_login_attempts (
      id BIGSERIAL PRIMARY KEY, username_key TEXT NOT NULL, ip_key TEXT NOT NULL, succeeded BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS crm_login_attempts_recent_idx ON crm_login_attempts (username_key, ip_key, created_at DESC)`;
    await sql`CREATE TABLE IF NOT EXISTS crm_form_limits (
      ip_key TEXT PRIMARY KEY, window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), count INTEGER NOT NULL DEFAULT 0
    )`;
  })().catch((error) => { schemaPromise = undefined; throw error; });
  return schemaPromise;
}

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;
  if (!url) fail(503, 'Database connection is not configured.');
  const sql = neon(url);
  return ensureSchema(sql).then(() => sql);
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { fail(400, 'Invalid request body.'); }
  }
  return {};
}

function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const item of cookies) {
    const [key, ...rest] = item.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}${secure ? '; Secure' : ''}`);
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`);
}

function hash(value) { return createHash('sha256').update(value).digest('hex'); }

function issuePassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) fail(400, 'Passwords must be 12 to 128 characters long.');
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}

function passwordMatches(password, salt, expected) {
  if (!salt || !expected || typeof password !== 'string' || password.length > 128) return false;
  const submitted = scryptSync(password, salt, 64);
  const saved = Buffer.from(expected, 'hex');
  return saved.length === submitted.length && timingSafeEqual(saved, submitted);
}

function safeUser(row) {
  return { id: row.id, role: row.role, name: row.name, username: row.username, permissions: row.permissions || {} };
}

async function getSession(sql, req) {
  const token = cookieValue(req, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = hash(token);
  const rows = await sql`SELECT s.token_hash, s.attendance_id, s.expires_at, u.id, u.username, u.role, u.name, u.permissions
    FROM crm_sessions s JOIN crm_users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash} AND s.expires_at > NOW() AND u.disabled = FALSE LIMIT 1`;
  if (!rows[0]) {
    const expired = await sql`DELETE FROM crm_sessions WHERE token_hash = ${tokenHash} RETURNING attendance_id`;
    if (expired[0]?.attendance_id) await sql`UPDATE crm_attendance SET logged_out_at = COALESCE(logged_out_at, NOW()) WHERE id = ${expired[0].attendance_id}`;
    return null;
  }
  return { user: safeUser(rows[0]), attendanceId: rows[0].attendance_id || '' };
}

function requireSection(session, section) {
  if (!session) fail(401, 'Sign in to continue.');
  if (session.user.role === 'admin') return;
  if (session.user.permissions?.[section] !== true) fail(403, 'Your account does not have access to this section.');
}

async function createSession(sql, res, user) {
  const token = randomBytes(32).toString('base64url');
  const attendanceId = user.role === 'counselor' ? randomBytes(16).toString('hex') : '';
  if (attendanceId) {
    await sql`UPDATE crm_attendance SET logged_out_at = COALESCE(logged_out_at, NOW()) WHERE counselor_id = ${user.id} AND logged_out_at IS NULL`;
    await sql`DELETE FROM crm_sessions WHERE user_id = ${user.id}`;
  }
  await sql`INSERT INTO crm_sessions (token_hash, user_id, attendance_id, expires_at)
    VALUES (${hash(token)}, ${user.id}, ${attendanceId || null}, NOW() + (${SESSION_HOURS} * INTERVAL '1 hour'))`;
  if (attendanceId) await sql`INSERT INTO crm_attendance (id, counselor_id) VALUES (${attendanceId}, ${user.id})`;
  setSessionCookie(res, token);
  return attendanceId;
}

function validLead(input, defaults = {}) {
  const value = input && typeof input === 'object' ? input : {};
  const name = String(value.name || '').trim().slice(0, 120);
  const email = String(value.email || '').trim().slice(0, 254);
  const phone = String(value.phone || '').trim().slice(0, 50);
  if (!name || (!email && !phone)) fail(400, 'Enter the student name and an email address or phone number.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
  if (typeof value.image === 'string' && value.image.length >= 750_000) fail(413, 'The uploaded student image is too large after processing. Try a smaller image.');
  const image = typeof value.image === 'string' ? value.image : '';
  return {
    id: String(value.id || randomBytes(16).toString('hex')),
    name, email, phone,
    faculty: String(value.faculty || value.course || '').slice(0, 160),
    course: String(value.course || value.faculty || '').slice(0, 160),
    image,
    source: String(value.source || defaults.source || 'Website enquiry').slice(0, 200),
    notes: String(value.notes || '').slice(0, 6000),
    noteHistory: Array.isArray(value.noteHistory) ? value.noteHistory.slice(-100) : [],
    formAnswers: Array.isArray(value.formAnswers) ? value.formAnswers.slice(0, 50) : [],
    assignedCounselorId: String(defaults.assignedCounselorId ?? value.assignedCounselorId ?? ''),
    status: ['New', 'Contacted', 'Follow-up', 'Application', 'Enrolled', 'Closed'].includes(value.status) ? value.status : 'New',
    createdAt: value.createdAt || new Date().toISOString(),
  };
}

async function putLead(sql, lead) {
  const emailKey = lead.email.trim().toLowerCase();
  const phoneKey = lead.phone.replace(/\D/g, '');
  await sql`INSERT INTO crm_leads (id, assigned_counselor_id, email_key, phone_key, data, created_at)
    VALUES (${lead.id}, ${lead.assignedCounselorId}, ${emailKey}, ${phoneKey}, ${JSON.stringify(lead)}::jsonb, ${lead.createdAt})
    ON CONFLICT (id) DO UPDATE SET assigned_counselor_id = EXCLUDED.assigned_counselor_id,
      email_key = EXCLUDED.email_key, phone_key = EXCLUDED.phone_key, data = EXCLUDED.data`;
}

function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

async function checkFormLimit(sql, req) {
  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const ipHash = hash(ip).slice(0, 40);
  const result = await sql`INSERT INTO crm_form_limits (ip_key, count, window_started_at)
    VALUES (${ipHash}, 1, NOW()) ON CONFLICT (ip_key) DO UPDATE SET
      count = CASE WHEN crm_form_limits.window_started_at < NOW() - INTERVAL '10 minutes' THEN 1 ELSE crm_form_limits.count + 1 END,
      window_started_at = CASE WHEN crm_form_limits.window_started_at < NOW() - INTERVAL '10 minutes' THEN NOW() ELSE crm_form_limits.window_started_at END
    RETURNING count`;
  if (Number(result[0]?.count || 0) > 12) fail(429, 'Please wait before sending another enquiry.');
}

export default async function handler(req, res) {
  let sql;
  try {
    const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
    const action = url.searchParams.get('action') || '';
    if (req.method === 'POST' && !isSameOrigin(req)) return json(res, 403, { error: 'Request origin could not be verified.' });
    sql = await db();

    if (req.method === 'GET' && action === 'auth-status') {
      const rows = await sql`SELECT EXISTS (SELECT 1 FROM crm_users WHERE role = 'admin' AND disabled = FALSE) AS admin_exists`;
      return json(res, 200, { adminExists: Boolean(rows[0]?.admin_exists), setupEnabled: Boolean(process.env.CRM_BOOTSTRAP_TOKEN) });
    }

    if (req.method === 'GET' && action === 'public-content') {
      const rows = await sql`SELECT id, kind, value FROM crm_site_content`;
      return json(res, 200, { items: rows.map((row) => ({ id: row.id, kind: row.kind, value: row.value })) });
    }

    if (req.method === 'GET' && action === 'public-landing-page') {
      const slug = String(url.searchParams.get('slug') || '').slice(0, 120);
      const preview = url.searchParams.get('preview') === '1';
      if (preview) {
        const previewSession = await getSession(sql, req);
        if (!previewSession || (previewSession.user.role !== 'admin' && previewSession.user.permissions?.landingPages !== true)) fail(403, 'Sign in with landing page access to preview this draft.');
      }
      const rows = preview
        ? await sql`SELECT data FROM crm_landing_pages WHERE slug = ${slug} LIMIT 1`
        : await sql`SELECT data FROM crm_landing_pages WHERE slug = ${slug} AND published = TRUE LIMIT 1`;
      const page = rows[0]?.data || null;
      return json(res, 200, { page: page ? { ...page, assignedCounselorId: '' } : null });
    }

    if (req.method === 'POST' && action === 'lead-submit') {
      const body = parseBody(req);
      if (String(body.website || '').trim()) return json(res, 200, { ok: true });
      await checkFormLimit(sql, req);
      let assignedCounselorId = '';
      let source = String(body.source || 'Website enquiry');
      if (body.slug) {
        const slug = String(body.slug).slice(0, 120);
        const pages = await sql`SELECT assigned_counselor_id, data FROM crm_landing_pages WHERE slug = ${slug} AND published = TRUE LIMIT 1`;
        if (!pages[0]) fail(404, 'This campaign is not available.');
        assignedCounselorId = pages[0].assigned_counselor_id || '';
        source = `Landing page: /landing/${slug}/`;
        if (assignedCounselorId) {
          const valid = await sql`SELECT id FROM crm_users WHERE id = ${assignedCounselorId} AND role = 'counselor' AND disabled = FALSE AND COALESCE((permissions->>'leads')::boolean, false) = TRUE AND password_hash IS NOT NULL LIMIT 1`;
          if (!valid[0]) assignedCounselorId = '';
        }
      }
      const lead = validLead(body, { assignedCounselorId, source });
      lead.assignedCounselorId = assignedCounselorId;
      await putLead(sql, lead);
      return json(res, 201, { ok: true });
    }

    if (req.method === 'POST' && action === 'login') {
      const body = parseBody(req);
      const username = String(body.username || '').trim().toLowerCase().slice(0, 120);
      const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
      const ipKey = hash(ip).slice(0, 40);
      const usernameKey = hash(username);
      const recent = await sql`SELECT COUNT(*)::int AS count FROM crm_login_attempts WHERE username_key = ${usernameKey} AND ip_key = ${ipKey} AND created_at > NOW() - INTERVAL '15 minutes'`;
      if (Number(recent[0]?.count || 0) >= 10) fail(429, 'Too many sign-in attempts. Please try again later.');
      const rows = await sql`SELECT id, username, role, name, permissions, password_salt, password_hash
        FROM crm_users WHERE LOWER(username) = ${username} AND disabled = FALSE LIMIT 1`;
      const userRow = rows[0];
      const valid = userRow && passwordMatches(String(body.password || ''), userRow.password_salt, userRow.password_hash);
      await sql`INSERT INTO crm_login_attempts (username_key, ip_key, succeeded) VALUES (${usernameKey}, ${ipKey}, ${Boolean(valid)})`;
      if (!valid) fail(401, 'The sign-in ID or password is incorrect.');
      const user = safeUser(userRow);
      const attendanceId = await createSession(sql, res, user);
      return json(res, 200, { user, attendanceId });
    }

    if (req.method === 'POST' && action === 'bootstrap') {
      const body = parseBody(req);
      const supplied = String(body.token || '');
      const expected = String(process.env.CRM_BOOTSTRAP_TOKEN || '');
      const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
      const ipKey = hash(ip).slice(0, 40), usernameKey = hash('first-admin-bootstrap');
      const attempts = await sql`SELECT COUNT(*)::int AS count FROM crm_login_attempts WHERE username_key = ${usernameKey} AND ip_key = ${ipKey} AND created_at > NOW() - INTERVAL '15 minutes'`;
      if (Number(attempts[0]?.count || 0) >= 10) fail(429, 'Too many setup attempts. Please try again later.');
      const suppliedBytes = Buffer.from(supplied), expectedBytes = Buffer.from(expected);
      const tokenOK = suppliedBytes.length > 0 && suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
      await sql`INSERT INTO crm_login_attempts (username_key, ip_key, succeeded) VALUES (${usernameKey}, ${ipKey}, ${Boolean(tokenOK)})`;
      if (!tokenOK) fail(403, 'The administrator setup token is invalid or not configured.');
      const admins = await sql`SELECT id FROM crm_users WHERE role = 'admin' AND disabled = FALSE LIMIT 1`;
      if (admins.length) fail(409, 'An administrator has already been set up. Sign in instead.');
      const username = String(body.username || '').trim().toLowerCase().slice(0, 120);
      if (username.length < 3) fail(400, 'The sign-in ID must be at least 3 characters.');
      const credentials = issuePassword(body.password);
      const user = { id: randomBytes(16).toString('hex'), username, role: 'admin', name: 'Administrator', permissions: {} };
      try {
        await sql`INSERT INTO crm_users (id, username, role, name, permissions, password_salt, password_hash)
          VALUES (${user.id}, ${username}, 'admin', ${user.name}, '{}'::jsonb, ${credentials.salt}, ${credentials.hash})`;
      } catch (error) {
        if (error.code === '23505') fail(409, 'That sign-in ID is already in use.');
        throw error;
      }
      const attendanceId = await createSession(sql, res, user);
      return json(res, 201, { user, attendanceId });
    }

    if (req.method === 'POST' && action === 'logout') {
      const token = cookieValue(req, SESSION_COOKIE);
      if (token) {
        const found = await sql`SELECT attendance_id FROM crm_sessions WHERE token_hash = ${hash(token)} LIMIT 1`;
        if (found[0]?.attendance_id) await sql`UPDATE crm_attendance SET logged_out_at = COALESCE(logged_out_at, NOW()) WHERE id = ${found[0].attendance_id}`;
        await sql`DELETE FROM crm_sessions WHERE token_hash = ${hash(token)}`;
      }
      clearSessionCookie(res);
      return json(res, 200, { ok: true });
    }

    const session = await getSession(sql, req);
    if (req.method === 'GET' && action === 'session') return json(res, 200, { session: session ? { ...session.user, attendanceId: session.attendanceId } : null });
    if (!session) fail(401, 'Sign in to continue.');

    if (req.method === 'GET' && action === 'data') {
      const { user } = session;
      const isAdmin = user.role === 'admin';
      const leads = isAdmin
        ? await sql`SELECT data FROM crm_leads ORDER BY created_at DESC`
        : user.permissions?.leads ? await sql`SELECT data FROM crm_leads WHERE assigned_counselor_id = ${user.id} ORDER BY created_at DESC` : [];
      const counselorRows = isAdmin
        ? await sql`SELECT id, username, role, name, permissions, password_hash FROM crm_users WHERE role = 'counselor' AND disabled = FALSE ORDER BY created_at`
        : user.role === 'counselor' ? await sql`SELECT id, username, role, name, permissions, password_hash FROM crm_users WHERE id = ${user.id}` : [];
      const attendanceRows = isAdmin
        ? await sql`SELECT id, counselor_id, logged_in_at, logged_out_at FROM crm_attendance ORDER BY logged_in_at DESC`
        : await sql`SELECT id, counselor_id, logged_in_at, logged_out_at FROM crm_attendance WHERE counselor_id = ${user.id} ORDER BY logged_in_at DESC`;
      const pageRows = isAdmin
        ? await sql`SELECT data FROM crm_landing_pages ORDER BY updated_at DESC`
        : user.permissions?.landingPages ? await sql`SELECT data FROM crm_landing_pages WHERE assigned_counselor_id = ${user.id} ORDER BY updated_at DESC` : [];
      const siteRows = user.role === 'admin' || user.permissions?.website
        ? await sql`SELECT id, kind, value FROM crm_site_content`
        : [];
      return json(res, 200, {
        leads: leads.map((row) => row.data),
        counselors: counselorRows.map((row) => ({ id: row.id, username: row.username || '', name: row.name, permissions: row.permissions || {}, credential: row.password_hash ? { enabled: true } : null })),
        attendance: attendanceRows.map((row) => ({ id: row.id, counselorId: row.counselor_id, loggedInAt: row.logged_in_at, loggedOutAt: row.logged_out_at || '' })),
        landingPages: pageRows.map((row) => row.data),
        siteContent: siteRows.map((row) => ({ id: row.id, kind: row.kind, value: row.value })),
      });
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      if (action === 'lead-create') {
        requireSection(session, 'leads');
        if (session.user.role !== 'admin') fail(403, 'Only administrators can add leads manually.');
        const lead = validLead(body);
        if (lead.assignedCounselorId) {
          const assigned = await sql`SELECT id FROM crm_users WHERE id = ${lead.assignedCounselorId} AND role = 'counselor' AND disabled = FALSE AND COALESCE((permissions->>'leads')::boolean, false) = TRUE LIMIT 1`;
          if (!assigned[0]) fail(400, 'Choose an active counselor with lead access.');
        }
        await putLead(sql, lead);
        return json(res, 201, { lead });
      }
      if (action === 'lead-update') {
        requireSection(session, 'leads');
        const id = String(body.id || '');
        const rows = await sql`SELECT data, assigned_counselor_id FROM crm_leads WHERE id = ${id} LIMIT 1`;
        if (!rows[0]) fail(404, 'Lead not found.');
        if (session.user.role !== 'admin' && rows[0].assigned_counselor_id !== session.user.id) fail(404, 'Lead not found.');
        const current = rows[0].data;
        const changes = body.changes && typeof body.changes === 'object' ? body.changes : {};
        if (session.user.role !== 'admin' && Object.hasOwn(changes, 'assignedCounselorId')) fail(403, 'Only administrators can reassign leads.');
        const updated = validLead({ ...current, ...changes, id }, {
          assignedCounselorId: session.user.role === 'admin' ? changes.assignedCounselorId ?? current.assignedCounselorId : session.user.id,
        });
        if (session.user.role === 'admin' && updated.assignedCounselorId) {
          const assigned = await sql`SELECT id FROM crm_users WHERE id = ${updated.assignedCounselorId} AND role = 'counselor' AND disabled = FALSE AND COALESCE((permissions->>'leads')::boolean, false) = TRUE LIMIT 1`;
          if (!assigned[0]) fail(400, 'Choose an active counselor with lead access.');
        }
        await putLead(sql, updated);
        return json(res, 200, { lead: updated });
      }
      if (action === 'lead-import') {
        requireSection(session, 'leads');
        const rows = Array.isArray(body.leads) ? body.leads.slice(0, 500) : [];
        if (!rows.length) fail(400, 'The CSV does not contain any valid leads.');
        const stored = session.user.role === 'admin' ? await sql`SELECT email_key, phone_key FROM crm_leads` : await sql`SELECT email_key, phone_key FROM crm_leads WHERE assigned_counselor_id = ${session.user.id}`;
        const emails = new Set(stored.map((row) => row.email_key).filter(Boolean));
        const phones = new Set(stored.map((row) => row.phone_key).filter(Boolean));
        let imported = 0, skipped = 0;
        for (const row of rows) {
          try {
            const lead = validLead(row, { assignedCounselorId: session.user.role === 'admin' ? row.assignedCounselorId : session.user.id });
            const email = lead.email.toLowerCase(), phone = lead.phone.replace(/\D/g, '');
            if ((email && emails.has(email)) || (phone && phones.has(phone))) { skipped += 1; continue; }
            if (email) emails.add(email); if (phone) phones.add(phone);
            if (session.user.role === 'admin' && lead.assignedCounselorId) {
              const assigned = await sql`SELECT id FROM crm_users WHERE id = ${lead.assignedCounselorId} AND role = 'counselor' AND disabled = FALSE AND COALESCE((permissions->>'leads')::boolean, false) = TRUE LIMIT 1`;
              if (!assigned[0]) lead.assignedCounselorId = '';
            }
            await putLead(sql, lead);
            imported += 1;
          } catch { skipped += 1; }
        }
        return json(res, 200, { imported, skipped });
      }
      if (action === 'attendance-end') {
        const id = String(body.id || '');
        if (session.user.role !== 'admin' && session.attendanceId !== id) fail(403, 'You cannot end another counselor’s attendance session.');
        await sql`UPDATE crm_attendance SET logged_out_at = COALESCE(logged_out_at, NOW()) WHERE id = ${id}`;
        return json(res, 200, { ok: true });
      }
      if (action === 'counselors-save') {
        if (session.user.role !== 'admin') fail(403, 'Administrator access is required.');
        const counselors = Array.isArray(body.counselors) ? body.counselors.slice(0, 200) : [];
        for (const item of counselors) {
          const id = String(item.id || randomBytes(16).toString('hex'));
          const name = String(item.name || 'Counselor').trim().slice(0, 60) || 'Counselor';
          const permissions = { leads: item.permissions?.leads === true, website: item.permissions?.website === true, landingPages: item.permissions?.landingPages === true };
          await sql`INSERT INTO crm_users (id, username, role, name, permissions) VALUES (${id}, ${`pending-${id}`}, 'counselor', ${name}, ${JSON.stringify(permissions)}::jsonb)
            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, permissions = EXCLUDED.permissions`;
          if (!permissions.leads) {
            await sql`UPDATE crm_leads SET assigned_counselor_id = '', data = jsonb_set(data, '{assignedCounselorId}', '""'::jsonb, true) WHERE assigned_counselor_id = ${id}`;
            await sql`UPDATE crm_landing_pages SET assigned_counselor_id = '', data = jsonb_set(data, '{assignedCounselorId}', '""'::jsonb, true) WHERE assigned_counselor_id = ${id}`;
          }
        }
        return json(res, 200, { ok: true });
      }
      if (action === 'counselor-credentials') {
        if (session.user.role !== 'admin') fail(403, 'Administrator access is required.');
        const id = String(body.id || ''), username = String(body.username || '').trim().toLowerCase().slice(0, 120);
        if (username.length < 3) fail(400, 'Enter a sign-in ID with at least 3 characters.');
        const credentials = issuePassword(body.password);
        try {
          const updated = await sql`UPDATE crm_users SET username = ${username}, password_salt = ${credentials.salt}, password_hash = ${credentials.hash}
            WHERE id = ${id} AND role = 'counselor' AND disabled = FALSE RETURNING id`;
          if (!updated[0]) fail(404, 'Counselor not found. Save the counselor first.');
        } catch (error) {
          if (error.code === '23505') fail(409, 'That sign-in ID is already in use.');
          throw error;
        }
        return json(res, 200, { ok: true, username, credential: { enabled: true } });
      }
      if (action === 'counselor-delete-credentials' || action === 'counselor-delete') {
        if (session.user.role !== 'admin') fail(403, 'Administrator access is required.');
        const id = String(body.id || '');
        if (action === 'counselor-delete') {
          await sql`UPDATE crm_users SET disabled = TRUE, password_hash = NULL, password_salt = NULL WHERE id = ${id} AND role = 'counselor'`;
          await sql`UPDATE crm_leads SET assigned_counselor_id = '', data = jsonb_set(data, '{assignedCounselorId}', '""'::jsonb, true) WHERE assigned_counselor_id = ${id}`;
          await sql`UPDATE crm_landing_pages SET assigned_counselor_id = '', data = jsonb_set(data, '{assignedCounselorId}', '""'::jsonb, true) WHERE assigned_counselor_id = ${id}`;
        } else {
          await sql`UPDATE crm_users SET username = ${`pending-${id}`}, password_hash = NULL, password_salt = NULL WHERE id = ${id} AND role = 'counselor'`;
          await sql`UPDATE crm_leads SET assigned_counselor_id = '', data = jsonb_set(data, '{assignedCounselorId}', '""'::jsonb, true) WHERE assigned_counselor_id = ${id}`;
          await sql`UPDATE crm_landing_pages SET assigned_counselor_id = '', data = jsonb_set(data, '{assignedCounselorId}', '""'::jsonb, true) WHERE assigned_counselor_id = ${id}`;
        }
        await sql`UPDATE crm_attendance SET logged_out_at = COALESCE(logged_out_at, NOW()) WHERE counselor_id = ${id}`;
        await sql`DELETE FROM crm_sessions WHERE user_id = ${id}`;
        return json(res, 200, { ok: true });
      }
      if (action === 'landing-page-save' || action === 'landing-page-delete') {
        requireSection(session, 'landingPages');
        const page = body.page || {};
        const id = String(body.id || page.id || '');
        if (action === 'landing-page-delete') {
          const existing = await sql`SELECT assigned_counselor_id FROM crm_landing_pages WHERE id = ${id}`;
          if (session.user.role !== 'admin' && existing[0]?.assigned_counselor_id !== session.user.id) fail(403, 'You cannot delete this page.');
          await sql`DELETE FROM crm_landing_pages WHERE id = ${id}`;
          return json(res, 200, { ok: true });
        }
        const slug = String(page.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 120);
        if (!id || !slug) fail(400, 'A page ID and valid page link are required.');
        const assigned = session.user.role === 'admin' ? String(page.assignedCounselorId || '') : session.user.id;
        if (session.user.role !== 'admin') {
          const current = await sql`SELECT assigned_counselor_id FROM crm_landing_pages WHERE id = ${id} LIMIT 1`;
          if (current[0] && current[0].assigned_counselor_id !== session.user.id) fail(403, 'You can edit only campaign pages assigned to your account.');
          if (!session.user.permissions?.leads) fail(403, 'Your account needs lead access to route campaign enquiries.');
        }
        if (session.user.role === 'admin' && assigned) {
          const valid = await sql`SELECT id FROM crm_users WHERE id = ${assigned} AND role = 'counselor' AND disabled = FALSE AND COALESCE((permissions->>'leads')::boolean, false) = TRUE AND password_hash IS NOT NULL LIMIT 1`;
          if (!valid[0]) fail(400, 'Choose an active counselor with lead access.');
        }
        const savedPage = { ...page, id, slug, assignedCounselorId: assigned, published: Boolean(page.published), updatedAt: new Date().toISOString() };
        try {
          await sql`INSERT INTO crm_landing_pages (id, slug, assigned_counselor_id, published, data) VALUES (${id}, ${slug}, ${assigned}, ${savedPage.published}, ${JSON.stringify(savedPage)}::jsonb)
            ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, assigned_counselor_id = EXCLUDED.assigned_counselor_id, published = EXCLUDED.published, data = EXCLUDED.data, updated_at = NOW()`;
        } catch (error) {
          if (error.code === '23505') fail(409, 'That page link is already in use. Choose another link.');
          throw error;
        }
        return json(res, 200, { page: savedPage });
      }
      if (action === 'site-content-save-many' || action === 'site-content-remove-many') {
        requireSection(session, 'website');
        const items = Array.isArray(body.items) ? body.items.slice(0, 200) : [];
        for (const item of items) {
          const kind = item.kind === 'collection' ? 'collection' : 'copy';
          const id = String(item.id || '').slice(0, 200);
          if (!id) continue;
          if (action === 'site-content-remove-many') await sql`DELETE FROM crm_site_content WHERE id = ${id} AND kind = ${kind}`;
          else await sql`INSERT INTO crm_site_content (id, kind, value) VALUES (${id}, ${kind}, ${JSON.stringify(item.value ?? null)}::jsonb)
            ON CONFLICT (kind, id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;
        }
        return json(res, 200, { ok: true });
      }
      if (action === 'site-content-save' || action === 'site-content-remove') {
        requireSection(session, 'website');
        const kind = body.kind === 'collection' ? 'collection' : 'copy';
        const id = String(body.id || '').slice(0, 200);
        if (!id) fail(400, 'A content key is required.');
        if (action === 'site-content-remove') await sql`DELETE FROM crm_site_content WHERE id = ${id} AND kind = ${kind}`;
        else await sql`INSERT INTO crm_site_content (id, kind, value) VALUES (${id}, ${kind}, ${JSON.stringify(body.value ?? null)}::jsonb)
          ON CONFLICT (kind, id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;
        return json(res, 200, { ok: true });
      }
    }
    return json(res, 404, { error: 'Not found.' });
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error('CRM API request failed.', error?.message || 'unknown error');
    return json(res, status, { error: status >= 500 ? 'The CRM service is temporarily unavailable.' : error.message });
  }
}
