'use strict';
// تعريف بنية المشروع وتنقية كل ما يصل من المتصفح (أنواع وأطوال محددة).

const SECTION_KEYS = ['cover', 'about', 'services', 'strengths', 'projects', 'clients', 'certifications', 'contact'];
const TEMPLATES = ['formal', 'visual'];
const LANGS = ['ar', 'en'];

const str = (v, max = 500) => (typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, max) : '');
const arr = (v, max = 30) => (Array.isArray(v) ? v.slice(0, max) : []);
const color = (v, d) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : d);
const id = (v) => (typeof v === 'string' && /^[a-z0-9]{8,40}$/.test(v) ? v : null);
const lines = (v, maxItems, maxLen) => arr(v, maxItems).map((x) => str(x, maxLen)).filter(Boolean);

function sanitizeInput(raw = {}) {
  const c = raw.contact || {};
  return {
    companyName: str(raw.companyName, 120),
    companyNameEn: str(raw.companyNameEn, 120),
    activity: str(raw.activity, 300),
    foundedYear: /^\d{4}$/.test(String(raw.foundedYear || '').trim()) ? String(raw.foundedYear).trim() : '',
    cities: lines(raw.cities, 30, 60),
    about: str(raw.about, 6000),
    services: arr(raw.services, 25)
      .map((s) => ({ name: str(s && s.name, 120), desc: str(s && s.desc, 1200) }))
      .filter((s) => s.name || s.desc),
    strengths: lines(raw.strengths, 15, 400),
    projects: arr(raw.projects, 20)
      .map((p) => ({
        id: id(p && p.id) || require('crypto').randomBytes(6).toString('hex'),
        title: str(p && p.title, 160),
        client: str(p && p.client, 160),
        year: /^\d{4}$/.test(String((p && p.year) || '').trim()) ? String(p.year).trim() : '',
        desc: str(p && p.desc, 2500),
        images: arr(p && p.images, 6).map(id).filter(Boolean),
      }))
      .filter((p) => p.title || p.desc || p.images.length),
    clients: lines(raw.clients, 40, 120),
    certifications: lines(raw.certifications, 20, 200),
    contact: {
      phone: str(c.phone, 40),
      email: str(c.email, 120),
      website: str(c.website, 160),
      address: str(c.address, 300),
      social: str(c.social, 300),
    },
    logo: id(raw.logo),
    colors: { primary: color(raw.colors && raw.colors.primary, '#0f4c5c'), accent: color(raw.colors && raw.colors.accent, '#e09f3e') },
  };
}

function defaultSections() {
  return SECTION_KEYS.map((key) => ({ key, visible: true }));
}

function sanitizeDesign(raw = {}, input) {
  const seen = new Set();
  const sections = arr(raw.sections, 20)
    .filter((s) => s && SECTION_KEYS.includes(s.key) && !seen.has(s.key) && seen.add(s.key))
    .map((s) => ({ key: s.key, visible: s.visible !== false }));
  for (const key of SECTION_KEYS) if (!seen.has(key)) sections.push({ key, visible: true });
  // الغلاف دائمًا أولًا
  sections.sort((a, b) => (a.key === 'cover' ? -1 : b.key === 'cover' ? 1 : 0));
  return {
    template: TEMPLATES.includes(raw.template) ? raw.template : 'formal',
    primary: color(raw.primary, (input && input.colors.primary) || '#0f4c5c'),
    accent: color(raw.accent, (input && input.colors.accent) || '#e09f3e'),
    sections,
  };
}

// محتوى لغة واحدة (ما يولّده الذكاء الاصطناعي ويعدّله المستخدم)
function sanitizeContent(raw = {}) {
  const sec = (s, withItems, itemFn) => {
    const o = { heading: str(s && s.heading, 160) };
    if (withItems) o.items = arr(s && s.items, 40).map(itemFn).filter(Boolean);
    return o;
  };
  return {
    companyName: str(raw.companyName, 160),
    tagline: str(raw.tagline, 240),
    about: { heading: str(raw.about && raw.about.heading, 160), body: str(raw.about && raw.about.body, 9000) },
    services: sec(raw.services, true, (i) => {
      const o = { name: str(i && i.name, 160), description: str(i && i.description, 1500) };
      return o.name || o.description ? o : null;
    }),
    strengths: sec(raw.strengths, true, (i) => str(typeof i === 'string' ? i : i && i.text, 500) || null),
    projects: sec(raw.projects, true, (i) => {
      const ref = id(i && i.ref);
      if (!ref) return null;
      return { ref, title: str(i.title, 200), description: str(i.description, 3000) };
    }),
    clients: sec(raw.clients, false),
    certifications: sec(raw.certifications, false),
    contact: sec(raw.contact, false),
    labels: {
      founded: str(raw.labels && raw.labels.founded, 60),
      cities: str(raw.labels && raw.labels.cities, 60),
      client: str(raw.labels && raw.labels.client, 60),
      year: str(raw.labels && raw.labels.year, 60),
    },
    cities: lines(raw.cities, 30, 80),
    address: str(raw.address, 400),
  };
}

module.exports = { SECTION_KEYS, TEMPLATES, LANGS, sanitizeInput, sanitizeDesign, sanitizeContent, defaultSections, str };
