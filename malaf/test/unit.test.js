'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeInput, sanitizeDesign, sanitizeContent } = require('../server/schema');
const { enforceProjects, reviewWarnings, missingInfo } = require('../server/guard');
const { fixCMap } = require('../server/pdffix');
const { renderProfile } = require('../server/render');
const sample = require('../server/sample');

test('تنقية المدخلات: أطوال وأنواع وألوان', () => {
  const i = sanitizeInput({ companyName: 'x'.repeat(500), foundedYear: 'abc', colors: { primary: 'red' }, services: [{ name: 'a' }, {}, 'bad'], logo: '../../etc' });
  assert.equal(i.companyName.length, 120);
  assert.equal(i.foundedYear, '');
  assert.equal(i.colors.primary, '#0f4c5c');
  assert.equal(i.services.length, 1);
  assert.equal(i.logo, null);
});

test('التصميم: الأقسام كاملة والغلاف أولًا', () => {
  const d = sanitizeDesign({ template: 'nope', sections: [{ key: 'contact', visible: false }, { key: 'cover' }, { key: 'evil' }] });
  assert.equal(d.template, 'formal');
  assert.equal(d.sections[0].key, 'cover');
  assert.equal(d.sections.length, 8);
  assert.equal(d.sections.find((s) => s.key === 'contact').visible, false);
});

test('المشاريع المختلقة تُحذف والمحذوفة تُعاد', () => {
  const input = sanitizeInput({ projects: [{ id: 'aaaaaaaaaaaa', title: 'A' }, { id: 'bbbbbbbbbbbb', title: 'B', desc: 'd' }] });
  const c = sanitizeContent({ projects: { items: [{ ref: 'zzzzzzzzzzzz', title: 'fake' }, { ref: 'aaaaaaaaaaaa', title: 'A2' }] } });
  enforceProjects(c, input);
  assert.deepEqual(c.projects.items.map((x) => x.ref), ['aaaaaaaaaaaa', 'bbbbbbbbbbbb']);
});

test('تنبيه للأرقام والادعاءات غير الموجودة في المدخلات', () => {
  const input = sanitizeInput({ activity: 'صيانة', foundedYear: '2016' });
  const c = sanitizeContent({ tagline: 'الشركة الرائدة', about: { body: 'تأسست 2016 ولدينا ١٥ عامًا' } });
  const w = reviewWarnings(c, input);
  assert.deepEqual(w.find((x) => x.type === 'numbers').values, ['15']);
  assert.ok(w.find((x) => x.type === 'claims').values.includes('الرائدة'));
  assert.equal(reviewWarnings(sanitizeContent({ tagline: 'صيانة منذ 2016' }), input).length, 0);
});

test('النواقص تُطلب من المستخدم', () => {
  const m = missingInfo(sanitizeInput({ companyName: 'x' }), 'ar');
  assert.ok(m.some((x) => x.includes('شعار')));
  assert.ok(m.some((x) => x.includes('مشاريع')));
});

test('تصحيح ربط "لا" في جدول ToUnicode', () => {
  assert.equal(fixCMap('<009C> <06440623>\n<0010> <0644>'), '<009C> <06230644>\n<0010> <0644>');
});

test('القالب يهرّب HTML ويخفي الأقسام الفارغة', () => {
  const p = sample.project('formal');
  p.content.ar.about.body = '<script>alert(1)</script>';
  p.input.clients = [];
  const html = renderProfile(p, 'ar', {});
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('sec-clients'));
  assert.ok(html.includes('dir="rtl"'));
  assert.ok(renderProfile(p, 'en', {}).includes('dir="ltr"'));
});
