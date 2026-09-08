// Los 13 campos de GEO5 en el visor: recorre el desplegable Variable con capa_toca_terreno.hgeo y captura cada uno.
//   node tests/check_fields.mjs [url] [outdir]
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4700/") + "?v=" + Date.now(), out = process.argv[3] || "tests/shots/fields"; mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 1000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
await page.select("#model", "hgeo"); await wait(300); await page.$eval("#hgeo", (e, v) => { e.value = v; }, readFileSync("examples/capa_toca_terreno.hgeo", "utf8")); await page.click("#apply"); await wait(500);
await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 120000 }); await wait(400);
const kinds = await page.$$eval("#field option", (l) => l.map((o) => o.value));
for (const k of kinds) {
  await page.select("#field", k); await wait(500);
  const t = await page.$eval("#plot", (c) => c.__title ?? ""); // no expuesto; usamos el rango pintado
  const { vmin, vmax } = await page.evaluate(() => window.__lastRange ?? { vmin: NaN, vmax: NaN });
  await page.screenshot({ path: `${out}/${k}.png`, clip: { x: 300, y: 60, width: 1300, height: 760 } });
  console.log(`${k.padEnd(5)} rango ${Number.isFinite(vmin) ? vmin.toFixed(2) : "?"} … ${Number.isFinite(vmax) ? vmax.toFixed(2) : "?"}`);
}
console.log("errores JS:", errs); await browser.close(); process.exit(errs.length ? 1 : 0);
