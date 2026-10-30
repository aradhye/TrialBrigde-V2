import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import os from "node:os"; import path from "node:path";

const PORT = 34000 + Math.floor(Math.random() * 1000), U = `http://localhost:${PORT}`; let child;
before(async () => {
  child = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT, TB_DATA_FILE: path.join(os.tmpdir(), `tb-${PORT}.json`), ANTHROPIC_API_KEY: "", TINYFISH_API_KEY: "" }, stdio: "ignore" });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(U + "/healthz")).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  throw new Error("server did not start");
});
after(() => child && child.kill());

test("health check and config", async () => {
  assert.equal((await (await fetch(U + "/healthz")).json()).ok, true);
  const c = await (await fetch(U + "/api/config")).json(); assert.equal(c.ai, false); assert.ok(c.version);
});
test("serves the app with security headers and the PWA files", async () => {
  const r = await fetch(U + "/"); assert.equal(r.status, 200);
  assert.match(r.headers.get("content-security-policy"), /default-src 'self'/); assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.match(await r.text(), /TrialBridge/);
  assert.match((await fetch(U + "/manifest.webmanifest")).headers.get("content-type"), /manifest\+json/);
  assert.equal((await fetch(U + "/icons/icon-512.png")).headers.get("content-type"), "image/png");
  assert.equal((await fetch(U + "/sw.js")).status, 200);
});
test("gzip and ETag revalidation", async () => {
  const r = await fetch(U + "/app.js", { headers: { "accept-encoding": "gzip" } }); assert.equal(r.status, 200);
  const r2 = await fetch(U + "/app.js", { headers: { "if-none-match": r.headers.get("etag") } }); assert.equal(r2.status, 304);
});
test("blocks path traversal, bad ids and bad methods", async () => {
  assert.equal((await fetch(U + "/..%2fserver.js")).status, 404);
  assert.equal((await fetch(U + "/%E0%A4%A")).status, 400);
  assert.equal((await fetch(U + "/api/trial/NOTANID")).status, 404);
  assert.equal((await fetch(U + "/api/research?id=bad")).status, 400);
  assert.equal((await fetch(U + "/", { method: "POST" })).status, 405);
  assert.equal((await fetch(U + "/api/trials")).status, 400);
});
test("explain is unavailable without a key; saved list starts empty and can be wiped", async () => {
  assert.equal((await fetch(U + "/api/explain", { method: "POST", body: "{}" })).status, 503);
  const h = { "x-client": "testclient123" };
  assert.deepEqual((await (await fetch(U + "/api/saved", { headers: h })).json()).items, []);
  assert.equal((await fetch(U + "/api/saved", { method: "DELETE", headers: h })).status, 200);
});
