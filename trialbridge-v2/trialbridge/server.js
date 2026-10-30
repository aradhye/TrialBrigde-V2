// TrialBridge server: zero dependencies, Node 18+.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
try {
  for (const l of fs.readFileSync(path.join(__dir, ".env"), "utf8").split("\n")) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(l);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}
const ctg = await import("./lib/ctg.js"), tf = await import("./lib/tinyfish.js"), ai = await import("./lib/ai.js"), { readDb, writeDb } = await import("./lib/store.js");
const PORT = process.env.PORT || 3000, PUB = path.join(__dir, "public"), VERSION = JSON.parse(fs.readFileSync(path.join(__dir, "package.json"), "utf8")).version;

// ---------- small helpers ----------
const buckets = new Map();
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k); }, 60000).unref();
function limited(ip, kind, max) {
  const k = ip + kind, now = Date.now(), b = buckets.get(k);
  if (!b || b.reset < now) { buckets.set(k, { n: 1, reset: now + 60000 }); return false; }
  return ++b.n > max;
}
const fail = (status, msg) => Object.assign(new Error(msg), { status });
const wantsGzip = (req) => /\bgzip\b/.test(req.headers["accept-encoding"] || "");
function send(res, code, obj, req) {
  const raw = Buffer.from(JSON.stringify(obj)), head = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", Vary: "Accept-Encoding" };
  if (req && raw.length > 1024 && wantsGzip(req)) { head["Content-Encoding"] = "gzip"; res.writeHead(code, head); return res.end(zlib.gzipSync(raw)); }
  res.writeHead(code, head); res.end(raw);
}
const body = (req) => new Promise((ok) => {
  let d = "";
  req.on("data", (c) => { d += c; if (d.length > 1e5) req.destroy(); });
  req.on("end", () => { try { ok(JSON.parse(d || "{}")); } catch { ok({}); } });
});
const NCT = /^NCT\d{8}$/;

// ---------- API ----------
async function api(req, res, url) {
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().split(",")[0].trim();
  const cid = /^[a-z0-9]{8,64}$/.test(req.headers["x-client"] || "") ? req.headers["x-client"] : "anon";
  const p = url.pathname, q = url.searchParams, out = (code, obj) => send(res, code, obj, req);
  if (limited(ip, "all", 120)) throw fail(429, "Too many requests. Please wait a minute.");
  if (p === "/api/config") return out(200, { ai: ai.enabled(), research: tf.enabled(), version: VERSION });
  if (p === "/api/trials") {
    if (!(q.get("q") || q.get("loc") || q.get("geo"))) throw fail(400, "Enter a condition or a location.");
    return out(200, await ctg.search({ q: (q.get("q") || "").slice(0, 120), loc: (q.get("loc") || "").slice(0, 80), status: q.get("status") || "", page: (q.get("page") || "").slice(0, 400), geo: (q.get("geo") || "").slice(0, 40), sort: q.get("sort") === "new" ? "new" : "" }));
  }
  const tm = /^\/api\/trial\/(NCT\d{8})$/.exec(p);
  if (tm) return out(200, { trial: await ctg.one(tm[1]) });
  if (p === "/api/research") {
    if (!NCT.test(q.get("id") || "")) throw fail(400, "Invalid trial id.");
    if (limited(ip, "slow", 10)) throw fail(429, "Research limit reached for now. Try again in a minute.");
    return out(200, await tf.research({ id: q.get("id"), cond: (q.get("cond") || "").slice(0, 100) }));
  }
  if (p === "/api/explain" && req.method === "POST") {
    if (!ai.enabled()) throw fail(503, "AI explanations are off. Add ANTHROPIC_API_KEY to .env and restart.");
    const b = await body(req); if (!NCT.test(b.id || "")) throw fail(400, "Invalid trial id.");
    if (limited(ip, "slow", 10)) throw fail(429, "Explanation limit reached for now. Try again in a minute.");
    return out(200, await ai.explain(await ctg.one(b.id), b.profile, b.language));
  }
  const m = /^\/api\/saved(?:\/(NCT\d{8}))?(?:\/(ack|note))?$/.exec(p);
  if (m) {
    const db = readDb(), mine = (db[cid] ||= {}), id = m[1], sub = m[2];
    if (req.method === "GET" && !id) {
      const items = Object.values(mine);
      if (q.get("check") !== "1") return out(200, { items: items.map((i) => ({ trial: i.trial, note: i.note || "", savedAt: i.savedAt })) });
      return out(200, { checkedAt: new Date().toISOString(), items: await Promise.all(items.map(async (i) => {
        try { const cur = await ctg.one(i.trial.id, { fresh: true }); return { trial: cur, note: i.note || "", savedAt: i.savedAt, changes: ctg.diff(i.snapshot, cur) }; }
        catch (e) { return { trial: i.trial, note: i.note || "", savedAt: i.savedAt, changes: [], error: e.message }; } })) });
    }
    if (req.method === "POST" && !id) {
      const b = await body(req); if (!NCT.test(b.id || "")) throw fail(400, "Invalid trial id.");
      if (Object.keys(mine).length >= 50) throw fail(400, "You can save up to 50 trials.");
      const t = await ctg.one(b.id, { fresh: true }); mine[t.id] = { trial: t, snapshot: ctg.snap(t), savedAt: new Date().toISOString(), note: "" }; writeDb(db);
      return out(200, { ok: true });
    }
    if (req.method === "DELETE" && !id) { delete db[cid]; writeDb(db); return out(200, { ok: true }); } // erase everything stored for this browser
    if (req.method === "DELETE" && id) { delete mine[id]; writeDb(db); return out(200, { ok: true }); }
    if (req.method === "POST" && id && sub === "ack") {
      if (!mine[id]) throw fail(404, "Not saved.");
      const cur = await ctg.one(id, { fresh: true }); mine[id] = { ...mine[id], trial: cur, snapshot: ctg.snap(cur) }; writeDb(db); return out(200, { ok: true });
    }
    if (req.method === "PUT" && id && sub === "note") {
      if (!mine[id]) throw fail(404, "Not saved."); mine[id].note = String((await body(req)).note || "").slice(0, 1000); writeDb(db); return out(200, { ok: true });
    }
  }
  throw fail(404, "Not found");
}

// ---------- static files ----------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8", ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8" };
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".svg", ".json", ".webmanifest", ".txt", ".xml"]);
const SEC = {
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains", "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "geolocation=(self), camera=(), microphone=(), payment=()",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};
const pageCache = new Map(); // gzip cache keyed by path+mtime
function serve(req, res, url) {
  let dec; try { dec = decodeURIComponent(url.pathname); } catch { throw fail(400, "Bad request"); }
  const rel = url.pathname === "/" ? "index.html" : path.normalize(dec).replace(/^([/\\]|\.\.[/\\])+/, "");
  const f = path.join(PUB, rel);
  if (!f.startsWith(PUB + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Not found");
  }
  const ext = path.extname(f), st = fs.statSync(f), etag = `W/"${st.size.toString(16)}-${Math.round(st.mtimeMs).toString(16)}"`;
  const head = { "Content-Type": MIME[ext] || "application/octet-stream", ETag: etag, Vary: "Accept-Encoding",
    "Cache-Control": rel.startsWith("icons") ? "public, max-age=604800" : "no-cache" };
  if (req.headers["if-none-match"] === etag) { res.writeHead(304, head); return res.end(); }
  if (COMPRESSIBLE.has(ext) && wantsGzip(req)) {
    let z = pageCache.get(f); if (!z || z.etag !== etag) { z = { etag, buf: zlib.gzipSync(fs.readFileSync(f)) }; pageCache.set(f, z); }
    head["Content-Encoding"] = "gzip"; res.writeHead(200, head); return res.end(z.buf);
  }
  res.writeHead(200, head); fs.createReadStream(f).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  for (const [k, v] of Object.entries(SEC)) res.setHeader(k, v);
  try {
    if (url.pathname === "/healthz") return send(res, 200, { ok: true, version: VERSION, uptime: Math.round(process.uptime()) });
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
    serve(req, res, url);
  } catch (e) { if (!res.headersSent) send(res, e.status || 502, { error: e.message || "Something went wrong." }); }
});
server.listen(PORT, () => console.log(`TrialBridge ${VERSION} running at http://localhost:${PORT}  (web research: ${tf.enabled() ? "on" : "off"}, AI: ${ai.enabled() ? "on" : "off"})`));
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => server.close(() => process.exit(0)));
