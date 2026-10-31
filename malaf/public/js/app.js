'use strict';
/* ملف شركتي — واجهة المحرر (بدون أطر عمل). كل النصوص تُدرج عبر textContent لمنع حقن HTML. */
(function () {
  // ---------- أدوات ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const $root = document.getElementById('root');
  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
  const clone = (o) => JSON.parse(JSON.stringify(o));

  async function api(path, opts = {}) {
    const init = { method: opts.method || 'GET', headers: { 'X-Requested-With': 'malaf' }, credentials: 'same-origin' };
    if (opts.json !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.json);
    }
    if (opts.form) init.body = opts.form;
    let res;
    try {
      res = await fetch('/api' + path, init);
    } catch {
      throw new Error('تعذر الاتصال بالخادم. تحقق من الإنترنت.');
    }
    const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
    if (!res.ok) throw new Error((data && data.message) || `خطأ (${res.status})`);
    return data;
  }

  let toastTimer;
  function toast(msg) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const t = h('div', { class: 'toast', role: 'status' }, msg);
    document.body.append(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 4500);
  }

  async function busy(btn, label, fn) {
    const old = Array.from(btn.childNodes);
    btn.disabled = true;
    btn.replaceChildren(h('span', { class: 'spinner' }), ' ', label);
    try {
      return await fn();
    } catch (e) {
      toast(e.message);
    } finally {
      btn.disabled = false;
      btn.replaceChildren(...old);
    }
  }

  // ---------- الحالة ----------
  const S = { me: null, project: null, step: 0, lang: 'ar', pending: {}, saveTimer: null, saving: null };
  const STEPS = [
    { key: 'basics', t: 'الأساسيات' },
    { key: 'about', t: 'النبذة والخدمات' },
    { key: 'projects', t: 'المشاريع السابقة' },
    { key: 'clients', t: 'العملاء والشهادات' },
    { key: 'contact', t: 'التواصل والهوية' },
    { key: 'generate', t: 'اللغة والتوليد' },
    { key: 'review', t: 'مراجعة المحتوى' },
    { key: 'design', t: 'القالب والتنزيل' },
  ];
  const SECTION_NAMES = { cover: 'الغلاف', about: 'من نحن', services: 'الخدمات', strengths: 'نقاط التميز', projects: 'المشاريع', clients: 'العملاء', certifications: 'الشهادات', contact: 'التواصل' };
  const LANG_NAMES = { ar: 'العربية', en: 'English' };

  // ---------- الحفظ التلقائي ----------
  const saveEl = document.getElementById('saveState');
  function setSave(state, txt) {
    saveEl.hidden = !S.project;
    saveEl.querySelector('.dot').className = 'dot ' + (state || '');
    saveEl.querySelector('.txt').textContent = txt;
  }
  function markDirty(part) {
    S.pending[part] = true;
    setSave('saving', 'جارٍ الحفظ…');
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(flush, 700);
  }
  async function flush() {
    clearTimeout(S.saveTimer);
    if (S.saving) await S.saving;
    const parts = Object.keys(S.pending);
    if (!parts.length || !S.project) return;
    S.pending = {};
    const body = {};
    for (const p of parts) body[p] = S.project[p];
    S.saving = api(`/projects/${S.project.id}`, { method: 'PUT', json: body })
      .then((p) => {
        S.project.files = p.files;
        S.project.meta = p.meta;
        S.project.inputUpdatedAt = p.inputUpdatedAt;
        setSave('', 'محفوظ');
        if (S.onSaved) S.onSaved(parts);
      })
      .catch((e) => {
        for (const p of parts) S.pending[p] = true;
        setSave('err', 'لم يُحفظ — ' + e.message);
      })
      .finally(() => (S.saving = null));
    return S.saving;
  }
  window.addEventListener('beforeunload', (e) => {
    if (Object.keys(S.pending).length) {
      flush();
      e.preventDefault();
    }
  });

  // ---------- عناصر النماذج ----------
  function field(label, control, hint, optional) {
    const id = 'f' + rid();
    control.id = id;
    return h('div', { class: 'field' }, h('label', { for: id }, label, optional ? h('span', { class: 'opt' }, ' (اختياري)') : null), control, hint ? h('span', { class: 'hint' }, hint) : null);
  }
  function text(obj, key, part, attrs = {}) {
    return h('input', { type: 'text', value: obj[key] || '', oninput: (e) => { obj[key] = e.target.value; markDirty(part); }, ...attrs });
  }
  function area(obj, key, part, attrs = {}) {
    return h('textarea', { oninput: (e) => { obj[key] = e.target.value; markDirty(part); }, ...attrs }, obj[key] || '');
  }
  // قائمة: سطر لكل عنصر
  function linesArea(obj, key, part, attrs = {}, splitRe = /\n/) {
    return h('textarea', { oninput: (e) => { obj[key] = e.target.value.split(splitRe).map((s) => s.trim()).filter(Boolean); markDirty(part); }, ...attrs }, (obj[key] || []).join('\n'));
  }
  function fileUrl(fid) {
    return `/api/projects/${S.project.id}/files/${fid}`;
  }
  async function uploadFile(file, kind) {
    const max = (S.me && S.me.limits.maxFileMB) || 5;
    if (file.size > max * 1048576) throw new Error(`حجم «${file.name}» يتجاوز ${max} ميغابايت`);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error(`«${file.name}»: الصيغ المقبولة PNG أو JPG أو WebP`);
    const fd = new FormData();
    fd.append('kind', kind);
    fd.append('file', file);
    const meta = await api(`/projects/${S.project.id}/files`, { method: 'POST', form: fd });
    S.project.files.push(meta);
    return meta;
  }

  // ---------- قائمة المشاريع ----------
  async function viewList() {
    S.project = null;
    setSave('', '');
    saveEl.hidden = true;
    $root.replaceChildren(h('div', { class: 'empty' }, 'جارٍ التحميل…'));
    let list = [];
    try {
      list = await api('/projects');
    } catch (e) {
      $root.replaceChildren(h('div', { class: 'notice notice-danger' }, e.message));
      return;
    }
    const newBtn = h('button', { class: 'btn btn-primary', onclick: () => createProject(newBtn) }, '+ مشروع جديد');
    const cards = list.map((p) =>
      h('div', { class: 'card' },
        h('h3', {}, p.name),
        h('p', { class: 'muted small' }, 'آخر تعديل: ', new Date(p.updatedAt).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' })),
        h('p', { class: 'small' }, p.hasContent ? `المحتوى جاهز (${p.languages.map((l) => LANG_NAMES[l]).join(' + ')})` : 'مسودة — لم يُولَّد المحتوى بعد'),
        h('div', { class: 'row' },
          h('a', { class: 'btn btn-primary btn-sm', href: `#p/${p.id}/0` }, 'متابعة التحرير'),
          h('button', { class: 'btn btn-danger btn-sm', onclick: () => deleteProject(p.id, p.name) }, 'حذف'))
      )
    );
    $root.replaceChildren(
      h('div', { style: 'padding:28px 0 60px' },
        h('div', { class: 'spread', style: 'margin-bottom:18px' }, h('h1', { style: 'font-size:1.6rem;margin:0' }, 'مشاريعي'), newBtn),
        h('p', { class: 'muted small' }, 'مسوداتك محفوظة على الخادم ومرتبطة بهذا المتصفح فقط، ولا يراها أحد غيرك. مسح ملفات تعريف الارتباط يفقدك الوصول إليها.'),
        cards.length ? h('div', { class: 'projects-grid' }, cards) : h('div', { class: 'card empty' }, h('p', {}, 'لا توجد مشاريع بعد.'), newBtn.cloneNode(true)))
    );
    const emptyBtn = $root.querySelector('.empty .btn');
    if (emptyBtn) emptyBtn.addEventListener('click', () => createProject(emptyBtn));
  }

  async function createProject(btn) {
    await busy(btn || h('button'), 'جارٍ الإنشاء…', async () => {
      const p = await api('/projects', { method: 'POST', json: {} });
      location.hash = `#p/${p.id}/0`;
    });
  }

  async function deleteProject(id, name) {
    if (!confirm(`حذف «${name}» نهائيًا مع كل صوره وملفاته؟ لا يمكن التراجع.`)) return;
    try {
      await api(`/projects/${id}`, { method: 'DELETE' });
      S.pending = {};
      toast('حُذف المشروع وملفاته');
      if (location.hash === '#list' || location.hash === '') viewList();
      else location.hash = '#list';
    } catch (e) {
      toast(e.message);
    }
  }

  // ---------- المحرر ----------
  async function openProject(id, step) {
    if (!S.project || S.project.id !== id) {
      await flush();
      $root.replaceChildren(h('div', { class: 'empty' }, 'جارٍ التحميل…'));
      try {
        S.project = await api(`/projects/${id}`);
      } catch (e) {
        $root.replaceChildren(h('div', { class: 'notice notice-danger', style: 'margin-top:24px' }, e.message, ' ', h('a', { href: '#list' }, 'العودة لمشاريعي')));
        return;
      }
      S.lang = S.project.languages[0] || 'ar';
      setSave('', 'محفوظ');
    }
    S.step = Math.max(0, Math.min(STEPS.length - 1, step | 0));
    renderEditor();
  }

  function go(step) {
    flush();
    location.hash = `#p/${S.project.id}/${step}`;
  }

  function renderEditor() {
    S.onSaved = null;
    const p = S.project;
    const hasContent = Object.keys(p.content || {}).length > 0;
    const nav = h('ol', { class: 'steps', 'aria-label': 'خطوات الإنشاء' },
      STEPS.map((s, i) =>
        h('li', {}, h('button', {
          class: (i === S.step ? 'active ' : '') + (i < S.step ? 'done' : ''),
          'aria-current': i === S.step ? 'step' : null,
          disabled: i > 5 && !hasContent ? true : null,
          title: i > 5 && !hasContent ? 'ولّد المحتوى أولًا' : null,
          onclick: () => go(i),
        }, h('span', { class: 'n' }, String(i + 1)), h('span', { class: 't' }, s.t)))
      )
    );
    const panel = h('section', { class: 'panel card' });
    const views = [stepBasics, stepAbout, stepProjects, stepClients, stepContact, stepGenerate, stepReview, stepDesign];
    views[S.step](panel);
    $root.replaceChildren(h('div', { class: 'app' }, nav, h('div', {}, panel)));
    window.scrollTo({ top: 0 });
  }

  function actions(prevLabel, nextLabel, nextFn) {
    return h('div', { class: 'panel-actions' },
      S.step > 0 ? h('button', { class: 'btn btn-ghost', onclick: () => go(S.step - 1) }, '→ ', prevLabel || 'السابق') : h('span'),
      nextLabel ? h('button', { class: 'btn btn-primary', onclick: nextFn || (() => go(S.step + 1)) }, nextLabel, ' ←') : null
    );
  }

  // 1) الأساسيات
  function stepBasics(panel) {
    const inp = S.project.input;
    panel.append(
      h('h2', {}, 'معلومات الشركة الأساسية'),
      h('p', { class: 'muted' }, 'اكتب بأسلوبك؛ سنحسّن الصياغة لاحقًا. لا تحتاج لكتابة نص تسويقي.'),
      field('اسم الشركة', text(inp, 'companyName', 'input', { required: true, maxlength: 120, autocomplete: 'organization' })),
      field('الاسم الرسمي بالإنجليزية', text(inp, 'companyNameEn', 'input', { dir: 'ltr', maxlength: 120 }), 'يُستخدم في النسخة الإنجليزية. إن تركته فارغًا سيُكتب الاسم بحروف لاتينية ويُطلب منك تأكيده.', true),
      field('نشاط الشركة', area(inp, 'activity', 'input', { rows: 2, maxlength: 300, placeholder: 'مثال: صيانة أنظمة التكييف والكهرباء للمباني التجارية' })),
      h('div', { class: 'grid2' },
        field('سنة التأسيس', text(inp, 'foundedYear', 'input', { inputmode: 'numeric', maxlength: 4, pattern: '\\d{4}', dir: 'ltr', placeholder: '2016' }), 'أربعة أرقام', true),
        field('المدن التي تخدمها', linesArea(inp, 'cities', 'input', { rows: 2, placeholder: 'الرياض، جدة' }, /[،,\n]/), 'افصل بينها بفاصلة', true)
      ),
      actions(null, 'التالي')
    );
  }

  // 2) النبذة والخدمات
  function stepAbout(panel) {
    const inp = S.project.input;
    const list = h('div');
    const drawServices = () => {
      list.replaceChildren(
        ...inp.services.map((s, i) =>
          h('div', { class: 'repeater-item' },
            h('div', { class: 'repeater-head' }, h('b', {}, `خدمة ${i + 1}`), h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { inp.services.splice(i, 1); markDirty('input'); drawServices(); } }, 'حذف')),
            field('اسم الخدمة', text(s, 'name', 'input', { maxlength: 120 })),
            field('وصف مختصر', area(s, 'desc', 'input', { rows: 2, maxlength: 1200 }), null, true)
          )
        )
      );
    };
    drawServices();
    panel.append(
      h('h2', {}, 'النبذة والخدمات ونقاط التميز'),
      field('نبذة أولية عن الشركة', area(inp, 'about', 'input', { rows: 6, maxlength: 6000, placeholder: 'ماذا تقدمون؟ لمن؟ كيف تعملون؟ اكتب الحقائق كما هي.' }), 'اذكر حقائق فقط. لن نضيف أرقامًا أو إنجازات لم تذكرها.'),
      h('div', { class: 'label', style: 'margin:8px 0' }, 'الخدمات'),
      list,
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { inp.services.push({ name: '', desc: '' }); markDirty('input'); drawServices(); } }, '+ أضف خدمة'),
      h('div', { style: 'height:16px' }),
      field('نقاط التميز', linesArea(inp, 'strengths', 'input', { rows: 4, placeholder: 'سطر لكل نقطة، مثال:\nفريق يعمل بنظام المناوبات\nتقرير مكتوب بعد كل زيارة' }), 'سطر لكل نقطة. اذكر ما يمكنك إثباته.', true),
      actions(null, 'التالي')
    );
  }

  // 3) المشاريع
  function stepProjects(panel) {
    const inp = S.project.input;
    const list = h('div');
    const draw = () => {
      list.replaceChildren(
        ...(inp.projects.length ? [] : [h('p', { class: 'muted' }, 'لا توجد مشاريع. هذا القسم اختياري، وسيُخفى من الملف إن بقي فارغًا.')]),
        ...inp.projects.map((pr, i) => {
          const thumbs = h('div', { class: 'thumbs' },
            pr.images.map((fid) => h('div', { class: 'thumb' },
              h('img', { src: fileUrl(fid), alt: '' }),
              h('button', { 'aria-label': 'إزالة الصورة', onclick: () => { pr.images = pr.images.filter((x) => x !== fid); markDirty('input'); draw(); } }, '×')))
          );
          const fileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: true });
          const upLabel = h('label', { class: 'btn btn-ghost btn-sm upload' }, fileInput, '+ صور المشروع');
          fileInput.addEventListener('change', async () => {
            const files = Array.from(fileInput.files).slice(0, 6 - pr.images.length);
            for (const f of files) {
              try {
                upLabel.lastChild.textContent = ` جارٍ رفع ${f.name}…`;
                const meta = await uploadFile(f, 'image');
                pr.images.push(meta.id);
                markDirty('input');
              } catch (e) {
                toast(e.message);
              }
            }
            await flush();
            draw();
          });
          return h('div', { class: 'repeater-item' },
            h('div', { class: 'repeater-head' }, h('b', {}, `مشروع ${i + 1}`), h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { if (confirm('حذف هذا المشروع؟')) { inp.projects.splice(i, 1); markDirty('input'); draw(); } } }, 'حذف')),
            field('اسم المشروع', text(pr, 'title', 'input', { maxlength: 160 })),
            h('div', { class: 'grid2' },
              field('العميل', text(pr, 'client', 'input', { maxlength: 160 }), 'اكتبه فقط إن كان مسموحًا بذكره', true),
              field('السنة', text(pr, 'year', 'input', { maxlength: 4, inputmode: 'numeric', dir: 'ltr' }), null, true)),
            field('وصف المشروع', area(pr, 'desc', 'input', { rows: 3, maxlength: 2500 }), 'ما الذي نفذتموه؟', true),
            h('div', { class: 'label' }, 'الصور ', h('span', { class: 'opt' }, `(حتى 6 صور، ${S.me ? S.me.limits.maxFileMB : 5} ميغابايت للصورة — صور حقيقية من أعمالكم)`)),
            thumbs,
            pr.images.length < 6 ? upLabel : null
          );
        })
      );
    };
    draw();
    panel.append(
      h('h2', {}, 'المشاريع السابقة'),
      h('p', { class: 'muted' }, 'تُعرض الصور بنسبها الأصلية دون قص أو تشويه. لا ننشئ صورًا وهمية لمشاريع.'),
      list,
      inp.projects.length < 20 ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { inp.projects.push({ id: rid(), title: '', client: '', year: '', desc: '', images: [] }); markDirty('input'); draw(); } }, '+ أضف مشروعًا') : null,
      actions(null, 'التالي')
    );
  }

  // 4) العملاء والشهادات
  function stepClients(panel) {
    const inp = S.project.input;
    panel.append(
      h('h2', {}, 'العملاء والشهادات'),
      h('div', { class: 'notice notice-info' }, h('p', {}, 'هذه الحقول اختيارية. أدخل فقط أسماء عملاء وشهادات حقيقية يحق لك ذكرها؛ ستظهر كما كتبتها تمامًا ولن يضيف الذكاء الاصطناعي غيرها.')),
      field('العملاء', linesArea(inp, 'clients', 'input', { rows: 4, placeholder: 'سطر لكل عميل' }), null, true),
      field('الشهادات والاعتمادات', linesArea(inp, 'certifications', 'input', { rows: 3, placeholder: 'سطر لكل شهادة، مثال: سجل تجاري رقم …' }), null, true),
      actions(null, 'التالي')
    );
  }

  // 5) التواصل والهوية
  function stepContact(panel) {
    const inp = S.project.input;
    const c = inp.contact;
    const logoBox = h('div', { class: 'logo-box' });
    const drawLogo = () => logoBox.replaceChildren(inp.logo ? h('img', { src: fileUrl(inp.logo), alt: 'الشعار' }) : h('span', { class: 'muted small' }, 'لا يوجد شعار'));
    drawLogo();
    const logoInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' });
    const logoLabel = h('label', { class: 'btn btn-ghost btn-sm upload' }, logoInput, inp.logo ? 'تغيير الشعار' : 'ارفع الشعار');
    logoInput.addEventListener('change', async () => {
      const f = logoInput.files[0];
      if (!f) return;
      await busy(logoLabel, 'جارٍ الرفع…', async () => {
        const meta = await uploadFile(f, 'logo');
        inp.logo = meta.id;
        markDirty('input');
        await flush();
        drawLogo();
      });
    });
    const removeLogo = h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { inp.logo = null; markDirty('input'); drawLogo(); } }, 'إزالة');
    const colorInput = (key, label) =>
      h('label', {}, h('input', { type: 'color', value: inp.colors[key], oninput: (e) => { inp.colors[key] = e.target.value; S.project.design[key] = e.target.value; markDirty('input'); markDirty('design'); } }), label);
    panel.append(
      h('h2', {}, 'بيانات التواصل والهوية'),
      h('div', { class: 'grid2' },
        field('الهاتف', text(c, 'phone', 'input', { type: 'tel', dir: 'ltr', autocomplete: 'tel' })),
        field('البريد الإلكتروني', text(c, 'email', 'input', { type: 'email', dir: 'ltr', autocomplete: 'email' })),
        field('الموقع الإلكتروني', text(c, 'website', 'input', { dir: 'ltr' }), null, true),
        field('حسابات التواصل الاجتماعي', text(c, 'social', 'input', { dir: 'ltr', placeholder: '@company' }), null, true)),
      field('العنوان', area(c, 'address', 'input', { rows: 2 }), null, true),
      h('div', { class: 'label', style: 'margin-bottom:8px' }, 'الشعار ', h('span', { class: 'opt' }, '(اختياري — PNG بخلفية شفافة أفضل)')),
      h('div', { class: 'row', style: 'margin-bottom:18px' }, logoBox, h('div', { class: 'row' }, logoLabel, inp.logo ? removeLogo : null)),
      h('div', { class: 'label', style: 'margin-bottom:8px' }, 'ألوان الهوية'),
      h('div', { class: 'color-row' }, colorInput('primary', 'اللون الأساسي'), colorInput('accent', 'اللون الثانوي')),
      actions(null, 'التالي')
    );
  }

  // 6) اللغة والتوليد
  function stepGenerate(panel) {
    const p = S.project;
    const inp = p.input;
    const langs = new Set(p.languages);
    const box = (l) => {
      const cb = h('input', { type: 'checkbox', checked: langs.has(l) });
      const lab = h('label', { class: 'check' + (langs.has(l) ? ' on' : '') }, cb, LANG_NAMES[l]);
      cb.addEventListener('change', () => {
        if (cb.checked) langs.add(l);
        else langs.delete(l);
        if (!langs.size) { langs.add(l); cb.checked = true; toast('اختر لغة واحدة على الأقل'); }
        lab.classList.toggle('on', cb.checked);
      });
      return lab;
    };
    const missingBasics = [];
    if (!inp.companyName) missingBasics.push('اسم الشركة');
    if (!inp.activity) missingBasics.push('نشاط الشركة');
    const hasContent = Object.keys(p.content).length > 0;
    const genBtn = h('button', { class: 'btn btn-primary btn-lg', disabled: missingBasics.length ? true : null }, hasContent ? 'أعد توليد المسودة' : 'ولّد مسودة المحتوى');
    genBtn.addEventListener('click', () => {
      if (hasContent && !confirm('سيستبدل التوليد الجديد النصوص التي عدّلتها في اللغات المختارة. متابعة؟')) return;
      busy(genBtn, 'جارٍ التوليد… قد يستغرق دقيقة', async () => {
        await flush();
        const order = ['ar', 'en'].filter((l) => langs.has(l));
        const res = await api(`/projects/${p.id}/generate`, { method: 'POST', json: { languages: order } });
        S.project = res;
        S.lang = order[0];
        go(6);
      });
    });
    panel.append(
      h('h2', {}, 'اللغة وتوليد المسودة'),
      S.me && !S.me.aiEnabled
        ? h('div', { class: 'notice notice-warn' }, h('p', {}, h('b', {}, 'وضع تجريبي: '), 'الذكاء الاصطناعي غير مفعّل على هذا الخادم. سيُبنى الملف من نصوصك كما أدخلتها مع عناوين جاهزة، دون تحسين صياغة أو ترجمة. هذا ليس توليدًا حقيقيًا.'))
        : h('div', { class: 'notice notice-info' }, h('p', {}, 'سيصوغ الذكاء الاصطناعي المحتوى من معلوماتك فقط، دون اختلاق أرقام أو عملاء أو إنجازات. ستراجع كل شيء قبل التنزيل.')),
      h('div', { class: 'label', style: 'margin-bottom:8px' }, 'لغة الملف'),
      h('div', { class: 'checks', style: 'margin-bottom:6px' }, box('ar'), box('en')),
      h('p', { class: 'hint muted small' }, 'عند اختيار اللغتين تُنشأ نسختان منفصلتان، ولكل منهما ملف PDF خاص.'),
      missingBasics.length ? h('div', { class: 'notice notice-danger' }, h('p', {}, 'أكمل أولًا: ', missingBasics.join('، '), ' — ', h('a', { href: `#p/${p.id}/0` }, 'الأساسيات'))) : null,
      h('div', { style: 'margin:18px 0' }, genBtn),
      actions(null, hasContent ? 'إلى المراجعة' : null)
    );
  }

  // 7) المراجعة والتحرير
  function langTabs(onChange) {
    const p = S.project;
    const avail = ['ar', 'en'].filter((l) => p.content[l]);
    if (!avail.includes(S.lang)) S.lang = avail[0];
    return h('div', { class: 'tabs', role: 'tablist' },
      avail.map((l) => h('button', { role: 'tab', class: l === S.lang ? 'active' : '', 'aria-selected': String(l === S.lang), onclick: () => { S.lang = l; onChange(); } }, LANG_NAMES[l])));
  }

  function stepReview(panel) {
    const p = S.project;
    if (!Object.keys(p.content).length) return go(5);
    const body = h('div');
    const draw = () => {
      const l = S.lang;
      const c = p.content[l];
      const meta = (p.meta && p.meta[l]) || {};
      const dir = l === 'ar' ? 'rtl' : 'ltr';
      const t = (obj, key, attrs = {}) => text(obj, key, 'content', { dir, ...attrs });
      const a = (obj, key, attrs = {}) => area(obj, key, 'content', { dir, ...attrs });
      const notices = [];
      if (meta.mode === 'demo') notices.push(h('div', { class: 'notice notice-warn' }, h('p', {}, h('b', {}, 'وضع تجريبي: '), 'هذا المحتوى هو نصك كما أدخلته مع عناوين قياسية، وليس توليدًا بالذكاء الاصطناعي.')));
      if (p.inputUpdatedAt && meta.generatedAt && p.inputUpdatedAt > meta.generatedAt)
        notices.push(h('div', { class: 'notice notice-info' }, h('p', {}, 'عدّلت بياناتك بعد التوليد. الشعار والصور والتواصل والعملاء تُحدَّث تلقائيًا، أما النصوص فعدّلها هنا أو ', h('a', { href: `#p/${p.id}/5` }, 'أعد التوليد'), '.')));
      if (meta.missing && meta.missing.length) notices.push(h('div', { class: 'notice notice-info' }, h('b', {}, 'معلومات ناقصة أو مطلوبة منك:'), h('ul', {}, meta.missing.map((m) => h('li', {}, m)))));
      for (const w of meta.warnings || []) {
        if (w.type === 'numbers') notices.push(h('div', { class: 'notice notice-warn' }, h('b', {}, 'تحقق من هذه الأرقام: '), w.values.join('، '), h('p', { class: 'small' }, 'لم نجدها في بياناتك. احذفها أو تأكد من صحتها قبل التنزيل.')));
        if (w.type === 'claims') notices.push(h('div', { class: 'notice notice-warn' }, h('b', {}, 'عبارات تفضيل غير مسندة: '), w.values.join('، '), h('p', { class: 'small' }, 'لم تذكر ما يثبتها. احذفها أو عدّلها.')));
      }

      const rewriteBox = (key) => {
        if (S.me && !S.me.aiEnabled) return null;
        const instr = h('input', { type: 'text', placeholder: 'توجيه اختياري: أقصر، أكثر رسمية…', maxlength: 300, 'aria-label': 'توجيه إعادة الصياغة' });
        const btn = h('button', { class: 'btn btn-ghost btn-sm', disabled: S.me && !S.me.aiEnabled ? true : null, title: S.me && !S.me.aiEnabled ? 'يتطلب تفعيل الذكاء الاصطناعي' : null }, 'أعد صياغة هذا القسم');
        btn.addEventListener('click', () =>
          busy(btn, 'جارٍ إعادة الصياغة…', async () => {
            await flush();
            const res = await api(`/projects/${p.id}/rewrite`, { method: 'POST', json: { lang: l, section: key, instruction: instr.value } });
            S.project = res;
            renderEditor();
            toast(`أُعيدت صياغة «${SECTION_NAMES[key]}» فقط`);
          })
        );
        return h('div', { class: 'rewrite' }, instr, btn);
      };
      const card = (key, ...kids) => h('div', { class: 'sec-card' }, h('div', { class: 'spread', style: 'margin-bottom:10px' }, h('h3', {}, SECTION_NAMES[key])), ...kids, rewriteBox(key));

      const servicesList = h('div');
      const drawServices = () =>
        servicesList.replaceChildren(
          ...c.services.items.map((s, i) =>
            h('div', { class: 'repeater-item' },
              h('div', { class: 'repeater-head' }, t(s, 'name', { 'aria-label': 'اسم الخدمة' }), h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { c.services.items.splice(i, 1); markDirty('content'); drawServices(); } }, 'حذف')),
              a(s, 'description', { rows: 2, 'aria-label': 'وصف الخدمة' })))
        );
      drawServices();
      const projById = new Map(p.input.projects.map((x) => [x.id, x]));

      body.replaceChildren(
        ...notices,
        card('cover', field('اسم الشركة كما يظهر في هذه النسخة', t(c, 'companyName')), field('العبارة التعريفية', a(c, 'tagline', { rows: 2 }))),
        card('about', field('العنوان', t(c.about, 'heading')), field('النص', a(c.about, 'body', { rows: 8 }), 'سطر فارغ بين الفقرات')),
        card('services', field('العنوان', t(c.services, 'heading')), servicesList, h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { c.services.items.push({ name: '', description: '' }); markDirty('content'); drawServices(); } }, '+ خدمة')),
        card('strengths', field('العنوان', t(c.strengths, 'heading')), field('النقاط', linesArea(c.strengths, 'items', 'content', { rows: 4, dir }), 'سطر لكل نقطة')),
        card('projects', field('العنوان', t(c.projects, 'heading')),
          c.projects.items.length ? c.projects.items.map((it) => h('div', { class: 'repeater-item' },
            h('div', { class: 'small muted', style: 'margin-bottom:6px' }, 'المشروع الأصلي: ', (projById.get(it.ref) || {}).title || ''),
            field('اسم المشروع', t(it, 'title')), field('الوصف', a(it, 'description', { rows: 3 })))) : h('p', { class: 'muted small' }, 'لا توجد مشاريع؛ القسم مخفي تلقائيًا.')),
        card('clients', field('العنوان', t(c.clients, 'heading')), h('p', { class: 'muted small' }, p.input.clients.length ? 'الأسماء تؤخذ كما أدخلتها: ' + p.input.clients.join('، ') : 'لم تُدخل عملاء؛ القسم مخفي تلقائيًا.')),
        card('certifications', field('العنوان', t(c.certifications, 'heading')), h('p', { class: 'muted small' }, p.input.certifications.length ? 'تؤخذ كما أدخلتها.' : 'لم تُدخل شهادات؛ القسم مخفي تلقائيًا.')),
        card('contact', field('العنوان', t(c.contact, 'heading')), field('العنوان البريدي في هذه النسخة', a(c, 'address', { rows: 2 })))
      );
    };
    const tabsHolder = h('div');
    const redraw = () => { tabsHolder.replaceChildren(langTabs(redraw)); draw(); translateRow(); };
    const trRow = h('div', { class: 'row', style: 'margin-bottom:14px' });
    const translateRow = () => {
      const other = S.lang === 'ar' ? 'en' : 'ar';
      if (!S.me || !S.me.aiEnabled) return trRow.replaceChildren();
      const btn = h('button', { class: 'btn btn-ghost btn-sm' }, `ترجم هذه النسخة المحررة إلى ${LANG_NAMES[other]}`);
      btn.addEventListener('click', () => {
        if (p.content[other] && !confirm(`ستُستبدل نسخة ${LANG_NAMES[other]} الحالية. متابعة؟`)) return;
        busy(btn, 'جارٍ الترجمة…', async () => {
          await flush();
          S.project = await api(`/projects/${p.id}/translate`, { method: 'POST', json: { from: S.lang, to: other } });
          S.lang = other;
          renderEditor();
        });
      });
      trRow.replaceChildren(btn);
    };
    panel.append(h('h2', {}, 'راجع المحتوى وعدّله'), h('p', { class: 'muted' }, 'التعديلات تُحفظ تلقائيًا. إعادة صياغة قسم لا تغيّر باقي الأقسام.'), tabsHolder, trRow, body, actions(null, 'القالب والتنزيل'));
    redraw();
  }

  // 8) القالب والتصميم والتنزيل
  function stepDesign(panel) {
    const p = S.project;
    if (!Object.keys(p.content).length) return go(5);
    const d = p.design;
    const frame = h('iframe', { title: 'معاينة الملف' });
    const scaleBox = h('div', { class: 'preview-scale' }, frame);
    const wrap = h('div', { class: 'preview-wrap' }, scaleBox);
    const fit = () => {
      const s = Math.min(1, wrap.clientWidth / 794 || 1);
      scaleBox.style.transform = `scale(${s})`;
      let hgt = 1123;
      try { hgt = frame.contentDocument.documentElement.scrollHeight; } catch {}
      frame.style.height = hgt + 'px';
      wrap.style.height = Math.ceil(hgt * s) + 'px';
    };
    frame.addEventListener('load', () => { fit(); setTimeout(fit, 400); });
    window.onresize = fit;
    const reload = () => (frame.src = `/api/projects/${p.id}/preview/${S.lang}?t=${Date.now()}`);
    S.onSaved = (parts) => { if (parts.includes('design')) reload(); };

    const tpl = (key, title, desc) =>
      h('button', { class: 'tpl-card' + (d.template === key ? ' on' : ''), onclick: (e) => { d.template = key; markDirty('design'); e.currentTarget.parentNode.querySelectorAll('.tpl-card').forEach((x) => x.classList.toggle('on', x === e.currentTarget)); } }, h('b', {}, title), h('span', { class: 'small muted' }, desc));
    const color = (key, label) => h('label', {}, h('input', { type: 'color', value: d[key], onchange: (e) => { d[key] = e.target.value; markDirty('design'); } }), label);

    const secList = h('ul', { class: 'sections-list' });
    const drawSecs = () =>
      secList.replaceChildren(
        ...d.sections.map((s, i) => {
          const cb = h('input', { type: 'checkbox', checked: s.visible, 'aria-label': 'إظهار ' + SECTION_NAMES[s.key], onchange: () => { s.visible = cb.checked; markDirty('design'); drawSecs(); } });
          const move = (delta) => { const j = i + delta; if (j < 1 || j >= d.sections.length) return; [d.sections[i], d.sections[j]] = [d.sections[j], d.sections[i]]; markDirty('design'); drawSecs(); };
          return h('li', { class: s.visible ? '' : 'hidden-sec' }, cb, h('span', { class: 'name' }, SECTION_NAMES[s.key]),
            s.key === 'cover' ? h('span', { class: 'small muted' }, 'ثابت أولًا') : [
              h('button', { class: 'btn btn-ghost icon-btn', 'aria-label': 'تحريك لأعلى', disabled: i <= 1 ? true : null, onclick: () => move(-1) }, '↑'),
              h('button', { class: 'btn btn-ghost icon-btn', 'aria-label': 'تحريك لأسفل', disabled: i >= d.sections.length - 1 ? true : null, onclick: () => move(1) }, '↓')]);
        })
      );
    drawSecs();

    const pdfArea = h('div');
    const langs = ['ar', 'en'].filter((l) => p.content[l]);
    const downloads = h('div', { class: 'row' }, langs.map((l) => h('a', { class: 'btn btn-primary', href: `/api/projects/${p.id}/pdf/${l}?download=1`, onclick: () => flush() }, `تنزيل PDF — ${LANG_NAMES[l]}`)));
    const pdfBtn = h('button', { class: 'btn btn-ghost' }, 'معاينة الصفحات الفعلية (PDF)');
    pdfBtn.addEventListener('click', async () => {
      await flush();
      const url = `/api/projects/${p.id}/pdf/${S.lang}?t=${Date.now()}`;
      pdfArea.replaceChildren(
        h('div', { class: 'spread', style: 'margin:14px 0 8px' }, h('b', {}, 'صفحات PDF كما ستُنزَّل'), h('a', { href: url, target: '_blank', rel: 'noopener', class: 'small' }, 'افتح في نافذة جديدة')),
        h('iframe', { class: 'pdf-frame', src: url, title: 'معاينة PDF' })
      );
    });
    const tabsHolder = h('div');
    const redrawTabs = () => { tabsHolder.replaceChildren(langTabs(() => { redrawTabs(); reload(); pdfArea.replaceChildren(); })); };
    redrawTabs();

    const delBtn = h('button', { class: 'btn btn-danger btn-sm', onclick: () => deleteProject(p.id, p.input.companyName || 'المشروع') }, 'حذف المشروع وكل ملفاته');

    panel.append(
      h('h2', {}, 'القالب والمعاينة والتنزيل'),
      h('div', { class: 'design-grid' },
        h('div', {},
          h('div', { class: 'label', style: 'margin-bottom:8px' }, 'القالب'),
          h('div', { class: 'tpl-cards' }, tpl('formal', 'رسمي بسيط', 'هادئ ومناسب لكل القطاعات'), tpl('visual', 'بصري', 'ألوان وكتل للشركات الخدمية')),
          h('div', { class: 'label', style: 'margin-bottom:8px' }, 'الألوان'),
          h('div', { class: 'color-row', style: 'margin-bottom:18px' }, color('primary', 'أساسي'), color('accent', 'ثانوي')),
          h('div', { class: 'label', style: 'margin-bottom:8px' }, 'الأقسام: الترتيب والإظهار'),
          secList,
          h('p', { class: 'small muted' }, 'الأقسام الفارغة تُخفى تلقائيًا في الملف.'),
          h('hr', { style: 'border:0;border-top:1px solid var(--line);margin:20px 0' }),
          h('div', { class: 'label', style: 'margin-bottom:8px' }, 'التنزيل'),
          downloads,
          h('p', { class: 'small muted' }, 'المسودة محفوظة تلقائيًا ويمكنك العودة إليها من «مشاريعي».'),
          h('div', { style: 'margin-top:18px' }, delBtn)),
        h('div', {}, tabsHolder, h('div', { class: 'row', style: 'margin-bottom:10px' }, pdfBtn), pdfArea, wrap))
    );
    setTimeout(reload, 0);
  }

  // ---------- التوجيه ----------
  async function route() {
    const hash = location.hash || '#list';
    const m = hash.match(/^#p\/([a-z0-9]+)\/(\d+)$/);
    if (m) return openProject(m[1], parseInt(m[2], 10));
    if (hash === '#new') {
      await flush();
      $root.replaceChildren(h('div', { class: 'empty' }, 'جارٍ إنشاء مشروع جديد…'));
      try {
        const p = await api('/projects', { method: 'POST', json: {} });
        location.replace(`#p/${p.id}/0`);
      } catch (e) {
        $root.replaceChildren(h('div', { class: 'notice notice-danger', style: 'margin-top:24px' }, e.message, ' ', h('a', { href: '#list' }, 'مشاريعي')));
      }
      return;
    }
    await flush();
    S.project = null;
    viewList();
  }

  window.addEventListener('hashchange', route);
  api('/me')
    .then((me) => {
      S.me = me;
      document.getElementById('modeBadge').replaceChildren(
        me.aiEnabled ? h('span', { class: 'badge badge-ai' }, 'الذكاء الاصطناعي مفعّل') : h('span', { class: 'badge badge-demo', title: 'أضف ANTHROPIC_API_KEY على الخادم لتفعيل التوليد' }, 'وضع تجريبي')
      );
    })
    .catch(() => {})
    .finally(route);
})();
