// Puntos plásticos (estado de servicio SRF = 1 y de FALLA SRF = FS) y pestaña «Analítico vs FEM» en todos los ejemplos y etapas.
//   node tests/check_plasticos.mjs [url] [outdir]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire((process.env.USERPROFILE ?? "") + "/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const base = process.argv[2] || "http://localhost:4719/", out = process.argv[3] || "tests/shots/plas"; mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--no-sandbox"], protocolTimeout: 900000 });
const p = await b.newPage(); await p.setViewport({ width: 1600, height: 1000 });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0; const ok = (c, t) => { console.log((c ? "  ✓ " : "  ✗ ") + t); if (!c) bad++; };
const listo = () => p.waitForFunction(() => /TOTAL |navegador:/.test(document.getElementById("log").textContent) && !document.getElementById("fs").textContent.includes("calculando"), { timeout: 400000 });
const etapa = async (i) => { await p.$eval("#stage", (e, i) => { e.value = String(i); e.dispatchEvent(new Event("change")); }, i); await wait(300); };
const estado = async (v) => { await p.$eval("#estadoRes", (e, v) => { e.value = v; e.dispatchEvent(new Event("change")); }, v); await wait(300); };
const titulo = () => p.evaluate(() => window.__lastRange);
for (const [nom, q, n] of [["demo04", "", 3], ["corte", "?tipo=corte", 1], ["excavacion_muro", "?tipo=excavacion_muro", 4]]) {
  await p.goto(base + (q || "?") + "&v=" + Date.now(), { waitUntil: "networkidle0" }); await listo(); await wait(1500);
  if (nom === "excavacion_muro") await p.waitForFunction(() => /^1\.\d{3}$/.test(document.getElementById("tipoSrm")?.textContent.trim() ?? ""), { timeout: 400000 });
  await p.evaluate(() => window.__ui.pestana("plas")); await wait(400);
  for (let i = 0; i < n; i++) {
    await etapa(i);
    for (const est of ["falla", "servicio"]) {
      await estado(est); const r = await titulo(), plano = !(r.vmax - r.vmin > 1e-9);
      const h = await p.$eval("#hover", (e) => e.textContent);
      ok(!plano || !!r.planoNota, `${nom} etapa ${i + 1} ${est}: E_d,pl ${plano ? "uniforme: " + (r.planoNota ?? "SIN explicación").slice(0, 70) : `${r.vmin.toFixed(3)} … ${r.vmax.toFixed(3)} %`}`);
      if (est === "falla" && i === n - 1) await p.screenshot({ path: `${out}/${nom}_e${i + 1}_falla.png` });
      if (nom === "demo04" && i === 0) await p.screenshot({ path: `${out}/${nom}_e1_${est}.png` });
    }
  }
  const np = await p.evaluate(() => document.querySelector("#plot") && window.__lastRange);
  void np;
  await p.evaluate(() => window.__ui.pestana("ana")); await wait(2500);
  const ana = await p.$eval("#analitico", (e) => e.textContent);
  ok(/Bishop/.test(ana) || /Estado inicial/.test(ana), `${nom}: pestaña Analítico con contenido (${ana.length} caracteres)`);
  if (nom === "excavacion_muro") ok(/vuelco/.test(ana) && /deslizamiento/.test(ana) && /Bishop/.test(ana), "excavación + muro: verificación del muro y equilibrio límite");
  await p.screenshot({ path: `${out}/${nom}_analitico.png`, fullPage: true });
}
ok(errs.length === 0, "sin errores de página " + errs.join(" | "));
await b.close(); console.log(bad ? `\n✗ ${bad} fallaron` : "\n✓ puntos plásticos y analítico: todo bien"); process.exit(bad ? 1 : 0);
