import { neon } from '@neondatabase/serverless';
import { timingSafeEqual } from 'node:crypto';
import { ensureWhatsappNurtureSchema } from '../lib/whatsappNurture.js';

const MAX_MESSAGES_PER_RUN = 20;
const ACTIVE_STATUSES = new Set(['New', 'Contacted', 'Follow-up', 'Application']);

function respond(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(value));
}

function matchesSecret(req, secret) {
  const provided = String(req.headers.authorization || '');
  const expected = `Bearer ${secret}`;
  const left = Buffer.from(provided), right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function cancelJob(sql, id, reason) {
  await sql`UPDATE crm_whatsapp_nurture_jobs SET status = 'cancelled', error_code = ${reason}, updated_at = NOW() WHERE id = ${id}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return respond(res, 405, { error: 'Method not allowed.' });
  const cronSecret = process.env.CRON_SECRET || '';
  if (!cronSecret) return respond(res, 503, { error: 'Scheduled messaging is not configured.' });
  if (!matchesSecret(req, cronSecret)) return respond(res, 401, { error: 'Unauthorized.' });
  const token = process.env.WHATSAPP_ACCESS_TOKEN || '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const version = process.env.WHATSAPP_GRAPH_API_VERSION || 'v27.0';
  if (!token || !phoneNumberId || !process.env.WHATSAPP_APP_SECRET || !process.env.WHATSAPP_VERIFY_TOKEN) return respond(res, 503, { error: 'WhatsApp Cloud API credentials are not configured.' });
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;
  if (!databaseUrl) return respond(res, 503, { error: 'Database connection is not configured.' });

  try {
    const sql = neon(databaseUrl);
    await ensureWhatsappNurtureSchema(sql);
    await sql`CREATE TABLE IF NOT EXISTS crm_whatsapp_messages (
      id TEXT PRIMARY KEY, lead_id TEXT REFERENCES crm_leads(id) ON DELETE SET NULL,
      direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
      from_phone TEXT NOT NULL DEFAULT '', to_phone TEXT NOT NULL DEFAULT '',
      message_type TEXT NOT NULL DEFAULT 'text', body TEXT NOT NULL DEFAULT '', sent_by TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'received', sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`ALTER TABLE crm_whatsapp_messages ADD COLUMN IF NOT EXISTS sent_by TEXT NOT NULL DEFAULT ''`;
    const configRows = await sql`SELECT value FROM crm_growth_features WHERE id = 'whatsapp-nurture' LIMIT 1`;
    const nurture = configRows[0]?.value || {};
    if (nurture.enabled !== true) {
      await sql`UPDATE crm_whatsapp_nurture_jobs SET status = 'cancelled', updated_at = NOW() WHERE status = 'queued'`;
      return respond(res, 200, { ok: true, sent: 0, note: 'Nurture is paused.' });
    }

    await sql`UPDATE crm_whatsapp_nurture_jobs SET status = 'failed', error_code = 'delivery_uncertain', updated_at = NOW()
      WHERE status = 'sending' AND updated_at < NOW() - INTERVAL '15 minutes'`;

    let sent = 0, cancelled = 0, failed = 0;
    for (let index = 0; index < MAX_MESSAGES_PER_RUN; index += 1) {
      const jobs = await sql`UPDATE crm_whatsapp_nurture_jobs SET status = 'sending', attempts = attempts + 1, updated_at = NOW()
        WHERE id = (SELECT id FROM crm_whatsapp_nurture_jobs WHERE status = 'queued' AND due_at <= NOW() ORDER BY due_at ASC FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING id, lead_id, data`;
      const job = jobs[0];
      if (!job) break;
      const leads = await sql`SELECT id, phone_key, data FROM crm_leads WHERE id = ${job.lead_id} LIMIT 1`;
      const lead = leads[0]?.data;
      if (!leads[0] || lead?.whatsappOptIn !== true || !ACTIVE_STATUSES.has(lead.status || 'New')) {
        await cancelJob(sql, job.id, 'lead_ineligible'); cancelled += 1; continue;
      }
      const phone = String(leads[0].phone_key || '').replace(/\D/g, '');
      if (phone.length < 8 || phone.length > 16) {
        await cancelJob(sql, job.id, 'invalid_phone'); cancelled += 1; continue;
      }
      const optedInAt = new Date(lead.whatsappOptInAt || lead.createdAt || 0);
      const lastInbound = await sql`SELECT sent_at FROM crm_whatsapp_messages WHERE lead_id = ${job.lead_id} AND direction = 'inbound' ORDER BY sent_at DESC LIMIT 1`;
      if (lastInbound[0] && new Date(lastInbound[0].sent_at) >= optedInAt) {
        await cancelJob(sql, job.id, 'student_replied'); cancelled += 1; continue;
      }
      const counselorReplies = await sql`SELECT id FROM crm_whatsapp_messages WHERE lead_id = ${job.lead_id} AND direction = 'outbound' AND sent_by <> '' AND sent_at >= ${optedInAt.toISOString()} LIMIT 1`;
      if (counselorReplies.length) {
        await cancelJob(sql, job.id, 'counselor_replied'); cancelled += 1; continue;
      }
      const settings = job.data || {};
      const parameters = Array.isArray(settings.parameters) ? settings.parameters.map((key) => ({ type: 'text', text: String(lead[key] || '').slice(0, 1024) })) : [];
      const template = { name: String(settings.templateName || ''), language: { code: String(settings.language || 'en_US') } };
      if (parameters.length) template.components = [{ type: 'body', parameters }];

      let response, result = {};
      try {
        response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: phone, type: 'template', template }),
          signal: AbortSignal.timeout(10_000),
        });
        result = await response.json().catch(() => ({}));
      } catch {
        await sql`UPDATE crm_whatsapp_nurture_jobs SET status = 'failed', error_code = 'network_error', updated_at = NOW() WHERE id = ${job.id}`;
        failed += 1; continue;
      }
      if (!response.ok) {
        const code = String(result?.error?.code || 'meta_rejected').slice(0, 80);
        await sql`UPDATE crm_whatsapp_nurture_jobs SET status = 'failed', error_code = ${code}, updated_at = NOW() WHERE id = ${job.id}`;
        console.error('WhatsApp nurture send rejected.', response.status, code);
        failed += 1; continue;
      }
      const messageId = String(result?.messages?.[0]?.id || '');
      if (!messageId) {
        await sql`UPDATE crm_whatsapp_nurture_jobs SET status = 'failed', error_code = 'missing_message_id', updated_at = NOW() WHERE id = ${job.id}`;
        failed += 1; continue;
      }
      const sentAt = new Date().toISOString();
      await sql`INSERT INTO crm_whatsapp_messages (id, lead_id, direction, from_phone, to_phone, message_type, body, status, sent_at)
        VALUES (${messageId}, ${job.lead_id}, 'outbound', ${String(phoneNumberId)}, ${phone}, 'template', ${`[Automated WhatsApp follow-up: ${String(settings.templateName || 'template')}]`}, 'sent', ${sentAt})
        ON CONFLICT (id) DO NOTHING`;
      await sql`UPDATE crm_whatsapp_nurture_jobs SET status = 'sent', message_id = ${messageId}, error_code = '', updated_at = NOW() WHERE id = ${job.id}`;
      sent += 1;
    }
    return respond(res, 200, { ok: true, sent, cancelled, failed });
  } catch (error) {
    console.error('WhatsApp nurture job failed.', error?.message || 'unknown error');
    return respond(res, 500, { error: 'The WhatsApp nurture job could not be completed.' });
  }
}
