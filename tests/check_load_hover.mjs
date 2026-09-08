// FANTASMA de la carga bajo el cursor: al elegir sobrecarga o ancla, el lienzo dibuja dónde caería antes del clic.
//   node tests/check_load_hover.mjs [url]
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4700/") + "?v=" + Date.now(), out = "tests/shots/loadhover"; mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 1000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
const idle = async () => { await wait(400); try { await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 120000 }); } catch {} await wait(250); };
const moveW = async (x, z) => { const { px, py } = await page.evaluate((x, z) => { const [px, py] = window.__geoMap.tf(x, z); const c = document.getElementById("draw"); const r = c.getBoundingClientRect(); return { px: r.left + px * r.width / c.width, py: r.top + py * r.height / c.height }; }, x, z); await page.mouse.move(px, py); await wait(150); };
const drawPix = () => page.evaluate(() => { const c = document.getElementById("draw"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
await page.select("#model", "hgeo"); await wait(300); await page.$eval("#hgeo", (e, v) => { e.value = v; }, readFileSync("examples/capa_toca_terreno.hgeo", "utf8")); await page.click("#apply"); await idle();
await page.click('.tb[data-tool="sobrecarga"]'); await wait(200); await moveW(20, 1); const s1 = await drawPix(); await page.screenshot({ path: `${out}/01_sobrecarga_hover.png`, clip: { x: 300, y: 60, width: 1300, height: 760 } });
await page.mouse.down(); await page.mouse.up(); await moveW(30, 1); const s2 = await drawPix(); await page.screenshot({ path: `${out}/02_sobrecarga_banda.png`, clip: { x: 300, y: 60, width: 1300, height: 760 } });
await page.click('.tb[data-tool="ancla"]'); await wait(200); await moveW(15, -3); const a1 = await drawPix(); await page.screenshot({ path: `${out}/03_ancla_hover.png`, clip: { x: 300, y: 60, width: 1300, height: 760 } });
console.log("píxeles lienzo · sobrecarga hover:", s1, "· banda:", s2, "· ancla hover:", a1);
console.log("errores JS:", errs); await browser.close(); process.exit(errs.length ? 1 : 0);
