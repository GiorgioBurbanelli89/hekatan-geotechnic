// Barra de color de cada campo en CADA ETAPA (talud_4suelos: peso propio, +sobrecarga, +ancla).  node tests/check_fields_stages.mjs [url]
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4700/") + "?v=" + Date.now(), out = "tests/shots/fields_stages"; mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 1000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
await page.select("#model", "hgeo"); await wait(300); await page.$eval("#hgeo", (e, v) => { e.value = v; }, readFileSync("examples/talud_4suelos.hgeo", "utf8")); await page.click("#apply"); await wait(500);
await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 180000 }); await wait(400);
for (const st of ["0", "1", "2"]) {
  await page.select("#stage", st); await wait(400); await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 180000 }); await wait(300);
  for (const k of ["dx", "sz", "txz", "J", "Edpl"]) {
    await page.select("#field", k); await wait(350);
    const r = await page.evaluate(() => window.__lastRange);
    console.log(`etapa ${+st + 1} ${k.padEnd(5)} ${r.vmin.toFixed(2)} … ${r.vmax.toFixed(2)} ${r.unit}  (${r.lv.length - 1} bandas: ${r.lv[0]} … ${r.lv[r.lv.length - 1]})`);
    if (k === "sz" || k === "Edpl") await page.screenshot({ path: `${out}/etapa${+st + 1}_${k}.png`, clip: { x: 300, y: 60, width: 1300, height: 760 } });
  }
}
console.log("FS:", (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | ")); console.log("errores JS:", errs); await browser.close();
