// TinyFish Search + Fetch: finds public pages beyond the registry and extracts useful facts.
export const enabled = () => !!process.env.TINYFISH_API_KEY;
export async function research({ id, cond }) {
  const key = process.env.TINYFISH_API_KEY;
  if (!key) { const e = new Error("Web research isn’t configured. Add TINYFISH_API_KEY to .env and restart."); e.status = 503; throw e; }
  const query = `${id} ${cond || ""} clinical trial -site:clinicaltrials.gov`.trim();
  const sr = await fetch("https://api.search.tinyfish.ai?" + new URLSearchParams({ query }), { headers: { "X-API-Key": key }, signal: AbortSignal.timeout(20000) });
  if (!sr.ok) throw new Error(`TinyFish Search returned ${sr.status}`);
  const results = ((await sr.json()).results || []).filter((r) => /^https?:\/\//i.test(r.url || "")).slice(0, 5)
    .map((r) => ({ title: r.title || r.url, url: r.url, snippet: r.snippet || r.description || "" }));
  const extracted = { ids: [], contacts: [], status: [] };
  if (results.length) {
    const fr = await fetch("https://api.fetch.tinyfish.ai", {
      method: "POST", headers: { "X-API-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ urls: results.slice(0, 3).map((r) => r.url), format: "markdown" }), signal: AbortSignal.timeout(45000),
    });
    if (fr.ok) {
      const text = ((await fr.json()).results || []).map((p) => p.text || "").join("\n").slice(0, 200000);
      extracted.ids = [...new Set(text.match(/NCT\d{8}/g) || [])].slice(0, 6);
      const emails = [...new Set(text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [])].slice(0, 3);
      const phones = [...new Set((text.match(/\+?\d[\d\s().-]{8,16}\d/g) || []).filter((x) => x.replace(/\D/g, "").length >= 9))].slice(0, 2);
      const pi = (text.match(/principal investigator[:\s-]+[^\n]{5,80}/gi) || []).slice(0, 2).map((x) => x.trim());
      extracted.contacts = [...pi, ...emails, ...phones];
      extracted.status = text.split("\n").filter((l) => /(now recruiting|currently recruiting|enrol(l)?ment (is )?(open|closed)|no longer recruiting)/i.test(l))
        .map((l) => l.replace(/[#*_>\[\]]/g, "").trim().slice(0, 160)).slice(0, 3);
    }
  }
  return { results, extracted };
}
