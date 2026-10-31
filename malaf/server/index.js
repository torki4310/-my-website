'use strict';
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const { imageSize } = require('image-size');

const config = require('./config');
const { identify } = require('./auth');
const store = require('./store');
const ai = require('./ai');
const { sanitizeInput, sanitizeDesign, sanitizeContent, defaultSections, SECTION_KEYS, LANGS } = require('./schema');
const { renderProfile } = require('./render');
const { buildPdf } = require('./pdf');
const { limiter, ipLimiter } = require('./limits');
const { FONT_DIR } = require('./fonts');
const sample = require('./sample');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'",
  });
  next();
});

app.use('/fonts', express.static(FONT_DIR, { maxAge: '30d', immutable: true }));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

const api = express.Router();
app.use('/api', ipLimiter(600, 60000), cookieParser(), identify, express.json({ limit: '1mb' }), api);

// حماية من CSRF: الطلبات المعدِّلة يجب أن تأتي من واجهتنا (ترويسة مخصصة لا تستطيع النماذج الخارجية إرسالها)
api.use((req, res, next) => {
  if (['GET', 'HEAD'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'malaf') return res.status(403).json({ error: 'forbidden', message: 'طلب غير مسموح' });
  next();
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const publicProject = (p) => {
  const { ownerId, ...rest } = p;
  return rest;
};

async function loadProject(req, res, next) {
  const p = await store.getProject(req.uid, req.params.id);
  if (!p) return res.status(404).json({ error: 'not_found', message: 'المشروع غير موجود' });
  req.project = p;
  next();
}

api.get('/me', (req, res) => {
  res.json({
    aiEnabled: config.aiEnabled,
    mode: config.aiEnabled ? 'ai' : 'demo',
    limits: { maxFileMB: config.limits.maxFileBytes / 1048576, maxFilesPerProject: config.limits.maxFilesPerProject, genPerHour: config.limits.genPerHour, maxProjects: config.limits.maxProjectsPerUser },
  });
});

api.get('/projects', wrap(async (req, res) => res.json(await store.listProjects(req.uid))));

api.post(
  '/projects',
  limiter('create', [[30, 3600000]]),
  wrap(async (req, res) => {
    const list = await store.listProjects(req.uid);
    if (list.length >= config.limits.maxProjectsPerUser) return res.status(400).json({ error: 'limit', message: `الحد الأقصى ${config.limits.maxProjectsPerUser} مشروعًا. احذف مشروعًا قديمًا أولًا.` });
    const input = sanitizeInput(req.body && req.body.input);
    const now = new Date().toISOString();
    const project = {
      id: store.newId(8),
      ownerId: req.uid,
      createdAt: now,
      input,
      languages: ['ar'],
      content: {},
      meta: {},
      design: sanitizeDesign({ sections: defaultSections() }, input),
      files: [],
    };
    await store.saveProject(req.uid, project);
    res.status(201).json(publicProject(project));
  })
);

api.get('/projects/:id', wrap(loadProject), (req, res) => res.json(publicProject(req.project)));

api.put(
  '/projects/:id',
  wrap(loadProject),
  wrap(async (req, res) => {
    const p = req.project;
    const b = req.body || {};
    if (b.input) {
      const before = JSON.stringify(p.input);
      p.input = sanitizeInput(b.input);
      const known = new Set(p.files.map((f) => f.id));
      if (p.input.logo && !known.has(p.input.logo)) p.input.logo = null;
      for (const pr of p.input.projects) pr.images = pr.images.filter((x) => known.has(x));
      if (JSON.stringify(p.input) !== before) p.inputUpdatedAt = new Date().toISOString();
    }
    if (Array.isArray(b.languages)) {
      const langs = LANGS.filter((l) => b.languages.includes(l));
      if (langs.length) p.languages = langs;
    }
    if (b.design) p.design = sanitizeDesign(b.design, p.input);
    if (b.content && typeof b.content === 'object') {
      for (const l of LANGS) {
        if (b.content[l] && p.content[l]) {
          const c = sanitizeContent(b.content[l]);
          // المشاريع تبقى مرتبطة بمشاريع المستخدم فقط
          const ids = new Set(p.input.projects.map((x) => x.id));
          c.projects.items = c.projects.items.filter((i) => ids.has(i.ref));
          p.content[l] = c;
        }
      }
    }
    await cleanupFiles(p);
    await store.saveProject(req.uid, p);
    res.json(publicProject(p));
  })
);

api.delete(
  '/projects/:id',
  wrap(async (req, res) => {
    const ok = await store.deleteProject(req.uid, req.params.id);
    if (!ok) return res.status(404).json({ error: 'not_found', message: 'المشروع غير موجود' });
    res.json({ ok: true });
  })
);

// ---------- الملفات ----------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.limits.maxFileBytes, files: 1, fields: 5 } });
const TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

api.post(
  '/projects/:id/files',
  limiter('upload', [[120, 3600000]]),
  wrap(loadProject),
  (req, res, next) =>
    upload.single('file')(req, res, (err) => {
      if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'too_large', message: `حجم الملف يتجاوز ${config.limits.maxFileBytes / 1048576} ميغابايت` });
      if (err) return res.status(400).json({ error: 'upload', message: 'تعذر رفع الملف' });
      next();
    }),
  wrap(async (req, res) => {
    const p = req.project;
    if (!req.file) return res.status(400).json({ error: 'no_file', message: 'لم يُرسل ملف' });
    if (p.files.length >= config.limits.maxFilesPerProject) return res.status(400).json({ error: 'limit', message: `الحد الأقصى ${config.limits.maxFilesPerProject} صورة لكل مشروع` });
    let info;
    try {
      info = imageSize(req.file.buffer); // يتحقق من محتوى الملف الفعلي لا من امتداده
    } catch {
      info = null;
    }
    const ext = info && { png: 'png', jpg: 'jpg', webp: 'webp' }[info.type];
    if (!ext) return res.status(415).json({ error: 'type', message: 'الصيغ المقبولة: PNG أو JPG أو WebP' });
    let { width, height } = info;
    if ([5, 6, 7, 8].includes(info.orientation)) [width, height] = [height, width];
    if (!width || !height || width > 12000 || height > 12000) return res.status(415).json({ error: 'dims', message: 'أبعاد الصورة غير مقبولة' });
    const kind = req.body && req.body.kind === 'logo' ? 'logo' : 'image';
    const meta = await store.saveFile(req.uid, p.id, req.file.buffer, { ext, mime: TYPES[ext], width, height, kind });
    // نعيد قراءة المشروع لتجنب الكتابة فوق تعديل متزامن
    const fresh = await store.getProject(req.uid, p.id);
    fresh.files.push(meta);
    await store.saveProject(req.uid, fresh);
    res.status(201).json(meta);
  })
);

api.get(
  '/projects/:id/files/:fid',
  wrap(loadProject),
  wrap(async (req, res) => {
    const f = req.project.files.find((x) => x.id === req.params.fid);
    if (!f) return res.status(404).end();
    const buf = await store.readFile(req.uid, req.project.id, f);
    res.set({ 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=3600', 'Content-Disposition': 'inline' });
    res.send(buf);
  })
);

api.delete(
  '/projects/:id/files/:fid',
  wrap(loadProject),
  wrap(async (req, res) => {
    const p = req.project;
    const f = p.files.find((x) => x.id === req.params.fid);
    if (!f) return res.status(404).json({ error: 'not_found' });
    p.files = p.files.filter((x) => x.id !== f.id);
    if (p.input.logo === f.id) p.input.logo = null;
    for (const pr of p.input.projects) pr.images = pr.images.filter((x) => x !== f.id);
    await store.removeFile(req.uid, p.id, f);
    await store.saveProject(req.uid, p);
    res.json(publicProject(p));
  })
);

// حذف الملفات غير المستخدمة (بعد مهلة، حتى لا يُحذف ملف رُفع للتو قبل ربطه)
async function cleanupFiles(p) {
  const used = new Set([p.input.logo, ...p.input.projects.flatMap((x) => x.images)].filter(Boolean));
  const cutoff = Date.now() - 30 * 60000;
  const keep = [];
  for (const f of p.files) {
    if (used.has(f.id) || Date.parse(f.createdAt) > cutoff) keep.push(f);
    else await store.removeFile(p.ownerId, p.id, f);
  }
  p.files = keep;
}

// ---------- الذكاء الاصطناعي ----------
const genLimit = limiter('gen', [
  [config.limits.genPerHour, 3600000],
  [config.limits.genPerDay, 86400000],
]);

function aiFail(res, e) {
  if (e instanceof ai.AIError) return res.status(e.code === 'demo' ? 400 : 502).json({ error: e.code, message: e.message });
  throw e;
}

api.post(
  '/projects/:id/generate',
  genLimit,
  wrap(loadProject),
  wrap(async (req, res) => {
    const p = req.project;
    if (!p.input.companyName || !p.input.activity) return res.status(400).json({ error: 'incomplete', message: 'أدخل اسم الشركة ونشاطها على الأقل قبل التوليد.' });
    const langs = LANGS.filter((l) => ((req.body && req.body.languages) || p.languages).includes(l));
    if (!langs.length) return res.status(400).json({ error: 'lang', message: 'اختر لغة واحدة على الأقل' });
    try {
      // نسختان منفصلتان: كل لغة تُولَّد من بيانات المستخدم مباشرة
      const results = await Promise.all(langs.map((l) => ai.generate(p.input, l)));
      langs.forEach((l, i) => {
        p.content[l] = results[i].content;
        p.meta[l] = { mode: results[i].mode, missing: results[i].missing, warnings: results[i].warnings, generatedAt: new Date().toISOString() };
      });
    } catch (e) {
      return aiFail(res, e);
    }
    p.languages = langs;
    await store.saveProject(req.uid, p);
    res.json(publicProject(p));
  })
);

api.post(
  '/projects/:id/rewrite',
  genLimit,
  wrap(loadProject),
  wrap(async (req, res) => {
    const p = req.project;
    const { lang, section, instruction } = req.body || {};
    if (!LANGS.includes(lang) || !p.content[lang]) return res.status(400).json({ error: 'lang', message: 'ولّد المحتوى أولًا' });
    if (!SECTION_KEYS.includes(section)) return res.status(400).json({ error: 'section', message: 'قسم غير معروف' });
    try {
      const r = await ai.rewriteSection(p.input, p.content[lang], lang, section, instruction);
      p.content[lang] = r.content;
      p.meta[lang] = { ...(p.meta[lang] || {}), warnings: r.warnings };
    } catch (e) {
      return aiFail(res, e);
    }
    await store.saveProject(req.uid, p);
    res.json(publicProject(p));
  })
);

api.post(
  '/projects/:id/translate',
  genLimit,
  wrap(loadProject),
  wrap(async (req, res) => {
    const p = req.project;
    const { from, to } = req.body || {};
    if (!LANGS.includes(from) || !LANGS.includes(to) || from === to || !p.content[from]) return res.status(400).json({ error: 'lang', message: 'طلب ترجمة غير صالح' });
    try {
      const r = await ai.translate(p.input, p.content[from], from, to);
      p.content[to] = r.content;
      p.meta[to] = { mode: 'ai', missing: r.missing, warnings: r.warnings, generatedAt: new Date().toISOString() };
      if (!p.languages.includes(to)) p.languages.push(to);
    } catch (e) {
      return aiFail(res, e);
    }
    await store.saveProject(req.uid, p);
    res.json(publicProject(p));
  })
);

// ---------- المعاينة والتصدير ----------
const PREVIEW_CSP = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src 'self' data:; frame-ancestors 'self'";

api.get(
  '/projects/:id/preview/:lang',
  wrap(loadProject),
  (req, res) => {
    const p = req.project;
    const lang = req.params.lang;
    if (!p.content[lang]) return res.status(404).send('لا يوجد محتوى لهذه اللغة');
    const html = renderProfile(p, lang, { screen: true, imageSrc: (f) => `/api/projects/${p.id}/files/${f.id}` });
    res.set({ 'Content-Security-Policy': PREVIEW_CSP, 'Cache-Control': 'no-store' }).type('html').send(html);
  }
);

const pdfLimit = limiter('pdf', [[config.limits.pdfPerHour, 3600000]]);

function sendPdf(res, buf, name, download) {
  const safe = encodeURIComponent(name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'profile');
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="profile.pdf"; filename*=UTF-8''${safe}.pdf`,
    'Cache-Control': 'no-store',
  });
  res.send(buf);
}

api.get(
  '/projects/:id/pdf/:lang',
  pdfLimit,
  wrap(loadProject),
  wrap(async (req, res) => {
    const p = req.project;
    const lang = req.params.lang;
    if (!p.content[lang]) return res.status(404).json({ error: 'not_found', message: 'لا يوجد محتوى لهذه اللغة' });
    const buf = await buildPdf(p, lang);
    sendPdf(res, buf, `${p.input.companyName || 'profile'}-${lang}`, req.query.download === '1');
  })
);

// النموذج التجريبي (شركة افتراضية معلنة) للصفحة الرئيسية
api.get('/sample/preview/:lang', (req, res) => {
  const lang = LANGS.includes(req.params.lang) ? req.params.lang : 'ar';
  const html = renderProfile(sample.project(req.query.template), lang, { screen: true });
  res.set({ 'Content-Security-Policy': PREVIEW_CSP }).type('html').send(html);
});
api.get(
  '/sample/pdf/:lang',
  pdfLimit,
  wrap(async (req, res) => {
    const lang = LANGS.includes(req.params.lang) ? req.params.lang : 'ar';
    sendPdf(res, await buildPdf(sample.project(req.query.template), lang), `sample-${lang}`, false);
  })
);

api.use((req, res) => res.status(404).json({ error: 'not_found' }));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: 'البيانات المرسلة كبيرة جدًا' });
  res.status(500).json({ error: 'server', message: 'حدث خطأ غير متوقع في الخادم' });
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`ملف شركتي يعمل على http://localhost:${config.port}`);
    console.log(config.aiEnabled ? `الذكاء الاصطناعي: مفعّل (${config.model})` : 'الذكاء الاصطناعي: غير مفعّل — الوضع التجريبي (أضف ANTHROPIC_API_KEY لتفعيله)');
    if (config.ephemeralSecret) console.warn('تنبيه: SESSION_SECRET غير محدد؛ ستُفقد الجلسات عند إعادة التشغيل.');
  });
}

module.exports = app;
