// Pestañas de etapa sobre la gráfica: clic en 1/2/3 → cambia la etapa visible.  node tests/check_stage_tabs.mjs [url]
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4700/") + "?v=" + Date.now(), out = "tests/shots/tabs"; mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 1000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
const idle = async () => { await wait(400); try { await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 120000 }); } catch {} await wait(300); };
await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
await page.select("#model", "hgeo"); await wait(300); await page.$eval("#hgeo", (e, v) => { e.value = v; }, readFileSync("examples/talud_4suelos.hgeo", "utf8")); await page.click("#apply"); await idle();
console.log("pestañas:", await page.$$eval("#etabs button", (l) => l.map((b) => b.textContent.replace(/\s+/g, " ").trim()).join(" | ")));
for (const i of [0, 1, 2]) {
  await page.$$eval("#etabs button", (l, i) => l[i].click(), i); await idle();
  const on = await page.$eval("#etabs button.on", (b) => b.textContent.replace(/\s+/g, " ").trim());
  const r = await page.evaluate(() => window.__lastRange);
  console.log(`clic pestaña ${i + 1}: activa="${on}" · range.stage=${r?.stage} dx ${(+r?.vmin).toFixed(1)}…${(+r?.vmax).toFixed(1)}`);
  await page.screenshot({ path: `${out}/tab${i + 1}.png`, clip: { x: 300, y: 60, width: 1300, height: 300 } });
}
console.log("errores JS:", errs); await browser.close(); process.exit(errs.length ? 1 : 0);
