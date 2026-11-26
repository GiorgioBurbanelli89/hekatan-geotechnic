// Sliders de la zapata: mueve B, φ y My (y uno arrastrado con el mouse), comprueba que los resultados cambian y que al
// volver al valor original se recuperan EXACTOS.   node tests/shot_zapata_sliders.mjs [url] [outdir]
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire((process.env.USERPROFILE ?? "") + "/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const base = process.argv[2] || "http://localhost:4700/";
const out = process.argv[3] || "tests/shots/zapata_sliders";
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"], executablePath: process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1250 });
const consola = [];
page.on("console", (m) => consola.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => consola.push(`[pageerror] ${e.message}`));
await page.goto(base + "?ejemplo=zapata_guerra", { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.__zapata, { timeout: 30000 });
const espera = () => new Promise((r) => setTimeout(r, 150));
const lee = () => page.evaluate(() => { const { r } = window.__zapata; return { smax: r.sigMax, smin: r.sigMin, ex: r.ex, Rd: r.Rd, FS: r.FS, sigEf: r.sigEf, s: r.asiento?.s, zInf: r.asiento?.zInf }; });
// Tweakpane: arrastre REAL de la perilla sobre la pista (fracción 0..1) y número escrito en su caja + Enter
const fila = (k) => `#zapCampos [data-k=${k}]`;
const arrastra = async (k, fr) => {
  const t = await page.$(fila(k) + " .tp-sldv_t"); await t.evaluate((e) => e.scrollIntoView({ block: "center" })); await espera();
  const bb = await t.boundingBox(), y = bb.y + bb.height / 2;
  await page.mouse.move(bb.x + bb.width * 0.5, y); await page.mouse.down(); await page.mouse.move(bb.x + bb.width * fr, y, { steps: 10 }); await page.mouse.up(); await espera();
};
const escribe = async (k, v) => {
  const i = await page.$(fila(k) + " input"); await i.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await i.click({ clickCount: 3 }); await page.keyboard.type(String(v)); await page.keyboard.press("Enter"); await espera();
};
const dato = (k) => page.evaluate((k) => window.__zapata.datos[k], k);
const base0 = await lee(); const res = { base: base0, pasos: [] };
await page.screenshot({ path: `${out}/00_base.png`, fullPage: true });
await (await page.$("#zapCampos")).screenshot({ path: `${out}/00_panel.png` });
let n = 0;
for (const [k, fr, v0] of [["B", 0.7, 3.45], ["phi", 0.8, 22.2], ["My", 0.7, 17]]) {
  await arrastra(k, fr); const v = await dato(k), r1 = await lee(); await page.screenshot({ path: `${out}/${String(++n).padStart(2, "0")}_${k}.png`, fullPage: true });
  await escribe(k, v0); const r2 = await lee();
  res.pasos.push({ k, arrastrado_a: v, cambiado: r1, vuelta: await dato(k), vuelta_exacta: JSON.stringify(r2) === JSON.stringify(base0), caja: await page.$eval(fila(k) + " input", (e) => e.value) });
}
// número fuera de rango escrito a mano: el slider se amplía (no recorta)
await escribe("N", 1500); res.fuera_rango = { N: await dato("N"), caja: await page.$eval(fila("N") + " input", (e) => e.value) }; await escribe("N", 121);
res.N_vuelta_exacta = JSON.stringify(await lee()) === JSON.stringify(base0);
// sin freático (checkbox de Tweakpane)
const cb = async () => { const c = await page.$("#zapCampos .tp-ckbv_w"); await c.evaluate((e) => e.scrollIntoView({ block: "center" })); await c.click(); await espera(); };
await cb(); res.zw_con = await dato("zw"); await cb(); res.zw_sin = String(await dato("zw"));
// t → kN → t: el pane se reconstruye
await page.select("#zapUni", "kN"); await espera(); res.kN = { N: await dato("N"), caja: await page.$eval(fila("N") + " input", (e) => e.value), smax: (await lee()).smax };
await (await page.$("#zapCampos")).screenshot({ path: `${out}/05_panel_kN.png` });
await page.select("#zapUni", "t"); await espera(); res.t_otra_vez = await lee();
res.version = await page.$eval("#ver", (e) => e.textContent);
writeFileSync(`${out}/resultados.json`, JSON.stringify(res, null, 1));
writeFileSync(`${out}/consola.txt`, consola.join("\n"));
console.log(JSON.stringify(res, null, 1)); console.log("consola:", consola.filter((c) => /error/i.test(c)).join("\n") || "sin errores");
await browser.close();
