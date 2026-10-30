const $ = (id) => document.getElementById(id);

const escapeHTML = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------- Profile ----------
function renderProfile() {
  document.title = `${PROFILE.name} — معرض الأعمال`;
  $("logo").textContent = PROFILE.name;
  $("name").textContent = PROFILE.name;
  $("title").textContent = PROFILE.title;
  $("bio").textContent = PROFILE.bio;
  $("footerName").textContent = PROFILE.name;
  $("year").textContent = new Date().getFullYear();

  $("avatar").innerHTML = PROFILE.avatar
    ? `<img src="${escapeHTML(PROFILE.avatar)}" alt="${escapeHTML(PROFILE.name)}">`
    : escapeHTML(PROFILE.name.trim().charAt(0));

  $("emailBtn").href = `mailto:${PROFILE.email}`;
  $("emailBtn").textContent = PROFILE.email;

  const labels = { github: "GitHub", linkedin: "LinkedIn", twitter: "X / Twitter" };
  $("socials").innerHTML = Object.entries(PROFILE.links)
    .filter(([, url]) => url)
    .map(([k, url]) => `<a href="${escapeHTML(url)}" target="_blank" rel="noopener">${labels[k] || k}</a>`)
    .join("");

  $("skills").innerHTML = PROFILE.skills.map((s) => `<li>${escapeHTML(s)}</li>`).join("");

  const techCount = new Set(PROJECTS.flatMap((p) => p.tags)).size;
  const catCount = new Set(PROJECTS.map((p) => p.category)).size;
  $("stats").innerHTML = [
    [PROJECTS.length, "مشروع"],
    [techCount, "تقنية مستخدمة"],
    [catCount, "مجالات"],
  ].map(([n, l]) => `<div class="stat"><strong>${n}</strong><span>${l}</span></div>`).join("");
}

// ---------- Projects ----------
const ALL = "الكل";
let activeCategory = ALL;
let query = "";

function renderFilters() {
  const cats = [ALL, ...new Set(PROJECTS.map((p) => p.category))];
  $("filters").innerHTML = cats
    .map((c) => `<button class="chip" role="tab" aria-selected="${c === activeCategory}" data-cat="${escapeHTML(c)}">${escapeHTML(c)}</button>`)
    .join("");
}

function cardHTML(p) {
  const media = p.image
    ? `<img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.title)}" loading="lazy">`
    : escapeHTML(p.title.charAt(0));
  const links = [
    p.demo && `<a href="${escapeHTML(p.demo)}" target="_blank" rel="noopener">عرض مباشر ↗</a>`,
    p.source && `<a href="${escapeHTML(p.source)}" target="_blank" rel="noopener">الكود المصدري</a>`,
  ].filter(Boolean).join("");

  return `
    <article class="card">
      <div class="card-media">${media}${p.featured ? '<span class="badge">مميّز</span>' : ""}</div>
      <div class="card-body">
        <span class="card-cat">${escapeHTML(p.category)}</span>
        <h3>${escapeHTML(p.title)}</h3>
        <p>${escapeHTML(p.description)}</p>
        <div class="tags">${p.tags.map((t) => `<span class="tag">${escapeHTML(t)}</span>`).join("")}</div>
      </div>
      ${links ? `<div class="card-links">${links}</div>` : ""}
    </article>`;
}

function renderProjects() {
  const q = query.trim().toLowerCase();
  const list = PROJECTS
    .filter((p) => activeCategory === ALL || p.category === activeCategory)
    .filter((p) => !q || [p.title, p.description, p.category, ...p.tags].join(" ").toLowerCase().includes(q))
    .sort((a, b) => Number(b.featured) - Number(a.featured));

  $("grid").innerHTML = list.map(cardHTML).join("");
  $("empty").hidden = list.length > 0;
}

$("filters").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  activeCategory = btn.dataset.cat;
  renderFilters();
  renderProjects();
});

$("search").addEventListener("input", (e) => {
  query = e.target.value;
  renderProjects();
});

// ---------- Theme ----------
$("themeToggle").addEventListener("click", () => {
  const root = document.documentElement;
  const current = root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch (e) {}
});

renderProfile();
renderFilters();
renderProjects();
