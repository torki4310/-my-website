'use strict';
// إصلاح نسخ النص العربي من PDF:
// النص العربي يُرسم في PDF بالترتيب المرئي (من اليسار)، وقارئات PDF (pdf.js في المتصفحات، Poppler)
// تعكس كل مقطع عربي لتستعيد الترتيب المنطقي. رباط "لا" شكل واحد يقابله حرفان (لام + ألف)،
// فتنعكس الحرفان معه ويظهر "لأنظمة" عند النسخ "ألنظمة".
// الحل: نكتب حرفي الرباط في جدول ToUnicode بالترتيب المرئي (ألف + لام) لتعيدهما القارئات صحيحين.
const zlib = require('zlib');
const { PDFDocument, PDFName, PDFRawStream } = require('pdf-lib');

const ALEFS = ['0627', '0623', '0625', '0622'];
const RE = new RegExp(`<0644(${ALEFS.join('|')})>`, 'gi');

function fixCMap(text) {
  return text.replace(RE, (m, alef) => `<${alef}0644>`);
}

async function fixArabicToUnicode(pdfBytes) {
  const doc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const ctx = doc.context;
  let changed = 0;
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    if (!obj || !obj.dict || typeof obj.dict.get !== 'function') continue;
    const tu = obj.dict.get(PDFName.of('ToUnicode'));
    if (!tu) continue;
    const stream = ctx.lookup(tu);
    if (!(stream instanceof PDFRawStream)) continue;
    const filter = stream.dict.get(PDFName.of('Filter'));
    const flate = filter && filter.toString() === '/FlateDecode';
    const raw = Buffer.from(stream.contents);
    const text = (flate ? zlib.inflateSync(raw) : raw).toString('latin1');
    const fixed = fixCMap(text);
    if (fixed === text) continue;
    const bytes = Buffer.from(fixed, 'latin1');
    const out = flate ? zlib.deflateSync(bytes) : bytes;
    const replacement = PDFRawStream.of(stream.dict, new Uint8Array(out));
    stream.dict.set(PDFName.of('Length'), ctx.obj(out.length));
    ctx.assign(tu, replacement);
    changed++;
  }
  if (!changed) return pdfBytes;
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

module.exports = { fixArabicToUnicode, fixCMap };
