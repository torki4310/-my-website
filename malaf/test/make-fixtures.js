'use strict';
// يولّد صورًا اختبارية بسيطة (أشكال ونص "TEST IMAGE") بنسب أبعاد مختلفة.
// ليست صور مشاريع حقيقية — تستخدم فقط لاختبار عرض النسب الأصلية وعدم التشويه.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, 'fixtures');
const items = [
  { name: 'logo-wide.png', w: 600, h: 200, bg: 'transparent', label: 'LOGO', color: '#0f4c5c', type: 'png' },
  { name: 'landscape.jpg', w: 1600, h: 900, bg: '#7aa6b3', label: 'TEST IMAGE 16:9', color: '#fff', type: 'jpeg' },
  { name: 'portrait.jpg', w: 900, h: 1400, bg: '#c58b4a', label: 'TEST IMAGE portrait', color: '#fff', type: 'jpeg' },
  { name: 'square.png', w: 1000, h: 1000, bg: '#4f6d5a', label: 'TEST IMAGE square', color: '#fff', type: 'png' },
  { name: 'panorama.jpg', w: 2400, h: 600, bg: '#5a5f8a', label: 'TEST IMAGE 4:1', color: '#fff', type: 'jpeg' },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  for (const it of items) {
    const p = await b.newPage({ viewport: { width: it.w, height: it.h } });
    await p.setContent(`<body style="margin:0;width:${it.w}px;height:${it.h}px;background:${it.bg};display:grid;place-items:center;font:700 ${Math.round(Math.min(it.w, it.h) / 7)}px sans-serif;color:${it.color};border:${it.bg === 'transparent' ? 0 : 12}px solid rgba(0,0,0,.25);box-sizing:border-box">
      <div style="text-align:center">${it.label}<div style="font-size:.4em">${it.w}×${it.h}</div></div></body>`);
    await p.screenshot({ path: path.join(OUT, it.name), type: it.type, omitBackground: it.bg === 'transparent', ...(it.type === 'jpeg' ? { quality: 80 } : {}) });
    await p.close();
  }
  await b.close();
  console.log('fixtures ready');
})();
