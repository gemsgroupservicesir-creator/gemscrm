import { neon } from '@neondatabase/serverless';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const config = { api: { bodyParser: false } };

function reply(res, status, body, type = 'application/json; charset=utf-8') {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(body);
}

async function readRawBody(req, maxBytes = 1_000_000) {
  const parts = [];
  let size = 0;
  for await (const part of req) {
    const buffer = Buffer.isBuffer(part) ? part : Buffer.from(part);
    size += buffer.length;
    if (size > maxBytes) throw Object.assign(new Error('Request is too large.'), { status: 413 });
    parts.push(buffer);
  }
  return Buffer.concat(parts, size);
}

function equalHex(left, right) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right) || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function messageText(message) {
  if (typeof message?.text?.body === 'string') return message.text.body.slice(0, 4096);
  if (typeof message?.button?.text === 'string') return message.button.text.slice(0, 4096);
  if (typeof message?.interactive?.button_reply?.title === 'string') return message.interactive.button_reply.title.slice(0, 4096);
  if (typeof message?.interactive?.list_reply?.title === 'string') return message.interactive.list_reply.title.slice(0, 4096);
  const type = String(message?.type || 'message').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
  return `[${type} message]`;
}

async function ensureMessageTable(sql) {
  await sql`CREATE TABLE IF NOT EXISTS crm_whatsapp_messages (
    id TEXT PRIMARY KEY, lead_id TEXT REFERENCES crm_leads(id) ON DELETE SET NULL,
    direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
    from_phone TEXT NOT NULL DEFAULT '', to_phone TEXT NOT NULL DEFAULT '',
    message_type TEXT NOT NULL DEFAULT 'text', body TEXT NOT NULL DEFAULT '',
    sent_by TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'received', sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE crm_whatsapp_messages ADD COLUMN IF NOT EXISTS sent_by TEXT NOT NULL DEFAULT ''`;
  await sql`CREATE INDEX IF NOT EXISTS crm_whatsapp_messages_lead_time_idx ON crm_whatsapp_messages (lead_id, sent_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS crm_whatsapp_messages_time_idx ON crm_whatsapp_messages (sent_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS crm_whatsapp_messages_sender_time_idx ON crm_whatsapp_messages (sent_by, created_at DESC)`;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
      const mode = url.searchParams.get('hub.mode') || url.searchParams.get('hub[mode]');
      const token = url.searchParams.get('hub.verify_token') || url.searchParams.get('hub[verify_token]');
      const challenge = url.searchParams.get('hub.challenge') || url.searchParams.get('hub[challenge]');
      if (mode === 'subscribe' && process.env.WHATSAPP_VERIFY_TOKEN && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
        return reply(res, 200, challenge, 'text/plain; charset=utf-8');
      }
      return reply(res, 403, JSON.stringify({ error: 'Webhook verification failed.' }));
    }
    if (req.method !== 'POST') return reply(res, 405, JSON.stringify({ error: 'Method not allowed.' }));
    const secret = process.env.WHATSAPP_APP_SECRET || '';
    if (!secret) return reply(res, 503, JSON.stringify({ error: 'Webhook secret is not configured.' }));
    const rawBody = await readRawBody(req);
    const signature = String(req.headers['x-hub-signature-256'] || '').replace(/^sha256=/i, '');
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    if (!equalHex(signature, expected)) return reply(res, 401, JSON.stringify({ error: 'Webhook signature is invalid.' }));
    let payload;
    try { payload = JSON.parse(rawBody.toString('utf8')); }
    catch { return reply(res, 400, JSON.stringify({ error: 'Invalid JSON payload.' })); }
    if (payload?.object !== 'whatsapp_business_account') return reply(res, 200, JSON.stringify({ ok: true }));

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;
    if (!databaseUrl) return reply(res, 503, JSON.stringify({ error: 'Database connection is not configured.' }));
    const sql = neon(databaseUrl);
    await ensureMessageTable(sql);

    for (const entry of Array.isArray(payload.entry) ? payload.entry : []) {
      for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
        if (change.field !== 'messages') continue;
        const value = change.value || {};
        for (const message of Array.isArray(value.messages) ? value.messages : []) {
          const wamid = String(message.id || '').slice(0, 200);
          const from = String(message.from || '').replace(/\D/g, '').slice(0, 20);
          if (!wamid || !from) continue;
          const leads = await sql`SELECT id FROM crm_leads WHERE phone_key = ${from} ORDER BY created_at DESC LIMIT 1`;
          if (!leads[0]) continue;
          const seconds = Number(message.timestamp);
          const sentAt = Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
          const to = String(value.metadata?.phone_number_id || '').slice(0, 100);
          await sql`INSERT INTO crm_whatsapp_messages (id, lead_id, direction, from_phone, to_phone, message_type, body, status, sent_at)
            VALUES (${wamid}, ${leads[0].id}, 'inbound', ${from}, ${to}, ${String(message.type || 'text').slice(0, 40)}, ${messageText(message)}, 'received', ${sentAt})
            ON CONFLICT (id) DO NOTHING`;
        }
        for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
          const wamid = String(status.id || '').slice(0, 200);
          const deliveryStatus = ['sent', 'delivered', 'read', 'failed', 'deleted'].includes(status.status) ? status.status : '';
          if (wamid && deliveryStatus) await sql`UPDATE crm_whatsapp_messages SET status = ${deliveryStatus} WHERE id = ${wamid}`;
        }
      }
    }
    return reply(res, 200, JSON.stringify({ ok: true }));
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error('WhatsApp webhook failed.', error?.message || 'unknown error');
    return reply(res, status, JSON.stringify({ error: status >= 500 ? 'Webhook processing failed.' : error.message }));
  }
}
