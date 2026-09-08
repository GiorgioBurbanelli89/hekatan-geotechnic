// (1) Demo04 (malla GEO5): los sliders de geometría se ven DIRECTAMENTE; (2) al arrastrar (input sin change) las líneas se
// mueven en vivo sobre la gráfica; (3) al soltar (change) remalla y recalcula.  node tests/check_live_sliders.mjs [url]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4700/") + "?v=" + Date.now(), out = "tests/shots/live"; mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 1000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
console.log("Demo04 sliders geom:", await page.$$eval("#gsliders input[type=range]", (l) => l.map((e) => e.id.replace("gs_", "")).join(" ")));
const pix = async () => page.evaluate(() => { const c = document.getElementById("draw"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
console.log("píxeles pintados en el lienzo antes:", await pix());
await page.$eval("#gs_beta", (e) => { e.value = "50"; e.dispatchEvent(new Event("input", { bubbles: true })); });   // arrastre (sin soltar)
await wait(80); const p1 = await pix(); await page.screenshot({ path: `${out}/01_arrastrando.png`, clip: { x: 300, y: 60, width: 1300, height: 760 } });
console.log("píxeles pintados arrastrando (líneas en vivo):", p1, "| modelo:", await page.$eval("#model", (e) => e.value));
await page.$eval("#gs_beta", (e) => e.dispatchEvent(new Event("change", { bubbles: true }))); await wait(600);
await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 120000 }); await wait(400);
await page.screenshot({ path: `${out}/02_soltado.png`, clip: { x: 300, y: 60, width: 1300, height: 760 } });
console.log("tras soltar: modelo", await page.$eval("#model", (e) => e.value), "| β en .hgeo:", await page.$eval("#hgeo", (e) => (e.value.match(/beta=[\d.]+/) || [""])[0]), "| FS:", (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | "));
console.log("errores JS:", errs); await browser.close(); process.exit(errs.length ? 1 : 0);
