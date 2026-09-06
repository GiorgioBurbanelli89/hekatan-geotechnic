// Abre la app en Chrome headless: calcula SOLA al abrir (como Struct), mueve un slider (recalcula solo la
// etapa visible), cambia de etapa (recalcula la desactualizada) y captura PNG + log + consola.
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
const waitTotal = async (ms = 120000) => page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: ms });
const t0 = Date.now();
await page.goto(url, { waitUntil: "networkidle0" });
await waitTotal();
console.log(`al abrir: 3 etapas en ${((Date.now() - t0) / 1000).toFixed(1)} s (sin pulsar nada)`);
const logAll = await page.$eval("#log", (e) => e.textContent);
writeFileSync(`${out}/log.txt`, logAll);
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${out}/02_fin.png` });
await page.select("#stage", "1"); await page.select("#field", "dx");
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${out}/03_etapa2_dx.png` });
// slider φ₁ 22.7 → 18: solo recalcula la etapa visible (2)
const t1 = Date.now();
await page.$eval("#sl_phi1", (e) => { e.value = "18"; e.dispatchEvent(new Event("input", { bubbles: true })); });
await new Promise((r) => setTimeout(r, 500));
await waitTotal(60000);
console.log(`slider φ1=18 (etapa visible) en ${((Date.now() - t1) / 1000).toFixed(1)} s`);
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${out}/05_slider_phi18.png` });
// cambiar a la etapa 1 (desactualizada) → se recalcula sola
const t2 = Date.now();
await page.select("#stage", "0");
await new Promise((r) => setTimeout(r, 300));
await waitTotal(60000);
console.log(`etapa 1 desactualizada recalculada en ${((Date.now() - t2) / 1000).toFixed(1)} s`);
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${out}/06_etapa1_phi18.png` });
const fs = await page.$eval("#fs", (e) => e.innerText);
writeFileSync(`${out}/consola.txt`, consola.join("\n"));
console.log(fs.replace(/\n/g, " | "));
console.log("consola:", consola.length, "lineas", consola.filter((l) => l.includes("error")).length, "errores");
await browser.close();
