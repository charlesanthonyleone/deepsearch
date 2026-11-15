(() => {
"use strict";
const CFG = window.DEEPSEARCH_CONFIG || {};
const $ = s => document.querySelector(s);
const LS = {
  get(k, d) { try { const v = localStorage.getItem("ds_" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("ds_" + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem("ds_" + k); } catch {} }
};

const ENGINES = [
  { id: "google", name: "Google", c: "#4f8cff" },
  { id: "yandex", name: "Yandex", c: "#ff5a4f" },
  { id: "bing", name: "Bing", c: "#2fd6c4" },
  { id: "duckduckgo", name: "DuckDuckGo", c: "#ff8a3d" },
  { id: "brave", name: "Brave", c: "#ff6a2b" },
  { id: "mojeek", name: "Mojeek", c: "#7bd36a" },
  { id: "startpage", name: "Startpage", c: "#7f9cff" },
  { id: "qwant", name: "Qwant", c: "#c77dff" }
];
const ENG = Object.fromEntries(ENGINES.map(e => [e.id, e]));
const hue = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const baseOf = id => String(id).split(/[ .]/)[0];
const engColor = id => (ENG[id] && ENG[id].c) || (ENG[baseOf(id)] && ENG[baseOf(id)].c) || `hsl(${hue(baseOf(id))},70%,62%)`;
const engName = id => (ENG[id] && ENG[id].name) || String(id).replace(/(^|[ .])([a-z])/g, (m, p, c) => (p === "." ? " " : p) + c.toUpperCase());
const KIND = { general: "web", images: "images", videos: "videos" };
const DEFAULT_CHIPS = ["reddit.com", "archive.org", "github.com", "wikipedia.org", "news.ycombinator.com", "stackexchange.com"];

const state = {
  off: new Set(LS.get("enginesOff", [])),
  catalog: { web: ENGINES.map(e => e.id), images: [], videos: [] }, catalogLoaded: false,
  facetList: [], dropped: null,
  safe: LS.get("safe", 0),
  dig: LS.get("dig", 1),
  sort: LS.get("sort", "relevance"),
  dedupe: LS.get("dedupe", false),
  views: LS.get("views", { general: "list", images: "grid", videos: "grid" }), thumbProxy: CFG.thumbProxy === undefined ? "auto" : CFG.thumbProxy,
  hideSeen: LS.get("hideSeen", false), pin: LS.get("pin", false), near: LS.get("near", 0), langx: LS.get("langx", false), dupes: LS.get("dupes", false), dedupeInfo: null, exclude: LS.get("exclude", ""), saved: LS.get("saved", []), activeSaved: null, knownSnap: null,
  cat: LS.get("cat", "general"), phrase: LS.get("phrase", false), dated: LS.get("dated", false), time: LS.get("time", ""), strict: LS.get("strict", false), minm: LS.get("minm", 0), facets: new Set(),
  chips: LS.get("chips", DEFAULT_CHIPS),
  activeChips: [],
  apiBase: LS.get("apiBase", CFG.apiBase || ""),
  apiPath: LS.get("apiPath", CFG.searchPath || "/api/search"),
  token: (LS.get("token", "") || "").trim(),
  // per search
  q: "", seq: 0, nextPage: 1, hasMore: false, loading: false,
  results: new Map(), order: 0, unresponsive: new Map(), counts: {}, safeIgnored: false
};
const isGateway = () => /\/api\/search\/?$/.test(state.apiPath);

/* ---------------- abyss canvas ---------------- */
const cv = $("#abyss"), cx = cv.getContext("2d");
let W = 0, H = 0, DPR = 1, parts = [], pings = [], depthTarget = 0, depth = 0;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = cv.width = innerWidth * DPR; H = cv.height = innerHeight * DPR;
  const n = Math.round(Math.min(160, (innerWidth * innerHeight) / 9000));
  parts = Array.from({ length: n }, () => mkPart(true));
}
function mkPart(any) {
  const z = Math.random();
  return { x: Math.random() * W, y: any ? Math.random() * H : -10, z, r: (0.4 + z * 1.8) * DPR, vy: (0.08 + z * 0.35) * DPR, ph: Math.random() * 6.28, a: 0.15 + z * 0.55 };
}
function ping(x, y, strong) { pings.push({ x: x * DPR, y: y * DPR, r: 0, a: strong ? 0.9 : 0.5, s: strong ? 5 : 3 }); }
let last = performance.now(), sweep = 0;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
function frame(t) {
  const dt = Math.min(50, t - last); last = t;
  depth += (depthTarget - depth) * 0.04;
  const d = Math.min(1, depth / 1);
  const g = cx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `rgba(${10 - 8 * d},${53 - 45 * d},${80 - 66 * d},1)`);
  g.addColorStop(0.45, `rgba(${4 - 3 * d},${24 - 18 * d},${42 - 32 * d},1)`);
  g.addColorStop(1, "rgba(1,6,13,1)");
  cx.fillStyle = g; cx.fillRect(0, 0, W, H);
  // god rays near the surface
  if (d < 0.9) {
    cx.save(); cx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 5; i++) {
      const x = W * (0.15 + i * 0.18) + Math.sin(t / 4000 + i) * 60 * DPR;
      const rg = cx.createLinearGradient(x, 0, x + 120 * DPR, H * 0.8);
      rg.addColorStop(0, `rgba(120,230,240,${0.05 * (1 - d)})`); rg.addColorStop(1, "rgba(120,230,240,0)");
      cx.fillStyle = rg; cx.beginPath();
      cx.moveTo(x - 30 * DPR, 0); cx.lineTo(x + 50 * DPR, 0); cx.lineTo(x + 260 * DPR, H * 0.85); cx.lineTo(x + 40 * DPR, H * 0.85); cx.fill();
    }
    cx.restore();
  }
  // marine snow
  cx.save(); cx.globalCompositeOperation = "lighter";
  for (const p of parts) {
    if (!reduce) { p.y += p.vy * dt / 16 * (1 + d * 1.5); p.ph += 0.01; p.x += Math.sin(p.ph) * 0.15 * DPR; }
    if (p.y > H + 10) Object.assign(p, mkPart(false));
    cx.fillStyle = `rgba(${150 + 60 * p.z},${235},${240},${p.a * (0.6 + 0.4 * Math.sin(p.ph * 2))})`;
    cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.283); cx.fill();
  }
  // sonar pings
  for (let i = pings.length - 1; i >= 0; i--) {
    const k = pings[i]; k.r += k.s * DPR * dt / 16; k.a *= 0.985;
    cx.strokeStyle = `rgba(70,240,224,${k.a})`; cx.lineWidth = 1.4 * DPR;
    cx.beginPath(); cx.arc(k.x, k.y, k.r, 0, 6.283); cx.stroke();
    cx.strokeStyle = `rgba(70,240,224,${k.a * 0.4})`;
    cx.beginPath(); cx.arc(k.x, k.y, k.r * 0.62, 0, 6.283); cx.stroke();
    if (k.a < 0.02) pings.splice(i, 1);
  }
  // faint sweep at depth
  if (d > 0.15 && !reduce) {
    sweep += dt * 0.00035;
    const sx = W * 0.5, sy = H * 1.05, R = Math.max(W, H) * 1.1, a0 = -Math.PI / 2 + Math.sin(sweep) * 1.1;
    const sg = cx.createRadialGradient(sx, sy, 0, sx, sy, R);
    sg.addColorStop(0, `rgba(70,240,224,${0.06 * d})`); sg.addColorStop(1, "rgba(70,240,224,0)");
    cx.fillStyle = sg; cx.beginPath(); cx.moveTo(sx, sy); cx.arc(sx, sy, R, a0 - 0.12, a0 + 0.12); cx.closePath(); cx.fill();
  }
  cx.restore();
  requestAnimationFrame(frame);
}
addEventListener("resize", resize); resize(); requestAnimationFrame(frame);
let ambient = setInterval(() => ping(Math.random() * innerWidth, innerHeight * (0.3 + Math.random() * 0.6), false), 3800);

/* depth gauge */
const ZONES = [[0, "SURFACE"], [200, "TWILIGHT"], [1000, "MIDNIGHT"], [4000, "ABYSS"], [6000, "HADAL"]];
function setDepth() {
  const loaded = state.results.size;
  const scroll = scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight);
  const m = state.q ? Math.round(120 + (state.nextPage - 1) * 600 + loaded * 12 + scroll * 900) : Math.round(scroll * 120);
  const capped = Math.min(10994, m);
  $("#depthNum").textContent = capped.toLocaleString();
  $("#depthFill").style.height = Math.min(100, capped / 110) + "%";
  let z = ZONES[0][1]; for (const [k, n] of ZONES) if (capped >= k) z = n;
  $("#depthZone").textContent = z;
  depthTarget = Math.min(1, capped / 4000);
}
addEventListener("scroll", () => requestAnimationFrame(setDepth), { passive: true });

/* ---------------- controls ---------------- */
const kindEngines = () => state.catalog[KIND[state.cat]] || [];
const enabledEngines = () => kindEngines().filter(e => !state.off.has(e));
function renderEngines() {
  const box = $("#engines"); box.innerHTML = "";
  const list = kindEngines(); box.hidden = !list.length;
  for (const id of list) {
    const b = document.createElement("button"), name = engName(id);
    b.type = "button"; b.className = "eng"; b.style.setProperty("--c", engColor(id));
    b.setAttribute("aria-pressed", !state.off.has(id));
    const down = state.unresponsive.get(id);
    b.title = down ? `${name}: unresponsive (${down})` : name;
    b.innerHTML = `<i></i><span></span>${down ? ' <span class="down" aria-label="unresponsive">⚠</span>' : ""}`;
    b.children[1].textContent = name;
    b.onclick = () => {
      if (!state.off.has(id) && enabledEngines().length === 1) return;
      state.off.has(id) ? state.off.delete(id) : state.off.add(id);
      LS.set("enginesOff", [...state.off]); renderEngines();
      if (state.q) requestSearch();
    };
    box.appendChild(b);
  }
}
async function loadCatalog() {
  if (!isGateway() || !state.token || !state.apiBase) return;
  try {
    const j = await apiFetch(state.apiBase + "/api/engines");
    const cat = { web: [], images: [], videos: [] };
    const pri = id => { const i = ENGINES.findIndex(e => e.id === id); return i < 0 ? 99 : i; };
    for (const e of j.engines || []) for (const k of (e.kinds || (e.categories || []).map(c => c === "general" ? "web" : c))) if (cat[k]) cat[k].push(e.name);
    for (const k in cat) cat[k].sort((x, y) => pri(x) - pri(y) || x.localeCompare(y));
    if (cat.web.length || cat.images.length || cat.videos.length) { state.catalog = cat; state.catalogLoaded = true; renderEngines(); setLink("ok", "uplink live"); }
  } catch (e) { if (/Token/.test(e.message)) setLink("bad", "token rejected"); }
}
function seg(sel, val, cb) {
  const g = $(sel);
  const paint = v => g.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v) === String(v)));
  paint(val);
  g.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; paint(b.dataset.v); cb(b.dataset.v); });
}
seg("#safe", state.safe, v => { state.safe = +v; LS.set("safe", state.safe); if (state.q) requestSearch(); });
const SERVER_SORTS = ["rarity", "leastviewed", "oldest", "newest"];
seg("#sort", state.sort, v => { const prev = state.sort; state.sort = v; LS.set("sort", v); if (isGateway() && state.q && (SERVER_SORTS.includes(v) || SERVER_SORTS.includes(prev))) requestSearch(true); else render(true); });
const dig = $("#dig");
function paintDig() {
  dig.value = state.dig; $("#digVal").textContent = state.dig; $("#digS").textContent = state.dig > 1 ? "s" : "";
  dig.style.setProperty("--p", ((state.dig - 1) / 4 * 100) + "%");
}
dig.addEventListener("input", () => { state.dig = +dig.value; LS.set("dig", state.dig); paintDig(); });
dig.addEventListener("change", () => { if (state.q) requestSearch(); });
paintDig();
const curView = () => state.views[state.cat] || (state.cat === "general" ? "list" : "grid");
let paintView = () => {};
seg("#cat", state.cat, v => { state.cat = v; LS.set("cat", v); renderEngines(); paintView(curView()); if (state.q) requestSearch(); });
(() => { const g = $("#view"); paintView = v => g.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === v)); })();
seg("#view", curView(), v => { state.views[state.cat] = v; LS.set("views", state.views); render(true); });
const datedWrap = $("#datedWrap"), datedCb = $("#dated");
datedCb.checked = state.dated; datedWrap.classList.toggle("on", !!state.time);
datedWrap.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); state.dated = !state.dated; datedCb.checked = state.dated; LS.set("dated", state.dated); if (state.q && state.time) requestSearch(true); });
seg("#time", state.time, v => { state.time = v; LS.set("time", v); datedWrap.classList.toggle("on", !!v); if (state.q) requestSearch(true); });
const st = $("#strict"); st.checked = state.strict;
st.addEventListener("change", () => { state.strict = st.checked; LS.set("strict", st.checked); if (isGateway() && state.q) requestSearch(true); else render(true); });
const mm = $("#minm");
function paintMin() { mm.value = state.minm; $("#minVal").textContent = state.minm; mm.style.setProperty("--p", state.minm + "%"); }
mm.addEventListener("input", () => { state.minm = +mm.value; LS.set("minm", state.minm); paintMin(); if (!isGateway()) render(true); });
mm.addEventListener("change", () => { if (isGateway() && state.q) requestSearch(true); });
paintMin();
const dd = $("#dedupe"); dd.checked = state.dedupe;
dd.addEventListener("change", () => { state.dedupe = dd.checked; LS.set("dedupe", dd.checked); render(true); });

/* site chips */
let editing = false;
function cleanDomain(s) {
  s = String(s || "").trim().toLowerCase().replace(/^site:/, "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : "";
}
function renderChips() {
  const box = $("#chips"); box.innerHTML = ""; box.classList.toggle("editing", editing);
  for (const d of state.chips) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.setAttribute("aria-pressed", state.activeChips.includes(d));
    b.innerHTML = `<span></span><span class="x" aria-label="remove">×</span>`;
    b.firstChild.textContent = d;
    b.onclick = e => {
      if (editing) { state.chips = state.chips.filter(x => x !== d); state.activeChips = state.activeChips.filter(x => x !== d); LS.set("chips", state.chips); renderChips(); return; }
      state.activeChips = state.activeChips.includes(d) ? state.activeChips.filter(x => x !== d) : [...state.activeChips, d];
      renderChips(); if (state.q || $("#q").value.trim()) requestSearch();
    };
    box.appendChild(b);
  }
}
$("#editChips").onclick = () => { editing = !editing; $("#chipEditor").hidden = !editing; $("#editChips").textContent = editing ? "Done" : "Edit"; renderChips(); if (editing) $("#chipInput").focus(); };
$("#chipDone").onclick = () => $("#editChips").click();
function addChip() {
  const d = cleanDomain($("#chipInput").value);
  if (!d) { $("#chipInput").select(); return; }
  if (!state.chips.includes(d)) { state.chips.push(d); LS.set("chips", state.chips); }
  $("#chipInput").value = ""; renderChips();
}
$("#chipAdd").onclick = addChip;
$("#chipInput").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addChip(); } });

/* operator help */
const help = $("#helpBtn"), ops = $("#ops"), qi = $("#q");
help.onclick = () => { ops.hidden = !ops.hidden; help.setAttribute("aria-expanded", !ops.hidden); };
ops.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const ins = b.dataset.ins, v = qi.value, s = qi.selectionStart ?? v.length, en = qi.selectionEnd ?? v.length;
  const sel = v.slice(s, en);
  let out, caret;
  if (ins === '""') { out = `"${sel}"`; caret = s + (sel ? out.length : 1); }
  else if (ins === "( )") { out = `(${sel})`; caret = s + (sel ? out.length : 1); }
  else if (ins === "*") { out = sel + "*"; caret = s + out.length; }
  else { const pre = (s > 0 && !/\s$/.test(v.slice(0, s)) && ins !== " OR ") ? " " : ""; out = pre + ins + sel; caret = s + out.length; }
  qi.value = v.slice(0, s) + out + v.slice(en); qi.focus(); qi.setSelectionRange(caret, caret);
});

/* seen history (opened or dismissed), capped */
const seen = new Set(LS.get("seen", []));
function markSeen(url) { if (seen.has(url)) return; seen.add(url); const arr = [...seen]; LS.set("seen", arr.slice(-5000)); }
const hs = $("#hideSeen"); hs.checked = state.hideSeen;
hs.addEventListener("change", () => { state.hideSeen = hs.checked; LS.set("hideSeen", hs.checked); render(true); });
$("#results").addEventListener("click", e => {
  const copy = e.target.closest(".copy-link");
  if (copy) { e.preventDefault(); e.stopPropagation(); copyLink(copy.closest(".card").dataset.url, copy); return; }
  const d = e.target.closest(".dismiss");
  if (d) { e.preventDefault(); const c = d.closest(".card"); markSeen(c.dataset.url); if (state.hideSeen) { c.style.transition = "opacity .25s, transform .25s"; c.style.opacity = 0; c.style.transform = "scale(.97)"; setTimeout(() => render(true), 250); } else { c.classList.add("seen"); } return; }
  const media = e.target.closest(".card .media");
  const title = e.target.closest(".card h3 a");
  if ((media || title) && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
    const card = (media || title).closest(".card");
    const r = state.results.get(card.dataset.url);
    if (r && canView(r)) { e.preventDefault(); openViewer(r); return; }
  }
  const a = e.target.closest(".card a[href]"); if (a) { const c = a.closest(".card"); markSeen(c.dataset.url); setTimeout(() => c.classList.add("seen"), 300); }
});
async function copyLink(url, btn) {
  if (!url) return;
  let ok = false;
  try { await navigator.clipboard.writeText(url); ok = true; }
  catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = url; ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, url.length);
      ok = document.execCommand("copy"); ta.remove();
    } catch {}
  }
  if (!ok) return;
  const t = $("#toast");
  if (t) { t.hidden = false; t.textContent = "Copied"; t.classList.add("show"); clearTimeout(copyLink._t); copyLink._t = setTimeout(() => { t.classList.remove("show"); t.hidden = true; }, 1400); }
  if (btn) { const prev = btn.textContent; btn.textContent = "Copied"; btn.classList.add("copied"); clearTimeout(btn._t); btn._t = setTimeout(() => { btn.textContent = prev; btn.classList.remove("copied"); }, 1400); }
}
$("#results").addEventListener("auxclick", e => { const a = e.target.closest(".card a[href]"); if (a && e.button === 1) { markSeen(a.closest(".card").dataset.url); a.closest(".card").classList.add("seen"); } });

/* server precision toggles */
function bindToggle(id, key) { const el = $("#" + id); el.checked = !!state[key]; el.addEventListener("change", () => { state[key] = el.checked; LS.set(key, el.checked); if (state.q) requestSearch(true); }); }
bindToggle("pin", "pin"); bindToggle("langx", "langx"); bindToggle("dupes", "dupes");
const nearSel = $("#near"); nearSel.value = String(state.near || 0);
nearSel.addEventListener("change", () => { state.near = +nearSel.value; LS.set("near", state.near); if (state.q) requestSearch(true); });

/* always exclude (settings drawer) */
function excludeList() { const out = []; String(state.exclude || "").replace(/"([^"]+)"|([^,]+)/g, (m, p, w) => { const t = (p || w || "").trim().replace(/^-+/, ""); if (t) out.push(t); return m; }); return out.slice(0, 20); }
function excludeTerms() { if (isGateway()) return []; const out = []; String(state.exclude || "").replace(/"([^"]+)"|([^,\s]+)/g, (m, p, w) => { const t = (p || w || "").trim().replace(/^-+/, ""); if (t) out.push(p ? `-"${t}"` : "-" + t); return m; }); return out; }

/* saved searches + creator follows: rerun on open, count results not seen in that search before */
const saveBtn = $("#saveSearch");
function persistSaved() { LS.set("saved", state.saved); paintSavedBadge(); }
function paintSavedBadge() { const n = state.saved.reduce((s, x) => s + (x.newCount || 0), 0); const b = $("#savedBadge"); b.hidden = !n; b.textContent = n > 99 ? "99+" : n; }
const savedKey = (q, cat) => cat + "|" + q.trim().toLowerCase();
function findSaved(q, cat) { return state.saved.find(s => savedKey(s.q, s.cat) === savedKey(q, cat)); }
function paintSaveBtn() { const q = qi.value.trim(); saveBtn.hidden = !state.q || !q; const s = q && findSaved(q, state.cat); saveBtn.classList.toggle("on", !!s); saveBtn.textContent = s ? "★ Saved" : "☆ Save search"; }
saveBtn.onclick = () => {
  const q = qi.value.trim(); if (!q) return;
  const s = findSaved(q, state.cat);
  if (s) state.saved = state.saved.filter(x => x !== s);
  else { const n = { id: Date.now().toString(36), type: "search", label: q, q, cat: state.cat, known: [...state.results.keys()].slice(0, 400), newCount: 0, lastRun: Date.now() }; state.saved.unshift(n); state.activeSaved = n; state.knownSnap = new Set(n.known); }
  persistSaved(); paintSaveBtn(); renderSaved();
};
function addFollow(name) {
  name = name.replace(/"/g, "").trim(); if (!name) return;
  const q = name, cat = state.cat === "general" ? "videos" : state.cat;
  if (findSaved(q, cat)) return;
  state.saved.unshift({ id: Date.now().toString(36), type: "creator", label: name, q, cat, known: [], newCount: 0, lastRun: 0 });
  persistSaved(); renderSaved(); checkSaved([state.saved[0]]);
}
$("#followAdd").onclick = () => { addFollow($("#followInput").value); $("#followInput").value = ""; };
$("#followInput").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("#followAdd").click(); } });
const ago = t => { if (!t) return "never checked"; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; };
function renderSaved() {
  const box = $("#savedList"); box.innerHTML = "";
  if (!state.saved.length) { box.innerHTML = '<div class="saved-empty">Nothing saved yet. Run a search and tap ☆ Save search, or follow a creator above.</div>'; return; }
  for (const s of state.saved) {
    const el = document.createElement("div"); el.className = "saved-item";
    el.innerHTML = `<button type="button" class="si-main"><span class="si-type"></span><span class="si-q"></span><span class="si-meta"></span></button><span class="si-new"></span><button type="button" class="si-del" aria-label="Remove">✕</button>`;
    el.querySelector(".si-type").textContent = (s.type === "creator" ? "Following · " : "Search · ") + KIND[s.cat];
    el.querySelector(".si-q").textContent = s.type === "creator" ? "@" + s.label : s.label;
    el.querySelector(".si-meta").textContent = (s.checking ? "checking…" : "checked " + ago(s.lastRun)) + (s.error ? " · " + s.error : "");
    const nb = el.querySelector(".si-new"); nb.textContent = s.newCount ? "+" + s.newCount : "0"; nb.classList.toggle("zero", !s.newCount); nb.title = "new since last time";
    el.querySelector(".si-main").onclick = () => openSaved(s);
    el.querySelector(".si-del").onclick = () => { state.saved = state.saved.filter(x => x !== s); persistSaved(); renderSaved(); paintSaveBtn(); };
    box.appendChild(el);
  }
}
function savedUrl(s) {
  const keep = { cat: state.cat, phrase: state.phrase, facets: state.facets, sort: state.sort };
  state.cat = s.cat; state.facets = new Set();
  if (s.type === "creator") { state.phrase = true; state.sort = "newest"; }
  const u = buildUrl([s.q, ...excludeTerms()].join(" "), 1);
  Object.assign(state, keep); return u;
}
let checking = false;
async function checkSaved(list) {
  if (!state.token || !state.apiBase || checking) return;
  checking = true;
  for (const s of list || state.saved.slice(0, 15)) {
    while (state.loading) await sleep(400);   // never pile saved-checks on top of a live search
    s.checking = true; renderSaved();
    try {
      const j = await apiFetch(savedUrl(s));
      const known = new Set(s.known || []);
      const urls = (j.results || []).map(r => safeUrl(r.url)).filter(Boolean);
      if (!s.lastRun && !known.size) { s.known = urls.slice(0, 400); s.newCount = 0; s.firstRun = true; }
      else s.newCount = urls.filter(u => !known.has(u)).length;
      s.error = ""; s.lastRun = Date.now();
    } catch (e) { s.error = /Rate/.test(e.message) ? "rate limited" : "failed"; }
    s.checking = false; persistSaved(); renderSaved();
    await sleep(3000);
  }
  checking = false;
}
function openSaved(s) {
  openSavedDrawer(false);
  state.cat = s.cat; LS.set("cat", s.cat);
  $("#cat").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === s.cat)); renderEngines(); paintView(curView());
  qi.value = s.q; state.activeSaved = s; state.knownSnap = new Set(s.known || []);
  if (s.type === "creator") {
    state.phrase = true; LS.set("phrase", true); phraseBtn.setAttribute("aria-pressed", "true");
    state.sort = "newest"; LS.set("sort", "newest"); $("#sort").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === "newest"));
  }
  runSearch();
}
function settleSaved() {
  const s = state.activeSaved; if (!s || !state.saved.includes(s)) return;
  const known = new Set(s.known || []); for (const u of state.results.keys()) known.add(u);
  s.known = [...known].slice(-1500); s.newCount = 0; s.lastRun = Date.now(); persistSaved(); renderSaved();
}
const savedDrawer = $("#savedDrawer");
function openSavedDrawer(o) { savedDrawer.classList.toggle("open", o); savedDrawer.setAttribute("aria-hidden", !o); scrim.hidden = !o; if (o) renderSaved(); }
$("#openSaved").onclick = () => openSavedDrawer(true);
$("#closeSaved").onclick = () => openSavedDrawer(false);
$("#refreshSaved").onclick = () => checkSaved();
$("#clearSeen").onclick = () => { seen.clear(); LS.del("seen"); render(true); };

/* exact phrase toggle */
const phraseBtn = $("#phraseBtn");
phraseBtn.setAttribute("aria-pressed", state.phrase);
phraseBtn.onclick = () => { state.phrase = !state.phrase; LS.set("phrase", state.phrase); phraseBtn.setAttribute("aria-pressed", state.phrase); if (isGateway() && state.q) requestSearch(true); else render(true); };
const normTxt = s => " " + String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() + " ";
// the whole query as plain consecutive words (operators like site:, -x, OR stripped)
function phraseOf(q) { const pq = parseQuery(q); return normTxt([...pq.phrases, ...pq.terms].join(" ")).trim(); }
function slugText(u) { try { const x = new URL(u); const segs = x.pathname.split("/").filter(Boolean); return decodeURIComponent(segs.join(" ")); } catch { return ""; } }
function hasPhrase(r, ph) { if (!ph) return true; const n = " " + ph + " "; return normTxt(r.title).includes(n) || normTxt(r.content).includes(n) || normTxt(slugText(r.url)).includes(n); }

/* query builder */
const qb = $("#qb"), qbBtn = $("#qbBtn");
qbBtn.onclick = () => { qb.hidden = !qb.hidden; qbBtn.setAttribute("aria-expanded", !qb.hidden); if (!qb.hidden) { ops.hidden = true; help.setAttribute("aria-expanded", "false"); $("#qbAll").focus(); } qbPreview(); };
help.addEventListener("click", () => { if (!ops.hidden) { qb.hidden = true; qbBtn.setAttribute("aria-expanded", "false"); } });
const words = id => $(id).value.replace(/["()|]/g, " ").split(/[\s,]+/).map(w => w.trim().replace(/^[-+]+/, "").replace(/\*+$/, "*").replace(/^(intitle|inurl|site):/i, "")).filter(w => w && w !== "*" && !/^(AND|OR|NOT)$/.test(w));
function buildQuery() {
  const parts = [...words("#qbAll")];
  const ph = $("#qbPhrase").value.replace(/"/g, "").trim(); if (ph) parts.push(`"${ph}"`);
  const any = words("#qbAny"); if (any.length === 1) parts.push(any[0]); else if (any.length > 1) parts.push("(" + any.join(" OR ") + ")");
  for (const w of words("#qbTitle")) parts.push("intitle:" + w);
  for (const w of words("#qbUrl")) parts.push("inurl:" + w);
  for (const w of words("#qbNone")) parts.push("-" + w);
  const s = cleanDomain($("#qbSite").value); if (s) parts.push("site:" + s);
  for (const d of $("#qbNoSite").value.split(/[\s,]+/).map(cleanDomain).filter(Boolean)) parts.push("-site:" + d);
  return parts.join(" ");
}
function qbPreview() { const q = buildQuery(); $("#qbPreview").textContent = q || "fill any field below"; }
qb.addEventListener("input", qbPreview);
$("#qbApply").onclick = () => { const q = buildQuery(); if (q) { qi.value = q; qi.focus(); } };
$("#qbDive").onclick = () => { const q = buildQuery(); if (!q) return; qi.value = q; qb.hidden = true; qbBtn.setAttribute("aria-expanded", "false"); runSearch(); };
$("#qbClear").onclick = () => { qb.querySelectorAll("input").forEach(i => i.value = ""); qbPreview(); };
qb.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("#qbDive").click(); } });

/* settings drawer */
const drawer = $("#drawer"), scrim = $("#scrim");
function openDrawer(o) { drawer.classList.toggle("open", o); drawer.setAttribute("aria-hidden", !o); scrim.hidden = !o; if (o) { $("#apiBase").value = state.apiBase; $("#apiPath").value = state.apiPath; $("#token").value = state.token; $("#alwaysExclude").value = state.exclude; $("#settingsNote").textContent = ""; } }
$("#openSettings").onclick = () => openDrawer(true);
$("#closeSettings").onclick = () => openDrawer(false);
scrim.onclick = () => { openDrawer(false); openSavedDrawer(false); };
addEventListener("keydown", e => { if (e.key === "Escape") { openDrawer(false); openSavedDrawer(false); } });
function saveSettings() {
  state.apiBase = $("#apiBase").value.trim().replace(/\/+$/, "");
  state.apiPath = ("/" + ($("#apiPath").value.trim() || "/api/search").replace(/^\/+/, ""));
  state.token = $("#token").value.replace(/\s+/g, "");
  state.exclude = $("#alwaysExclude").value.trim(); LS.set("exclude", state.exclude);
  LS.set("apiBase", state.apiBase); LS.set("apiPath", state.apiPath); LS.set("token", state.token);
  setLink(state.token && state.apiBase ? "warn" : "", state.apiBase ? (state.token ? "uplink set" : "token needed") : "no uplink");
}
$("#saveSettings").onclick = () => { saveSettings(); note("Saved on this device."); loadCatalog(); };
$("#clearSettings").onclick = () => { state.token = ""; LS.del("token"); $("#token").value = ""; note("Token forgotten."); setLink("", "token needed"); };
$("#testSettings").onclick = async () => {
  saveSettings(); note("Pinging…");
  try {
    if (isGateway()) {
      const r = await apiFetch(state.apiBase + "/api/engines");
      note(`Uplink OK · ${(r.engines || []).length} engines available.`); setLink("ok", "uplink live");
    } else {
      await apiFetch(buildUrl("test", 1)); note("Uplink OK."); setLink("ok", "uplink live");
    }
  } catch (e) { note(e.message, true); setLink("bad", "uplink error"); }
};
function note(t, bad) { const n = $("#settingsNote"); n.textContent = t; n.classList.toggle("bad", !!bad); }
function setLink(cls, txt) { $("#linkDot").className = "dot " + (cls || ""); $("#linkText").textContent = txt; }
setLink(state.token && state.apiBase ? "warn" : "", state.apiBase ? (state.token ? "uplink set" : "token needed") : "no uplink");

/* ---------------- query parsing ---------------- */
function parseQuery(q) {
  const phrases = [], terms = [], excl = [];
  let neg = false;
  q.replace(/(-?)"([^"]+)"|(\S+)/g, (m, n, ph, w) => {
    if (ph) { ((n || neg) ? excl : phrases).push(ph.toLowerCase()); neg = false; return m; }
    if (w === "NOT") { neg = true; return m; }
    if (!w || /^(OR|AND|\||&&|\(|\)|-\()$/.test(w) || /^-?site:/i.test(w)) return m;
    let t = w.replace(/[()]/g, "").replace(/^\+/, "").replace(/^(intitle|inurl):/i, "").replace(/\*$/, "").toLowerCase();
    if (w.startsWith("-") || neg) excl.push(t.replace(/^-/, "")); else if (t) terms.push(t);
    neg = false; return m;
  });
  return { phrases, terms: terms.filter(Boolean), excl };
}
function fullQuery() {
  let q = qi.value.trim();
  const a = state.activeChips;
  if (a.length === 1) q += ` site:${a[0]}`;
  else if (a.length > 1) q += " (" + a.map(d => "site:" + d).join(" OR ") + ")";
  const ex = excludeTerms(); if (q && ex.length) q += " " + ex.join(" ");
  return q.trim();
}

/* ---------------- API ---------------- */
function buildUrl(q, page) {
  const p = new URLSearchParams();
  p.set("q", q);
  if (isGateway()) {
    const en = enabledEngines();
    if (en.length && en.length < kindEngines().length) p.set("engines", en.join(","));
    p.set("categories", KIND[state.cat]);
    if (state.time) { p.set("time", state.time); if (state.dated) p.set("dated", "1"); }
    if (state.strict) p.set("strict", "1");
    if (state.phrase) p.set("phrase", "1");
    if (state.pin) p.set("pin", "1");
    if (state.near >= 2) p.set("near", String(state.near));
    if (state.langx) p.set("lang_expand", "1");
    if (state.dupes) p.set("dedupe", "1");
    const ex = excludeList(); if (ex.length) p.set("exclude", ex.join(","));
    if (["rarity", "leastviewed", "oldest", "newest"].includes(state.sort)) p.set("sort", state.sort);
    if (state.minm) p.set("minMatch", String(state.minm));
    if (state.facets.size) p.set("domains", [...state.facets].slice(0, 20).join(","));
  } else p.set("engines", enabledEngines().join(","));
  if (!isGateway()) { if (state.cat !== "general") p.set("categories", state.cat); if (state.time) p.set("time_range", state.time); }
  p.set("safesearch", String(state.safe));
  if (isGateway()) {
    if (state.dig >= 5) { p.set("page", String(page)); p.set("deep", "1"); }
    else p.set("page", String(page));
  } else { p.set("format", "json"); p.set("pageno", String(page)); }
  return state.apiBase + state.apiPath + "?" + p.toString();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function mergeSignals(a, b) {
  if (!a) return b; if (!b) return a;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([a, b]);
  const c = new AbortController();
  const on = () => c.abort();
  a.addEventListener("abort", on); b.addEventListener("abort", on);
  if (a.aborted || b.aborted) c.abort();
  return c.signal;
}
async function apiFetch(url, signal) {
  if (!state.apiBase) throw new Error("Set the API base in settings ⚙");
  const headers = { Accept: "application/json" };
  if (state.token) headers.Authorization = "Bearer " + state.token;
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    const timeout = (typeof AbortSignal.timeout === "function") ? AbortSignal.timeout(90000) : null;
    const sig = timeout ? mergeSignals(signal, timeout) : signal;
    let r;
    try { r = await fetch(url, { headers, signal: sig, referrerPolicy: "no-referrer", credentials: "omit", cache: "no-store" }); }
    catch (e) {
      if (e.name === "AbortError" && signal && signal.aborted) throw e;
      last = new Error("Can't reach the uplink. Check the API base, or this origin isn't allowed by the server's CORS.");
      if (attempt === 0) { await sleep(800); continue; }
      throw last;
    }
    if (r.status === 401) throw new Error("Token rejected. Open settings ⚙ and paste your access token.");
    if (r.status === 429) throw new Error(`Rate limited. Try again in ${r.headers.get("Retry-After") || "a few"}s.`);
    if (r.status === 403) throw new Error("Forbidden by the server (origin not allowed).");
    if (r.status === 502 || r.status === 504) {
      last = new Error(r.status === 504 ? "Search timed out. Try again in a moment." : "Search backend was busy. Try again in a moment.");
      if (attempt === 0) { await sleep(1000); continue; }
      throw last;
    }
    if (!r.ok) throw new Error(`Uplink error ${r.status}.`);
    return r.json();
  }
  throw last;
}
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };
const EMBED_ORIGINS = new Set(["https://www.pornhub.com","https://www.xvideos.com","https://www.xnxx.com","https://xhamster.com","https://embed.redtube.com","https://www.eporner.com","https://player.tnaflix.com","https://www.youtube-nocookie.com","https://player.vimeo.com","https://www.dailymotion.com"]);
function safeEmbed(u) { try { const x = new URL(u); return x.protocol === "https:" && EMBED_ORIGINS.has(x.origin) ? x.href : ""; } catch { return ""; } }
// Normalize either backend's result into one shape.
function normalize(raw, apiPage) {
  const url = safeUrl(raw.url); if (!url) return null;
  const P = CFG.pageSize || 10;
  let sources = [];
  if (Array.isArray(raw.sources)) {
    sources = raw.sources.map(s => ({ engine: s.engine, pos: absPos(s.position, s.page || 1, P) }));
  } else {
    const engs = raw.engines || (raw.engine ? [raw.engine] : []);
    const pos = raw.positions || [];
    sources = engs.map((e, i) => ({ engine: e, pos: absPos(pos[i] ?? pos[0] ?? 1, apiPage, P) }));
  }
  const engines = [...new Set((raw.engines && raw.engines.length ? raw.engines : sources.map(s => s.engine)).filter(Boolean))];
  for (const e of engines) if (!sources.find(s => s.engine === e)) sources.push({ engine: e, pos: null });
  return {
    url, title: String(raw.title || url), content: String(raw.content || ""),
    host: raw.host || hostOf(url), domain: raw.domain || "", engines, sources,
    proxy: raw.thumbProxy && /^\/api\/thumb\?/.test(raw.thumbProxy) ? state.apiBase + raw.thumbProxy : "",
    imgProxy: raw.imageProxy && /^\/api\/thumb\?/.test(raw.imageProxy) ? state.apiBase + raw.imageProxy : "",
    embed: safeEmbed(raw.embed),
    resolution: raw.resolution || null, date: raw.publishedDate ? Date.parse(raw.publishedDate) || null : null,
    dupes: 0, dupList: Array.isArray(raw.duplicates) ? raw.duplicates.filter(d => d && d.url) : [],
    views: typeof raw.views === "number" ? raw.views : null, rarity: typeof raw.rarity === "number" ? raw.rarity : null,
    langs: Array.isArray(raw.langs) ? raw.langs.filter(l => l && l !== "orig") : [], alt: raw.alt || "",
    thumb: safeUrl(raw.thumbnail || raw.thumbnail_src || raw.img_src || ""),
    img: safeUrl(raw.img_src || raw.image || ""),
    kind: raw.kind === "videos" ? "video" : raw.kind === "images" ? "image" : raw.kind === "web" ? "web" : raw.category === "videos" || raw.template === "videos.html" || raw.length || raw.iframe_src ? "video" : (raw.category === "images" || raw.template === "images.html" || raw.img_src ? "image" : "web"),
    length: fmtLen(raw.length), match: raw.match || null,
    creator: String(raw.creator || raw.author || raw.uploader || "").slice(0, 80), tags: Array.isArray(raw.tags) ? raw.tags.filter(t => typeof t === "string").slice(0, 12) : []
  };
}
function fmtViews(n) { return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K" : String(n); }
function fmtLen(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" || /^\d+(\.\d+)?$/.test(String(v))) { let s = Math.round(+v), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); s %= 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0"); }
  return String(v).replace(/^0:(\d\d:\d\d)$/, "$1").slice(0, 12);
}
function absPos(pos, page, P) { pos = +pos || 1; page = +page || 1; return pos > P ? pos : (page - 1) * P + pos; }

function matchInfo(r, pq) {
  const hay = (r.title + " " + r.content).toLowerCase();
  const words = [...pq.phrases, ...pq.terms];
  const hits = words.filter(w => hay.includes(w));
  const exact = words.length > 0 && hits.length === words.length;
  const server = r.match;
  return {
    exact: server && typeof server.exact === "boolean" ? server.exact : exact,
    strength: server && typeof server.strength === "number" ? server.strength : (words.length ? Math.round(hits.length / words.length * 100) : 0),
    hits: server && Array.isArray(server.hits) && server.hits.length ? server.hits : hits
  };
}
function buriedScore(r) {
  const m = r.m, n = Math.max(1, r.engines.length);
  const ps = r.sources.map(s => s.pos).filter(x => x != null);
  const best = ps.length ? Math.min(...ps) : 10;
  const depthBoost = Math.log2(1 + best);               // deeper first-appearance = more buried
  const rarity = 1 / n;                                  // fewer engines = more buried
  const fit = (m.exact ? 1 : 0.15) * (0.4 + 0.6 * m.strength / 100);
  return fit * rarity * depthBoost;
}

/* ---------------- search flow ---------------- */
let ctrl = null;
const pq0 = () => parseQuery(state.q);
// Debounce filter/tab changes so a string of taps doesn't abort-and-stack 10-25s server searches.
let searchTimer = null;
function requestSearch(keepFacets, immediate) {
  if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; }
  if (immediate) return runSearch(keepFacets);
  searchTimer = setTimeout(() => { searchTimer = null; runSearch(keepFacets); }, 400);
}
async function runSearch(keepFacets) {
  const q = fullQuery();
  if (!q) return;
  if (state.activeSaved && savedKey(state.activeSaved.q, state.activeSaved.cat) !== savedKey(qi.value, state.cat)) { state.activeSaved = null; state.knownSnap = null; }
  state.q = q; state.seq++; state.nextPage = 1; state.hasMore = true; state.results = new Map(); state.order = 0;
  state.unresponsive = new Map(); state.counts = {}; state.safeIgnored = false; if (keepFacets !== true) { state.facets = new Set(); state.facetList = []; } state.catMismatch = null; state.dropped = null; state.dedupeInfo = null;
  if (ctrl) ctrl.abort();
  ctrl = null; state.loading = false; state.autoPages = 0; state.paused = false;   // a new search never waits behind the old one
  document.body.classList.add("diving");
  const u = new URL(location.href); u.hash = "q=" + encodeURIComponent(qi.value.trim()); history.replaceState(null, "", u);
  $("#results").innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  $("#status").innerHTML = "<span>sounding…</span>";
  const r = qi.getBoundingClientRect(); ping(r.left + 20, r.top + r.height / 2, true);
  await loadMore(true);
}
const AUTO_PAGES = 3;   // infinite scroll stops after this many automatic steps until "Dig deeper" is tapped
async function loadMore(first, manual) {
  if (state.loading || !state.hasMore || !state.q) return;
  if (!first && !manual && state.autoPages >= AUTO_PAGES) { state.paused = true; paintDigMore(); return; }
  if (!first) { if (manual) state.autoPages = 0; else state.autoPages++; }
  state.paused = false; paintDigMore();
  state.loading = true; document.body.classList.add("busy"); $("#loader").hidden = first;
  const seq = state.seq, my = new AbortController(); ctrl = my;
  // Deep Dig: each step pulls `dig` upstream pages per engine, fetched one page at a time.
  const pages = [];
  if (isGateway() && state.dig >= 5) pages.push(state.nextPage);
  else for (let i = 0; i < state.dig && state.nextPage + i <= 20; i++) pages.push(state.nextPage + i);
  let err = null, anyMore = false, got = 0;
  const settled = [];
  for (const p of pages) {
    if (seq !== state.seq) return;                      // superseded: the new search owns state.loading now
    try { settled.push({ status: "fulfilled", value: { j: await apiFetch(buildUrl(state.q, p), my.signal), p } }); }
    catch (e) { settled.push({ status: "rejected", reason: e }); if (e.name === "AbortError" || /Rate/.test(e.message)) break; }
  }
  if (seq !== state.seq) return;
  const pq = pq0();
  for (const s of settled) {
    if (s.status === "rejected") { if (s.reason && s.reason.name !== "AbortError") err = s.reason; continue; }
    const { j, p } = s.value;
    if (!isGateway() && state.cat !== "general" && j.category && j.category !== state.cat) state.catMismatch = j.category;
    if (isGateway() && Array.isArray(j.categories) && !j.categories.includes(KIND[state.cat])) state.catMismatch = j.categories.join(",");
    if (j.facets && Array.isArray(j.facets.domains) && !state.facets.size) mergeFacets(j.facets.domains);
    if (j.dedupe && typeof j.dedupe === "object") { state.dedupeInfo = state.dedupeInfo || { hashed: 0, collapsed: 0 }; state.dedupeInfo.hashed += +j.dedupe.hashed || 0; state.dedupeInfo.collapsed += +j.dedupe.collapsed || 0; }
    if (j.dropped) { state.dropped = state.dropped || {}; for (const [k, v] of Object.entries(j.dropped)) state.dropped[k] = (state.dropped[k] || 0) + (+v || 0); }
    if (isGateway()) { if (j.hasMore) anyMore = true; }
    else if ((j.results || []).length) anyMore = true;
    for (const u of j.unresponsive || j.unresponsive_engines || []) {
      const name = Array.isArray(u) ? u[0] : (u.name || u); const why = Array.isArray(u) ? u[1] : (u.why || "no response");
      state.unresponsive.set(String(name).toLowerCase(), why);
    }
    if (j.engines && !Array.isArray(j.engines)) for (const [k, v] of Object.entries(j.engines)) state.counts[k] = (state.counts[k] || 0) + v;
    for (const raw of j.results || []) {
      const r = normalize(raw, p); if (!r) continue;
      const prev = state.results.get(r.url);
      if (prev) {
        for (const s2 of r.sources) { const o = prev.sources.find(x => x.engine === s2.engine); if (!o) prev.sources.push(s2); else if (s2.pos != null && (o.pos == null || s2.pos < o.pos)) o.pos = s2.pos; }
        prev.engines = [...new Set([...prev.engines, ...r.engines])]; prev.dupes = (prev.dupes || 0) + 1;
      } else { r.idx = state.order++; r.m = matchInfo(r, pq); state.results.set(r.url, r); got++; }
    }
  }
  for (const r of state.results.values()) r.b = buriedScore(r);
  state.nextPage += isGateway() && state.dig >= 5 ? 1 : pages.length;
  state.hasMore = anyMore && state.nextPage <= 20 && !(err && !got);
  state.loading = false; document.body.classList.remove("busy"); $("#loader").hidden = true;
  if (ctrl === my) ctrl = null;
  renderEngines(); paintDigMore();
  render(first, err);
  setDepth(); paintSaveBtn();
  if (first && !err && state.activeSaved) settleSaved();
  if (got) ping(innerWidth * (0.2 + Math.random() * 0.6), innerHeight * 0.8, false);
}

/* ---------------- render ---------------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function highlight(text, hits) {
  let h = esc(text);
  if (state.phrase) {
    const ph = phraseOf(qi.value || state.q);
    if (ph) {
      const re = new RegExp("(" + ph.split(" ").map(w => esc(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^\\p{L}\\p{N}<>]+") + ")", "giu");
      if (re.test(h)) return h.replace(re, '<mark class="ph">$1</mark>');
    }
  }
  const ws = [...new Set(hits.map(w => String(w).toLowerCase()).filter(w => w.length > 1))].sort((a, b) => b.length - a.length);
  if (!ws.length) return h;
  const re = new RegExp("(" + ws.map(w => esc(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
  return h.replace(re, "<mark>$1</mark>");
}
let rendered = 0;
function mergeFacets(list) {
  const m = new Map(state.facetList.map(f => [f.domain, f.count]));
  for (const f of list) if (f && f.domain) m.set(f.domain, (m.get(f.domain) || 0) + (+f.count || 0));
  state.facetList = [...m].map(([domain, count]) => ({ domain, count })).sort((x, y) => y.count - x.count || x.domain.localeCompare(y.domain));
}
function renderFacets(list) {
  const box = $("#facets"), counts = new Map();
  if (isGateway() && state.facetList.length) for (const f of state.facetList) counts.set(f.domain, f.count);
  else for (const r of list) counts.set(r.domain || r.host, (counts.get(r.domain || r.host) || 0) + 1);
  const top = [...counts].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, 14);
  for (const f of state.facets) if (!counts.has(f)) top.push([f, 0]);
  box.hidden = top.length < 2; box.innerHTML = "";
  for (const [h, n] of top) {
    const b = document.createElement("button"); b.type = "button"; b.className = "facet";
    b.setAttribute("aria-pressed", state.facets.has(h)); b.innerHTML = `<span></span><b>${n}</b>`; b.firstChild.textContent = h;
    b.onclick = () => { state.facets.has(h) ? state.facets.delete(h) : state.facets.add(h); if (isGateway()) requestSearch(true); else render(true); };
    box.appendChild(b);
  }
}
function sorted() {
  const gw = isGateway();
  const ph = state.phrase ? phraseOf(qi.value || state.q) : "";
  let list = [...state.results.values()].filter(r => (gw || ((!state.strict || r.m.exact) && r.m.strength >= state.minm)) && (!ph || hasPhrase(r, ph)));
  renderFacets(list);
  if (state.facets.size && !gw) list = list.filter(r => state.facets.has(r.domain || r.host));
  if (state.hideSeen) list = list.filter(r => !seen.has(r.url));
  const rar = r => r.rarity != null ? r.rarity : (() => { const ps = r.sources.map(s => s.pos).filter(x => x != null); return 100 * Math.log2(1 + (ps.length ? Math.min(...ps) : 10)) / Math.max(1, r.engines.length) / 6; })();
  const cmp = {
    buried: (a, b) => b.b - a.b || a.idx - b.idx,
    rarity: (a, b) => rar(b) - rar(a) || a.idx - b.idx,
    leastviewed: (a, b) => (a.views ?? Infinity) - (b.views ?? Infinity) || a.idx - b.idx,
    oldest: (a, b) => (a.date ?? Infinity) - (b.date ?? Infinity) || a.idx - b.idx,
    newest: (a, b) => (b.date ?? -Infinity) - (a.date ?? -Infinity) || a.idx - b.idx
  }[state.sort] || ((a, b) => a.idx - b.idx);
  list.sort(cmp);
  if (state.dedupe) {
    const seen = new Map(), out = [];
    for (const r of list) { if (seen.has(r.host)) { seen.get(r.host).more++; continue; } r.more = 0; seen.set(r.host, r); out.push(r); }
    list = out;
  } else list.forEach(r => r.more = 0);
  return list;
}
function render(reset, err) {
  const list = sorted(), box = $("#results");
  box.className = "results" + (curView() === "grid" ? " grid" : "") + " cat-" + state.cat;
  const bThreshold = (() => { const bs = list.map(r => r.b).sort((a, b) => b - a); return bs[Math.floor(bs.length * 0.2)] || Infinity; })();
  if (reset) { box.innerHTML = ""; rendered = 0; }
  else if (state.sort === "buried" || state.dedupe) { box.innerHTML = ""; rendered = 0; } // re-rank entire list
  const frag = document.createDocumentFragment();
  list.slice(rendered).forEach((r, i) => frag.appendChild(card(r, i, r.b >= bThreshold && r.m.exact && r.engines.length <= 2)));
  box.appendChild(frag); rendered = list.length;
  if (!list.length) box.innerHTML = err ? "" : `<div class="empty"><strong>Nothing down here.</strong>No results matched. Loosen a quote, drop a -exclude, lower Min match, turn off Strict, or switch on more engines.</div>`;
  if (state.catMismatch && reset !== "x") box.insertAdjacentHTML("afterbegin", `<div class="notice">The server doesn't serve the ${esc(state.cat)} category yet, so it returned ${esc(state.catMismatch)} results instead.</div>`);
  status(list.length, err);
  if (!state.hasMore && list.length) box.insertAdjacentHTML("beforeend", `<div class="floor">— OCEAN FLOOR · ${list.length} RESULTS —</div>`);
}
function card(r, i, buried) {
  const el = document.createElement("article");
  el.className = "card" + (buried ? " buried" : "") + (seen.has(r.url) ? " seen" : ""); el.style.setProperty("--i", Math.min(i, 12));
  el.dataset.url = r.url;
  const path = (() => { try { const u = new URL(r.url); return (u.pathname + u.search).replace(/\/$/, ""); } catch { return ""; } })();
  const srcs = [...r.sources].sort((a, b) => (a.pos ?? 999) - (b.pos ?? 999));
  const badges = srcs.map(s => `<span class="badge" style="--c:${engColor(s.engine)}" title="${esc(engName(s.engine))}${s.pos ? " ranked #" + s.pos : ""}"><i></i>${esc(engName(s.engine))}${s.pos ? ` <b>#${s.pos}</b>` : ""}</span>`).join("");
  const tags = [
    r.m.exact ? '<span class="meta-tag ex">exact</span>' : "",
    buried ? '<span class="meta-tag bur">buried</span>' : "",
    r.more ? `<span class="meta-tag">+${r.more} more from ${esc(r.host)}</span>` : "",
    state.knownSnap && state.knownSnap.size && !state.knownSnap.has(r.url) ? '<span class="meta-tag new-t">new</span>' : "",
    (r.dupes + r.dupList.length) ? `<span class="meta-tag dup" title="${esc(r.dupList.length ? "Same image also on: " + r.dupList.map(d => d.domain || hostOf(d.url)).join(", ") : "Identical copies merged into this result")}">${r.dupes + r.dupList.length} duplicate${r.dupes + r.dupList.length > 1 ? "s" : ""} collapsed</span>` : "",
    r.rarity != null && (state.sort === "rarity" || r.rarity >= 70) ? `<span class="meta-tag rarity" title="Rarity score: few engines, deep position, exact match">◆ rarity ${Math.round(r.rarity)}</span>` : "",
    r.views != null && r.kind !== "video" ? `<span class="meta-tag views">${fmtViews(r.views)} views</span>` : "",
    r.langs.length ? `<span class="meta-tag lang" title="Found by the translated query">${esc(r.langs.join(" · "))}</span>` : "",
    r.date && (state.sort === "oldest" || state.sort === "newest") ? `<span class="meta-tag date">${esc(new Date(r.date).toISOString().slice(0, 10))}</span>` : "",
    seen.has(r.url) ? '<span class="meta-tag seen-t">seen</span>' : ""
  ].join("");
  const direct = r.thumb || (r.kind === "image" ? r.img : "");
  const src = r.proxy || direct;
  const showMedia = !!src || r.kind !== "web" || curView() === "grid";
  if (showMedia) el.classList.add("has-media");
  const media = showMedia ? `<a class="media${src ? "" : " failed"}" href="${esc(r.url)}" target="_blank" rel="noreferrer noopener" referrerpolicy="no-referrer" tabindex="-1" aria-hidden="true">
      <span class="ph">${PH_SVG}<em>${src ? "" : r.kind === "video" ? "video" : r.kind === "image" ? "image" : esc(r.host)}</em></span>
      ${src ? `<img alt="" decoding="async" referrerpolicy="no-referrer" data-src="${esc(src)}" data-direct="${esc(r.proxy ? direct : "")}">` : ""}
      ${r.resolution ? `<span class="res-tag">${esc(r.resolution)}</span>` : ""}
      ${r.kind === "video" ? `<span class="play">${PLAY_SVG}</span>` : ""}
      ${r.length ? `<span class="dur">${esc(r.length)}</span>` : ""}
      ${r.views != null && r.kind === "video" ? `<span class="views-ov">${fmtViews(r.views)} views</span>` : ""}
      ${curView() === "grid" ? `<span class="res-host">${esc(r.host)}</span>` : ""}
    </a>` : "";
  el.innerHTML = media + `<div class="card-main">
    <div class="crumb"><span class="host">${esc(r.host)}</span><span class="path">${esc(path)}</span></div>
    <h3><a href="${esc(r.url)}" target="_blank" rel="noreferrer noopener" referrerpolicy="no-referrer">${highlight(r.title, r.m.hits)}</a></h3>
    <p>${highlight(r.content, r.m.hits)}</p>
    <div class="badges">${badges}${tags}</div></div>
    <button type="button" class="copy-link" aria-label="Copy link" title="Copy link to paste into an incognito tab">Copy</button>
    <button type="button" class="dismiss" aria-label="Dismiss" title="Dismiss (mark as seen)">✕</button>`;
  const img = el.querySelector(".media img"); if (img) thumbIO.observe(img);
  return el;
}
const PH_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="18"/><circle cx="24" cy="24" r="10" opacity=".6"/><circle cx="24" cy="24" r="2.5" fill="rgba(70,240,224,.7)" stroke="none"/></svg>';
const PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"/></svg>';
/* thumbnails: lazy. Signed /api/thumb proxy URL first (no hotlink, no referer), then the direct URL with no-referrer, then a placeholder */
// The proxy allows 4 fetches in flight per client and answers 503 beyond that, so fetch through a 3-wide queue,
// back off and retry on 503/429, and fall back to the direct URL for other failures.
const thumbIO = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { thumbIO.unobserve(e.target); queueThumb(e.target); } }, { rootMargin: "500px 0px" });
const thumbQ = [], blobCache = new Map(); let thumbActive = 0;
function queueThumb(img) {
  const src = img.dataset.src;
  if (blobCache.has(src)) return setImg(img, blobCache.get(src), img.dataset.direct);
  if (!img.dataset.direct && !/\/api\/thumb\?/.test(src)) return setImg(img, src, "");
  thumbQ.push(img); pumpThumbs();
}
function pumpThumbs() {
  for (let i = thumbQ.length - 1; i >= 0; i--) if (!thumbQ[i].isConnected) thumbQ.splice(i, 1);
  while (thumbActive < 4 && thumbQ.length) {
    // in-viewport thumbnails first, then the ones just below
    let k = thumbQ.findIndex(inView); if (k < 0) k = 0;
    const img = thumbQ.splice(k, 1)[0]; if (!img.isConnected) continue;
    thumbActive++; fetchThumb(img).finally(() => { thumbActive--; pumpThumbs(); });
  }
}
const inView = el => { if (!el.isConnected) return false; const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; };
addEventListener("scroll", () => { if (thumbQ.length) pumpThumbs(); }, { passive: true });
async function fetchThumb(img) {
  const src = img.dataset.src;
  for (let attempt = 0; attempt < 4; attempt++) {
    let r;
    try { r = await fetch(src, { credentials: "omit", referrerPolicy: "no-referrer" }); } catch { break; }
    if (r.ok && /^image\//.test(r.headers.get("content-type") || "")) {
      const u = URL.createObjectURL(await r.blob()); blobCache.set(src, u); return setImg(img, u, img.dataset.direct);
    }
    if (r.status === 503 || r.status === 429) { await sleep(600 * (attempt + 1) + Math.random() * 400); continue; }
    break;
  }
  return setImg(img, img.dataset.direct || "", "");
}
function thumbDone(img, ok) { const m = img.closest(".media"); if (!m) return; m.classList.toggle("loaded", ok); m.classList.toggle("failed", !ok); if (!ok) img.remove(); }
function setImg(img, u, fallback) {
  if (!u) return thumbDone(img, false);
  img.onload = () => img.naturalWidth > 2 ? thumbDone(img, true) : setImg(img, fallback, "");
  img.onerror = () => setImg(img, fallback, "");
  img.src = u;
}
function status(n, err) {
  const parts = [];
  if (err) parts.push(`<span class="err">${esc(err.message)}</span>`);
  if (state.q) {
    parts.push(`<span><b>${n}</b> results · ${state.nextPage - 1} page${state.nextPage > 2 ? "s" : ""} deep · ${esc(KIND[state.cat])} · sorted by ${state.sort}${state.phrase ? " · exact phrase" : ""}${state.pin ? " · pinpoint" : ""}${state.near >= 2 ? " · within " + state.near + " words" : ""}${state.langx ? " · 7 languages" : ""}${state.strict ? " · strict" : ""}${state.time ? " · past " + esc(state.time) + (state.dated ? " (dated only)" : "") : ""}${state.minm ? " · ≥" + state.minm + "% match" : ""}${state.dedupe ? " · one per domain" : ""}${state.facets.size ? " · " + state.facets.size + " domain filter" + (state.facets.size > 1 ? "s" : "") : ""}</span>`);
    const counts = Object.entries(state.counts).filter(([, v]) => v).map(([k, v]) => `${esc(engName(k))} ${v}`);
    if (counts.length) parts.push(`<span>answered: ${counts.join(" · ")}</span>`);
    if (state.hideSeen) { const h = [...state.results.keys()].filter(u => seen.has(u)).length; if (h) parts.push(`<span>${h} seen hidden</span>`); }
    if (state.dedupeInfo && state.dedupeInfo.collapsed) parts.push(`<span>${state.dedupeInfo.collapsed} duplicate images collapsed</span>`);
    if (state.dropped) { const d = Object.entries(state.dropped).filter(([, v]) => v).map(([k, v]) => `${esc(k)} ${v}`); if (d.length) parts.push(`<span>filtered out: ${d.join(" · ")}</span>`); }
    if (state.unresponsive.size) parts.push(`<span class="warn unr">unresponsive: ${[...state.unresponsive].map(([k, w]) => `${esc(engName(k))} (${esc(w)})`).join(" · ")}</span>`);
    if (isGateway() && state.safe !== 0) parts.push(`<span class="warn">SafeSearch is set to Off on the server, so this filter isn't applied</span>`);
  }
  $("#status").innerHTML = parts.join("");
}

/* infinite scroll */
new IntersectionObserver(es => { if (es.some(e => e.isIntersecting) && state.q && !state.loading && state.hasMore) loadMore(false); }, { rootMargin: "600px 0px" }).observe($("#sentinel"));
function paintDigMore() { const b = $("#digMore"); b.hidden = !(state.paused && state.hasMore && !state.loading); }
$("#digMore").onclick = () => loadMore(false, true);

$("#searchForm").addEventListener("submit", e => { e.preventDefault(); ops.hidden = true; qb.hidden = true; qbBtn.setAttribute("aria-expanded", "false"); help.setAttribute("aria-expanded", "false"); qi.blur(); runSearch(); });
addEventListener("click", e => { if (e.target.closest(".card,.badge,a,button,input")) return; ping(e.clientX, e.clientY, false); });

renderEngines(); renderChips(); setDepth(); loadCatalog(); paintSavedBadge();
setTimeout(() => checkSaved(), 1500);
function setTune(o) { document.body.classList.toggle("tune-open", o); $("#tuneBtn").setAttribute("aria-expanded", o); $("#sheetScrim").hidden = !o; }
$("#tuneBtn").onclick = () => setTune(!document.body.classList.contains("tune-open"));
$("#sheetClose").onclick = $("#sheetScrim").onclick = () => setTune(false);
const hq = new URLSearchParams(location.hash.slice(1)).get("q");
if (hq) { qi.value = hq; runSearch(); } else if (!state.token && state.apiBase) $("#status").innerHTML = '<span class="warn">Open settings ⚙ and paste your access token to connect.</span>';

/* -------- in-page viewer + more-like-this -------- */
const canView = r => r && (r.kind === "image" || r.kind === "video" || !!r.embed);
const viewer = { open: false, stack: [], scrollY: 0, closing: false, similarFor: "", similarPage: 1, simAbort: null };

function openViewer(r) {
  if (!r) return;
  markSeen(r.url);
  document.querySelectorAll(".card").forEach(c => { if (c.dataset.url === r.url) c.classList.add("seen"); });
  if (!viewer.open) {
    viewer.scrollY = window.scrollY;
    document.body.classList.add("viewer-open");
    document.body.style.top = "-" + viewer.scrollY + "px";
    $("#viewer").hidden = false;
    viewer.open = true;
  }
  viewer.stack.push(r);
  history.pushState({ dsv: viewer.stack.length }, "", location.href);
  showItem(r);
}

function showItem(r) {
  $("#viewerBack").hidden = viewer.stack.length < 2;
  $("#viewerTitle").textContent = r.title || r.host || "View";
  $("#viewerOpen").href = r.url;
  $("#viewerCopy").onclick = ev => { ev.preventDefault(); copyLink(r.url, ev.currentTarget); };
  renderStage(r);
  viewer.similarPage = 1;
  viewer.similarFor = r.url;
  $("#similarGrid").innerHTML = "";
  $("#similarMore").hidden = true;
  $("#similarStatus").textContent = "Finding more…";
  if (viewer.simAbort) viewer.simAbort.abort();
  requestAnimationFrame(() => setTimeout(() => loadSimilar(r, 1, false), 40));
}

function renderStage(r) {
  const stage = $("#viewerStage");
  stage.innerHTML = "";
  const embed = safeEmbed(r.embed);
  if (embed) {
    const f = document.createElement("iframe");
    f.className = "viewer-frame";
    f.src = embed;
    f.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation allow-popups");
    f.setAttribute("allow", "autoplay; fullscreen; picture-in-picture; encrypted-media");
    f.setAttribute("allowfullscreen", "");
    f.setAttribute("referrerpolicy", "no-referrer");
    f.title = r.title || "Video";
    stage.appendChild(f);
    return;
  }
  if (r.kind === "video") { stage.appendChild(fallbackMedia(r, "This site doesn't play here. Open it on the site, or copy the link into an incognito tab.")); return; }
  const src = r.imgProxy || r.proxy || r.img || r.thumb;
  const direct = r.img || r.thumb || "";
  if (!src) { stage.appendChild(fallbackMedia(r, "No preview available.")); return; }
  const img = document.createElement("img");
  img.className = "viewer-img";
  img.alt = r.alt || r.title || "";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  if (/\/api\/thumb\?/.test(src)) { img.dataset.src = src; img.dataset.direct = direct; stage.appendChild(img); queueThumb(img); }
  else { img.src = src; stage.appendChild(img); }
}

function fallbackMedia(r, msg) {
  const wrap = document.createElement("div");
  wrap.className = "viewer-fallback";
  const src = r.proxy || r.thumb || r.img || "";
  wrap.innerHTML = (src ? `<span class="media"><img alt="" decoding="async" referrerpolicy="no-referrer" data-src="${esc(src)}" data-direct="${esc(r.proxy ? (r.thumb || r.img || "") : "")}"></span>` : "") + `<p>${esc(msg)}</p>`;
  const img = wrap.querySelector("img"); if (img) queueThumb(img);
  return wrap;
}

async function loadSimilar(r, page, append) {
  if (!isGateway()) { $("#similarStatus").textContent = "Suggestions need the DeepSearch uplink."; return; }
  const ac = new AbortController();
  viewer.simAbort = ac;
  const cat = (state.cat === "images" || r.kind === "image") ? "images" : (state.cat === "general" && r.kind === "web") ? "web" : "videos";
  try {
    const p = new URLSearchParams({ url: r.url, title: r.title || "", content: (r.content || "").slice(0, 300), categories: cat, type: cat, site: r.host || "", page: String(page) });
    if (r.creator) p.set("creator", r.creator);
    if (r.tags && r.tags.length) p.set("tags", r.tags.join(" ").slice(0, 300));
    const data = await apiFetch(state.apiBase + state.apiPath.replace(/\/search\/?$/, "/similar") + "?" + p, ac.signal);
    if (viewer.similarFor !== r.url) return;
    const rows = (data.results || []).map(x => normalize(x, page)).filter(Boolean);
    const grid = $("#similarGrid");
    if (!append) grid.innerHTML = "";
    const have = new Set([...grid.querySelectorAll("[data-url]")].map(el => el.dataset.url));
    have.add(r.url);
    for (const s of rows) {
      if (have.has(s.url)) continue;
      have.add(s.url);
      grid.appendChild(similarCard(s));
    }
    viewer.similarPage = page;
    // a page that was all repeats: quietly pull the next one (up to 3 pages deep) instead of showing "none"
    if (grid.children.length < 6 && data.hasMore && page < 3 && viewer.similarFor === r.url) return loadSimilar(r, page + 1, true);
    $("#similarStatus").textContent = grid.children.length ? "" : "No similar results right now.";
    $("#similarMore").hidden = !data.hasMore;
  } catch (e) {
    if (e.name === "AbortError") return;
    if (viewer.similarFor !== r.url) return;
    $("#similarStatus").textContent = e.message || "Couldn't load suggestions.";
    $("#similarMore").hidden = true;
  }
}

function similarCard(r) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "similar-card";
  el.dataset.url = r.url;
  const src = r.proxy || r.thumb || r.img || "";
  el.innerHTML = `<span class="media${src ? "" : " failed"}">${src ? `<img alt="" decoding="async" referrerpolicy="no-referrer" data-src="${esc(src)}" data-direct="${esc(r.proxy ? (r.thumb || r.img || "") : "")}">` : ""}</span><span class="similar-cap"><b>${esc(r.title)}</b><i>${esc(r.host)}</i></span>`;
  const img = el.querySelector("img"); if (img) thumbIO.observe(img);
  el.addEventListener("click", () => openViewer(r));
  return el;
}

function actuallyHideViewer() {
  viewer.open = false;
  viewer.stack = [];
  if (viewer.simAbort) viewer.simAbort.abort();
  $("#viewer").hidden = true;
  $("#viewerStage").innerHTML = "";
  $("#similarGrid").innerHTML = "";
  document.body.classList.remove("viewer-open");
  document.body.style.top = "";
  window.scrollTo(0, viewer.scrollY || 0);
}

function closeViewer() {
  if (!viewer.open) return;
  const n = viewer.stack.length;
  actuallyHideViewer();
  if (n) { viewer.closing = true; history.go(-n); }
}

addEventListener("popstate", () => {
  if (viewer.closing) {
    if (!history.state || !history.state.dsv) viewer.closing = false;
    return;
  }
  if (!viewer.open) return;
  if (viewer.stack.length > 1) {
    viewer.stack.pop();
    showItem(viewer.stack[viewer.stack.length - 1]);
  } else {
    actuallyHideViewer();
  }
});

$("#viewerClose").onclick = closeViewer;
$("#viewerBack").onclick = () => { if (viewer.stack.length > 1) history.back(); else closeViewer(); };
$("#similarMore").onclick = () => {
  const r = viewer.stack[viewer.stack.length - 1];
  if (r) loadSimilar(r, (viewer.similarPage || 1) + 1, true);
};
addEventListener("keydown", e => {
  if (e.key === "Escape" && viewer.open) { e.preventDefault(); closeViewer(); }
});

(function swipeClose() {
  const v = $("#viewer");
  let y0 = 0, x0 = 0, tracking = false, dy = 0;
  v.addEventListener("touchstart", ev => {
    if (ev.touches.length !== 1) return;
    if (ev.target.closest("iframe,button,a,.similar-grid")) return;
    if (v.scrollTop > 8) return;
    tracking = true; y0 = ev.touches[0].clientY; x0 = ev.touches[0].clientX; dy = 0;
  }, { passive: true });
  v.addEventListener("touchmove", ev => {
    if (!tracking) return;
    dy = ev.touches[0].clientY - y0;
    const dx = ev.touches[0].clientX - x0;
    if (dy > 0 && dy > Math.abs(dx)) {
      $("#viewerSheet").style.transform = "translateY(" + Math.min(dy, 240) + "px)";
      $("#viewerSheet").style.opacity = String(Math.max(0.4, 1 - dy / 400));
    }
  }, { passive: true });
  v.addEventListener("touchend", () => {
    if (!tracking) return;
    tracking = false;
    const sheet = $("#viewerSheet");
    if (dy > 90) { sheet.style.transform = ""; sheet.style.opacity = ""; closeViewer(); }
    else { sheet.style.transform = ""; sheet.style.opacity = ""; }
  });
})();

})();
