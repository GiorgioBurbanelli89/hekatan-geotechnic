// Carga un .hgeo en el editor de la app y captura la ventana entera por etapa.
//   node tests/shot_hgeo_file.mjs examples/talud_nuevo.hgeo tests/shots/nuevo [url]
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const [file, out = "tests/shots/hgeo", url = "http://localhost:4700/"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 1000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const waitTotal = () => page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 180000 });
await page.goto(url, { waitUntil: "networkidle0" }); await waitTotal();
await page.select("#model", "hgeo"); await wait(300); await waitTotal();
await page.$eval("#hgeo", (e, v) => { e.value = v; }, readFileSync(file, "utf-8"));
await page.click("#apply"); await wait(400); await waitTotal(); await wait(500);
console.log(await page.$eval("#edmsg", (e) => e.textContent));
console.log((await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | "));
const n = await page.$eval("#stage", (e) => e.options.length);
for (let i = 0; i < n; i++) { await page.select("#stage", String(i)); await wait(600); await page.screenshot({ path: `${out}/etapa${i + 1}.png` }); }
await browser.close();
console.log("capturas en", out);
