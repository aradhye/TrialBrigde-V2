// ClinicalTrials.gov API v2: search, single record, normalisation, change detection.
import crypto from "node:crypto";
const BASE = process.env.CTG_BASE || "https://clinicaltrials.gov/api/v2/studies";
const cache = new Map();
async function memo(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && hit.t > Date.now()) return hit.v;
  const v = await fn();
  cache.set(key, { v, t: Date.now() + ttl });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return v;
}
async function getJson(url) {
  let last;
  for (let i = 0; i < 2; i++) {
    let r;
    try { r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { accept: "application/json" } }); }
    catch (e) { last = e; await new Promise((ok) => setTimeout(ok, 600)); continue; }
    if (r.ok) return r.json();
    last = new Error(`ClinicalTrials.gov returned ${r.status}`);
    if (r.status < 500 && r.status !== 429) throw last;
    await new Promise((ok) => setTimeout(ok, 600));
  }
  throw last;
}
const num = (s) => { const m = /(\d+)/.exec(s || ""); return m ? +m[1] : null; };
const coord = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
const nice = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ") : "Unknown");
const PHASE = { EARLY_PHASE1: "Early phase 1", PHASE1: "Phase 1", PHASE2: "Phase 2", PHASE3: "Phase 3", PHASE4: "Phase 4", NA: "Not applicable" };
export function bullets(t, max = 14) {
  return (t || "").split(/\n/).map((x) => x.replace(/^[\s*\-•\d.)]+/, "").trim())
    .filter((x) => x.length > 6 && !/^(key )?(inclusion|exclusion) criteria:?$/i.test(x)).slice(0, max);
}
export function normalize(s) {
  const p = s.protocolSection || {}, id = p.identificationModule || {}, st = p.statusModule || {},
    el = p.eligibilityModule || {}, lc = p.contactsLocationsModule || {}, ds = p.designModule || {};
  const txt = el.eligibilityCriteria || "", ix = txt.search(/exclusion criteria/i);
  return {
    id: id.nctId, title: id.briefTitle || id.officialTitle || "Untitled study",
    summary: ((p.descriptionModule || {}).briefSummary || "").trim(),
    cond: (p.conditionsModule || {}).conditions || [],
    status: nice(st.overallStatus), updated: (st.lastUpdatePostDateStruct || {}).date || "",
    start: (st.startDateStruct || {}).date || "",
    phase: (ds.phases || []).map((x) => PHASE[x] || x).join(" / "), type: nice(ds.studyType || ""),
    enrollment: (ds.enrollmentInfo || {}).count ?? null,
    sponsor: (((p.sponsorCollaboratorsModule || {}).leadSponsor) || {}).name || "",
    interventions: ((p.armsInterventionsModule || {}).interventions || []).map((i) => i.name).slice(0, 5),
    sites: (lc.locations || []).slice(0, 60).map((l) => ({ facility: l.facility || "", city: l.city || "", state: l.state || "", country: l.country || "", status: l.status ? nice(l.status) : "", lat: coord(l.geoPoint && l.geoPoint.lat), lon: coord(l.geoPoint && l.geoPoint.lon) })),
    siteTotal: (lc.locations || []).length,
    contacts: (lc.centralContacts || []).slice(0, 3).map((c) => ({ name: c.name || "", role: nice(c.role || ""), phone: c.phone || "", email: c.email || "" })),
    officials: (lc.overallOfficials || []).slice(0, 3).map((o) => ({ name: o.name || "", role: nice(o.role || ""), affiliation: o.affiliation || "" })),
    min: num(el.minimumAge), max: num(el.maximumAge),
    sex: { FEMALE: "Female", MALE: "Male" }[el.sex] || "All",
    healthy: el.healthyVolunteers === true ? "Yes" : el.healthyVolunteers === false ? "No" : "",
    criteriaText: txt.slice(0, 8000),
    inc: bullets(ix > -1 ? txt.slice(0, ix) : txt), exc: ix > -1 ? bullets(txt.slice(ix)) : [],
  };
}
export function search({ q = "", loc = "", status = "", page = "", geo = "", sort = "" }) {
  const u = new URL(BASE);
  if (q) u.searchParams.set("query.cond", q);
  if (loc) u.searchParams.set("query.locn", loc);
  const g = /^(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?),(\d{1,4})$/.exec(geo);
  if (g) u.searchParams.set("filter.geo", `distance(${g[1]},${g[2]},${Math.max(1, Math.round(+g[3] * 0.621))}mi)`);
  u.searchParams.set("filter.overallStatus", status === "Not yet recruiting" ? "NOT_YET_RECRUITING" : status === "Recruiting" ? "RECRUITING" : "RECRUITING,NOT_YET_RECRUITING");
  u.searchParams.set("pageSize", "20"); u.searchParams.set("countTotal", "true");
  if (sort === "new") u.searchParams.set("sort", "StudyFirstPostDate:desc");
  if (page) u.searchParams.set("pageToken", page);
  return memo("s:" + u.search, 10 * 60e3, async () => {
    const j = await getJson(u);
    return { trials: (j.studies || []).map(normalize), next: j.nextPageToken || null, total: j.totalCount ?? null };
  });
}
export async function one(nct, { fresh = false } = {}) {
  const run = async () => normalize(await getJson(`${BASE}/${encodeURIComponent(nct)}`));
  return fresh ? run() : memo("o:" + nct, 5 * 60e3, run);
}
// ---- change detection ----
const hash = (t) => crypto.createHash("md5").update(t.criteriaText || "").digest("hex");
const siteKey = (s) => [s.facility, s.city, s.country].join("|");
export const snap = (t) => ({ status: t.status, updated: t.updated, min: t.min, max: t.max, sex: t.sex, sites: t.sites.map(siteKey), siteTotal: t.siteTotal, crit: hash(t) });
export function diff(a, t) {
  const b = snap(t), out = [];
  if (a.status !== b.status) out.push(`Recruitment status changed from “${a.status}” to “${b.status}”.`);
  const added = b.sites.filter((s) => !a.sites.includes(s)), gone = a.sites.filter((s) => !b.sites.includes(s));
  const show = (k) => k.split("|").filter(Boolean).join(", ");
  if (added.length) out.push(`${added.length} site${added.length > 1 ? "s" : ""} added, for example ${show(added[0])}.`);
  if (gone.length) out.push(`${gone.length} site${gone.length > 1 ? "s" : ""} removed, for example ${show(gone[0])}.`);
  if (a.min !== b.min || a.max !== b.max || a.sex !== b.sex) out.push("Age or sex requirements changed.");
  if (a.crit !== b.crit) out.push("The eligibility criteria text was edited.");
  if (!out.length && a.updated !== b.updated) out.push(`The record was updated on ${b.updated}; none of the tracked fields changed.`);
  return out;
}
