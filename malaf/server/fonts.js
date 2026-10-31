'use strict';
// خط Readex Pro (رخصة SIL OFL 1.1) — عربي ولاتيني، يُضمَّن داخل PDF ويُقدَّم للمتصفح من /fonts.
// اختير لأن جداول حروفه تربط الأشكال بالحروف العربية الأساسية، فيبقى النص المنسوخ من PDF صحيحًا.
const fs = require('fs');
const path = require('path');

const DIR = path.join(path.dirname(require.resolve('@fontsource/readex-pro/package.json')), 'files');
const WEIGHTS = [400, 600, 700];
const SUBSETS = {
  arabic: 'U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC',
  'latin-ext': 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
  latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
};
const fileName = (subset, w) => `readex-pro-${subset}-${w}-normal.woff2`;

let dataCss = null;
function fontCss(mode = 'url') {
  if (mode === 'data' && dataCss) return dataCss;
  const out = [];
  for (const [subset, range] of Object.entries(SUBSETS)) {
    for (const w of WEIGHTS) {
      const f = fileName(subset, w);
      if (!fs.existsSync(path.join(DIR, f))) continue;
      const src = mode === 'data' ? `data:font/woff2;base64,${fs.readFileSync(path.join(DIR, f)).toString('base64')}` : `/fonts/${f}`;
      out.push(`@font-face{font-family:'Profile Sans';font-style:normal;font-weight:${w};font-display:block;src:url(${src}) format('woff2');unicode-range:${range};}`);
    }
  }
  const css = out.join('\n');
  if (mode === 'data') dataCss = css;
  return css;
}

module.exports = { fontCss, FONT_DIR: DIR };
