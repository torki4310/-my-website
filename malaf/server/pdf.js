'use strict';
// تصدير PDF عبر Chromium (Playwright): تشكيل عربي صحيح، خط مضمّن، نص قابل للتحديد والنسخ.
const { renderProfile } = require('./render');
const store = require('./store');
const { fixArabicToUnicode } = require('./pdffix');

let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    const { chromium } = require('playwright');
    const opts = { args: ['--no-sandbox'] };
    if (process.env.CHROMIUM_PATH) opts.executablePath = process.env.CHROMIUM_PATH;
    browserPromise = chromium.launch(opts).catch((e) => {
      browserPromise = null;
      throw e;
    });
  }
  return browserPromise;
}

async function buildPdf(project, lang) {
  // الصور تُضمَّن كبيانات داخل الصفحة، فلا حاجة لأي طلب شبكة أثناء الطباعة
  const data = new Map();
  for (const f of project.files || []) {
    const buf = await store.readFile(project.ownerId, project.id, f).catch(() => null);
    if (buf) data.set(f.id, `data:${f.mime};base64,${buf.toString('base64')}`);
  }
  const html = renderProfile(project, lang, { fontMode: 'data', imageSrc: (f) => data.get(f.id) || null });
  const browser = await getBrowser();
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.route('**/*', (route) => (route.request().url().startsWith('data:') ? route.continue() : route.abort()));
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    const pdf = await page.pdf({
      preferCSSPageSize: true,
      printBackground: true,
      tagged: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `<div style="width:100%;font-size:8px;color:#8a96a3;text-align:center;font-family:sans-serif;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    });
    return await fixArabicToUnicode(pdf);
  } finally {
    await context.close();
  }
}

async function closeBrowser() {
  if (browserPromise) (await browserPromise).close();
  browserPromise = null;
}

module.exports = { buildPdf, closeBrowser };
