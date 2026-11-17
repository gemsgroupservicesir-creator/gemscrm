import React, { useMemo } from 'react';

const shortcuts = [
  { id: 'leads', icon: '◫', title: 'Lead center', description: 'Search, assign, and update every enquiry.' },
  { id: 'landing-pages', icon: '▧', title: 'Campaign pages', description: 'Build student forms and track their leads.' },
  { id: 'lead-assigner', icon: '⇢', title: 'Lead routing', description: 'Assign enquiries by course and university.' },
  { id: 'website', icon: '⌂', title: 'Website editor', description: 'Update public website content and sections.' },
  { id: 'daily-report', icon: '▤', title: 'Daily work report', description: 'Review and write today’s counselor updates.' },
  { id: 'attendance', icon: '◷', title: 'Attendance', description: 'Check login time and daily attendance.' },
  { id: 'counselors', icon: '♙', title: 'Counselors', description: 'Manage counselor accounts and access.' },
];

function Stat({ icon, label, value, note, tone = 'blue' }) {
  return <article className={`growth-stat growth-stat-${tone}`}>
    <span className="growth-stat-icon" aria-hidden="true">{icon}</span>
    <span className="growth-stat-label">{label}</span>
    <strong>{value}</strong>
    <span className="growth-stat-note">{note}</span>
  </article>;
}

export default function GrowthDashboard({ leads, counselors, isAdmin, name, syncing, syncNotice, syncError, onSync, onAddLead, onOpenTab, onOpenLead, availableTabs }) {
  const canViewLeads = availableTabs.includes('leads');
  const stats = useMemo(() => {
    const open = leads.filter((lead) => ['New', 'Contacted', 'Follow-up', 'Application'].includes(lead.status || 'New'));
    const followUps = leads.filter((lead) => lead.status === 'Follow-up');
    const sheetLeads = leads.filter((lead) => /^google sheet/i.test(String(lead.source || '')));
    const unassigned = leads.filter((lead) => !lead.assignedCounselorId);
    return { open, followUps, sheetLeads, unassigned };
  }, [leads]);

  const recentLeads = useMemo(() => [...leads].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6), [leads]);
  const sources = useMemo(() => {
    const totals = new Map();
    leads.forEach((lead) => {
      const source = String(lead.source || 'Website enquiry').replace(/^Google Sheet:\s*/i, 'Google Sheets');
      totals.set(source, (totals.get(source) || 0) + 1);
    });
    return [...totals.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5);
  }, [leads]);
  const maxSourceCount = Math.max(1, ...sources.map(([, count]) => count));

  return <section className="growth-dashboard" aria-labelledby="growth-dashboard-title">
    <div className="crm-title-row growth-dashboard-heading">
      <div><span className="crm-kicker">GEMS GROUP SERVICES · CRM</span><h1 id="growth-dashboard-title">{isAdmin ? 'Good day, Admin' : `Welcome back, ${name || 'Counselor'}`}</h1><p>Your CRM tools are ready from one workspace.</p></div>
      <div className="growth-dashboard-actions">
        {isAdmin && <button className="crm-secondary-button" type="button" onClick={onSync} disabled={syncing}>{syncing ? 'Syncing sheet…' : '↻ Sync Google Sheet'}</button>}
        {isAdmin && <button className="crm-primary-button" type="button" onClick={onAddLead}>＋ Add lead</button>}
      </div>
    </div>

    {syncNotice && <p className="crm-import-notice growth-sync-notice" role="status">{syncNotice}</p>}
    {syncError && <p className="crm-import-error growth-sync-notice" role="alert">{syncError}</p>}

    {!canViewLeads && <div className="growth-access-note"><span aria-hidden="true">◇</span><p>Your account can use the workspace tools below. Ask an administrator if you need access to leads.</p></div>}

    {canViewLeads && <div className="growth-stats" aria-label="Lead summary">
      <Stat icon="↗" label="Total leads" value={leads.length} note={isAdmin ? 'All sources in this workspace' : 'Assigned to your account'} />
      <Stat icon="◷" label="Open enquiries" value={stats.open.length} note="Ready for a next step" tone="gold" />
      <Stat icon="⌁" label="Follow-ups" value={stats.followUps.length} note="Check in with these students" tone="violet" />
      <Stat icon="▦" label={isAdmin ? 'From Google Sheets' : 'Counselors'} value={isAdmin ? stats.sheetLeads.length : counselors.length} note={isAdmin ? 'Synced and deduplicated' : 'Available to support the team'} tone="green" />
    </div>}

    <div className="growth-dashboard-grid">
      <section className="growth-dashboard-panel growth-shortcuts-panel" aria-labelledby="growth-shortcuts-title">
        <div className="growth-panel-heading"><div><h2 id="growth-shortcuts-title">Quick access</h2><p>Open a workspace tool directly.</p></div><span className="growth-panel-badge">{shortcuts.filter((item) => availableTabs.includes(item.id)).length} tools</span></div>
        <div className="growth-shortcuts">
          {shortcuts.filter((item) => availableTabs.includes(item.id)).map((item) => <button key={item.id} type="button" className="growth-shortcut" onClick={() => onOpenTab(item.id)}>
            <span className="growth-shortcut-icon" aria-hidden="true">{item.icon}</span><span className="growth-shortcut-copy"><strong>{item.title}</strong><small>{item.description}</small></span><span className="growth-shortcut-arrow" aria-hidden="true">↗</span>
          </button>)}
        </div>
      </section>

      {canViewLeads && <section className="growth-dashboard-panel" aria-labelledby="growth-source-title">
        <div className="growth-panel-heading"><div><h2 id="growth-source-title">Lead sources</h2><p>Where enquiries entered your CRM.</p></div><button className="growth-text-button" type="button" onClick={() => onOpenTab('leads')}>View leads ↗</button></div>
        {sources.length ? <div className="growth-source-list">{sources.map(([source, count]) => <div className="growth-source-row" key={source}><div className="growth-source-label"><span>{source}</span><strong>{count}</strong></div><div className="growth-source-track"><span style={{ width: `${Math.max(4, Math.round(count / maxSourceCount * 100))}%` }} /></div></div>)}</div> : <div className="growth-dashboard-empty"><span aria-hidden="true">✦</span><strong>Your lead sources will appear here</strong><p>Website enquiries and your Google Sheet sync feed this dashboard.</p></div>}
        {isAdmin && <div className="growth-sheet-callout"><span className="growth-sheet-icon" aria-hidden="true">▦</span><div><strong>{stats.sheetLeads.length ? `${stats.sheetLeads.length} sheet leads in the workspace` : 'Google Sheets is ready to sync'}</strong><p>Sync imports rows A–E and matches existing leads to avoid duplicates.</p></div><button className="crm-secondary-button" type="button" onClick={onSync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync now'}</button></div>}
      </section>}
    </div>

    {canViewLeads && <section className="growth-dashboard-panel growth-recent-panel" aria-labelledby="growth-recent-title">
      <div className="growth-panel-heading"><div><h2 id="growth-recent-title">Recent leads</h2><p>{isAdmin ? 'Latest enquiries across your sources.' : 'Latest leads assigned to you.'}</p></div><button className="growth-text-button" type="button" onClick={() => onOpenTab('leads')}>Open lead center ↗</button></div>
      {recentLeads.length ? <div className="growth-recent-list">{recentLeads.map((lead) => {
        const counselorName = counselors.find((counselor) => counselor.id === lead.assignedCounselorId)?.name;
        return <button className="growth-recent-row" type="button" key={lead.id} onClick={() => onOpenLead(lead.id)}>
          <span className="growth-recent-avatar">{String(lead.name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')}</span>
          <span className="growth-recent-main"><strong>{lead.name}</strong><small>{lead.course || lead.faculty || 'Course not selected'}{lead.university ? ` · ${lead.university}` : ''}</small></span>
          <span className="growth-recent-source">{lead.source || 'Website enquiry'}</span>
          <span className={`growth-recent-status growth-status-${String(lead.status || 'New').toLowerCase().replace(/[^a-z]+/g, '-')}`}>{lead.status || 'New'}</span>
          <span className="growth-recent-owner">{counselorName || (lead.assignedCounselorId ? 'Assigned' : 'Unassigned')}</span>
          <span className="growth-recent-arrow" aria-hidden="true">↗</span>
        </button>;
      })}</div> : <div className="growth-dashboard-empty"><span aria-hidden="true">✦</span><strong>No leads yet</strong><p>Sync your Google Sheet or collect an enquiry from the website.</p>{isAdmin && <button className="crm-primary-button" type="button" onClick={onSync}>Sync Google Sheet</button>}</div>}
    </section>}

    {isAdmin && stats.unassigned.length > 0 && availableTabs.includes('lead-assigner') && <button className="growth-unassigned-banner" type="button" onClick={() => onOpenTab('lead-assigner')}><span>⇢</span><span><strong>{stats.unassigned.length} leads are waiting for assignment</strong><small>Open Lead assigner to route them by course and university.</small></span><b>Route leads ↗</b></button>}
  </section>;
}
