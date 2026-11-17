import { createHash } from 'node:crypto';

let schemaPromise;

export async function ensureWhatsappNurtureSchema(sql) {
  if (!schemaPromise) schemaPromise = (async () => {
    await sql`CREATE TABLE IF NOT EXISTS crm_whatsapp_nurture_jobs (
      id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
      automation_id TEXT NOT NULL, step_id TEXT NOT NULL,
      due_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','cancelled','failed')),
      data JSONB NOT NULL DEFAULT '{}'::jsonb, attempts INTEGER NOT NULL DEFAULT 0,
      message_id TEXT NOT NULL DEFAULT '', error_code TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (lead_id, automation_id, step_id)
    )`;
    await sql`CREATE INDEX IF NOT EXISTS crm_whatsapp_nurture_due_idx ON crm_whatsapp_nurture_jobs (status, due_at)`;
    await sql`CREATE INDEX IF NOT EXISTS crm_whatsapp_nurture_lead_idx ON crm_whatsapp_nurture_jobs (lead_id, status)`;
  })().catch((error) => { schemaPromise = undefined; throw error; });
  return schemaPromise;
}

export async function enqueueWhatsappNurture(sql, lead) {
  if (lead?.whatsappOptIn !== true || !lead.phone || ['Closed', 'Enrolled'].includes(lead.status)) return 0;
  await ensureWhatsappNurtureSchema(sql);
  const rows = await sql`SELECT value FROM crm_growth_features WHERE id = 'whatsapp-nurture' LIMIT 1`;
  const config = rows[0]?.value || {};
  if (config.enabled !== true || !Array.isArray(config.steps)) return 0;
  const created = new Date(lead.createdAt || Date.now()).getTime();
  const consent = new Date(lead.whatsappOptInAt || lead.createdAt || Date.now()).getTime();
  const startAt = new Date(Math.max(Number.isFinite(created) ? created : 0, Number.isFinite(consent) ? consent : Date.now()));
  let queued = 0;
  for (const step of config.steps.slice(0, 10)) {
    const templateName = String(step.templateName || '').trim().toLowerCase();
    const language = String(step.language || 'en_US').trim();
    const delayDays = Math.max(0, Math.min(365, Math.trunc(Number(step.delayDays) || 0)));
    if (!/^[a-z0-9_]{1,512}$/.test(templateName) || !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(language)) continue;
    const parameters = Array.isArray(step.parameters) ? step.parameters.filter((key) => ['name', 'course', 'university'].includes(key)).slice(0, 10) : [];
    const automationId = 'lead-nurture-v1';
    const stepId = String(step.id || '').slice(0, 100);
    if (!stepId) continue;
    const id = createHash('sha256').update(`${lead.id}:${automationId}:${stepId}`).digest('hex');
    const dueAt = new Date(startAt.getTime() + delayDays * 86_400_000).toISOString();
    const data = JSON.stringify({ templateName, language, parameters });
    const inserted = await sql`INSERT INTO crm_whatsapp_nurture_jobs (id, lead_id, automation_id, step_id, due_at, data)
      VALUES (${id}, ${lead.id}, ${automationId}, ${stepId}, ${dueAt}, ${data}::jsonb)
      ON CONFLICT (lead_id, automation_id, step_id) DO NOTHING RETURNING id`;
    if (inserted.length) queued += 1;
  }
  return queued;
}

export async function cancelWhatsappNurture(sql, leadId) {
  if (!leadId) return;
  await ensureWhatsappNurtureSchema(sql);
  await sql`UPDATE crm_whatsapp_nurture_jobs SET status = 'cancelled', updated_at = NOW()
    WHERE lead_id = ${leadId} AND status = 'queued'`;
}
