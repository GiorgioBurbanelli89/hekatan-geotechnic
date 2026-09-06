// Abre la app en Chrome headless, pulsa "Calcular FS", espera el TOTAL y captura PNG + consola.
//   node tests/shot.mjs [url] [outdir]
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");

const url = process.argv[2] || "http://localhost:4700/";
const out = process.argv[3] || "tests/shots";
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000 });
const consola = [];
page.on("console", (m) => consola.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => consola.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${out}/01_inicio.png` });
await page.click("#run");
const t0 = Date.now();
await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
console.log(`calculado en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: `${out}/02_fin.png` });
// etapa 2, campo d_x, con malla
await page.select("#stage", "1"); await page.select("#field", "dx");
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${out}/03_etapa2_dx.png` });
await page.select("#stage", "2"); await page.select("#field", "dz");
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${out}/04_etapa3_dz.png` });
// slider: φ₁ 22.7 → 18 con 1 etapa; debe recalcular solo y bajar el FS
await page.select("#nstages", "1");
const t1 = Date.now();
await page.$eval("#sl_phi1", (e) => { e.value = "18"; e.dispatchEvent(new Event("input", { bubbles: true })); });
await new Promise((r) => setTimeout(r, 600));
await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 60000 });
console.log(`slider φ1=18 recalculado en ${((Date.now() - t1) / 1000).toFixed(1)} s`);
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${out}/05_slider_phi18.png` });
const fs = await page.$eval("#fs", (e) => e.innerText);
const log = await page.$eval("#log", (e) => e.textContent);
writeFileSync(`${out}/log.txt`, log);
writeFileSync(`${out}/consola.txt`, consola.join("\n"));
console.log(fs.replace(/\n/g, " | "));
console.log("consola:", consola.length, "lineas", consola.filter((l) => l.includes("error")).length, "errores");
await browser.close();
