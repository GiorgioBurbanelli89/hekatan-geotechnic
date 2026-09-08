// Método analítico en la UI: elegir Bishop/Fellenius dibuja la superficie de falla y su FS sobre el talud.
//   node tests/check_lem_ui.mjs [url]
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4700/") + "?v=" + Date.now(), out = "tests/shots/lem"; mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 1000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
const idle = async () => { await wait(400); try { await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 120000 }); } catch {} await wait(300); };
await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
await page.select("#model", "hgeo"); await wait(300); await page.$eval("#hgeo", (e, v) => { e.value = v; }, readFileSync("examples/talud_4suelos.hgeo", "utf8")); await page.click("#apply"); await idle();
console.log("GeoFEM FS:", (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | "));
for (const m of ["bishop", "fellenius"]) {
  await page.select("#metodo", m); await wait(200); await page.waitForFunction(() => window.__lem !== undefined && window.__lem() !== null, { timeout: 30000 }); await wait(400);
  const lem = await page.evaluate(() => window.__lem());
  console.log(`${m}: FS=${lem.fs.toFixed(3)} círculo (${lem.circle.cx.toFixed(1)},${lem.circle.cy.toFixed(1)}) R=${lem.circle.R.toFixed(1)} · ${lem.slices.length} dovelas`);
  await page.screenshot({ path: `${out}/${m}.png`, clip: { x: 300, y: 60, width: 1300, height: 760 } });
}
console.log("errores JS:", errs); await browser.close(); process.exit(errs.length ? 1 : 0);
