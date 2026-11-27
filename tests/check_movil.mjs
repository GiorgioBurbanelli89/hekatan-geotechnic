// Celular (412×915 y 915×412): sin scroll horizontal; panel Datos entero en pantalla, debajo de la barra de menús, con scroll propio.
//   node tests/check_movil.mjs [url] [outdir]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire((process.env.USERPROFILE ?? "") + "/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const base = process.argv[2] || "http://localhost:4719/", out = process.argv[3] || "tests/shots/movil"; mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--no-sandbox"], protocolTimeout: 600000 });
let bad = 0; const ok = (c, t) => { console.log((c ? "  ✓ " : "  ✗ ") + t); if (!c) bad++; };
for (const [w, h] of [[412, 915], [915, 412]]) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await p.goto(base + "?tipo=excavacion_muro&v=" + Date.now(), { waitUntil: "networkidle0" });
  await p.waitForFunction(() => document.getElementById("tipoSrm") && /^1\.\d{3}$/.test(document.getElementById("tipoSrm").textContent.trim()), { timeout: 300000 });
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  ok(sw <= w, `${w}×${h}: ancho de la página ${sw} px (pantalla ${w})`);
  await p.screenshot({ path: `${out}/${w}x${h}_modelo.png` });
  await p.evaluate(() => window.__ui.alternarDatos(true)); await new Promise((r) => setTimeout(r, 400));
  const g = await p.evaluate(() => { const d = document.getElementById("datos").getBoundingClientRect(), m = document.getElementById("menubar").getBoundingClientRect(), el = document.getElementById("datos"); return { top: d.top, bottom: d.bottom, alto: d.height, mb: m.bottom, scroll: el.scrollHeight > el.clientHeight, sw: document.documentElement.scrollWidth }; });
  ok(g.top >= g.mb - 1 && g.bottom <= h + 1, `${w}×${h}: panel Datos de ${g.top.toFixed(0)} a ${g.bottom.toFixed(0)} (menú hasta ${g.mb.toFixed(0)}, pantalla ${h}), alto ${g.alto.toFixed(0)}, scroll interno ${g.scroll}`);
  ok(g.sw <= w, `${w}×${h}: con Datos abierto, ancho ${g.sw}`);
  await p.screenshot({ path: `${out}/${w}x${h}_datos.png` });
  await p.close();
}
await b.close(); console.log(bad ? `\n✗ ${bad} fallaron` : "\n✓ celular bien"); process.exit(bad ? 1 : 0);
