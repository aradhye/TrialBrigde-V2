"use strict";
// Small dependency-free chart helpers. They return HTML/SVG strings styled by app.css.
const cesc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function donut(items, label) {
  const total = items.reduce((a, i) => a + i.value, 0); if (!total) return "";
  const r = 42, c = 2 * Math.PI * r; let off = 0;
  const segs = items.map((i) => { const len = (c * i.value) / total, s = `<circle r="${r}" cx="60" cy="60" fill="none" stroke="${i.color}" stroke-width="15" stroke-linecap="butt" stroke-dasharray="${Math.max(0, len - 1.5)} ${c - Math.max(0, len - 1.5)}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"/>`; off += len; return s; }).join("");
  return `<div class="donut"><svg viewBox="0 0 120 120" width="108" height="108" role="img" aria-label="${cesc(label)}: ${items.map((i) => i.value + " " + i.label).join(", ")}"><circle r="${r}" cx="60" cy="60" fill="none" stroke="var(--track)" stroke-width="15"/>${segs}<text x="60" y="67" text-anchor="middle" font-size="24" font-weight="800" fill="currentColor">${total}</text></svg><ul class="legend">${items.map((i) => `<li><i style="background:${i.color}"></i>${cesc(i.label)} <b>${i.value}</b></li>`).join("")}</ul></div>`;
}
function bars(items) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return `<div class="bars">${items.map((i) => `<div class="brow"><span title="${cesc(i.label)}">${cesc(i.label)}</span><div class="track"><i style="width:${Math.max(6, (i.value / max) * 100)}%;background:${i.color || "var(--c1)"}"></i></div><b>${i.value}</b></div>`).join("")}</div>`;
}
function columns(items, hi, label) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return `<div class="cols" role="img" aria-label="${cesc(label)}">${items.map((i, k) => `<div class="col${k === hi ? " hi" : ""}" title="${cesc(i.label)}: ${i.value}"><i style="height:${Math.max(4, (i.value / max) * 100)}%"></i><small>${cesc(i.label)}</small></div>`).join("")}</div>`;
}
function ageBar(min, max, age, compact) {
  const lo = Math.min(min ?? 0, 100), hi = Math.min(max ?? 100, 100), you = age != null && age >= 0 ? Math.min(age, 100) : null;
  const inside = you != null && you >= (min ?? 0) && you <= (max ?? 200);
  return `<div class="agebar${compact ? " c" : ""}" role="img" aria-label="Accepts ages ${min ?? 0} to ${max ?? "no upper limit"}${you != null ? `. You are ${age}, ${inside ? "inside" : "outside"} the range` : ""}"><div class="track"><i style="left:${lo}%;width:${Math.max(2, hi - lo)}%"></i>${you != null ? `<b class="you ${inside ? "in" : "out"}" style="left:${you}%"></b>` : ""}</div>${compact ? "" : '<div class="ax"><span>0</span><span>25</span><span>50</span><span>75</span><span>100+</span></div>'}</div>`;
}
// Circular progress ring (0–100) with a centre label.
function ring(pct, color, label, size = 64) {
  const r = 26, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct));
  return `<svg class="ring" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${cesc(label)}"><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--track)" stroke-width="7"/><circle cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(c * p) / 100} ${c}" transform="rotate(-90 32 32)"/><text x="32" y="37" text-anchor="middle" font-size="15">${Math.round(p)}%</text></svg>`;
}
