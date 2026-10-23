import React, { useEffect, useState } from 'react';
import { siteContent } from './data/siteContent.js';
import { addLead } from './data/crmStore.js';
import { appUrl } from './data/siteUrl.js';
import { getSiteCopy, readSiteCollection, saveSiteCopy, subscribeToSiteCollections, subscribeToSiteCopy } from './data/siteCopy.js';

export const partners = [
  { slug: 'vit-university', name: 'VIT (Vellore Institute of Technology)', city: 'Vellore, Tamil Nadu', image: '/images/campus-vit.png', description: 'VIT is a multidisciplinary university with a strong focus on engineering, technology, science, and research. Our counsellors can guide students through course selection and the admissions process.', facts: ['Undergraduate, postgraduate, integrated, and research programs', 'Engineering, management, science, design, and humanities options', 'International collaborations and campus activities'] },
  { slug: 'srm-university', name: 'SRM Institute of Science and Technology', city: 'Chennai, Tamil Nadu', image: '/images/campus-srm.png', description: 'SRM offers a broad range of academic programs across engineering, management, medicine, science, humanities, law, and agricultural sciences.', facts: ['Programs across multiple faculties', 'Undergraduate and postgraduate study options', 'Student support and campus activities'] },
  { slug: 'jain-university', name: 'JAIN (Deemed-to-be University)', city: 'Bengaluru, Karnataka', image: '/images/campus-jain.png', description: 'JAIN University offers programs in business, management, humanities, science, technology, and other professional fields.', facts: ['Programs spanning business, technology, and humanities', 'Options for undergraduate and postgraduate students', 'A diverse student community in Bengaluru'] },
  { slug: 'srm-ap-university', name: 'SRM University-AP', city: 'Amaravati, Andhra Pradesh', image: '/images/campus-srm.png', description: 'SRM University-AP is a multidisciplinary, research-oriented university with an interdisciplinary curriculum and a growing research ecosystem.', facts: ['Engineering, management, liberal arts, and science faculties', 'Undergraduate, postgraduate, and research programs', 'Campus in Amaravati, Andhra Pradesh'] },
  { slug: 'symbiosis-university', name: 'Symbiosis International University', city: 'Pune, Maharashtra', image: '/images/campus-symbiosis.png', description: 'Symbiosis offers a wide range of programs in law, management, computing, engineering, media, humanities, health sciences, architecture, and design.', facts: ['Multi-campus university with varied academic options', 'Undergraduate and postgraduate programs', 'Popular choices include business, law, and technology'] },
  { slug: 'vignan-university', name: 'Vignan University', city: 'Guntur, Andhra Pradesh', image: '/images/campus-vignan.png', description: 'Vignan offers programs in science, technology, and research, with undergraduate and postgraduate study pathways.', facts: ['Science and technology programs', 'Research and practical learning opportunities', 'Located in Andhra Pradesh'] },
];

export const UNIVERSITY_PROFILE_COLLECTION = 'university-profiles';

export function getUniversityProfiles() {
  return readSiteCollection(UNIVERSITY_PROFILE_COLLECTION, partners);
}

export const articles = [
  { slug: 'top-6-universities-for-nepalese-students-in-india', title: 'Top 6 Universities for Nepalese Students in India', date: 'March 30, 2022', excerpt: 'A guide to universities students often consider when comparing programs, campus life, and future opportunities in India.', paragraphs: ['India offers students a wide choice of universities and academic programs. Choosing a university is easier when students compare their subject interests, admission requirements, location, and the kind of support they want during their studies.', 'The original article introduces VIT, SRM, JAIN, Symbiosis, PDEU, and Vignan as options for Nepalese students. Each institution has a different mix of faculties and programs, so students should review current course details with the university before applying.', 'Our counsellors can help students compare options and understand the application steps for their chosen course.'] },
  { slug: 'the-role-and-importance-of-education-consultancy', title: 'What Are the Role and Importance of Education Consultancy?', date: 'February 2022', excerpt: 'How informed guidance can help students plan university applications and make confident choices.', paragraphs: ['Education counsellors help students think through course choices, entry requirements, university options, and the steps involved in applying.', 'A useful consultation gives students and families a clearer view of the documents, timelines, and choices involved. Students should compare advice with current information published by their chosen institution.', 'Our team provides guidance for students considering higher education in India and nearby destinations.'] },
  { slug: 'things-nepalese-students-must-know-before-contacting-a-study-consultancy', title: 'Things Nepalese Students Must Know Before Contacting a Study Consultancy', date: '2022', excerpt: 'A practical checklist for preparing questions and comparing information before a counselling conversation.', paragraphs: ['Before meeting a study counsellor, students can prepare by listing their academic interests, preferred locations, grades, and questions about fees, documents, and career options.', 'Ask how a university is affiliated with the consultancy, what support is included, and which details should be confirmed directly with the institution.', 'Being prepared helps students and families make the most of a counselling session and compare options with confidence.'] },
  { slug: 'amazing-scholarships-for-nepalese-students-in-india', title: 'Amazing Scholarships for Nepalese Students in India', date: '2022', excerpt: 'An introduction to scholarship and funding questions students can explore while planning higher education.', paragraphs: ['Scholarship availability and eligibility can vary by institution, program, and intake. Students should verify current criteria and deadlines with the university and the scholarship provider.', 'The original article discusses funding routes that may be relevant to Nepalese students, including government-supported opportunities. A counsellor can help students identify the right questions to ask before applying.', 'Prepare academic records and confirm the current application requirements before making a financial plan.'] },
  { slug: 'how-to-get-a-no-objection-letter-in-nepal', title: 'How to Get a No Objection Letter in Nepal', date: '2022', excerpt: 'A general overview of the NOC process students may need to review when planning to study abroad.', paragraphs: ['Students planning to study abroad may need to apply for a No Objection Certificate through the relevant government process. Requirements and procedures can change, so check the latest instructions from the responsible ministry before applying.', 'Keep your university offer and supporting documents ready, and confirm whether your chosen program has any additional professional registration requirements.', 'Our counsellors can help students prepare questions about the study process and next steps.'] },
  { slug: 'careers-for-nepalese-students-after-12th', title: 'Careers for Nepalese Students After 12th', date: '2022', excerpt: 'Explore how subject interests, entry requirements, and course choices can shape a student’s next steps after secondary school.', paragraphs: ['Students finishing Grade 12 can compare a wide range of undergraduate pathways. The right choice depends on interests, grades, entry requirements, and long-term career goals.', 'Some programs may require specific subjects, minimum grades, or entrance examinations. Check the current requirements with the university before applying.', 'A counsellor can help students map their interests to suitable programs and prepare an application plan.'] },
  { slug: 'highest-paying-job-in-nepal-2023', title: 'Best 7 Highest-Paying Jobs in Nepal (2023)', date: '2023', excerpt: 'A career-planning guide for students weighing study choices against their long-term interests and opportunities.', paragraphs: ['Career opportunities depend on a person’s skills, qualifications, experience, and the needs of the job market. Students should choose a field that fits their interests and strengths, while researching the study pathways it requires.', 'Before choosing a program, compare course content, practical experience, professional requirements, and the kinds of roles graduates may pursue.', 'Education counsellors can help students explore study options. For current labour-market details, consult recent and authoritative employment sources.'] },
];

export function resolveSitePage(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/about-us') return { type: 'about' };
  if (path === '/contact-us') return { type: 'contact' };
  if (path === '/universities') return { type: 'universities' };
  if (path === '/scholarships') return { type: 'scholarships' };
  if (path === '/blogs' || path === '/news-and-events') return { type: 'articles' };
  const university = getUniversityProfiles().find((item) => `/${item.slug}` === path);
  if (university) return { type: 'university', item: university };
  const article = articles.find((item) => `/${item.slug}` === path);
  if (article) return { type: 'article', item: article };
  return null;
}

function Editable({ id, text, editMode, as: Tag = 'p', className = '' }) {
  const [value, setValue] = useState(() => getSiteCopy(id, text));
  React.useEffect(() => {
    setValue(getSiteCopy(id, text));
    return subscribeToSiteCopy(({ id: changedId, value: changedValue }) => {
      if (changedId === id) setValue(changedValue ?? text);
    });
  }, [id, text]);
  return <Tag className={className} contentEditable={editMode} suppressContentEditableWarning spellCheck={editMode} onBlur={editMode ? (event) => {
    const next = event.currentTarget.innerText.trim();
    if (next) { saveSiteCopy(id, next); setValue(next); }
    else event.currentTarget.innerText = value;
  } : undefined}>{value}</Tag>;
}

function PageBanner({ eyebrow = 'GEMS GROUP SERVICES · STUDENT SUPPORT', eyebrowId = null, title, titleId = null, summary, summaryId = null, editMode, id }) {
  return <section className="content-hero"><div className="container content-hero-inner"><div className="eyebrow eyebrow-light"><span className="eyebrow-line" /><Editable id={eyebrowId || `${id}-eyebrow`} text={eyebrow} editMode={editMode} as="span" /></div><Editable id={titleId || `${id}-title`} text={title} editMode={editMode} as="h1" /><Editable id={summaryId || `${id}-summary`} text={summary} editMode={editMode} as="p" /><div className="content-hero-mark" aria-hidden="true">G</div></div></section>;
}

function LeadCapture() {
  const [sent, setSent] = useState(false);
  function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const extra = [`Question: ${data.get('question')}`, `Preferred destination: ${data.get('destination')}`].join('\n');
    addLead({ name: String(data.get('name') || ''), email: String(data.get('email') || ''), phone: String(data.get('phone') || ''), faculty: String(data.get('question') || 'Consultation'), source: 'Website contact form', notes: extra });
    setSent(true);
    form.reset();
  }
  return <form className="contact-lead-form" onSubmit={submit}>
    <span className="eyebrow"><Editable id="contact-form-eyebrow" text="REQUEST A CONSULTATION" editMode={false} as="span" /></span>
    <Editable id="contact-form-title" text="Send us a message" editMode={false} as="h2" />
    <Editable id="contact-form-summary" text="Share what you are looking for and our team will get back to you." editMode={false} />
    <div className="contact-form-grid">
      <label><Editable id="contact-form-label-name" text="Your name" editMode={false} as="span" /><input name="name" autoComplete="name" required /></label>
      <label><Editable id="contact-form-label-email" text="Email address" editMode={false} as="span" /><input name="email" type="email" autoComplete="email" required /></label>
      <label><Editable id="contact-form-label-phone" text="Phone number" editMode={false} as="span" /><input name="phone" type="tel" autoComplete="tel" required /></label>
      <label><Editable id="contact-form-label-question" text="Your question" editMode={false} as="span" /><select name="question">{['Academic counselling', 'Course and institution selection', 'Admission application guidance', 'Scholarship information', 'Other'].map((label, index) => <option key={label}>{getSiteCopy(`contact-question-option-${index}`, label)}</option>)}</select></label>
      <label><Editable id="contact-form-label-destination" text="Study plans" editMode={false} as="span" /><select name="destination">{['Higher education options', 'Still exploring'].map((label, index) => <option key={label}>{getSiteCopy(`contact-destination-option-${index}`, label)}</option>)}</select></label>
    </div>
    <button className="button button-primary" type="submit"><Editable id="contact-form-submit" text="Send enquiry" editMode={false} as="span" /> <span aria-hidden="true">→</span></button>
    {sent && <p className="form-success" role="status"><Editable id="contact-form-success" text="Thank you. Your enquiry has been received." editMode={false} as="span" /></p>}
  </form>;
}

function PartnerGrid({ editMode }) {
  const [universities, setUniversities] = useState(() => getUniversityProfiles());
  useEffect(() => subscribeToSiteCollections(({ id, value }) => {
    if (id === UNIVERSITY_PROFILE_COLLECTION) setUniversities(value ?? partners);
  }), []);
  return <div className="content-card-grid partner-grid">{universities.map((item, index) => <a className="content-card partner-card" href={appUrl(`/${item.slug}/`)} key={item.id || item.slug || index}>{item.image && <img src={appUrl(item.image)} alt={`${item.name} logo`} />}<span className="content-card-kicker">{item.city}</span><h3>{item.name}</h3><span className="content-card-link"><Editable id="partner-card-link" text="Explore university" editMode={editMode} as="span" /> <span aria-hidden="true">↗</span></span></a>)}</div>;
}

function UniversityProfilePage({ profile, editMode }) {
  const [profiles, setProfiles] = useState(() => getUniversityProfiles());
  useEffect(() => subscribeToSiteCollections(({ id, value }) => {
    if (id === UNIVERSITY_PROFILE_COLLECTION) setProfiles(value ?? partners);
  }), []);
  const item = profiles.find((profileItem) => profileItem.slug === profile.slug);
  if (!item) return <main className="content-page"><PageBanner id="university-profile-missing" title="Profile not found" summary="This university profile may have been removed." editMode={editMode} /><section className="container content-section"><a className="button button-primary" href={appUrl('/universities/')}>Browse universities</a></section></main>;

  const facts = Array.isArray(item.facts) ? item.facts : [];
  const otherProfiles = profiles.filter((profileItem) => profileItem.slug !== item.slug);
  return <main className="content-page"><PageBanner id={`university-profile-${item.slug}`} eyebrow={`INSTITUTION PROFILE · ${String(item.city || '').toUpperCase()}`} title={item.name} summary={item.description} editMode={editMode} /><section className="container content-section university-detail"><div className="university-detail-main">{item.image && <img className="university-detail-logo" src={appUrl(item.image)} alt={`${item.name} logo`} />}<span className="eyebrow"><Editable id="university-profile-options-label" text="STUDY OPTIONS" editMode={editMode} as="span" /></span><Editable id="university-profile-programs-heading" text="Find a program that suits your goals" editMode={editMode} as="h2" /><Editable id="university-profile-programs-intro" text="Confirm current program and admission details through the institution’s official channels. Formal GEMS representation or partnership requires a separate written agreement." editMode={editMode} />{facts.length > 0 && <ul>{facts.map((fact, index) => <li key={`${item.slug}-fact-${index}`}>{fact}</li>)}</ul>}<a className="button button-primary" href={appUrl('/contact-us/')}><Editable id="university-profile-cta" text="Ask about this university" editMode={editMode} as="span" /> <span aria-hidden="true">→</span></a></div><aside className="university-detail-aside"><span className="eyebrow"><Editable id="university-profile-aside-label" text="MORE STUDY OPTIONS" editMode={editMode} as="span" /></span><Editable id="university-profile-aside-title" text="Continue exploring" editMode={editMode} as="h3" />{otherProfiles.map((profileItem) => <a href={appUrl(`/${profileItem.slug}/`)} key={profileItem.slug}>{profileItem.name}<span aria-hidden="true">↗</span></a>)}</aside></section></main>;
}

function ArticleGrid({ editMode }) {
  return <div className="content-card-grid article-grid">{articles.map((item) => <a className="content-card article-card" href={appUrl(`/${item.slug}/`)} key={item.slug}><span className="content-card-kicker"><Editable id={`article-${item.slug}-date`} text={item.date} editMode={editMode} as="span" /> · <Editable id="article-card-category" text="Student guide" editMode={editMode} as="span" /></span><Editable id={`article-${item.slug}-title`} text={item.title} editMode={editMode} as="h3" /><Editable id={`article-${item.slug}-excerpt`} text={item.excerpt} editMode={editMode} /><span className="content-card-link"><Editable id="article-card-link" text="Read article" editMode={editMode} as="span" /> <span aria-hidden="true">↗</span></span></a>)}</div>;
}

function SimpleCards({ items, editMode, id = 'support', category = 'STUDENT SUPPORT' }) {
  return <div className="content-card-grid simple-card-grid">{items.map((item, index) => <article className="content-card simple-card" key={item.title}><span className="content-card-kicker"><Editable id={`${id}-${index}-number`} text={`0${index + 1}`} editMode={editMode} as="span" /> · <Editable id={`${id}-${index}-category`} text={category} editMode={editMode} as="span" /></span><Editable id={`${id}-${index}-title`} text={item.title} editMode={editMode} as="h3" /><Editable id={`${id}-${index}-text`} text={item.text} editMode={editMode} /></article>)}</div>;
}

export default function SitePage({ page, editMode }) {
  if (page.type === 'about') return <main className="content-page">
    <PageBanner id="about" editMode={editMode} eyebrow="ABOUT GEMS GROUP SERVICES" title="Your study journey, guided with care" summary="GEMS Group Services is an education consultancy based in Birgunj, Nepal, supporting students and families as they explore higher-education options and admission pathways." />
    <section className="container content-section content-about">
      <div className="content-section-intro"><span className="eyebrow"><Editable id="about-story-eyebrow" text="OUR APPROACH" editMode={editMode} as="span" /></span><Editable id="about-story-title" text="Clear guidance, personalized to your goals" editMode={editMode} as="h2" /><Editable id="about-story-copy" text="We help students understand course choices, institutional requirements, eligibility criteria, application steps, and scholarship information. Our work is built around clear communication, student-focused guidance, and organized follow-up." editMode={editMode} /></div>
      <SimpleCards id="about-support" editMode={editMode} items={siteContent.services.map(({ title, text }) => ({ title, text }))} />
    </section>
    <section className="container content-section company-principles">
      <div className="company-principles-copy"><span className="eyebrow"><Editable id="company-vision-label" text="OUR VISION" editMode={editMode} as="span" /></span><Editable id="company-vision" text={siteContent.company.vision} editMode={editMode} as="h2" /></div>
      <div className="company-principles-copy"><span className="eyebrow"><Editable id="company-mission-label" text="OUR MISSION" editMode={editMode} as="span" /></span><Editable id="company-mission" text={siteContent.company.mission} editMode={editMode} /></div>
      <div className="company-values"><span className="eyebrow"><Editable id="company-values-label" text="OUR VALUES" editMode={editMode} as="span" /></span><SimpleCards id="company-value" category="GEMS VALUES" editMode={editMode} items={siteContent.company.values} /></div>
    </section>
    <section className="content-cta"><div className="container content-cta-inner"><div><span className="eyebrow eyebrow-light"><Editable id="about-cta-eyebrow" text="LET’S TALK" editMode={editMode} as="span" /></span><Editable id="about-cta-title" text="Tell us what you want to study." editMode={editMode} as="h2" /><Editable id="about-cta-text" text="We’ll help you understand the options available for your goals." editMode={editMode} /></div><a className="button button-light" href={appUrl('/contact-us/')}><Editable id="about-cta-button" text="Talk to a counsellor" editMode={editMode} as="span" /> <span aria-hidden="true">→</span></a></div></section>
  </main>;

  if (page.type === 'contact') {
    return <main className="content-page"><PageBanner id="contact-page" eyebrowId="contact-page-eyebrow" titleId="contact-page-title" summaryId="contact-page-summary" eyebrow="CONTACT GEMS GROUP SERVICES" title="We’d be happy to hear from you" summary="Talk with our team about courses, higher-education options, admission steps, or your study plans." editMode={editMode} /><section className="container content-section contact-page-grid"><div className="contact-welcome"><span className="eyebrow"><Editable id="contact-team-eyebrow" text="STUDENT SUPPORT" editMode={editMode} as="span" /></span><Editable id="contact-team-title" text="Tell us about your study plans" editMode={editMode} as="h2" /><Editable id="contact-team-copy" text="Share a few details in the enquiry form or contact our Birgunj office directly. Our team can help with academic guidance, application steps, and scholarship information." editMode={editMode} /><div className="company-contact-card"><h3>GEMS Group Services</h3><dl><dt>Office</dt><dd><Editable id="company-office" text={siteContent.company.office} editMode={editMode} /></dd><dt>Phone</dt><dd><a href="tel:+9779802589183"><Editable id="company-phone-0" text={siteContent.company.phones[0]} editMode={editMode} /></a><br /><a href="tel:+9779705967555"><Editable id="company-phone-1" text={siteContent.company.phones[1]} editMode={editMode} /></a></dd><dt>Email</dt><dd><a href={`mailto:${siteContent.company.email}`}><Editable id="company-email" text={siteContent.company.email} editMode={editMode} /></a></dd><dt>Website</dt><dd><a href="https://www.gemsgroup.edu.np" target="_blank" rel="noreferrer"><Editable id="company-website" text={siteContent.company.website} editMode={editMode} /></a></dd></dl></div></div><LeadCapture /></section></main>;
  }

  if (page.type === 'universities') return <main className="content-page"><PageBanner id="university-list" eyebrowId="university-list-eyebrow" titleId="university-list-title" summaryId="university-list-summary" eyebrow="INSTITUTION PROFILES" title="Explore study options" summary="Review institution profiles and compare study paths. Program availability, eligibility, and admission decisions are determined by each institution." editMode={editMode} /><section className="container content-section"><div className="content-section-heading"><span className="eyebrow"><Editable id="universities-section-eyebrow" text="CHOOSE YOUR NEXT CHAPTER" editMode={editMode} as="span" /></span><Editable id="universities-heading" text="Institutions to explore" editMode={editMode} as="h2" /><Editable id="universities-intro" text="Profiles are for information and comparison. Formal representation or partnership is confirmed only through a separate written agreement." editMode={editMode} /></div><PartnerGrid editMode={editMode} /></section></main>;

  if (page.type === 'university') return <UniversityProfilePage profile={page.item} editMode={editMode} />;

  if (page.type === 'scholarships') return <main className="content-page"><PageBanner id="scholarships" editMode={editMode} eyebrow="SCHOLARSHIPS & FUNDING" title="Explore ways to fund your studies" summary="Funding opportunities depend on the university, course, and intake. Ask our counsellors what to verify as you plan." /><section className="container content-section"><div className="content-section-intro"><span className="eyebrow"><Editable id="scholarships-section-eyebrow" text="PLAN AHEAD" editMode={editMode} as="span" /></span><Editable id="scholarships-heading" text="Questions to ask about funding" editMode={editMode} as="h2" /><Editable id="scholarships-intro" text="Scholarship rules and deadlines change. Confirm current eligibility with the university or funding provider before making an application or financial decision." editMode={editMode} /></div><SimpleCards id="scholarship-questions" category="FUNDING CHECKLIST" editMode={editMode} items={[{ title: 'Check eligibility', text: 'Review academic criteria, citizenship rules, course restrictions, and the documents required for each opportunity.' }, { title: 'Confirm dates', text: 'Ask when applications open and close, when decisions are announced, and whether the award continues each year.' }, { title: 'Understand costs', text: 'Compare tuition, accommodation, travel, and other expenses alongside any confirmed scholarship amount.' }]} /></section><section className="content-cta"><div className="container content-cta-inner"><div><span className="eyebrow eyebrow-light"><Editable id="scholarships-cta-eyebrow" text="GET PERSONAL GUIDANCE" editMode={editMode} as="span" /></span><Editable id="scholarships-cta-title" text="Discuss your study plan with us." editMode={editMode} as="h2" /><Editable id="scholarships-cta-text" text="We can help you prepare questions and compare your next steps." editMode={editMode} as="p" /></div><a className="button button-light" href={appUrl('/contact-us/')}><Editable id="scholarships-cta-button" text="Contact a counsellor" editMode={editMode} as="span" /> <span aria-hidden="true">→</span></a></div></section></main>;

  if (page.type === 'articles') return <main className="content-page"><PageBanner id="articles" editMode={editMode} eyebrow="NEWS, EVENTS & STUDENT GUIDES" title="Ideas for your next step" summary="Read practical guides for students exploring courses, universities, scholarships, and study abroad." /><section className="container content-section"><div className="content-section-heading"><span className="eyebrow"><Editable id="articles-section-eyebrow" text="FROM THE BLOG" editMode={editMode} as="span" /></span><Editable id="articles-heading" text="Latest student guides" editMode={editMode} as="h2" /><Editable id="articles-intro" text="These articles are recreated from the pages currently indexed for the original website." editMode={editMode} /></div><ArticleGrid editMode={editMode} /></section></main>;

  if (page.type === 'article') return <main className="content-page"><PageBanner id={page.item.slug} editMode={editMode} eyebrow={`STUDENT GUIDE · ${page.item.date.toUpperCase()}`} title={page.item.title} summary={page.item.excerpt} /><article className="container content-section article-detail"><div className="article-body">{page.item.paragraphs.map((paragraph, index) => <Editable id={`article-${page.item.slug}-paragraph-${index}`} text={paragraph} editMode={editMode} key={index} />)}<div className="article-callout"><span className="eyebrow"><Editable id="article-cta-eyebrow" text="NEED PERSONAL GUIDANCE?" editMode={editMode} as="span" /></span><Editable id={`article-${page.item.slug}-cta`} text="Talk through your options with a counsellor." editMode={editMode} as="h2" /><a className="button button-primary" href={appUrl('/contact-us/')}><Editable id="article-cta-button" text="Request a consultation" editMode={editMode} as="span" /> <span aria-hidden="true">→</span></a></div></div><aside className="article-sidebar"><span className="eyebrow"><Editable id="article-sidebar-label" text="EXPLORE MORE" editMode={editMode} as="span" /></span><a href={appUrl('/universities/')}><Editable id="article-sidebar-universities" text="Study options" editMode={editMode} as="span" /> <span aria-hidden="true">↗</span></a><a href={appUrl('/scholarships/')}><Editable id="article-sidebar-scholarships" text="Scholarships and funding" editMode={editMode} as="span" /> <span aria-hidden="true">↗</span></a><a href={appUrl('/blogs/')}><Editable id="article-sidebar-guides" text="All student guides" editMode={editMode} as="span" /> <span aria-hidden="true">↗</span></a></aside></article></main>;

  return <main className="content-page"><PageBanner id="not-found" editMode={editMode} title="Page not found" summary="Explore GEMS Group Services study guidance and university options." /><section className="container content-section"><PartnerGrid editMode={editMode} /></section></main>;
}
