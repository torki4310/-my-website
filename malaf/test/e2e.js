'use strict';
/*
 * اختبار شامل للرحلة عبر المتصفح (Playwright) على خادم حقيقي.
 * كل البيانات لشركات افتراضية معلنة. لا يتصل بأي خدمة خارجية:
 * مسار الذكاء الاصطناعي يُختبر عبر خادم Anthropic وهمي محلي (test/mock-anthropic.js).
 *
 * التشغيل: npm run e2e   — النتائج (PDF وصور الصفحات) في test/output/
 */
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const { chromium } = require('playwright');
const mock = require('./mock-anthropic');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'output');
const FIX = path.join(__dirname, 'fixtures');
const results = [];

function hasTool(t) {
  try {
    execFileSync('which', [t], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function startServer(env) {
  const port = 3400 + Math.floor(Math.random() * 500);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'malaf-e2e-'));
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, ANTHROPIC_API_KEY: '', PORT: String(port), DATA_DIR: dataDir, SESSION_SECRET: 'e2e-secret', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://localhost:${port}/api/me`);
      if (r.ok) return { url: `http://localhost:${port}`, dataDir, child, log: () => log };
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not start\n' + log);
}

async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: e });
    console.log(`  ✗ ${name}\n    ${String(e.stack || e).split('\n').slice(0, 4).join('\n    ')}`);
  }
}

// ---------- مساعدات الواجهة ----------
const fieldByLabel = (page, label) => page.locator('.field').filter({ has: page.locator(`label:text-is("${label}")`) }).locator('input,textarea').first();
async function fill(page, label, value) {
  await fieldByLabel(page, label).fill(value);
}
async function next(page) {
  await page.getByRole('button', { name: /التالي/ }).click();
}
async function waitSaved(page) {
  await page.waitForFunction(() => document.querySelector('#saveState .txt').textContent === 'محفوظ', null, { timeout: 15000 });
}

// يحفظ PDF ويحوّل صفحاته لصور ويفحص النص والخطوط
function inspectPdf(buf, name) {
  const file = path.join(OUT, `${name}.pdf`);
  fs.writeFileSync(file, buf);
  assert.equal(buf.slice(0, 5).toString(), '%PDF-');
  const info = {};
  if (hasTool('pdftotext')) {
    info.text = execFileSync('pdftotext', ['-layout', file, '-']).toString();
    info.pages = Number((execFileSync('pdfinfo', [file]).toString().match(/Pages:\s+(\d+)/) || [])[1]);
    const fonts = execFileSync('pdffonts', [file]).toString();
    // كل خطوط المحتوى مضمّنة (العمود emb = yes)
    const rows = fonts.split('\n').slice(2).filter(Boolean);
    info.fontsEmbedded = rows.every((r) => / yes /.test(r));
    info.readex = /ReadexPro/i.test(fonts);
    execFileSync('pdftoppm', ['-r', '45', '-png', file, path.join(OUT, name)]);
  }
  return info;
}

// فحص التخطيط: لا عناصر تتجاوز عرض المحتوى، والصور بنسبها الأصلية
async function layoutCheck(browser, html) {
  const page = await browser.newPage({ viewport: { width: 665, height: 1000 } }); // عرض المحتوى داخل هوامش A4 (176mm)
  await page.emulateMedia({ media: 'print' });
  await page.setContent(html, { waitUntil: 'load' });
  const r = await page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const over = [];
    document.querySelectorAll('.doc *').forEach((el) => {
      if (el.closest('.cover')) return;
      const b = el.getBoundingClientRect();
      if (b.width && (b.right > W + 1 || b.left < -1)) over.push(`${el.tagName}.${el.className} ${Math.round(b.left)}..${Math.round(b.right)}`);
    });
    const imgs = [...document.querySelectorAll('img')].map((i) => {
      const b = i.getBoundingClientRect();
      return { natural: i.naturalWidth / i.naturalHeight, shown: b.width / b.height, w: b.width, h: b.height };
    });
    const wide = [...document.querySelectorAll('.sec')].filter((s) => s.scrollWidth > s.clientWidth + 1).map((s) => s.className);
    return { over, imgs, wide, W };
  });
  await page.close();
  assert.deepEqual(r.over, [], 'عناصر تتجاوز حدود الصفحة');
  assert.deepEqual(r.wide, [], 'محتوى يتجاوز عرض القسم');
  for (const i of r.imgs) assert.ok(Math.abs(i.natural - i.shown) / i.natural < 0.02, `صورة مشوهة: ${JSON.stringify(i)}`);
  return r;
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  if (!fs.existsSync(path.join(FIX, 'landscape.jpg'))) execFileSync(process.execPath, [path.join(__dirname, 'make-fixtures.js')], { stdio: 'inherit' });

  const browser = await chromium.launch();
  const { renderProfile } = require('../server/render');

  // =====================================================================
  console.log('\n[1] الوضع التجريبي — شركة افتراضية كاملة بالعربية (شعار + مشاريع وصور)');
  const demo = await startServer({ GEN_LIMIT_PER_HOUR: '6', MAX_FILE_MB: '2' });
  const ctxA = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const page = await ctxA.newPage();
  page.on('dialog', (d) => d.accept());
  let projectId;

  await step('الصفحة الرئيسية تعرض الشرح والنموذج وزر الإنشاء', async () => {
    await page.goto(demo.url + '/');
    await page.getByRole('heading', { name: /ملف تعريفي احترافي/ }).waitFor();
    assert.ok(await page.getByRole('link', { name: 'أنشئ ملف شركتك' }).first().isVisible());
    await page.locator('#modeBadge:not([hidden])').waitFor();
    assert.match(await page.locator('#modeBadge').textContent(), /وضع تجريبي/);
    const frame = page.frameLocator('#sampleFrame');
    await frame.locator('.cover-name').waitFor();
    assert.match(await frame.locator('.cover-name').textContent(), /افتراضية/);
    await page.screenshot({ path: path.join(OUT, 'ui-landing-desktop.png'), fullPage: true });
  });

  await step('الخطوة 1: الأساسيات', async () => {
    await page.getByRole('link', { name: 'أنشئ ملف شركتك' }).first().click();
    await page.getByRole('heading', { name: 'معلومات الشركة الأساسية' }).waitFor();
    projectId = page.url().match(/#p\/([a-z0-9]+)\//)[1];
    await fill(page, 'اسم الشركة', 'مؤسسة الواحة للمقاولات العامة (اختبار)');
    await fill(page, 'الاسم الرسمي بالإنجليزية(اختياري)', 'Al-Waha General Contracting (TEST)').catch(async () => {
      await page.locator('input[dir=ltr]').first().fill('Al-Waha General Contracting (TEST)');
    });
    await fill(page, 'نشاط الشركة', 'مقاولات عامة وأعمال تشطيب وترميم للمباني السكنية والتجارية');
    await page.locator('input[pattern]').fill('2012');
    await page.locator('.field', { hasText: 'المدن التي تخدمها' }).locator('textarea').fill('الدمام، الخبر، الظهران');
    await waitSaved(page);
    await page.screenshot({ path: path.join(OUT, 'ui-step1.png'), fullPage: true });
    await next(page);
  });

  await step('الخطوة 2: النبذة والخدمات ونقاط التميز', async () => {
    await page.locator('.field', { hasText: 'نبذة أولية' }).locator('textarea').fill('نفذنا أعمال تشطيب وترميم لمبانٍ سكنية وتجارية في المنطقة الشرقية.\n\nلدينا مهندس موقع يتابع كل مشروع، ونسلم جدولًا زمنيًا قبل البدء.');
    for (const [n, d] of [['أعمال التشطيب', 'دهانات وأرضيات وأسقف معلقة'], ['الترميم', 'إصلاح التشققات والعزل المائي'], ['المقاولات العامة', 'تنفيذ المباني الصغيرة والملاحق']]) {
      await page.getByRole('button', { name: '+ أضف خدمة' }).click();
      const item = page.locator('.repeater-item').last();
      await item.locator('.field', { hasText: 'اسم الخدمة' }).locator('input').fill(n);
      await item.locator('.field', { hasText: 'وصف مختصر' }).locator('textarea').fill(d);
    }
    await page.locator('.field', { hasText: 'نقاط التميز' }).locator('textarea').fill('مهندس موقع لكل مشروع\nجدول زمني مكتوب قبل البدء\nضمان على أعمال العزل');
    await waitSaved(page);
    await next(page);
  });

  await step('الخطوة 3: مشروعان مع صور بنسب مختلفة', async () => {
    const add = async (title, client, year, desc, files) => {
      await page.getByRole('button', { name: '+ أضف مشروعًا' }).click();
      const item = page.locator('.repeater-item').last();
      await item.locator('.field', { hasText: 'اسم المشروع' }).locator('input').fill(title);
      await item.locator('.field', { hasText: 'العميل' }).locator('input').fill(client);
      await item.locator('.field', { hasText: 'السنة' }).locator('input').fill(year);
      await item.locator('.field', { hasText: 'وصف المشروع' }).locator('textarea').fill(desc);
      await waitSaved(page);
      await item.locator('input[type=file]').setInputFiles(files.map((f) => path.join(FIX, f)));
      await page.locator('.repeater-item').last().locator('.thumb img').nth(files.length - 1).waitFor({ timeout: 20000 });
    };
    await add('ترميم واجهة مبنى تجاري', '', '2023', 'إصلاح التشققات وإعادة دهان الواجهة مع عزل مائي للسطح.', ['landscape.jpg', 'portrait.jpg']);
    await add('تشطيب فيلا سكنية', 'عميل فرد', '2024', 'أعمال أرضيات ودهانات وأسقف جبسية.', ['square.png', 'panorama.jpg', 'landscape.jpg']);
    await waitSaved(page);
    assert.equal(await page.locator('.thumb img').count(), 5);
    await page.screenshot({ path: path.join(OUT, 'ui-step3-projects.png'), fullPage: true });
    await next(page);
  });

  await step('الخطوة 4: العملاء والشهادات (اختيارية)', async () => {
    await page.locator('.field', { hasText: 'الشهادات والاعتمادات' }).locator('textarea').fill('عضوية الغرفة التجارية (بيانات اختبار)');
    await waitSaved(page);
    await next(page);
  });

  await step('الخطوة 5: التواصل والشعار والألوان', async () => {
    await fill(page, 'الهاتف', '+966 13 000 0000');
    await fill(page, 'البريد الإلكتروني', 'test@example.com');
    await page.locator('.field', { hasText: 'العنوان' }).locator('textarea').fill('الدمام — حي اختباري، شارع افتراضي');
    await page.locator('label.upload input[type=file]').setInputFiles(path.join(FIX, 'logo-wide.png'));
    await page.locator('.logo-box img').waitFor({ timeout: 20000 });
    await page.locator('input[type=color]').first().evaluate((el) => {
      el.value = '#264653';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await waitSaved(page);
    await page.screenshot({ path: path.join(OUT, 'ui-step5-contact.png'), fullPage: true });
    await next(page);
  });

  await step('الخطوة 6: التوليد في الوضع التجريبي مع تنبيه واضح', async () => {
    await page.getByRole('heading', { name: 'اللغة وتوليد المسودة' }).waitFor();
    await page.getByText('وضع تجريبي:').first().waitFor();
    await page.getByRole('button', { name: 'ولّد مسودة المحتوى' }).click();
    await page.getByRole('heading', { name: 'راجع المحتوى وعدّله' }).waitFor({ timeout: 30000 });
    assert.ok(await page.getByText('هذا المحتوى هو نصك كما أدخلته').isVisible());
    // لا إعادة صياغة في الوضع التجريبي
    assert.equal(await page.getByRole('button', { name: 'أعد صياغة هذا القسم' }).count(), 0);
  });

  await step('الخطوة 7: تعديل نص يدويًا وحفظه', async () => {
    const tagline = page.locator('.sec-card').first().locator('textarea');
    await tagline.fill('مقاولات عامة وتشطيب وترميم في المنطقة الشرقية');
    await waitSaved(page);
    const p = await page.evaluate(async (id) => (await fetch(`/api/projects/${id}`)).json(), projectId);
    assert.equal(p.content.ar.tagline, 'مقاولات عامة وتشطيب وترميم في المنطقة الشرقية');
    await page.screenshot({ path: path.join(OUT, 'ui-step7-review.png'), fullPage: true });
    await page.getByRole('button', { name: /القالب والتنزيل/ }).last().click();
  });

  await step('الخطوة 8: قالب بصري، إخفاء قسم، إعادة ترتيب، معاينة', async () => {
    await page.getByRole('heading', { name: 'القالب والمعاينة والتنزيل' }).waitFor();
    await page.locator('.preview-wrap iframe').waitFor();
    await page.getByRole('button', { name: /بصري/ }).click();
    await waitSaved(page);
    await page.getByRole('checkbox', { name: 'إظهار الشهادات' }).uncheck();
    await waitSaved(page);
    // نقل "المشاريع" لأعلى مرتين
    const li = page.locator('.sections-list li', { hasText: 'المشاريع' });
    await li.getByRole('button', { name: 'تحريك لأعلى' }).click();
    await waitSaved(page);
    await page.locator('.sections-list li', { hasText: 'المشاريع' }).getByRole('button', { name: 'تحريك لأعلى' }).click();
    await waitSaved(page);
    const frame = page.frameLocator('.preview-wrap iframe');
    await frame.locator('body.tpl-visual').waitFor({ timeout: 10000 });
    assert.equal(await frame.locator('.sec-certifications').count(), 0);
    const order = await frame.locator('.sec').evaluateAll((els) => els.map((e) => e.className.replace('sec sec-', '')));
    assert.deepEqual(order.slice(0, 2), ['about', 'projects']);
    await page.screenshot({ path: path.join(OUT, 'ui-step8-design.png'), fullPage: true });
  });

  await step('تنزيل PDF عربي وفحصه (خط مضمّن، نص قابل للنسخ، صور)', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'تنزيل PDF — العربية' }).click()]);
    const buf = fs.readFileSync(await dl.path());
    const info = inspectPdf(buf, 'A-demo-ar-visual');
    if (info.text) {
      assert.ok(info.fontsEmbedded, 'خط غير مضمّن');
      assert.ok(info.readex, 'الخط العربي غير موجود');
      for (const w of ['مؤسسة الواحة للمقاولات العامة', 'ترميم واجهة مبنى تجاري', 'لأعمال', 'مهندس موقع لكل مشروع'].slice(0, 2)) assert.ok(info.text.includes(w), `النص غير قابل للنسخ: ${w}`);
      assert.ok(!info.text.includes('عضوية الغرفة'), 'القسم المخفي ظهر في PDF');
      console.log(`    صفحات: ${info.pages}`);
    }
    const p = await page.evaluate(async (id) => (await fetch(`/api/projects/${id}`)).json(), projectId);
    p.ownerId = 'x';
    await layoutCheck(browser, renderProfile(p, 'ar', { fontMode: 'data', imageSrc: (f) => `data:${f.mime};base64,${fs.readFileSync(path.join(demo.dataDir, 'users', fs.readdirSync(path.join(demo.dataDir, 'users'))[0], 'projects', projectId, 'files', `${f.id}.${f.ext}`)).toString('base64')}` }));
  });

  await step('معاينة صفحات PDF الفعلية داخل الواجهة', async () => {
    await page.getByRole('button', { name: 'معاينة الصفحات الفعلية (PDF)' }).click();
    const src = await page.locator('iframe.pdf-frame').getAttribute('src');
    const r = await page.evaluate(async (u) => {
      const x = await fetch(u);
      return [x.status, x.headers.get('content-type')];
    }, src);
    assert.deepEqual(r, [200, 'application/pdf']);
  });

  await step('العودة للمسودة من «مشاريعي» بعد إعادة التحميل', async () => {
    await page.goto(demo.url + '/app#list');
    await page.getByText('مؤسسة الواحة للمقاولات العامة (اختبار)').waitFor();
    await page.getByRole('link', { name: 'متابعة التحرير' }).click();
    await page.getByRole('heading', { name: 'معلومات الشركة الأساسية' }).waitFor();
    assert.equal(await fieldByLabel(page, 'اسم الشركة').inputValue(), 'مؤسسة الواحة للمقاولات العامة (اختبار)');
  });

  await step('عزل المستخدمين: مستخدم آخر لا يصل للمشروع ولا ملفاته', async () => {
    const p = await page.evaluate(async (id) => (await fetch(`/api/projects/${id}`)).json(), projectId);
    const other = await browser.newContext();
    const op = await other.newPage();
    await op.goto(demo.url + '/');
    const codes = await op.evaluate(
      async ([id, fid]) => {
        const s = async (u, o) => (await fetch(u, o)).status;
        return [
          await s(`/api/projects/${id}`),
          await s(`/api/projects/${id}/files/${fid}`),
          await s(`/api/projects/${id}/pdf/ar`),
          await s(`/api/projects/${id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'malaf' } }),
          (await (await fetch('/api/projects')).json()).length,
        ];
      },
      [projectId, p.input.logo]
    );
    assert.deepEqual(codes, [404, 404, 404, 404, 0]);
    // بدون كعكة إطلاقًا
    const anon = await fetch(`${demo.url}/api/projects/${projectId}/files/${p.input.logo}`);
    assert.equal(anon.status, 404);
    await other.close();
  });

  await step('حدود المرفقات والأنواع وحماية CSRF', async () => {
    const res = await page.evaluate(async (id) => {
      const up = async (blob, name) => {
        const fd = new FormData();
        fd.append('file', blob, name);
        const r = await fetch(`/api/projects/${id}/files`, { method: 'POST', body: fd, headers: { 'X-Requested-With': 'malaf' } });
        return r.status;
      };
      const big = new Uint8Array(3 * 1024 * 1024);
      big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      return [
        await up(new Blob([big], { type: 'image/png' }), 'big.png'),
        await up(new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], { type: 'image/png' }), 'evil.png'),
        await up(new Blob(['%PDF-1.4 fake'], { type: 'image/jpeg' }), 'x.jpg'),
        (await fetch(`/api/projects/${id}`, { method: 'DELETE' })).status, // بدون الترويسة
      ];
    }, projectId);
    assert.deepEqual(res, [413, 415, 415, 403]);
  });

  await step('حد عدد طلبات التوليد (429)', async () => {
    const codes = await page.evaluate(async (id) => {
      const out = [];
      for (let i = 0; i < 7; i++) out.push((await fetch(`/api/projects/${id}/generate`, { method: 'POST', headers: { 'X-Requested-With': 'malaf', 'Content-Type': 'application/json' }, body: '{}' })).status);
      return out;
    }, projectId);
    assert.ok(codes.includes(429), `لم يُطبّق الحد: ${codes}`);
  });

  // =====================================================================
  console.log('\n[2] الوضع التجريبي — إنجليزي فقط، بدون شعار أو مشاريع، ونص طويل جدًا');
  const ctxC = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await ctxC.newPage();
  mp.on('dialog', (d) => d.accept());
  let longId;
  await step('إنشاء من الجوال وتعبئة نص طويل', async () => {
    await mp.goto(demo.url + '/');
    await mp.screenshot({ path: path.join(OUT, 'ui-landing-mobile.png'), fullPage: true });
    const sw = await mp.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(sw <= 391, `تمرير أفقي على الجوال (${sw})`);
    await mp.goto(demo.url + '/app#new');
    await mp.getByRole('heading', { name: 'معلومات الشركة الأساسية' }).waitFor();
    longId = mp.url().match(/#p\/([a-z0-9]+)\//)[1];
    await fill(mp, 'اسم الشركة', 'Northwind Facility Services (TEST COMPANY)');
    await fill(mp, 'نشاط الشركة', 'Cleaning, landscaping and facility management for offices and residential compounds');
    await waitSaved(mp);
    const sw2 = await mp.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(sw2 <= 391, `تمرير أفقي في المحرر (${sw2})`);
    await mp.screenshot({ path: path.join(OUT, 'ui-editor-mobile.png'), fullPage: true });
    // نص طويل جدًا + خدمات كثيرة + كلمة طويلة بلا مسافات
    const para = 'We provide daily office cleaning, deep cleaning after renovation, landscaping and irrigation maintenance, and on-call facility technicians for residential compounds. Every site has a named supervisor and a written checklist that the client signs at the end of each visit. ';
    const input = {
      companyName: 'Northwind Facility Services (TEST COMPANY)',
      activity: 'Cleaning, landscaping and facility management for offices and residential compounds',
      cities: ['Jeddah', 'Makkah'],
      about: Array.from({ length: 10 }, (_, i) => `Paragraph ${i + 1}. ${para.repeat(2)}`).join('\n\n') + '\nhttps://example.com/a/very/long/url/without/any/spaces/that/should/wrap/inside/the/page/instead/of/overflowing/the/margins/' + 'x'.repeat(120),
      services: Array.from({ length: 14 }, (_, i) => ({ name: `Service ${i + 1} — ${['Office cleaning', 'Deep cleaning', 'Landscaping', 'Irrigation', 'Pest control coordination', 'Waste handling', 'Window cleaning'][i % 7]}`, desc: para })),
      strengths: ['Named supervisor for every site', 'Signed checklist after each visit', 'On-call technicians'],
      contact: { email: 'hello@example.com', phone: '+966 12 000 0000', website: 'https://example.com' },
    };
    await mp.evaluate(async ([id, input]) => {
      const r = await fetch(`/api/projects/${id}`, { method: 'PUT', headers: { 'X-Requested-With': 'malaf', 'Content-Type': 'application/json' }, body: JSON.stringify({ input, languages: ['en'] }) });
      if (!r.ok) throw new Error(await r.text());
    }, [longId, input]);
  });

  await step('توليد إنجليزي (تجريبي) وتنبيه غياب الشعار والمشاريع', async () => {
    await mp.goto(`${demo.url}/app#p/${longId}/5`);
    await mp.reload();
    await mp.getByRole('heading', { name: 'اللغة وتوليد المسودة' }).waitFor();
    await mp.getByRole('checkbox', { name: 'العربية' }).uncheck();
    await mp.getByRole('checkbox', { name: 'English' }).check();
    await mp.getByRole('button', { name: 'ولّد مسودة المحتوى' }).click();
    await mp.getByRole('heading', { name: 'راجع المحتوى وعدّله' }).waitFor({ timeout: 30000 });
    const notes = await mp.locator('.notice').allTextContents();
    assert.ok(notes.some((n) => /No logo uploaded/.test(n)), 'لا تنبيه لغياب الشعار');
    assert.ok(notes.some((n) => /No past projects/.test(n)), 'لا تنبيه لغياب المشاريع');
    await mp.screenshot({ path: path.join(OUT, 'ui-review-mobile.png'), fullPage: true });
  });

  await step('PDF إنجليزي طويل: صفحات إضافية، دون تجاوز للهوامش، قسم المشاريع مخفي', async () => {
    const r = await mp.evaluate(async (id) => {
      const x = await fetch(`/api/projects/${id}/pdf/en`);
      return [x.status, Array.from(new Uint8Array(await x.arrayBuffer()))];
    }, longId);
    assert.equal(r[0], 200);
    const info = inspectPdf(Buffer.from(r[1]), 'C-demo-en-long-nologo');
    if (info.text) {
      assert.ok(info.pages >= 5, `صفحات أقل من المتوقع: ${info.pages}`);
      assert.ok(info.text.includes('Paragraph 10.'), 'النص الطويل مقطوع');
      assert.ok(info.text.includes('Service 14'), 'الخدمات مقطوعة');
      assert.ok(!/Selected Work/.test(info.text), 'قسم المشاريع ظهر رغم عدم وجود مشاريع');
      console.log(`    صفحات: ${info.pages}`);
    }
    const p = await mp.evaluate(async (id) => (await fetch(`/api/projects/${id}`)).json(), longId);
    await layoutCheck(browser, renderProfile(p, 'en', { fontMode: 'data' }));
    p.design.template = 'visual';
    await layoutCheck(browser, renderProfile(p, 'en', { fontMode: 'data' }));
  });

  await step('حذف المشروع يحذف ملفاته من القرص', async () => {
    const uid = fs.readdirSync(path.join(demo.dataDir, 'users'));
    const before = uid.flatMap((u) => fs.readdirSync(path.join(demo.dataDir, 'users', u, 'projects')));
    assert.ok(before.includes(projectId));
    const st = await page.evaluate(async (id) => (await fetch(`/api/projects/${id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'malaf' } })).status, projectId);
    assert.equal(st, 200);
    const after = uid.flatMap((u) => fs.readdirSync(path.join(demo.dataDir, 'users', u, 'projects')));
    assert.ok(!after.includes(projectId), 'مجلد المشروع ما زال موجودًا');
  });
  await ctxA.close();
  await ctxC.close();
  demo.child.kill();

  // =====================================================================
  console.log('\n[3] مسار الذكاء الاصطناعي عبر خادم Anthropic وهمي — لغتان + إعادة صياغة قسم + ترجمة');
  const m = await mock.start();
  const ai = await startServer({ ANTHROPIC_API_KEY: 'sk-ant-test-not-real', ANTHROPIC_BASE_URL: `http://localhost:${m.port}` });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const bp = await ctxB.newPage();
  bp.on('dialog', (d) => d.accept());
  let aiId;
  await step('إنشاء مشروع وتوليد نسختين منفصلتين (عربية وإنجليزية)', async () => {
    await bp.goto(ai.url + '/app#new');
    await bp.getByRole('heading', { name: 'معلومات الشركة الأساسية' }).waitFor();
    aiId = bp.url().match(/#p\/([a-z0-9]+)\//)[1];
    const input = {
      companyName: 'شركة الأفق للتقنية (اختبار)',
      companyNameEn: 'Ufuq Tech (TEST)',
      activity: 'تطوير مواقع وتطبيقات للشركات الصغيرة',
      foundedYear: '2020',
      cities: ['الرياض'],
      about: 'نطور مواقع وتطبيقات بسيطة للشركات الصغيرة.',
      services: [{ name: 'تطوير المواقع', desc: 'مواقع تعريفية ومتاجر' }],
      strengths: ['دعم فني بعد التسليم'],
      projects: [{ id: 'aaaaaaaaaaaa', title: 'موقع مطعم', desc: 'موقع بقائمة طعام' }],
      contact: { email: 'info@example.com', address: 'الرياض' },
    };
    await bp.evaluate(async ([id, input]) => {
      await fetch(`/api/projects/${id}`, { method: 'PUT', headers: { 'X-Requested-With': 'malaf', 'Content-Type': 'application/json' }, body: JSON.stringify({ input }) });
    }, [aiId, input]);
    await bp.goto(`${ai.url}/app#p/${aiId}/5`);
    await bp.reload();
    await bp.getByRole('checkbox', { name: 'English' }).check();
    await bp.getByRole('button', { name: 'ولّد مسودة المحتوى' }).click();
    await bp.getByRole('heading', { name: 'راجع المحتوى وعدّله' }).waitFor({ timeout: 30000 });
    assert.equal(m.log.length, 2, 'يجب استدعاءان منفصلان (لغة لكل استدعاء)');
    const req = m.log[0];
    assert.equal(req.body.model, 'claude-opus-5-5');
    assert.equal(req.body.output_config.format.type, 'json_schema');
    assert.equal(req.body.fallbacks, 'default');
    assert.ok(req.body.stream, 'يجب استخدام البث');
    assert.match(req.headers['anthropic-beta'] || '', /server-side-fallback/);
    const key = req.headers['x-api-key'] || String(req.headers.authorization || '').replace(/^Bearer /, '');
    assert.equal(key, 'sk-ant-test-not-real', 'مفتاح API لم يُرسل من الخادم');
  });

  await step('الحمايات: حذف مشروع مختلق، وتنبيه للرقم والادعاء غير المسندين', async () => {
    const p = await bp.evaluate(async (id) => (await fetch(`/api/projects/${id}`)).json(), aiId);
    assert.deepEqual(p.content.ar.projects.items.map((x) => x.ref), ['aaaaaaaaaaaa']);
    const w = p.meta.ar.warnings;
    assert.ok(w.some((x) => x.type === 'numbers' && x.values.includes('15')), 'لم يُنبَّه للرقم 15');
    assert.ok(w.some((x) => x.type === 'claims' && x.values.includes('الرائدة')), 'لم يُنبَّه لعبارة الرائدة');
    assert.ok(p.meta.en.warnings.some((x) => x.type === 'claims'), 'لم يُنبَّه للادعاء في الإنجليزية');
    assert.ok(await bp.getByText('تحقق من هذه الأرقام').isVisible());
    assert.ok(await bp.getByText('عبارات تفضيل غير مسندة').isVisible());
    assert.equal(p.content.en.companyName, 'Ufuq Tech (TEST)');
    await bp.screenshot({ path: path.join(OUT, 'ui-ai-review-warnings.png'), fullPage: true });
  });

  await step('إعادة صياغة قسم واحد لا تغيّر باقي الأقسام', async () => {
    const before = await bp.evaluate(async (id) => (await fetch(`/api/projects/${id}`)).json(), aiId);
    const card = bp.locator('.sec-card', { has: bp.locator('h3', { hasText: 'من نحن' }) });
    await card.locator('.rewrite input').fill('اجعلها أقصر');
    await card.getByRole('button', { name: 'أعد صياغة هذا القسم' }).click();
    await bp.getByText('أُعيدت صياغة «من نحن» فقط').waitFor({ timeout: 20000 });
    const after = await bp.evaluate(async (id) => (await fetch(`/api/projects/${id}`)).json(), aiId);
    assert.match(after.content.ar.about.body, /أعيدت صياغته/);
    for (const k of ['tagline', 'services', 'strengths', 'projects', 'contact']) assert.deepEqual(after.content.ar[k], before.content.ar[k], `تغيّر قسم ${k}`);
    assert.deepEqual(after.content.en, before.content.en, 'تغيّرت النسخة الإنجليزية');
    const last = m.log[m.log.length - 1];
    assert.match(last.body.messages[0].content, /اجعلها أقصر/);
  });

  await step('ترجمة النسخة المحررة', async () => {
    await bp.getByRole('button', { name: /ترجم هذه النسخة المحررة إلى English/ }).click();
    await bp.getByRole('tab', { name: 'English', selected: true }).waitFor({ timeout: 20000 });
    const p = await bp.evaluate(async (id) => (await fetch(`/api/projects/${id}`)).json(), aiId);
    assert.match(p.content.en.about.body, /\[EN\]/);
  });

  await step('تنزيل PDF للنسختين (قالب رسمي)', async () => {
    for (const l of ['ar', 'en']) {
      const r = await bp.evaluate(async ([id, l]) => {
        const x = await fetch(`/api/projects/${id}/pdf/${l}?download=1`);
        return [x.status, x.headers.get('content-disposition'), Array.from(new Uint8Array(await x.arrayBuffer()))];
      }, [aiId, l]);
      assert.equal(r[0], 200);
      assert.match(r[1], /^attachment/);
      const info = inspectPdf(Buffer.from(r[2]), `B-ai-${l}-formal`);
      if (info.text) assert.ok(info.text.includes(l === 'ar' ? 'شركة الأفق للتقنية' : 'Ufuq Tech'));
    }
  });
  await ctxB.close();
  ai.child.kill();
  m.server.close();

  // النموذج التجريبي في الصفحة الرئيسية
  console.log('\n[4] ملفات النموذج التجريبي');
  const s = await startServer({});
  await step('PDF النموذج بالقالبين واللغتين', async () => {
    for (const t of ['formal', 'visual'])
      for (const l of ['ar', 'en']) {
        const r = await fetch(`${s.url}/api/sample/pdf/${l}?template=${t}`);
        assert.equal(r.status, 200);
        inspectPdf(Buffer.from(await r.arrayBuffer()), `S-sample-${t}-${l}`);
      }
  });
  s.child.kill();

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} نجحت. المخرجات في ${OUT}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
