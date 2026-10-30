const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const escapeHTML = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ألوان بطاقات المشاريع التي لا تحتوي صورة
const GRADIENTS = [
  ["#0ea5e9", "#6366f1"], ["#8b5cf6", "#ec4899"], ["#14b8a6", "#0ea5e9"],
  ["#f59e0b", "#ef4444"], ["#22c55e", "#0d9488"], ["#6366f1", "#a855f7"],
];

// ---------- Profile ----------
function renderProfile() {
  document.title = `${PROFILE.name} — معرض الأعمال`;
  $("logo").textContent = PROFILE.name;
  $("name").textContent = PROFILE.name;
  $("title").textContent = PROFILE.title;
  $("bio").textContent = PROFILE.bio;
  $("footerName").textContent = PROFILE.name;
  $("year").textContent = new Date().getFullYear();
  if (PROFILE.background) $("bgImage").style.backgroundImage = `url("${PROFILE.background}")`;

  $("emailBtn").href = `mailto:${PROFILE.email}`;
  $("emailBtn").textContent = PROFILE.email;

  const labels = { github: "GitHub", linkedin: "LinkedIn", twitter: "X / Twitter" };
  $("socials").innerHTML = Object.entries(PROFILE.links)
    .filter(([, url]) => url)
    .map(([k, url]) => `<a href="${escapeHTML(url)}" target="_blank" rel="noopener">${labels[k] || k}</a>`)
    .join("");

  $("skills").innerHTML = PROFILE.skills.map((s) => `<li>${escapeHTML(s)}</li>`).join("");
}

// ---------- Network background ----------
function startNetwork() {
  const canvas = $("network");
  const ctx = canvas.getContext("2d");
  const mouse = { x: -9999, y: -9999 };
  let nodes = [], w = 0, h = 0;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(130, Math.round((w * h) / 11000));
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35,
      r: Math.random() * 1.6 + .6,
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const max = 140;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < max) {
          ctx.strokeStyle = `rgba(80, 170, 255, ${(1 - d / max) * .35})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      const md = Math.hypot(a.x - mouse.x, a.y - mouse.y);
      if (md < 180) {
        ctx.strokeStyle = `rgba(167, 139, 250, ${(1 - md / 180) * .6})`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
      }
      ctx.fillStyle = "rgba(140, 210, 255, .9)";
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function tick() {
    for (const n of nodes) {
      n.x += n.vx; n.y += n.vy;
      if (n.x < 0 || n.x > w) n.vx *= -1;
      if (n.y < 0 || n.y > h) n.vy *= -1;
    }
    draw();
    requestAnimationFrame(tick);
  }

  addEventListener("resize", () => { resize(); if (reducedMotion) draw(); });
  addEventListener("pointermove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  addEventListener("pointerleave", () => { mouse.x = mouse.y = -9999; });
  resize();
  reducedMotion ? draw() : tick();
}

// ---------- 3D carousel ----------
const ALL = "الكل";
const ring = $("ring");
const stage = $("stage");
let activeCategory = ALL;
let items = [];      // المشاريع المعروضة حالياً
let slots = [];      // المشاريع على الدائرة (تتكرر إذا كانت قليلة لتبقى الدائرة ممتلئة)
let cards = [];
let step = 360;
let rot = 0;         // زاوية الدوران الحالية
let target = null;   // زاوية الهدف عند اختيار مشروع
let velocity = 0;
let hovering = false;
let pauseUntil = 0;
let frontIndex = -1;
const AUTO_SPEED = -0.006; // درجة لكل ملّي ثانية

function renderFilters() {
  const cats = [ALL, ...new Set(PROJECTS.map((p) => p.category))];
  $("filters").innerHTML = cats
    .map((c) => `<button class="chip" role="tab" aria-selected="${c === activeCategory}" data-cat="${escapeHTML(c)}">${escapeHTML(c)}</button>`)
    .join("");
}

function buildRing() {
  items = PROJECTS
    .filter((p) => activeCategory === ALL || p.category === activeCategory)
    .sort((a, b) => Number(b.featured) - Number(a.featured));
  slots = [];
  while (items.length && slots.length < 6) slots.push(...items);
  step = 360 / Math.max(slots.length, 1);

  ring.innerHTML = slots.map((p, i) => {
    const [c1, c2] = GRADIENTS[PROJECTS.indexOf(p) % GRADIENTS.length];
    const media = p.image ? `<img src="${escapeHTML(p.image)}" alt="" loading="lazy" draggable="false">` : escapeHTML(p.icon || p.title.charAt(0));
    return `
      <button class="p-card" data-i="${i}" style="--c1:${c1};--c2:${c2}" aria-label="${escapeHTML(p.title)}">
        <div class="p-media">${media}${p.featured ? '<span class="badge">مميّز</span>' : ""}</div>
        <div class="p-info">
          <span class="p-cat">${escapeHTML(p.category)}</span>
          <span class="p-title">${escapeHTML(p.title)}</span>
        </div>
      </button>`;
  }).join("");

  cards = [...ring.children];
  rot = 0; target = null; velocity = 0; frontIndex = -1;
  layout();
  render();
}

let radius = 0;
function layout() {
  const n = cards.length;
  const cardW = ring.offsetWidth;
  const mobile = innerWidth < 700;
  radius = n < 3 ? cardW * 0.9 : (cardW / 2) / Math.tan(Math.PI / n) * (mobile ? 1.15 : 1.35) + (mobile ? 20 : 40);
  cards.forEach((c, i) => { c.style.transform = `rotateY(${i * step}deg) translateZ(${radius}px)`; });
}

function render() {
  ring.style.transform = `translateZ(${-radius}px) rotateY(${rot}deg)`;
  const n = cards.length;
  if (!n) return;

  cards.forEach((c, i) => {
    const rel = ((i * step + rot) % 360 + 360) % 360;
    const facing = (Math.cos(rel * Math.PI / 180) + 1) / 2; // 1 = في المقدمة
    c.style.opacity = (0.2 + 0.8 * facing ** 1.5).toFixed(3);
    c.style.filter = `brightness(${(0.55 + 0.45 * facing).toFixed(3)})`;
  });

  const idx = ((Math.round(-rot / step) % n) + n) % n;
  if (idx !== frontIndex) {
    frontIndex = idx;
    cards.forEach((c, i) => {
      c.classList.toggle("front", i === idx);
      c.tabIndex = i === idx ? 0 : -1;
    });
    showDetails(slots[idx]);
    $("counter").textContent = `${items.indexOf(slots[idx]) + 1} / ${items.length}`;
  }
}

function showDetails(p) {
  const d = $("details");
  const links = [
    p.demo && `<a class="btn primary" href="${escapeHTML(p.demo)}" target="_blank" rel="noopener">عرض مباشر ↗</a>`,
    p.source && `<a class="btn" href="${escapeHTML(p.source)}" target="_blank" rel="noopener">الكود المصدري</a>`,
  ].filter(Boolean).join("");
  d.innerHTML = `
    <span class="d-cat">${escapeHTML(p.category)}</span>
    <h3>${escapeHTML(p.title)}</h3>
    <p>${escapeHTML(p.description)}</p>
    ${p.tags.length ? `<div class="tags">${p.tags.map((t) => `<span class="tag">${escapeHTML(t)}</span>`).join("")}</div>` : ""}
    ${links ? `<div class="d-links">${links}</div>` : ""}`;
  d.classList.remove("swap"); void d.offsetWidth; d.classList.add("swap");
}

function goTo(i) {
  const desired = -i * step;
  target = desired + 360 * Math.round((rot - desired) / 360);
  velocity = 0;
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(now - last, 50);
  last = now;
  if (!drag.active) {
    if (target !== null) {
      rot += (target - rot) * 0.12;
      if (Math.abs(target - rot) < 0.05) { rot = target; target = null; pauseUntil = now + 4000; }
    } else if (Math.abs(velocity) > 0.01) {
      rot += velocity; velocity *= 0.94;
      if (Math.abs(velocity) <= 0.01) goTo(frontIndex); // يستقر على أقرب مشروع
    } else if (!hovering && now > pauseUntil && !reducedMotion) {
      rot += AUTO_SPEED * dt;
    }
  }
  render();
  requestAnimationFrame(loop);
}

// السحب بالماوس أو اللمس
const drag = { active: false, startX: 0, startRot: 0, lastX: 0, moved: false };
stage.addEventListener("pointerdown", (e) => {
  drag.active = true; drag.moved = false;
  drag.startX = drag.lastX = e.clientX; drag.startRot = rot;
  target = null; velocity = 0;
});
addEventListener("pointermove", (e) => {
  if (!drag.active) return;
  const dx = e.clientX - drag.startX;
  if (Math.abs(dx) > 5) { drag.moved = true; stage.classList.add("dragging"); }
  rot = drag.startRot + dx * 0.35;
  velocity = (e.clientX - drag.lastX) * 0.35;
  drag.lastX = e.clientX;
});
addEventListener("pointerup", () => {
  if (!drag.active) return;
  drag.active = false;
  stage.classList.remove("dragging");
  pauseUntil = performance.now() + 4000;
  if (drag.moved && Math.abs(velocity) <= 0.01) goTo(frontIndex);
});

ring.addEventListener("click", (e) => {
  const card = e.target.closest(".p-card");
  if (!card || drag.moved) return;
  goTo(Number(card.dataset.i));
});

stage.addEventListener("pointerenter", () => (hovering = true));
stage.addEventListener("pointerleave", () => (hovering = false));

const next = () => goTo(frontIndex + 1);
const prev = () => goTo(frontIndex - 1);
$("next").addEventListener("click", next);
$("prev").addEventListener("click", prev);
stage.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") { e.preventDefault(); next(); }
  if (e.key === "ArrowRight") { e.preventDefault(); prev(); }
});

$("filters").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  activeCategory = btn.dataset.cat;
  renderFilters();
  buildRing();
});

addEventListener("resize", layout);

renderProfile();
startNetwork();
renderFilters();
buildRing();
requestAnimationFrame(loop);
