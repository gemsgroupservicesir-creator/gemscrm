import { randomBytes } from 'node:crypto';

export async function runLeadAutomations(sql, lead, event) {
  const rows = await sql`SELECT value FROM crm_growth_features WHERE id = 'automations' LIMIT 1`;
  const rules = Array.isArray(rows[0]?.value?.rules) ? rows[0].value.rules : [];
  const trigger = event === 'new-lead' ? 'new-lead' : event === 'follow-up-status' ? 'follow-up-status' : '';
  if (!trigger) return;

  for (const rule of rules) {
    if (rule?.enabled !== true || rule.trigger !== trigger) continue;
    if (trigger === 'follow-up-status' && lead.status !== 'Follow-up') continue;
    const id = randomBytes(16).toString('hex');
    const dueAt = new Date(Date.now() + Math.max(1, Math.min(720, Number(rule.delayHours) || 24)) * 60 * 60 * 1000).toISOString();
    const title = String(rule.title || '').trim().slice(0, 180) || (trigger === 'new-lead' ? 'Contact new enquiry' : 'Follow up with student');
    const data = { title, type: 'follow-up', description: `Created automatically by “${String(rule.name || 'CRM automation').slice(0, 100)}”.`, outcome: '' };
    const automationKey = `${String(rule.id || 'rule').slice(0, 100)}:${lead.id}:${trigger}`;
    await sql`INSERT INTO crm_growth_tasks (id, lead_id, assigned_to, automation_key, due_at, status, data)
      VALUES (${id}, ${lead.id}, ${String(lead.assignedCounselorId || '')}, ${automationKey}, ${dueAt}, 'open', ${JSON.stringify(data)}::jsonb)
      ON CONFLICT (automation_key) DO NOTHING`;
  }
}
