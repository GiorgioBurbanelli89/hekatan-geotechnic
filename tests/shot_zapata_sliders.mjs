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
const mueve = async (k, v) => { await page.$eval(`#zapCampos input.zr[data-k=${k}]`, (e, v) => { e.value = String(v); e.dispatchEvent(new Event("input", { bubbles: true })); }, v); await espera(); };
const base0 = await lee(); const res = { base: base0, pasos: [] };
await page.screenshot({ path: `${out}/00_base.png`, fullPage: true });
let n = 0;
for (const [k, v, v0] of [["B", 4.2, 3.45], ["phi", 30, 22.2], ["My", 60, 17]]) {
  await mueve(k, v); const r1 = await lee(); await page.screenshot({ path: `${out}/${String(++n).padStart(2, "0")}_${k}_${v}.png`, fullPage: true });
  await mueve(k, v0); const r2 = await lee();
  res.pasos.push({ k, v, cambiado: r1, vuelta_exacta: JSON.stringify(r2) === JSON.stringify(base0), num: await page.$eval(`#zapCampos input.zn[data-k=${k}]`, (e) => e.value) });
}
// arrastre real con el mouse sobre el slider de N
const sl = await page.$("#zapCampos input.zr[data-k=N]"); await sl.evaluate((e) => e.scrollIntoView({ block: "center" })); await espera(); const bb = await sl.boundingBox();
await page.mouse.move(bb.x + bb.width * 0.12, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + bb.width * 0.3, bb.y + bb.height / 2, { steps: 8 }); await page.mouse.up(); await espera();
res.arrastre_N = { N: await page.$eval("#zapCampos input.zn[data-k=N]", (e) => e.value), r: await lee() };
await page.screenshot({ path: `${out}/04_arrastre_N.png`, fullPage: true });
// valor fuera de rango escrito a mano: el slider se amplía
await page.$eval("#zapCampos input.zn[data-k=N]", (e) => { e.value = "1500"; e.dispatchEvent(new Event("input", { bubbles: true })); }); await espera();
res.fuera_rango = await page.$eval("#zapCampos input.zr[data-k=N]", (e) => ({ max: e.max, value: e.value }));
// sin freático ↔ con freático
await page.click("#zapCampos input[data-nf]"); await espera(); res.zw_con = await page.evaluate(() => window.__zapata.datos.zw);
await page.click("#zapCampos input[data-nf]"); await espera(); res.zw_sin = String(await page.evaluate(() => window.__zapata.datos.zw));
writeFileSync(`${out}/resultados.json`, JSON.stringify(res, null, 1));
writeFileSync(`${out}/consola.txt`, consola.join("\n"));
console.log(JSON.stringify(res, null, 1)); console.log("consola:", consola.filter((c) => /error/i.test(c)).join("\n") || "sin errores");
await browser.close();
