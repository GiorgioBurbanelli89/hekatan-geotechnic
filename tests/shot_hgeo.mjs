// Flujo del editor .hgeo: Demo04 escrita en el DSL → mallador propio → FS; luego un talud con 3 suelos.
//   node tests/shot_hgeo.mjs [url] [outdir]
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = process.argv[2] || "http://localhost:4700/", out = process.argv[3] || "tests/shots";
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000 });
const consola = [];
page.on("console", (m) => consola.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => consola.push(`[pageerror] ${e.message}`));
const waitTotal = async (ms = 120000) => page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: ms });
await page.goto(url, { waitUntil: "networkidle0" });
await waitTotal();
// 1) editor con la Demo04 en DSL
let t0 = Date.now();
await page.select("#model", "hgeo");
await new Promise((r) => setTimeout(r, 300));
await waitTotal();
console.log(`hgeo Demo04 (malla propia) en ${((Date.now() - t0) / 1000).toFixed(1)} s ·`, await page.$eval("#edmsg", (e) => e.textContent));
console.log("  FS:", (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | "));
await new Promise((r) => setTimeout(r, 400));
await page.select("#stage", "2"); await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${out}/07_hgeo_demo04.png` });
// 2) talud nuevo: 3 suelos, banqueta, sobrecarga en la corona, malla 2.0
const hgeo3 = `# Talud con banqueta, 3 suelos
contorno 0,-20 45,-20 45,-2 36,-2 30,-6 24,-6 16,-11 0,-11
suelo RELLENO  E=30000  nu=0.3  phi=25 c=5   gamma=18
suelo ARCILLA  E=15000  nu=0.35 phi=18 c=25  gamma=17
suelo ROCA     E=200000 nu=0.25 phi=40 c=150 gamma=22
capa  ARCILLA bajo 0,-9  20,-9.5  45,-8.5
capa  ROCA    bajo 0,-15 45,-14
malla 2.0
etapa peso propio
etapa +sobrecarga  q=50 en 38,-2 -> 44,-2
`;
t0 = Date.now();
await page.$eval("#hgeo", (e, v) => { e.value = v; }, hgeo3);
await page.click("#apply");
await new Promise((r) => setTimeout(r, 300));
await waitTotal();
console.log(`talud 3 suelos en ${((Date.now() - t0) / 1000).toFixed(1)} s ·`, await page.$eval("#edmsg", (e) => e.textContent));
console.log("  FS:", (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | "));
await new Promise((r) => setTimeout(r, 400));
await page.select("#stage", "1"); await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${out}/08_hgeo_3suelos.png` });
// 3) slider φ del relleno
t0 = Date.now();
await page.$eval("#sl_phi0", (e) => { e.value = "20"; e.dispatchEvent(new Event("input", { bubbles: true })); });
await new Promise((r) => setTimeout(r, 500)); await waitTotal(60000);
console.log(`slider φ relleno=20 en ${((Date.now() - t0) / 1000).toFixed(1)} s · FS:`, (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | "));
await page.screenshot({ path: `${out}/09_hgeo_slider.png` });
writeFileSync(`${out}/consola_hgeo.txt`, consola.join("\n"));
console.log("consola:", consola.filter((l) => !l.includes("vite")).join(" | ") || "limpia");
await browser.close();
