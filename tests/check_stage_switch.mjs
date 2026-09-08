// Cambiar entre etapa 1/2/3 en el deploy público: ¿la gráfica responde (título, FS, campo)?  node tests/check_stage_switch.mjs [url]
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4700/") + "?v=" + Date.now(), out = "tests/shots/switch"; mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 1000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
const idle = async () => { await wait(400); try { await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 120000 }); } catch {} await wait(300); };
await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
await page.select("#model", "hgeo"); await wait(300); await page.$eval("#hgeo", (e, v) => { e.value = v; }, readFileSync("examples/talud_4suelos.hgeo", "utf8")); await page.click("#apply"); await idle();
const opts = await page.$$eval("#stage option", (l) => l.map((o) => o.value + ":" + o.textContent));
console.log("selector de etapa (#stage):", opts.join(" | "));
const rango = () => page.evaluate(() => window.__lastRange ? { stage: window.__lastRange.stage, vmin: +window.__lastRange.vmin?.toFixed(2), vmax: +window.__lastRange.vmax?.toFixed(2) } : null);
for (const st of ["0", "1", "2"]) {
  await page.select("#stage", st); await idle();
  const r = await rango(); const nsteps = await page.$$eval("#step option", (l) => l.length);
  console.log(`etapa ${+st + 1}: range.stage=${r?.stage} dx ${r?.vmin}…${r?.vmax} mm · peldaños SRF=${nsteps}`);
  await page.screenshot({ path: `${out}/etapa${+st + 1}.png`, clip: { x: 300, y: 60, width: 1300, height: 760 } });
}
console.log("FS tabla:", (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | "));
console.log("errores JS:", errs); await browser.close(); process.exit(errs.length ? 1 : 0);
