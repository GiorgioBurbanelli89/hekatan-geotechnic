// Bug: en el Demo04 (malla fija de GEO5) al elegir un método analítico seguía el color map de FEM y no salía el círculo.
//   node tests/check_lem_demo04.mjs [url]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4700/") + "?v=" + Date.now(), out = "tests/shots/lemdemo"; mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 1000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
// modelo por defecto = Demo04 (malla fija). Elegir Bishop.
console.log("modelo inicial:", await page.$eval("#model", (e) => e.value));
await page.select("#metodo", "bishop"); await wait(500);
await page.waitForFunction(() => window.__lem && window.__lem() !== null, { timeout: 40000 }).catch(() => {}); await wait(600);
const lem = await page.evaluate(() => (window.__lem ? window.__lem() : null));
console.log("modelo ahora:", await page.$eval("#model", (e) => e.value), "| lem:", lem ? `FS=${lem.fs.toFixed(3)} R=${lem.circle.R.toFixed(1)}` : "NULL");
await page.screenshot({ path: `${out}/bishop_demo04.png`, clip: { x: 300, y: 60, width: 1300, height: 760 } });
console.log("errores JS:", errs); await browser.close(); process.exit(errs.length ? 1 : 0);
