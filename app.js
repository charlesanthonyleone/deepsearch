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
const engColor = id => (ENG[id] && ENG[id].c) || "#8fb4c2";
const engName = id => (ENG[id] && ENG[id].name) || id;
const DEFAULT_CHIPS = ["reddit.com", "archive.org", "github.com", "wikipedia.org", "news.ycombinator.com", "stackexchange.com"];

const state = {
  engines: LS.get("engines", ENGINES.map(e => e.id)),
  safe: LS.get("safe", 0),
  dig: LS.get("dig", 1),
  sort: LS.get("sort", "relevance"),
  dedupe: LS.get("dedupe", false),
  cat: LS.get("cat", "general"), time: LS.get("time", ""), strict: LS.get("strict", false), minm: LS.get("minm", 0), facets: new Set(),
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
function renderEngines() {
  const box = $("#engines"); box.innerHTML = ""; box.hidden = state.cat !== "general";
  for (const e of ENGINES) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "eng"; b.style.setProperty("--c", e.c);
    b.setAttribute("aria-pressed", state.engines.includes(e.id));
    const down = state.unresponsive.get(e.id);
    b.title = down ? `${e.name}: unresponsive (${down})` : e.name;
    b.innerHTML = `<i></i>${e.name}${down ? ' <span class="down" aria-label="unresponsive">⚠</span>' : ""}`;
    b.onclick = () => {
      const on = state.engines.includes(e.id);
      if (on && state.engines.length === 1) return;
      state.engines = on ? state.engines.filter(x => x !== e.id) : [...state.engines, e.id];
      LS.set("engines", state.engines); renderEngines();
      if (state.q) runSearch();
    };
    box.appendChild(b);
  }
}
function seg(sel, val, cb) {
  const g = $(sel);
  const paint = v => g.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v) === String(v)));
  paint(val);
  g.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; paint(b.dataset.v); cb(b.dataset.v); });
}
seg("#safe", state.safe, v => { state.safe = +v; LS.set("safe", state.safe); if (state.q) runSearch(); });
seg("#sort", state.sort, v => { state.sort = v; LS.set("sort", v); render(true); });
const dig = $("#dig");
function paintDig() {
  dig.value = state.dig; $("#digVal").textContent = state.dig; $("#digS").textContent = state.dig > 1 ? "s" : "";
  dig.style.setProperty("--p", ((state.dig - 1) / 4 * 100) + "%");
}
dig.addEventListener("input", () => { state.dig = +dig.value; LS.set("dig", state.dig); paintDig(); });
dig.addEventListener("change", () => { if (state.q) runSearch(); });
paintDig();
seg("#cat", state.cat, v => { state.cat = v; LS.set("cat", v); renderEngines(); if (state.q) runSearch(); });
seg("#time", state.time, v => { state.time = v; LS.set("time", v); if (state.q) runSearch(); });
const st = $("#strict"); st.checked = state.strict;
st.addEventListener("change", () => { state.strict = st.checked; LS.set("strict", st.checked); render(true); });
const mm = $("#minm");
function paintMin() { mm.value = state.minm; $("#minVal").textContent = state.minm; mm.style.setProperty("--p", state.minm + "%"); }
mm.addEventListener("input", () => { state.minm = +mm.value; LS.set("minm", state.minm); paintMin(); render(true); });
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
      renderChips(); if (state.q || $("#q").value.trim()) runSearch();
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
  else { const pre = (s > 0 && !/\s$/.test(v.slice(0, s)) && ins !== " OR ") ? " " : ""; out = pre + ins + sel; caret = s + out.length; }
  qi.value = v.slice(0, s) + out + v.slice(en); qi.focus(); qi.setSelectionRange(caret, caret);
});

/* settings drawer */
const drawer = $("#drawer"), scrim = $("#scrim");
function openDrawer(o) { drawer.classList.toggle("open", o); drawer.setAttribute("aria-hidden", !o); scrim.hidden = !o; if (o) { $("#apiBase").value = state.apiBase; $("#apiPath").value = state.apiPath; $("#token").value = state.token; $("#settingsNote").textContent = ""; } }
$("#openSettings").onclick = () => openDrawer(true);
$("#closeSettings").onclick = scrim.onclick = () => openDrawer(false);
addEventListener("keydown", e => { if (e.key === "Escape") openDrawer(false); });
function saveSettings() {
  state.apiBase = $("#apiBase").value.trim().replace(/\/+$/, "");
  state.apiPath = ("/" + ($("#apiPath").value.trim() || "/api/search").replace(/^\/+/, ""));
  state.token = $("#token").value.replace(/\s+/g, "");
  LS.set("apiBase", state.apiBase); LS.set("apiPath", state.apiPath); LS.set("token", state.token);
  setLink(state.token && state.apiBase ? "warn" : "", state.apiBase ? (state.token ? "uplink set" : "token needed") : "no uplink");
}
$("#saveSettings").onclick = () => { saveSettings(); note("Saved on this device."); };
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
  q.replace(/(-?)"([^"]+)"|(\S+)/g, (m, neg, ph, w) => {
    if (ph) { (neg ? excl : phrases).push(ph.toLowerCase()); return m; }
    if (!w || w === "OR" || /^-?site:/i.test(w) || w === "(" || w === ")") return m;
    if (w.startsWith("-") && w.length > 1) excl.push(w.slice(1).toLowerCase());
    else terms.push(w.replace(/[()]/g, "").toLowerCase());
    return m;
  });
  return { phrases, terms: terms.filter(Boolean), excl };
}
function fullQuery() {
  let q = qi.value.trim();
  const a = state.activeChips;
  if (a.length === 1) q += ` site:${a[0]}`;
  else if (a.length > 1) q += " (" + a.map(d => "site:" + d).join(" OR ") + ")";
  return q.trim();
}

/* ---------------- API ---------------- */
function buildUrl(q, page) {
  const p = new URLSearchParams();
  p.set("q", q);
  if (state.cat === "general" || !isGateway()) p.set("engines", state.engines.join(","));
  if (isGateway()) { p.set("category", state.cat); if (state.time) p.set("time", state.time); }
  else { if (state.cat !== "general") p.set("categories", state.cat); if (state.time) p.set("time_range", state.time); }
  p.set("safesearch", String(state.safe));
  if (isGateway()) {
    if (state.dig >= 5) { p.set("page", String(page)); p.set("deep", "1"); }
    else p.set("page", String(page));
  } else { p.set("format", "json"); p.set("pageno", String(page)); }
  return state.apiBase + state.apiPath + "?" + p.toString();
}
async function apiFetch(url, signal) {
  if (!state.apiBase) throw new Error("Set the API base in settings ⚙");
  const headers = { Accept: "application/json" };
  if (state.token) headers.Authorization = "Bearer " + state.token;
  let r;
  try { r = await fetch(url, { headers, signal, referrerPolicy: "no-referrer", credentials: "omit", cache: "no-store" }); }
  catch (e) { if (e.name === "AbortError") throw e; throw new Error("Can't reach the uplink. Check the API base, or this origin isn't allowed by the server's CORS."); }
  if (r.status === 401) throw new Error("Token rejected. Open settings ⚙ and paste your access token.");
  if (r.status === 429) throw new Error(`Rate limited. Try again in ${r.headers.get("Retry-After") || "a few"}s.`);
  if (r.status === 403) throw new Error("Forbidden by the server (origin not allowed).");
  if (!r.ok) throw new Error(`Uplink error ${r.status}.`);
  return r.json();
}
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };
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
    host: raw.host || hostOf(url), engines, sources,
    thumb: safeUrl(raw.thumbnail || raw.thumbnail_src || raw.img_src || ""),
    length: raw.length || null, match: raw.match || null
  };
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
async function runSearch() {
  const q = fullQuery();
  if (!q) return;
  state.q = q; state.seq++; state.nextPage = 1; state.hasMore = true; state.results = new Map(); state.order = 0;
  state.unresponsive = new Map(); state.counts = {}; state.safeIgnored = false; state.facets = new Set();
  if (ctrl) ctrl.abort();
  document.body.classList.add("diving");
  const u = new URL(location.href); u.hash = "q=" + encodeURIComponent(qi.value.trim()); history.replaceState(null, "", u);
  $("#results").innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  $("#status").innerHTML = "<span>sounding…</span>";
  const r = qi.getBoundingClientRect(); ping(r.left + 20, r.top + r.height / 2, true);
  await loadMore(true);
}
async function loadMore(first) {
  if (state.loading || !state.hasMore || !state.q) return;
  state.loading = true; document.body.classList.add("busy"); $("#loader").hidden = first;
  const seq = state.seq; ctrl = new AbortController();
  // Deep Dig: each step pulls `dig` upstream pages per engine.
  const pages = [];
  if (isGateway() && state.dig >= 5) pages.push(state.nextPage);
  else for (let i = 0; i < state.dig && state.nextPage + i <= 20; i++) pages.push(state.nextPage + i);
  let err = null, anyMore = false, got = 0;
  const settled = await Promise.allSettled(pages.map(p => apiFetch(buildUrl(state.q, p), ctrl.signal).then(j => ({ j, p }))));
  if (seq !== state.seq) return;
  const pq = pq0();
  for (const s of settled) {
    if (s.status === "rejected") { if (s.reason && s.reason.name !== "AbortError") err = s.reason; continue; }
    const { j, p } = s.value;
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
        prev.engines = [...new Set([...prev.engines, ...r.engines])];
      } else { r.idx = state.order++; r.m = matchInfo(r, pq); state.results.set(r.url, r); got++; }
    }
  }
  for (const r of state.results.values()) r.b = buriedScore(r);
  state.nextPage += isGateway() && state.dig >= 5 ? 1 : pages.length;
  state.hasMore = anyMore && state.nextPage <= 20 && !(err && !got);
  state.loading = false; document.body.classList.remove("busy"); $("#loader").hidden = true;
  renderEngines();
  render(first, err);
  setDepth();
  if (got) ping(innerWidth * (0.2 + Math.random() * 0.6), innerHeight * 0.8, false);
}

/* ---------------- render ---------------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function highlight(text, hits) {
  let h = esc(text);
  const ws = [...new Set(hits.map(w => String(w).toLowerCase()).filter(w => w.length > 1))].sort((a, b) => b.length - a.length);
  if (!ws.length) return h;
  const re = new RegExp("(" + ws.map(w => esc(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
  return h.replace(re, "<mark>$1</mark>");
}
let rendered = 0;
function renderFacets(list) {
  const box = $("#facets"), counts = new Map();
  for (const r of list) counts.set(r.host, (counts.get(r.host) || 0) + 1);
  const top = [...counts].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, 14);
  for (const f of state.facets) if (!counts.has(f)) top.push([f, 0]);
  box.hidden = top.length < 2; box.innerHTML = "";
  for (const [h, n] of top) {
    const b = document.createElement("button"); b.type = "button"; b.className = "facet";
    b.setAttribute("aria-pressed", state.facets.has(h)); b.innerHTML = `<span></span><b>${n}</b>`; b.firstChild.textContent = h;
    b.onclick = () => { state.facets.has(h) ? state.facets.delete(h) : state.facets.add(h); render(true); };
    box.appendChild(b);
  }
}
function sorted() {
  let list = [...state.results.values()].filter(r => (!state.strict || r.m.exact) && r.m.strength >= state.minm);
  renderFacets(list);
  if (state.facets.size) list = list.filter(r => state.facets.has(r.host));
  list.sort(state.sort === "buried" ? (a, b) => b.b - a.b || a.idx - b.idx : (a, b) => a.idx - b.idx);
  if (state.dedupe) {
    const seen = new Map(), out = [];
    for (const r of list) { if (seen.has(r.host)) { seen.get(r.host).more++; continue; } r.more = 0; seen.set(r.host, r); out.push(r); }
    list = out;
  } else list.forEach(r => r.more = 0);
  return list;
}
function render(reset, err) {
  const list = sorted(), box = $("#results");
  const bThreshold = (() => { const bs = list.map(r => r.b).sort((a, b) => b - a); return bs[Math.floor(bs.length * 0.2)] || Infinity; })();
  if (reset) { box.innerHTML = ""; rendered = 0; }
  else if (state.sort === "buried" || state.dedupe) { box.innerHTML = ""; rendered = 0; } // re-rank entire list
  const frag = document.createDocumentFragment();
  list.slice(rendered).forEach((r, i) => frag.appendChild(card(r, i, r.b >= bThreshold && r.m.exact && r.engines.length <= 2)));
  box.appendChild(frag); rendered = list.length;
  if (!list.length) box.innerHTML = err ? "" : `<div class="empty"><strong>Nothing down here.</strong>No results matched. Loosen a quote, drop a -exclude, lower Min match, turn off Strict, or switch on more engines.</div>`;
  status(list.length, err);
  if (!state.hasMore && list.length) box.insertAdjacentHTML("beforeend", `<div class="floor">— OCEAN FLOOR · ${list.length} RESULTS —</div>`);
}
function card(r, i, buried) {
  const el = document.createElement("article");
  el.className = "card" + (buried ? " buried" : ""); el.style.setProperty("--i", Math.min(i, 12));
  const path = (() => { try { const u = new URL(r.url); return (u.pathname + u.search).replace(/\/$/, ""); } catch { return ""; } })();
  const srcs = [...r.sources].sort((a, b) => (a.pos ?? 999) - (b.pos ?? 999));
  const badges = srcs.map(s => `<span class="badge" style="--c:${engColor(s.engine)}" title="${esc(engName(s.engine))}${s.pos ? " ranked #" + s.pos : ""}"><i></i>${esc(engName(s.engine))}${s.pos ? ` <b>#${s.pos}</b>` : ""}</span>`).join("");
  const tags = [
    r.m.exact ? '<span class="meta-tag ex">exact</span>' : "",
    buried ? '<span class="meta-tag bur">buried</span>' : "",
    r.length ? `<span class="meta-tag">${esc(r.length)}</span>` : "",
    r.more ? `<span class="meta-tag">+${r.more} more from ${esc(r.host)}</span>` : ""
  ].join("");
  el.innerHTML = `<div class="card-main">
    <div class="crumb"><span class="host">${esc(r.host)}</span><span class="path">${esc(path)}</span></div>
    <h3><a href="${esc(r.url)}" target="_blank" rel="noreferrer noopener" referrerpolicy="no-referrer">${highlight(r.title, r.m.hits)}</a></h3>
    <p>${highlight(r.content, r.m.hits)}</p>
    <div class="badges">${badges}${tags}</div></div>
    ${r.thumb ? `<img class="thumb" src="${esc(r.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" decoding="async">` : ""}`;
  const img = el.querySelector(".thumb"); if (img) img.onerror = () => img.remove();
  return el;
}
function status(n, err) {
  const parts = [];
  if (err) parts.push(`<span class="err">${esc(err.message)}</span>`);
  if (state.q) {
    parts.push(`<span><b>${n}</b> results · ${state.nextPage - 1} page${state.nextPage > 2 ? "s" : ""} deep · sorted by ${state.sort}${state.strict ? " · strict" : ""}${state.minm ? " · ≥" + state.minm + "% match" : ""}${state.dedupe ? " · one per domain" : ""}${state.facets.size ? " · " + state.facets.size + " domain filter" + (state.facets.size > 1 ? "s" : "") : ""}</span>`);
    const counts = Object.entries(state.counts).filter(([, v]) => v).map(([k, v]) => `${esc(engName(k))} ${v}`);
    if (counts.length) parts.push(`<span>answered: ${counts.join(" · ")}</span>`);
    if (state.unresponsive.size) parts.push(`<span class="warn unr">unresponsive: ${[...state.unresponsive].map(([k, w]) => `${esc(engName(k))} (${esc(w)})`).join(" · ")}</span>`);
    if (isGateway() && state.safe !== 0) parts.push(`<span class="warn">SafeSearch is set to Off on the server, so this filter isn't applied</span>`);
  }
  $("#status").innerHTML = parts.join("");
}

/* infinite scroll */
new IntersectionObserver(es => { if (es.some(e => e.isIntersecting) && state.q && !state.loading && state.hasMore) loadMore(false); }, { rootMargin: "600px 0px" }).observe($("#sentinel"));

$("#searchForm").addEventListener("submit", e => { e.preventDefault(); ops.hidden = true; help.setAttribute("aria-expanded", "false"); qi.blur(); runSearch(); });
addEventListener("click", e => { if (e.target.closest(".card,.badge,a,button,input")) return; ping(e.clientX, e.clientY, false); });

renderEngines(); renderChips(); setDepth();
$("#tuneBtn").onclick = () => { const o = document.body.classList.toggle("tune-open"); $("#tuneBtn").setAttribute("aria-expanded", o); };
const hq = new URLSearchParams(location.hash.slice(1)).get("q");
if (hq) { qi.value = hq; runSearch(); } else if (!state.token && state.apiBase) $("#status").innerHTML = '<span class="warn">Open settings ⚙ and paste your access token to connect.</span>';
})();
