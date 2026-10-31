'use strict';
(function () {
  const state = { tpl: 'formal', lang: 'ar' };
  const frame = document.getElementById('sampleFrame');
  const wrap = document.getElementById('sampleWrap');
  const pdf = document.getElementById('samplePdf');

  function fit() {
    const scaleBox = wrap.querySelector('.preview-scale');
    const s = Math.min(1, wrap.clientWidth / 794);
    scaleBox.style.transform = `scale(${s})`;
    let h = 1123;
    try {
      h = frame.contentDocument.documentElement.scrollHeight;
    } catch {}
    frame.style.height = h + 'px';
    wrap.style.height = Math.ceil(h * s) + 'px';
    const hero = document.getElementById('heroSample');
    const hf = hero.querySelector('iframe');
    hf.style.transform = `scale(${hero.clientWidth / 794})`;
  }
  function load() {
    frame.src = `/api/sample/preview/${state.lang}?template=${state.tpl}`;
    pdf.href = `/api/sample/pdf/${state.lang}?template=${state.tpl}`;
  }
  document.querySelectorAll('[data-tpl]').forEach((b) =>
    b.addEventListener('click', () => {
      state.tpl = b.dataset.tpl;
      document.querySelectorAll('[data-tpl]').forEach((x) => x.classList.toggle('on', x === b));
      load();
    })
  );
  document.querySelectorAll('[data-lang]').forEach((b) =>
    b.addEventListener('click', () => {
      state.lang = b.dataset.lang;
      document.querySelectorAll('[data-lang]').forEach((x) => x.classList.toggle('on', x === b));
      load();
    })
  );
  frame.addEventListener('load', fit);
  window.addEventListener('resize', fit);
  fit();

  fetch('/api/me')
    .then((r) => r.json())
    .then((me) => {
      const b = document.getElementById('modeBadge');
      b.hidden = false;
      if (me.aiEnabled) {
        b.textContent = 'الصياغة بالذكاء الاصطناعي مفعّلة';
      } else {
        b.className = 'badge badge-demo';
        b.textContent = 'وضع تجريبي: الذكاء الاصطناعي غير مفعّل على هذا الخادم';
      }
    })
    .catch(() => {});
})();
