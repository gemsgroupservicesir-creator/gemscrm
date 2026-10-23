import React, { useEffect, useMemo, useState } from 'react';
import { compressLeadImage } from './data/imageUpload.js';
import { getSiteEditorGroups } from './data/siteEditor.js';
import { getSiteCopy, readSiteCollection, removeSiteCollection, removeSiteCopy, saveSiteCollection, saveSiteCopy, subscribeToSiteCollections } from './data/siteCopy.js';
import { appUrl } from './data/siteUrl.js';

const pageLinks = {
  home: '/', banners: '/#home', 'home-universities': '/#universities', testimonials: '/#testimonials',
  about: '/about-us/', contact: '/contact-us/', universities: '/universities/', profiles: '/universities/',
  scholarships: '/scholarships/', guides: '/blogs/', articles: '/blogs/', global: '/',
};

function safeLink(value) {
  const link = String(value || '').trim();
  return link.startsWith('/') && !link.startsWith('//') || /^https:\/\//i.test(link) ? link : '/universities/';
}

export default function WebsiteEditor() {
  const groups = useMemo(() => getSiteEditorGroups(), []);
  const collectionGroups = useMemo(() => groups.filter((group) => group.collectionId), [groups]);
  const [selectedId, setSelectedId] = useState('home');
  const selected = groups.find((group) => group.id === selectedId) || groups[0];
  const [values, setValues] = useState(() => Object.fromEntries(groups.map((group) => [group.id, Object.fromEntries((group.fields || []).map((field) => [field.id, getSiteCopy(field.id, field.value)]))])));
  const [collections, setCollections] = useState(() => Object.fromEntries(collectionGroups.map((group) => [group.collectionId, readSiteCollection(group.collectionId, group.defaultItems).map((item) => ({ ...item }))])));
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const currentValues = values[selected.id] || {};
  const currentFields = selected.fields || [];
  const currentItems = selected.collectionId ? (collections[selected.collectionId] || []) : [];
  const storedItems = selected.collectionId ? readSiteCollection(selected.collectionId, selected.defaultItems) : [];
  const collectionChanged = selected.collectionId && JSON.stringify(currentItems) !== JSON.stringify(storedItems);
  const changedCount = selected.collectionId ? Number(collectionChanged) : currentFields.filter((field) => currentValues[field.id] !== getSiteCopy(field.id, field.value)).length;
  const savedCount = selected.collectionId
    ? Number(JSON.stringify(storedItems) !== JSON.stringify(selected.defaultItems))
    : currentFields.filter((field) => getSiteCopy(field.id, field.value) !== field.value).length;

  useEffect(() => subscribeToSiteCollections(({ id, value }) => {
    const group = collectionGroups.find((item) => item.collectionId === id);
    if (!group) return;
    setCollections((current) => ({ ...current, [id]: (value ?? group.defaultItems).map((item) => ({ ...item })) }));
  }), [collectionGroups]);

  function updateValue(fieldId, value) {
    setNotice('');
    setError('');
    setValues((current) => ({ ...current, [selected.id]: { ...(current[selected.id] || {}), [fieldId]: value } }));
  }

  function updateItem(index, key, value, collectionId = selected.collectionId) {
    setNotice('');
    setError('');
    setCollections((current) => ({
      ...current,
      [collectionId]: (current[collectionId] || []).map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }));
  }

  function addItem() {
    setNotice('');
    setError('');
    setCollections((current) => ({ ...current, [selected.collectionId]: [...(current[selected.collectionId] || []), selected.createItem()] }));
  }

  function removeItem(index) {
    setNotice('');
    setError('');
    setCollections((current) => ({ ...current, [selected.collectionId]: (current[selected.collectionId] || []).filter((_, itemIndex) => itemIndex !== index) }));
  }

  async function uploadItemImage(index, file) {
    if (!file) return;
    const collectionId = selected.collectionId;
    const maxEdge = selected.kind === 'banner' ? 1600 : 900;
    try {
      const image = await compressLeadImage(file, { maxEdge });
      updateItem(index, 'image', image, collectionId);
    } catch (uploadError) {
      setError(uploadError.message || 'Could not process this image.');
    }
  }

  function saveSection(event) {
    event.preventDefault();
    if (selected.collectionId) {
      const required = selected.kind === 'banner' ? ['image', 'alt'] : selected.kind === 'university' ? ['name', 'city', 'image'] : ['name', 'course', 'quote'];
      const incomplete = currentItems.findIndex((item) => required.some((key) => !String(item[key] || '').trim()));
      if (incomplete !== -1) {
        setError(`Complete the required details for item ${incomplete + 1}, or remove it before saving.`);
        setNotice('');
        return;
      }
      if (selected.kind === 'university' && currentItems.some((item) => item.href && safeLink(item.href) !== item.href.trim())) {
        setError('University links must start with / or use an https:// address.');
        setNotice('');
        return;
      }
      try {
        const normalized = selected.kind === 'university' ? currentItems.map((item) => ({ ...item, href: safeLink(item.href) })) : currentItems;
        setCollections((current) => ({ ...current, [selected.collectionId]: normalized }));
        saveSiteCollection(selected.collectionId, normalized);
        setError('');
        setNotice('Changes saved. They now appear on the website in this browser.');
      } catch {
        setError('Could not save this section. Try smaller images or remove an item.');
        setNotice('');
      }
      return;
    }
    for (const field of currentFields) saveSiteCopy(field.id, currentValues[field.id] ?? field.value);
    setError('');
    setNotice('Changes saved. They now appear on the website in this browser.');
  }

  function restoreSection() {
    if (selected.collectionId) {
      removeSiteCollection(selected.collectionId);
      setCollections((current) => ({ ...current, [selected.collectionId]: selected.defaultItems.map((item) => ({ ...item })) }));
      setNotice('This section has been restored to its original content.');
      setError('');
      return;
    }
    for (const field of currentFields) removeSiteCopy(field.id);
    setValues((current) => ({ ...current, [selected.id]: Object.fromEntries(currentFields.map((field) => [field.id, field.value])) }));
    setNotice('This page section has been restored to its original copy.');
    setError('');
  }

  function collectionFields(item, index) {
    const textField = (key, label, options = {}) => <label className="crm-editor-field" key={key}>{label}<input value={item[key] || ''} placeholder={options.placeholder || ''} onChange={(event) => updateItem(index, key, event.target.value)} /></label>;
    const imageField = <>
      {textField('image', 'Image path or URL', { placeholder: '/images/your-image.jpg or https://…' })}
      <label className="crm-editor-field">Upload image<input type="file" accept="image/*" onChange={(event) => uploadItemImage(index, event.currentTarget.files?.[0])} /><small>Image is resized and saved in this browser. Maximum upload size: 5 MB.</small></label>
      {item.image && <img className="crm-collection-preview" src={appUrl(item.image)} alt="Preview" />}
    </>;

    if (selected.kind === 'banner') return <>
      {textField('alt', 'Image description')}
      {imageField}
    </>;
    if (selected.kind === 'university') return <>
      {textField('name', 'University name')}
      {textField('city', 'City or location')}
      {textField('href', 'Card link', { placeholder: '/universities/ or https://…' })}
      {imageField}
    </>;
    return <>
      {textField('name', 'Student name')}
      {textField('course', 'Course or university')}
      <label className="crm-editor-field">Student story<textarea rows="4" value={item.quote || ''} onChange={(event) => updateItem(index, 'quote', event.target.value)} /></label>
      {imageField}
    </>;
  }

  return <section className="crm-editor" aria-labelledby="crm-editor-title">
    <div className="crm-title-row crm-editor-title-row">
      <div><span className="crm-kicker">KRISHNA FOUNDATION · WEBSITE</span><h1 id="crm-editor-title">Website editor</h1><p>Update website copy and manage home page content here.</p></div>
      <a className="crm-secondary-button crm-preview-link" href={appUrl(pageLinks[selected.id] || '/')} target="_blank" rel="noreferrer">Preview page <span aria-hidden="true">↗</span></a>
    </div>
    <div className="crm-editor-layout">
      <nav className="crm-editor-nav" aria-label="Website pages">
        <span className="crm-editor-nav-label">WEBSITE PAGES</span>
        {groups.map((group) => {
          const edited = group.collectionId
            ? Number(JSON.stringify(readSiteCollection(group.collectionId, group.defaultItems)) !== JSON.stringify(group.defaultItems))
            : (group.fields || []).filter((field) => getSiteCopy(field.id, field.value) !== field.value).length;
          return <button key={group.id} type="button" className={group.id === selected.id ? 'active' : ''} aria-current={group.id === selected.id ? 'page' : undefined} onClick={() => { setSelectedId(group.id); setNotice(''); setError(''); }}><span>{group.title}</span>{edited > 0 && <small>{edited}</small>}</button>;
        })}
        <p>Content is saved locally and shared with the website pages in this browser.</p>
      </nav>
      <form className="crm-editor-form" onSubmit={saveSection}>
        <div className="crm-editor-form-head"><div><h2>{selected.title}</h2><p>{selected.description}</p></div>{savedCount > 0 && <span className="crm-edit-count">{savedCount} saved</span>}</div>
        {selected.collectionId ? <div className="crm-collection-editor">
          {currentItems.map((item, index) => <article className="crm-collection-card" key={item.id || index}>
            <div className="crm-collection-card-head"><strong>{selected.kind === 'banner' ? `Banner ${index + 1}` : selected.kind === 'university' ? `University ${index + 1}` : `Testimonial ${index + 1}`}</strong><button className="crm-collection-remove" type="button" onClick={() => removeItem(index)}>Remove</button></div>
            <div className="crm-editor-fields">{collectionFields(item, index)}</div>
          </article>)}
          {!currentItems.length && <p className="crm-collection-empty">There are no items in this section. Add one to show it on the website.</p>}
          <button className="crm-secondary-button crm-collection-add" type="button" onClick={addItem}>＋ Add {selected.kind === 'banner' ? 'banner' : selected.kind === 'university' ? 'university' : 'testimonial'}</button>
        </div> : <div className="crm-editor-fields">
          {currentFields.map((field) => <label className="crm-editor-field" key={field.id}>{field.label}{field.type === 'textarea' ? <textarea rows="3" value={currentValues[field.id] ?? field.value} onChange={(event) => updateValue(field.id, event.target.value)} /> : <input value={currentValues[field.id] ?? field.value} onChange={(event) => updateValue(field.id, event.target.value)} />}</label>)}
        </div>}
        {error && <p className="crm-editor-error" role="alert">{error}</p>}
        {notice && <p className="crm-editor-notice" role="status">{notice}</p>}
        <div className="crm-editor-actions"><button className="crm-secondary-button" type="button" onClick={restoreSection}>Restore this page</button><span>{changedCount ? `${changedCount} unsaved ${changedCount === 1 ? 'change' : 'changes'}` : 'All changes saved'}</span><button className="crm-primary-button" type="submit">Save changes</button></div>
      </form>
    </div>
    <p className="crm-privacy-note">Changes and uploaded images are saved in this browser. Updating the live krishna.edu.np site requires its authenticated publishing connection.</p>
  </section>;
}
