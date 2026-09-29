// Construcción por etapas en la INTERFAZ: carga examples/muro_manabi_etapas.hgeo, recorre las etapas y captura cada una.
//   node tests/shot_etapas.mjs [url] [outdir]
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct-limpio/package.json");
const puppeteer = require("puppeteer");
const url = process.argv[2] || "http://localhost:4700/", out = process.argv[3] || "tests/shots/etapas";
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const consola = [];
page.on("console", (m) => consola.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => consola.push(`[pageerror] ${e.message}`));
const waitTotal = async (ms = 600000) => page.waitForFunction(() => /TOTAL |equilibrio|NO CONVERGE/.test(document.getElementById("log").textContent) && !/calculando/.test(document.body.innerText), { timeout: ms });
await page.goto(url, { waitUntil: "networkidle0" });
await page.select("#model", "hgeo"); await new Promise((r) => setTimeout(r, 2000));
await page.$eval("#log", (e) => { e.textContent = ""; });
await page.$eval("#hgeo", (e, v) => { e.value = v; }, readFileSync("examples/muro_manabi_etapas.hgeo", "utf-8"));
const t0 = Date.now();
await page.click("#apply");
await page.waitForFunction(() => (document.getElementById("log").textContent.match(/>>> (equilibrio|NO CONVERGE)/g) || []).length >= 7, { timeout: 900000 });
await new Promise((r) => setTimeout(r, 1500));
console.log(`7 etapas en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log("tabla:", (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | "));
const opts = await page.$$eval("#stage option", (os) => os.map((o) => o.value + ":" + o.textContent));
console.log("etapas:", opts.join(" · "));
for (const v of ["1", "4", "6"]) {
  await page.select("#stage", v); await new Promise((r) => setTimeout(r, 1200));
  console.log(`etapa ${v}: título:`, await page.evaluate(() => document.querySelector("canvas") ? "" : "sin canvas"));
  await page.screenshot({ path: `${out}/etapa_${v}.png` });
}
writeFileSync(`${out}/consola.txt`, consola.join("\n"));
console.log("consola:", consola.filter((l) => /error|NaN/i.test(l)).slice(0, 5).join(" | ") || "sin errores");
await browser.close();
