import React, { useEffect, useState } from 'react';
import { coursesOfInterest } from './data/siteContent.js';
import { addLead, readLeads, subscribeToLeads } from './data/crmStore.js';
import { readCounselors, subscribeToCounselors } from './data/crmCounselors.js';
import { deleteLandingPage, newLandingPage, readLandingPages, saveLandingPage, subscribeToLandingPages } from './data/landingPages.js';
import { compressLeadImage } from './data/imageUpload.js';
import { appUrl } from './data/siteUrl.js';

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function newCustomFieldId() {
  return window.crypto?.randomUUID?.() || `field-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function LandingPageManager() {
  const [pages, setPages] = useState(() => readLandingPages());
  const [leads, setLeads] = useState(() => readLeads());
  const [counselors, setCounselors] = useState(() => readCounselors());
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => subscribeToLandingPages(setPages), []);
  useEffect(() => subscribeToLeads(setLeads), []);
  useEffect(() => subscribeToCounselors(setCounselors), []);

  function change(key, value) {
    setEditing((current) => ({ ...current, [key]: value }));
    setNotice('');
    setError('');
  }

  function toggleField(name) {
    setEditing((current) => ({ ...current, fields: current.fields.includes(name) ? current.fields.filter((field) => field !== name) : [...current.fields, name] }));
  }

  function addCustomField() {
    setEditing((current) => ({ ...current, customFields: [...(current.customFields || []), { id: newCustomFieldId(), label: '', type: 'text', required: false, options: '' }] }));
    setNotice('');
    setError('');
  }

  function updateCustomField(id, key, value) {
    setEditing((current) => ({ ...current, customFields: (current.customFields || []).map((field) => field.id === id ? { ...field, [key]: value } : field) }));
    setNotice('');
    setError('');
  }

  function removeCustomField(id) {
    setEditing((current) => ({ ...current, customFields: (current.customFields || []).filter((field) => field.id !== id) }));
    setNotice('');
    setError('');
  }

  async function uploadCampaignPicture(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setNotice('');
    setError('');
    try {
      const campaignImage = await compressLeadImage(file, { maxEdge: 1400 });
      change('campaignImage', campaignImage);
    } catch (uploadError) {
      setError(uploadError.message || 'Could not process the campaign picture.');
    } finally {
      input.value = '';
    }
  }

  function persist(event, publish) {
    event.preventDefault();
    setNotice('');
    setError('');
    const next = { ...editing, slug: slugify(editing.slug), published: publish };
    if (!next.slug) {
      setError('Add a page link using letters and numbers.');
      return;
    }
    if (!next.name.trim() || !next.headline.trim() || !next.description.trim() || !next.formTitle.trim() || !next.buttonLabel.trim()) {
      setError('Fill in the page name, headline, introduction, form heading, and button text.');
      return;
    }
    if ((next.customFields || []).some((field) => !String(field.label || '').trim() || (field.type === 'select' && !String(field.options || '').split(',').some((option) => option.trim())))) {
      setError('Give each added field a label and add at least one choice to every dropdown field.');
      return;
    }
    try {
      const saved = saveLandingPage(next);
      setEditing(saved);
      setNotice(publish ? 'Landing page published.' : 'Landing page saved as a draft.');
    } catch (saveError) {
      setError(saveError.message || 'Could not save this landing page.');
    }
  }

  function removePage() {
    if (!editing || !window.confirm(`Delete “${editing.name}”? The landing page and its settings will be removed.`)) return;
    deleteLandingPage(editing.id);
    setEditing(null);
    setNotice('Landing page deleted.');
  }

  function openPreview() {
    if (!editing?.slug) return;
    const previewQuery = editing.published ? '' : '?preview=1';
    window.open(appUrl(`/landing/${slugify(editing.slug)}/${previewQuery}`), '_blank', 'noopener,noreferrer');
  }

  return <section className="crm-landing-manager" aria-labelledby="landing-builder-title">
    <div className="crm-title-row crm-editor-title-row">
      <div><span className="crm-kicker">KRISHNA FOUNDATION · CAMPAIGNS</span><h1 id="landing-builder-title">Landing page builder</h1><p>Create a focused campaign page with a form that adds enquiries to your CRM.</p></div>
      <button className="crm-primary-button" type="button" onClick={() => { setEditing(newLandingPage()); setNotice(''); setError(''); }}>＋ Create landing page</button>
    </div>
    <div className="crm-landing-layout">
      <aside className="crm-landing-list">
        <div className="crm-landing-list-head"><h2>Your pages</h2><span>{pages.length}</span></div>
        {!pages.length && <p className="crm-landing-empty">Your campaign pages will appear here.</p>}
        {pages.map((page) => {
          const leadCount = leads.filter((lead) => lead.source === `Landing page: /landing/${page.slug}/`).length;
          return <button key={page.id} type="button" className={`crm-landing-list-item ${editing?.id === page.id ? 'active' : ''}`} onClick={() => { setEditing({ ...page, customFields: Array.isArray(page.customFields) ? page.customFields : [] }); setNotice(''); setError(''); }}><strong>{page.name}</strong><span><i className={page.published ? 'published' : ''} />{page.published ? 'Published' : 'Draft'} · {leadCount} {leadCount === 1 ? 'lead' : 'leads'}</span></button>;
        })}
      </aside>

      {editing ? <form className="crm-landing-builder" onSubmit={(event) => persist(event, editing.published)}>
        <div className="crm-landing-builder-head"><div><span className="crm-kicker">PAGE CONTENT</span><h2>{editing.name || 'New campaign page'}</h2></div><span className={`crm-landing-status ${editing.published ? 'published' : ''}`}>{editing.published ? 'Published' : 'Draft'}</span></div>
        <div className="crm-editor-fields">
          <label className="crm-editor-field">Page name<input value={editing.name} onChange={(event) => change('name', event.target.value)} required /></label>
          <label className="crm-editor-field">Page link<span className="crm-landing-slug"><span>/landing/</span><input value={editing.slug} onChange={(event) => change('slug', slugify(event.target.value))} required aria-label="Landing page link" /><span>/</span></span></label>
          <label className="crm-editor-field">Small heading<input value={editing.eyebrow} onChange={(event) => change('eyebrow', event.target.value)} /></label>
          <label className="crm-editor-field">Main headline<textarea rows="2" value={editing.headline} onChange={(event) => change('headline', event.target.value)} required /></label>
          <label className="crm-editor-field">Introduction<textarea rows="4" value={editing.description} onChange={(event) => change('description', event.target.value)} required /></label>
          <label className="crm-editor-field">Form heading<input value={editing.formTitle} onChange={(event) => change('formTitle', event.target.value)} required /></label>
          <label className="crm-editor-field">Button text<input value={editing.buttonLabel} onChange={(event) => change('buttonLabel', event.target.value)} required /></label>
          <label className="crm-editor-field">Page style<select value={editing.theme} onChange={(event) => change('theme', event.target.value)}><option value="blue">Blue and white</option><option value="warm">Warm and welcoming</option></select></label>
          <label className="crm-editor-field">Assign new leads to<select value={counselors.some((counselor) => counselor.id === editing.assignedCounselorId && counselor.username && counselor.credential && counselor.permissions?.leads) ? editing.assignedCounselorId : ''} onChange={(event) => change('assignedCounselorId', event.target.value)}><option value="">Leave unassigned</option>{counselors.filter((counselor) => counselor.username && counselor.credential && counselor.permissions?.leads).map((counselor) => <option key={counselor.id} value={counselor.id}>{counselor.name} · {counselor.username}</option>)}</select><small>Every enquiry from this page will be assigned automatically to this counselor.</small></label>
          <div className="crm-editor-field crm-campaign-image-field"><span>Campaign picture</span><label className="crm-campaign-image-control">Choose an image<input type="file" accept="image/*" onChange={uploadCampaignPicture} /><small>JPG, PNG, or another image under 5 MB.</small></label>{editing.campaignImage && <div className="crm-campaign-image-preview"><img src={appUrl(editing.campaignImage)} alt={`${editing.name || 'Campaign'} picture preview`} /><button className="crm-collection-remove" type="button" onClick={() => change('campaignImage', '')}>Remove picture</button></div>}</div>
        </div>
        <fieldset className="crm-landing-fields"><legend>Lead form fields</legend><p>Name and Gmail address are always required. Add or remove extra details, and choose whether each is required.</p><div className="crm-landing-field-options">
          <div className="crm-landing-field-option"><label><input type="checkbox" checked={editing.fields.includes('phone')} onChange={() => toggleField('phone')} /> Phone number</label>{editing.fields.includes('phone') && <label className="crm-required-option"><input type="checkbox" checked={editing.phoneRequired !== false} onChange={(event) => change('phoneRequired', event.target.checked)} /> Required</label>}</div>
          <div className="crm-landing-field-option"><label><input type="checkbox" checked={editing.fields.includes('faculty')} onChange={() => toggleField('faculty')} /> Course of interest</label>{editing.fields.includes('faculty') && <label className="crm-required-option"><input type="checkbox" checked={editing.facultyRequired !== false} onChange={(event) => change('facultyRequired', event.target.checked)} /> Required</label>}</div>
          <div className="crm-landing-field-option"><label><input type="checkbox" checked={editing.fields.includes('image')} onChange={() => toggleField('image')} /> Student image upload</label>{editing.fields.includes('image') && <label className="crm-required-option"><input type="checkbox" checked={Boolean(editing.imageRequired)} onChange={(event) => change('imageRequired', event.target.checked)} /> Required</label>}</div>
        </div></fieldset>
        <section className="crm-custom-field-editor" aria-labelledby="custom-fields-title">
          <div className="crm-custom-field-editor-head"><div><h3 id="custom-fields-title">Additional form fields</h3><p>Add questions for this campaign and choose which answers are required.</p></div><button className="crm-secondary-button" type="button" onClick={addCustomField}>＋ Add field</button></div>
          {!editing.customFields?.length && <p className="crm-custom-field-empty">No additional fields. Add a field to ask for more information.</p>}
          {(editing.customFields || []).map((field, index) => <article className="crm-custom-field-card" key={field.id}>
            <div className="crm-custom-field-card-head"><strong>Field {index + 1}</strong><button className="crm-collection-remove" type="button" onClick={() => removeCustomField(field.id)}>Delete field</button></div>
            <div className="crm-custom-field-controls">
              <label className="crm-editor-field">Field label<input value={field.label} onChange={(event) => updateCustomField(field.id, 'label', event.target.value)} placeholder="For example, Preferred city" required /></label>
              <label className="crm-editor-field">Answer type<select value={field.type} onChange={(event) => updateCustomField(field.id, 'type', event.target.value)}><option value="text">Short answer</option><option value="textarea">Long answer</option><option value="email">Email</option><option value="tel">Phone number</option><option value="select">Dropdown choices</option></select></label>
              {field.type === 'select' && <label className="crm-editor-field">Choices<input value={field.options || ''} onChange={(event) => updateCustomField(field.id, 'options', event.target.value)} placeholder="Separate choices with commas" required /><small>Enter choices separated by commas.</small></label>}
              <label className="crm-custom-required"><input type="checkbox" checked={Boolean(field.required)} onChange={(event) => updateCustomField(field.id, 'required', event.target.checked)} /> Required field</label>
            </div>
          </article>)}
        </section>
        {notice && <p className="crm-editor-notice" role="status">{notice}</p>}
        {error && <p className="crm-landing-error" role="alert">{error}</p>}
        <div className="crm-editor-actions crm-landing-actions">
          {pages.some((page) => page.id === editing.id) && <button className="crm-secondary-button crm-landing-delete" type="button" onClick={removePage}>Delete</button>}
          <button className="crm-secondary-button" type="button" onClick={openPreview} disabled={!pages.some((page) => page.id === editing.id)}>{editing.published ? 'Open published page' : 'Preview draft'}</button>
          <button className="crm-secondary-button" type="submit" onClick={(event) => { event.preventDefault(); persist(event, false); }}>Save draft</button>
          <button className="crm-primary-button" type="submit" onClick={(event) => { event.preventDefault(); persist(event, true); }}>{editing.published ? 'Save & publish' : 'Publish page'}</button>
        </div>
        <p className="crm-privacy-note">Pages are published within this local site. Connect hosting and a server for public visitors outside this browser.</p>
      </form> : <div className="crm-landing-empty-state"><span aria-hidden="true">✦</span><h2>Build your first campaign page</h2><p>Choose a headline, set up a short enquiry form, and publish a page link to share with students.</p><button className="crm-primary-button" type="button" onClick={() => setEditing(newLandingPage())}>Create landing page</button></div>}
    </div>
  </section>;
}

export function LandingPageView({ page }) {
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const preview = new URLSearchParams(window.location.search).get('preview') === '1';

  if (!page.published && !preview) return <main className="landing-unpublished"><h1>This campaign page is not published</h1><p>Return to the Krishna Foundation website or sign in to the CRM to preview the page.</p><a href={appUrl('/')}>Return to website</a></main>;

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    if (preview) {
      setSent(true);
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const selectedCourse = String(data.get('faculty') || '');
    setSubmitting(true);
    try {
      const image = await compressLeadImage(data.get('image'));
      const formAnswers = (page.customFields || []).map((field) => ({
        id: field.id,
        label: field.label,
        value: String(data.get(`customField-${field.id}`) || '').trim(),
      })).filter((answer) => answer.value);
      addLead({
        name: String(data.get('name') || ''),
        email: String(data.get('email') || ''),
        phone: String(data.get('phone') || ''),
        faculty: selectedCourse,
        course: selectedCourse,
        image,
        formAnswers,
        source: `Landing page: /landing/${page.slug}/`,
        assignedCounselorId: readCounselors().some((counselor) => counselor.id === page.assignedCounselorId && counselor.username && counselor.credential && counselor.permissions?.leads) ? page.assignedCounselorId : '',
      });
      setSent(true);
      form.reset();
    } catch (error) {
      setFormError(error.message || 'Could not submit your enquiry. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return <main className={`landing-page landing-theme-${page.theme || 'blue'}`}>
    <header className="landing-header"><a href={appUrl('/')} aria-label="GEMS Group Services home"><img src={appUrl('/images/logo.png')} alt="GEMS Group Services" /></a><span>{preview && !page.published ? 'Preview · Draft' : 'Free student guidance'}</span></header>
    <section className="landing-hero"><div className="landing-copy"><span className="landing-eyebrow">{page.eyebrow}</span><h1>{page.headline}</h1><p>{page.description}</p><a className="landing-cta" href="#lead-form">{page.buttonLabel} <span aria-hidden="true">→</span></a><div className="landing-trust"><span>✓</span> Personal support from first enquiry to admission</div>{page.campaignImage && <img className="landing-campaign-image" src={appUrl(page.campaignImage)} alt={`${page.name || 'Campaign'} picture`} />}</div>
      <form className="landing-form" id="lead-form" onSubmit={submit}>
        <span className="landing-form-kicker">KRISHNA FOUNDATION · INDIA ADMISSIONS</span><h2>{page.formTitle}</h2><p>Share your details and our counsellors will get in touch.</p>
        <p className="landing-required-note">Fields marked * are required.</p>
        <label><span className="landing-field-label">Full name <i>*</i></span><input name="name" autoComplete="name" placeholder="Your name" required /></label>
        <label><span className="landing-field-label">Gmail address <i>*</i></span><input name="email" type="email" autoComplete="email" placeholder="you@gmail.com" required /></label>
        {page.fields.includes('phone') && <label><span className="landing-field-label">Phone number{page.phoneRequired !== false && <i>*</i>}</span><input name="phone" type="tel" autoComplete="tel" placeholder="+977" required={page.phoneRequired !== false} /></label>}
        {page.fields.includes('faculty') && <label><span className="landing-field-label">Course of interest{page.facultyRequired !== false && <i>*</i>}</span><select name="faculty" defaultValue="" required={page.facultyRequired !== false}><option value="">Select a course</option>{coursesOfInterest.map((course) => <option key={course}>{course}</option>)}</select></label>}
        {page.fields.includes('image') && <label><span className="landing-field-label">Student image{page.imageRequired && <i>*</i>}</span><span className="landing-upload-hint">{page.imageRequired ? 'Required · JPG, PNG, or another image under 5 MB' : 'Optional · JPG, PNG, or another image under 5 MB'}<input className="landing-image-input" name="image" type="file" accept="image/*" required={Boolean(page.imageRequired)} /></span></label>}
        {(page.customFields || []).map((field) => <label key={field.id}><span className="landing-field-label">{field.label}{field.required && <i>*</i>}</span>{field.type === 'textarea' ? <textarea name={`customField-${field.id}`} rows="3" required={Boolean(field.required)} /> : field.type === 'select' ? <select name={`customField-${field.id}`} defaultValue="" required={Boolean(field.required)}><option value="">Select an option</option>{(field.options || '').split(',').map((option) => option.trim()).filter(Boolean).map((option) => <option key={option}>{option}</option>)}</select> : <input name={`customField-${field.id}`} type={['text', 'email', 'tel'].includes(field.type) ? field.type : 'text'} required={Boolean(field.required)} />}</label>)}
        {formError && <p className="landing-form-error" role="alert">{formError}</p>}
        <button className="landing-submit" type="submit" disabled={submitting}>{submitting ? 'Sending…' : <>{page.buttonLabel} <span aria-hidden="true">→</span></>}</button>
        {sent && <p className="landing-success" role="status">{preview ? 'Preview only — this enquiry was not saved.' : 'Thanks — your enquiry has been sent to our team.'}</p>}
        <small>Your details are used to respond to this enquiry.</small>
      </form>
    </section>
    <footer className="landing-footer"><span>Krishna Foundation</span><a href="mailto:krishnaconsultnepal@gmail.com">krishnaconsultnepal@gmail.com</a><a href="tel:+977014795410">+977 01-4795410</a></footer>
  </main>;
}
