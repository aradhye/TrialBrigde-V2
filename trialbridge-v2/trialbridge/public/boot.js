// Runs before first paint: applies saved appearance preferences so there is no flash.
(function () {
  var g = function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  var th = g("tb_theme", "auto"), d = document.documentElement;
  if (th === "auto") th = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  d.dataset.theme = th;
  d.dataset.text = g("tb_text", "m");
  d.dataset.glass = g("tb_glass", "on");
})();
