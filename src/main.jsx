import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SitePage, { resolveSitePage } from './PageContent.jsx';
import { LandingPageView } from './LandingPages.jsx';
import { fetchPublicLandingPage, loadPublicSiteContent } from './data/crmApi.js';
import { faculties, siteContent } from './data/siteContent.js';
import { submitPublicLead } from './data/crmStore.js';
import { appPath, appUrl } from './data/siteUrl.js';
import { getSiteCopy, readSiteCollection, saveSiteCopy, sanitizeStoredWebsiteContent, subscribeToSiteCollections, subscribeToSiteCopy } from './data/siteCopy.js';
import './styles.css';

sanitizeStoredWebsiteContent();

const crmEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_CRM === 'true';
const CRM = crmEnabled ? React.lazy(() => import('./CRM.jsx')) : null;

function Icon({ name, size = 18 }) {
  const paths = {
    arrow: <><path d="M4 12h15" /><path d="m13 5 7 7-7 7" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    phone: <><path d="M7 3h3l1.5 4-2 1.5a15 15 0 0 0 6 6l1.5-2 4 1.5v3c0 1-1 2-2 2C10 19 5 14 5 6c0-2 1-3 2-3Z" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    pen: <><path d="m14 5 5 5" /><path d="M4 20h4l11-11a2.1 2.1 0 0 0-4-4L4 16v4Z" /></>,
    menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
    close: <><path d="m6 6 12 12" /><path d="M18 6 6 18" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function EditableText({ id, value, editMode, as: Tag = 'span', className = '', children, ...props }) {
  const [text, setText] = useState(() => getSiteCopy(id, value));

  useEffect(() => {
    setText(getSiteCopy(id, value));
    return subscribeToSiteCopy(({ id: changedId, value: changedValue }) => {
      if (changedId === id) setText(changedValue ?? value);
    });
  }, [id, value]);

  function saveEdit(event) {
    const next = event.currentTarget.innerText.trim();
    if (next) {
      saveSiteCopy(id, next).then(() => setText(next)).catch(() => setText(getSiteCopy(id, value)));
    } else {
      event.currentTarget.innerText = text;
    }
  }

  return (
    <Tag
      {...props}
      className={className}
      contentEditable={editMode}
      suppressContentEditableWarning
      spellCheck={editMode}
      onBlur={editMode ? saveEdit : undefined}
      data-editable={editMode ? 'true' : undefined}
    >
      {text || children}
    </Tag>
  );
}

function useSiteCollection(id, fallback) {
  const [items, setItems] = useState(() => readSiteCollection(id, fallback));
  useEffect(() => subscribeToSiteCollections((change) => {
    if (change.id === id) setItems(change.value ?? fallback);
  }), [id, fallback]);
  return items;
}

function Header({ editMode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <div className="contact-bar">
        <div className="container contact-bar-inner">
          <div className="contact-bar-links">
            <a href="tel:+9779802589183"><Icon name="phone" size={13} /><EditableText id="company-phone-0" value={siteContent.company.phones[0]} editMode={editMode} /></a>
            <a href={`mailto:${siteContent.company.email}`}><Icon name="mail" size={13} /><EditableText id="company-email" value={siteContent.company.email} editMode={editMode} /></a>
          </div>
          <a className="top-consult" href={appUrl('/contact-us/')}><EditableText id="header-top-consult" value="Contact GEMS" editMode={editMode} /> <Icon name="arrow" size={14} /></a>
        </div>
      </div>
      <header className="site-header" id="home">
        <div className="container header-inner">
          <a href={appUrl('/')} className="brand" aria-label="GEMS Group Services home">
            <img src={appUrl('/images/logo.png')} alt="GEMS Group Services" />
          </a>
          <nav className={`main-nav ${menuOpen ? 'nav-open' : ''}`} aria-label="Main navigation">
            {siteContent.navigation.map((item, index) => <a key={item.label} href={appUrl(item.href)} onClick={() => setMenuOpen(false)}><EditableText id={`nav-${index}-label`} value={item.label} editMode={editMode} /></a>)}
          </nav>
          <div className="header-actions">
            <a className="header-cta" href={appUrl('/contact-us/')}><EditableText id="header-cta" value="Talk to a counsellor" editMode={editMode} /> <Icon name="arrow" size={15} /></a>
            <button className="menu-button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}>
              <Icon name={menuOpen ? 'close' : 'menu'} size={22} />
            </button>
          </div>
        </div>
      </header>
    </>
  );
}

function BannerCarousel() {
  const bannerSlides = useSiteCollection('banners', siteContent.banners);
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (bannerSlides.length < 2) return undefined;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % bannerSlides.length), 6500);
    return () => window.clearInterval(timer);
  }, [bannerSlides.length]);
  if (!bannerSlides.length) return null;
  const activeIndex = active % bannerSlides.length;
  const move = (step) => setActive((current) => (current + step + bannerSlides.length) % bannerSlides.length);

  return (
    <section className="banner-wrap" aria-label="University announcements">
      <div className="banner-slide" key={`${bannerSlides[activeIndex].id || activeIndex}-${bannerSlides[activeIndex].image}`}>
        <img src={appUrl(bannerSlides[activeIndex].image)} alt={bannerSlides[activeIndex].alt || ''} />
      </div>
      {bannerSlides.length > 1 && <><button className="banner-arrow banner-prev" aria-label="Previous banner" onClick={() => move(-1)}>‹</button>
      <button className="banner-arrow banner-next" aria-label="Next banner" onClick={() => move(1)}>›</button>
      <div className="banner-dots" aria-label="Choose banner">
        {bannerSlides.map((slide, i) => <button key={slide.id || slide.image} className={i === activeIndex ? 'selected' : ''} aria-label={`Show banner ${i + 1}`} aria-pressed={i === activeIndex} onClick={() => setActive(i)} />)}
      </div></>}
    </section>
  );
}

function UniversityRail({ editMode }) {
  const universities = useSiteCollection('universities', siteContent.universities);
  if (!universities.length) return null;
  return <div className="university-rail"><div className="container rail-inner"><span className="rail-label"><EditableText id="university-rail-label" value="Institutions to explore" editMode={editMode} /></span><div className="rail-logos">{universities.slice(0, 6).map((university, index) => <div className="rail-logo" key={university.id || index}>{university.image && <img src={appUrl(university.image)} alt={`${university.name} logo`} />}</div>)}</div></div></div>;
}

function InquiryForm({ editMode }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError(''); setSent(false);
    try {
      await submitPublicLead({ name: String(data.get('name') || ''), email: String(data.get('email') || ''), phone: String(data.get('phone') || ''), faculty: String(data.get('faculty') || ''), source: 'Website enquiry' });
      setSent(true); form.reset();
    } catch (submitError) { setError(submitError.message || 'We could not send your enquiry. Please try again.'); }
    finally { setBusy(false); }
  }

  return (
    <form className="inquiry-card" onSubmit={handleSubmit}>
      <div className="form-heading">
        <span className="eyebrow"><EditableText id="form-eyebrow" value="Let’s plan your next step" editMode={editMode} /></span>
        <EditableText id="form-title" value="Request a consultation" editMode={editMode} as="h3" />
        <EditableText id="form-intro" value="Share a few details and our team will guide you." editMode={editMode} as="p" />
      </div>
      <div className="form-fields">
        <label><EditableText id="form-label-name" value="Full name" editMode={editMode} as="span" /><input name="name" autoComplete="name" placeholder={getSiteCopy('form-placeholder-name', 'Your name')} required /></label>
        <label><EditableText id="form-label-email" value="Email address" editMode={editMode} as="span" /><input name="email" type="email" autoComplete="email" placeholder={getSiteCopy('form-placeholder-email', 'you@example.com')} required /></label>
        <label><EditableText id="form-label-phone" value="Phone number" editMode={editMode} as="span" /><input name="phone" type="tel" autoComplete="tel" placeholder={getSiteCopy('form-placeholder-phone', '+977')} required /></label>
        <label><EditableText id="form-label-faculty" value="Faculty of interest" editMode={editMode} as="span" /><select name="faculty" defaultValue="" required><option value="" disabled>{getSiteCopy('form-faculty-placeholder', 'Select a faculty')}</option>{faculties.map((faculty) => <option key={faculty}>{faculty}</option>)}</select></label>
      </div>
      <button className="button button-primary form-submit" type="submit" disabled={busy}>{busy ? 'Sending…' : <><EditableText id="form-submit" value="Send enquiry" editMode={editMode} /> <Icon name="arrow" size={16} /></>}</button>
      <EditableText id="form-note" value="Share a few details so our team can guide you." editMode={editMode} as="p" className="form-note" />
      {sent && <div className="form-success" role="status"><Icon name="check" size={17} /> <EditableText id="form-success" value="Thank you. Your enquiry has been received." editMode={editMode} /> </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}

function Hero({ editMode }) {
  return (
    <section className="hero-section">
      <div className="container hero-grid">
        <div className="hero-copy" data-reveal="left">
          <div className="eyebrow"><span className="eyebrow-line" /> <EditableText id="hero-eyebrow" value={siteContent.hero.eyebrow} editMode={editMode} /></div>
          <h1><EditableText id="hero-title-1" value={siteContent.hero.titleLineOne} editMode={editMode} as="span" /><br /><EditableText id="hero-title-2" value={siteContent.hero.titleLineTwo} editMode={editMode} as="span" className="accent-text" /></h1>
          <EditableText id="hero-description" value={siteContent.hero.description} editMode={editMode} as="p" className="hero-description" />
          <div className="authorized-note"><span className="checkmark"><Icon name="check" size={16} /></span><EditableText id="hero-authorized" value={siteContent.hero.universityNote} editMode={editMode} /></div>
          <p className="hero-signoff"><EditableText id="hero-signoff" value={siteContent.hero.signoff} editMode={editMode} /></p>
          <a className="button button-primary hero-cta" href="#contact"><EditableText id="hero-cta" value="Start your journey" editMode={editMode} /> <Icon name="arrow" size={16} /></a>
        </div>
        <div className="hero-side" data-reveal="right" style={{ transitionDelay: '100ms' }}>
          <div className="student-art"><div className="art-wash" /><img src={appUrl('/images/hero-student.png')} alt="Student holding a book" /></div>
          <InquiryForm editMode={editMode} />
        </div>
      </div>
      <div className="hero-bottom-glow" aria-hidden="true" />
    </section>
  );
}

function HighlightCards({ editMode }) {
  const icons = ['01', '02', '03', '04'];
  return (
    <section className="highlights-section" id="stories">
      <div className="container highlights-grid">
        {siteContent.highlights.map((item, index) => <article className="highlight-card" data-reveal key={item.title} style={{ transitionDelay: `${index * 75}ms` }}>
          <span className="highlight-number">{icons[index]}</span>
          <div><EditableText id={`highlight-${index}-title`} value={item.title} editMode={editMode} as="h3" /><EditableText id={`highlight-${index}-text`} value={item.text} editMode={editMode} as="p" /></div>
          <span className="highlight-arrow"><Icon name="arrow" size={17} /></span>
        </article>)}
      </div>
    </section>
  );
}

function IntroSection({ editMode }) {
  return (
    <section className="intro-section section-pad" id="about">
      <div className="container intro-grid">
        <div className="intro-mark" data-reveal="left"><div className="intro-mark-ring"><span>G</span></div><span className="mark-caption"><EditableText id="intro-mark-caption" value="STUDY SMART, DREAM BIG" editMode={editMode} as="span" /></span></div>
        <div className="intro-copy" data-reveal="right" style={{ transitionDelay: '100ms' }}>
          <div className="eyebrow"><span className="eyebrow-line" /> <EditableText id="intro-eyebrow" value="About GEMS Group Services" editMode={editMode} /></div>
          <EditableText id="intro-title" value={siteContent.intro.title} editMode={editMode} as="h2" />
          <EditableText id="intro-body" value={siteContent.intro.body} editMode={editMode} as="p" />
          <a className="text-link" href="#services"><EditableText id="intro-link" value="Explore our services" editMode={editMode} /> <Icon name="arrow" size={16} /></a>
        </div>
      </div>
    </section>
  );
}

function ServicesSection({ editMode }) {
  return (
    <section className="services-section section-pad" id="services">
      <div className="container">
        <div className="section-heading split-heading">
          <div data-reveal="left"><div className="eyebrow"><span className="eyebrow-line" /> <EditableText id="services-kicker" value="Student-centred support" editMode={editMode} /></div><EditableText id="services-title" value="Guidance at every step" editMode={editMode} as="h2" /></div>
          <EditableText id="services-intro" value="From academic exploration to application follow-up, we help make the next steps easier to understand." editMode={editMode} as="p" data-reveal="right" style={{ transitionDelay: '100ms' }} />
        </div>
        <div className="service-grid">
          {siteContent.services.map((service, index) => <article className="service-card" data-reveal key={service.title} style={{ transitionDelay: `${index * 80}ms` }}>
            <div className="service-visual"><img src={appUrl(service.image)} alt="" /><span className="service-index">0{index + 1}</span></div>
            <div className="service-copy"><EditableText id={`service-${index}-title`} value={service.title} editMode={editMode} as="h3" /><EditableText id={`service-${index}-text`} value={service.text} editMode={editMode} as="p" /><a href="#contact" aria-label={`Ask us about ${service.title}`}><Icon name="arrow" size={17} /></a></div>
          </article>)}
        </div>
      </div>
    </section>
  );
}

function AchievementSection({ editMode }) {
  return (
    <section className="achievement-section section-pad">
      <div className="container achievement-grid">
        <div className="achievement-copy" data-reveal="left">
          <div className="eyebrow eyebrow-light"><span className="eyebrow-line" /> <EditableText id="achievement-kicker" value="A clear student journey" editMode={editMode} /></div>
          <EditableText id="achievement-title" value={siteContent.achievements.title} editMode={editMode} as="h2" />
          <EditableText id="achievement-body" value={siteContent.achievements.body} editMode={editMode} as="p" />
          <a href="#contact" className="button button-light"><EditableText id="achievement-cta" value="Talk to GEMS" editMode={editMode} /> <Icon name="arrow" size={16} /></a>
        </div>
        <div className="metrics-grid" data-reveal="right" style={{ transitionDelay: '120ms' }}>
          {siteContent.achievements.metrics.map((metric, index) => <div className="metric-card" key={metric.label} style={{ transitionDelay: `${index * 90}ms` }}><span className="metric-value"><EditableText id={`metric-${index}-value`} value={metric.value} editMode={editMode} /></span><EditableText id={`metric-${index}-label`} value={metric.label} editMode={editMode} as="span" className="metric-label" /></div>)}
          <div className="metric-note"><span className="metric-note-symbol">✳</span><EditableText id="metric-note" value="Personalized, organized follow-up" editMode={editMode} as="span" /></div>
        </div>
      </div>
    </section>
  );
}

function UniversitiesSection({ editMode }) {
  const universities = useSiteCollection('universities', siteContent.universities);
  if (!universities.length) return null;
  return (
    <section className="universities-section section-pad" id="universities">
      <div className="container">
        <div className="section-heading centered-heading">
          <div className="eyebrow" data-reveal><span className="eyebrow-line" /> <EditableText id="universities-kicker" value="Explore academic options" editMode={editMode} /></div>
          <EditableText id="universities-title" value="Explore institution profiles" editMode={editMode} as="h2" />
          <EditableText id="universities-subtitle" value="Compare study options and use each institution’s official channels to confirm current program and admission details." editMode={editMode} as="p" />
        </div>
        <div className="university-grid">
          {universities.map((university, index) => <a className="university-card" data-reveal key={university.id || index} href={appUrl(university.href || '/universities/')} style={{ transitionDelay: `${index * 65}ms` }}>
            <div className="university-logo">{university.image && <img src={appUrl(university.image)} alt={`${university.name} logo`} />}</div>
            <div className="university-info"><div><h3>{university.name}</h3><span>{university.city}</span></div><span className="circle-arrow"><Icon name="arrow" size={16} /></span></div>
          </a>)}
        </div>
        <div className="university-footnote"><span className="tiny-star">✦</span> <EditableText id="universities-footnote" value="Profiles are informational. Formal representation or partnership is confirmed only through a separate written agreement." editMode={editMode} /></div>
      </div>
    </section>
  );
}

function TestimonialsSection({ editMode }) {
  const testimonials = useSiteCollection('testimonials', siteContent.testimonials);
  const [active, setActive] = useState(0);
  if (!testimonials.length) return null;
  const activeIndex = active % testimonials.length;
  const items = Array.from({ length: Math.min(3, testimonials.length) }, (_, index) => {
    const personIndex = (activeIndex + index) % testimonials.length;
    return { person: testimonials[personIndex], personIndex };
  });
  const move = (step) => setActive((current) => (current + step + testimonials.length) % testimonials.length);
  return (
    <section className="testimonials-section section-pad" id="testimonials">
      <div className="container">
        <div className="section-heading split-heading testimonials-heading">
          <div data-reveal="left"><div className="eyebrow"><span className="eyebrow-line" /> <EditableText id="testimonials-kicker" value="Student stories" editMode={editMode} /></div><EditableText id="testimonials-title" value="A little encouragement goes a long way" editMode={editMode} as="h2" /></div>
          {testimonials.length > 3 && <div className="slider-controls"><button onClick={() => move(-1)} aria-label="Previous testimonials">‹</button><button onClick={() => move(1)} aria-label="Next testimonials">›</button></div>}
        </div>
        <div className="testimonial-grid">
          {items.map(({ person, personIndex }, index) => <article className="testimonial-card" data-reveal key={person.id || personIndex} style={{ transitionDelay: `${index * 85}ms` }}>
            <div className="quote-mark">“</div>
            <p>{person.quote}</p>
            <div className="testimonial-person">{person.image ? <img src={appUrl(person.image)} alt="" /> : <span className="testimonial-avatar">{person.name?.trim()?.charAt(0)?.toUpperCase() || '?'}</span>}<div><strong>{person.name}</strong><span>{person.course}</span></div><span className="quote-stars" aria-label="5 out of 5 stars">★★★★★</span></div>
          </article>)}
        </div>
        {testimonials.length > 3 && <div className="testimonial-dots">{testimonials.map((person, index) => <button key={person.id || index} aria-label={`Show testimonials starting with ${person.name}`} aria-pressed={activeIndex === index} className={activeIndex === index ? 'selected' : ''} onClick={() => setActive(index)} />)}</div>}
      </div>
    </section>
  );
}

function ContactSection({ editMode }) {
  return (
    <section className="contact-section" id="contact">
      <div className="container contact-panel" data-reveal>
        <div className="contact-copy">
          <div className="eyebrow eyebrow-light"><span className="eyebrow-line" /> <EditableText id="contact-kicker" value="Let’s talk about your future" editMode={editMode} /></div>
          <EditableText id="contact-title" value="Ready to take the next step?" editMode={editMode} as="h2" />
          <EditableText id="contact-text" value="Tell us what you want to study. Our counsellors will help you understand your options." editMode={editMode} as="p" />
          <span className="contact-phone"><EditableText id="company-phone-0" value={siteContent.company.phones[0]} editMode={editMode} /> · <EditableText id="company-email" value={siteContent.company.email} editMode={editMode} /></span>
        </div>
        <div className="contact-action">
          <a className="button button-light" href={appUrl('/contact-us/')}><EditableText id="contact-form-cta" value="Send an enquiry" editMode={editMode} /> <Icon name="arrow" size={16} /></a>
          <EditableText id="contact-action-note" value="We’re happy to help you get started." editMode={editMode} as="span" />
        </div>
        <div className="contact-decoration" aria-hidden="true">G</div>
      </div>
    </section>
  );
}

function Footer({ editMode }) {
  return (
    <footer className="site-footer">
      <div className="container footer-grid" data-reveal>
        <div className="footer-brand">
          <a href={appUrl('/')}><img src={appUrl('/images/logo.png')} alt="GEMS Group Services" /></a>
          <EditableText id="footer-description" value="An education consultancy in Birgunj, Nepal, supporting informed academic choices, admission guidance, and institutional engagement." editMode={editMode} as="p" />
        </div>
        <div className="footer-links"><h3><EditableText id="footer-explore-title" value="Explore" editMode={editMode} /></h3><a href={appUrl('/about-us/')}><EditableText id="footer-about-label" value="About us" editMode={editMode} /></a><a href={appUrl('/scholarships/')}><EditableText id="footer-services-label" value="Our services" editMode={editMode} /></a><a href={appUrl('/universities/')}><EditableText id="footer-universities-label" value="Study options" editMode={editMode} /></a><a href={appUrl('/blogs/')}><EditableText id="footer-guides-label" value="Student guides" editMode={editMode} /></a></div>
        <div className="footer-contact"><h3>Contact GEMS</h3><a href="tel:+9779802589183"><EditableText id="company-phone-0" value={siteContent.company.phones[0]} editMode={editMode} /></a><a href="tel:+9779705967555"><EditableText id="company-phone-1" value={siteContent.company.phones[1]} editMode={editMode} /></a><a href={`mailto:${siteContent.company.email}`}><EditableText id="company-email" value={siteContent.company.email} editMode={editMode} /></a><p><EditableText id="company-office" value={siteContent.company.office} editMode={editMode} /></p><a href="https://www.gemsgroup.edu.np" target="_blank" rel="noreferrer"><EditableText id="company-website" value={siteContent.company.website} editMode={editMode} /></a></div>
      </div>
      <div className="container footer-bottom"><EditableText id="footer-copyright" value="GEMS Group Services © 2026" editMode={editMode} as="span" /><a href={appUrl('/#home')}><EditableText id="footer-back-top" value="Back to top ↑" editMode={editMode} /></a><EditableText id="footer-tagline" value="Built for a bright next step." editMode={editMode} as="span" /></div>
    </footer>
  );
}

function App() {
  const editMode = false;

  const currentPath = appPath(window.location.pathname);
  const isCrmPath = currentPath.replace(/\/+$/, '') === '/crm';
  const [landingPage, setLandingPage] = useState(null);
  const [landingLoading, setLandingLoading] = useState(false);
  useEffect(() => {
    if (isCrmPath) return;
    loadPublicSiteContent();
    const match = currentPath.match(/^\/landing\/([^/]+)\/?$/);
    if (!match) { setLandingPage(null); setLandingLoading(false); return; }
    let active = true;
    setLandingLoading(true);
    fetchPublicLandingPage(decodeURIComponent(match[1]), new URLSearchParams(window.location.search).get('preview') === '1')
      .then((page) => { if (active) setLandingPage(page ? { ...page, preview: new URLSearchParams(window.location.search).get('preview') === '1' } : null); })
      .catch(() => { if (active) setLandingPage(null); })
      .finally(() => { if (active) setLandingLoading(false); });
    return () => { active = false; };
  }, [currentPath, isCrmPath]);
  useEffect(() => {
    if (isCrmPath || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const targets = Array.from(document.querySelectorAll('[data-reveal]'));
    if (!targets.length) return undefined;

    const pageRoot = document.documentElement;
    pageRoot.classList.add('motion-enabled');
    if (!('IntersectionObserver' in window)) {
      targets.forEach((target) => target.classList.add('is-visible'));
      return () => pageRoot.classList.remove('motion-enabled');
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -36px 0px' });
    const observeTargets = (elements) => elements.forEach((target) => {
      if (!(target instanceof Element) || !target.matches('[data-reveal]') || target.classList.contains('is-visible')) return;
      observer.observe(target);
    });
    observeTargets(targets);
    const additions = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        observeTargets([node, ...node.querySelectorAll('[data-reveal]')]);
      }));
    });
    additions.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      additions.disconnect();
      pageRoot.classList.remove('motion-enabled');
    };
  }, [currentPath, isCrmPath]);

  if (isCrmPath) {
    if (CRM) return <React.Suspense fallback={<main className="crm-unavailable">Loading…</main>}><CRM /></React.Suspense>;
    return <main className="crm-unavailable" role="status">Page not found.</main>;
  }
  if (currentPath.startsWith('/landing/')) {
    if (landingLoading) return <main className="crm-unavailable" role="status">Loading campaign…</main>;
    if (landingPage) return <LandingPageView page={landingPage} />;
    return <main className="crm-unavailable" role="status">This campaign page is not available.</main>;
  }
  const sitePage = resolveSitePage(currentPath);

  if (sitePage) return (
    <div className={`site ${editMode ? 'site-editing' : ''}`}>
      <Header editMode={editMode} />
      <SitePage page={sitePage} editMode={editMode} />
      <Footer editMode={editMode} />
    </div>
  );

  return (
    <div className={`site ${editMode ? 'site-editing' : ''}`}>
      <Header editMode={editMode} />
      <main>
        <BannerCarousel />
        <UniversityRail editMode={editMode} />
        <Hero editMode={editMode} />
        <HighlightCards editMode={editMode} />
        <IntroSection editMode={editMode} />
        <ServicesSection editMode={editMode} />
        <AchievementSection editMode={editMode} />
        <UniversitiesSection editMode={editMode} />
        <TestimonialsSection editMode={editMode} />
        <ContactSection editMode={editMode} />
      </main>
      <Footer editMode={editMode} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
