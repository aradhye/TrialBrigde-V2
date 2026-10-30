"use strict";
/* TrialBridge front end — vanilla JS, no build step. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u) ? esc(u) : "#");
const ic = (n, c = "") => `<svg class="i ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let cid = store.get("tb_cid", ""); if (!cid) { cid = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); store.set("tb_cid", cid); }
const api = async (p, o = {}) => {
  let r; try { r = await fetch(p, { ...o, headers: { "content-type": "application/json", "x-client": cid } }); } catch { throw new Error("Can’t reach TrialBridge. Check your connection and try again."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Something went wrong. Please try again.");
  return j;
};
const tap = () => { try { navigator.vibrate && navigator.vibrate(8); } catch {} };
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// ---------- state ----------
const S = {
  view: "find", f: { sort: "rel", phases: [], fit: false }, geo: null, trials: [], next: null, total: null, loading: false, err: "", searched: false,
  cmp: store.get("tb_cmp", []), saved: {}, byId: {}, sv: [], cfg: { ai: false, research: false, version: "" },
  open: null, tab: "overview", ai: {}, web: {}, fnew: {}, flatest: {}, lastFollowCheck: 0, installEvt: null,
};
let PROF = (() => {
  const p = store.get("tb_prof2", null); if (p) return p;
  const o = store.get("tb_prof", {});
  return { age: o.age ? +o.age : null, sex: o.sex || "", notes: store.get("tb_notes", "") };
})();
const saveProf = () => store.set("tb_prof2", PROF);
const PREF = { theme: store.get("tb_theme", "auto"), text: store.get("tb_text", "m"), glass: store.get("tb_glass", "on"), lang: store.get("tb_lang", "English") };
const LANGS = ["English", "Hindi", "Tamil", "Bengali", "Marathi", "Telugu"];
function applyPrefs() {
  const d = document.documentElement, th = PREF.theme === "auto" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : PREF.theme;
  d.dataset.theme = th; d.dataset.text = PREF.text; d.dataset.glass = PREF.glass;
}
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if (PREF.theme === "auto") applyPrefs(); });

// ---------- plain-language glossary (offline fallback) ----------
const GL = [["myocardial infarction","heart attack"],["renal impairment","kidney problems"],["renal failure","kidney failure"],["hepatic impairment","liver problems"],["hepatic","liver"],["metastatic","spread to other parts of the body"],["metastases","cancer that has spread"],["malignancy","cancer"],["carcinoma","a type of cancer"],["HbA1c","average blood sugar over about 3 months (HbA1c)"],["eGFR","kidney filtering score (eGFR)"],["albuminuria","protein leaking into urine"],["hypertension","high blood pressure"],["hypotension","low blood pressure"],["antihypertensive","blood-pressure"],["exacerbations?","flare-ups"],["corticosteroids?","steroid medicines"],["T2DM","type 2 diabetes"],["gestational diabetes mellitus","diabetes that starts in pregnancy"],["diabetes mellitus","diabetes"],["gestation","pregnancy"],["lactation","breastfeeding"],["contraindications?","a medical reason not to use"],["informed consent","agreeing after the study is explained"],["BMI","body mass index (BMI)"],["ECOG","daily-activity score (ECOG)"],["chemotherapy","cancer drug treatment"],["radiotherapy","radiation treatment"],["immunosuppress\\w+","medicines that lower the immune system"],["anticoagulants?","blood thinners"],["cardiovascular","heart and blood vessel"],["pulmonary","lung"],["neuropath\\w+","nerve damage"],["comorbid\\w*","other health conditions"],["hypersensitivity","allergy"],["HIV","HIV"],["screening","first check-up"],["baseline","at the start"]];
const GLR = GL.map(([a, b]) => [new RegExp("\\b(" + a + ")", "gi"), b]);
function plain(t) { let h = esc(t); GLR.forEach(([r, b]) => { h = h.replace(r, () => "\u0001" + b + "\u0002"); }); return h.replace(/\u0001([^\u0002]*)\u0002/g, '<span class="jar">$1</span>'); }

// ---------- helpers ----------
const siteText = (s) => [s.facility, s.city, s.state, s.country].filter(Boolean).join(", ");
const place = (s) => [s.city, s.country].filter(Boolean).join(", ");
const rad = (d) => (d * Math.PI) / 180;
function km(a, b) { const dLa = rad(b.lat - a.lat), dLo = rad(b.lon - a.lon), x = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLo / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); }
const distOf = (s) => (S.geo && s.lat != null && s.lon != null ? km(S.geo, s) : null);
const fmtKm = (d) => (d < 10 ? d.toFixed(1) : Math.round(d).toLocaleString()) + " km";
const words = () => ($("#loc").value || "").toLowerCase().split(/[\s,]+/).filter(Boolean);
function sitesSorted(t) {
  if (S.geo) { const withD = t.sites.map((s) => ({ s, d: distOf(s) })); if (withD.some((x) => x.d != null)) return withD.sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9)).map((x) => x.s); }
  const w = words(), sc = (s) => w.reduce((a, x) => a + (siteText(s).toLowerCase().includes(x) ? 1 : 0), 0);
  return [...t.sites].sort((a, b) => sc(b) - sc(a));
}
const stCls = (s) => (s === "Recruiting" ? "p-ok" : s === "Not yet recruiting" ? "p-warn" : "");
const link = (t) => `https://clinicaltrials.gov/study/${t.id}`;
const profile = () => ({ age: PROF.age, sex: PROF.sex, condition: ($("#q").value || "").trim(), notes: PROF.notes });
function fit(t) {
  const p = PROF, why = []; let bad = false;
  if (p.age != null) { if (t.min != null && p.age < t.min) { bad = true; why.push(`Minimum age is ${t.min}`); } else if (t.max != null && p.age > t.max) { bad = true; why.push(`Maximum age is ${t.max}`); } else why.push("Age is in range"); }
  if (p.sex) { if (t.sex !== "All" && t.sex !== p.sex) { bad = true; why.push(`${t.sex} participants only`); } else why.push("Sex requirement met"); }
  if (p.age == null && !p.sex) return { label: "Add age or sex to check fit", short: "", cls: "", why };
  return bad ? { label: "Probably not a fit", short: "Probably not a fit", cls: "p-bad", why } : { label: "Age and sex fit", short: "Age & sex fit", cls: "p-ok", why };
}
let toastT;
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600); }
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const count = (arr) => { const m = {}; arr.forEach((x) => (m[x] = (m[x] || 0) + 1)); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
function download(name, text, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

// ---------- local per-trial data: self-check + visit plan ----------
const chkOf = (id) => store.get("tb_chk", {})[id] || {};
function setChk(id, k, v) { const all = store.get("tb_chk", {}), c = (all[id] ||= {}); if (c[k] === v) delete c[k]; else c[k] = v; store.set("tb_chk", all); }
function selfScore(t) {
  const c = chkOf(t.id), items = [...t.inc.map((x, i) => ["i" + i, "inc"]), ...t.exc.map((x, i) => ["e" + i, "exc"])];
  const answered = items.filter(([k]) => c[k]).length, flags = items.filter(([k, ty]) => (ty === "inc" ? c[k] === "n" : c[k] === "y")).length;
  return { total: items.length, answered, flags, unsure: items.filter(([k]) => c[k] === "u").length };
}
const TODO = [["doctor", "Talk to my doctor about this study"], ["contact", "Contact the study team to confirm it’s still open"], ["cost", "Ask about costs, travel and time commitment"], ["docs", "Gather recent reports and a list of my medicines"], ["risk", "Ask about risks, side effects and what happens if I stop"]];
const planOf = (id) => { const p = store.get("tb_plan", {})[id] || {}; return { done: p.done || {}, custom: p.custom || [], remind: p.remind || "" }; };
function setPlan(id, fn) { const all = store.get("tb_plan", {}), p = planOf(id); fn(p); all[id] = p; store.set("tb_plan", all); }
function planProgress(id) { const p = planOf(id), tot = TODO.length + p.custom.length, done = TODO.filter(([k]) => p.done[k]).length + p.custom.filter((c) => c.done).length; return { tot, done }; }

// ---------- discover: results ----------
function card(t, i = 0) {
  const f = fit(t), n = sitesSorted(t)[0], d = n && distOf(n), c = S.cmp.includes(t.id), sv = !!S.saved[t.id];
  return `<article class="card glass" data-id="${t.id}" style="animation-delay:${Math.min(i, 8) * 45}ms">
  <div class="card-top"><div class="pills"><span class="pill dot ${stCls(t.status)}">${esc(t.status)}</span>${t.phase ? `<span class="pill">${esc(t.phase)}</span>` : ""}${f.short ? `<span class="pill ${f.cls}">${esc(f.short)}</span>` : ""}</div>
  <div class="card-acts"><button class="iconbtn cmp ${c ? "on" : ""}" data-act="cmp" data-id="${t.id}" aria-pressed="${c}" aria-label="${c ? "Remove from compare" : "Add to compare"}" title="Compare">${ic("compare")}</button><button class="iconbtn ${sv ? "on" : ""}" data-act="save" data-id="${t.id}" aria-pressed="${sv}" aria-label="${sv ? "Remove from saved" : "Save trial"}" title="Save">${ic("bookmark")}</button></div></div>
  <h3><button data-act="open" data-id="${t.id}">${esc(t.title)}</button></h3>
  <p class="meta">${esc(t.id)}${t.sponsor ? " · " + esc(t.sponsor) : ""}</p>
  ${t.summary ? `<p class="snip">${esc(t.summary)}</p>` : ""}
  <div class="facts-row">${n ? `<span>${ic("pin")}${esc(place(n) || "Site listed")}${d != null ? ` · <b>${fmtKm(d)}</b>` : ""}${t.siteTotal > 1 ? ` (+${t.siteTotal - 1})` : ""}</span>` : ""}<span>${ic("users")}Ages ${t.min ?? "any"}–${t.max ?? "any"}</span>${t.enrollment ? `<span>${ic("flask")}${t.enrollment.toLocaleString()} people</span>` : ""}</div></article>`;
}
const phaseKey = (t) => t.phase || "Not stated";
const locScore = (t) => { const w = words(); return Math.max(0, ...t.sites.map((s) => w.reduce((a, x) => a + (siteText(s).toLowerCase().includes(x) ? 1 : 0), 0))); };
const nearD = (t) => { const ds = t.sites.map(distOf).filter((x) => x != null); return ds.length ? Math.min(...ds) : 1e9; };
function visible() {
  let L = S.trials.slice();
  if (S.f.phases.length) L = L.filter((t) => S.f.phases.includes(phaseKey(t)));
  if (S.f.fit) L = L.filter((t) => fit(t).cls !== "p-bad");
  const k = S.f.sort;
  if (k === "near") L.sort(S.geo ? (a, b) => nearD(a) - nearD(b) : (a, b) => locScore(b) - locScore(a));
  else if (k === "new") L.sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
  else if (k === "size") L.sort((a, b) => (b.enrollment || 0) - (a.enrollment || 0));
  return L;
}
function toolbar() {
  const ph = [...new Set(S.trials.map(phaseKey))].sort(), fo = isFollowing();
  return `<div class="toolbar noprint" role="toolbar" aria-label="Refine results">
  <select class="mini-select glass" data-f="sort" aria-label="Sort by">${[["rel", "Best match"], ["near", S.geo ? "Nearest to me" : "Nearest to search"], ["new", "Recently updated"], ["size", "Largest enrollment"]].map(([v, l]) => `<option value="${v}" ${S.f.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select>
  ${ph.map((p) => `<button class="chip ${S.f.phases.includes(p) ? "on" : ""}" data-act="phase" data-v="${esc(p)}" aria-pressed="${S.f.phases.includes(p)}">${esc(p)}</button>`).join("")}
  <label class="fswitch glass">Hide not-a-fit<span class="switch"><input type="checkbox" role="switch" data-f="fit" ${S.f.fit ? "checked" : ""}><i></i></span></label>
  <button class="chip ${fo ? "on" : ""}" data-act="follow" aria-pressed="${fo}">${ic("bell")}${fo ? "Following" : "Follow search"}</button></div>`;
}
function insights(L) {
  if (!L.length) return "";
  const stc = { Recruiting: "var(--c5)", "Not yet recruiting": "var(--c2)" }, st = count(L.map((t) => t.status));
  const ph = count(L.map(phaseKey)).slice(0, 5), cities = count(L.flatMap((t) => [...new Set(t.sites.map((s) => s.city).filter(Boolean))])).slice(0, 6);
  const bins = Array.from({ length: 10 }, (_, k) => ({ label: k * 10 + (k === 9 ? "+" : ""), value: L.filter((t) => (t.min ?? 0) <= k * 10 + 9 && (t.max ?? 200) >= k * 10).length }));
  const a = PROF.age, hi = a != null && a >= 0 ? Math.min(9, Math.floor(a / 10)) : -1;
  return `<details class="panel glass" ${innerWidth > 900 ? "open" : ""}><summary>At a glance</summary><p class="meta">Based on the ${L.length} trials shown</p>
  <p class="lbl">Recruitment status</p>${donut(st.map(([l, v], k) => ({ label: l, value: v, color: stc[l] || ["var(--c6)", "var(--c3)", "var(--c4)"][k % 3] })), "Trials by status")}
  <p class="lbl">Study phase</p>${bars(ph.map(([l, v]) => ({ label: l, value: v, color: "var(--c3)" })))}
  ${cities.length ? `<p class="lbl">Where they run</p>${bars(cities.map(([l, v]) => ({ label: l, value: v, color: "var(--c1)" })))}` : ""}
  <p class="lbl">Ages accepted${a != null ? " · yours highlighted" : ""}</p>${columns(bins, hi, "Number of shown trials accepting each age decade")}</details>`;
}
function renderResults() {
  const el = $("#results"), hero = $(".hero");
  hero.classList.toggle("compact", S.searched); $("#home").hidden = S.searched;
  if (!S.searched) { el.innerHTML = ""; return; }
  if (S.loading && !S.trials.length) { el.innerHTML = '<div class="sk"></div><div class="sk"></div><div class="sk"></div>'; return; }
  if (S.err && !S.trials.length) { el.innerHTML = `<p class="err" role="alert">${esc(S.err)}</p>`; return; }
  if (!S.trials.length) { el.innerHTML = `<div class="empty glass"><div class="big">${ic("search")}</div><h2>No open trials matched</h2><p>Try a broader condition, remove the city, or choose a whole country.</p></div>`; return; }
  const L = visible();
  el.innerHTML = `<div class="layout"><aside class="side noprint">${insights(L)}</aside><div class="list"><div class="rbar"><span class="count">${S.total != null ? `${S.total.toLocaleString()} open trials` : "Results"}<small>Showing ${L.length}${L.length !== S.trials.length ? ` of ${S.trials.length} loaded` : ""} · Source: ClinicalTrials.gov</small></span></div>${toolbar()}
  ${L.length ? L.map(card).join("") : '<div class="empty glass">No loaded trials match these filters.</div>'}${S.err ? `<p class="err" role="alert">${esc(S.err)}</p>` : ""}${S.next ? `<p style="text-align:center"><button class="btn" data-act="more" ${S.loading ? "disabled" : ""}>${S.loading ? "Loading…" : "Load more trials"}</button></p>` : ""}</div></div>`;
}
const stVal = () => ($("input[name=st]:checked") || {}).value || "";
const curSearch = () => ({ q: $("#q").value.trim(), loc: $("#loc").value.trim(), st: stVal() });
async function search(more) {
  if (S.loading) return;
  const { q, loc, st } = curSearch();
  S.searched = true;
  if (!q && !loc && !S.geo) { S.trials = []; S.err = "Enter a condition or a location to search."; renderResults(); return; }
  S.loading = true; S.err = ""; if (!more) { S.trials = []; S.next = null; S.total = null; S.f.phases = []; }
  renderResults();
  const p = new URLSearchParams({ q, loc, status: st }); if (more && S.next) p.set("page", S.next); if (S.geo) p.set("geo", `${S.geo.lat},${S.geo.lon},${$("#rad").value}`);
  try { const r = await api("/api/trials?" + p); r.trials.forEach((t) => (S.byId[t.id] = t)); S.trials.push(...r.trials); S.next = r.next; S.total = r.total; if (!more) { addRecent({ q, loc, st }); markFollowSeen(); } }
  catch (e) { S.err = e.message; }
  S.loading = false; renderResults();
  if (!more) window.scrollTo({ top: Math.max(0, $("#results").offsetTop - 150), behavior: "smooth" });
}
function runSaved(s) { $("#q").value = s.q || ""; $("#loc").value = s.loc || ""; const r = $(`input[name=st][value="${s.st || ""}"]`); if (r) r.checked = true; S.geo = null; geoUi(); if (S.view !== "find") location.hash = "#/find"; search(); }

// ---------- recent + followed searches ----------
const sKey = (s) => [s.q.toLowerCase(), s.loc.toLowerCase(), s.st].join("|");
const sLabel = (s) => [s.q, s.loc].filter(Boolean).join(" · ") + (s.st ? ` (${s.st.toLowerCase()})` : "");
function addRecent(s) { if (!s.q && !s.loc) return; const L = [s, ...store.get("tb_recent", []).filter((x) => sKey(x) !== sKey(s))].slice(0, 6); store.set("tb_recent", L); }
const follows = () => store.get("tb_follow", []);
const isFollowing = () => follows().some((f) => sKey(f) === sKey(curSearch()));
async function latestIds(s) {
  const p = new URLSearchParams({ q: s.q, loc: s.loc, status: s.st, sort: "new" });
  return (await api("/api/trials?" + p)).trials.map((t) => t.id);
}
async function toggleFollow() {
  const s = curSearch(); if (!s.q && !s.loc) return toast("Enter a condition or place to follow.");
  let L = follows();
  if (L.some((f) => sKey(f) === sKey(s))) { L = L.filter((f) => sKey(f) !== sKey(s)); store.set("tb_follow", L); toast("Stopped following"); }
  else {
    if (L.length >= 5) return toast("You can follow up to 5 searches.");
    try { const seen = await latestIds(s); L.push({ ...s, id: Date.now().toString(36), seen }); store.set("tb_follow", L); toast("Following. We’ll flag new trials."); tap(); }
    catch (e) { return toast(e.message); }
  }
  renderResults();
}
function markFollowSeen() { const f = follows().find((x) => sKey(x) === sKey(curSearch())); if (f && S.flatest[f.id]) { f.seen = S.flatest[f.id]; store.set("tb_follow", follows().map((x) => (x.id === f.id ? f : x))); S.fnew[f.id] = 0; } }
async function checkFollows(force) {
  if (!force && Date.now() - S.lastFollowCheck < 10 * 60e3) return;
  S.lastFollowCheck = Date.now();
  await Promise.all(follows().map(async (f) => { try { const ids = await latestIds(f); S.flatest[f.id] = ids; S.fnew[f.id] = ids.filter((i) => !f.seen.includes(i)).length; } catch {} }));
  renderHome(); if (S.view === "me") renderMe();
}
function renderHome() {
  const F = follows(), R = store.get("tb_recent", []), pop = [["Type 2 diabetes", "Delhi"], ["Breast cancer", "Mumbai"], ["Asthma", "Chennai"], ["Hypertension", "India"], ["Migraine", "Bengaluru"]];
  const prof = $("#profstrip"); prof.innerHTML = PROF.age != null || PROF.sex ? `${ic("person")}Fit check for <em>${[PROF.age != null ? "age " + PROF.age : "", PROF.sex].filter(Boolean).join(", ")}</em> · Edit` : `${ic("person")}Add age &amp; sex for a personal fit check`;
  $("#home").innerHTML = (F.length ? `<div class="sect"><h2>Following</h2><small>New since you last looked</small></div><div class="chiprow">${F.map((f) => `<button class="chip" data-act="runs" data-q="${esc(f.q)}" data-l="${esc(f.loc)}" data-s="${esc(f.st)}">${ic("bell")}${esc(sLabel(f))}${S.fnew[f.id] ? ` <b>${S.fnew[f.id]} new</b>` : ""}</button>`).join("")}</div>` : "")
    + (R.length ? `<div class="sect"><h2>Recent</h2><button class="btn sm" data-act="clearrecent">Clear</button></div><div class="chiprow">${R.map((s) => `<button class="chip" data-act="runs" data-q="${esc(s.q)}" data-l="${esc(s.loc)}" data-s="${esc(s.st)}">${ic("clock")}${esc(sLabel(s))}</button>`).join("")}</div>` : "")
    + `<div class="sect"><h2>Try a search</h2></div><div class="chiprow">${pop.map(([q, l]) => `<button class="chip" data-act="runs" data-q="${q}" data-l="${l}" data-s="">${q} · ${l}</button>`).join("")}</div>
    <div class="sect"><h2>How it works</h2></div><div class="tiles">
    <div class="tile glass"><div class="ico g1">${ic("search")}</div><b>Search the registry</b><span>Live results from ClinicalTrials.gov, by condition and place or near you.</span></div>
    <div class="tile glass"><div class="ico g2">${ic("list")}</div><b>Understand &amp; self-check</b><span>Eligibility in plain words, with a checklist to see what might not fit.</span></div>
    <div class="tile glass"><div class="ico g3">${ic("bell")}</div><b>Follow &amp; prepare</b><span>Save trials, track changes, and plan your next steps with a doctor.</span></div></div>`;
}

// ---------- compare / save ----------
function updateCounts() { $("#nc").textContent = S.cmp.length || ""; $("#ns").textContent = Object.keys(S.saved).length || ""; }
function toggleCmp(id) {
  if (S.cmp.includes(id)) S.cmp = S.cmp.filter((x) => x !== id); else if (S.cmp.length >= 3) return toast("You can compare up to 3 trials."); else { S.cmp.push(id); toast("Added to compare"); }
  store.set("tb_cmp", S.cmp); tap(); updateCounts(); renderResults(); if (S.view === "compare") renderCompare(); if (S.open) renderSheet();
}
async function toggleSave(id) {
  try {
    if (S.saved[id]) { await api("/api/saved/" + id, { method: "DELETE" }); delete S.saved[id]; toast("Removed from saved"); }
    else { await api("/api/saved", { method: "POST", body: JSON.stringify({ id }) }); S.saved[id] = true; toast("Saved. We’ll flag changes."); }
    tap();
  } catch (e) { toast(e.message); }
  updateCounts(); renderResults(); if (S.view === "saved") renderSaved(); if (S.open) renderSheet();
}
async function ensure(ids) { await Promise.all(ids.filter((id) => !S.byId[id]).map(async (id) => { try { S.byId[id] = (await api("/api/trial/" + id)).trial; } catch {} })); }
async function renderCompare() {
  const el = $("#v-compare"); await ensure(S.cmp);
  const L = S.cmp.map((id) => S.byId[id]).filter(Boolean);
  const head = `<div class="pagehead"><div><h1>Compare</h1><p>Up to three trials, side by side.</p></div>${L.length ? `<span class="noprint"><button class="btn sm" data-act="print">${ic("print")}Print</button> <button class="btn sm" data-act="clearcmp">Clear</button></span>` : ""}</div>`;
  if (!L.length) { el.innerHTML = head + `<div class="empty glass"><div class="big">${ic("compare")}</div><h2>Nothing to compare yet</h2><p>Tap the compare button on up to three trials in the results.</p><a class="btn primary" href="#/find">Find trials</a></div>`; return; }
  const em = Math.max(1, ...L.map((t) => t.enrollment || 0));
  const R = [["Status", (t) => esc(t.status)], ["Phase", (t) => esc(t.phase || "—")], ["Sponsor", (t) => esc(t.sponsor || "—")],
    ["Enrollment", (t) => (t.enrollment ?? "—") + (t.enrollment ? `<div class="mini"><i style="width:${(t.enrollment / em) * 100}%"></i></div>` : "")],
    ["Age range", (t) => `${t.min ?? "any"}–${t.max ?? "any"}` + ageBar(t.min, t.max, PROF.age, true)], ["Sex", (t) => esc(t.sex)], ["Your fit", (t) => esc(fit(t).label)],
    ["Sites", (t) => t.siteTotal], ["Nearest site", (t) => { const n = sitesSorted(t)[0], d = n && distOf(n); return n ? esc(siteText(n)) + (d != null ? ` · ${fmtKm(d)}` : "") : "—"; }],
    ["You may join if", (t) => t.inc.slice(0, 4).map(plain).join("<br><br>") || "—"], ["You may not join if", (t) => t.exc.slice(0, 4).map(plain).join("<br><br>") || "—"], ["Last updated", (t) => esc(t.updated || "—")]];
  el.innerHTML = head + `<div class="scroll glass"><table><thead><tr><td></td>${L.map((t) => `<td><a href="${link(t)}" target="_blank" rel="noopener">${esc(t.id)}</a><br>${esc(t.title)}<div class="pills noprint" style="margin:10px 0 0"><button class="btn sm" data-act="open" data-id="${t.id}">Details</button><button class="btn sm" data-act="cmp" data-id="${t.id}">Remove</button></div></td>`).join("")}</tr></thead>${R.map(([k, f]) => { const v = L.map(f); return `<tr class="${new Set(v).size > 1 ? "dr" : ""}"><th>${k}</th>${v.map((x) => `<td>${x}</td>`).join("")}</tr>`; }).join("")}</table></div><p class="note">Highlighted rows differ between trials.</p>`;
}
async function renderSaved() {
  const el = $("#v-saved"); el.innerHTML = '<div class="pagehead"><h1>Saved</h1></div><div class="sk"></div><div class="sk"></div>';
  try {
    const r = await api("/api/saved?check=1"), L = r.items; L.forEach(({ trial }) => (S.byId[trial.id] = trial)); S.sv = L;
    const head = `<div class="pagehead"><div><h1>Saved</h1><p>Checked ${new Date(r.checkedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p></div>${L.length ? `<span class="noprint"><button class="btn sm" data-act="copysum">${ic("copy")}Copy summary</button> <button class="btn sm" data-act="print">${ic("print")}Print</button></span>` : ""}</div>`;
    if (!L.length) { el.innerHTML = head + `<div class="empty glass"><div class="big">${ic("bookmark")}</div><h2>No saved trials</h2><p>Save a trial and we’ll check the registry for changes whenever you come back.</p><a class="btn primary" href="#/find">Find trials</a></div>`; return; }
    const ch = L.filter((x) => x.changes && x.changes.length).length, tasks = L.reduce((a, x) => { const p = planProgress(x.trial.id); return [a[0] + p.done, a[1] + p.tot]; }, [0, 0]);
    el.innerHTML = head + `<div class="stats"><div class="stat glass"><b>${L.length}</b><span>Saved trials</span></div><div class="stat glass"><b>${ch}</b><span>With changes</span></div><div class="stat glass"><b>${tasks[0]}/${tasks[1]}</b><span>Next steps done</span></div></div>`
      + L.map(({ trial: t, changes: c, error, note }) => { const pp = planProgress(t.id), ss = selfScore(t);
        return `<article class="card glass" data-id="${t.id}"><div class="card-top"><div class="pills"><span class="pill dot ${stCls(t.status)}">${esc(t.status)}</span>${t.phase ? `<span class="pill">${esc(t.phase)}</span>` : ""}<span class="pill p-tint">${pp.done}/${pp.tot} steps</span>${ss.flags ? `<span class="pill p-warn">${plural(ss.flags, "flag")} in self-check</span>` : ""}</div></div><h3><button data-act="open" data-id="${t.id}">${esc(t.title)}</button></h3><p class="meta">${esc(t.id)}${t.sponsor ? " · " + esc(t.sponsor) : ""}</p>
        ${error ? `<p class="note">Couldn’t check the registry just now: ${esc(error)}</p>` : c.length ? `<div class="diff"><b>What changed since you last reviewed</b><br>${c.map(esc).join("<br>")}</div>` : '<p class="meta">No changes since you last reviewed.</p>'}
        <label class="noprint" style="display:block;margin-top:12px;font-size:.84rem;color:var(--mute);font-weight:600">Your notes<textarea data-note="${t.id}" maxlength="1000" placeholder="Questions for the doctor, contact made, next steps…">${esc(note)}</textarea></label>
        <div class="pills noprint" style="margin:12px 0 0">${c.length ? `<button class="btn primary sm" data-act="ack" data-id="${t.id}">${ic("check")}Mark as reviewed</button>` : ""}<button class="btn sm" data-act="open" data-id="${t.id}">View details</button><button class="btn sm danger" data-act="save" data-id="${t.id}">${ic("trash")}Remove</button></div></article>`; }).join("");
  } catch (e) { el.innerHTML = `<div class="pagehead"><h1>Saved</h1></div><p class="err" role="alert">${esc(e.message)}</p>`; }
}
function copySummary() {
  const t = (S.sv || []).map(({ trial: x, note }) => { const n = sitesSorted(x)[0], c = x.contacts[0]; return [`${x.title} (${x.id})`, `Status: ${x.status}${x.phase ? " · " + x.phase : ""} · Ages ${x.min ?? "any"}–${x.max ?? "any"}`, n ? `Nearest site: ${siteText(n)}` : "", c ? `Contact: ${[c.name, c.phone, c.email].filter(Boolean).join(", ")}` : "", `Record: ${link(x)}`, note ? `My notes: ${note}` : ""].filter(Boolean).join("\n"); }).join("\n\n");
  navigator.clipboard.writeText("Clinical trials to discuss with my doctor\n\n" + t).then(() => toast("Summary copied"), () => toast("Couldn’t copy. Use Print instead."));
}

// ---------- trial sheet ----------
const TABS = [["overview", "Overview"], ["eligibility", "Eligibility"], ["plan", "Plan"], ["locations", "Sites"], ["contacts", "Contacts"], ["research", "Web"]];
let lastFocus;
function openTrial(id) {
  if (!S.byId[id]) return; lastFocus = document.activeElement; S.open = id; S.tab = "overview"; history.replaceState(null, "", "#/trial/" + id); renderSheet();
  $("#scrim").classList.add("show"); const d = $("#sheet"); d.setAttribute("aria-hidden", "false"); $("#app").inert = true; document.body.style.overflow = "hidden";
  requestAnimationFrame(() => { d.classList.add("open"); d.focus({ preventScroll: true }); });
}
function closeSheet() {
  if (!S.open) return; S.open = null; if (location.hash.startsWith("#/trial/")) history.replaceState(null, "", "#/" + (S.view === "find" ? "find" : S.view));
  const d = $("#sheet"); d.classList.remove("open"); d.style.transform = ""; d.setAttribute("aria-hidden", "true"); $("#scrim").classList.remove("show"); $("#app").inert = false; document.body.style.overflow = "";
  lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true });
}
function renderSheet(reset) {
  const t = S.byId[S.open]; if (!t) return;
  const old = $(".sbody"), top = old && !reset ? old.scrollTop : 0, sv = !!S.saved[t.id], c = S.cmp.includes(t.id);
  const body = { overview: ovTab, eligibility: elTab, plan: planTab, locations: locTab, contacts: ctTab, research: rsTab }[S.tab](t);
  $("#sheet").innerHTML = `<div class="shead" data-drag><div class="grab"></div><div class="stop"><div class="pills"><span class="pill dot ${stCls(t.status)}">${esc(t.status)}</span>${t.phase ? `<span class="pill">${esc(t.phase)}</span>` : ""}</div><button class="iconbtn" data-act="close" aria-label="Close details">${ic("x")}</button></div><h2 id="dtitle">${esc(t.title)}</h2><p class="meta" style="margin:0">${esc(t.id)}${t.sponsor ? " · " + esc(t.sponsor) : ""}</p>
  <div class="acts"><button class="btn sm ${sv ? "on" : ""}" data-act="save" data-id="${t.id}">${ic("bookmark")}${sv ? "Saved" : "Save"}</button><button class="btn sm ${c ? "on" : ""}" data-act="cmp" data-id="${t.id}">${ic("compare")}${c ? "In compare" : "Compare"}</button><button class="btn sm" data-act="share" data-id="${t.id}">${ic("share")}Share</button><a class="btn sm" href="${link(t)}" target="_blank" rel="noopener">${ic("ext")}Official record</a></div>
  <div class="seg scroll" role="tablist">${TABS.map(([k, l]) => `<button role="tab" data-act="tab" data-tab="${k}" aria-selected="${S.tab === k}">${l}</button>`).join("")}</div></div><div class="sbody" role="tabpanel">${body}</div>`;
  const nb = $(".sbody"); if (nb) nb.scrollTop = top;
}
const fact = (k, v) => (v || v === 0 ? `<div><small>${k}</small>${esc(v)}</div>` : "");
function ovTab(t) {
  const n = sitesSorted(t)[0], d = n && distOf(n), c = t.contacts[0], f = fit(t);
  return `${t.summary ? `<p>${esc(t.summary)}</p>` : '<p class="meta">No summary was published for this study.</p>'}
  <div class="pills" style="margin:6px 0 0">${c && c.phone ? `<a class="btn sm" href="tel:${esc(c.phone.replace(/[^\d+]/g, ""))}">${ic("phone")}Call study team</a>` : ""}${c && c.email ? `<a class="btn sm" href="mailto:${esc(c.email)}?subject=${encodeURIComponent("Question about " + t.id)}">${ic("mail")}Email</a>` : ""}${n ? `<a class="btn sm" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(siteText(n))}" target="_blank" rel="noopener">${ic("pin")}Nearest site${d != null ? " · " + fmtKm(d) : ""}</a>` : ""}</div>
  <h3 style="margin-top:20px">Who can join (age)</h3>${ageBar(t.min, t.max, PROF.age)}
  <div class="facts">${fact("Conditions", t.cond.slice(0, 4).join(", "))}${fact("Study type", t.type)}${fact("Enrollment", t.enrollment)}${fact("Start", t.start)}${fact("Ages", `${t.min ?? "any"}–${t.max ?? "any"}`)}${fact("Sex", t.sex)}${fact("Healthy volunteers", t.healthy)}${fact("Treatments studied", t.interventions.join(", "))}${fact("Record updated", t.updated)}</div>
  <p class="note ${f.cls === "p-bad" ? "warn" : f.cls === "p-ok" ? "ok" : ""}">${esc(f.why.join(" · ") || "Add your age and sex in Me to see a rough fit check.")}</p>`;
}
function elTab(t) {
  const ai = S.ai[t.id], c = chkOf(t.id), sc = selfScore(t);
  const item = (x, k, ty) => { const L = ty === "inc" ? ["Yes", "No", "Not sure"] : ["Applies", "Doesn’t", "Not sure"], a = c[k] || ""; return `<li class="${ty}" data-a="${a}">${plain(x)}<span class="raw">Original: ${esc(x)}</span><div class="seg" role="group" aria-label="Does this apply to you?">${["y", "n", "u"].map((v, j) => `<button data-act="chk" data-k="${k}" data-v="${v}" aria-pressed="${a === v}">${L[j]}</button>`).join("")}</div></li>`; };
  let h = "";
  if (sc.total) {
    const pct = (sc.answered / sc.total) * 100, tone = sc.flags ? "var(--c2)" : "var(--c5)";
    h += `<div class="score">${ring(pct, tone, `Self-check ${sc.answered} of ${sc.total} answered`)}<div><b>${sc.flags ? `${plural(sc.flags, "item")} may not fit` : sc.answered === sc.total ? "No red flags in your answers" : "Your self-check"}</b><span>${sc.answered} of ${sc.total} answered. ${sc.flags ? "Ask the study team whether these apply to you." : "Only the study team can confirm eligibility."}</span></div></div>`;
  }
  if (S.cfg.ai) h += `<div class="panel glass" style="margin-bottom:16px"><b>${ic("sparkle")} Explain with AI</b><p class="meta" style="margin:6px 0 12px">Rewrites the criteria in plain language and checks them against your age, sex and notes from <a href="#/me" data-act="closesheet">Me</a>. Nothing is stored.</p><div class="formrow"><select id="lang" aria-label="Language" style="width:auto">${LANGS.map((l) => `<option ${PREF.lang === l ? "selected" : ""}>${l}</option>`).join("")}</select><button class="btn primary sm" data-act="explain" data-id="${t.id}" ${ai && ai.loading ? "disabled" : ""}>${ai && ai.loading ? "Working…" : ai && ai.data ? "Run again" : "Explain this trial"}</button></div></div>`;
  else h += '<p class="note">Plain-language rewriting uses a built-in glossary. Set ANTHROPIC_API_KEY on the server to turn on full AI explanations.</p>';
  if (ai && ai.loading) h += '<div class="sk"></div>';
  else if (ai && ai.error) h += `<p class="err" role="alert">${esc(ai.error)}</p>`;
  else if (ai && ai.data) {
    const d = ai.data, chip = { met: ["p-ok", "Looks OK"], not_met: ["p-bad", "May not fit"], unknown: ["", "Unclear"] };
    h += `<h3>In short</h3><p>${esc(d.summary)}</p>` + (d.questions.length ? `<h3>Questions to ask the study team</h3><ul class="plain">${d.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : "")
      + (d.personalised ? `<h3>AI quick screen</h3><ul class="crit">${d.criteria.map((x) => `<li><span class="pill ${chip[x.match][0]}">${x.type === "exclusion" ? "Exclusion · " : ""}${chip[x.match][1]}</span> ${esc(x.plain)}<span class="raw">Original: ${esc(x.original)}</span></li>`).join("")}</ul><p class="note">A rough screen from what you entered. Only the study team can confirm eligibility.</p>` : "");
  }
  h += `<h3>You may be able to join if…</h3><ul class="crit">${t.inc.map((x, i) => item(x, "i" + i, "inc")).join("") || '<li class="meta">Not listed. Check the official record.</li>'}</ul><h3>You may not be able to join if…</h3><ul class="crit">${t.exc.map((x, i) => item(x, "e" + i, "exc")).join("") || '<li class="meta">Not listed.</li>'}</ul>`;
  return h;
}
function planTab(t) {
  const p = planOf(t.id), pg = planProgress(t.id), ai = S.ai[t.id], qs = ai && ai.data && ai.data.questions.length ? ai.data.questions : ["What is the study testing, and what will I be asked to do?", "How long does it last and how often are the visits?", "Are there costs, and is travel or time off covered?", "What are the possible risks, and can I leave at any time?"];
  return `<div class="score">${ring((pg.done / pg.tot) * 100, "var(--c5)", `${pg.done} of ${pg.tot} steps done`)}<div><b>Next steps</b><span>${pg.done} of ${pg.tot} done. Kept privately on this device.</span></div></div>
  <ul class="todo">${TODO.map(([k, l]) => `<li><label><input type="checkbox" data-act="todo" data-k="${k}" ${p.done[k] ? "checked" : ""}><span>${l}</span></label></li>`).join("")}${p.custom.map((c) => `<li><label><input type="checkbox" data-act="todo" data-k="c:${c.id}" ${c.done ? "checked" : ""}><span>${esc(c.t)}</span><button class="x" data-act="deltodo" data-k="${c.id}" aria-label="Delete step">${ic("x")}</button></label></li>`).join("")}</ul>
  <div class="addrow"><input id="newtodo" maxlength="120" placeholder="Add your own step…" aria-label="Add a step"><button class="btn sm" data-act="addtodo">${ic("plus")}Add</button></div>
  <h3>Remind me</h3><p class="meta" style="margin-top:-4px">Adds a follow-up to your calendar, e.g. to call the study team.</p><div class="formrow"><input type="date" id="remind" min="${today()}" value="${esc(p.remind || addDays(3))}" aria-label="Reminder date"><button class="btn primary sm" data-act="ics" data-id="${t.id}">${ic("cal")}Add to calendar</button></div>
  <h3>Questions to ask</h3><ul class="plain">${qs.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>
  <div class="pills"><button class="btn sm" data-act="copyq" data-id="${t.id}">${ic("copy")}Copy questions</button></div>`;
}
const countryChart = (t) => { const c = count(t.sites.map((x) => x.country).filter(Boolean)).slice(0, 5); return c.length > 1 ? `<p class="lbl">Sites by country</p>${bars(c.map(([l, v]) => ({ label: l, value: v, color: "var(--c1)" })))}` : ""; };
function locTab(t) {
  const L = sitesSorted(t); if (!L.length) return '<p class="meta">No study sites are listed yet.</p>';
  return countryChart(t) + `<p class="meta">${plural(t.siteTotal, "site")}${t.siteTotal > L.length ? ` (showing ${L.length})` : ""}. ${S.geo ? "Nearest to you first." : "Closest matches to your search first."}</p>` + L.map((s) => { const d = distOf(s); return `<div class="site"><span><b>${esc(s.facility || "Study site")}</b><br>${esc([s.city, s.state, s.country].filter(Boolean).join(", "))}${d != null ? ` · <b>${fmtKm(d)}</b>` : ""}</span><span style="text-align:right">${s.status ? `<span class="pill ${stCls(s.status)}">${esc(s.status)}</span><br>` : ""}<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(siteText(s))}" target="_blank" rel="noopener">Map ↗</a></span></div>`; }).join("");
}
function ctTab(t) {
  const a = t.contacts.map((c) => `<li><b>${esc(c.name || "Study contact")}</b>${c.role ? ` (${esc(c.role)})` : ""}${c.phone ? `<br>Phone: <a href="tel:${esc(c.phone.replace(/[^\d+]/g, ""))}">${esc(c.phone)}</a>` : ""}${c.email ? `<br>Email: <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}</li>`).join("");
  const b = t.officials.map((o) => `<li><b>${esc(o.name)}</b>${o.role ? ` (${esc(o.role)})` : ""}${o.affiliation ? `<br>${esc(o.affiliation)}` : ""}</li>`).join("");
  return (a ? `<h3>Study contacts</h3><ul class="plain">${a}</ul>` : "") + (b ? `<h3>Responsible investigators</h3><ul class="plain">${b}</ul>` : "") + (!a && !b ? '<p class="meta">No contacts are published in the registry for this study. Try the Web tab, or use the official record link above.</p>' : "") + '<p class="note">Contact the study team before travelling, and ask them to confirm the study is still open to you.</p>';
}
function rsTab(t) {
  const w = S.web[t.id], btn = `<button class="btn primary sm" data-act="research" data-id="${t.id}" ${w && w.loading ? "disabled" : ""}>${ic("globe")}${w && w.loading ? "Searching the web…" : w && w.data ? "Search again" : "Search the web"}</button>`;
  let h = "";
  if (!S.cfg.research) h = '<p class="note">Web research is off. Add TINYFISH_API_KEY to the server .env file to find hospital and news pages beyond the registry.</p>';
  else if (w && w.loading) h = '<div class="sk"></div>';
  else if (w && w.error) h = `<p class="err" role="alert">${esc(w.error)}</p>`;
  else if (w && w.data) {
    const r = w.data, x = r.extracted;
    h = (r.results.length ? `<ul class="plain">${r.results.map((p) => `<li><a href="${safeUrl(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a><br><span class="meta">${esc(p.snippet)}</span></li>`).join("")}</ul>` : '<p class="meta">No extra public pages were found.</p>')
      + (x.contacts.length || x.ids.length || x.status.length ? `<h3>Found on those pages</h3><ul class="plain">${x.contacts.map((c) => `<li>Contact: ${esc(c)}</li>`).join("")}${x.ids.length ? `<li>Study IDs mentioned: ${esc(x.ids.join(", "))}</li>` : ""}${x.status.map((s) => `<li>Status hint: ${esc(s)}</li>`).join("")}</ul><p class="note warn">Extracted automatically from third-party pages. Verify on the official record.</p>` : "");
  }
  return `<p>Look for hospital pages, news and FAQs about this study that the registry may not show.</p>${S.cfg.research ? btn : ""}<div style="margin-top:16px">${h}</div>`;
}
async function runExplain(id) {
  const lg = $("#lang"); if (lg) { PREF.lang = lg.value; store.set("tb_lang", PREF.lang); }
  S.ai[id] = { loading: true }; renderSheet();
  try { S.ai[id] = { data: await api("/api/explain", { method: "POST", body: JSON.stringify({ id, profile: profile(), language: PREF.lang }) }) }; } catch (e) { S.ai[id] = { error: e.message }; }
  if (S.open === id) renderSheet();
}
async function runResearch(id) {
  const t = S.byId[id]; S.web[id] = { loading: true }; renderSheet();
  try { S.web[id] = { data: await api(`/api/research?id=${id}&cond=${encodeURIComponent(t.cond[0] || "")}`) }; } catch (e) { S.web[id] = { error: e.message }; }
  if (S.open === id) renderSheet();
}
const icsEsc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
function makeIcs(t, date) {
  const d = date.replace(/-/g, ""), end = new Date(date + "T00:00:00"); end.setDate(end.getDate() + 1);
  const e = end.toISOString().slice(0, 10).replace(/-/g, ""), c = t.contacts[0];
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TrialBridge//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", `UID:${t.id}-${d}@trialbridge`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${e}`, `SUMMARY:${icsEsc("Follow up on clinical trial " + t.id)}`,
    `DESCRIPTION:${icsEsc([t.title, c ? "Contact: " + [c.name, c.phone, c.email].filter(Boolean).join(", ") : "", link(t)].filter(Boolean).join("\n"))}`, `URL:${link(t)}`, "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Trial follow-up", "TRIGGER:PT9H", "END:VALARM", "END:VEVENT", "END:VCALENDAR"];
  return lines.join("\r\n");
}
async function shareTrial(id) {
  const t = S.byId[id], url = location.origin + "/#/trial/" + id, data = { title: t.title, text: `${t.title} (${t.id})`, url };
  if (navigator.share) { try { await navigator.share(data); return; } catch (e) { if (e.name === "AbortError") return; } }
  navigator.clipboard.writeText(url).then(() => toast("Link copied"), () => toast("Couldn’t copy the link"));
}

// ---------- Me tab ----------
const row = (ico, bg, title, sub, ctl) => `<div class="row"><span class="ico ${bg}">${ic(ico)}</span><div class="grow"><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</div>${ctl || ""}</div>`;
const radio = (name, v, label, on) => `<label><input type="radio" name="${name}" data-pref="${name}" value="${v}" ${on ? "checked" : ""}><span>${label}</span></label>`;
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone;
function renderMe() {
  const F = follows(), R = store.get("tb_recent", []);
  $("#v-me").innerHTML = `<div class="pagehead"><div><h1>Me</h1><p>Everything here stays on this device.</p></div></div>
  <p class="group-t">Your profile</p><div class="group glass">
  ${row("person", "bgc1", "Age", "Used for the fit check", `<input type="number" inputmode="numeric" min="0" max="120" data-p="age" value="${PROF.age ?? ""}" placeholder="—" aria-label="Your age">`)}
  ${row("users", "bgc2", "Sex", "For the fit check", `<div class="seg">${["", "Female", "Male"].map((v) => `<label><input type="radio" name="sex" data-p="sex" value="${v}" ${PROF.sex === v ? "checked" : ""}><span>${v || "Any"}</span></label>`).join("")}</div>`)}
  <div class="row stack"><div class="grow"><b>About me</b><small>Diagnosis, medicines, anything relevant. Sent to the AI only when you press Explain.</small></div><textarea data-p="notes" maxlength="600" placeholder="e.g. Type 2 diabetes for 6 years, on metformin">${esc(PROF.notes)}</textarea></div></div>
  <p class="group-t">Appearance</p><div class="group glass">
  ${row("sparkle", "bgc3", "Theme", "", `<div class="seg">${[["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) => radio("theme", v, l, PREF.theme === v)).join("")}</div>`)}
  ${row("type", "bgc1", "Text size", "", `<div class="seg">${[["m", "Default"], ["l", "Large"], ["xl", "Larger"]].map(([v, l]) => radio("text", v, l, PREF.text === v)).join("")}</div>`)}
  ${row("shield", "bgc5", "Reduce transparency", "Solid backgrounds instead of glass", `<label class="switch"><input type="checkbox" role="switch" data-pref="glass" ${PREF.glass === "off" ? "checked" : ""} aria-label="Reduce transparency"><i></i></label>`)}
  ${row("globe", "bgc4", "Explanation language", "For AI explanations", `<select data-pref="lang" aria-label="Explanation language">${LANGS.map((l) => `<option ${PREF.lang === l ? "selected" : ""}>${l}</option>`).join("")}</select>`)}</div>
  <p class="group-t">Followed searches</p>${F.length ? `<div class="group glass">${F.map((f) => row("bell", "bgc3", esc(sLabel(f)), S.fnew[f.id] ? `${plural(S.fnew[f.id], "new trial")} since you last looked` : "No new trials", `<button class="btn sm" data-act="runs" data-q="${esc(f.q)}" data-l="${esc(f.loc)}" data-s="${esc(f.st)}">Open</button><button class="iconbtn" data-act="unfollow" data-id="${f.id}" aria-label="Stop following">${ic("x")}</button>`)).join("")}</div>` : '<p class="group-f">Run a search and tap “Follow search” to be told when new trials appear.</p>'}
  ${R.length ? `<p class="group-t">Recent searches</p><div class="group glass">${row("clock", "bgc5", `${plural(R.length, "recent search")}`, esc(R.slice(0, 3).map(sLabel).join(" · ")), `<button class="btn sm" data-act="clearrecent">Clear</button>`)}</div>` : ""}
  ${!standalone() ? `<p class="group-t">Get the app</p><div class="group glass">${IOS ? row("share", "bgc1", "Add to Home Screen", "Tap Share in Safari, then “Add to Home Screen”", "") : S.installEvt ? row("download", "bgc1", "Install TrialBridge", "Opens full-screen like an app", `<button class="btn primary sm" data-act="install">Install</button>`) : row("download", "bgc1", "Install as an app", "Use your browser’s menu → Install app", "")}</div>` : ""}
  <p class="group-t">Your data</p><div class="group glass">
  ${row("download", "bgc4", "Export my data", "Profile, saved trials, notes, checklists (JSON)", `<button class="btn sm" data-act="export">Export</button>`)}
  ${row("trash", "bgc3", "Delete all my data", "Erases this device and the saved trials on our server", `<button class="btn sm danger" data-act="wipe">Delete</button>`)}</div>
  <p class="group-t">About</p><div class="group glass about"><div class="row stack"><p><b>TrialBridge ${esc(S.cfg.version || "")}</b> explains clinical trials. It does not give medical advice, recommend treatment or decide eligibility. Always confirm with the study team and your doctor.</p>
  <p>Trial records come from <a href="https://clinicaltrials.gov" target="_blank" rel="noopener">ClinicalTrials.gov</a> and may be out of date or incomplete. Plain-language wording and AI output can be wrong.</p>
  <p><b>Privacy.</b> There are no accounts and no ads or trackers. Saved trials and notes are tied to a random ID in this browser. Your profile stays on this device and is sent to the AI provider only when you press “Explain this trial”.</p>
  <p>In an emergency, call your local emergency number.</p></div></div>`;
}

// ---------- routing + events ----------
function setView(v) {
  S.view = v; ["find", "compare", "saved", "me"].forEach((k) => ($("#v-" + k).hidden = k !== v));
  $$("#nav a").forEach((a) => (a.dataset.v === v ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  if (v === "find") renderHome(); if (v === "compare") renderCompare(); if (v === "saved") renderSaved(); if (v === "me") { renderMe(); checkFollows(); }
  window.scrollTo(0, 0);
}
const route = async () => {
  const m = /^#\/trial\/(NCT\d{8})$/.exec(location.hash);
  if (m) { if (!route.booted || S.view !== "find") setView("find"); route.booted = true; if (!S.byId[m[1]]) { try { S.byId[m[1]] = (await api("/api/trial/" + m[1])).trial; } catch (e) { return toast(e.message); } } return openTrial(m[1]); }
  route.booted = true; if (S.open) closeSheet(); setView(({ "#/compare": "compare", "#/saved": "saved", "#/me": "me" })[location.hash] || "find");
};
function geoUi() { const g = $("#geo"); g.classList.toggle("on", !!S.geo); g.setAttribute("aria-pressed", !!S.geo); g.querySelector("span").textContent = S.geo ? "Near me" : "Near me"; $("#rad").hidden = !S.geo; }
async function exportData() {
  let saved = []; try { saved = (await api("/api/saved")).items; } catch {}
  download("trialbridge-data.json", JSON.stringify({ exportedAt: new Date().toISOString(), profile: PROF, saved: saved.map((i) => ({ id: i.trial.id, title: i.trial.title, note: i.note, savedAt: i.savedAt })), followedSearches: follows().map(({ q, loc, st }) => ({ q, loc, st })), selfChecks: store.get("tb_chk", {}), plans: store.get("tb_plan", {}) }, null, 2), "application/json");
}
async function wipeData() {
  if (!confirm("Delete your profile, saved trials, notes and checklists from this device and our server? This can’t be undone.")) return;
  try { await api("/api/saved", { method: "DELETE" }); } catch {}
  try { localStorage.clear(); } catch {} location.hash = "#/find"; location.reload();
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (b) {
    const id = b.dataset.id, a = b.dataset.act;
    if (a === "open") openTrial(id); else if (a === "close") closeSheet(); else if (a === "closesheet") closeSheet(); else if (a === "tab") { S.tab = b.dataset.tab; renderSheet(true); }
    else if (a === "cmp") toggleCmp(id); else if (a === "save") toggleSave(id); else if (a === "more") search(true);
    else if (a === "share") shareTrial(id); else if (a === "copysum") copySummary(); else if (a === "explain") runExplain(id); else if (a === "research") runResearch(id); else if (a === "print") window.print();
    else if (a === "clearcmp") { S.cmp = []; store.set("tb_cmp", []); updateCounts(); renderCompare(); }
    else if (a === "ack") { try { await api(`/api/saved/${id}/ack`, { method: "POST" }); toast("Marked as reviewed"); } catch (er) { toast(er.message); } renderSaved(); }
    else if (a === "phase") { const v = b.dataset.v; S.f.phases = S.f.phases.includes(v) ? S.f.phases.filter((x) => x !== v) : [...S.f.phases, v]; renderResults(); }
    else if (a === "follow") toggleFollow();
    else if (a === "unfollow") { store.set("tb_follow", follows().filter((f) => f.id !== id)); renderMe(); renderHome(); }
    else if (a === "runs") runSaved({ q: b.dataset.q, loc: b.dataset.l, st: b.dataset.s });
    else if (a === "clearrecent") { store.set("tb_recent", []); renderHome(); if (S.view === "me") renderMe(); }
    else if (a === "goto-me") location.hash = "#/me";
    else if (a === "chk") { setChk(S.open, b.dataset.k, b.dataset.v); tap(); renderSheet(); }
    else if (a === "todo") { const k = b.dataset.k; setPlan(S.open, (p) => { if (k.startsWith("c:")) { const c = p.custom.find((x) => x.id === k.slice(2)); if (c) c.done = b.checked; } else p.done[k] = b.checked; }); tap(); renderSheet(); }
    else if (a === "deltodo") { e.preventDefault(); setPlan(S.open, (p) => (p.custom = p.custom.filter((c) => c.id !== b.dataset.k))); renderSheet(); }
    else if (a === "addtodo") addTodo();
    else if (a === "copyq") { const qs = $$(".sbody ul.plain li").map((li) => "• " + li.textContent).join("\n"); navigator.clipboard.writeText(`Questions for the study team (${id})\n${qs}`).then(() => toast("Questions copied"), () => toast("Couldn’t copy")); }
    else if (a === "ics") { const d = $("#remind").value || addDays(3); setPlan(id, (p) => (p.remind = d)); download(`trialbridge-${id}.ics`, makeIcs(S.byId[id], d), "text/calendar"); toast("Reminder file ready"); }
    else if (a === "export") exportData(); else if (a === "wipe") wipeData();
    else if (a === "install" && S.installEvt) { S.installEvt.prompt(); S.installEvt = null; renderMe(); }
    return;
  }
  if (e.target.id === "scrim") closeSheet();
  if (e.target.closest("#geo")) {
    if (S.geo) { S.geo = null; geoUi(); return; }
    if (!navigator.geolocation) return toast("Location isn’t available in this browser.");
    navigator.geolocation.getCurrentPosition((p) => { S.geo = { lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3) }; geoUi(); search(); }, () => toast("Couldn’t get your location. Check the browser permission."), { timeout: 8000 }); return;
  }
  if (e.target.closest("#install") && S.installEvt) { S.installEvt.prompt(); S.installEvt = null; $("#install").hidden = true; return; }
  const cd = e.target.closest(".card[data-id]"); if (cd && !e.target.closest("button,a,textarea,label")) openTrial(cd.dataset.id);
});
function addTodo() { const i = $("#newtodo"), v = i.value.trim(); if (!v) return; setPlan(S.open, (p) => p.custom.push({ id: Date.now().toString(36), t: v.slice(0, 120), done: false })); renderSheet(); const n = $("#newtodo"); n && n.focus(); }
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && S.open) closeSheet();
  if (e.key === "Enter" && e.target.id === "newtodo") { e.preventDefault(); addTodo(); }
  if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !S.open) { e.preventDefault(); location.hash = "#/find"; $("#q").focus(); }
  if (e.key === "Tab" && S.open) { const f = $$("#sheet button,#sheet a[href],#sheet input,#sheet select,#sheet textarea").filter((x) => !x.disabled && x.offsetParent !== null); if (!f.length) return; const first = f[0], last = f[f.length - 1]; if (e.shiftKey && (document.activeElement === first || document.activeElement === $("#sheet"))) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
});
document.addEventListener("change", (e) => {
  const t = e.target, f = t.dataset && t.dataset.f;
  if (f) { if (f === "sort") S.f.sort = t.value; else if (f === "fit") S.f.fit = t.checked; renderResults(); const again = $(`[data-f="${f}"]`); again && again.focus({ preventScroll: true }); }
  if (t.id === "rad" && S.geo) search();
  const pr = t.dataset && t.dataset.pref;
  if (pr) { const v = t.type === "checkbox" ? (t.checked ? "off" : "on") : t.value; PREF[pr] = v; store.set("tb_" + pr, v); applyPrefs(); }
  const p = t.dataset && t.dataset.p;
  if (p) { PROF[p] = p === "age" ? (t.value === "" ? null : Math.max(0, Math.min(120, +t.value))) : t.value; saveProf(); renderHome(); renderResults(); }
  if (t.id === "remind" && S.open) setPlan(S.open, (pl) => (pl.remind = t.value));
});
document.addEventListener("focusout", async (e) => { const n = e.target.dataset && e.target.dataset.note; if (n) try { await api(`/api/saved/${n}/note`, { method: "PUT", body: JSON.stringify({ note: e.target.value }) }); } catch { toast("Couldn’t save the note"); } });
$("#f").addEventListener("submit", (e) => { e.preventDefault(); document.activeElement && document.activeElement.blur && document.activeElement.blur(); search(); });

// drag the grabber to dismiss the sheet (touch)
(() => {
  let y0 = null, dy = 0; const sh = $("#sheet");
  sh.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse" || !e.target.closest("[data-drag]") || e.target.closest("button,a")) return; y0 = e.clientY; dy = 0; sh.classList.add("drag"); sh.setPointerCapture(e.pointerId); });
  sh.addEventListener("pointermove", (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sh.style.transform = `translateY(${dy}px)`; });
  const end = () => { if (y0 == null) return; y0 = null; sh.classList.remove("drag"); sh.style.transform = ""; if (dy > 110) closeSheet(); };
  sh.addEventListener("pointerup", end); sh.addEventListener("pointercancel", end);
})();

// install prompt, offline banner, service worker
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); S.installEvt = e; $("#install").hidden = false; if (S.view === "me") renderMe(); });
window.addEventListener("appinstalled", () => { S.installEvt = null; $("#install").hidden = true; });
const netUi = () => ($("#offline").hidden = navigator.onLine);
addEventListener("online", netUi); addEventListener("offline", netUi); netUi();
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));

// ---------- boot ----------
applyPrefs(); geoUi(); window.addEventListener("hashchange", route);
(async () => {
  route(); renderResults(); updateCounts();
  try { S.cfg = await api("/api/config"); } catch {}
  try { (await api("/api/saved")).items.forEach((i) => { S.saved[i.trial.id] = true; S.byId[i.trial.id] = i.trial; }); updateCounts(); if (S.view === "find") renderResults(); } catch {}
  checkFollows();
})();
