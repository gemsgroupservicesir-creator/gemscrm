import { randomBytes } from 'node:crypto';

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function text(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function safeAnswers(answers) {
  if (!Array.isArray(answers)) return [];
  return answers.slice(0, 50).map((answer) => ({
    id: text(answer?.id, 100),
    label: text(answer?.label, 120),
    value: text(answer?.value, 1000),
  })).filter((answer) => answer.label && answer.value);
}

function safeNotes(notes) {
  if (!Array.isArray(notes)) return [];
  return notes.slice(-100).map((note) => ({
    id: text(note?.id, 100),
    body: text(note?.body, 6000),
    createdAt: text(note?.createdAt, 64),
  })).filter((note) => note.body);
}

function safeImage(value) {
  const image = typeof value === 'string' ? value : '';
  if (image.length >= 750_000) fail(413, 'The uploaded student image is too large after processing. Try a smaller image.');
  if (image && !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(image)) {
    fail(400, 'Please upload an image using the form’s image picker.');
  }
  return image;
}

export function validLead(input, defaults = {}) {
  const value = input && typeof input === 'object' ? input : {};
  const name = text(value.name, 120);
  const email = text(value.email, 254);
  const phone = text(value.phone, 50);
  if (!name || (!email && !phone)) fail(400, 'Enter the student name and an email address or phone number.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
  const rawDate = value.createdAt ? new Date(value.createdAt) : new Date();
  const createdAt = Number.isNaN(rawDate.getTime()) ? new Date().toISOString() : rawDate.toISOString();
  return {
    id: text(value.id, 100) || randomBytes(16).toString('hex'),
    name, email, phone,
    faculty: text(value.faculty || value.course, 160),
    course: text(value.course || value.faculty, 160),
    university: text(value.university, 180),
    image: safeImage(value.image),
    source: text(value.source || defaults.source || 'Website enquiry', 200),
    notes: text(value.notes, 6000),
    noteHistory: safeNotes(value.noteHistory),
    formAnswers: safeAnswers(value.formAnswers),
    assignedCounselorId: text(defaults.assignedCounselorId ?? value.assignedCounselorId, 100),
    status: ['New', 'Contacted', 'Follow-up', 'Application', 'Enrolled', 'Closed'].includes(value.status) ? value.status : 'New',
    createdAt,
  };
}

export function createPublicLead(body, defaults) {
  const lead = validLead({
    name: body.name,
    email: body.email,
    phone: body.phone,
    faculty: body.faculty,
    course: body.course,
    university: body.university,
    image: body.image,
    formAnswers: body.formAnswers,
  }, defaults);
  lead.id = randomBytes(16).toString('hex');
  lead.status = 'New';
  lead.createdAt = new Date().toISOString();
  return lead;
}
