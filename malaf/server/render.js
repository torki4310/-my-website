'use strict';
// قوالب ثابتة لتنسيق صفحات الملف التعريفي. نفس HTML يُستخدم في المعاينة وفي تصدير PDF.
const { fontCss } = require('./fonts');

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// فقرات من نص المستخدم (سطر فارغ = فقرة جديدة، سطر واحد = فاصل سطر)
const paras = (text) =>
  String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const onColor = (hex) => (luminance(hex) > 0.45 ? '#16202a' : '#ffffff');

// لون أغمق للنصوص إن كان اللون الأساسي فاتحًا جدًا (لضمان التباين على الورق الأبيض)
function inkFor(hex) {
  if (luminance(hex) < 0.3) return hex;
  const f = 0.55;
  return '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * f).toString(16).padStart(2, '0')).join('');
}

const UI = {
  ar: { phone: 'الهاتف', email: 'البريد الإلكتروني', website: 'الموقع الإلكتروني', address: 'العنوان', social: 'حسابات التواصل', page: 'صفحة' },
  en: { phone: 'Phone', email: 'Email', website: 'Website', address: 'Address', social: 'Social media', page: 'Page' },
};

/**
 * @param {object} project المشروع كاملًا
 * @param {'ar'|'en'} lang
 * @param {object} opts { imageSrc(fileId) => string|null, fontMode: 'url'|'data', screen: bool }
 */
function renderProfile(project, lang, opts = {}) {
  const input = project.input;
  const content = project.content[lang];
  const design = project.design;
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const ui = UI[lang];
  const files = new Map((project.files || []).map((f) => [f.id, f]));
  const img = (fid, cls, alt) => {
    const f = files.get(fid);
    const src = f && opts.imageSrc ? opts.imageSrc(f) : null;
    if (!src) return '';
    return `<img class="${cls}" src="${esc(src)}" width="${f.width}" height="${f.height}" alt="${esc(alt || '')}" style="aspect-ratio:${f.width}/${f.height}">`;
  };

  const primary = design.primary;
  const accent = design.accent;
  const projectsById = new Map(input.projects.map((p) => [p.id, p]));
  const nameOf = content.companyName || input.companyName || '';

  const builders = {
    cover() {
      const logo = input.logo ? img(input.logo, 'cover-logo', nameOf) : '';
      const meta = [];
      if (input.foundedYear) meta.push(`<span>${esc(content.labels.founded)} <bdi>${esc(input.foundedYear)}</bdi></span>`);
      if (content.cities.length) meta.push(`<span>${esc(content.labels.cities)}: ${content.cities.map(esc).join(lang === 'ar' ? '، ' : ', ')}</span>`);
      const c = input.contact;
      const contacts = [c.phone, c.email, c.website].filter(Boolean).map((v) => `<bdi dir="ltr">${esc(v)}</bdi>`).join('<i class="dot"></i>');
      return `<section class="cover">
        <div class="cover-shape s1"></div><div class="cover-shape s2"></div>
        <div class="cover-inner">
          <div class="cover-logo-box ${logo ? '' : 'no-logo'}">${logo || `<span class="monogram">${esc(nameOf.trim().charAt(0))}</span>`}</div>
          <h1 class="cover-name">${esc(nameOf)}</h1>
          ${content.tagline ? `<p class="cover-tagline">${esc(content.tagline)}</p>` : ''}
          ${meta.length ? `<div class="cover-meta">${meta.join('')}</div>` : ''}
        </div>
        ${contacts ? `<div class="cover-foot">${contacts}</div>` : ''}
      </section>`;
    },
    about() {
      if (!content.about.body) return '';
      return section('about', content.about.heading, `<div class="prose lead">${paras(content.about.body)}</div>`);
    },
    services() {
      const items = content.services.items;
      if (!items.length) return '';
      return section(
        'services',
        content.services.heading,
        `<div class="services">${items
          .map((s, i) => `<article class="service"><div class="service-num">${String(i + 1).padStart(2, '0')}</div><div><h3>${esc(s.name)}</h3>${s.description ? paras(s.description) : ''}</div></article>`)
          .join('')}</div>`
      );
    },
    strengths() {
      const items = content.strengths.items;
      if (!items.length) return '';
      return section('strengths', content.strengths.heading, `<ul class="strengths">${items.map((s) => `<li><span class="tick"></span><span>${esc(s)}</span></li>`).join('')}</ul>`);
    },
    projects() {
      const items = content.projects.items.filter((p) => projectsById.has(p.ref));
      if (!items.length) return '';
      const html = items
        .map((it) => {
          const src = projectsById.get(it.ref);
          const meta = [];
          if (src.client) meta.push(`<span><b>${esc(content.labels.client)}:</b> ${esc(src.client)}</span>`);
          if (src.year) meta.push(`<span><b>${esc(content.labels.year)}:</b> <bdi>${esc(src.year)}</bdi></span>`);
          const gallery = galleryHtml(src.images, it.title);
          return `<article class="project">
            <header class="project-head"><h3>${esc(it.title || src.title)}</h3>${meta.length ? `<div class="project-meta">${meta.join('')}</div>` : ''}</header>
            ${it.description ? `<div class="prose">${paras(it.description)}</div>` : ''}
            ${gallery}
          </article>`;
        })
        .join('');
      return section('projects', content.projects.heading, `<div class="projects">${html}</div>`);
    },
    clients() {
      if (!input.clients.length) return '';
      return section('clients', content.clients.heading, `<ul class="chips">${input.clients.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`);
    },
    certifications() {
      if (!input.certifications.length) return '';
      return section('certifications', content.certifications.heading, `<ul class="certs">${input.certifications.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`);
    },
    contact() {
      const c = input.contact;
      const rows = [
        ['phone', c.phone, true],
        ['email', c.email, true],
        ['website', c.website, true],
        ['address', content.address || c.address, false],
        ['social', c.social, false],
      ].filter((r) => r[1]);
      if (!rows.length) return '';
      return section(
        'contact',
        content.contact.heading,
        `<div class="contact-card"><div class="contact-name">${esc(nameOf)}</div><dl class="contact">${rows
          .map(([k, v, ltr]) => `<div><dt>${esc(ui[k])}</dt><dd>${ltr ? `<bdi dir="ltr">${esc(v)}</bdi>` : esc(v).replace(/\n/g, '<br>')}</dd></div>`)
          .join('')}</dl></div>`
      );
    },
  };

  // صفوف متناسقة: صور كل صف بارتفاع واحد وعرض يتناسب مع نسبتها الأصلية (بلا قص ولا تشويه ولا فراغات)
  function galleryHtml(ids, alt) {
    const list = ids.map((id) => files.get(id)).filter((f) => f && opts.imageSrc && opts.imageSrc(f));
    if (!list.length) return '';
    const MAX_SUM = 3.2; // أقل ارتفاع للصف ≈ 176mm / 3.2 = 55mm
    const MAX_H = 80; // أقصى ارتفاع للصف بالمليمتر
    const rows = [];
    let row = [];
    let sum = 0;
    for (const f of list) {
      const r = f.width / f.height;
      if (row.length && (sum + r > MAX_SUM || row.length === 3)) {
        rows.push(row);
        row = [];
        sum = 0;
      }
      row.push(f);
      sum += r;
    }
    if (row.length) rows.push(row);
    return `<div class="gallery">${rows
      .map((r) => {
        const s = r.reduce((a, f) => a + f.width / f.height, 0);
        return `<div class="grow" style="max-width:${(MAX_H * s).toFixed(1)}mm">${r
          .map((f) => `<figure style="flex:${(f.width / f.height).toFixed(4)} 1 0">${img(f.id, 'proj-img', alt)}</figure>`)
          .join('')}</div>`;
      })
      .join('')}</div>`;
  }

  let n = 0;
  function section(key, heading, body) {
    n += 1;
    return `<section class="sec sec-${key}"><header class="sec-head"><span class="sec-num">${String(n).padStart(2, '0')}</span><h2>${esc(heading)}</h2></header>${body}</section>`;
  }

  const body = design.sections
    .filter((s) => s.visible && builders[s.key])
    .map((s) => builders[s.key]())
    .join('\n');

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(nameOf)}</title>
<style>
${fontCss(opts.fontMode || 'url')}
:root{--primary:${primary};--accent:${accent};--on-primary:${onColor(primary)};--on-accent:${onColor(accent)};--ink-primary:${inkFor(primary)};--ink-accent:${inkFor(accent)};}
${BASE_CSS}
${design.template === 'visual' ? VISUAL_CSS : FORMAL_CSS}
${opts.screen ? SCREEN_CSS : ''}
</style>
</head>
<body class="tpl-${design.template}">
<main class="doc">${body}</main>
</body>
</html>`;
}

const BASE_CSS = `
@page{size:A4;margin:18mm 17mm 20mm 17mm;}
@page cover{margin:0;}
*{box-sizing:border-box;}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
body{margin:0;font-family:'Profile Sans',sans-serif;font-variant-ligatures:no-common-ligatures no-discretionary-ligatures;color:#1d2733;font-size:10.5pt;line-height:1.75;background:#fff;}
h1,h2,h3{margin:0;line-height:1.35;font-weight:700;}
p{margin:0 0 .7em;}
p:last-child{margin-bottom:0;}
.doc{overflow-wrap:anywhere;word-break:normal;}
bdi{unicode-bidi:isolate;}
img{display:block;max-width:100%;height:auto;}
.cover{page:cover;break-after:page;position:relative;width:210mm;height:297mm;overflow:hidden;display:flex;flex-direction:column;}
.cover-inner{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;justify-content:center;padding:0 24mm;}
.cover-logo-box{display:flex;align-items:center;justify-content:flex-start;margin-bottom:12mm;}
.cover-logo{max-width:70mm;max-height:38mm;width:auto;height:auto;object-fit:contain;}
.monogram{display:inline-flex;align-items:center;justify-content:center;width:26mm;height:26mm;border-radius:6mm;font-size:30pt;font-weight:700;}
.cover-name{font-size:34pt;line-height:1.25;margin-bottom:5mm;}
.cover-tagline{font-size:14pt;line-height:1.6;max-width:150mm;margin:0;}
.cover-meta{display:flex;flex-wrap:wrap;gap:3mm 8mm;margin-top:10mm;font-size:10.5pt;}
.cover-foot{position:relative;z-index:2;padding:9mm 24mm;display:flex;flex-wrap:wrap;align-items:center;gap:2mm 5mm;font-size:10pt;}
.cover-foot .dot{display:inline-block;width:1.4mm;height:1.4mm;border-radius:50%;background:currentColor;opacity:.6;}
.sec{margin:0 0 11mm;}
.sec-head{display:flex;align-items:baseline;gap:4mm;margin-bottom:6mm;break-after:avoid;break-inside:avoid;}
.sec-head h2{font-size:19pt;color:var(--ink-primary);}
.sec-num{font-size:10pt;font-weight:700;color:var(--ink-accent);letter-spacing:.05em;}
.prose{text-align:start;}
.lead{font-size:11.5pt;line-height:1.9;}
.services{display:grid;grid-template-columns:1fr 1fr;gap:5mm;}
.service{display:flex;gap:4mm;break-inside:avoid;padding:5mm;border-radius:2.5mm;}
.service h3{font-size:12pt;margin-bottom:1.5mm;color:#14202b;}
.service p{font-size:10pt;line-height:1.7;color:#3b4855;}
.service-num{font-weight:700;font-size:11pt;color:var(--ink-accent);min-width:7mm;}
.strengths{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:4mm 8mm;}
.strengths li{display:flex;gap:3mm;align-items:flex-start;break-inside:avoid;}
.tick{flex:none;width:5mm;height:5mm;border-radius:50%;background:var(--accent);margin-top:1.2mm;position:relative;}
.tick::after{content:'';position:absolute;left:1.6mm;top:.9mm;width:1.3mm;height:2.4mm;border:solid var(--on-accent);border-width:0 .45mm .45mm 0;transform:rotate(45deg);}
.projects{display:flex;flex-direction:column;gap:9mm;}
.project-head{break-after:avoid;break-inside:avoid;margin-bottom:2.5mm;}
.project-head h3{font-size:13.5pt;color:#14202b;}
.project-meta{display:flex;flex-wrap:wrap;gap:1mm 6mm;font-size:9.5pt;color:#55626f;margin-top:1mm;}
.project-meta b{font-weight:600;color:#33404c;}
.gallery{display:flex;flex-direction:column;gap:3mm;margin-top:4mm;}
.grow{display:flex;gap:3mm;break-inside:avoid;width:100%;margin-inline:auto;}
.grow figure{margin:0;min-width:0;border-radius:2mm;overflow:hidden;}
.proj-img{width:100%;height:auto;}
.chips{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:3mm;}
.chips li{padding:2mm 5mm;border-radius:10mm;font-weight:600;font-size:10pt;break-inside:avoid;}
.certs{margin:0;padding-inline-start:5mm;}
.certs li{margin-bottom:2mm;break-inside:avoid;}
.contact-card{break-inside:avoid;border-radius:3mm;padding:8mm;}
.contact-name{font-size:15pt;font-weight:700;margin-bottom:5mm;}
.contact{display:grid;grid-template-columns:1fr 1fr;gap:5mm 8mm;margin:0;}
.contact dt{font-size:9pt;font-weight:600;opacity:.75;}
.contact dd{margin:0;font-size:11pt;font-weight:600;}
`;

const FORMAL_CSS = `
.cover{background:#fff;color:#14202b;border-inline-start:9mm solid var(--primary);}
.cover-shape.s1{position:absolute;inset-inline-end:0;top:0;width:62mm;height:62mm;background:var(--accent);opacity:.9;}
.cover-shape.s2{position:absolute;inset-inline-end:62mm;top:0;width:22mm;height:22mm;background:var(--primary);}
.monogram{background:var(--primary);color:var(--on-primary);}
.cover-name{color:var(--ink-primary);}
.cover-tagline{color:#3b4855;}
.cover-meta{color:#3b4855;border-top:.4mm solid #d9dee3;padding-top:5mm;}
.cover-foot{background:var(--primary);color:var(--on-primary);}
.sec-head{border-bottom:.5mm solid #e3e7eb;padding-bottom:3mm;}
.sec-head h2{position:relative;}
.service{background:#f6f7f9;border-inline-start:1mm solid var(--accent);border-radius:0 2mm 2mm 0;}
[dir=rtl] .service{border-radius:2mm 0 0 2mm;}
.chips li{border:.35mm solid #cfd6dd;color:#24313d;}
.contact-card{border:.4mm solid #dfe4e9;}
.contact-name{color:var(--ink-primary);}
`;

const VISUAL_CSS = `
.cover{background:var(--primary);color:var(--on-primary);}
.cover-shape{position:absolute;border-radius:50%;}
.cover-shape.s1{width:150mm;height:150mm;inset-inline-end:-55mm;top:-45mm;background:var(--accent);opacity:.95;}
.cover-shape.s2{width:90mm;height:90mm;inset-inline-start:-30mm;bottom:20mm;border:9mm solid var(--on-primary);opacity:.12;}
.cover-logo-box{background:#fff;border-radius:5mm;padding:6mm 8mm;align-self:flex-start;}
.cover-logo-box.no-logo{background:transparent;padding:0;}
.monogram{background:var(--accent);color:var(--on-accent);}
.cover-name{font-size:38pt;}
.cover-tagline{opacity:.92;}
.cover-meta{opacity:.9;}
.cover-foot{background:rgba(0,0,0,.18);}
.sec-head{gap:0;flex-direction:column;align-items:flex-start;}
.sec-num{display:inline-block;background:var(--accent);color:var(--on-accent);padding:.6mm 3mm;border-radius:10mm;margin-bottom:2mm;font-size:9pt;}
.sec-head h2{font-size:22pt;}
.sec-head h2::after{content:'';display:block;width:16mm;height:1.2mm;background:var(--accent);border-radius:1mm;margin-top:2.5mm;}
.sec-about{background:color-mix(in srgb,var(--primary) 7%,#fff);border-radius:4mm;padding:8mm;}
.service{background:#fff;border:.35mm solid #e4e8ec;border-top:1.5mm solid var(--primary);flex-direction:column;gap:2mm;}
.service-num{font-size:16pt;color:var(--ink-accent);}
.strengths li{background:color-mix(in srgb,var(--accent) 12%,#fff);padding:3.5mm 4mm;border-radius:2.5mm;}
.project{border-radius:3mm;}
.project-head h3{color:var(--ink-primary);font-size:14.5pt;}
.gallery figure{border-radius:3mm;}
.chips li{background:var(--primary);color:var(--on-primary);}
.contact-card{background:var(--primary);color:var(--on-primary);}
`;

// في المعاينة على الشاشة: صفحة بعرض A4 مع ظل، بدون تقسيم صفحات (التقسيم الدقيق في معاينة PDF)
const SCREEN_CSS = `
@media screen{
  html{background:#e9edf1;}
  body{width:210mm;margin:0 auto;box-shadow:0 2px 18px rgba(0,0,0,.12);}
  .doc>.sec{padding:0 17mm;}
  .doc>.sec:nth-child(2){padding-top:18mm;}
  .doc>.sec:last-child{padding-bottom:18mm;}
  .tpl-visual .doc>.sec-about{margin-inline:17mm;padding:8mm;}
}
`;

module.exports = { renderProfile, esc };
