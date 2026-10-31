'use strict';
// فحوص ما بعد التوليد: تمنع اختلاق المشاريع، وتنبّه إلى أرقام أو ادعاءات لم يقدّمها المستخدم.

const toLatinDigits = (s) =>
  String(s || '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

const numbersIn = (s) => new Set((toLatinDigits(s).match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.')));

// عبارات تفضيل مطلقة لا تُقبل دون أساس من المستخدم
const CLAIMS = [
  'الرائدة', 'الرائد', 'رائدة', 'الأفضل', 'أفضل شركة', 'الأولى في', 'رقم 1', 'رقم واحد', 'الأكبر', 'الأشهر', 'الأقوى', 'لا مثيل', 'بلا منافس', 'الوحيدة', 'عالمية المستوى', 'ريادية',
  'leading', 'leader in', 'market leader', 'the best', 'best-in-class', 'best in class', '#1', 'number one', 'world-class', 'world class', 'unmatched', 'unrivaled', 'premier', 'top-rated', 'the largest', 'the only',
];

function collectText(content) {
  const parts = [content.tagline, content.about && content.about.body];
  for (const s of (content.services && content.services.items) || []) parts.push(s.name, s.description);
  for (const s of (content.strengths && content.strengths.items) || []) parts.push(s);
  for (const p of (content.projects && content.projects.items) || []) parts.push(p.title, p.description);
  return parts.filter(Boolean).join('\n');
}

/** يربط مشاريع المحتوى بمشاريع المستخدم فقط، ويعيد أي مشروع أسقطه النموذج. */
function enforceProjects(content, input) {
  const byId = new Map(input.projects.map((p) => [p.id, p]));
  const seen = new Set();
  const items = [];
  for (const it of content.projects.items || []) {
    if (byId.has(it.ref) && !seen.has(it.ref)) {
      seen.add(it.ref);
      items.push(it);
    }
  }
  for (const p of input.projects) {
    if (!seen.has(p.id)) items.push({ ref: p.id, title: p.title, description: p.desc });
  }
  content.projects.items = items;
  return content;
}

/** يعيد تنبيهات للمراجعة البشرية: أرقام غير موجودة في المدخلات، وعبارات تفضيل غير مسندة. */
function reviewWarnings(content, input) {
  const warnings = [];
  const inputText = JSON.stringify(input);
  const allowed = numbersIn(inputText);
  const text = collectText(content);
  const bad = [...numbersIn(text)].filter((n) => !allowed.has(n));
  if (bad.length) warnings.push({ type: 'numbers', values: bad.slice(0, 10) });
  const lowerInput = inputText.toLowerCase();
  const lowerText = text.toLowerCase();
  const claims = CLAIMS.filter((c) => lowerText.includes(c.toLowerCase()) && !lowerInput.includes(c.toLowerCase()));
  if (claims.length) warnings.push({ type: 'claims', values: claims });
  return warnings;
}

/** نواقص تُطلب من المستخدم بدل اختلاقها */
function missingInfo(input, lang) {
  const ar = lang !== 'en';
  const m = [];
  if (!input.about) m.push(ar ? 'لم تُدخل نبذة عن الشركة؛ النبذة مبنية على النشاط فقط. أضف نبذة لنتيجة أدق.' : 'No company overview was provided; the About text is based on the activity only.');
  if (!input.services.length) m.push(ar ? 'لم تُدخل خدمات؛ قسم الخدمات سيُخفى حتى تضيفها.' : 'No services were provided; the Services section is hidden until you add some.');
  if (!input.projects.length) m.push(ar ? 'لا توجد مشاريع سابقة؛ قسم المشاريع سيُخفى.' : 'No past projects; the Projects section is hidden.');
  if (!input.strengths.length) m.push(ar ? 'لم تُدخل نقاط تميز؛ لن نضيف ميزات من عندنا.' : 'No differentiators were provided; none will be invented.');
  const c = input.contact;
  if (!c.phone && !c.email && !c.website) m.push(ar ? 'أضف وسيلة تواصل واحدة على الأقل (هاتف أو بريد أو موقع).' : 'Add at least one contact method (phone, email or website).');
  if (!input.logo) m.push(ar ? 'لم يُرفع شعار؛ سيظهر اسم الشركة نصًا بدلًا منه.' : 'No logo uploaded; the company name is shown as text instead.');
  return m;
}

module.exports = { enforceProjects, reviewWarnings, missingInfo, numbersIn, CLAIMS };
